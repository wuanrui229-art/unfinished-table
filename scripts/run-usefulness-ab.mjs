import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const designRoot = path.resolve(projectRoot, "../unfinished-table-design");
const outputRoot = path.join(designRoot, "behavior-proofs", "live-usefulness-ab-v1");

function parseEnv(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function stripFence(value) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function countCharacters(value) {
  return Array.from(value).length;
}

const environment = parseEnv(await readFile(path.join(projectRoot, ".env.local"), "utf8"));
const apiKey = environment.MOONSHOT_API_KEY;
const model = environment.KIMI_MODEL || "kimi-k2.6";
const baseUrl = (environment.KIMI_BASE_URL || "https://api.moonshot.cn/v1").replace(/\/+$/, "");

if (!apiKey) throw new Error("MOONSHOT_API_KEY is not configured in .env.local");
await mkdir(outputRoot, { recursive: true });

const initialQuestion = "我想做 AI 产品经理，也希望进入一个成长快、薪资和平台都不错的公司。但我的基础和优秀同龄人有差距。我怕拼命准备后勉强进去，能力跟不上，生活被工作吞掉；如果选择压力小的平台，又怕自己在原地蹉跎。我希望工作有创新、持续学习、氛围好、收入不错，也能保持生活。我到底应该怎样判断自己现在该冲更高的平台，还是先去一个更适合当前能力的位置？";
const userFollowups = [
  "可现实里公司可能只看我能不能更快交付，不会花时间看我有没有更深的判断力。",
  "但如果我连门槛都进不去，先谈长期想成为什么样的人，会不会太理想化？",
];

const personaIds = ["zhuangzi", "alan-turing", "fei-fei-li", "timnit-gebru"];
const displayNames = {
  zhuangzi: "《庄子》文本视角",
  "alan-turing": "艾伦·图灵",
  "fei-fei-li": "李飞飞",
  "timnit-gebru": "蒂姆尼特·格布鲁",
};

const personaPackets = [];
for (const personaId of personaIds) {
  const personaRoot = path.join(designRoot, "personas", personaId);
  const [reasoning, persona] = await Promise.all([
    readFile(path.join(personaRoot, "reasoning.yaml"), "utf8"),
    readFile(path.join(personaRoot, "persona.md"), "utf8"),
  ]);
  personaPackets.push({ personaId, reasoning, persona });
}

const callRecords = [];

async function callKimi(label, messages, options = {}) {
  const startedAt = Date.now();
  const body = {
    model,
    messages,
    stream: false,
    thinking: { type: "disabled" },
    max_completion_tokens: options.maxTokens || 1500,
  };
  if (options.responseFormat) body.response_format = options.responseFormat;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const raw = await response.json();
  if (!response.ok) {
    const message = raw?.error?.message || `HTTP ${response.status}`;
    throw new Error(`${label} failed: ${message}`);
  }
  const text = raw?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error(`${label} returned empty content`);
  const record = {
    label,
    latencyMs: Date.now() - startedAt,
    completionCharacters: countCharacters(text),
    finishReason: raw?.choices?.[0]?.finish_reason || null,
    usage: raw?.usage || null,
  };
  callRecords.push(record);
  await writeFile(path.join(outputRoot, `raw-${label}.txt`), text.trim(), "utf8");
  process.stdout.write(`completed ${label} in ${record.latencyMs}ms\n`);
  return text.trim();
}

const baselineSystem = `你是一个非常优秀、自然、诚实的中文思考伙伴。用户带来的是一个反复想过仍没有想明白的问题，不是来索取鸡汤或标准答案。

你的任务：
- 先准确抓住用户真正卡住的冲突，不只复述表面问题；
- 可以质疑用户的前提、区分事实和预测、提出反例，也可以给出可观察的小行动；
- 认真记住用户后续的反驳，新回答必须因此发生变化；
- 不讨好，不故作高深，不使用论文腔或模板化标题；
- 每次只推进一到两个真正重要的点，用自然口语中文写 260–360 个汉字；
- 把用户当讨论者，不替用户宣布最终选择；在自然处留下一个值得用户继续回答的问题。

你可以使用你已有的一般知识，但不要扮演任何历史或公众人物。`;

const baselineMessages = [{ role: "system", content: baselineSystem }];
const baselineTurns = [];

baselineMessages.push({ role: "user", content: initialQuestion });
const baselineFirst = await callKimi("baseline-1", baselineMessages, { maxTokens: 1200 });
baselineTurns.push({ role: "assistant", text: baselineFirst });
baselineMessages.push({ role: "assistant", content: baselineFirst });

for (const [index, followup] of userFollowups.entries()) {
  baselineTurns.push({ role: "user", text: followup });
  baselineMessages.push({ role: "user", content: followup });
  const response = await callKimi(`baseline-${index + 2}`, baselineMessages, { maxTokens: 1200 });
  baselineTurns.push({ role: "assistant", text: response });
  baselineMessages.push({ role: "assistant", content: response });
}

const roundtableSchema = {
  type: "json_schema",
  json_schema: {
    name: "usefulness_roundtable_turn",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        speaker_id: { type: "string", enum: personaIds },
        reply_to: { type: "string" },
        bubbles: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: { type: "string" },
        },
        why_this_speaker: { type: "string" },
        new_contribution: { type: "string" },
        state: {
          type: "object",
          additionalProperties: false,
          properties: {
            user_position: { type: "string" },
            hidden_assumption: { type: "string" },
            live_tension: { type: "string" },
            evidence_needed: { type: "string" },
            possible_experiment: { type: "string" },
          },
          required: ["user_position", "hidden_assumption", "live_tension", "evidence_needed", "possible_experiment"],
        },
      },
      required: ["speaker_id", "reply_to", "bubbles", "why_this_speaker", "new_contribution", "state"],
    },
  },
};

