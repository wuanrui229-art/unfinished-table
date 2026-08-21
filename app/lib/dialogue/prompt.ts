import type { DialogueRequest, EvidenceRecord, SpeakerSelection } from "./contracts.ts";
import { getPersona } from "./personas.ts";
import { retrieveEvidence } from "./retrieval.ts";
import { isModernTopic } from "./text.ts";

const stageGuidance: Record<DialogueRequest["stage"], { label: string; instruction: string; labelEn: string; instructionEn: string }> = {
  define: {
    label: "界定问题",
    instruction: "先用日常话说清楚：用户的问题里，哪一个词可能有两种不同理解。不要给总答案。",
    labelEn: "Define the question",
    instructionEn: "In plain language, identify one word or assumption in the question that could mean two different things. Do not give a final answer.",
  },
  evidence: {
    label: "打开材料",
    instruction: "先接住上一句话，再自然地讲一件真实经历或材料。像聊天时举例，不要像念资料卡。只说明它能支持什么，别让一条材料承担整个结论。",
    labelEn: "Bring in evidence",
    instructionEn: "Respond to the previous point, then naturally bring in one real experience or source. Use it like an example in conversation, not a citation card, and do not make one source carry the whole conclusion.",
  },
  conflict: {
    label: "让分歧出现",
    instruction: "先说你具体同意哪一句，再只指出一个真正的分歧。告诉对方你担心的后果是什么。不要各说各的。",
    labelEn: "Let disagreement appear",
    instructionEn: "Name the exact point you agree with, then raise one real disagreement and say what consequence worries you. Do not give a parallel answer.",
  },
  today: {
    label: "带回今天",
    instruction: "承认你没有生活在今天，再把刚才的想法落到一个用户能看见、能试一试的现实场景里。不要假装熟悉当代技术。",
    labelEn: "Bring it to today",
    instructionEn: "Acknowledge the historical distance, then connect the idea to one present-day situation the user could notice or test. Do not pretend to know modern technology firsthand.",
  },
  unfinished: {
    label: "留下未竟问题",
    instruction: "不要总结。只说清楚桌上还卡在哪两个选择之间，并把一个真问题还给用户。",
    labelEn: "Leave it unfinished",
    instructionEn: "Do not summarize. Name the two choices the table is still caught between, then return one genuine question to the user.",
  },
};

export interface DialoguePromptBundle {
  system: string;
  user: string;
  evidence: EvidenceRecord[];
  selection: SpeakerSelection;
  expectedTurnId: string;
}

