"use client";

import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Skeleton from "react-loading-skeleton";
import { stripInternalEvidenceIds } from "@/app/lib/dialogue/presentation";
import { canShiftDiscussionLens, nextDiscussionLens } from "@/app/lib/dialogue/session";
import {
  CITATION_KIND_LABELS,
  DEFAULT_QUESTIONS,
  RELATION_LABELS,
  SOURCE_STATUS_LABELS,
  UI_COPY,
  type Locale,
} from "@/app/lib/i18n";

type View = "welcome" | "select" | "table" | "map";
type Relation = "界定" | "赞同·补充" | "质疑" | "转向" | "承认未知";
type SourceStatus = "思想转译" | "公开观点" | "当代推演" | "边界说明";

type Figure = {
  id: string;
  name: string;
  nativeName: string;
  years: string;
  role: string;
  greeting: string;
  notices: string;
  challenges: string;
  color: string;
  facing: "left" | "right";
  nameEn: string;
  yearsEn: string;
  roleEn: string;
  greetingEn: string;
  noticesEn: string;
  challengesEn: string;
  personaMode?: "historical" | "contemporary";
  sceneScale?: number;
  hasEngage?: boolean;
};

type CameraMode = "first-person" | "third-person";

type SeatPreset = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  bubbleX: number;
  bubbleY: number;
  depth: number;
  targetFacing: "left" | "right" | "natural";
  bubbleOpen: "left" | "right" | "center";
};

type MapPosition = {
  x: number;
  y: number;
  rotate: number;
};

type Message = {
  id: string;
  speakerId: string;
  text: string;
  relation: Relation;
  status: SourceStatus;
  sources?: ApiCitation[];
  targetId?: string;
  turn?: ApiTurn;
  stage?: DiscussionStage;
  kind?: "stage" | "object" | "contribution";
  language?: Locale;
  localizedTurns?: Partial<Record<Locale, ApiTurn>>;
};

type ApiCitation = {
  kind: "历史依据" | "公开观点" | "当代推演" | "边界说明";
  title: string;
  creator: string;
  date: string;
  url: string;
  locator: string;
  supports: string;
};

type ApiTurn = {
  turn_id: string;
  speaker_id: string;
  reply_to: { turn_id: string | null; speaker_id: string; claim: string };
  action_type: "reframe" | "agree_extend" | "challenge" | "contextualize" | "concretize" | "admit_limit" | "ask_back";
  speech_segments: string[];
  evidence_uses: Array<{ evidence_id: string; use_type: "paraphrase" | "inference" | "boundary"; supports: string }>;
  epistemic_status: "grounded" | "grounded_with_inference" | "uncertain";
  uncertainty: string;
  unresolved_tension: string;
  suggested_next_speakers: string[];
};

type Topic = "question" | "archive" | "today" | "life" | "unknown";
type DiscussionStage = "define" | "evidence" | "conflict" | "today" | "unfinished";
type FailedRound = { topic: Topic; prompt: string; remaining: number; userContribution?: boolean };
type WaitingPhase = "choosing" | "evidence" | "composing" | "long" | "placing";
type FigureReaction = "preparing" | "following" | "considering" | "affirmed" | "questioned";

type ApiPreparation = {
  speaker_id: string;
  responds_to: string;
  allowed_actions: ApiTurn["action_type"][];
};

type ApiLocalization = {
  turn_id: string;
  reply_to_claim: string;
  speech_segments: string[];
  evidence_supports: string[];
  uncertainty: string;
  unresolved_tension: string;
};

type StageDefinition = {
  id: DiscussionStage;
  label: string;
  objectName: string;
  symbol: string;
  cue: string;
  topic: Topic;
  prompt: string;
  labelEn: string;
  objectNameEn: string;
  cueEn: string;
  promptEn: string;
};

const figures: Figure[] = [
  {
    id: "zhuangzi",
    name: "庄子",
    nativeName: "莊周",
    years: "约前 369—前 286",
    role: "松动问题的人",
    greeting: "幸会。且慢下结论。",
    notices: "我们给自由画下的边界",
    challenges: "会追问马克思：改变处境之后，心是否仍被名目困住？",
    color: "#d9b75f",
    facing: "right",
    nameEn: "Zhuangzi",
    yearsEn: "c. 369–286 BCE",
    roleEn: "Loosens the question",
    greetingEn: "A pleasure. Let’s not rush to a conclusion.",
    noticesEn: "The boundaries we draw around freedom",
    challengesEn: "May ask whether changing our circumstances also frees the mind from the labels that confine it.",
  },
  {
    id: "audre-lorde",
    name: "奥德丽·洛德",
    nativeName: "Audre Lorde",
    years: "1934—1992",
    role: "让差异开口的人",
    greeting: "Good evening. What are we afraid to name?",
    notices: "沉默、差异、愤怒与行动之间的关系",
    challenges: "会追问庄子：当尺度伤害不同身体时，谁承担松动尺度的风险？",
    color: "#a84f6a",
    facing: "right",
    nameEn: "Audre Lorde",
    yearsEn: "1934–1992",
    roleEn: "Makes difference speak",
    greetingEn: "Good evening. What are we afraid to name?",
    noticesEn: "The relation between silence, difference, anger, and action",
    challengesEn: "May ask Zhuangzi who bears the risk when a harmful measure is loosened.",
  },
  {
    id: "rabindranath-tagore",
    name: "拉宾德拉纳特·泰戈尔",
    nativeName: "রবীন্দ্রনাথ ঠাকুর",
    years: "1861—1941",
    role: "拓宽学习与关系",
    greeting: "নমস্কার。先让问题留一点呼吸。",
    notices: "教育、创造、民族与人的完整生长",
    challenges: "会问图灵：可检验的能力之外，人如何在关系中成为自己？",
    color: "#7d6d4f",
    facing: "left",
    nameEn: "Rabindranath Tagore",
    yearsEn: "1861–1941",
    roleEn: "Broadens learning and relation",
    greetingEn: "Greetings. Let the question breathe first.",
    noticesEn: "Education, creativity, nation, and whole human growth",
    challengesEn: "May ask Turing how a person becomes whole in relation, beyond testable ability.",
  },
  {
    id: "alan-turing",
    name: "艾伦·图灵",
    nativeName: "Alan Turing",
    years: "1912—1954",
    role: "把问题变成小测试",
    greeting: "Good evening. Shall we make the question testable?",
    notices: "命题、证据、机器能力与不可判定边界",
    challenges: "会要求庄子把尺度之问改写成一次可观察、也允许失败的尝试。",
    color: "#cf7b4d",
    facing: "left",
    nameEn: "Alan Turing",
    yearsEn: "1912–1954",
    roleEn: "Turns the question into a small test",
    greetingEn: "Good evening. Shall we make the question testable?",
    noticesEn: "Propositions, evidence, machine capability, and undecidable limits",
    challengesEn: "May ask Zhuangzi to turn a question of standards into an observable experiment that is allowed to fail.",
  },
  {
    id: "ibn-khaldun",
    name: "伊本·赫勒敦",
    nativeName: "ابن خلدون",
    years: "1332—1406",
    role: "把个人放回制度",
    greeting: "السلام عليكم。先看看个人之外的结构。",
    notices: "群体团结、权力、劳动与制度兴衰",
    challenges: "会追问洛德：经验中的差异如何进入群体与制度的长期变化？",
    color: "#758aa3",
    facing: "left",
    nameEn: "Ibn Khaldun",
    yearsEn: "1332–1406",
    roleEn: "Returns the individual to institutions",
    greetingEn: "Peace be upon you. Let’s first look at the structure beyond the individual.",
    noticesEn: "Social cohesion, power, labor, and institutional rise and decline",
    challengesEn: "May ask Lorde how differences in lived experience enter long-term institutional change.",
  },
  {
    id: "wangari-maathai",
    name: "旺加里·马塔伊",
    nativeName: "Wangari Maathai",
    years: "1940—2011",
    role: "把问题带回行动",
    greeting: "Karibu. 我们可以先种下第一步。",
    notices: "生态、社区、民主与可持续的实践",
    challenges: "会提醒桌边的人：好问题最终还要落在一件能共同维护的小事上。",
    color: "#5f8275",
    facing: "left",
    nameEn: "Wangari Maathai",
    yearsEn: "1940–2011",
    roleEn: "Brings the question back to action",
    greetingEn: "Welcome. We can begin by planting one small step.",
    noticesEn: "Ecology, community, democracy, and sustainable practice",
    challengesEn: "May remind the table that a good question should eventually touch one small thing people can maintain together.",
  },
  {
    id: "elon-musk",
    name: "埃隆·马斯克",
    nativeName: "Elon Musk",
    years: "1971—至今",
    role: "把愿景推到现实的人",
    greeting: "Good evening. Let’s separate what is possible from what is deployed.",
    notices: "AI 的规模、成本、部署速度与控制权",
    challenges: "会被图灵追问：你说的未来，哪些已经验证，哪些仍是公司目标？",
    color: "#5f83a7",
    facing: "left",
    nameEn: "Elon Musk",
    yearsEn: "1971–present",
    roleEn: "Pushes a vision into deployment",
    greetingEn: "Good evening. Let’s separate what is possible from what is deployed.",
    noticesEn: "The scale, cost, deployment speed, and control of AI",
    challengesEn: "Turing may ask which parts of the future he describes have been tested and which remain company goals.",
    personaMode: "contemporary",
    sceneScale: 0.94,
    hasEngage: true,
  },
  {
    id: "fei-fei-li",
    name: "李飞飞",
    nativeName: "Fei-Fei Li",
    years: "1976—至今",
    role: "把技术放回人的处境",
    greeting: "晚上好。先看看这项技术让谁更有能力。",
    notices: "人的能动性、数据劳动与真实世界",
    challenges: "会追问马斯克：部署得更快之后，谁真正获得了选择权？",
    color: "#8e5360",
    facing: "left",
    nameEn: "Fei-Fei Li",
    yearsEn: "1976–present",
    roleEn: "Returns technology to human lives",
    greetingEn: "Good evening. Let’s first ask whose agency this technology expands.",
    noticesEn: "Human agency, data labor, and the real world",
    challengesEn: "May ask Musk who truly gains choices once deployment accelerates.",
    personaMode: "contemporary",
    sceneScale: 0.96,
    hasEngage: true,
  },
  {
    id: "kai-fu-lee",
    name: "李开复",
    nativeName: "Kai-Fu Lee",
    years: "1961—至今",
    role: "拆开岗位与产业转型",
    greeting: "晚上好。别只看职业名称，先拆开其中的任务。",
    notices: "产业落地、任务替代与人的关系能力",
    challenges: "会追问格布鲁：怎样让问责机制既保护人，也能进入真实产业流程？",
    color: "#6b7f96",
    facing: "left",
    nameEn: "Kai-Fu Lee",
    yearsEn: "1961–present",
    roleEn: "Unpacks jobs and industrial change",
    greetingEn: "Good evening. Don’t start with job titles; start with the tasks inside them.",
    noticesEn: "Adoption, task displacement, and relational human work",
    challengesEn: "May ask Gebru how accountability can protect people and still enter real deployment processes.",
    personaMode: "contemporary",
    sceneScale: 0.97,
  },
  {
    id: "geoffrey-hinton",
    name: "杰弗里·辛顿",
    nativeName: "Geoffrey Hinton",
    years: "1947—至今",
    role: "追问能力与失控风险",
    greeting: "Good evening. I’m less certain than I used to be—and that matters.",
    notices: "神经网络能力、现实扰动与控制风险",
    challenges: "会追问李开复：产业速度是否快过了我们理解和控制系统的能力？",
    color: "#8b765b",
    facing: "left",
    nameEn: "Geoffrey Hinton",
    yearsEn: "1947–present",
    roleEn: "Questions capability and control",
    greetingEn: "Good evening. I’m less certain than I used to be—and that matters.",
    noticesEn: "Neural-network capability, present disruption, and control risk",
    challengesEn: "May ask Kai-Fu Lee whether adoption is moving faster than our ability to understand and control these systems.",
    personaMode: "contemporary",
    sceneScale: 0.98,
  },
  {
    id: "timnit-gebru",
    name: "蒂姆尼特·格布鲁",
    nativeName: "Timnit Gebru",
    years: "约 1982—至今",
    role: "追问数据、劳动与权力",
    greeting: "Good evening. Who benefits—and who carries the error?",
    notices: "数据、受影响群体、劳动与机构权力",
    challenges: "会追问辛顿：当我们谈未来失控时，谁在承担今天已经发生的伤害？",
    color: "#8a4f63",
    facing: "left",
    nameEn: "Timnit Gebru",
    yearsEn: "c. 1982–present",
    roleEn: "Questions data, labor, and power",
    greetingEn: "Good evening. Who benefits—and who carries the error?",
    noticesEn: "Data, affected communities, labor, and institutional power",
    challengesEn: "May ask Hinton who bears the harms already occurring while the table debates future loss of control.",
    personaMode: "contemporary",
    sceneScale: 0.98,
    hasEngage: true,
  },
];

