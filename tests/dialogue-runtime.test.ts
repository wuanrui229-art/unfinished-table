import assert from "node:assert/strict";
import test from "node:test";

import { PERSONAS, getPersona } from "../app/lib/dialogue/personas.ts";
import { retrieveEvidence } from "../app/lib/dialogue/retrieval.ts";
import { selectNextSpeaker } from "../app/lib/dialogue/orchestrator.ts";
import { buildDialoguePrompts } from "../app/lib/dialogue/prompt.ts";
import { buildPublicCitations } from "../app/lib/dialogue/citations.ts";
import { stripInternalEvidenceIds } from "../app/lib/dialogue/presentation.ts";
import { validateDialogueTurn } from "../app/lib/dialogue/validator.ts";
import {
  DialogueGenerationError,
  buildOpenAIRequestBody,
  generateDialogueTurn,
} from "../app/lib/dialogue/openai.ts";
import {
  buildProviderRequest,
  resolveServerModelConfiguration,
} from "../app/lib/dialogue/providers.ts";
import { parseDialogueRequest } from "../app/lib/dialogue/request.ts";
import { canShiftDiscussionLens, nextDiscussionLens } from "../app/lib/dialogue/session.ts";
import {
  buildLocalizationProviderRequest,
  localizeDialogueText,
  parseDialogueLocalizationRequest,
} from "../app/lib/dialogue/localization.ts";
import type { DialogueRequest, DialogueTurn } from "../app/lib/dialogue/contracts.ts";

const modernRequest: DialogueRequest = {
  question: "AI 产品有前途吗？我该怎么判断自己是否适合？",
  castIds: ["alan-turing", "zhuangzi", "audre-lorde"],
  history: [],
  stage: "today",
  userContribution: false,
  language: "zh",
};

function makeValidModernTurn(expectedTurnId = "turn-test"): {
  request: DialogueRequest;
  turn: DialogueTurn;
  bundle: ReturnType<typeof buildDialoguePrompts>;
} {
  const selection = selectNextSpeaker(modernRequest);
  const bundle = buildDialoguePrompts(modernRequest, selection, expectedTurnId);
  const historical = bundle.evidence.find((record) => record.status !== "speculative");
  const speculative = bundle.evidence.find((record) => record.status === "speculative");
  assert.ok(historical);
  assert.ok(speculative);

  return {
    request: modernRequest,
    bundle,
    turn: {
      turn_id: expectedTurnId,
      speaker_id: selection.speakerId,
      reply_to: {
        turn_id: null,
        speaker_id: "user",
        claim: "用户想判断 AI 产品方向是否值得投入，以及自己是否适合",
      },
      action_type: selection.allowedActions[0],
      speech_segments: [
        "先不要把前途当成一个只能预测的结论，把它改成一个能够被观察的小实验。",
        "做出一件真实的小产品，记录你是否能提出问题、修正假设，也记录这种工作是否让你愿意继续学习。测试回答的是下一步，不是定义你整个人。",
        "如果作品暴露的是技术理解不足，就补技术；如果你真正抗拒的是持续处理含糊信息，那才是在检验这份工作的匹配度。",
      ],
      evidence_uses: [
        { evidence_id: historical.id, use_type: "paraphrase", supports: "用可观察的问题替代含混判断" },
        { evidence_id: speculative.id, use_type: "inference", supports: "把历史方法有限迁移为职业小实验" },
      ],
      epistemic_status: "grounded_with_inference",
      uncertainty: "图灵没有经历当代 AI 行业与招聘市场，这里只迁移他的检验方法，不预测行业行情。",
      unresolved_tension: "一次小实验怎样同时检验能力增长与真实兴趣？",
      suggested_next_speakers: ["audre-lorde"],
    },
  };
}

test("compiled persona source contains historical and contemporary evidence packs", () => {
  assert.equal(PERSONAS.length, 11);
  for (const profile of PERSONAS) {
    assert.ok(profile.evidence.length >= 8, profile.id);
    assert.ok(profile.relations.length >= 5, profile.id);
    assert.ok(profile.sourceUpdatedAt, profile.id);
    assert.match(profile.personaMarkdown, /知识与演绎边界/);
  }
  assert.equal(getPersona("elon-musk").personaMode, "living_public_view");
  for (const id of ["fei-fei-li", "kai-fu-lee", "geoffrey-hinton", "timnit-gebru"]) {
    assert.equal(getPersona(id).personaMode, "living_public_view", id);
  }
});