export function buildDialoguePrompts(
  request: DialogueRequest,
  selection: SpeakerSelection,
  expectedTurnId: string,
): DialoguePromptBundle {
  const profile = getPersona(selection.speakerId);
  const isLivingPublicView = profile.personaMode === "living_public_view";
  const currentStage = stageGuidance[request.stage];
  const outputLanguage = request.language === "en" ? "English" : "简体中文";
  const stageLabel = request.language === "en" ? currentStage.labelEn : currentStage.label;
  const stageInstruction = request.language === "en" ? currentStage.instructionEn : currentStage.instruction;
  const latest = request.history.at(-1);
  const retrievalQuery = [
    request.question,
    latest?.unresolved_tension ?? "",
    ...(latest?.speech_segments ?? []),
  ].join(" ");
  const evidence = retrieveEvidence(profile, retrievalQuery);
  const replyTarget = request.userContribution
    ? { turn_id: null, speaker_id: "user" }
    : latest
    ? { turn_id: latest.turn_id, speaker_id: latest.speaker_id }
    : { turn_id: null, speaker_id: "user" };

  const evidencePacket = evidence.map((record) => ({
    id: record.id,
    claim: record.claim,
    status: record.status,
    evidence_type: record.evidence_type,
    source_title: record.source_title,
    source_creator: record.source_creator,
    source_date: record.source_date,
    locator: record.locator,
    notes: record.notes,
    confidence: record.confidence,
  }));
  const inferenceEvidenceIds = evidence.filter((record) => record.status === "speculative").map((record) => record.id);
  const historicalEvidenceIds = evidence.filter((record) => record.status !== "speculative").map((record) => record.id);

  const personaFrame = isLivingPublicView
    ? `这是在世公众人物的“公开观点席”，不是本人代理、私人聊天或实时发言。只能转译资料截止日 ${profile.sourceUpdatedAt} 以前的公开观点；不得编造私生活、内心动机、内部消息、未发布计划或截止日之后的新事件。公司材料是带利益关系的公开主张，不能自动写成独立事实。`
    : "这是有史料边界的历史人物演绎。人物不能知道其生后发生的事件；讨论当代议题时只能把有依据的历史原则作明确、有限的迁移。";

  const contemporaryRule = isLivingPublicView
    ? `6. 这位人物可以直接讨论资料截止日前的当代议题，但每个具体判断都必须由 EVIDENCE PACKET 支撑。若只是转述有日期的公开观点，epistemic_status 可写 grounded；若把公开原则外推到资料未明确回答的问题，必须写 grounded_with_inference，并使用 status=speculative 的证据且 use_type=inference。不得暗示掌握实时或内部信息。`
    : `6. 对人物身后出现的 AI、职场、算法等议题，只能做明确标记的原则迁移：epistemic_status 必须精确写为 grounded_with_inference；evidence_uses 至少包含一条历史依据（use_type=paraphrase 或 boundary）和一条推演依据（use_type 必须精确写为 inference）；并在 uncertainty 说明时代距离。不要把“推演”只写进正文或 uncertainty 而漏掉 evidence_uses 的 inference 字段。`;

  const voiceRule = request.language === "en"
    ? `Write natural contemporary spoken English. Do not imitate archaic English or social-media catchphrases. Use two to six speech_segments according to what the argument actually needs: two or three for a quick exchange, four to six when a distinction, example, objection, and consequence need room. Each bubble may contain one to three complete spoken sentences and must move one connected argument forward. Do not use Markdown formatting or include Chinese characters in any user-visible field.${isLivingPublicView ? " Do not claim private knowledge or events after the source cutoff." : " When stating historical distance, say that your firsthand experience ends in a certain year; never say ‘I died in…’."}`
    : `写原生、口语化的现代中文，不要保留英文句法，也不要靠网络口头禅模仿人物。少用“并非……而是……”“这意味着”“由此可见”“某种意义上”“在……之中”等译文和论文套话。能说“我担心的是……”就不要说“值得警惕的张力在于……”。能举一个人听得懂的小场景，就不要用抽象比喻替代解释。${isLivingPublicView ? "不得暗示私下消息或资料截止日之后的事件。" : "说明时代距离时说“我的亲身经验停在某年”，不要用“我死于某年”制造突兀感。"}`;

  const system = `你正在为“未竟之问”生成一轮有来源的人物圆桌对话。

定位：这是基于公开资料的 AI 观点转译，不是真人发言，也不是学术替代品。目标是激发好奇，而非制造权威幻觉。
人物模式：${personaFrame}

本轮唯一发言者：${profile.displayName}（${profile.originalName}，persona_id=${profile.id}）
讨论功能：${profile.discussionRole}
当前阶段：${stageLabel}
本阶段任务：${stageInstruction}

输出语言：${outputLanguage}。speech_segments、reply_to.claim、evidence_uses.supports、uncertainty、unresolved_tension 中所有给用户看的文字都必须使用${outputLanguage}，不得中英混写。JSON 字段名、枚举值与人物 id 保持原样。

硬规则：
1. 只生成这一个人物的一轮发言，不替其他人物作答。
2. 必须直接接住 reply_to 指向的那句话，形成赞同后补充、质疑、情境化或具体化；不得另起炉灶平行回答。
3. speech_segments 是人物身边依次出现的 2–6 个气泡，不是固定三段。简短接话可用 2–3 个；需要完成“区分—例子—反例—后果”时应使用 4–6 个。每个气泡可以包含 1–3 个自然口语句，不要把一句话机械算作一个气泡。${request.language === "en"
    ? "英文总长以 460–1100 字符为目标；每个气泡不超过 300 字符。第一气泡直接接住对方，后续气泡完成一段连贯推理。"
    : "中文总长以 220–480 字为目标。第一气泡直接回应上一位说的具体意思，不讲人物生平；后续气泡完成一段连贯推理，可自然带入一件 EVIDENCE PACKET 中的真实经历或材料，并在 evidence_uses 中对应到该 id。每个中文气泡不超过 130 字。"}每个气泡都必须完整收尾，禁止为满足字数在词语、连词或 Markdown 标记中间截断。不要为了气泡短而牺牲推理。
4. 只能使用下方 evidence packet 和 persona 文档。不得伪造生平、引文、会面、作品或现代知识。证据 id 仅供系统在 evidence_uses 内核对，严禁把 ev-001、[ev-001] 等任何内部编号写进 speech_segments。
5. 不把 persona 中的“风格模拟样句”当真实引文，也不要逐字复用它们。对话正文不使用伪古文或整句引号伪装原话。
${contemporaryRule}
7. 如果证据不足，使用 admit_limit 或 ask_back；“不知道”比编造更合格。
8. 语言自然、具体、像真的人在桌边说话。以一个没有读过该人物原著的 16 岁用户听一遍就懂为标准。不要像论文摘要、展签、翻译稿或名言生成器。禁止用长串抽象名词、连续反问、对仗、空泛比喻、鸡汤和角色口号制造深度。人物辨识度来自他注意什么、经历过什么、怎样不同意别人，不来自故作古雅或晦涩。
9. ${voiceRule}
10. 这一轮删掉后，讨论必须会失去一个关键区别、真实案例、反例、可观察的测试、明确的代价分配，或需要用户决定的分岔。只有换一种语气复述前文，视为不合格。不要用“技术是双刃剑”“需要平衡利弊”“保持批判”冒充新增价值。
11. action_type 要与新增价值一致：reframe 拆出区别；contextualize 带来资料中的具体情境；challenge 给出反例或被忽略的代价；concretize 形成可观察的小测试；ask_back 把真实分岔交还用户；agree_extend 必须增加新后果而非复述。action_type 只能从本轮允许值中选择：${selection.allowedActions.join(", ")}。
12. turn_id 必须精确写为 ${expectedTurnId}；speaker_id 必须精确写为 ${profile.id}。
13. suggested_next_speakers 只表示谁可能带来新的推进，不是排好的轮次。只能从已入席人物 ${JSON.stringify(request.castIds)} 中选择，不能包含当前发言者；不确定时输出空数组。
14. 当前阶段不是装饰标签。发言必须完成“${stageLabel}”任务：${stageInstruction}

PERSONA 文档：
${profile.personaMarkdown}

EVIDENCE PACKET：
${JSON.stringify(evidencePacket, null, 2)}`;

  const history = request.history.slice(-6).map((turn) => ({
    turn_id: turn.turn_id,
    speaker_id: turn.speaker_id,
    action_type: turn.action_type,
    speech_segments: turn.speech_segments,
    unresolved_tension: turn.unresolved_tension,
  }));
  const modernChecklist = isModernTopic(retrievalQuery) && !isLivingPublicView
    ? `现代议题字段检查：
- epistemic_status = grounded_with_inference
- 历史依据 evidence_id 从 ${JSON.stringify(historicalEvidenceIds)} 中选择，use_type 写 paraphrase 或 boundary
- 推演依据 evidence_id 从 ${JSON.stringify(inferenceEvidenceIds)} 中选择，use_type 必须精确写 inference
- uncertainty 必须说明人物未经历当代技术的时代距离`
    : isLivingPublicView
      ? `在世公众人物字段检查：
- 只使用资料截止日 ${profile.sourceUpdatedAt} 前的公开材料
- 公司愿景写成“公开主张”，不要写成已经实现的事实
- 直接材料可用 grounded；发生外推时才用 grounded_with_inference 和 inference 证据
- 不声称私人动机、内部消息或实时立场`
      : "";

  const user = `用户最初的问题：${request.question}
${request.userContribution ? "用户刚刚作为桌边的一员说出了自己的看法。本轮必须先回应用户这句话里的具体主张，再决定如何把讨论继续下去。" : ""}
当前讨论阶段：${stageLabel}
本轮阶段任务：${stageInstruction}
本轮所有可见文字的语言：${outputLanguage}
这是否属于现代议题：${isModernTopic(retrievalQuery) ? (isLivingPublicView ? "是；按公开资料截止日回答" : "是；必须标记时代距离") : "否"}
本轮必须回应：${JSON.stringify(replyTarget)}
最近对话：${JSON.stringify(history, null, 2)}
${modernChecklist}

请输出严格符合给定 JSON Schema 的对象。reply_to.turn_id 与 reply_to.speaker_id 必须和“本轮必须回应”一致；reply_to.claim 用一句话准确概括你正在接住的具体主张。不要输出 JSON 以外的文字。`;

  return { system, user, evidence, selection, expectedTurnId };
}