const figureById = Object.fromEntries(figures.map((figure) => [figure.id, figure]));

const prompts: Record<Topic, { label: string; question: string; object: string; labelEn: string; questionEn: string }> = {
  question: {
    label: "桌心的问题卡",
    question: "先别急着回答：这句话里的“自由”究竟指什么？",
    object: "？",
    labelEn: "The question card",
    questionEn: "Before answering: what exactly do we mean by ‘freedom’ here?",
  },
  archive: {
    label: "一叠工作记录",
    question: "当技术替我们完成更多工作，它也会拿走什么？",
    object: "▤",
    labelEn: "A stack of work records",
    questionEn: "When technology does more of our work, what might it also take away?",
  },
  today: {
    label: "一部亮着的手机",
    question: "如果算法替我们做出越来越多选择，我们更自由了吗？",
    object: "▯",
    labelEn: "A lit phone",
    questionEn: "If algorithms make more choices for us, are we becoming freer?",
  },
  life: {
    label: "一封没有寄出的信",
    question: "有没有一种时刻，让你自己也怀疑过“自由”这个词？",
    object: "✉",
    labelEn: "An unsent letter",
    questionEn: "Was there a moment when you doubted the word ‘freedom’ yourself?",
  },
  unknown: {
    label: "一本空白笔记",
    question: "关于今天的技术，有什么是你无法替我们回答的？",
    object: "□",
    labelEn: "A blank notebook",
    questionEn: "What about today’s technology are you unable to answer for us?",
  },
};

const discussionStages: StageDefinition[] = [
  {
    id: "define",
    label: "界定",
    objectName: "问题卡",
    symbol: "？",
    cue: "先找出问题里最不稳的那个词",
    topic: "question",
    prompt: "先别急着回答。请指出这个问题里最需要重新界定的词，说明不同理解会怎样改变答案。",
    labelEn: "Define",
    objectNameEn: "Question card",
    cueEn: "Find the least stable word in the question",
    promptEn: "Before answering, identify the word that most needs defining. Explain how two ordinary meanings would change the answer.",
  },
  {
    id: "evidence",
    label: "证据",
    objectName: "资料页",
    symbol: "▤",
    cue: "让一条真实材料进入讨论",
    topic: "archive",
    prompt: "请从你真实可用的资料里，拿出一件能改变这场讨论的材料，并说明它能证明什么、不能证明什么。",
    labelEn: "Evidence",
    objectNameEn: "Source page",
    cueEn: "Bring one real source into the conversation",
    promptEn: "Bring in one real source that could change the conversation. Explain, in everyday language, what it supports and what it cannot settle.",
  },
  {
    id: "conflict",
    label: "分歧",
    objectName: "分歧线",
    symbol: "⌁",
    cue: "不再各说各的，直接接住上一位",
    topic: "life",
    prompt: "请直接回应上一位：你赞同他哪一点，又认为他的前提或后果里哪一处最值得质疑？",
    labelEn: "Disagreement",
    objectNameEn: "Tension line",
    cueEn: "Answer the previous person directly",
    promptEn: "Respond directly to the previous person. Name the point you accept and one assumption or consequence you question.",
  },
  {
    id: "today",
    label: "今天",
    objectName: "亮着的手机",
    symbol: "▯",
    cue: "把原则有限地带回我们的处境",
    topic: "today",
    prompt: "把刚才的分歧带回今天：面对算法替我们做选择，我们可以观察什么，才能知道自己更自由还是更依赖？",
    labelEn: "Today",
    objectNameEn: "Lit phone",
    cueEn: "Bring the idea carefully into our situation",
    promptEn: "Bring the disagreement into the present. What could we observe to tell whether algorithmic choices make us freer or more dependent?",
  },
  {
    id: "unfinished",
    label: "留下问题",
    objectName: "空白笔记",
    symbol: "□",
    cue: "不做总结，留下值得继续追的张力",
    topic: "unknown",
    prompt: "不要把讨论收束成共识。请指出仍然没有解决的张力，并给用户留下一个可以继续追问或验证的问题。",
    labelEn: "Keep open",
    objectNameEn: "Blank notebook",
    cueEn: "Leave a tension worth following",
    promptEn: "Do not turn the discussion into consensus. Name the remaining tension and leave the user one question they could pursue or test.",
  },
];

const sources = [
  { figureId: "zhuangzi", who: "庄子", whoEn: "Zhuangzi", title: "《庄子·齐物论》", note: "彼是、成心与判断位置", noteEn: "Perspective, fixed judgments, and the position from which we decide", url: "https://ctext.org/zhuangzi/adjustment-of-controversies/ens" },
  { figureId: "audre-lorde", who: "洛德", whoEn: "Audre Lorde", title: "The Transformation of Silence into Language and Action", note: "沉默、恐惧与发声的历史语境", noteEn: "The historical context of silence, fear, and speaking", url: "https://www.herstories.prattinfoschool.nyc/omeka/items/show/54?collection=33" },
  { figureId: "rabindranath-tagore", who: "泰戈尔", whoEn: "Rabindranath Tagore", title: "Bichitra: Tagore Variorum", note: "手稿与作品档案入口", noteEn: "An archive of manuscripts and works", url: "https://bichitra.jdvu.ac.in/manuscript/manuscript_viewer.php?manid=515&mname=RBVBMS_365" },
  { figureId: "alan-turing", who: "图灵", whoEn: "Alan Turing", title: "Computing Machinery and Intelligence", note: "问题重述、检验与机器智能", noteEn: "Reframing questions, tests, and machine intelligence", url: "https://turingarchive.kings.cam.ac.uk/publications-lectures-and-talks-amtb/amt-b-9" },
  { figureId: "ibn-khaldun", who: "赫勒敦", whoEn: "Ibn Khaldun", title: "The Muqaddimah", note: "社会组织、权力与历史方法", noteEn: "Social organization, power, and historical method", url: "https://www.muslimphilosophy.com/ik/Muqaddimah/TransIntro/TheMuqaddimah.htm" },
  { figureId: "wangari-maathai", who: "马塔伊", whoEn: "Wangari Maathai", title: "Nobel Lecture", note: "环境、民主、和平与社区行动", noteEn: "Environment, democracy, peace, and community action", url: "https://www.nobelprize.org/prizes/peace/2004/maathai/lecture/" },
  { figureId: "elon-musk", who: "马斯克", whoEn: "Elon Musk", title: "xAI Company & Safety", note: "科学发现、快速部署与前沿模型风险的公开立场", noteEn: "Public positions on scientific discovery, rapid deployment, and frontier-model risk", url: "https://x.ai/company" },
  { figureId: "fei-fei-li", who: "李飞飞", whoEn: "Fei-Fei Li", title: "Human-Centered AI at Stanford", note: "人的能动性、公共研究与 AI 治理", noteEn: "Human agency, public research, and AI governance", url: "https://www.stanford.edu/artificial-intelligence" },
  { figureId: "kai-fu-lee", who: "李开复", whoEn: "Kai-Fu Lee", title: "How AI Can Save Our Humanity", note: "任务替代、产业转型与人的关系能力", noteEn: "Task displacement, industrial change, and relational human work", url: "https://www.ted.com/talks/kai_fu_lee_how_ai_can_save_our_humanity" },
  { figureId: "geoffrey-hinton", who: "辛顿", whoEn: "Geoffrey Hinton", title: "Geoffrey Hinton — Nobel Prize Interview", note: "神经网络能力、安全研究与控制的不确定性", noteEn: "Neural-network capability, safety research, and uncertainty about control", url: "https://www.nobelprize.org/prizes/physics/2024/hinton/interview/" },
  { figureId: "timnit-gebru", who: "格布鲁", whoEn: "Timnit Gebru", title: "Gender Shades", note: "交叉群体评估、数据文档与算法问责", noteEn: "Intersectional evaluation, data documentation, and algorithmic accountability", url: "https://proceedings.mlr.press/v81/buolamwini18a.html" },
];