test("modern evidence retrieval includes explicit inference plus historical anchors", () => {
  const evidence = retrieveEvidence(getPersona("alan-turing"), modernRequest.question);
  assert.ok(evidence.some((record) => record.id === "ev-012" && record.status === "speculative"));
  assert.ok(evidence.filter((record) => record.status !== "speculative").length >= 2);
});

test("speaker selection follows marginal contribution instead of a rigid round-robin", () => {
  const first = selectNextSpeaker(modernRequest);
  assert.equal(first.speakerId, "alan-turing");

  const { turn } = makeValidModernTurn("turn-1");
  const second = selectNextSpeaker({ ...modernRequest, history: [turn] });
  assert.ok(modernRequest.castIds.includes(second.speakerId));
  assert.ok(second.scores.find((score) => score.speakerId === "alan-turing")?.reasons.some((reason) => reason.includes("新增价值")));

  const directlyNamed = selectNextSpeaker({
    ...modernRequest,
    question: "图灵，请把刚才的小测试继续说具体一点。",
    history: [turn],
    userContribution: true,
  });
  assert.equal(directlyNamed.speakerId, "alan-turing");
});

test("one-person, two-person and six-person tables are valid", () => {
  const one = parseDialogueRequest({ question: "什么是值得过的生活？", castIds: ["zhuangzi"], history: [] });
  const two = parseDialogueRequest({ question: "什么是值得过的生活？", castIds: ["zhuangzi", "audre-lorde"], history: [] });
  const six = parseDialogueRequest({ question: "什么是值得过的生活？", castIds: PERSONAS.slice(0, 6).map((profile) => profile.id), history: [] });
  assert.equal(one.ok, true);
  assert.equal(two.ok, true);
  assert.equal(six.ok, true);
  if (one.ok) assert.equal(selectNextSpeaker(one.request).speakerId, "zhuangzi");
  if (two.ok) assert.equal(two.request.stage, "define");
});

test("discussion stages constrain the kind of conversational move", () => {
  const conflict = selectNextSpeaker({ ...modernRequest, stage: "conflict" });
  const unfinished = selectNextSpeaker({ ...modernRequest, stage: "unfinished" });
  assert.ok(conflict.allowedActions.includes("challenge"));
  assert.equal(conflict.allowedActions.includes("ask_back"), false);
  assert.ok(unfinished.allowedActions.includes("ask_back"));
  assert.ok(unfinished.allowedActions.includes("admit_limit"));
});

