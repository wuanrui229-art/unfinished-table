import type { DialogueLanguage } from "./contracts.ts";
import {
  extractProviderError,
  extractProviderResponse,
  type ModelProvider,
  type ProviderConfiguration,
} from "./providers.ts";
import { characterLength } from "./text.ts";

export interface DialogueTextForLocalization {
  turn_id: string;
  speaker_id: string;
  reply_to_claim: string;
  speech_segments: string[];
  evidence_supports: string[];
  uncertainty: string;
  unresolved_tension: string;
}

export interface LocalizedDialogueText {
  turn_id: string;
  reply_to_claim: string;
  speech_segments: string[];
  evidence_supports: string[];
  uncertainty: string;
  unresolved_tension: string;
}

export interface DialogueLocalizationRequest {
  targetLanguage: DialogueLanguage;
  turns: DialogueTextForLocalization[];
}

export interface DialogueLocalizationConfiguration extends ProviderConfiguration {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}

export class DialogueLocalizationError extends Error {
  readonly code: "MODEL_NOT_CONFIGURED" | "MODEL_REQUEST_FAILED" | "LOCALIZATION_REJECTED";

  constructor(code: DialogueLocalizationError["code"], message: string) {
    super(message);
    this.name = "DialogueLocalizationError";
    this.code = code;
  }
}

const LOCALIZATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    turns: {
      type: "array",
      minItems: 1,
      maxItems: 36,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          turn_id: { type: "string" },
          reply_to_claim: { type: "string" },
          speech_segments: { type: "array", minItems: 1, maxItems: 6, items: { type: "string" } },
          evidence_supports: { type: "array", maxItems: 4, items: { type: "string" } },
          uncertainty: { type: "string" },
          unresolved_tension: { type: "string" },
        },
        required: ["turn_id", "reply_to_claim", "speech_segments", "evidence_supports", "uncertainty", "unresolved_tension"],
      },
    },
  },
  required: ["turns"],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoundedText(value: unknown, maximum = 600): string | null {
  if (typeof value !== "string" || characterLength(value) > maximum) return null;
  return value;
}

export function parseDialogueLocalizationRequest(value: unknown): DialogueLocalizationRequest | null {
  if (!isRecord(value) || (value.targetLanguage !== "zh" && value.targetLanguage !== "en")) return null;
  if (!Array.isArray(value.turns) || value.turns.length < 1 || value.turns.length > 36) return null;

  const turns: DialogueTextForLocalization[] = [];
  let totalCharacters = 0;
  for (const rawTurn of value.turns) {
    if (!isRecord(rawTurn)) return null;
    const turnId = readBoundedText(rawTurn.turn_id, 100);
    const speakerId = readBoundedText(rawTurn.speaker_id, 100);
    const replyToClaim = readBoundedText(rawTurn.reply_to_claim);
    const uncertainty = readBoundedText(rawTurn.uncertainty);
    const unresolvedTension = readBoundedText(rawTurn.unresolved_tension);
    if (!turnId || !speakerId || replyToClaim === null || uncertainty === null || unresolvedTension === null) return null;
    if (!Array.isArray(rawTurn.speech_segments) || rawTurn.speech_segments.length < 1 || rawTurn.speech_segments.length > 6) return null;
    if (!Array.isArray(rawTurn.evidence_supports) || rawTurn.evidence_supports.length > 4) return null;
    const speechSegments = rawTurn.speech_segments.map((segment) => readBoundedText(segment));
    const evidenceSupports = rawTurn.evidence_supports.map((support) => readBoundedText(support));
    if (speechSegments.some((segment) => segment === null || !segment.trim()) || evidenceSupports.some((support) => support === null)) return null;

    const turn: DialogueTextForLocalization = {
      turn_id: turnId,
      speaker_id: speakerId,
      reply_to_claim: replyToClaim,
      speech_segments: speechSegments as string[],
      evidence_supports: evidenceSupports as string[],
      uncertainty,
      unresolved_tension: unresolvedTension,
    };
    totalCharacters += characterLength(JSON.stringify(turn));
    turns.push(turn);
  }
  if (totalCharacters > 24_000) return null;
  return { targetLanguage: value.targetLanguage, turns };
}

function providerUrl(configuration: DialogueLocalizationConfiguration): string {
  const baseUrl = (configuration.baseUrl || (configuration.provider === "kimi"
    ? "https://api.moonshot.cn/v1"
    : configuration.provider === "deepseek"
      ? "https://api.deepseek.com"
      : "https://api.openai.com/v1")).replace(/\/+$/, "");
  return configuration.provider === "openai" ? `${baseUrl}/responses` : `${baseUrl}/chat/completions`;
}

