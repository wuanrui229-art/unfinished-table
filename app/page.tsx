"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Skeleton from "react-loading-skeleton";

type View = "welcome" | "select" | "table" | "map";
type Relation = "界定" | "赞同·补充" | "质疑" | "转向" | "承认未知";
type SourceStatus = "思想转译" | "当代推演" | "边界说明";

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
};

type Message = {
  id: string;
  speakerId: string;
  text: string;
  relation: Relation;
  status: SourceStatus;
  sourceId?: string;
  targetId?: string;
};

type Topic = "question" | "archive" | "today" | "life" | "unknown";

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
  },
  {
    id: "marx",
    name: "卡尔·马克思",
    nativeName: "Karl Marx",
    years: "1818—1883",
    role: "追问谁拥有工具",
    greeting: "Guten Abend. 先谈谈条件。",
    notices: "技术背后的劳动、所有权与异化",
    challenges: "会质疑庄子：仅仅在心里逍遥，能改变被迫劳动吗？",
    color: "#a84f46",
  },
  {
    id: "arendt",
    name: "汉娜·阿伦特",
    nativeName: "Hannah Arendt",
    years: "1906—1975",
    role: "把人带回公共世界",
    greeting: "Guten Abend. 让我们彼此出现。",
    notices: "行动、共同世界与公共自由",
    challenges: "会补充马克思：自由不只发生在生产关系里。",
    color: "#5f8275",
  },
  {
    id: "foucault",
    name: "米歇尔·福柯",
    nativeName: "Michel Foucault",
    years: "1926—1984",
    role: "检查房间里的权力",
    greeting: "Bonsoir. 谁写下了规则？",
    notices: "看似中性的分类、规范与凝视",
    challenges: "会质疑图灵：问题不只是机器能否思考，而是谁规定答案。",
    color: "#758aa3",
  },
  {
    id: "beauvoir",
    name: "西蒙娜·德·波伏瓦",
    nativeName: "Simone de Beauvoir",
    years: "1908—1986",
    role: "让抽象自由落到处境",
    greeting: "Bonsoir. 自由从不悬在空中。",
    notices: "处境、他者与彼此自由的条件",
    challenges: "会追问阿伦特：谁能进入那个公共世界？",
    color: "#a55b78",
  },
  {
    id: "turing",
    name: "艾伦·图灵",
    nativeName: "Alan Turing",
    years: "1912—1954",
    role: "拆开机器的假设",
    greeting: "Good evening. 先把问题说准确。",
    notices: "机器能力、判断标准与人的投射",
    challenges: "会纠正福柯：别把每个技术问题都提前写成权力寓言。",
    color: "#cf7b4d",
  },
];

const figureById = Object.fromEntries(figures.map((figure) => [figure.id, figure]));

const prompts: Record<Topic, { label: string; question: string; object: string }> = {
  question: {
    label: "桌心的问题卡",
    question: "先别急着回答：这句话里的“自由”究竟指什么？",
    object: "？",
  },
  archive: {
    label: "一叠工作记录",
    question: "当技术替我们完成更多工作，它也会拿走什么？",
    object: "▤",
  },
  today: {
    label: "一部亮着的手机",
    question: "如果算法替我们做出越来越多选择，我们更自由了吗？",
    object: "▯",
  },
  life: {
    label: "一封没有寄出的信",
    question: "有没有一种时刻，让你自己也怀疑过“自由”这个词？",
    object: "✉",
  },
  unknown: {
    label: "一本空白笔记",
    question: "关于今天的技术，有什么是你无法替我们回答的？",
    object: "□",
  },
};

