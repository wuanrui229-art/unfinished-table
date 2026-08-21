import { ACTION_TYPES, DISCUSSION_STAGES, EPISTEMIC_STATUSES, type DialogueRequest, type DialogueTurn } from "./contracts.ts";
import { hasPersona } from "./personas.ts";
import { characterLength } from "./text.ts";

export type RequestParseResult =
  | { ok: true; request: DialogueRequest }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncateCharacters(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join("");
}

function parseHistoryTurn(
  value: unknown,
  castIds: string[],
  index: number,
  language: DialogueRequest["language"],
): DialogueTurn | null {
  if (!isRecord(value)) return null;
  if (typeof value.turn_id !== "string" || characterLength(value.turn_id) < 1 || characterLength(value.turn_id) > 100) return null;
  if (typeof value.speaker_id !== "string" || !castIds.includes(value.speaker_id)) return null;
  if (typeof value.action_type !== "string" || !ACTION_TYPES.includes(value.action_type as never)) return null;
  if (!Array.isArray(value.speech_segments) || value.speech_segments.length < 1 || value.speech_segments.length > 6) return null;

  const rawSpeechSegments = value.speech_segments.filter((segment): segment is string => typeof segment === "string");
  if (rawSpeechSegments.length !== value.speech_segments.length || rawSpeechSegments.some((segment) => characterLength(segment.trim()) < 1)) return null;
  // History must accept every bubble that the generation validator can return.
  // Older sessions may be a little longer, so normalize them for prompt context
  // instead of breaking the next speaker's turn.
  const maximumSegmentLength = language === "en" ? 300 : 135;
  const speechSegments = rawSpeechSegments.map((segment) => truncateCharacters(segment.trim(), maximumSegmentLength));
  if (typeof value.unresolved_tension !== "string") return null;

  const suggested = Array.isArray(value.suggested_next_speakers)
    ? value.suggested_next_speakers.filter((id): id is string => typeof id === "string" && castIds.includes(id)).slice(0, 2)
    : [];
  const epistemicStatus = typeof value.epistemic_status === "string" && EPISTEMIC_STATUSES.includes(value.epistemic_status as never)
    ? value.epistemic_status as DialogueTurn["epistemic_status"]
    : "uncertain";
  const replyTo = isRecord(value.reply_to) && typeof value.reply_to.speaker_id === "string" && typeof value.reply_to.claim === "string"
    ? {
        turn_id: typeof value.reply_to.turn_id === "string" ? value.reply_to.turn_id : null,
        speaker_id: value.reply_to.speaker_id,
        claim: truncateCharacters(value.reply_to.claim, 160),
      }
    : { turn_id: index === 0 ? null : `history-${index}`, speaker_id: index === 0 ? "user" : "unknown", claim: "未提供" };

  return {
    turn_id: value.turn_id,
    speaker_id: value.speaker_id,
    reply_to: replyTo,
    action_type: value.action_type as DialogueTurn["action_type"],
    speech_segments: speechSegments,
    evidence_uses: [],
    epistemic_status: epistemicStatus,
    uncertainty: typeof value.uncertainty === "string" ? truncateCharacters(value.uncertainty, 180) : "",
    unresolved_tension: truncateCharacters(value.unresolved_tension, 180),
    suggested_next_speakers: suggested,
  };
}

export function parseDialogueRequest(value: unknown): RequestParseResult {
  if (!isRecord(value)) return { ok: false, errors: ["请求内容不是有效对象"] };
  const errors: string[] = [];
  const question = typeof value.question === "string" ? value.question.trim() : "";
  if (characterLength(question) < 2 || characterLength(question) > 500) errors.push("问题长度需在 2–500 个字符之间");

  const castIds = Array.isArray(value.castIds)
    ? value.castIds.filter((id): id is string => typeof id === "string")
    : [];
  if (castIds.length < 1 || castIds.length > 6) errors.push("请选择 1–6 位人物");
  if (new Set(castIds).size !== castIds.length) errors.push("人物选择不能重复");
  if (castIds.some((id) => !hasPersona(id))) errors.push("人物列表中包含尚未建立资料包的人物");

  const rawHistory = Array.isArray(value.history) ? value.history : [];
  if (rawHistory.length > 36) errors.push("单次会话最多携带最近 36 轮对话");
  const stage = typeof value.stage === "string" && DISCUSSION_STAGES.includes(value.stage as never)
    ? value.stage as DialogueRequest["stage"]
    : "define";
  if (typeof value.stage === "string" && !DISCUSSION_STAGES.includes(value.stage as never)) errors.push("讨论阶段无效");
  const userContribution = value.userContribution === true;
  const language: DialogueRequest["language"] = value.language === "en" ? "en" : "zh";
  if (typeof value.language === "string" && value.language !== "zh" && value.language !== "en") errors.push("语言选项无效");

  const history: DialogueTurn[] = [];
  if (errors.length === 0) {
    for (const [index, turn] of rawHistory.entries()) {
      const parsed = parseHistoryTurn(turn, castIds, index, language);
      if (!parsed) {
        errors.push(`第 ${index + 1} 轮历史对话格式无效`);
        break;
      }
      history.push(parsed);
    }
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, request: { question, castIds, history, stage, userContribution, language } };
}