const roundtableSystem = `你是“未竟之桌”的对话导演。用户是桌上的讨论者，不是观看名人表演的观众。你的任务不是让每个人轮流发言，而是每次只选对当前问题有最大新增贡献的一位；同一人可以再次发言，没有新贡献的人必须沉默。

每轮必须做到：
1. 先接住用户或上一位的具体主张；
2. 使用被选人物有资料依据的思考方法；
3. 增加新的区别、反例、后果、事实需求或行动，不能复述；
4. 保留必要分歧，不把几种思想强行总结成共识；
5. 用户一旦补充或反驳，下一轮必须优先响应用户，原先可能的讲稿作废；
6. 2–4 个连续气泡，共 190–310 个汉字。气泡要形成完整推理，不为短而短；
7. 原生、清楚、自然的现代中文。没有读过原著的人也能听懂；
8. 人物辨识度来自怎样思考，不来自名言、古腔、口头禅或生平表演；
9. 本测试不使用史实、原话或人物经历。不要引经据典，不要冒充人物对现代行业的事实判断；
10. 在世人物只转译公开观点，历史人物只迁移有依据的方法；所有文字都是产品演绎。
11. 输出 JSON 的任何字符串内部都不要使用英文半角双引号；需要标出概念时使用中文书名号或直角引号。

选择人物时检查：删掉这轮以后，当前问题是否会失去一个关键假设、分歧、反例或行动？如果不会，换一个人物或推进方式。

四份人物资料如下：
${personaPackets.map((packet) => `\n===== ${packet.personaId} REASONING =====\n${packet.reasoning}\n===== ${packet.personaId} PERSONA =====\n${packet.persona}`).join("\n")}`;

const roundtableMessages = [{ role: "system", content: roundtableSystem }];
const roundtableTurns = [];