test("request parser rejects unknown stages instead of silently changing the room", () => {
  const parsed = parseDialogueRequest({
    question: "什么是值得过的生活？",
    castIds: ["zhuangzi"],
    history: [],
    stage: "final-answer",
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.match(parsed.errors[0], /讨论阶段无效/);
});

test("a new discussion lens becomes available after substance accumulates, not after roll call", () => {
  assert.equal(canShiftDiscussionLens(0, 4), false);
  assert.equal(canShiftDiscussionLens(1, 4), false);
  assert.equal(canShiftDiscussionLens(2, 4), true);
  assert.equal(canShiftDiscussionLens(1, 1), true);
});

test("the final discussion lens stays open instead of becoming a completed session", () => {
  assert.equal(nextDiscussionLens(0, 5), 1);
  assert.equal(nextDiscussionLens(3, 5), 4);
  assert.equal(nextDiscussionLens(4, 5), 4);
});

test("an unspoken seat is not forced in when another figure has stronger marginal value", () => {
  const { turn } = makeValidModernTurn("turn-before-selection");
  const previousLordeTurn: DialogueTurn = {
    ...turn,
    speaker_id: "audre-lorde",
    suggested_next_speakers: ["alan-turing"],
  };
  const selection = selectNextSpeaker({ ...modernRequest, history: [previousLordeTurn] });
  assert.equal(selection.speakerId, "alan-turing");
  assert.notEqual(selection.speakerId, "zhuangzi");
});

test("prompt states the reenactment boundary and requires a direct reply", () => {
  const selection = selectNextSpeaker(modernRequest);
  const bundle = buildDialoguePrompts(modernRequest, selection, "turn-prompt");
  assert.match(bundle.system, /AI 观点转译，不是真人发言/);
  assert.match(bundle.system, /必须直接接住 reply_to/);
  assert.match(bundle.system, /当前阶段：带回今天/);
  assert.match(bundle.system, /说明时代距离/);
  assert.match(bundle.system, /不知道.*比编造更合格/);
  assert.match(bundle.system, /use_type 必须精确写为 inference/);
  assert.match(bundle.system, /suggested_next_speakers 只表示谁可能带来新的推进/);
  assert.match(bundle.system, /这一轮删掉后.*关键区别/);
  assert.match(bundle.system, /没有读过该人物原著的 16 岁用户听一遍就懂/);
  assert.match(bundle.system, /第一气泡直接回应上一位/);
  assert.match(bundle.system, /不要像论文摘要、展签、翻译稿或名言生成器/);
  assert.match(bundle.system, /写原生、口语化的现代中文/);
  assert.match(bundle.system, /严禁把.*内部编号写进 speech_segments/);
  assert.match(bundle.user, /"speaker_id":"user"/);
  assert.match(bundle.user, /现代议题字段检查/);
  assert.match(bundle.user, /推演依据 evidence_id/);
});

test("living public-view personas can discuss current topics from dated public evidence", () => {
  const request: DialogueRequest = {
    question: "AI 会不会让很多人失业？",
    castIds: ["elon-musk", "alan-turing"],
    history: [],
    stage: "today",
    userContribution: false,
    language: "zh",
  };
  const selection = selectNextSpeaker(request);
  assert.equal(selection.speakerId, "elon-musk");
  const bundle = buildDialoguePrompts(request, selection, "turn-living-view");
  assert.match(bundle.system, /在世公众人物的“公开观点席”/);
  assert.match(bundle.system, /资料截止日 2026-08-20/);
  assert.match(bundle.system, /公司材料是带利益关系的公开主张/);
  assert.doesNotMatch(bundle.user, /必须标记时代距离/);

  const grounded = bundle.evidence.find((record) => record.status === "verified");
  assert.ok(grounded);
  const result = validateDialogueTurn({
    turn_id: "turn-living-view",
    speaker_id: "elon-musk",
    reply_to: { turn_id: null, speaker_id: "user", claim: "用户担心 AI 会造成大规模失业" },
    action_type: selection.allowedActions[0],
    speech_segments: [
      "先拆开：AI 能完成一项任务，不等于公司会立刻取消整个岗位。",
      "真正需要观察的是部署成本、错误责任，以及省下来的时间和收益最后归谁。",
      "同一种能力在不同公司会变成不同的岗位变化，所以先比较任务、责任和收益怎样重新分配，比猜一个统一的失业比例更可靠。",
    ],
    evidence_uses: [{ evidence_id: grounded.id, use_type: "paraphrase", supports: "公开材料中的部署与规模主张" }],
    epistemic_status: "grounded",
    uncertainty: "",
    unresolved_tension: "技术节省的成本会怎样分配？",
    suggested_next_speakers: ["alan-turing"],
  }, request, bundle);
  assert.equal(result.ok, true, result.errors.join("; "));
});

test("English mode requires native English in every user-visible model field", () => {
  const request: DialogueRequest = {
    ...modernRequest,
    question: "Does technology make us freer?",
    language: "en",
  };
  const selection = selectNextSpeaker(request);
  const bundle = buildDialoguePrompts(request, selection, "turn-english");
  assert.match(bundle.system, /输出语言：English/);
  assert.match(bundle.system, /speech_segments、reply_to\.claim.*必须使用English/);
  assert.match(bundle.system, /natural contemporary spoken English/i);
  assert.match(bundle.user, /本轮所有可见文字的语言：English/);
});

test("request language defaults to Chinese and accepts English", () => {
  const chinese = parseDialogueRequest({ question: "什么是自由？", castIds: ["zhuangzi"], history: [] });
  const english = parseDialogueRequest({ question: "What is freedom?", castIds: ["zhuangzi"], history: [], language: "en" });
  assert.equal(chinese.ok, true);
  assert.equal(english.ok, true);
  if (chinese.ok) assert.equal(chinese.request.language, "zh");
  if (english.ok) assert.equal(english.request.language, "en");
});

test("a generated turn with a long open tension can return as conversation history", () => {
  const { turn, bundle } = makeValidModernTurn("turn-round-trip");
  const generatedTurn = {
    ...turn,
    unresolved_tension: "我们还需要继续追问：一次小实验究竟怎样同时看见能力的增长、真实的兴趣、学习过程中的代价，以及环境给予不同人的机会差异？".repeat(5),
  };
  const generationValidation = validateDialogueTurn(generatedTurn, modernRequest, bundle);
  assert.equal(generationValidation.ok, true);

  const parsed = parseDialogueRequest({
    ...modernRequest,
    history: [generatedTurn],
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.request.history.length, 1);
    assert.ok(Array.from(parsed.request.history[0].unresolved_tension).length <= 180);
  }
});

test("history accepts long but complete English bubbles allowed at generation time", () => {
  const { turn } = makeValidModernTurn("turn-english-history");
  const longEnglishBubble = `${Array.from("A practical test should stay small enough to observe, while still showing who chooses the goal and who carries the cost. ".repeat(2)).slice(0, 155).join("").trim()}.`;
  assert.ok(Array.from(longEnglishBubble).length > 120);
  assert.ok(Array.from(longEnglishBubble).length <= 180);

  const parsed = parseDialogueRequest({
    question: "Does technology make us freer?",
    castIds: modernRequest.castIds,
    history: [{ ...turn, speech_segments: [longEnglishBubble, "Then compare what changed, and what did not."] }],
    stage: "today",
    language: "en",
  });
  assert.equal(parsed.ok, true);
});

test("a user contribution becomes the next reply target without erasing prior context", () => {
  const { turn: previousTurn } = makeValidModernTurn("turn-before-user");
  const parsed = parseDialogueRequest({
    ...modernRequest,
    history: [previousTurn],
    userContribution: true,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const selection = selectNextSpeaker(parsed.request);
  const bundle = buildDialoguePrompts(parsed.request, selection, "turn-after-user");
  const historical = bundle.evidence.find((record) => record.status !== "speculative");
  const speculative = bundle.evidence.find((record) => record.status === "speculative");
  assert.ok(historical);
  assert.ok(speculative);
  assert.match(bundle.user, /用户刚刚作为桌边的一员/);
  assert.match(bundle.user, /"turn_id":null,"speaker_id":"user"/);

  const response: DialogueTurn = {
    turn_id: "turn-after-user",
    speaker_id: selection.speakerId,
    reply_to: { turn_id: null, speaker_id: "user", claim: "用户认为选择变多不一定意味着自由增加" },
    action_type: selection.allowedActions[0],
    speech_segments: [
      "我先接住你的区别：选项数量与能够拒绝，确实不是同一件事。",
      "我们还要看谁承担拒绝的代价，以及没有被列入菜单的生活是否仍然可见。",
      "你可以试着关掉一次推荐，记录重新找到目标要花多少时间；那个额外成本，比菜单里有多少选项更接近你真正拥有的自由。",
    ],
    evidence_uses: [
      { evidence_id: historical.id, use_type: "paraphrase", supports: "支持区分可见选择与真实行动条件" },
      { evidence_id: speculative.id, use_type: "inference", supports: "有限迁移到当代算法选择情境" },
    ],
    epistemic_status: "grounded_with_inference",
    uncertainty: "人物没有经历当代推荐算法，这里只迁移其判断方法，不声称掌握现代系统事实。",
    unresolved_tension: "怎样观察拒绝一个推荐所需付出的真实代价？",
    suggested_next_speakers: [],
  };
  const validation = validateDialogueTurn(response, parsed.request, bundle);
  assert.deepEqual(validation.errors, []);
});

test("semantic validator accepts a grounded modern turn", () => {
  const { request, turn, bundle } = makeValidModernTurn();
  const validation = validateDialogueTurn(turn, request, bundle);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.ok, true);
});

test("a substantive turn may use more than three speech bubbles", () => {
  const { request, turn, bundle } = makeValidModernTurn("turn-five-bubbles");
  const extendedTurn: DialogueTurn = {
    ...turn,
    speech_segments: [
      turn.speech_segments[0],
      turn.speech_segments[1],
      "接着把实验拆成两周：第一周只记录你卡住的位置，第二周只练其中一个最常出现的能力缺口。",
      "如果第二周的练习能明显减少卡顿，问题更像技能不足；如果你仍持续厌恶这类判断过程，才需要重新检查方向。",
      "这样得到的不是一句适不适合，而是一张能够继续行动、也允许你改变主意的证据表。",
    ],
  };
  const validation = validateDialogueTurn(extendedTurn, request, bundle);
  assert.deepEqual(validation.errors, []);

  const parsed = parseDialogueRequest({ ...request, history: [extendedTurn] });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.request.history[0].speech_segments.length, 5);
});

test("semantic validator blocks fake quotation, wrong speaker and unavailable evidence", () => {
  const { request, turn, bundle } = makeValidModernTurn();
  const invalid = {
    ...turn,
    speaker_id: "zhuangzi",
    speech_segments: ["“这是一句从未存在过的图灵名言，用来冒充历史权威并给出确定答案。”"],
    evidence_uses: [{ evidence_id: "ev-999", use_type: "paraphrase", supports: "不存在的资料" }],
  };
  const validation = validateDialogueTurn(invalid, request, bundle);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes("speaker_id")));
  assert.ok(validation.errors.some((error) => error.includes("invented direct quotation")));
  assert.ok(validation.errors.some((error) => error.includes("not supplied")));
});

