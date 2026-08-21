import type { DialogueRequest, DialogueTurn, EvidenceRecord, SpeakerSelection } from "./contracts.ts";
import { selectNextSpeaker } from "./orchestrator.ts";
import { buildDialoguePrompts } from "./prompt.ts";
import {
  buildProviderRequest,
  extractProviderError,
  extractProviderResponse,
  type ModelProvider,
} from "./providers.ts";
import { validateDialogueTurn } from "./validator.ts";
import { characterLength } from "./text.ts";

export { buildOpenAIRequestBody, buildProviderRequest } from "./providers.ts";

export type DialogueErrorCode =
  | "MODEL_NOT_CONFIGURED"
  | "MODEL_REQUEST_FAILED"
  | "MODEL_REFUSED"
  | "GENERATION_REJECTED";

export class DialogueGenerationError extends Error {
  readonly code: DialogueErrorCode;
  readonly details: string[];

  constructor(
    code: DialogueErrorCode,
    message: string,
    details: string[] = [],
  ) {
    super(message);
    this.name = "DialogueGenerationError";
    this.code = code;
    this.details = details;
  }
}

export interface ModelConfiguration {
  provider?: ModelProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  selection?: SpeakerSelection;
}

export interface DialogueGenerationResult {
  turn: DialogueTurn;
  selection: SpeakerSelection;
  evidence: EvidenceRecord[];
  attempts: number;
  provider: ModelProvider;
  model: string;
}

function explainRepairError(error: string, language: DialogueRequest["language"]): string {
  if (error === "grounded_with_inference requires an inference use") {
    return "epistemic_status 是 grounded_with_inference，因此 evidence_uses 中必须至少有一项的 use_type 精确写成 inference；使用提示中列出的推演证据 id。";
  }
  if (error === "modern-topic persona speech needs both historical grounding and explicit inference") {
    return "现代议题必须同时引用一条历史依据和一条推演依据；推演依据的 use_type 必须精确写成 inference。";
  }
  if (error.includes("action_type")) {
    return "action_type 不合格；只能从 system 中本轮允许的 action_type 列表选择一个精确值。";
  }
  if (error.includes("speaker_id")) {
    return "speaker_id 不合格；必须逐字复制 system 中的本轮唯一发言者 persona_id，不能换成其他入席人物。";
  }
  if (error.includes("turn_id")) {
    return "turn_id 不合格；必须逐字复制 system 指定的 turn_id。";
  }
  if (error.includes("reply_to")) {
    return "reply_to 不合格；turn_id 与 speaker_id 必须逐字复制 user 提示中的“本轮必须回应”，claim 概括上一位的具体主张。";
  }
  if (error === "speech segment is too syntactically dense") {
    return "有一个气泡句法太密：超过 55 字时，逗号、分号、冒号和顿号合计最多 4 个。请拆成更短的独立句，减少并列成分；确有需要时可以增加气泡，但整轮最多六个。";
  }
  if (error === "speech segment appears incomplete") {
    return "有一个气泡停在半句话上。请把意思补完整，并用自然的句号、问号、感叹号或省略号收尾；不要为了满足字数硬截断词语。";
  }
  if (error === "speech segment must end as a complete sentence") {
    return "每个气泡都必须是完整句子，并用句号、问号、感叹号或省略号收尾；不要在长度上限处截断。";
  }
  if (error.includes("speech")) {
    return language === "en"
      ? "speech_segments 不合格；英文模式根据论证需要输出 2–6 个完整气泡，总长 460–1100 字符为宜，每个气泡最多 300 字符。第一段直接回应，后续段落完成连贯推理；不用 Markdown，不混入中文。"
      : "speech_segments 不合格；除 admit_limit 外根据论证需要写 2–6 个日常气泡。第一段直接回应且不超过 105 字，不讲历史故事；每段最多 130 字，总长以 220–480 字为目标。后续段落只使用 EVIDENCE PACKET 已提供的例子，不另编故事；不要把整段包成直接引语，也不要把任何证据 id 写进气泡。";
  }
  if (error.includes("evidence")) {
    return "证据字段不合格；只能使用 EVIDENCE PACKET 中存在的 id，并让 use_type 与 verified/interpreted/speculative 状态一致。";
  }
  if (error.includes("epistemic_status") || error.includes("modern-topic")) {
    return "认识状态不合格；现代议题必须使用 grounded_with_inference，并同时提供历史依据、inference 依据和时代距离说明。";
  }
  if (error.includes("uncertainty")) {
    return "uncertainty 不合格；用一句自然语言明确说明人物没有经历当代议题，以及本轮只是有限的原则迁移。";
  }
  if (error.includes("suggested next speaker")) {
    return "suggested_next_speakers 只能包含已经入席且不是当前发言者的人物 id；不确定时输出空数组。";
  }
  return error;
}

