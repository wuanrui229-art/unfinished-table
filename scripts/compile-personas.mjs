import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const sourceRoot = path.resolve(projectRoot, "../unfinished-table-design/personas");
const outputPath = path.resolve(projectRoot, "app/lib/dialogue/persona-runtime.json");

const profileConfig = {
  zhuangzi: {
    personaMode: "historical_interpretation",
    sourceUpdatedAt: "2026-08-16",
    displayName: "庄子",
    originalName: "莊子",
    discussionRole: "换尺度者",
    keywords: ["尺度", "成功", "能力", "自由", "选择", "焦虑", "比较", "有用", "无用", "身份", "不确定", "工作", "职业"],
    preferredActions: ["reframe", "challenge", "ask_back"],
    anchorEvidenceIds: ["ev-001", "ev-002", "ev-003"],
    contemporaryEvidenceIds: ["ev-012"],
  },
  "audre-lorde": {
    personaMode: "historical_interpretation",
    sourceUpdatedAt: "2026-08-16",
    displayName: "奥德丽·洛德",
    originalName: "Audre Lorde",
    discussionRole: "权力与差异的追问者",
    keywords: ["权力", "身份", "差异", "女性", "沉默", "发声", "公平", "愤怒", "恐惧", "偏见", "招聘", "标准", "身体"],
    preferredActions: ["challenge", "contextualize", "agree_extend"],
    anchorEvidenceIds: ["ev-001", "ev-003", "ev-004"],
    contemporaryEvidenceIds: ["ev-012"],
  },
  "rabindranath-tagore": {
    personaMode: "historical_interpretation",
    sourceUpdatedAt: "2026-08-16",
    displayName: "拉宾德拉纳特·泰戈尔",
    originalName: "Rabindranath Tagore",
    discussionRole: "教育与关系的拓宽者",
    keywords: ["教育", "学习", "自由", "创造", "民族", "国家", "学校", "成长", "诗", "人类", "机器", "技术", "关系"],
    preferredActions: ["reframe", "agree_extend", "contextualize"],
    anchorEvidenceIds: ["ev-001", "ev-002", "ev-004"],
    contemporaryEvidenceIds: ["ev-012"],
  },
  "alan-turing": {
    personaMode: "historical_interpretation",
    sourceUpdatedAt: "2026-08-16",
    displayName: "艾伦·图灵",
    originalName: "Alan Turing",
    discussionRole: "把问题变成可检验命题的人",
    keywords: ["AI", "人工智能", "机器", "算法", "测试", "证据", "产品", "技术", "计算", "智能", "能力", "验证", "学习"],
    preferredActions: ["concretize", "challenge", "agree_extend"],
    anchorEvidenceIds: ["ev-001", "ev-002", "ev-003", "ev-004"],
    contemporaryEvidenceIds: ["ev-012"],
  },
  "ibn-khaldun": {
    personaMode: "historical_interpretation",
    sourceUpdatedAt: "2026-08-16",
    displayName: "伊本·赫勒敦",
    originalName: "Ibn Khaldun",
    discussionRole: "制度与群体结构的观察者",
    keywords: ["社会", "制度", "组织", "群体", "权力", "平台", "经济", "历史", "职业", "公司", "竞争", "周期", "共同体"],
    preferredActions: ["contextualize", "challenge", "concretize"],
    anchorEvidenceIds: ["ev-001", "ev-002", "ev-003"],
    contemporaryEvidenceIds: ["ev-012"],
  },
  "wangari-maathai": {
    personaMode: "historical_interpretation",
    sourceUpdatedAt: "2026-08-16",
    displayName: "旺加里·马塔伊",
    originalName: "Wangari Maathai",
    discussionRole: "把抽象问题带回行动的人",
    keywords: ["行动", "环境", "生态", "树", "社区", "民主", "女性", "土地", "气候", "实践", "第一步", "组织", "未来"],
    preferredActions: ["concretize", "agree_extend", "ask_back"],
    anchorEvidenceIds: ["ev-001", "ev-002", "ev-003"],
    contemporaryEvidenceIds: ["ev-012"],
  },
  "elon-musk": {
    personaMode: "living_public_view",
    sourceUpdatedAt: "2026-08-20",
    displayName: "埃隆·马斯克",
    originalName: "Elon Musk",
    discussionRole: "把愿景推到工程规模，也接受风险追问的建设者",
    keywords: ["AI", "人工智能", "机器人", "自动驾驶", "就业", "工作", "风险", "安全", "规模", "制造", "资本", "部署", "创业", "未来", "技术", "产品"],
    preferredActions: ["concretize", "challenge", "reframe", "agree_extend"],
    anchorEvidenceIds: ["ev-001", "ev-003", "ev-005", "ev-007"],
    contemporaryEvidenceIds: ["ev-001", "ev-002", "ev-003", "ev-004", "ev-005", "ev-007", "ev-009", "ev-011"],
  },
  "fei-fei-li": {
    personaMode: "living_public_view",
    sourceUpdatedAt: "2026-08-20",
    displayName: "李飞飞",
    originalName: "Fei-Fei Li",
    discussionRole: "把 AI 能力放回人的能动性、数据劳动和真实世界的研究者",
    keywords: ["AI", "人工智能", "视觉", "数据", "标注", "教育", "医疗", "空间智能", "世界模型", "能动性", "公共研究", "治理", "工作", "学习"],
    preferredActions: ["reframe", "agree_extend", "concretize", "ask_back"],
    anchorEvidenceIds: ["ev-001", "ev-002", "ev-003", "ev-004"],
    contemporaryEvidenceIds: ["ev-003", "ev-005", "ev-006", "ev-007", "ev-008"],
  },
  "kai-fu-lee": {
    personaMode: "living_public_view",
    sourceUpdatedAt: "2026-08-20",
    displayName: "李开复",
    originalName: "Kai-Fu Lee",
    discussionRole: "拆开产业落地、任务替代与人的关系能力的观察者",
    keywords: ["AI", "人工智能", "就业", "工作", "任务", "产业", "商业", "中国", "创业", "转型", "教育", "关系", "同理心", "部署"],
    preferredActions: ["concretize", "contextualize", "agree_extend", "challenge"],
    anchorEvidenceIds: ["ev-001", "ev-002", "ev-003", "ev-004"],
    contemporaryEvidenceIds: ["ev-001", "ev-003", "ev-005", "ev-006", "ev-007", "ev-008"],
  },
  "geoffrey-hinton": {
    personaMode: "living_public_view",
    sourceUpdatedAt: "2026-08-20",
    displayName: "杰弗里·辛顿",
    originalName: "Geoffrey Hinton",
    discussionRole: "区分神经网络能力、当前扰动与长期控制风险的研究者",
    keywords: ["AI", "人工智能", "神经网络", "深度学习", "理解", "风险", "安全", "控制", "就业", "工作", "模型", "能力", "未来"],
    preferredActions: ["challenge", "contextualize", "admit_limit", "reframe"],
    anchorEvidenceIds: ["ev-001", "ev-002", "ev-003", "ev-004"],
    contemporaryEvidenceIds: ["ev-002", "ev-003", "ev-004", "ev-005", "ev-007", "ev-008"],
  },
  "timnit-gebru": {
    personaMode: "living_public_view",
    sourceUpdatedAt: "2026-08-20",
    displayName: "蒂姆尼特·格布鲁",
    originalName: "Timnit Gebru",
    discussionRole: "把 AI 问题落到数据、劳动、受影响群体与机构权力的研究者",
    keywords: ["AI", "人工智能", "数据", "偏见", "公平", "权力", "劳动", "社区", "伤害", "平台", "监控", "问责", "大模型", "伦理", "工作"],
    preferredActions: ["challenge", "contextualize", "concretize", "ask_back"],
    anchorEvidenceIds: ["ev-001", "ev-002", "ev-003", "ev-006"],
    contemporaryEvidenceIds: ["ev-001", "ev-002", "ev-003", "ev-004", "ev-005", "ev-006", "ev-007", "ev-009"],
  },
};