test("semantic validator rejects lecture-like bubbles that are too dense to read", () => {
  const { request, turn, bundle } = makeValidModernTurn("turn-dense");
  const dense = {
    ...turn,
    speech_segments: [
      "你问的其实并不是一个可以直接回答的问题，因为所谓技术、劳动、价值、分配、身份、自由以及制度安排，彼此之间存在着复杂而且持续变化的关联。",
      "先从一个具体例子开始，再看看不同的人分别承担什么风险。",
    ],
  };
  const validation = validateDialogueTurn(dense, request, bundle);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("speech segment is too syntactically dense"));
});

test("the first bubble cannot smuggle in an unsupported historical example", () => {
  const { request, turn, bundle } = makeValidModernTurn("turn-example-order");
  const misplacedExample = {
    ...turn,
    speech_segments: [
      "当年有一种职业被新工具取代，所以今天也不用担心。",
      "先看清谁承担变化的代价，再判断这项技术带来了什么。",
    ],
  };
  const validation = validateDialogueTurn(misplacedExample, request, bundle);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("first speech segment must answer directly without a historical example"));
});

test("internal evidence ids can never enter a visible speech bubble", () => {
  const { request, turn, bundle } = makeValidModernTurn("turn-hidden-evidence-code");
  const leaked = {
    ...turn,
    speech_segments: [
      turn.speech_segments[0],
      `${turn.speech_segments[1]} [ev-001]`,
    ],
  };
  const validation = validateDialogueTurn(leaked, request, bundle);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("speech segment exposes an internal evidence id"));
});