function normalizeOrchestrationHints(value: unknown, request: DialogueRequest): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const turn = value as Record<string, unknown>;
  if (!Array.isArray(turn.suggested_next_speakers)) return value;
  const allowed = new Set(request.castIds);
  const speakerId = typeof turn.speaker_id === "string" ? turn.speaker_id : "";
  return {
    ...turn,
    suggested_next_speakers: [...new Set(turn.suggested_next_speakers)]
      .filter((id): id is string => typeof id === "string" && allowed.has(id) && id !== speakerId)
      .slice(0, 2),
  };
}

function splitReadableBubble(text: string, language: DialogueRequest["language"]): [string, string] | null {
  const characters = Array.from(text.trim());
  if (characters.length < 12) return null;
  const maximumSegmentLength = language === "en" ? 300 : 130;
  const ideal = Math.min(maximumSegmentLength - 6, Math.max(24, Math.round(characters.length / 2)));
  const punctuation = new Set(language === "en"
    ? [".", "!", "?", ";", ",", ":"]
    : ["。", "！", "？", "；", "，", "、", "："]);
  let splitAt = -1;
  for (let distance = 0; distance < ideal - 4; distance += 1) {
    const backward = ideal - distance;
    const forward = ideal + distance;
    if (backward >= 4 && punctuation.has(characters[backward])) {
      splitAt = backward;
      break;
    }
    if (forward < Math.min(characters.length - 4, maximumSegmentLength - 1) && punctuation.has(characters[forward])) {
      splitAt = forward;
      break;
    }
  }
  if (splitAt < 4) return null;
  const left = characters.slice(0, splitAt + 1).join("").trim();
  const right = characters.slice(splitAt + 1).join("").trim();
  return characterLength(left) >= 4 && characterLength(right) >= 4 ? [left, right] : null;
}