const relationByAction: Record<ApiTurn["action_type"], Relation> = {
  reframe: "界定",
  agree_extend: "赞同·补充",
  challenge: "质疑",
  contextualize: "转向",
  concretize: "转向",
  admit_limit: "承认未知",
  ask_back: "转向",
};

const firstPersonSeats: Record<string, SeatPreset> = {
  "fp-left-near": { id: "fp-left-near", x: 0, y: 12.5, width: 19.7, height: 69.1, bubbleX: 13.5, bubbleY: 20.8, depth: 30, targetFacing: "right", bubbleOpen: "right" },
  "fp-left-pair": { id: "fp-left-pair", x: 20, y: 25, width: 25, height: 62, bubbleX: 32.5, bubbleY: 15, depth: 24, targetFacing: "right", bubbleOpen: "left" },
  "fp-left-inner": { id: "fp-left-inner", x: 15, y: 14, width: 21.5, height: 53.1, bubbleX: 32, bubbleY: 18.6, depth: 20, targetFacing: "right", bubbleOpen: "right" },
  "fp-center": { id: "fp-center", x: 38.9, y: 13.8, width: 22.2, height: 50, bubbleX: 50, bubbleY: 15.9, depth: 10, targetFacing: "natural", bubbleOpen: "center" },
  "fp-right-inner": { id: "fp-right-inner", x: 63.5, y: 14, width: 21.5, height: 53.1, bubbleX: 68, bubbleY: 18.6, depth: 20, targetFacing: "left", bubbleOpen: "left" },
  "fp-right-pair": { id: "fp-right-pair", x: 55, y: 25, width: 25, height: 62, bubbleX: 67.5, bubbleY: 15, depth: 24, targetFacing: "left", bubbleOpen: "right" },
  "fp-right-near": { id: "fp-right-near", x: 80.3, y: 12.5, width: 19.7, height: 69.1, bubbleX: 86.5, bubbleY: 20.8, depth: 30, targetFacing: "left", bubbleOpen: "left" },
};

const thirdPersonSeats: Record<string, SeatPreset> = {
  "tp-left-near": { id: "tp-left-near", x: 0, y: 16.5, width: 19, height: 60.6, bubbleX: 15, bubbleY: 22.3, depth: 30, targetFacing: "right", bubbleOpen: "right" },
  "tp-left-inner": { id: "tp-left-inner", x: 18.3, y: 14.3, width: 18.1, height: 43.6, bubbleX: 32.9, bubbleY: 16.5, depth: 20, targetFacing: "right", bubbleOpen: "right" },
  "tp-far-left": { id: "tp-far-left", x: 35.6, y: 11.5, width: 16.7, height: 38.3, bubbleX: 46, bubbleY: 13.4, depth: 10, targetFacing: "right", bubbleOpen: "center" },
  "tp-far-right": { id: "tp-far-right", x: 50.6, y: 11.5, width: 16.7, height: 38.3, bubbleX: 57, bubbleY: 13.4, depth: 10, targetFacing: "left", bubbleOpen: "center" },
  "tp-right-inner": { id: "tp-right-inner", x: 69.6, y: 14.3, width: 18.1, height: 43.6, bubbleX: 73.1, bubbleY: 16.5, depth: 20, targetFacing: "left", bubbleOpen: "left" },
  "tp-right-near": { id: "tp-right-near", x: 81, y: 16.5, width: 19, height: 60.6, bubbleX: 85, bubbleY: 22.3, depth: 30, targetFacing: "left", bubbleOpen: "left" },
};

const seatOrderByCount: Record<number, string[]> = {
  1: ["fp-center"],
  2: ["fp-left-pair", "fp-right-pair"],
  3: ["fp-left-inner", "fp-center", "fp-right-inner"],
  4: ["fp-left-near", "fp-left-inner", "fp-right-inner", "fp-right-near"],
  5: ["fp-left-near", "fp-left-inner", "fp-center", "fp-right-inner", "fp-right-near"],
  6: ["tp-left-near", "tp-left-inner", "tp-far-left", "tp-far-right", "tp-right-inner", "tp-right-near"],
};

const mapPositionsByCount: Record<number, MapPosition[]> = {
  1: [{ x: 24, y: 31, rotate: -3 }],
  2: [{ x: 23, y: 30, rotate: -3 }, { x: 76, y: 30, rotate: 3 }],
  3: [{ x: 20, y: 30, rotate: -4 }, { x: 77, y: 29, rotate: 3 }, { x: 24, y: 67, rotate: 2 }],
  4: [{ x: 20, y: 29, rotate: -4 }, { x: 77, y: 28, rotate: 3 }, { x: 23, y: 67, rotate: 2 }, { x: 77, y: 65, rotate: -2 }],
  5: [{ x: 18, y: 31, rotate: -4 }, { x: 42, y: 20, rotate: 2 }, { x: 78, y: 29, rotate: 3 }, { x: 76, y: 66, rotate: -2 }, { x: 23, y: 68, rotate: 2 }],
  6: [{ x: 17, y: 31, rotate: -4 }, { x: 39, y: 20, rotate: 2 }, { x: 72, y: 25, rotate: 3 }, { x: 82, y: 52, rotate: -2 }, { x: 69, y: 69, rotate: 2 }, { x: 23, y: 68, rotate: -3 }],
};

function figureAsset(id: string, state: "listen" | "speak" | "engage") {
  return `/unfinished-table/figures/${id}-${state}.png`;
}

function inferTurnLanguage(turn: ApiTurn): Locale {
  return /[\u3400-\u9fff]/.test(turn.speech_segments.join(" ")) ? "zh" : "en";
}

function localizedTurn(message: Message, locale: Locale, allowFallback = true): ApiTurn | undefined {
  if (!message.turn) return undefined;
  const originalLanguage = message.language ?? inferTurnLanguage(message.turn);
  return message.localizedTurns?.[locale]
    ?? (originalLanguage === locale ? message.turn : allowFallback ? message.turn : undefined);
}

function localizedMessageText(message: Message, locale: Locale, allowFallback = true): string {
  const turn = localizedTurn(message, locale, allowFallback);
  return turn ? turn.speech_segments.map(stripInternalEvidenceIds).join(" ") : message.text;
}

function Portrait({
  id,
  small = false,
  speaking = false,
  engaging = false,
  flip = false,
  scene = false,
}: {
  id: string;
  small?: boolean;
  speaking?: boolean;
  engaging?: boolean;
  flip?: boolean;
  scene?: boolean;
}) {
  const figure = figureById[id];
  const looksAtUser = engaging && Boolean(figure?.hasEngage);
  const portraitStyle = {
    "--portrait-flip": !looksAtUser && flip ? -1 : 1,
    "--portrait-scene-scale": scene ? figure?.sceneScale ?? 1 : 1,
  } as CSSProperties;
  return (
    <div
      className={`portrait portrait-${id} ${small ? "portrait-small" : ""} ${speaking ? "is-speaking" : ""} ${looksAtUser ? "is-engaging" : ""}`}
      style={portraitStyle}
      aria-hidden="true"
    >
      <span className="portrait-halo" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={figureAsset(id, looksAtUser ? "engage" : speaking ? "speak" : "listen")}
        alt=""
        draggable={false}
      />
      <span className="portrait-fallback">{figure?.name.slice(0, 1)}</span>
    </div>
  );
}

