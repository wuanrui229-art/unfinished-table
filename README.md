# 未竟之桌 The Unfinished Table

一个跨时代的 AI 思想对话实验。用户可以邀请历史人物与当代公众人物入席，将一个尚未想明白的问题放到桌上，通过有分歧、有来源、也允许“不知道”的讨论继续思考。

This is an AI-mediated, cross-era dialogue experiment. It is designed to provoke curiosity rather than impersonate real people or replace scholarship.

## 产品特点

- 支持 1–6 位人物入席，不使用固定轮流发言。
- 人物回应会接住上一句，形成赞同、质疑、补充或转向。
- 用户可以随时补充、反驳、追问或带入新观点。
- 中英界面与对话翻译。
- 公开来源、推演边界与不确定性说明。
- 本地保存对话记录和“未竟地图”。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

然后打开 `http://localhost:3000`。

## 模型配置

将密钥写入本地 `.env.local` 或 Vercel Environment Variables。不要把真实密钥提交到 Git。

```env
AI_PROVIDER=kimi
MOONSHOT_API_KEY=
KIMI_MODEL=kimi-k2.6
KIMI_BASE_URL=https://api.moonshot.cn/v1
```

也可以在 `.env.example` 中查看 DeepSeek 与 OpenAI 的空值配置模板。

## 验证

```bash
pnpm test
```

## 伦理声明

页面中的人物回应是 AI 根据公开资料生成的观点转译，不是真实人物的原话、授权代理或学术替代品。
