import {
  ACTION_TYPES,
  EPISTEMIC_STATUSES,
  EVIDENCE_USE_TYPES,
  type DialogueRequest,
  type DialogueTurn,
} from "./contracts.ts";
import type { DialoguePromptBundle } from "./prompt.ts";
import { getPersona } from "./personas.ts";
import { characterLength, isModernTopic } from "./text.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function containsHanCharacters(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  turn?: DialogueTurn;
}

export function validateDialogueTurn(
  value: unknown,
  request: DialogueRequest,
  bundle: DialoguePromptBundle,
): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["turn must be an object"] };

  const topKeys = [
    "turn_id",
    "speaker_id",
    "reply_to",
    "action_type",
    "speech_segments",
    "evidence_uses",
    "epistemic_status",
    "uncertainty",
    "unresolved_tension",
    "suggested_next_speakers",
  ];
  if (!hasOnlyKeys(value, topKeys)) errors.push("turn contains unknown fields");
  for (const key of topKeys) if (!(key in value)) errors.push(`missing field: ${key}`);

  if (value.turn_id !== bundle.expectedTurnId) errors.push("turn_id does not match the requested id");
  if (value.speaker_id !== bundle.selection.speakerId) errors.push("speaker_id does not match the selected speaker");
  if (typeof value.action_type !== "string" || !ACTION_TYPES.includes(value.action_type as never)) {
    errors.push("action_type is invalid");
  } else if (!bundle.selection.allowedActions.includes(value.action_type as DialogueTurn["action_type"])) {
    errors.push("action_type is not allowed at this point in the conversation");
  }

  const expectedReply = request.userContribution ? undefined : request.history.at(-1);
  if (!isRecord(value.reply_to)) {
    errors.push("reply_to must be an object");
  } else {
    if (!hasOnlyKeys(value.reply_to, ["turn_id", "speaker_id", "claim"])) errors.push("reply_to contains unknown fields");
    if (value.reply_to.turn_id !== (expectedReply?.turn_id ?? null)) errors.push("reply_to.turn_id skips the immediately previous turn");
    if (value.reply_to.speaker_id !== (expectedReply?.speaker_id ?? "user")) errors.push("reply_to.speaker_id is not the immediately previous speaker");
    if (typeof value.reply_to.claim !== "string" || characterLength(value.reply_to.claim) < 4) {
      errors.push("reply_to.claim is too vague");
    } else if (request.language === "en" && containsHanCharacters(value.reply_to.claim)) {
      errors.push("English reply_to.claim contains Chinese characters");
    }
  }

  const actionType = typeof value.action_type === "string" ? value.action_type : "";
  const maximumBubbleCount = 6;
  if (!Array.isArray(value.speech_segments) || value.speech_segments.length < 1 || value.speech_segments.length > maximumBubbleCount) {
    errors.push(`speech_segments must contain 1 to ${maximumBubbleCount} bubbles`);
  } else {
    let totalLength = 0;
    const visibleSegments: string[] = [];
    if (actionType !== "admit_limit" && value.speech_segments.length < 2) {
      errors.push("non-limit speech must contain 2 to 6 bubbles");
    }
    for (const [segmentIndex, segment] of value.speech_segments.entries()) {
      if (typeof segment !== "string") {
        errors.push("every speech segment must be text");
        continue;
      }
      const length = characterLength(segment);
      visibleSegments.push(segment);
      totalLength += length;
      const maximumSegmentLength = request.language === "en" ? 300 : 130;
      const maximumFirstSegmentLength = request.language === "en" ? 240 : 105;
      if (length < 4 || length > maximumSegmentLength) errors.push(`each speech segment must be 4 to ${maximumSegmentLength} characters`);
      if (segmentIndex === 0 && length > maximumFirstSegmentLength) errors.push(`first speech segment must be at most ${maximumFirstSegmentLength} characters`);
      if (!/[。！？.!?…]["'”’）)]?$/.test(segment.trim())) errors.push("speech segment must end as a complete sentence");
      if (/(?:不能倒|并不能倒|这意味|也就是|因为|所以|但是|然而|以及|例如|比如)$/.test(segment.trim())) {
        errors.push("speech segment appears incomplete");
      }
      if (request.language === "en" && /(?:[*_`]|[,;:(—-]|\b(?:and|but|or|because|so|with|without|to|for|of|the|a|an|did not|does not|can not|could not|would not|should not|will not|may not|might not|must not))$/i.test(segment.trim())) {
        errors.push("speech segment appears incomplete");
      }
      if ((segment.match(/[*_`]/g)?.length ?? 0) > 0) errors.push("speech segment contains Markdown formatting");
      if (segmentIndex === 0 && /(?:当年|曾经|有一次|例如|比如|我(?:在|曾|书里)|《|公元|世纪|那(?:棵|次|年))/.test(segment)) {
        errors.push("first speech segment must answer directly without a historical example");
      }
      const clauseBreaks = segment.match(/[，；：、]/g)?.length ?? 0;
      if (length > 55 && clauseBreaks >= 5) errors.push("speech segment is too syntactically dense");
      if (/^[“"「『][\s\S]*[”"」』]$/.test(segment.trim())) errors.push("speech segment looks like an invented direct quotation");
      if (/(?:作为(?:一个)?\s*AI|作为语言模型|persona|系统提示)/i.test(segment)) errors.push("speech segment breaks the historical-persona frame");
      if (/(?:\[\s*)?\bev\s*[-_ ]?\s*\d{3}\b(?:\s*\])?/i.test(segment)) errors.push("speech segment exposes an internal evidence id");
    }
    const completeSpeech = visibleSegments.join(" ");
    if (request.language === "zh") {
      const translationPatterns = completeSpeech.match(/(?:并非.{0,24}而是|这意味着|由此可见|某种意义上|值得警惕的张力|可以被理解为|在.{1,18}之中)/g)?.length ?? 0;
      const opaqueTerms = new Set(completeSpeech.match(/(?:范式|主体性|能动性|结构性|话语体系|规训机制|异化|权力装置)/g) ?? []);
      if (translationPatterns >= 2) errors.push("Chinese speech sounds too much like a translated essay");
      if (opaqueTerms.size >= 3) errors.push("Chinese speech contains too many unexplained abstractions");
    } else if (/\b(?:thou|thee|thy|thine|hath|doth)\b/i.test(completeSpeech)) {
      errors.push("English speech uses artificial archaic language");
    }
    if (request.language === "en" && containsHanCharacters(completeSpeech)) errors.push("English speech contains Chinese characters");
    if (/(?:我死于\s*\d{3,4}|\bI died in\s+\d{3,4})/i.test(completeSpeech)) errors.push("speech uses a jarring first-person death statement");
    const minimum = actionType === "admit_limit" ? 12 : request.language === "en" ? 220 : 100;
    if (totalLength < minimum) errors.push(`speech is too shallow; total length must be at least ${minimum} characters`);
    const maximumTotalLength = request.language === "en" ? 1300 : 520;
    if (totalLength > maximumTotalLength) errors.push("speech is too long for nearby dialogue bubbles");
  }

  const availableEvidence = new Map(bundle.evidence.map((record) => [record.id, record]));
  const usedEvidence: Array<{ evidence_id: string; use_type: string; supports: string }> = [];
  if (!Array.isArray(value.evidence_uses) || value.evidence_uses.length > 4) {
    errors.push("evidence_uses must be an array with at most 4 items");
  } else {
    for (const item of value.evidence_uses) {
      if (!isRecord(item)) {
        errors.push("evidence use must be an object");
        continue;
      }
      if (!hasOnlyKeys(item, ["evidence_id", "use_type", "supports"])) errors.push("evidence use contains unknown fields");
      if (typeof item.evidence_id !== "string" || !availableEvidence.has(item.evidence_id)) errors.push("evidence_id was not supplied to the model");
      if (typeof item.use_type !== "string" || !EVIDENCE_USE_TYPES.includes(item.use_type as never)) errors.push("evidence use_type is invalid");
      if (typeof item.supports !== "string" || characterLength(item.supports) < 4) errors.push("evidence supports note is too vague");
      if (request.language === "en" && typeof item.supports === "string" && containsHanCharacters(item.supports)) {
        errors.push("English evidence support contains Chinese characters");
      }
      if (typeof item.evidence_id === "string" && typeof item.use_type === "string" && typeof item.supports === "string") {
        usedEvidence.push(item as { evidence_id: string; use_type: string; supports: string });
      }
    }
  }

  if (typeof value.epistemic_status !== "string" || !EPISTEMIC_STATUSES.includes(value.epistemic_status as never)) {
    errors.push("epistemic_status is invalid");
  }
  if (typeof value.uncertainty !== "string") errors.push("uncertainty must be text");
  if (typeof value.unresolved_tension !== "string" || characterLength(value.unresolved_tension) < 4) errors.push("unresolved_tension must preserve a real open question");
  if (request.language === "en" && typeof value.uncertainty === "string" && containsHanCharacters(value.uncertainty)) errors.push("English uncertainty contains Chinese characters");
  if (request.language === "en" && typeof value.unresolved_tension === "string" && containsHanCharacters(value.unresolved_tension)) errors.push("English unresolved tension contains Chinese characters");
  if (typeof value.uncertainty === "string" && /(?:我死于\s*\d{3,4}|\bI died in\s+\d{3,4})/i.test(value.uncertainty)) errors.push("uncertainty uses a jarring first-person death statement");

  const modern = isModernTopic([request.question, ...(request.history.at(-1)?.speech_segments ?? [])].join(" "));
  const historicalPersona = getPersona(bundle.selection.speakerId).personaMode === "historical_interpretation";
  const hasInference = usedEvidence.some((item) => item.use_type === "inference");
  const hasHistoricalGrounding = usedEvidence.some((item) => availableEvidence.get(item.evidence_id)?.status !== "speculative");
  const hasSpeculativeAsFact = usedEvidence.some((item) => availableEvidence.get(item.evidence_id)?.status === "speculative" && item.use_type !== "inference");

  if (value.epistemic_status === "grounded" && hasInference) errors.push("grounded output cannot contain inference use");
  if (value.epistemic_status === "grounded_with_inference" && !hasInference) errors.push("grounded_with_inference requires an inference use");
  if (value.epistemic_status !== "grounded" && typeof value.uncertainty === "string" && characterLength(value.uncertainty) < 6) {
    errors.push("inferred or uncertain output must explain its uncertainty");
  }
  if (hasSpeculativeAsFact) errors.push("speculative evidence must be labeled as inference");
  if (modern && historicalPersona && actionType !== "admit_limit") {
    if (value.epistemic_status !== "grounded_with_inference") errors.push("modern-topic persona speech must be marked grounded_with_inference");
    if (!hasInference || !hasHistoricalGrounding) errors.push("modern-topic persona speech needs both historical grounding and explicit inference");
  }

  if (!Array.isArray(value.suggested_next_speakers) || value.suggested_next_speakers.length > 2) {
    errors.push("suggested_next_speakers must contain at most 2 ids");
  } else {
    for (const speakerId of value.suggested_next_speakers) {
      if (typeof speakerId !== "string" || !request.castIds.includes(speakerId)) errors.push("suggested next speaker is outside the invited cast");
      if (request.castIds.length > 1 && speakerId === value.speaker_id) errors.push("speaker should not hand the next turn back to themselves");
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], turn: value as unknown as DialogueTurn };
}