const lines: Record<string, Record<Topic, string>> = {
  zhuangzi: {
    question: "你说自由，先像是在说一条鱼离开了网。但若它日日想着那张网，它真的离开了吗？先看看，是谁替你规定了“大”与“小”、“有用”与“无用”。",
    archive: "省下劳作未必等于得到逍遥。若空出来的时辰又被功名、比较和催促占满，人不过是从一只机括，走进另一只机括。",
    today: "算法像一阵顺风，能托起大鹏，也能让小鸟以为天空只有推荐给它的那一角。方便不是罪，只是别把熟悉误作天地。",
    life: "我不能把寓言当作我的日记。留下来的文本更愿意让身份松动：梦蝶之后，急着断定谁是真、谁是假，也许已经错过问题。",
    unknown: "我不识你们的机器，也不能装作见过。可我会问：它是在扩大你游走的天地，还是让你更熟练地服从一个看不见的尺度？",
  },
  marx: {
    question: "若一个人只能把自己的时间卖掉，所谓选择往往只是菜单变长。自由不能只是一种内心感受；它还取决于谁拥有生产条件，谁决定劳动的目的。",
    archive: "机器可以缩短必要劳动，也可以让劳动者更依附机器。关键不在机器本身，而在它进入了怎样的所有权关系，以及生产成果归谁。",
    today: "推荐系统替你省下判断，却也把你的注意、偏好和行为变成可交易的材料。先问一句：这个便利制造的价值，最终积累在谁手中？",
    life: "请不要把贫困浪漫化成性格。我在伦敦长期写作、借贷，也依靠家人与友人支撑。物质处境不是思想的背景布，它会进入每一页。",
    unknown: "我没有见过生成式人工智能。若据我的问题意识推演，我会先查劳动过程与资本集中；但具体判断仍需要你们时代的数据，而不是我的口气。",
  },
  arendt: {
    question: "自由不仅是免于阻碍，也是在共同世界中开始某件新事，并让别人看见、回应。若每个人都被安静地照料，却失去公共行动，便利并不等于自由。",
    archive: "自动化也许减轻劳苦，却不会自动产生一个值得共同参与的世界。释放出来的时间，究竟成为行动的空间，还是只剩消费？",
    today: "当信息流为每个人定制一个世界，我们可能更难共享事实。没有共同世界，行动会退化成彼此不可见的反应。",
    life: "流亡让我很难把家园理解成一块理所当然的土地。能在多元的人群中被听见、又能听见别人，这种公共归属并不稳固。",
    unknown: "我不能替你判断一项具体系统是否公正。我能留下一个检验：它让人们更能共同出现和行动，还是把每个人变成可预测、可管理的行为？",
  },
  foucault: {
    question: "别急着寻找自由的本质。先看哪些制度、测量和话语把某种行为命名为正常，再把别的可能变得难以想象。自由也许从识别这些关系开始。",
    archive: "效率的记录从不只是记录。表格、排名、时间切片会训练身体，也制造一种可比较的人。机器拿走的，可能是偏离标准而不被察觉的余地。",
    today: "你不必真的被持续监看，只要知道系统可能在看，便会开始修整自己。算法的力量未必以禁止出现，它也通过建议、排序和可见性工作。",
    life: "不要把我的经历剪成一条解释一切的钥匙。个人生活可以说明问题从何处变得迫切，却不能替代对制度、档案和实践的分析。",
    unknown: "我不知道这套模型内部发生了什么，也拒绝用一个全能的“权力”答案盖过去。请把训练数据、分类标准和申诉路径拿到桌上，我们再谈。",
  },
  beauvoir: {
    question: "抽象地说“人人自由”太容易。自由总在身体、金钱、性别和他人的目光中展开。我要问的是：谁有条件把可能变成行动？",
    archive: "技术省下的时间不会平均落到每个人手里。若照护仍被当作某些人的天职，新的自由可能只是把旧负担藏得更好。",
    today: "算法从既有世界学习，也会把旧有处境伪装成中性的预测。一个选择若以他人的受限为代价，就很难称为真正的解放。",
    life: "写作、旅行与关系让我不断修正自己，但请别把“独立女性”变成一个没有矛盾的姿势。自由必须在具体选择及其后果里承担。",
    unknown: "我无法知道自己会怎样使用今天的平台。可以推演的是：我会检查它是否把人固定成某种“天生如此”的类别，并追问这种固定服务了谁。",
  },
  turing: {
    question: "也许“机器是否让人自由”像“机器能否思考”一样，词义会把讨论拖住。我们不妨先约定一个可观察的检验：谁能做此前做不到的事？谁失去了控制？",
    archive: "把步骤交给机器，可以释放注意力；但若人不再理解步骤，失去的可能是检查错误与改变规则的能力。自动化的边界需要被设计，而不是被崇拜。",
    today: "系统并没有像人那样替你“想要”。它依据目标与数据产生结果。真正的问题是：目标由谁设定，你是否能看见它，又能否拒绝？",
    life: "我可以谈工作方法，却不该把未留下记录的内心戏补齐。长跑、密码分析和对机器的耐心是有资料可循的；其余请允许空白存在。",
    unknown: "我没见过今天的模型，不能假装知道它的能力上限。把演示当成智能证明是不够的；请给出任务、误差、对照与可重复的观察。",
  },
};