async function generateRoundtableTurn(label, instruction) {
  roundtableMessages.push({ role: "user", content: instruction });
  const raw = await callKimi(label, roundtableMessages, {
    maxTokens: 1500,
    responseFormat: roundtableSchema,
  });
  let turn;
  try {
    turn = JSON.parse(stripFence(raw));
  } catch (firstError) {
    const repairedRaw = await callKimi(`${label}-repair`, [
      {
        role: "system",
        content: "你只修复 JSON 语法，不增删或改写内容。返回严格合法的 JSON；字符串内部的英文双引号改为中文直角引号，换行正确转义，不要添加代码围栏或解释。",
      },
      { role: "user", content: raw },
    ], { maxTokens: 1800, responseFormat: roundtableSchema });
    try {
      turn = JSON.parse(stripFence(repairedRaw));
    } catch (repairError) {
      throw new Error(`${label} JSON repair failed: ${repairError.message}; original error: ${firstError.message}`);
    }
  }
  if (!personaIds.includes(turn.speaker_id) || !Array.isArray(turn.bubbles)) {
    throw new Error(`${label} returned an invalid roundtable turn`);
  }
  roundtableTurns.push(turn);
  roundtableMessages.push({
    role: "assistant",
    content: `${displayNames[turn.speaker_id]}：${turn.bubbles.join("\n")}\n当前问题状态：${JSON.stringify(turn.state)}`,
  });
  await writeFile(path.join(outputRoot, "generation-progress.json"), JSON.stringify({
    model,
    initialQuestion,
    userFollowups,
    baselineTurns,
    roundtableTurns,
    callRecords,
  }, null, 2), "utf8");
  return turn;
}

await generateRoundtableTurn("roundtable-1", `用户把这个问题带到桌上：${initialQuestion}\n请选择最有边际贡献的人先回应。`);
await generateRoundtableTurn("roundtable-2", "用户暂时没有插话。请让另一位真正能质疑或推进上一位的人接话；如果只是换一种说法，不要让他发言。");

roundtableTurns.push({ role: "user", text: userFollowups[0] });
await generateRoundtableTurn("roundtable-3", `用户刚刚反驳：${userFollowups[0]}\n忽略原先可能的顺序，选择最适合直接回应这句话的人。`);

roundtableTurns.push({ role: "user", text: userFollowups[1] });
await generateRoundtableTurn("roundtable-4", `用户继续提出：${userFollowups[1]}\n先回应这个现实质疑，再把一个仍由用户决定的问题交还给他；不要替全桌宣布共识。`);

function visibleRoundtableTranscript() {
  return roundtableTurns.map((turn) => {
    if (turn.role === "user") return `**你：** ${turn.text}`;
    return `**${displayNames[turn.speaker_id]}：**\n\n${turn.bubbles.map((bubble) => `> ${bubble}`).join("\n>\n")}`;
  }).join("\n\n");
}

function visibleBaselineTranscript() {
  const blocks = [`**你：** ${initialQuestion}`];
  for (const turn of baselineTurns) {
    blocks.push(turn.role === "user" ? `**你：** ${turn.text}` : `**思考伙伴：**\n\n${turn.text}`);
  }
  return blocks.join("\n\n");
}

const baselineTranscript = visibleBaselineTranscript();
const roundtableTranscript = `**你：** ${initialQuestion}\n\n${visibleRoundtableTranscript()}`;
const baselineFirstInBlindFile = Math.random() < 0.5;
const versionA = baselineFirstInBlindFile ? baselineTranscript : roundtableTranscript;
const versionB = baselineFirstInBlindFile ? roundtableTranscript : baselineTranscript;
const mapping = baselineFirstInBlindFile
  ? { "版本甲": "普通大模型", "版本乙": "未竟之桌" }
  : { "版本甲": "未竟之桌", "版本乙": "普通大模型" };

const blindMarkdown = `# 有用性盲测｜版本甲与版本乙

> 两个版本使用同一个 Kimi 模型、同一份用户背景和相近的输出预算。
> 请先不要寻找“哪一个是产品”。只判断哪一种讨论真正帮助你把问题想得更清楚。

## 请先记下四个判断

1. 哪个版本更抓住你真正卡住的地方？
2. 哪个版本带来了你原来没有想到的重要角度？
3. 哪个版本让你更想继续说下去？
4. 各找一段“删掉也不影响收获”的文字。

---

## 版本甲

${versionA}

---

## 版本乙

${versionB}

---

读完后请只回复：更愿意继续甲、乙，或者平局；再说一句真正改变你理解的话，以及一段可以删掉的话。
`;

await writeFile(path.join(outputRoot, "blind-comparison.md"), blindMarkdown, "utf8");

