import {
  DialogueLocalizationError,
  localizeDialogueText,
  parseDialogueLocalizationRequest,
} from "@/app/lib/dialogue/localization";
import { resolveServerModelConfiguration } from "@/app/lib/dialogue/providers";

const json = (body: unknown, status: number) => Response.json(body, { status });

export async function POST(incoming: Request) {
  let rawBody: unknown;
  try {
    rawBody = await incoming.json();
  } catch {
    return json({ ok: false, code: "INVALID_REQUEST", message: "Invalid localization request." }, 400);
  }
  const request = parseDialogueLocalizationRequest(rawBody);
  if (!request) return json({ ok: false, code: "INVALID_REQUEST", message: "Invalid localization request." }, 400);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75_000);
  try {
    const configuration = resolveServerModelConfiguration(process.env);
    const localizations = await localizeDialogueText(request, { ...configuration, signal: controller.signal });
    return json({ ok: true, targetLanguage: request.targetLanguage, localizations }, 200);
  } catch (error) {
    if (error instanceof DialogueLocalizationError) {
      const status = error.code === "MODEL_NOT_CONFIGURED" ? 503 : 502;
      return json({ ok: false, code: error.code, message: error.message }, status);
    }
    return json({ ok: false, code: "MODEL_REQUEST_FAILED", message: "The language switch did not complete." }, 502);
  } finally {
    clearTimeout(timeout);
  }
}