function AppNav({
  onAbout,
  onHome,
  locale,
  onLocaleChange,
}: {
  onAbout: () => void;
  onHome: () => void;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const copy = UI_COPY[locale];
  return (
    <nav className="app-nav" aria-label={copy.navLabel}>
      <button className="wordmark" onClick={onHome} aria-label={copy.homeLabel}>
        {copy.brand}
      </button>
      <div className="nav-side">
        <span className="edition">{copy.edition}</span>
        <button className="text-button" onClick={onAbout}>{copy.methods}</button>
        <div className="language-switch" role="group" aria-label={copy.languageLabel}>
          <button type="button" className={locale === "zh" ? "active" : ""} aria-pressed={locale === "zh"} onClick={() => onLocaleChange("zh")}>中</button>
          <button type="button" className={locale === "en" ? "active" : ""} aria-pressed={locale === "en"} onClick={() => onLocaleChange("en")}>EN</button>
        </div>
      </div>
    </nav>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("welcome");
  const [locale, setLocale] = useState<Locale>("zh");
  const [selected, setSelected] = useState<string[]>([]);
  const [question, setQuestion] = useState(DEFAULT_QUESTIONS.zh);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stage, setStage] = useState(0);
  const [pending, setPending] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [coffeeLevel, setCoffeeLevel] = useState(0);
  const [lampWarm, setLampWarm] = useState(true);
  const [listening, setListening] = useState(false);
  const [input, setInput] = useState("");
  const [modelNotice, setModelNotice] = useState("");
  const [failedRound, setFailedRound] = useState<FailedRound | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [activeSources, setActiveSources] = useState<ApiCitation[] | null>(null);
  const [toast, setToast] = useState("");
  const [welcomeDeparting, setWelcomeDeparting] = useState(false);
  const [sceneReady, setSceneReady] = useState(true);
  const [bubbleSegmentIndex, setBubbleSegmentIndex] = useState(0);
  const [waitingPhase, setWaitingPhase] = useState<WaitingPhase | null>(null);
  const [languageSyncing, setLanguageSyncing] = useState(false);
  const [languageSyncFailed, setLanguageSyncFailed] = useState(false);
  const [languageSyncTarget, setLanguageSyncTarget] = useState<Locale | null>(null);
  const [figureReactions, setFigureReactions] = useState<Record<string, FigureReaction>>({});
  const [mapFocusId, setMapFocusId] = useState<string | null>(null);
  const sceneEntryTimer = useRef<number | null>(null);
  const waitingTimers = useRef<number[]>([]);
  const roundAbort = useRef<AbortController | null>(null);
  const welcomeTransitionTimer = useRef<number | null>(null);
  const questionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const pauseForUserRequested = useRef(false);
  const languageSwitchRequested = useRef(false);
  const localeRef = useRef<Locale>("zh");
  const languageSyncSequence = useRef(0);
  const copy = UI_COPY[locale];
  const figureName = (figure: Figure) => locale === "en" ? figure.nameEn : figure.name;
  const figureYears = (figure: Figure) => locale === "en" ? figure.yearsEn : figure.years;
  const figureRole = (figure: Figure) => locale === "en" ? figure.roleEn : figure.role;
  const figureGreeting = (figure: Figure) => locale === "en" ? figure.greetingEn : figure.greeting;
  const figureNotices = (figure: Figure) => locale === "en" ? figure.noticesEn : figure.notices;
  const figureChallenges = (figure: Figure) => locale === "en" ? figure.challengesEn : figure.challenges;
  const promptLabel = (topic: Topic) => locale === "en" ? prompts[topic].labelEn : prompts[topic].label;
  const promptQuestion = (topic: Topic) => locale === "en" ? prompts[topic].questionEn : prompts[topic].question;
  const stageLabel = (definition: StageDefinition) => locale === "en" ? definition.labelEn : definition.label;
  const stageObjectName = (definition: StageDefinition) => locale === "en" ? definition.objectNameEn : definition.objectName;
  const stageCue = (definition: StageDefinition) => locale === "en" ? definition.cueEn : definition.cue;
  const stagePrompt = (definition: StageDefinition) => locale === "en" ? definition.promptEn : definition.prompt;
  const relationLabel = (relation?: Relation) => relation ? RELATION_LABELS[locale][relation] ?? relation : "";
  const statusLabel = (status?: SourceStatus) => status ? SOURCE_STATUS_LABELS[locale][status] ?? status : "";

  const selectedFigures = useMemo(
    () => selected.map((id) => figureById[id]).filter(Boolean),
    [selected],
  );
  const mapPositions = mapPositionsByCount[selected.length] ?? mapPositionsByCount[1];

  const cameraMode: CameraMode = selected.length === 6 ? "third-person" : "first-person";
  const seatedFigures = useMemo(() => {
    const seatIds = seatOrderByCount[selected.length] ?? [];
    const seatMap = selected.length === 6 ? thirdPersonSeats : firstPersonSeats;
    return selectedFigures.map((figure, index) => ({ figure, seat: seatMap[seatIds[index]] }));
  }, [selected.length, selectedFigures]);
  const latestFigureMessage = useMemo(
    () => [...messages].reverse().find((message) => message.speakerId !== "user") ?? null,
    [messages],
  );
  const latestFigureTurn = latestFigureMessage
    ? localizedTurn(latestFigureMessage, locale)
    : undefined;
  const focusedSpeakerId = activeSpeaker ?? latestFigureMessage?.speakerId ?? null;
  const focusedSeat = seatedFigures.find(({ figure }) => figure.id === latestFigureMessage?.speakerId)?.seat;
  const directUserEngagement = Boolean(
    latestFigureMessage?.targetId === "user"
      && latestFigureMessage.speakerId
      && figureById[latestFigureMessage.speakerId]?.hasEngage,
  );
  const focusedSeatCenter = focusedSeat ? focusedSeat.x + focusedSeat.width / 2 : 50;
  const directBubbleOpen: SeatPreset["bubbleOpen"] = selected.length === 2
    ? focusedSeat?.bubbleOpen ?? "center"
    : focusedSeatCenter <= 50 ? "right" : "left";
  const directBubbleX = selected.length === 2
    ? focusedSeat?.bubbleX ?? 50
    : focusedSeatCenter <= 50
      ? Math.min(70, focusedSeatCenter + 12)
      : Math.max(30, focusedSeatCenter - 12);
  const bubbleSegments = latestFigureTurn?.speech_segments ?? (latestFigureMessage && !latestFigureMessage.turn ? [latestFigureMessage.text] : []);
  const activeSpeakerName = activeSpeaker && figureById[activeSpeaker] ? figureName(figureById[activeSpeaker]) : null;
  const currentStageIndex = Math.min(stage, discussionStages.length - 1);
  const currentStage = discussionStages[currentStageIndex];
  const finalDiscussionLens = currentStageIndex === discussionStages.length - 1;
  const currentStageFigureMessages = messages.filter(
    (message) => message.speakerId !== "user" && message.stage === currentStage.id,
  );
  const currentStageVoiceCount = currentStageFigureMessages.length;
  const stageReadyToAdvance = selected.length > 0
    && canShiftDiscussionLens(currentStageFigureMessages.length, selected.length);
  const canChangeDiscussionLens = stageReadyToAdvance && !finalDiscussionLens;
  const focusedMapMessage = mapFocusId
    ? messages.find((message) => message.id === mapFocusId && message.turn)
    : undefined;
  const focusedMapText = focusedMapMessage
    ? localizedMessageText(focusedMapMessage, locale)
    : "";
  const latestTurnMessage = [...messages].reverse().find((message) => message.turn);
  const latestUnresolvedTension = latestTurnMessage
    ? localizedTurn(latestTurnMessage, locale)?.unresolved_tension ?? copy.openTension
    : copy.openTension;
  const inspectedSourceCount = new Set(messages.flatMap((message) => message.sources?.map((source) => source.url) ?? [])).size;
  const directResponseCount = messages.filter((message) => message.targetId).length;
  const userMapContributions = messages
    .filter((message) => message.speakerId === "user" && message.kind === "contribution")
    .slice(-2);
  const latestUserContributionIndex = messages.findLastIndex(
    (message) => message.speakerId === "user" && message.kind === "contribution",
  );
  const latestUserContribution = latestUserContributionIndex >= 0 ? messages[latestUserContributionIndex] : null;
  const figureRepliesSinceContribution = latestUserContributionIndex >= 0
    ? messages.slice(latestUserContributionIndex + 1).filter((message) => message.speakerId !== "user").length
    : 0;
  const showUserContribution = Boolean(
    latestUserContribution && figureRepliesSinceContribution <= 1,
  );
  const waitingCopy = waitingPhase === "choosing"
    ? { title: copy.thinkingChoose, detail: copy.thinkingChooseDetail }
    : waitingPhase === "evidence"
      ? { title: `${activeSpeakerName ?? copy.next} ${copy.thinkingEvidence}`, detail: copy.thinkingEvidenceDetail }
      : waitingPhase === "composing"
        ? { title: `${activeSpeakerName ?? copy.next} ${copy.thinkingCompose}`, detail: copy.thinkingComposeDetail }
        : waitingPhase === "long"
          ? { title: copy.thinkingLong, detail: copy.thinkingLongDetail }
          : { title: `${activeSpeakerName ?? copy.next} ${copy.thinkingPlace}`, detail: copy.thinkingPlaceDetail };

  useEffect(() => {
    if (!latestFigureMessage || bubbleSegmentIndex >= bubbleSegments.length - 1) return;
    const timer = window.setTimeout(() => setBubbleSegmentIndex((index) => index + 1), 4200);
    return () => window.clearTimeout(timer);
  }, [bubbleSegmentIndex, bubbleSegments.length, latestFigureMessage]);

  useEffect(() => {
    const savedLocale = window.localStorage.getItem("unfinished-table-locale");
    if (savedLocale !== "en" && savedLocale !== "zh") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLocale(savedLocale);
      setQuestion((current) => current === DEFAULT_QUESTIONS.zh || current === DEFAULT_QUESTIONS.en
        ? DEFAULT_QUESTIONS[savedLocale]
        : current);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("unfinished-table-session");
    if (!saved) return;
    let cancelled = false;
    try {
      const session = JSON.parse(saved) as { selected?: string[]; messages?: Message[]; question?: string; stage?: number; locale?: Locale };
      const validSelected = session.selected?.filter((id) => Boolean(figureById[id])) ?? [];
      const validMessages = session.messages
        ?.filter((message) => message.speakerId === "user" || Boolean(figureById[message.speakerId]))
        .map((message) => {
          const cleanTurn = (turn?: ApiTurn) => turn ? {
            ...turn,
            speech_segments: turn.speech_segments.map(stripInternalEvidenceIds),
            evidence_uses: [],
          } : undefined;
          const baseTurn = cleanTurn(message.turn);
          const localizedTurns: Partial<Record<Locale, ApiTurn>> = {};
          const chineseTurn = cleanTurn(message.localizedTurns?.zh);
          const englishTurn = cleanTurn(message.localizedTurns?.en);
          if (chineseTurn) localizedTurns.zh = chineseTurn;
          if (englishTurn) localizedTurns.en = englishTurn;
          if (baseTurn) localizedTurns[message.language ?? inferTurnLanguage(baseTurn)] ??= baseTurn;
          return {
            ...message,
            text: stripInternalEvidenceIds(message.text),
            turn: baseTurn,
            language: message.language ?? (baseTurn ? inferTurnLanguage(baseTurn) : session.locale),
            localizedTurns: Object.keys(localizedTurns).length ? localizedTurns : undefined,
          };
        }) ?? [];
      queueMicrotask(() => {
        if (cancelled) return;
        if (validSelected.length) setSelected(validSelected);
        if (validMessages.length) setMessages(validMessages);
        if (session.question) setQuestion(session.question);
        if (typeof session.stage === "number") setStage(Math.min(session.stage, discussionStages.length - 1));
        if (session.locale === "zh" || session.locale === "en") setLocale(session.locale);
      });
    } catch {
      window.localStorage.removeItem("unfinished-table-session");
    }
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    localeRef.current = locale;
    document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
    window.localStorage.setItem("unfinished-table-locale", locale);
  }, [locale]);

  useEffect(() => {
    if (!selected.length) return;
    window.localStorage.setItem(
      "unfinished-table-session",
      JSON.stringify({ selected, messages, question, stage, locale }),
    );
  }, [selected, messages, question, stage, locale]);

  useEffect(() => () => {
    if (sceneEntryTimer.current) window.clearTimeout(sceneEntryTimer.current);
    if (welcomeTransitionTimer.current) window.clearTimeout(welcomeTransitionTimer.current);
    waitingTimers.current.forEach((timer) => window.clearTimeout(timer));
    roundAbort.current?.abort();
  }, []);

  const clearWaitingTimers = () => {
    waitingTimers.current.forEach((timer) => window.clearTimeout(timer));
    waitingTimers.current = [];
  };

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const synchronizeDialogueLanguage = async (targetLocale: Locale): Promise<boolean> => {
    const candidates = messages.filter((message) => message.turn && !localizedTurn(message, targetLocale, false));
    if (!candidates.length) {
      setLanguageSyncing(false);
      setLanguageSyncFailed(false);
      setLanguageSyncTarget(null);
      return true;
    }
    const sequence = languageSyncSequence.current + 1;
    languageSyncSequence.current = sequence;
    setLanguageSyncing(true);
    setLanguageSyncFailed(false);
    setLanguageSyncTarget(targetLocale);
    try {
      const response = await fetch("/api/dialogue/localize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetLanguage: targetLocale,
          turns: candidates.map((message) => {
            const turn = message.turn as ApiTurn;
            return {
              turn_id: turn.turn_id,
              speaker_id: turn.speaker_id,
              reply_to_claim: turn.reply_to.claim,
              speech_segments: turn.speech_segments,
              evidence_supports: turn.evidence_uses.map((use) => use.supports),
              uncertainty: turn.uncertainty,
              unresolved_tension: turn.unresolved_tension,
            };
          }),
        }),
      });
      const payload = await response.json() as { ok: boolean; localizations?: ApiLocalization[] };
      if (!response.ok || !payload.ok || payload.localizations?.length !== candidates.length) throw new Error("localization failed");
      if (languageSyncSequence.current !== sequence || localeRef.current !== targetLocale) return false;
      const byTurnId = new Map(payload.localizations.map((localization) => [localization.turn_id, localization]));
      setMessages((current) => current.map((message) => {
        if (!message.turn) return message;
        const localization = byTurnId.get(message.turn.turn_id);
        if (!localization) return message;
        const turn: ApiTurn = {
          ...message.turn,
          reply_to: { ...message.turn.reply_to, claim: localization.reply_to_claim },
          speech_segments: localization.speech_segments.map(stripInternalEvidenceIds),
          evidence_uses: message.turn.evidence_uses.map((use, index) => ({
            ...use,
            supports: localization.evidence_supports[index] ?? use.supports,
          })),
          uncertainty: localization.uncertainty,
          unresolved_tension: localization.unresolved_tension,
        };
        return {
          ...message,
          localizedTurns: { ...message.localizedTurns, [targetLocale]: turn },
        };
      }));
      setBubbleSegmentIndex(0);
      setLanguageSyncTarget(null);
      return true;
    } catch {
      if (languageSyncSequence.current === sequence && localeRef.current === targetLocale) setLanguageSyncFailed(true);
      return false;
    } finally {
      if (languageSyncSequence.current === sequence) setLanguageSyncing(false);
    }
  };

  const changeLocale = (nextLocale: Locale) => {
    if (nextLocale === locale && !languageSyncFailed) return;
    setModelNotice("");
    if (nextLocale !== locale) {
      const previousLocale = locale;
      if (pending) {
        languageSwitchRequested.current = true;
        roundAbort.current?.abort();
      }
      localeRef.current = nextLocale;
      setQuestion((current) => current === DEFAULT_QUESTIONS[previousLocale]
        ? DEFAULT_QUESTIONS[nextLocale]
        : current);
      setLocale(nextLocale);
      void synchronizeDialogueLanguage(nextLocale);
      return;
    }
    void synchronizeDialogueLanguage(languageSyncTarget ?? nextLocale);
  };

  const openSourceDrawer = (citations?: ApiCitation[]) => {
    setActiveSources(citations?.length ? citations : null);
    setSourcesOpen(true);
  };

  const toggleFigure = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 6) {
        notify(copy.maxSeats);
        return current;
      }
      return [...current, id];
    });
  };

  const beginSession = () => {
    if (selected.length < 1) {
      notify(copy.minSeats);
      return;
    }
    setMessages([]);
    setStage(0);
    setModelNotice("");
    setFailedRound(null);
    setWaitingPhase(null);
    setLanguageSyncing(false);
    setLanguageSyncFailed(false);
    setFigureReactions({});
    setMapFocusId(null);
    setSceneReady(false);
    setView("table");
    sceneEntryTimer.current = window.setTimeout(() => setSceneReady(true), 80);
  };

  const enterSelection = () => {
    if (welcomeDeparting) return;
    setWelcomeDeparting(true);
    if (welcomeTransitionTimer.current) window.clearTimeout(welcomeTransitionTimer.current);
    welcomeTransitionTimer.current = window.setTimeout(() => {
      setView("select");
      setWelcomeDeparting(false);
    }, 720);
  };

  const runTopic = async (
    topic: Topic,
    customQuestion?: string,
    options?: {
      turns?: number;
      appendUserQuestion?: boolean;
      userContribution?: boolean;
      messageKind?: Message["kind"];
    },
  ) => {
    if (pending || languageSyncing) return;
    setPending(true);
    setModelNotice("");
    setFailedRound(null);
    const prompt = customQuestion || promptQuestion(topic);
    const appendUserQuestion = options?.appendUserQuestion ?? true;
    const requestStage = currentStage.id;
    const requestLocale = locale;

    if (appendUserQuestion) {
      setMessages((current) => [
        ...current,
        {
          id: `user-${Date.now()}`,
          speakerId: "user",
          text: prompt,
          relation: "转向",
          status: "思想转译",
          stage: requestStage,
          kind: options?.messageKind ?? "object",
        },
      ]);
    }

    const runtimeHistory = messages.flatMap((message) => {
      const turn = localizedTurn(message, requestLocale);
      return turn ? [turn] : [];
    });
    // A question should feel like the start of a discussion, not a single-agent
    // answer. Two substantive turns are enough to reveal a relationship while
    // keeping the user free to pause, disagree, or redirect immediately after.
    const turnsToGenerate = options?.turns ?? Math.min(2, Math.max(1, selected.length));
    let completedThisRun = 0;
    const controller = new AbortController();
    roundAbort.current = controller;

    try {
      for (let index = 0; index < turnsToGenerate; index += 1) {
        if (controller.signal.aborted) throw new DOMException("Discussion paused", "AbortError");
        const respondToUserThisTurn = Boolean(options?.userContribution && index === 0);
        clearWaitingTimers();
        setWaitingPhase("choosing");
        setActiveSpeaker(null);
        setFigureReactions({});

        const preparationResponse = await fetch("/api/dialogue/prepare", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            question: prompt,
            castIds: selected,
            history: runtimeHistory,
            stage: requestStage,
            userContribution: respondToUserThisTurn,
            language: requestLocale,
          }),
          signal: controller.signal,
        });
        const preparationPayload = await preparationResponse.json() as {
          ok: boolean;
          preparation?: ApiPreparation;
          message?: string;
        };

        if (!preparationResponse.ok || !preparationPayload.ok || !preparationPayload.preparation) {
          const remaining = turnsToGenerate - index;
          setFailedRound({ topic, prompt, remaining, userContribution: respondToUserThisTurn });
          // Parsing and orchestration details belong in diagnostics, not in the room.
          // The visitor only needs to know that the conversation can be resumed.
          setModelNotice(copy.prepareFailed);
          break;
        }

        const preparation = preparationPayload.preparation;
        setActiveSpeaker(preparation.speaker_id);
        setWaitingPhase("evidence");
        const preparingReactions: Record<string, FigureReaction> = {
          [preparation.speaker_id]: "preparing",
        };
        if (preparation.responds_to !== "user" && preparation.responds_to !== preparation.speaker_id) {
          preparingReactions[preparation.responds_to] = "following";
        }
        const quietObserver = selected.find((id) => id !== preparation.speaker_id && id !== preparation.responds_to);
        if (quietObserver) preparingReactions[quietObserver] = "considering";
        setFigureReactions(preparingReactions);
        waitingTimers.current = [
          window.setTimeout(() => setWaitingPhase("composing"), 700),
          window.setTimeout(() => setWaitingPhase("long"), 9000),
        ];

        const response = await fetch("/api/dialogue", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            question: prompt,
            castIds: selected,
            history: runtimeHistory,
            stage: requestStage,
            preparedSpeakerId: preparation.speaker_id,
            userContribution: respondToUserThisTurn,
            language: requestLocale,
          }),
          signal: controller.signal,
        });
        const payload = await response.json() as {
          ok: boolean;
          turn?: ApiTurn;
          citations?: ApiCitation[];
          message?: string;
        };

        if (!response.ok || !payload.ok || !payload.turn) {
          const remaining = turnsToGenerate - index;
          setFailedRound({ topic, prompt, remaining, userContribution: respondToUserThisTurn });
          setModelNotice(locale === "en" ? copy.generationFailed : payload.message || copy.generationFailed);
          break;
        }

        if (localeRef.current !== requestLocale) {
          throw new DOMException("Language changed", "AbortError");
        }

        const turn = payload.turn;
        clearWaitingTimers();
        setWaitingPhase("placing");
        setActiveSpeaker(turn.speaker_id);
        const status: SourceStatus = turn.epistemic_status === "grounded"
          ? figures.find((figure) => figure.id === turn.speaker_id)?.personaMode === "contemporary"
            ? "公开观点"
            : "思想转译"
          : turn.epistemic_status === "grounded_with_inference"
            ? "当代推演"
            : "边界说明";
        const message: Message = {
          id: turn.turn_id,
          speakerId: turn.speaker_id,
          text: turn.speech_segments.map(stripInternalEvidenceIds).join(" "),
          relation: relationByAction[turn.action_type],
          status,
          sources: payload.citations ?? [],
          targetId: turn.reply_to.speaker_id === "user"
            ? respondToUserThisTurn ? "user" : undefined
            : turn.reply_to.speaker_id,
          turn,
          stage: requestStage,
          language: requestLocale,
          localizedTurns: { [requestLocale]: turn },
        };
        runtimeHistory.push(turn);
        const postTurnReactions: Record<string, FigureReaction> = {};
        if (turn.reply_to.speaker_id !== "user" && turn.reply_to.speaker_id !== turn.speaker_id) {
          postTurnReactions[turn.reply_to.speaker_id] = turn.action_type === "challenge"
            ? "questioned"
            : turn.action_type === "agree_extend"
              ? "affirmed"
              : "following";
        } else {
          const observer = selected.find((id) => id !== turn.speaker_id);
          if (observer) postTurnReactions[observer] = turn.action_type === "challenge" ? "questioned" : "considering";
        }
        setFigureReactions(postTurnReactions);
        setBubbleSegmentIndex(0);
        setMessages((current) => [...current, message]);
        completedThisRun += 1;
        await new Promise((resolve) => window.setTimeout(resolve, 900));
      }
    } catch (error) {
      if (languageSwitchRequested.current) {
        setFailedRound(null);
        setModelNotice("");
      } else if (pauseForUserRequested.current) {
        setFailedRound(null);
        setModelNotice(copy.pauseNotice);
      } else {
        setFailedRound({
          topic,
          prompt,
          remaining: Math.max(1, turnsToGenerate - completedThisRun),
          userContribution: Boolean(options?.userContribution && completedThisRun === 0),
        });
        setModelNotice(controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")
          ? copy.aborted
          : copy.offline);
      }
    } finally {
      clearWaitingTimers();
      setActiveSpeaker(null);
      setWaitingPhase(null);
      setFigureReactions({});
      setPending(false);
      pauseForUserRequested.current = false;
      languageSwitchRequested.current = false;
      if (roundAbort.current === controller) roundAbort.current = null;
    }
  };

  const pauseForUser = () => {
    pauseForUserRequested.current = true;
    roundAbort.current?.abort();
    window.setTimeout(() => questionInputRef.current?.focus(), 120);
  };

  const advanceStage = () => {
    if (pending || !canChangeDiscussionLens) return;
    const nextStage = nextDiscussionLens(currentStageIndex, discussionStages.length);
    setModelNotice("");
    setStage(nextStage);
  };

  const passToAnotherFigure = () => {
    if (pending || !latestFigureMessage) return;
    void runTopic(
      currentStage.topic,
      locale === "en"
        ? `Keep discussing “${question}”. Respond to the previous person's specific point instead of starting a separate answer.`
        : `继续围绕“${question}”讨论。请直接接住上一位人物刚才的具体主张，不要另起一个平行答案。`,
      { turns: 1, appendUserQuestion: false },
    );
  };

  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || pending || languageSyncing) return;
    const topic: Topic = /不知道|无法|未来|边界|don't know|cannot|can't|future|limit/i.test(trimmed)
      ? "unknown"
      : /工作|劳动|平台|资本|机器|work|labor|platform|capital|machine/i.test(trimmed)
        ? "archive"
        : /经历|生活|害怕|怀疑|experience|life|afraid|fear|doubt/i.test(trimmed)
          ? "life"
          : "today";
    setInput("");
    void runTopic(topic, trimmed, { userContribution: true, messageKind: "contribution" });
  };

  const startListening = () => {
    type Recognition = {
      lang: string;
      interimResults: boolean;
      start: () => void;
      onresult: (event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void;
      onend: () => void;
      onerror: () => void;
    };
    const BrowserWindow = window as typeof window & {
      webkitSpeechRecognition?: new () => Recognition;
      SpeechRecognition?: new () => Recognition;
    };
    const RecognitionConstructor = BrowserWindow.SpeechRecognition || BrowserWindow.webkitSpeechRecognition;
    if (!RecognitionConstructor) {
      notify(copy.voiceUnsupported);
      return;
    }
    const recognition = new RecognitionConstructor();
    recognition.lang = locale === "en" ? "en-US" : "zh-CN";
    recognition.interimResults = false;
    recognition.onresult = (event) => setInput(event.results[0][0].transcript);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const pourCoffee = () => {
    setCoffeeLevel((level) => (level + 1) % 4);
    const reactions = locale === "en"
      ? ["The pot is still full.", "Steam rises from the cups.", "Someone slides the sugar toward the center.", "Zhuangzi looks into the cup and says nothing."]
      : ["咖啡壶还很满。", "杯子里有了热气。", "有人把糖推到桌子中央。", "庄子看了看杯底，没有评论。"];
    notify(reactions[(coffeeLevel + 1) % reactions.length]);
  };

  const downloadRecord = () => {
    const content = [
      locale === "en" ? "The Unfinished Table | Conversation record" : "未竟之桌｜讨论记录",
      locale === "en" ? `Question: ${question}` : `问题：${question}`,
      locale === "en" ? `Figures: ${selectedFigures.map(figureName).join(", ")}` : `人物：${selectedFigures.map(figureName).join("、")}`,
      "",
      ...messages
        .filter((message) => !(message.speakerId === "user" && message.kind === "stage"))
        .map((message) => {
          const speaker = message.speakerId === "user"
            ? message.kind === "contribution" ? copy.you : locale === "en" ? "You (touched an object)" : "你（碰了桌上物件）"
            : figureById[message.speakerId] ? figureName(figureById[message.speakerId]) : "";
          const messageStage = discussionStages.find((item) => item.id === message.stage);
          const messageStageLabel = messageStage ? stageLabel(messageStage) : "";
          const sourceLines = message.sources?.map((source) => `${locale === "en" ? "Source" : "资料"}：${source.title}｜${source.url}`).join("\n") ?? "";
          return `${speaker}［${messageStageLabel ? `${messageStageLabel}／` : ""}${relationLabel(message.relation)}／${statusLabel(message.status)}］\n${stripInternalEvidenceIds(localizedMessageText(message, locale))}${sourceLines ? `\n${sourceLines}` : ""}`;
        }),
      "",
      locale === "en" ? "Note: These responses are AI interpretations in a product prototype, not real quotations." : "说明：以上人物发言为 AI 产品原型中的思想转译，不是真实引语。",
    ].join("\n\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = locale === "en" ? "the-unfinished-table-conversation.txt" : "未竟之桌-讨论记录.txt";
    anchor.click();
    URL.revokeObjectURL(url);
    notify(copy.saved);
  };

  return (
    <main className={`site-shell ${lampWarm ? "lamp-warm" : "lamp-cool"}`}>
      <AppNav locale={locale} onLocaleChange={changeLocale} onAbout={() => setAboutOpen(true)} onHome={() => {
        setWelcomeDeparting(false);
        setView("welcome");
      }} />

      {view === "welcome" && (
        <section className={`welcome-screen welcome-cinematic ${welcomeDeparting ? "departing" : ""}`} aria-label={copy.enterSection}>
          <div className="welcome-room" aria-hidden="true" />
          <div className="welcome-atmosphere" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          <svg className="welcome-seat-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M50 63 C38 58 20 55 7 54" />
            <path d="M50 63 C42 55 33 50 25 48" />
            <path d="M50 63 C50 56 50 51 50 47" />
            <path d="M50 63 C58 55 67 50 75 48" />
            <path d="M50 63 C62 58 80 55 93 54" />
            <circle cx="7" cy="54" r=".35" /><circle cx="25" cy="48" r=".35" />
            <circle cx="50" cy="47" r=".35" /><circle cx="75" cy="48" r=".35" />
            <circle cx="93" cy="54" r=".35" />
          </svg>

          <button className="welcome-enter" type="button" onClick={enterSelection} aria-label={copy.enterLabel}>
            <i aria-hidden="true" />
            <small>ENTER THE TABLE</small>
            <strong>{copy.enter}</strong>
          </button>

          {selected.length > 0 && messages.length > 0 && (
            <button className="welcome-resume" type="button" onClick={() => {
              if (welcomeTransitionTimer.current) window.clearTimeout(welcomeTransitionTimer.current);
              if (sceneEntryTimer.current) window.clearTimeout(sceneEntryTimer.current);
              setWelcomeDeparting(false);
              setSceneReady(false);
              setView("table");
              sceneEntryTimer.current = window.setTimeout(() => setSceneReady(true), 80);
            }}>
              {copy.resume}
            </button>
          )}

          <div className="welcome-promise">
            <p>{copy.promise}</p>
          </div>

          <button className="welcome-disclosure" type="button" onClick={() => setAboutOpen(true)}>
            {copy.disclosure}
          </button>
        </section>
      )}

      {view === "select" && (
        <section className="selection-screen">
          <header className="selection-header">
            <div>
              <h2>{copy.selectTitleA}<br />{copy.selectTitleB}{" "}<em>{copy.selectTitleEm}</em></h2>
            </div>
            <div className="question-editor">
              <label htmlFor="main-question">{copy.questionLabel}</label>
              <textarea id="main-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={60} />
              <span>{question.length}/60</span>
            </div>
          </header>

          <div className="figure-wall" aria-label={copy.availableFigures}>
            {figures.map((figure, index) => {
              const isSelected = selected.includes(figure.id);
              return (
                <button
                  key={figure.id}
                  className={`figure-card card-${index} ${figure.personaMode === "contemporary" ? "figure-card--contemporary" : ""} ${isSelected ? "selected" : ""}`}
                  onClick={() => toggleFigure(figure.id)}
                  aria-pressed={isSelected}
                >
                  <span className="figure-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="greeting-bubble">{figureGreeting(figure)}<small>{copy.contextualGreeting}</small></span>
                  <Portrait id={figure.id} />
                  <span className="figure-meta">
                    <strong>{figureName(figure)}</strong>
                    <span>{figure.nativeName} · {figureYears(figure)}</span>
                  </span>
                  <span className="figure-role">{figureRole(figure)}</span>
                  <span className="figure-notice">{copy.notices}{figureNotices(figure)}</span>
                  <span className="figure-challenge">{figureChallenges(figure)}</span>
                  <span className="selection-mark">{isSelected ? copy.selected : copy.invite}</span>
                </button>
              );
            })}
          </div>

          <footer className="selection-footer">
            <button className="back-button" onClick={() => setView("welcome")}>{copy.backOutside}</button>
            <div className="selection-count">
              <div className="mini-stack">
                {selectedFigures.map((figure) => <Portrait key={figure.id} id={figure.id} small />)}
              </div>
              <span>{copy.invited} {selected.length}/6</span>
            </div>
            <button className="primary-button" disabled={selected.length < 1} onClick={beginSession}>
              {copy.arrangeSeats} <span>↗</span>
            </button>
          </footer>
        </section>
      )}

      {view === "table" && (
        <section className="table-screen spatial-table-screen">
          <header className="spatial-session-bar">
            <button className="round-icon-button" onClick={() => setView("select")} aria-label={copy.backSelect}>←</button>
            <div className="session-question">
              <small>{cameraMode === "third-person" ? copy.panorama : copy.yourSeat}</small>
              <strong>{question}</strong>
            </div>
            <div className="spatial-session-actions">
              <button className="round-icon-button" onClick={() => setLampWarm((value) => !value)} aria-label={copy.toggleLight}>◐</button>
              <button className="round-icon-button" onClick={() => openSourceDrawer()} aria-label={copy.viewSources}>⌁</button>
              <button className="map-button compact-map-button" onClick={() => setView("map")} disabled={messages.length < 2}>{copy.map}</button>
            </div>
          </header>

          <div className={`immersive-stage camera-${cameraMode} cast-${selected.length} discussion-stage-${currentStage.id} ${messages.length ? "has-dialogue" : ""} ${sceneReady ? "scene-ready" : "scene-entering"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="room-plate"
              src={`/unfinished-table/scene/room-${cameraMode}.png`}
              alt={copy.roomAlt}
              draggable={false}
            />
            <div className="ambient-vignette" aria-hidden="true" />
            <div className="ambient-dust" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <div className="stage-atmosphere" aria-hidden="true">
              <span className="stage-archive-sheet sheet-one" />
              <span className="stage-archive-sheet sheet-two" />
              <span className="stage-conflict-thread" />
              <span className="stage-today-pulse" />
              <span className="stage-note note-left" />
              <span className="stage-note note-right" />
            </div>

            {seatedFigures.map(({ figure, seat }) => {
              const speaking = focusedSpeakerId === figure.id && (!pending || waitingPhase === "placing");
              const engaging = speaking && figure.hasEngage === true && latestFigureMessage?.targetId === "user";
              const preparing = activeSpeaker === figure.id && pending && waitingPhase !== "placing";
              const reaction = figureReactions[figure.id];
              const flip = seat.targetFacing !== "natural" && figure.facing !== seat.targetFacing;
              const seatStyle = {
                "--seat-x": `${seat.x}%`,
                "--seat-y": `${seat.y}%`,
                "--seat-width": `${seat.width}%`,
                "--seat-height": `${seat.height}%`,
                "--seat-depth": 20 + seat.depth,
              } as CSSProperties;
              return (
                <div
                  key={figure.id}
                  className={`scene-figure ${speaking ? "speaking" : preparing ? "preparing" : "listening"} ${engaging ? "engaging-user" : ""} ${reaction ? `reacting-${reaction}` : ""}`}
                  style={seatStyle}
                  aria-label={`${figureName(figure)} ${speaking ? copy.responding : preparing ? copy.preparing : copy.listening}`}
                >
                  <Portrait id={figure.id} speaking={speaking} engaging={engaging} flip={flip} scene />
                  {reaction && (
                    <span className={`scene-reaction reaction-${reaction}`} aria-hidden="true">
                      {reaction === "preparing" ? "···" : reaction === "affirmed" ? locale === "en" ? "mm" : "嗯" : reaction === "questioned" ? "？" : "…"}
                    </span>
                  )}
                  <span className="scene-name"><strong>{figureName(figure)}</strong><small>{speaking ? copy.responding : preparing ? copy.preparing : figureRole(figure)}</small></span>
                </div>
              );
            })}

            <div className="table-occlusion" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/unfinished-table/scene/room-${cameraMode}.png`}
                alt=""
                draggable={false}
              />
            </div>

            <button
              type="button"
              className={`stage-centerpiece ${canChangeDiscussionLens ? "ready-to-advance" : ""}`}
              onClick={() => {
                if (canChangeDiscussionLens) {
                  advanceStage();
                } else if (currentStageVoiceCount > 0) {
                  passToAnotherFigure();
                } else {
                  void runTopic(
                    currentStage.topic,
                    locale === "en"
                      ? `Continue discussing “${question}”. ${stagePrompt(currentStage)}`
                      : `围绕“${question}”继续讨论。${stagePrompt(currentStage)}`,
                    { messageKind: "stage" },
                  );
                }
              }}
              disabled={pending}
              aria-label={canChangeDiscussionLens
                  ? copy.changeAngle
                  : currentStageVoiceCount > 0
                    ? copy.continueTalk
                    : `${stageLabel(currentStage)}：${stagePrompt(currentStage)}`}
            >
              <small>{canChangeDiscussionLens
                  ? copy.differentVoices
                  : currentStageVoiceCount > 0
                    ? finalDiscussionLens ? copy.noEnding : copy.farther
                    : copy.beginCenter}</small>
              <b>{canChangeDiscussionLens ? "→" : currentStageVoiceCount > 0 ? "↗" : currentStage.symbol}</b>
              <span>{canChangeDiscussionLens
                  ? copy.changeAngle
                  : currentStageVoiceCount > 0 ? copy.continueTalk : stageObjectName(currentStage)}</span>
              <i>{canChangeDiscussionLens
                ? discussionStages[currentStageIndex + 1] ? stageCue(discussionStages[currentStageIndex + 1]) : ""
                : currentStageVoiceCount > 0
                  ? copy.joinHint
                  : stageCue(currentStage)}</i>
            </button>

            <div className="scene-objects" aria-label={copy.openingObjects}>
              <button className="scene-object object-question" onClick={() => void runTopic("question")} disabled={pending} aria-label={`${promptLabel("question")}：${promptQuestion("question")}`}>
                <span>？</span><i>{promptQuestion("question")}</i>
              </button>
              <button className="scene-object object-record" onClick={() => void runTopic("archive")} disabled={pending} aria-label={`${promptLabel("archive")}：${promptQuestion("archive")}`}>
                <span>▤</span><i>{promptQuestion("archive")}</i>
              </button>
              <button className="scene-object object-current" onClick={() => void runTopic("today")} disabled={pending} aria-label={`${promptLabel("today")}：${promptQuestion("today")}`}>
                <span>▯</span><i>{promptQuestion("today")}</i>
              </button>
              <button className="scene-object object-letter-spatial" onClick={() => void runTopic("life")} disabled={pending} aria-label={`${promptLabel("life")}：${promptQuestion("life")}`}>
                <span>✉</span><i>{promptQuestion("life")}</i>
              </button>
              <button className="scene-object object-blank" onClick={() => void runTopic("unknown")} disabled={pending} aria-label={`${promptLabel("unknown")}：${promptQuestion("unknown")}`}>
                <span>□</span><i>{promptQuestion("unknown")}</i>
              </button>
              <button className={`scene-coffee coffee-${coffeeLevel}`} onClick={pourCoffee} aria-label={copy.pourCoffee}>
                <span>☕</span><i>{copy.coffeeOnly}</i>
              </button>
            </div>

            {showUserContribution && latestUserContribution && (
              <aside className="user-contribution-bubble" aria-label={copy.yourWords}>
                <small>{copy.you}</small>
                <p>{latestUserContribution.text}</p>
              </aside>
            )}

            {latestFigureMessage && focusedSeat && bubbleSegments.length > 0 && (
              <article
                className={`scene-speech opens-${directUserEngagement ? directBubbleOpen : focusedSeat.bubbleOpen} ${directUserEngagement ? "direct-to-user" : ""}`}
                style={{
                  "--bubble-x": `${directUserEngagement ? directBubbleX : focusedSeat.bubbleX}%`,
                  "--bubble-y": `${focusedSeat.bubbleY}%`,
                  "--speaker-color": figureById[latestFigureMessage.speakerId]?.color ?? "#d1a84b",
                } as CSSProperties}
                aria-live="polite"
              >
                <header>
                  <strong>{figureById[latestFigureMessage.speakerId] ? figureName(figureById[latestFigureMessage.speakerId]) : ""}</strong>
                  <span>{relationLabel(latestFigureMessage.relation)}{latestFigureMessage.targetId ? ` · ${copy.reply} ${latestFigureMessage.targetId === "user" ? copy.you : figureById[latestFigureMessage.targetId] ? figureName(figureById[latestFigureMessage.targetId]) : ""}` : ""}</span>
                  <small>{bubbleSegmentIndex + 1}/{bubbleSegments.length}</small>
                </header>
                <div>
                  <p key={`${latestFigureMessage.id}-scene-${bubbleSegmentIndex}`}>{stripInternalEvidenceIds(bubbleSegments[bubbleSegmentIndex] ?? "")}</p>
                </div>
                <footer>
                  <button onClick={() => openSourceDrawer(latestFigureMessage.sources)}>
                    {statusLabel(latestFigureMessage.status)}{latestFigureMessage.sources?.length ? ` · ${latestFigureMessage.sources.length} ${locale === "en" ? "sources" : "条资料"}` : ""} ↗
                  </button>
                  <span className="bubble-pager" aria-label={copy.bubblesLabel}>
                    {bubbleSegments.map((_, index) => (
                      <button
                        key={`${latestFigureMessage.id}-pager-${index}`}
                        className={bubbleSegmentIndex === index ? "active" : ""}
                        onClick={() => setBubbleSegmentIndex(index)}
                        aria-label={locale === "en" ? `View bubble ${index + 1}` : `查看第 ${index + 1} 段`}
                      />
                    ))}
                  </span>
                </footer>
              </article>
            )}

            {!messages.length && !pending && !modelNotice && (
              <div className="scene-invitation">
                <span>{copy.invitation}</span>
                <small>{copy.invitationDetail}</small>
              </div>
            )}

            {languageSyncing && (
              <div className="scene-thinking language-sync" role="status">
                <span>{languageSyncTarget === "en" ? copy.translatingEn : languageSyncTarget === "zh" ? copy.translatingZh : copy.translating}</span>
                <p>{copy.translatingDetail}</p>
                <Skeleton count={1} baseColor="rgba(35,31,28,.55)" highlightColor="rgba(255,236,196,.25)" height={4} borderRadius={8} />
              </div>
            )}

            {languageSyncFailed && !languageSyncing && (
              <div className="scene-error" role="status">
                <span>{copy.translationFailed}</span>
                <button type="button" onClick={() => changeLocale(locale)}>{copy.retryTranslation}</button>
              </div>
            )}

            {pending && (
              <div className="scene-thinking" role="status">
                <span>{waitingCopy.title}</span>
                <button type="button" onClick={pauseForUser}>{copy.pause}</button>
                <p>{waitingCopy.detail}</p>
                <Skeleton count={1} baseColor="rgba(35,31,28,.55)" highlightColor="rgba(255,236,196,.25)" height={4} borderRadius={8} />
              </div>
            )}

            {modelNotice && (
              <div className="scene-error" role="status">
                <span>{modelNotice}</span>
                {failedRound && (
                  <button
                    type="button"
                    onClick={() => void runTopic(failedRound.topic, failedRound.prompt, {
                      turns: failedRound.remaining,
                      appendUserQuestion: false,
                      userContribution: failedRound.userContribution,
                    })}
                    disabled={pending}
                  >{copy.retry}</button>
                )}
              </div>
            )}

            <form className="spatial-question-input" onSubmit={submitQuestion}>
              <button type="button" className={listening ? "spatial-mic listening" : "spatial-mic"} onClick={startListening} aria-label={copy.voiceInput}>{listening ? "···" : "＋"}</button>
              <textarea
                ref={questionInputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={pending
                  ? copy.waitInput
                  : latestFigureMessage
                    ? copy.continueInput
                    : copy.firstInput}
                rows={1}
              />
              <button type="submit" className="spatial-send" disabled={!input.trim() || pending || languageSyncing} aria-label={copy.send}>↑</button>
            </form>
          </div>

          <footer className="spatial-footnote">
            <span>{copy.footerDisclosure}</span>
            <span>{messages.filter((item) => item.speakerId !== "user").length} {copy.responses}</span>
          </footer>
        </section>
      )}

      {view === "map" && (
        <section className="map-screen map-tabletop-screen" aria-label={copy.mapTrace}>
          <div className={`unfinished-map map-tabletop map-cast-${selected.length}`}>
            <header className="map-toolbar">
              <button className="map-back" onClick={() => setView("table")}>{copy.backTable}</button>
              <div className="map-caption">
                <small>{copy.mapTrace}</small>
                <span>{copy.mapSummary}</span>
              </div>
              <div className="map-toolbar-actions">
                <button onClick={() => openSourceDrawer()}>{inspectedSourceCount} {copy.sourceEntries}</button>
                <button onClick={downloadRecord}>{copy.save}</button>
              </div>
            </header>

            <div className="map-whisper">
              <span>{copy.mapHint}</span>
              <small>{directResponseCount} {copy.directReplies}</small>
            </div>

            <svg className="map-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {selectedFigures.map((figure, index) => {
                const position = mapPositions[index];
                const lastMessage = [...messages].reverse().find((message) => message.speakerId === figure.id && message.turn);
                if (!position || !lastMessage) return null;
                const targetIndex = lastMessage.targetId && lastMessage.targetId !== "user"
                  ? selected.indexOf(lastMessage.targetId)
                  : -1;
                const targetPosition = targetIndex >= 0 ? mapPositions[targetIndex] : undefined;
                const tone = lastMessage.relation === "质疑"
                  ? "challenge"
                  : lastMessage.relation === "赞同·补充"
                    ? "agree"
                    : "reframe";
                return (
                  <line
                    key={`path-${lastMessage.id}`}
                    x1={targetPosition?.x ?? 50}
                    y1={targetPosition?.y ?? 43}
                    x2={position.x}
                    y2={position.y}
                    className={`map-path path-tone-${tone}`}
                  />
                );
              })}
            </svg>

            <button className="map-question-card" onClick={() => setMapFocusId(null)} aria-label={copy.yourQuestion}>
              <small>{copy.yourQuestion}</small>
              <strong>{question}</strong>
              <span>{messages.length ? `${directResponseCount} ${copy.noConclusion}` : copy.notStarted}</span>
            </button>

            {selectedFigures.map((figure, index) => {
              const position = mapPositions[index];
              const lastMessage = [...messages].reverse().find((message) => message.speakerId === figure.id && message.turn);
              const lastMessageText = lastMessage ? localizedMessageText(lastMessage, locale) : "";
              const messageStageDefinition = discussionStages.find((item) => item.id === lastMessage?.stage);
              const messageStage = messageStageDefinition ? stageLabel(messageStageDefinition) : "";
              const paperStyle = {
                "--map-x": `${position?.x ?? 50}%`,
                "--map-y": `${position?.y ?? 50}%`,
                "--map-rotate": `${position?.rotate ?? 0}deg`,
                "--map-accent": figure.color,
              } as CSSProperties;
              return (
                <button
                  key={figure.id}
                  className={`map-node map-paper node-${index} ${lastMessage && mapFocusId === lastMessage.id ? "focused" : ""}`}
                  style={paperStyle}
                  onClick={() => lastMessage && setMapFocusId(lastMessage.id)}
                  aria-pressed={Boolean(lastMessage && mapFocusId === lastMessage.id)}
                  disabled={!lastMessage}
                >
                  <Portrait id={figure.id} small />
                  <span>
                    <strong>{figureName(figure)}</strong>
                    <small>{messageStage ? `${messageStage} · ` : ""}{lastMessage ? relationLabel(lastMessage.relation) : figureRole(figure)}{lastMessage?.targetId ? ` · ${copy.reply} ${lastMessage.targetId === "user" ? copy.you : figureById[lastMessage.targetId] ? figureName(figureById[lastMessage.targetId]) : ""}` : ""}</small>
                  </span>
                  <p>{lastMessage ? `${lastMessageText.slice(0, 58)}${lastMessageText.length > 58 ? "…" : ""}` : copy.mapNoReply}</p>
                  <i>{lastMessage ? copy.mapOpenReply : ""}</i>
                </button>
              );
            })}

            {userMapContributions.length > 0 && (
              <div className="map-user-notes" aria-label={copy.mapUserTrace}>
                {userMapContributions.map((message, index) => (
                  <article key={message.id} style={{ "--note-index": index } as CSSProperties}>
                    <small>{copy.mapUserTrace}</small>
                    <p>{message.text}</p>
                  </article>
                ))}
              </div>
            )}

            {focusedMapMessage ? (
              <aside className="map-inspector" aria-live="polite">
                <button className="map-inspector-close" onClick={() => setMapFocusId(null)} aria-label={copy.mapClearFocus}>×</button>
                <small>{figureById[focusedMapMessage.speakerId] ? figureName(figureById[focusedMapMessage.speakerId]) : ""} · {relationLabel(focusedMapMessage.relation)}</small>
                <p>{focusedMapText}</p>
                <footer>
                  {focusedMapMessage.sources?.length ? <button onClick={() => openSourceDrawer(focusedMapMessage.sources)}>{copy.mapSourcesUsed} ↗</button> : null}
                  <button onClick={() => {
                    const tension = localizedTurn(focusedMapMessage, locale)?.unresolved_tension || latestUnresolvedTension;
                    setView("table");
                    setInput(tension);
                    window.setTimeout(() => questionInputRef.current?.focus(), 120);
                  }}>{copy.mapBackToQuestion}</button>
                </footer>
              </aside>
            ) : (
              <aside className="map-notebook">
                <small>{copy.unfinished}</small>
                <strong>{latestUnresolvedTension}</strong>
                <button onClick={() => {
                  setView("table");
                  setInput(latestUnresolvedTension);
                  window.setTimeout(() => questionInputRef.current?.focus(), 120);
                }}>{copy.returnUnfinished}</button>
              </aside>
            )}

            <footer className="map-table-legend">
              <span><i className="trace-agree" />{copy.mapPathAgree}</span>
              <span><i className="trace-reframe" />{copy.mapPathReframe}</span>
              <span><i className="trace-challenge" />{copy.mapPathChallenge}</span>
            </footer>
          </div>
        </section>
      )}

      {aboutOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAboutOpen(false)}>
          {/* The inner dialog stops pointer bubbling so only the backdrop closes it. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
          <section className="modal-panel about-panel" role="dialog" aria-modal="true" aria-labelledby="about-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setAboutOpen(false)} aria-label={copy.close}>×</button>
            <h2 id="about-title">{copy.aboutTitleA}<br />{copy.aboutTitleB} <em>{copy.aboutTitleEm}</em></h2>
            <div className="method-grid">
              <article><h3>{copy.method1Title}</h3><p>{copy.method1Body}</p></article>
              <article><h3>{copy.method2Title}</h3><p>{copy.method2Body}</p></article>
              <article><h3>{copy.method3Title}</h3><p>{copy.method3Body}</p></article>
              <article><h3>{copy.method4Title}</h3><p>{copy.method4Body}</p></article>
            </div>
            <div className="disclosure"><strong>{copy.prototype}</strong><p>{copy.prototypeBody}</p></div>
            <button className="primary-button" onClick={() => { setAboutOpen(false); openSourceDrawer(); }}>{copy.viewSourceEntry}</button>
          </section>
        </div>
      )}

      {sourcesOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSourcesOpen(false)}>
          {/* The inner dialog stops pointer bubbling so source links remain usable. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
          <section className="modal-panel source-panel" role="dialog" aria-modal="true" aria-labelledby="sources-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSourcesOpen(false)} aria-label={copy.close}>×</button>
            <h2 id="sources-title">{copy.sourceDrawer}</h2>
            <p className="source-intro">
              {activeSources
                ? copy.actualSourceIntro
                : copy.generalSourceIntro}
            </p>
            <div className={`source-list ${activeSources ? "actual-sources" : ""}`}>
              {activeSources
                ? activeSources.map((source, index) => (
                    <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer">
                      <span>{CITATION_KIND_LABELS[locale][source.kind] ?? source.kind}</span>
                      <strong>{source.creator}</strong>
                      <p>
                        {source.title}
                        <small>{[source.date, source.locator].filter(Boolean).join(" · ")}</small>
                        <em>{copy.supports}{source.supports}</em>
                      </p>
                      <i>↗</i>
                    </a>
                  ))
                : sources.filter((source) => !selected.length || selected.includes(source.figureId)).map((source) => (
                    <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                      <span>{copy.originalSource}</span><strong>{locale === "en" ? source.whoEn : source.who}</strong><p>{source.title}<small>{locale === "en" ? source.noteEn : source.note}</small></p><i>↗</i>
                    </a>
                  ))}
            </div>
            <p className="source-footnote">{copy.sourceFootnote}</p>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