const topicOrder: Record<Topic, string[]> = {
  question: ["arendt", "zhuangzi", "marx", "beauvoir", "foucault", "turing"],
  archive: ["marx", "turing", "beauvoir", "arendt", "foucault", "zhuangzi"],
  today: ["foucault", "turing", "arendt", "beauvoir", "marx", "zhuangzi"],
  life: ["beauvoir", "arendt", "marx", "turing", "zhuangzi", "foucault"],
  unknown: ["turing", "zhuangzi", "foucault", "beauvoir", "arendt", "marx"],
};

const sources = [
  { id: "ZHU-01", who: "庄子", title: "《庄子·逍遥游》", note: "原典与英译资料入口", url: "https://ctext.org/zhuangzi/enjoyment-in-untroubled-ease" },
  { id: "MAR-01", who: "马克思", title: "《1844年经济学哲学手稿·异化劳动》", note: "劳动、生产物与异化", url: "https://www.marxists.org/archive/marx/works/1844/manuscripts/labour.htm" },
  { id: "ARE-01", who: "阿伦特", title: "The Human Condition", note: "劳动、工作、行动与共同世界", url: "https://press.uchicago.edu/ucp/books/book/chicago/H/bo29137972.html" },
  { id: "FOU-01", who: "福柯", title: "Discipline and Punish: Panopticism", note: "规训、检查与可见性", url: "https://www.foucault.info/documents/foucault.disciplineAndPunish.panOpticism/" },
  { id: "BEA-01", who: "波伏瓦", title: "The Ethics of Ambiguity", note: "处境中的自由与他人的自由", url: "https://www.marxists.org/reference/subject/ethics/de-beauvoir/ambiguity/" },
  { id: "TUR-01", who: "图灵", title: "Computing Machinery and Intelligence", note: "问题重述、检验与机器智能", url: "https://academic.oup.com/mind/article/LIX/236/433/986238" },
];

const sourceByFigure: Record<string, string> = {
  zhuangzi: "ZHU-01",
  marx: "MAR-01",
  arendt: "ARE-01",
  foucault: "FOU-01",
  beauvoir: "BEA-01",
  turing: "TUR-01",
};

function Portrait({ id, small = false }: { id: string; small?: boolean }) {
  return (
    <div className={`portrait portrait-${id} ${small ? "portrait-small" : ""}`} aria-hidden="true">
      <span className="portrait-halo" />
      <span className="portrait-neck" />
      <span className="portrait-face">
        <span className="portrait-hair" />
        <span className="portrait-brow brow-left" />
        <span className="portrait-brow brow-right" />
        <span className="portrait-eye eye-left" />
        <span className="portrait-eye eye-right" />
        <span className="portrait-nose" />
        <span className="portrait-mouth" />
      </span>
      <span className="portrait-clothes" />
    </div>
  );
}

function IntroMark() {
  return (
    <div className="intro-mark" aria-hidden="true">
      <span className="orbit orbit-one" />
      <span className="orbit orbit-two" />
      <span className="question-dot">？</span>
      <span className="mark-note note-one">未完成</span>
      <span className="mark-note note-two">仍在发生</span>
    </div>
  );
}