function parseScalar(raw) {
  const value = raw.trim();
  if (!value) return "";
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  if (value.startsWith("[") && value.endsWith("]")) {
    const inside = value.slice(1, -1).trim();
    return inside ? inside.split(",").map((item) => item.trim().replace(/^['"]|['"]$/g, "")) : [];
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  return value;
}

function parseFlatRecordList(source) {
  const records = [];
  let current = null;

  for (const line of source.split(/\r?\n/)) {
    const start = line.match(/^- id:\s*(.+)$/);
    if (start) {
      if (current) records.push(current);
      current = { id: parseScalar(start[1]) };
      continue;
    }

    const field = line.match(/^ {2}([a-zA-Z0-9_]+):\s*(.*)$/);
    if (field && current) current[field[1]] = parseScalar(field[2]);
  }

  if (current) records.push(current);
  return records;
}

const sourceDirectories = (await readdir(sourceRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && profileConfig[entry.name])
  .map((entry) => entry.name);

const profiles = [];
for (const id of Object.keys(profileConfig)) {
  if (!sourceDirectories.includes(id)) throw new Error(`Persona source missing: ${id}`);

  const personaDir = path.join(sourceRoot, id);
  const [personaMarkdown, evidenceSource, relationsSource] = await Promise.all([
    readFile(path.join(personaDir, "persona.md"), "utf8"),
    readFile(path.join(personaDir, "evidence.yaml"), "utf8"),
    readFile(path.join(personaDir, "relations.yaml"), "utf8"),
  ]);

  const evidence = parseFlatRecordList(evidenceSource);
  const relations = parseFlatRecordList(relationsSource);
  if (evidence.length < 8) throw new Error(`${id} has too little evidence: ${evidence.length}`);

  profiles.push({
    id,
    ...profileConfig[id],
    personaMarkdown,
    evidence,
    relations,
  });
}

const artifact = {
  schemaVersion: "1.1.0",
  sourceRoot: "../unfinished-table-design/personas",
  profiles,
};

await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(`Compiled ${profiles.length} personas and ${profiles.reduce((sum, profile) => sum + profile.evidence.length, 0)} evidence records.`);
