import { selectNextSpeaker } from "@/app/lib/dialogue/orchestrator";
import { parseDialogueRequest } from "@/app/lib/dialogue/request";

const json = (body: unknown, status: number) => Response.json(body, { status });

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

  const selection = selectNextSpeaker(parsed.request);
  const previousTurn = parsed.request.userContribution ? undefined : parsed.request.history.at(-1);
  return json({
    ok: true,
    preparation: {
      speaker_id: selection.speakerId,
      responds_to: previousTurn?.speaker_id ?? "user",
      allowed_actions: selection.allowedActions,
    },
  }, 200);
}
