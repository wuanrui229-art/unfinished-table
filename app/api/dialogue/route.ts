import { generateDialogueTurn, DialogueGenerationError } from "@/app/lib/dialogue/openai";
import { buildPublicCitations } from "@/app/lib/dialogue/citations";
import { stripInternalEvidenceIds } from "@/app/lib/dialogue/presentation";
import { resolveServerModelConfiguration } from "@/app/lib/dialogue/providers";
import { parseDialogueRequest } from "@/app/lib/dialogue/request";
import { selectNextSpeaker } from "@/app/lib/dialogue/orchestrator";
import { getPersona } from "@/app/lib/dialogue/personas";

const json = (body: unknown, status: number) => Response.json(body, { status });
const DIALOGUE_TIMEOUT_MS = 75_000;

export async function POST(incoming: Request) {
  let rawBody: unknown;
  try {
    rawBody = await incoming.json();
  } catch {
    return json({ ok: false, code: "INVALID_REQUEST", message: "请求不是有效的 JSON" }, 400);
  }

  const parsed = parseDialogueRequest(rawBody);
  if (!parsed.ok) {
    return json({ ok: false, code: "INVALID_REQUEST", message: parsed.errors[0], errors: parsed.errors }, 400);
  }
  const isEnglish = parsed.request.language === "en";

  const preparedSpeakerId = typeof rawBody === "object" && rawBody !== null && !Array.isArray(rawBody)
    && typeof (rawBody as Record<string, unknown>).preparedSpeakerId === "string"
    ? (rawBody as Record<string, unknown>).preparedSpeakerId as string
    : null;
  const selection = selectNextSpeaker(parsed.request);
  if (preparedSpeakerId && preparedSpeakerId !== selection.speakerId) {
    return json({
      ok: false,
      code: "STALE_PREPARATION",
      message: isEnglish ? "The speaking order changed. Please prepare this turn again." : "桌边的接话顺序刚刚发生了变化，请重新准备这一轮。",
    }, 409);
  }

  const controller = new AbortController();
  // One turn may need a second, corrected structured-output pass. Keep the
  // timeout long enough for that repair without making the whole table restart.
  const timeout = setTimeout(() => controller.abort(), DIALOGUE_TIMEOUT_MS);
  try {
    const providerConfiguration = resolveServerModelConfiguration(process.env);
    const result = await generateDialogueTurn(parsed.request, crypto.randomUUID(), {
      ...providerConfiguration,
      signal: controller.signal,
      selection,
    });
    const citations = buildPublicCitations(
      result.turn,
      result.evidence,
      getPersona(result.turn.speaker_id).personaMode,
    );
    const publicTurn = {
      ...result.turn,
      speech_segments: result.turn.speech_segments.map(stripInternalEvidenceIds),
      // Evidence codes stay on the server. The browser only receives readable citations.
      evidence_uses: [],
    };

    return json({
      ok: true,
      turn: publicTurn,
      citations,
      orchestration: {
        selected_speaker: result.selection.speakerId,
        allowed_actions: result.selection.allowedActions,
        attempts: result.attempts,
        provider: result.provider,
        model: result.model,
      },
      disclosure: isEnglish
        ? "AI-generated interpretation based on public sources. Use the source layer to verify it."
        : "AI 基于公开资料生成的演绎；请通过来源层继续核查。",
    }, 200);
  } catch (error) {
    if (error instanceof DialogueGenerationError) {
      if (error.code === "GENERATION_REJECTED") {
        console.warn("[dialogue-validation] rejected turn", { errors: error.details });
      }
      const status = error.code === "MODEL_NOT_CONFIGURED" ? 503 : error.code === "GENERATION_REJECTED" ? 422 : 502;
      const englishMessage = error.code === "MODEL_NOT_CONFIGURED"
        ? "The dialogue model is not configured yet."
        : error.code === "GENERATION_REJECTED"
          ? "This reply did not pass the source and conversation checks, so it was not shown."
          : "The model could not complete this turn. The table state is preserved.";
      return json({ ok: false, code: error.code, message: isEnglish ? englishMessage : error.message, errors: error.details }, status);
    }
    return json({
      ok: false,
      code: "MODEL_REQUEST_FAILED",
      message: isEnglish ? "This turn did not complete. The table state is preserved, so you can try again." : "本轮没有生成成功，桌面状态会保留，可以重试。",
    }, 502);
  } finally {
    clearTimeout(timeout);
  }
}