test("presentation strips legacy evidence codes from cached dialogue", () => {
  assert.equal(
    stripInternalEvidenceIds("我四十岁时办学，只想让儿童通过活的教师来学习。[ev-001]"),
    "我四十岁时办学，只想让儿童通过活的教师来学习。",
  );
  assert.equal(stripInternalEvidenceIds("一段话 ev001 后面还有内容。"), "一段话 后面还有内容。");
});

test("public citations contain readable source details but no evidence code field", () => {
  const { turn, bundle } = makeValidModernTurn("turn-readable-citations");
  const citations = buildPublicCitations(turn, bundle.evidence);
  assert.equal(citations.length, turn.evidence_uses.length);
  assert.ok(citations.every((citation) => citation.title && citation.creator && citation.url && citation.supports));
  assert.doesNotMatch(JSON.stringify(citations), /evidence_id|\bev-\d{3}\b/i);
});

test("living figures expose dated material as public positions, not historical evidence", () => {
  const profile = getPersona("elon-musk");
  const evidence = profile.evidence.slice(0, 1);
  const turn = {
    ...makeValidModernTurn("turn-living-citation").turn,
    speaker_id: profile.id,
    evidence_uses: [{
      evidence_id: evidence[0].id,
      use_type: "paraphrase" as const,
      supports: "这是一项有日期的公开主张",
    }],
  };
  const citations = buildPublicCitations(turn, evidence, profile.personaMode);
  assert.equal(citations[0]?.kind, "公开观点");
});

test("OpenAI request uses Responses structured text format", () => {
  const body = buildOpenAIRequestBody("configured-model", "system", "user");
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.input[0].role, "system");
});

test("Kimi request uses strict JSON Schema on its OpenAI-compatible endpoint", () => {
  const request = buildProviderRequest(
    { provider: "kimi", model: "kimi-k2.6" },
    "system",
    "user",
  );
  assert.equal(request.url, "https://api.moonshot.cn/v1/chat/completions");
  const format = request.body.response_format as {
    type: string;
    json_schema: { strict: boolean; schema: { additionalProperties: boolean } };
  };
  assert.equal(format.type, "json_schema");
  assert.equal(format.json_schema.strict, true);
  assert.equal(format.json_schema.schema.additionalProperties, false);
  assert.equal(request.body.reasoning_effort, undefined);
  assert.deepEqual(request.body.thinking, { type: "disabled" });
  assert.equal(request.body.max_completion_tokens, 1800);
});

test("DeepSeek request uses JSON mode and the official chat completions endpoint", () => {
  const request = buildProviderRequest(
    { provider: "deepseek", model: "deepseek-v4-pro" },
    "system must return JSON",
    "user",
  );
  assert.equal(request.url, "https://api.deepseek.com/chat/completions");
  assert.deepEqual(request.body.response_format, { type: "json_object" });
  assert.equal(request.body.max_tokens, 1800);
  assert.equal(request.body.stream, false);
});