function looksLikeIncompleteEnglish(text: string): boolean {
  const trimmed = text.trim();
  if (/[`*_]|[,;:(—-]$/.test(trimmed)) return true;
  if (/\b(?:and|but|or|because|so|with|without|to|for|of|the|a|an|did not|does not|can not|could not|would not|should not|will not|may not|might not|must not)$/i.test(trimmed)) return true;
  const words = trimmed.match(/[A-Za-z']+/g) ?? [];
  if (words.length <= 4 && /^(?:the|a|an|this|that|these|those|my|your|our|their)\b/i.test(trimmed)) {
    return !/\b(?:is|are|was|were|has|have|had|does|do|did|can|could|will|would|should|may|might|must|seems|ends|starts|works|fails|matters|changes|helps|hides|adds|removes|shows|asks|means)\b/i.test(trimmed);
  }
  return false;
}

function splitEnglishParagraphIntoBubbles(text: string): string[] | null {
  const trimmed = text.trim();
  const sentences = trimmed.match(/[^.!?…]+[.!?…]+(?:["'”’)]*)/g)?.map((sentence) => sentence.trim()) ?? [];
  const reconstructed = sentences.join(" ").replace(/\s+/g, " ").trim();
  if (sentences.length < 2 || sentences.length > 8) return null;
  if (reconstructed !== trimmed.replace(/\s+/g, " ").trim()) return null;
  if (sentences.some((sentence) => characterLength(sentence) > 300)) return null;
  if (sentences.length <= 6) return sentences;
  const bubbles: string[] = [];
  for (const sentence of sentences) {
    const previous = bubbles.at(-1);
    const activeLimit = bubbles.length === 1 ? 240 : 300;
    if (previous && characterLength(`${previous} ${sentence}`) <= activeLimit) {
      bubbles[bubbles.length - 1] = `${previous} ${sentence}`;
    } else {
      bubbles.push(sentence);
    }
  }
  // Kimi can over-explain even after a repair pass. Trim only whole trailing
  // bubbles so the nearby UI stays readable; never cut a sentence mid-word.
  while ((characterLength(bubbles.join(" ")) > 1300 || bubbles.length > 6) && bubbles.length > 2) bubbles.pop();
  return bubbles.length >= 2 && bubbles.length <= 6 ? bubbles : null;
}

function normalizeSpeechBubbles(value: unknown, language: DialogueRequest["language"]): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const turn = value as Record<string, unknown>;
  if (!Array.isArray(turn.speech_segments) || !turn.speech_segments.every((segment) => typeof segment === "string")) return value;
  const rawSegments = turn.speech_segments as string[];
  const paragraphBubbles = language === "en" && rawSegments.length === 1
    ? splitEnglishParagraphIntoBubbles(rawSegments[0])
    : null;
  const sourceSegments = paragraphBubbles ?? rawSegments;
  const segments = language === "en"
    ? sourceSegments.map((segment) => {
        const trimmed = segment.trim();
        return /[.!?…]["'”’)]?$/.test(trimmed) || looksLikeIncompleteEnglish(trimmed) ? trimmed : `${trimmed}.`;
      })
    : rawSegments;
  const maximumSegmentLength = language === "en" ? 300 : 130;
  const maximumTotalLength = language === "en" ? 1300 : 520;
  if (segments.length < 2 || characterLength(segments.join("")) > maximumTotalLength) return { ...turn, speech_segments: segments };

  const isReadable = (segment: string) => {
    const length = characterLength(segment);
    const clauseBreaks = segment.match(/[，；：、]/g)?.length ?? 0;
    return length >= 4 && length <= maximumSegmentLength && !(length > 55 && clauseBreaks >= 5);
  };
  if (segments.every(isReadable)) return { ...turn, speech_segments: segments };

  const first = segments[0];
  if (!isReadable(first) && segments.length === 2) {
    const splitFirst = splitReadableBubble(first, language);
    const candidate = splitFirst ? [...splitFirst, segments[1]] : [];
    if (candidate.length === 3 && candidate.every(isReadable)) return { ...turn, speech_segments: candidate };
  }
  if (!isReadable(first)) return value;

  const tail = segments.slice(1).join(language === "en" ? " " : "");
  if (isReadable(tail)) return { ...turn, speech_segments: [first, tail] };
  const splitTail = splitReadableBubble(tail, language);
  const candidate = splitTail ? [first, ...splitTail] : [];
  return candidate.length === 3 && candidate.every(isReadable)
    ? { ...turn, speech_segments: candidate }
    : value;
}

async function requestStructuredTurn(
  configuration: Required<Pick<ModelConfiguration, "provider" | "apiKey" | "model" | "fetcher">> & Pick<ModelConfiguration, "baseUrl" | "signal">,
  system: string,
  user: string,
): Promise<string> {
  const providerRequest = buildProviderRequest(configuration, system, user);
  let response: Response;
  try {
    response = await configuration.fetcher(providerRequest.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(providerRequest.body),
      signal: configuration.signal,
    });
  } catch (error) {
    if (configuration.signal?.aborted) {
      throw new DialogueGenerationError(
        "MODEL_REQUEST_FAILED",
        "这一位想得太久，本轮已停在这里。点一次“继续接话”就能从原位置续上。",
      );
    }
    const message = error instanceof Error ? error.message : "未知网络错误";
    throw new DialogueGenerationError("MODEL_REQUEST_FAILED", `模型请求失败：${message}`);
  }

  const body = await response.json() as unknown;
  if (!response.ok) {
    throw new DialogueGenerationError("MODEL_REQUEST_FAILED", extractProviderError(body) || `${configuration.provider} 接口返回 ${response.status}`);
  }
  const extracted = extractProviderResponse(configuration.provider, body);
  if (extracted.refusal) throw new DialogueGenerationError("MODEL_REFUSED", extracted.refusal);
  return extracted.text;
}

export async function generateDialogueTurn(
  request: DialogueRequest,
  expectedTurnId: string,
  configuration: ModelConfiguration,
): Promise<DialogueGenerationResult> {
  const provider = configuration.provider ?? "openai";
  if (!configuration.apiKey || !configuration.model) {
    throw new DialogueGenerationError(
      "MODEL_NOT_CONFIGURED",
      `真实模型尚未连接：需要在服务端配置 ${provider === "kimi" ? "MOONSHOT_API_KEY" : provider === "deepseek" ? "DEEPSEEK_API_KEY" : "OPENAI_API_KEY 与 OPENAI_MODEL"}。`,
    );
  }

  const selection = configuration.selection ?? selectNextSpeaker(request);
  const bundle = buildDialoguePrompts(request, selection, expectedTurnId);
  const fetcher = configuration.fetcher ?? fetch;
  let previousOutput = "";
  let validationErrors: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const repairErrors = validationErrors.map((error) => explainRepairError(error, request.language));
    const repairInstruction = attempt === 1
      ? ""
      : `\n\n上一次输出没有通过产品的事实与对话检查。只修正这些问题，不改变人物：\n- ${repairErrors.join("\n- ")}\n重新核对 system 中的现代议题字段规则后，输出完整 JSON 对象。\n上一次输出：\n${previousOutput.slice(0, 5000)}`;
    previousOutput = await requestStructuredTurn(
      {
        provider,
        apiKey: configuration.apiKey,
        model: configuration.model,
        baseUrl: configuration.baseUrl,
        fetcher,
        signal: configuration.signal,
      },
      bundle.system,
      `${bundle.user}${repairInstruction}`,
    );

    if (!previousOutput.trim()) {
      validationErrors = [`${provider} returned empty content`];
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(previousOutput);
    } catch {
      validationErrors = ["output is not valid JSON"];
      continue;
    }

    parsed = normalizeSpeechBubbles(parsed, request.language);
    parsed = normalizeOrchestrationHints(parsed, request);
    const validation = validateDialogueTurn(parsed, request, bundle);
    if (validation.ok && validation.turn) {
      return { turn: validation.turn, selection, evidence: bundle.evidence, attempts: attempt, provider, model: configuration.model };
    }
    validationErrors = validation.errors;
  }

  throw new DialogueGenerationError(
    "GENERATION_REJECTED",
    "这段回答没有通过来源与对话检查，因此没有展示给用户。",
    validationErrors,
  );
}