const judgeSchema = {
  type: "json_schema",
  json_schema: {
    name: "usefulness_comparison_judgment",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        winner: { type: "string", enum: ["版本甲", "版本乙", "平局"] },
        scores: {
          type: "object",
          additionalProperties: false,
          properties: {
            version_a_problem_recognition: { type: "integer", minimum: 1, maximum: 5 },
            version_b_problem_recognition: { type: "integer", minimum: 1, maximum: 5 },
            version_a_new_perspective: { type: "integer", minimum: 1, maximum: 5 },
            version_b_new_perspective: { type: "integer", minimum: 1, maximum: 5 },
            version_a_thinking_progress: { type: "integer", minimum: 1, maximum: 5 },
            version_b_thinking_progress: { type: "integer", minimum: 1, maximum: 5 },
            version_a_actionability: { type: "integer", minimum: 1, maximum: 5 },
            version_b_actionability: { type: "integer", minimum: 1, maximum: 5 },
            version_a_clarity: { type: "integer", minimum: 1, maximum: 5 },
            version_b_clarity: { type: "integer", minimum: 1, maximum: 5 },
          },
          required: [
            "version_a_problem_recognition", "version_b_problem_recognition",
            "version_a_new_perspective", "version_b_new_perspective",
            "version_a_thinking_progress", "version_b_thinking_progress",
            "version_a_actionability", "version_b_actionability",
            "version_a_clarity", "version_b_clarity"
          ],
        },
        reasons: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
        version_a_deletable: { type: "string" },
        version_b_deletable: { type: "string" },
        caution: { type: "string" },
      },
      required: ["winner", "scores", "reasons", "version_a_deletable", "version_b_deletable", "caution"],
    },
  },
};

const judgeSystem = `你是严格的对话产品评审。下面两个版本使用同一底层模型和同一用户问题。不要因为多人形式、人物姓名、篇幅或文风本身加分，只判断哪一个更帮助用户推进真实问题。

评分重点：是否识别真问题、带来不可替换的新视角、让用户后续发言真正改变讨论、形成可行动的观察，同时保持自然清楚。指出可以删除而不损失价值的部分。你只是辅助评审，不能代替真实用户判断。`;
const judgeRaw = await callKimi("model-judge", [
  { role: "system", content: judgeSystem },
  { role: "user", content: `版本甲：\n${versionA}\n\n版本乙：\n${versionB}` },
], { maxTokens: 1200 });
const judge = judgeRaw;

const privateReport = `# 有用性 A/B 首次真实生成记录

> 这是内部评测记录；模型评审不能替代用户判断。

## 运行信息

- 时间：${new Date().toISOString()}
- 模型：${model}
- 映射：${JSON.stringify(mapping)}
- 初始问题字符数：${countCharacters(initialQuestion)}
- 普通大模型输出字符数：${countCharacters(baselineTranscript)}
- 未竟之桌输出字符数：${countCharacters(roundtableTranscript)}

## 模型辅助评审

${judge}

## 调用记录

${callRecords.map((record) => `- ${record.label}: ${record.latencyMs}ms；${record.completionCharacters} 字符；finish=${record.finishReason}`).join("\n")}

## 未竟之桌内部边际贡献

${roundtableTurns.filter((turn) => !turn.role).map((turn) => `- ${displayNames[turn.speaker_id]}：${turn.new_contribution}（选择原因：${turn.why_this_speaker}）`).join("\n")}

## 边界

- 单次问题、单次采样，不能证明稳定性。
- 评审模型与生成模型相同，可能存在偏好与自洽偏差。
- 真实价值门槛仍需要用户盲评和后续 6–8 人测试。
`;

await Promise.all([
  writeFile(path.join(outputRoot, "internal-report.md"), privateReport, "utf8"),
  writeFile(path.join(outputRoot, "raw-results.json"), JSON.stringify({
    model,
    mapping,
    initialQuestion,
    userFollowups,
    baselineTurns,
    roundtableTurns,
    judge,
    callRecords,
  }, null, 2), "utf8"),
]);

process.stdout.write(`saved blind comparison and internal report to ${outputRoot}\n`);