test("server model configuration defaults to Kimi but can explicitly switch to DeepSeek", () => {
  const inferred = resolveServerModelConfiguration({ MOONSHOT_API_KEY: "moonshot-key" });
  assert.equal(inferred.provider, "kimi");
  assert.equal(inferred.model, "kimi-k2.6");

  const explicit = resolveServerModelConfiguration({
    AI_PROVIDER: "deepseek",
    MOONSHOT_API_KEY: "moonshot-key",
    DEEPSEEK_API_KEY: "deepseek-key",
  });
  assert.equal(explicit.provider, "deepseek");
  assert.equal(explicit.model, "deepseek-v4-pro");
});

test("dialogue localization keeps turn structure while switching visible speech to Chinese", async () => {
  const request = parseDialogueLocalizationRequest({
    targetLanguage: "zh",
    turns: [{
      turn_id: "turn-localize",
      speaker_id: "alan-turing",
      reply_to_claim: "The user asks whether AI will replace people.",
      speech_segments: [
        "Do not ask whether every job disappears at once.",
        "Pick one task and observe what the machine can do, what still needs judgment, and who decides the goal.",
      ],
      evidence_supports: ["Uses an observable test instead of a broad prediction."],
      uncertainty: "My direct experience ends in 1954, so this is a method rather than a report about current AI.",
      unresolved_tension: "A machine may change a task without deciding how the gains are shared.",
    }],
  });
  assert.ok(request);
  const translated = {
    turns: [{
      turn_id: "turn-localize",
      reply_to_claim: "用户在问，AI 会不会取代人类。",
      speech_segments: [
        "别急着问所有工作会不会一起消失。",
        "先挑一项具体任务，看看机器能做什么、哪里仍需人的判断，以及目标究竟由谁来定。",
      ],
      evidence_supports: ["把笼统的预测改成一次可以观察的检验。"],
      uncertainty: "我的直接经验止于 1954 年，所以这里只能提供一种判断方法，不能替你描述今天的 AI。",
      unresolved_tension: "机器可以改变任务，但它不会替我们决定成果该怎样分配。",
    }],
  };
  const fetcher: typeof fetch = async () => Response.json({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(translated) } }],
  });
  const result = await localizeDialogueText(request, {
    provider: "kimi",
    apiKey: "test-key",
    model: "test-model",
    fetcher,
  });
  assert.equal(result[0].turn_id, "turn-localize");
  assert.equal(result[0].speech_segments.length, 2);
  assert.match(result[0].speech_segments.join(""), /[\u3400-\u9fff]/);
});

test("localization provider request uses a strict structure and asks for natural Chinese", () => {
  const request = parseDialogueLocalizationRequest({
    targetLanguage: "zh",
    turns: [{
      turn_id: "turn-localize-request",
      speaker_id: "alan-turing",
      reply_to_claim: "The user asks a question.",
      speech_segments: ["Let us test one part of it first."],
      evidence_supports: [],
      uncertainty: "",
      unresolved_tension: "Who chooses the test?",
    }],
  });
  assert.ok(request);
  const providerRequest = buildLocalizationProviderRequest({ provider: "kimi", model: "kimi-k2.6" }, request);
  const body = providerRequest.body as { messages: Array<{ content: string }>; response_format: { type: string; json_schema: { strict: boolean } } };
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  assert.match(body.messages[0].content, /natural, contemporary Simplified Chinese/);
  assert.match(body.messages[0].content, /do not produce word-for-word English-shaped Chinese/i);
});

test("generation retries one rejected semantic answer, then returns the valid turn", async () => {
  const { turn } = makeValidModernTurn("turn-retry");
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    const output = calls === 1 ? { ...turn, speaker_id: "zhuangzi" } : turn;
    return Response.json({ output_text: JSON.stringify(output) });
  };

  const result = await generateDialogueTurn(modernRequest, "turn-retry", {
    apiKey: "test-key",
    model: "test-model",
    fetcher,
  });
  assert.equal(result.turn.speaker_id, "alan-turing");
  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
});

test("generation can split one overlong model paragraph into readable nearby bubbles", async () => {
  const { turn } = makeValidModernTurn("turn-split-bubble");
  const longEvidenceBubble = "把含混的问题改成一次可以观察的比较，这条材料只支持我们检验机器表现与判断标准之间的关系。它不能替今天的人预测行业前途，也不能证明某种职业一定适合谁；它只提醒我们先设计一个允许失败、能够复盘的小实验，再决定是否继续投入。";
  const fetcher: typeof fetch = async () => Response.json({
    output_text: JSON.stringify({ ...turn, speech_segments: [turn.speech_segments[0], "先把材料放到桌上。", longEvidenceBubble] }),
  });

  const result = await generateDialogueTurn(modernRequest, "turn-split-bubble", {
    apiKey: "test-key",
    model: "test-model",
    fetcher,
  });
  assert.equal(result.attempts, 1);
  assert.equal(result.turn.speech_segments.length, 3);
  assert.ok(result.turn.speech_segments.every((segment) => Array.from(segment).length <= 88));
});