function AppNav({ onAbout }: { onAbout: () => void }) {
  return (
    <nav className="app-nav" aria-label="主导航">
      <button className="wordmark" onClick={() => window.location.reload()} aria-label="回到开始">
        <span className="wordmark-dot" />
        未竟之桌
      </button>
      <div className="nav-side">
        <span className="edition">一次跨时代的 AI 思想实验</span>
        <button className="text-button" onClick={onAbout}>方法与来源</button>
      </div>
    </nav>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("welcome");
  const [selected, setSelected] = useState<string[]>([]);
  const [question, setQuestion] = useState("技术让我们更自由了吗？");
  const [messages, setMessages] = useState<Message[]>([]);
  const [stage, setStage] = useState(0);
  const [pending, setPending] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [coffeeLevel, setCoffeeLevel] = useState(0);
  const [lampWarm, setLampWarm] = useState(true);
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [input, setInput] = useState("");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [toast, setToast] = useState("");
  const dialogueEnd = useRef<HTMLDivElement>(null);

  const selectedFigures = useMemo(
    () => selected.map((id) => figureById[id]).filter(Boolean),
    [selected],
  );

  useEffect(() => {
    const saved = window.localStorage.getItem("unfinished-table-session");
    if (!saved) return;
    try {
      const session = JSON.parse(saved) as { selected?: string[]; messages?: Message[]; question?: string; stage?: number };
      if (session.selected?.length) setSelected(session.selected);
      if (session.messages?.length) setMessages(session.messages);
      if (session.question) setQuestion(session.question);
      if (session.stage) setStage(session.stage);
    } catch {
      window.localStorage.removeItem("unfinished-table-session");
    }
  }, []);

  useEffect(() => {
    if (!selected.length) return;
    window.localStorage.setItem(
      "unfinished-table-session",
      JSON.stringify({ selected, messages, question, stage }),
    );
  }, [selected, messages, question, stage]);

  useEffect(() => {
    dialogueEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, pending]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const toggleFigure = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 5) {
        notify("桌边最多留五把椅子");
        return current;
      }
      return [...current, id];
    });
  };

  const beginSession = () => {
    if (selected.length < 3) {
      notify("请至少邀请三位人物入席");
      return;
    }
    setMessages([]);
    setStage(0);
    setView("table");
  };

  const speak = (text: string) => {
    if (!voiceOn || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.94;
    utterance.pitch = 0.92;
    window.speechSynthesis.speak(utterance);
  };

  const runTopic = async (topic: Topic, customQuestion?: string) => {
    if (pending) return;
    setPending(true);
    const prompt = customQuestion || prompts[topic].question;
    const ordered = topicOrder[topic].filter((id) => selected.includes(id));
    const speakers = [...ordered, ...selected.filter((id) => !ordered.includes(id))].slice(0, Math.min(4, selected.length));
    const relations: Relation[] = [stage === 0 ? "界定" : "转向", "质疑", "赞同·补充", topic === "unknown" ? "承认未知" : "转向"];

    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, speakerId: "user", text: prompt, relation: "转向", status: "思想转译" },
    ]);

    await new Promise((resolve) => window.setTimeout(resolve, 520));

    for (let index = 0; index < speakers.length; index += 1) {
      const speakerId = speakers[index];
      setActiveSpeaker(speakerId);
      await new Promise((resolve) => window.setTimeout(resolve, index === 0 ? 720 : 940));
      const status: SourceStatus = topic === "unknown" || topic === "today" ? "当代推演" : "思想转译";
      const message: Message = {
        id: `${topic}-${speakerId}-${Date.now()}`,
        speakerId,
        text: lines[speakerId][topic],
        relation: relations[index] || "赞同·补充",
        status,
        sourceId: sourceByFigure[speakerId],
        targetId: index > 0 ? speakers[index - 1] : undefined,
      };
      setMessages((current) => [...current, message]);
      speak(message.text);
    }

    setActiveSpeaker(null);
    setStage((current) => Math.min(5, current + 1));
    setPending(false);
  };

  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || pending) return;
    const topic: Topic = /不知道|无法|未来|边界/.test(trimmed)
      ? "unknown"
      : /工作|劳动|平台|资本|机器/.test(trimmed)
        ? "archive"
        : /经历|生活|害怕|怀疑/.test(trimmed)
          ? "life"
          : "today";
    setInput("");
    void runTopic(topic, trimmed);
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
      notify("当前浏览器暂不支持语音输入");
      return;
    }
    const recognition = new RecognitionConstructor();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.onresult = (event) => setInput(event.results[0][0].transcript);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const pourCoffee = () => {
    setCoffeeLevel((level) => (level + 1) % 4);
    const reactions = ["咖啡壶还很满。", "杯子里有了热气。", "有人把糖推到桌子中央。", "庄子看了看杯底，没有评论。"];
    notify(reactions[(coffeeLevel + 1) % reactions.length]);
  };

  const downloadRecord = () => {
    const content = [
      "未竟之桌｜讨论记录",
      `问题：${question}`,
      `人物：${selectedFigures.map((figure) => figure.name).join("、")}`,
      "",
      ...messages.map((message) => {
        const speaker = message.speakerId === "user" ? "你" : figureById[message.speakerId]?.name;
        return `${speaker}［${message.relation}／${message.status}］\n${message.text}`;
      }),
      "",
      "说明：以上人物发言为 AI 产品原型中的思想转译，不是真实引语。",
    ].join("\n\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "未竟之桌-讨论记录.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className={`site-shell ${lampWarm ? "lamp-warm" : "lamp-cool"}`}>
      <AppNav onAbout={() => setAboutOpen(true)} />

      {view === "welcome" && (
        <section className="welcome-screen">
          <div className="welcome-copy">
            <p className="eyebrow"><span /> FUTURE ARCHIVE · 001</p>
            <h1>有些问题，<br /><em>不该被回答完。</em></h1>
            <p className="welcome-lede">
              邀请不同时代的思想者坐到同一张桌边。你带来问题，
              他们带来分歧——而真正留下来的，是你下一步想追问什么。
            </p>
            <div className="welcome-actions">
              <button className="primary-button" onClick={() => setView("select")}>
                推开门，去选人 <span>↗</span>
              </button>
              <button className="quiet-button" onClick={() => setAboutOpen(true)}>这不是“复活”历史人物</button>
            </div>
          </div>
          <div className="welcome-art">
            <IntroMark />
            <div className="floating-question question-a">技术给了我们选择，<br />还是替我们选择？</div>
            <div className="floating-question question-b">谁有资格说<br />“我很自由”？</div>
            <div className="door-label">今晚的话题</div>
            <div className="tonight-question">技术让我们<br />更自由了吗？</div>
          </div>
          <div className="welcome-foot">
            <span>选择 3–5 位人物</span><span>碰一碰桌上物件</span><span>带走一张未竟地图</span>
          </div>
        </section>
      )}

      {view === "select" && (
        <section className="selection-screen">
          <header className="selection-header">
            <div>
              <p className="eyebrow"><span /> STEP 01 · 邀请入席</p>
              <h2>今晚，你想听谁<br />把问题<em>说复杂一点？</em></h2>
            </div>
            <div className="question-editor">
              <label htmlFor="main-question">带到桌上的未竟之问</label>
              <textarea id="main-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={60} />
              <span>{question.length}/60</span>
            </div>
          </header>

          <div className="figure-wall" aria-label="可选人物">
            {figures.map((figure, index) => {
              const isSelected = selected.includes(figure.id);
              return (
                <button
                  key={figure.id}
                  className={`figure-card card-${index} ${isSelected ? "selected" : ""}`}
                  onClick={() => toggleFigure(figure.id)}
                  aria-pressed={isSelected}
                >
                  <span className="figure-index">0{index + 1}</span>
                  <span className="greeting-bubble">{figure.greeting}<small>情境化问候 · 非真实引语</small></span>
                  <Portrait id={figure.id} />
                  <span className="figure-meta">
                    <strong>{figure.name}</strong>
                    <span>{figure.nativeName} · {figure.years}</span>
                  </span>
                  <span className="figure-role">{figure.role}</span>
                  <span className="figure-notice">更注意：{figure.notices}</span>
                  <span className="figure-challenge">{figure.challenges}</span>
                  <span className="selection-mark">{isSelected ? "已入席" : "邀请 +"}</span>
                </button>
              );
            })}
          </div>

          <footer className="selection-footer">
            <button className="back-button" onClick={() => setView("welcome")}>← 回到门外</button>
            <div className="selection-count">
              <div className="mini-stack">
                {selectedFigures.map((figure) => <Portrait key={figure.id} id={figure.id} small />)}
              </div>
              <span>已邀请 {selected.length}/5 位</span>
            </div>
            <button className="primary-button" disabled={selected.length < 3} onClick={beginSession}>
              为他们摆好座位 <span>↗</span>
            </button>
          </footer>
        </section>
      )}

      {view === "table" && (
        <section className="table-screen">
          <header className="session-header">
            <div>
              <p className="eyebrow"><span /> STEP 02 · 未竟之桌</p>
              <h2>{question}</h2>
            </div>
            <div className="session-tools">
              <button className={voiceOn ? "tool-button active" : "tool-button"} onClick={() => setVoiceOn((value) => !value)} aria-pressed={voiceOn}>
                {voiceOn ? "声音已开" : "开启朗读"}
              </button>
              <button className="tool-button" onClick={() => setSourcesOpen(true)}>查看来源</button>
              <button className="map-button" onClick={() => setView("map")} disabled={messages.length < 2}>未竟地图 ↗</button>
            </div>
          </header>

          <div className="session-progress" aria-label={`讨论进度 ${stage}/5`}>
            {["界定", "证据", "分歧", "今天", "留下问题"].map((label, index) => (
              <span key={label} className={stage > index ? "done" : stage === index ? "current" : ""}>
                <i>{index + 1}</i>{label}
              </span>
            ))}
          </div>

          <div className="table-layout">
            <div className="room-scene">
              <div className="window-scene" aria-hidden="true"><i /><i /><span>22:47</span></div>
              <button className="lamp" onClick={() => setLampWarm((value) => !value)} aria-label="切换桌灯"><span /></button>
              <div className="table-shadow" />
              <div className="round-table">
                <div className="table-grain grain-one" />
                <div className="table-grain grain-two" />
                <button className="question-card" onClick={() => void runTopic("question")} disabled={pending}>
                  <small>今晚的未竟之问</small>
                  <strong>{question}</strong>
                  <span>碰一下，从“自由”说起 ↗</span>
                </button>

                <button className="table-object object-archive" onClick={() => void runTopic("archive")} disabled={pending} aria-label={prompts.archive.label}>
                  <span>{prompts.archive.object}</span><i>{prompts.archive.label}<b>{prompts.archive.question}</b></i>
                </button>
                <button className="table-object object-phone" onClick={() => void runTopic("today")} disabled={pending} aria-label={prompts.today.label}>
                  <span>{prompts.today.object}</span><i>{prompts.today.label}<b>{prompts.today.question}</b></i>
                </button>
                <button className="table-object object-letter" onClick={() => void runTopic("life")} disabled={pending} aria-label={prompts.life.label}>
                  <span>{prompts.life.object}</span><i>{prompts.life.label}<b>{prompts.life.question}</b></i>
                </button>
                <button className="table-object object-notebook" onClick={() => void runTopic("unknown")} disabled={pending} aria-label={prompts.unknown.label}>
                  <span>{prompts.unknown.object}</span><i>{prompts.unknown.label}<b>{prompts.unknown.question}</b></i>
                </button>
                <button className={`coffee-pot coffee-${coffeeLevel}`} onClick={pourCoffee} aria-label="给大家倒咖啡">
                  <span>☕</span><i>只是一壶咖啡。<br />没有学习目标。</i>
                </button>
                <div className="cake" aria-label="桌上的蛋糕"><span /><span /><i>今晚的蛋糕</i></div>
              </div>

              {selectedFigures.map((figure, index) => (
                <div key={figure.id} className={`seat seat-${index} ${activeSpeaker === figure.id ? "speaking" : ""}`}>
                  <div className="seat-chair" />
                  <Portrait id={figure.id} />
                  <div className="seat-name"><strong>{figure.name}</strong><span>{activeSpeaker === figure.id ? "正在回应" : figure.role}</span></div>
                </div>
              ))}

              <div className="user-seat">
                <span className="empty-plate"><i /></span>
                <span>你坐在这里</span>
              </div>
            </div>

            <aside className="dialogue-drawer" aria-label="讨论记录">
              <div className="drawer-title">
                <span>桌边正在发生</span>
                <small>{messages.length ? `${messages.filter((item) => item.speakerId !== "user").length} 个回应` : "碰一下桌上的物件"}</small>
              </div>
              <div className="dialogue-stream" aria-live="polite">
                {!messages.length && !pending && (
                  <div className="empty-dialogue">
                    <span>✦</span>
                    <p>问题卡、手机、信件和工作记录都藏着一个开场问题。</p>
                    <small>人物不会依次发表演讲，他们会回应彼此。</small>
                  </div>
                )}
                {messages.map((message) => {
                  if (message.speakerId === "user") {
                    return <div key={message.id} className="user-message"><small>你把问题放上桌</small><p>{message.text}</p></div>;
                  }
                  const figure = figureById[message.speakerId];
                  const target = message.targetId ? figureById[message.targetId] : undefined;
                  return (
                    <article key={message.id} className={`dialogue-message relation-${message.relation.replace("·", "-")}`}>
                      <div className="message-speaker"><Portrait id={figure.id} small /><span><strong>{figure.name}</strong><small>{target ? `回应 ${target.name}` : figure.role}</small></span></div>
                      <span className="relation-pill">{message.relation}</span>
                      <p>{message.text}</p>
                      <button className="source-tag" onClick={() => setSourcesOpen(true)}>{message.status} · {message.sourceId} ↗</button>
                    </article>
                  );
                })}
                {pending && (
                  <div className="thinking-card">
                    <small>{activeSpeaker ? `${figureById[activeSpeaker].name} 正在组织回应` : "桌边安静了一会儿"}</small>
                    <Skeleton count={3} baseColor="#262b31" highlightColor="#3a4148" height={8} borderRadius={8} />
                  </div>
                )}
                <div ref={dialogueEnd} />
              </div>
              <form className="question-input" onSubmit={submitQuestion}>
                <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="也可以直接问一个问题……" rows={2} />
                <button type="button" className={listening ? "mic-button listening" : "mic-button"} onClick={startListening} aria-label="语音输入">{listening ? "收音中" : "语音"}</button>
                <button type="submit" className="send-button" disabled={!input.trim() || pending}>放上桌 ↗</button>
              </form>
            </aside>
          </div>

          <p className="interpretation-note">所有人物发言均为基于选定资料的 AI 思想转译，不是真实引语，也不能替代原著与学术研究。</p>
        </section>
      )}

      {view === "map" && (
        <section className="map-screen">
          <header className="map-header">
            <div>
              <p className="eyebrow"><span /> STEP 03 · 带走分歧</p>
              <h2>这不是结论。<br />是问题<em>变得更清楚</em>之后的样子。</h2>
            </div>
            <div className="map-actions">
              <button className="tool-button" onClick={() => setView("table")}>← 回到桌边</button>
              <button className="primary-button" onClick={downloadRecord}>保存讨论记录 ↓</button>
            </div>
          </header>

          <div className="map-legend">
            <span><i className="line-solid" />赞同并补充</span>
            <span><i className="line-dash" />重新界定</span>
            <span><i className="line-zig" />仍有冲突</span>
            <small>点击人物节点查看其留下的问题</small>
          </div>

          <div className="unfinished-map">
            {selectedFigures.map((figure, index) => <div key={`edge-${figure.id}`} className={`map-edge edge-${index}`} />)}
            <div className="map-center"><small>你带来的问题</small><strong>{question}</strong><span>{messages.length ? "已经留下了可追踪的分歧" : "讨论仍未开始"}</span></div>
            {selectedFigures.map((figure, index) => {
              const lastMessage = [...messages].reverse().find((message) => message.speakerId === figure.id);
              return (
                <button key={figure.id} className={`map-node node-${index}`} onClick={() => notify(lastMessage?.text || figure.notices)}>
                  <Portrait id={figure.id} small />
                  <span><strong>{figure.name}</strong><small>{lastMessage?.relation || figure.role}</small></span>
                  <p>{lastMessage ? lastMessage.text.slice(0, 48) + "…" : figure.notices}</p>
                </button>
              );
            })}
            <div className="map-note">
              <small>WHAT REMAINS UNFINISHED?</small>
              <strong>如果便利、选择与自由不是同一件事，<br />你愿意交给系统的边界在哪里？</strong>
              <button onClick={() => { setView("table"); setInput("我愿意交给系统决定的边界，应该由谁来制定？"); }}>把这个问题带回桌上 ↗</button>
            </div>
          </div>

          <footer className="map-footer">
            <p>建议从原著继续，而不是把生成对话当成答案。</p>
            <button className="text-button" onClick={() => setSourcesOpen(true)}>打开这次讨论的资料入口 ↗</button>
          </footer>
        </section>
      )}

      {aboutOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAboutOpen(false)}>
          <section className="modal-panel about-panel" role="dialog" aria-modal="true" aria-labelledby="about-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setAboutOpen(false)} aria-label="关闭">×</button>
            <p className="eyebrow"><span /> METHOD</p>
            <h2 id="about-title">不是复活，<br />是一次<em>有边界的思想排练。</em></h2>
            <div className="method-grid">
              <article><span>01</span><h3>人物不是权威替身</h3><p>每位人物只是通往其作品、处境与争论的入口。对话是演绎，不是录音。</p></article>
              <article><span>02</span><h3>事实与推演分开</h3><p>界面把“思想转译”“当代推演”“边界说明”分开标注，避免把想象伪装成史料。</p></article>
              <article><span>03</span><h3>保留无法回答</h3><p>当问题越过人物生前经验或资料边界，人物可以承认不知道，而不是继续扮演全知助手。</p></article>
              <article><span>04</span><h3>目标是好奇心</h3><p>它不是学术替代品。最理想的结果，是你关掉网页以后想打开一本书。</p></article>
            </div>
            <div className="disclosure"><strong>原型说明</strong><p>当前版本使用预设、经边界标注的演示对话来验证交互。接入语言模型后，每轮也必须携带 persona、证据编号与不确定性标签。</p></div>
            <button className="primary-button" onClick={() => { setAboutOpen(false); setSourcesOpen(true); }}>查看资料入口 ↗</button>
          </section>
        </div>
      )}

      {sourcesOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSourcesOpen(false)}>
          <section className="modal-panel source-panel" role="dialog" aria-modal="true" aria-labelledby="sources-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSourcesOpen(false)} aria-label="关闭">×</button>
            <p className="eyebrow"><span /> SOURCE DRAWER</p>
            <h2 id="sources-title">资料抽屉</h2>
            <p className="source-intro">这些是本次原型的思想资料入口。对话均为新生成的转译文本，不能反向当作人物原话。</p>
            <div className="source-list">
              {sources.filter((source) => !selected.length || selectedFigures.some((figure) => figure.name.includes(source.who) || source.who.includes(figure.name.split("·").pop() || ""))).map((source) => (
                <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
                  <span>{source.id}</span><strong>{source.who}</strong><p>{source.title}<small>{source.note}</small></p><i>↗</i>
                </a>
              ))}
            </div>
            <p className="source-footnote">公开发布前，仍需由相关领域研究者完成逐条史料审核、版本核对与肖像/声音权利评估。</p>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
