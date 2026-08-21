import type { ActionType, DialogueRequest, DiscussionStage, SpeakerScore, SpeakerSelection } from "./contracts.ts";
import { getPersona } from "./personas.ts";
import { countKeywordHits } from "./text.ts";

const actionsByStage: Record<DiscussionStage, ActionType[]> = {
  define: ["reframe", "ask_back", "contextualize", "concretize"],
  evidence: ["contextualize", "concretize", "challenge", "agree_extend"],
  conflict: ["challenge", "agree_extend", "contextualize", "concretize"],
  today: ["concretize", "challenge", "contextualize", "ask_back"],
  unfinished: ["ask_back", "admit_limit", "reframe", "agree_extend"],
};

function nextAllowedActions(stage: DiscussionStage, history: DialogueRequest["history"], preferred: ActionType[]): ActionType[] {
  const base = actionsByStage[stage];
  const adjusted: ActionType[] = history.at(-1)?.action_type === "challenge"
    ? [...base.filter((action) => action !== "challenge"), "challenge"]
    : base;

  const ordered = [...preferred.filter((action) => adjusted.includes(action)), ...adjusted];
  return [...new Set<ActionType>([...ordered, "admit_limit"])];
}

export function selectNextSpeaker(request: DialogueRequest): SpeakerSelection {
  if (request.castIds.length === 0) throw new Error("At least one persona is required.");

  const lastTurn = request.history.at(-1);
  const recentContext = [
    request.question,
    lastTurn?.unresolved_tension ?? "",
    ...(lastTurn?.speech_segments ?? []),
  ].join(" ");
  const turnCounts = new Map<string, number>();
  for (const turn of request.history) turnCounts.set(turn.speaker_id, (turnCounts.get(turn.speaker_id) ?? 0) + 1);
  const mostTurns = Math.max(0, ...request.castIds.map((id) => turnCounts.get(id) ?? 0));
  const fewestTurns = Math.min(...request.castIds.map((id) => turnCounts.get(id) ?? 0));
  const recentSpeakers = request.history.slice(-3).map((turn) => turn.speaker_id);

  const scores: SpeakerScore[] = request.castIds.map((speakerId, castIndex) => {
    const profile = getPersona(speakerId);
    const reasons: string[] = [];
    let total = 0;

    const keywordHits = countKeywordHits(recentContext, profile.keywords);
    if (keywordHits > 0) {
      const topicScore = keywordHits * (request.userContribution ? 9 : 7);
      total += topicScore;
      reasons.push(`能直接处理当前问题 +${topicScore}`);
    }

    if (recentContext.includes(profile.displayName) || recentContext.includes(profile.originalName)) {
      total += 36;
      reasons.push("用户或上一位直接点名 +36");
    }

    // Silence is a small tie-breaker, never an obligation to fill every seat.
    // Someone may speak twice when their method still adds the most value.
    const silenceBonus = Math.min(4, Math.max(0, (mostTurns - (turnCounts.get(speakerId) ?? 0)) * 2));
    if (silenceBonus > 0) {
      total += silenceBonus;
      reasons.push(`给较少发言者一点空间 +${silenceBonus}`);
    }

    if (lastTurn && request.castIds.length > 1 && lastTurn.speaker_id === speakerId) {
      total -= 6;
      reasons.push("连续发言需要更高的新增价值 -6");
    }
    if (recentSpeakers.length >= 2 && recentSpeakers.slice(-2).every((id) => id === speakerId)) {
      total -= 12;
      reasons.push("避免一人长期占据讨论 -12");
    }

    if (lastTurn && lastTurn.speaker_id !== speakerId) {
      const incomingRelation = profile.relations.find((relation) => relation.target === lastTurn.speaker_id);
      const previousProfile = getPersona(lastTurn.speaker_id);
      const outgoingRelation = previousProfile.relations.find((relation) => relation.target === speakerId);
      if (incomingRelation || outgoingRelation) {
        total += 7;
        reasons.push("与上一位存在可推进的观点关系 +7");
      }
      if (lastTurn.suggested_next_speakers.includes(speakerId)) {
        total += 24;
        reasons.push("上一轮留下的张力指向此人 +24");
      }
    }

    const stageFit = profile.preferredActions.filter((action) => actionsByStage[request.stage].includes(action)).length;
    if (stageFit > 0) {
      total += Math.min(6, stageFit * 2);
      reasons.push("思考方法适合此刻的推进任务");
    }

    if ((turnCounts.get(speakerId) ?? 0) === fewestTurns && request.history.length > 0) {
      total += 1;
    }

    total -= castIndex * 0.001;
    if (reasons.length === 0) reasons.push("在当前信息下最接近问题");
    return { speakerId, total, reasons };
  });

  scores.sort((left, right) => right.total - left.total);
  const speakerId = scores[0].speakerId;
  return {
    speakerId,
    allowedActions: nextAllowedActions(request.stage, request.history, getPersona(speakerId).preferredActions),
    scores,
  };
}