test("English generation turns one complete paragraph into visual speech bubbles", async () => {
  const request: DialogueRequest = { ...modernRequest, question: "Does technology make us freer?", language: "en" };
  const selection = selectNextSpeaker(request);
  const bundle = buildDialoguePrompts(request, selection, "turn-english-paragraph");
  const historical = bundle.evidence.find((record) => record.status !== "speculative");
  const speculative = bundle.evidence.find((record) => record.status === "speculative");
  assert.ok(historical);
  assert.ok(speculative);
  const modelTurn = {
    turn_id: "turn-english-paragraph",
    speaker_id: selection.speakerId,
    reply_to: { turn_id: null, speaker_id: "user", claim: "The user asks whether technology makes us freer." },
    action_type: selection.allowedActions[0],
    speech_segments: [
      "Freedom is too broad to test all at once. Pick one tool and ask what it lets you do that you could not do before. Then ask what you must give up in return. For seven days, record one choice the tool opens and one choice it quietly closes. If leaving the tool costs you your work, your contacts, or your confidence, that cost belongs in the answer too.",
    ],
    evidence_uses: [
      { evidence_id: historical.id, use_type: "paraphrase", supports: "Uses an observable test instead of a vague claim." },
      { evidence_id: speculative.id, use_type: "inference", supports: "Applies that method carefully to a modern tool." },
    ],
    epistemic_status: "grounded_with_inference",
    uncertainty: "My firsthand experience ends in 1954, so this is a method rather than a report about current technology.",
    unresolved_tension: "A tool may add choices while making it harder to leave.",
    suggested_next_speakers: [],
  };
  const fetcher: typeof fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(modelTurn) } }] });
  const result = await generateDialogueTurn(request, "turn-english-paragraph", {
    provider: "kimi",
    apiKey: "test-key",
    model: "test-model",
    fetcher,
  });
  assert.ok(result.turn.speech_segments.length >= 2 && result.turn.speech_segments.length <= 6);
  assert.ok(result.turn.speech_segments.every((segment) => /[.!?]$/.test(segment)));
});

test("validator rejects a bubble that stops in the middle of a phrase", () => {
  const { turn } = makeValidModernTurn("turn-incomplete-bubble");
  const incomplete = {
    ...turn,
    speech_segments: [turn.speech_segments[0], "这只能说明规则如何被设计。", "但不能倒"],
  };
  const selection = selectNextSpeaker(modernRequest);
  const bundle = buildDialoguePrompts(modernRequest, selection, "turn-incomplete-bubble");
  const result = validateDialogueTurn(incomplete, modernRequest, bundle);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("speech segment appears incomplete"));
});

test("validator rejects translation-like Chinese and artificial archaic English", () => {
  const { turn, bundle } = makeValidModernTurn("turn-plain-language");
  const translatedEssay = {
    ...turn,
    speech_segments: [
      "这并非选择多少的问题，而是主体性如何被技术重新界定的问题。",
      "某种意义上，这意味着自由可以被理解为一种结构性的能动性。",
    ],
  };
  const translatedResult = validateDialogueTurn(translatedEssay, modernRequest, bundle);
  assert.equal(translatedResult.ok, false);
  assert.ok(translatedResult.errors.includes("Chinese speech sounds too much like a translated essay"));

  const englishRequest: DialogueRequest = { ...modernRequest, question: "Does technology make us freer?", language: "en" };
  const selection = selectNextSpeaker(englishRequest);
  const englishBundle = buildDialoguePrompts(englishRequest, selection, "turn-archaic");
  const archaic = {
    ...turn,
    turn_id: "turn-archaic",
    speech_segments: ["Thou may call this freedom, but thy test is still unclear.", "Let us try one small, observable choice instead."],
  };
  const archaicResult = validateDialogueTurn(archaic, englishRequest, englishBundle);
  assert.equal(archaicResult.ok, false);
  assert.ok(archaicResult.errors.includes("English speech uses artificial archaic language"));
});