export function buildLocalizationProviderRequest(
  configuration: Required<Pick<DialogueLocalizationConfiguration, "provider" | "model">> & Pick<DialogueLocalizationConfiguration, "baseUrl">,
  request: DialogueLocalizationRequest,
  repairNote = "",
) {
  const languageName = request.targetLanguage === "zh" ? "natural, contemporary Simplified Chinese" : "natural, contemporary English";
  const system = `You are the localization editor for an evidence-grounded persona conversation product. Translate only the supplied user-visible text into ${languageName}.

Rules:
- Preserve meaning, uncertainty, examples, disagreement, tone, and speaker voice. Add no facts or explanations.
- Keep every turn_id exactly unchanged. Keep the number and order of turns, speech_segments, and evidence_supports exactly unchanged.
- Use natural spoken language. For Chinese, do not produce word-for-word English-shaped Chinese, academic translationese, or classical Chinese. For English, do not use artificial archaic English.
- Do not translate JSON keys or ids. Return JSON only.${repairNote ? `\n- Repair note: ${repairNote}` : ""}`;
  const user = JSON.stringify({ target_language: request.targetLanguage, turns: request.turns });
  const common = {
    model: configuration.model,
    stream: false,
  };

  if (configuration.provider === "openai") {
    return {
      url: providerUrl(configuration),
      body: {
        model: configuration.model,
        input: [{ role: "system", content: system }, { role: "user", content: user }],
        text: { format: { type: "json_schema", name: "unfinished_table_localization", strict: true, schema: LOCALIZATION_SCHEMA } },
      },
    };
  }
  if (configuration.provider === "kimi") {
    return {
      url: providerUrl(configuration),
      body: {
        ...common,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        max_completion_tokens: 6000,
        thinking: { type: "disabled" },
        response_format: {
          type: "json_schema",
          json_schema: { name: "unfinished_table_localization", strict: true, schema: LOCALIZATION_SCHEMA },
        },
      },
    };
  }
  return {
    url: providerUrl(configuration),
    body: {
      ...common,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_tokens: 6000,
      response_format: { type: "json_object" },
    },
  };
}

function hasHan(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function isMostlyStillChinese(value: string): boolean {
  const hanCount = value.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  return hanCount > 4 && hanCount / Math.max(1, characterLength(value)) > 0.04;
}

function validateLocalizedOutput(
  value: unknown,
  request: DialogueLocalizationRequest,
): LocalizedDialogueText[] | null {
  if (!isRecord(value) || !Array.isArray(value.turns) || value.turns.length !== request.turns.length) return null;
  const localizations: LocalizedDialogueText[] = [];

  for (const [index, rawTurn] of value.turns.entries()) {
    const source = request.turns[index];
    if (!isRecord(rawTurn)) return null;
    if (!Array.isArray(rawTurn.speech_segments) || rawTurn.speech_segments.length !== source.speech_segments.length) return null;
    if (!Array.isArray(rawTurn.evidence_supports) || rawTurn.evidence_supports.length !== source.evidence_supports.length) return null;
    const replyToClaim = readBoundedText(rawTurn.reply_to_claim);
    const uncertainty = readBoundedText(rawTurn.uncertainty);
    const unresolvedTension = readBoundedText(rawTurn.unresolved_tension);
    const speechSegments = rawTurn.speech_segments.map((segment) => readBoundedText(segment));
    const evidenceSupports = rawTurn.evidence_supports.map((support) => readBoundedText(support));
    if (replyToClaim === null || uncertainty === null || unresolvedTension === null) return null;
    if (speechSegments.some((segment) => segment === null || !segment.trim()) || evidenceSupports.some((support) => support === null)) return null;
    const visible = [replyToClaim, ...speechSegments, ...evidenceSupports, uncertainty, unresolvedTension].join(" ");
    if (request.targetLanguage === "en" && isMostlyStillChinese(visible)) return null;
    if (request.targetLanguage === "zh" && !hasHan(visible)) return null;

    localizations.push({
      turn_id: source.turn_id,
      reply_to_claim: replyToClaim,
      speech_segments: speechSegments as string[],
      evidence_supports: evidenceSupports as string[],
      uncertainty,
      unresolved_tension: unresolvedTension,
    });
  }
  return localizations;
}

export async function localizeDialogueText(
  request: DialogueLocalizationRequest,
  configuration: DialogueLocalizationConfiguration,
): Promise<LocalizedDialogueText[]> {
  if (!configuration.provider || !configuration.apiKey || !configuration.model) {
    throw new DialogueLocalizationError("MODEL_NOT_CONFIGURED", "The dialogue model is not configured.");
  }
  const fetcher = configuration.fetcher ?? fetch;
  let rejectionReason = "The localized dialogue did not preserve the conversation structure.";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const providerRequest = buildLocalizationProviderRequest({
      provider: configuration.provider,
      model: configuration.model,
      baseUrl: configuration.baseUrl,
    }, request, attempt === 1
      ? "The previous result was rejected. Preserve every array length and order, translate every visible sentence, and copy JSON keys exactly."
      : "");
    let response: Response;
    try {
      response = await fetcher(providerRequest.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${configuration.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(providerRequest.body),
        signal: configuration.signal,
      });
    } catch {
      throw new DialogueLocalizationError("MODEL_REQUEST_FAILED", "The language switch could not reach the dialogue model.");
    }
    const body = await response.json() as unknown;
    if (!response.ok) {
      throw new DialogueLocalizationError("MODEL_REQUEST_FAILED", extractProviderError(body) || "The language switch did not complete.");
    }
    const extracted = extractProviderResponse(configuration.provider as ModelProvider, body);
    if (!extracted.text) {
      rejectionReason = "The language switch returned no text.";
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(extracted.text);
    } catch {
      rejectionReason = "The language switch returned invalid JSON.";
      continue;
    }
    const localizations = validateLocalizedOutput(parsed, request);
    if (localizations) return localizations;
  }

  throw new DialogueLocalizationError("LOCALIZATION_REJECTED", rejectionReason);
}