test("English validation rejects mixed-language output and first-person death phrasing", () => {
  const { turn } = makeValidModernTurn("turn-language-purity-base");
  const request: DialogueRequest = { ...modernRequest, question: "Does technology make us freer?", language: "en" };
  const selection = selectNextSpeaker(request);
  const bundle = buildDialoguePrompts(request, selection, "turn-language-purity");
  const mixed = {
    ...turn,
    turn_id: "turn-language-purity",
    reply_to: { turn_id: null, speaker_id: "user", claim: "Does technology make us freer?" },
    speech_segments: ["Freer than what, and how would we check?", "Pick one ordinary task and record what the machine did, then ask 谁 chose the goal."],
    evidence_uses: turn.evidence_uses.map((use) => ({ ...use, supports: "Supports one observable test of freedom" })),
    uncertainty: "I died in 1954, so I did not see modern AI.",
    unresolved_tension: "Convenience may hide who set the available choices.",
  };
  const result = validateDialogueTurn(mixed, request, bundle);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("English speech contains Chinese characters"));
  assert.ok(result.errors.includes("uncertainty uses a jarring first-person death statement"));
});

test("English validation rejects bubbles cut off inside a word or Markdown marker", () => {
  const { turn } = makeValidModernTurn("turn-cutoff-base");
  const request: DialogueRequest = { ...modernRequest, question: "Does technology make us freer?", language: "en" };
  const selection = selectNextSpeaker(request);
  const bundle = buildDialoguePrompts(request, selection, "turn-cutoff");
  const cutoff = {
    ...turn,
    turn_id: "turn-cutoff",
    reply_to: { turn_id: null, speaker_id: "user", claim: "Does technology make us freer?" },
    speech_segments: ["Freer to do what, and how would we check?", "I replaced a vague question with a game whose rules you *"],
    evidence_uses: turn.evidence_uses.map((use) => ({ ...use, supports: "Supports one observable test" })),
    uncertainty: "My firsthand experience ends in 1954, so this is only a method.",
    unresolved_tension: "A measurable choice may still hide who designed the options.",
  };
  const result = validateDialogueTurn(cutoff, request, bundle);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("speech segment appears incomplete"));
  assert.ok(result.errors.includes("speech segment contains Markdown formatting"));
  assert.ok(result.errors.includes("speech segment must end as a complete sentence"));
});

test("Kimi chat completion output passes through the same evidence validator", async () => {
  const { turn } = makeValidModernTurn("turn-kimi");
  const fetcher: typeof fetch = async (_input, init) => {
    const requestBody = JSON.parse(String(init?.body));
    assert.equal(requestBody.response_format.type, "json_schema");
    return Response.json({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(turn) } }],
    });
  };

  const result = await generateDialogueTurn(modernRequest, "turn-kimi", {
    provider: "kimi",
    apiKey: "test-key",
    model: "kimi-k2.6",
    fetcher,
  });
  assert.equal(result.provider, "kimi");
  assert.equal(result.turn.speaker_id, "alan-turing");
});

test("generation removes uninvited next-speaker hints without changing the speech", async () => {
  const { turn } = makeValidModernTurn("turn-sanitize-next");
  const withUninvitedHint = {
    ...turn,
    suggested_next_speakers: ["person-not-at-the-table", "audre-lorde"],
  };
  const fetcher: typeof fetch = async () => Response.json({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(withUninvitedHint) } }],
  });

  const result = await generateDialogueTurn(modernRequest, "turn-sanitize-next", {
    provider: "kimi",
    apiKey: "test-key",
    model: "kimi-k2.6",
    fetcher,
  });
  assert.deepEqual(result.turn.suggested_next_speakers, ["audre-lorde"]);
  assert.deepEqual(result.turn.speech_segments, turn.speech_segments);
  assert.equal(result.attempts, 1);
});

test("DeepSeek empty JSON-mode response is retried once before display", async () => {
  const { turn } = makeValidModernTurn("turn-deepseek");
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return Response.json({
      choices: [{
        finish_reason: "stop",
        message: { content: calls === 1 ? "" : JSON.stringify(turn) },
      }],
    });
  };

  const result = await generateDialogueTurn(modernRequest, "turn-deepseek", {
    provider: "deepseek",
    apiKey: "test-key",
    model: "deepseek-v4-pro",
    fetcher,
  });
  assert.equal(result.provider, "deepseek");
  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
});

test("missing model configuration fails transparently without canned persona text", async () => {
  await assert.rejects(
    () => generateDialogueTurn(modernRequest, "turn-no-model", {}),
    (error: unknown) => error instanceof DialogueGenerationError && error.code === "MODEL_NOT_CONFIGURED",
  );
});
