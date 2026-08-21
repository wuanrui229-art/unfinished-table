import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

const environment = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const executionContext = { waitUntil() {}, passThroughOnException() {} };

test("dialogue API accepts one-person tables and reports missing model setup honestly", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/dialogue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: "什么是值得过的生活？",
        castIds: ["zhuangzi"],
        history: [],
      }),
    }),
    environment,
    executionContext,
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, "MODEL_NOT_CONFIGURED");
  assert.match(body.message, /真实模型尚未连接/);
  assert.doesNotMatch(JSON.stringify(body), /逍遥|算法力量|你不必真的被持续监看/);
});

test("dialogue API rejects an empty cast before attempting generation", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/dialogue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "可以开始吗？", castIds: [], history: [] }),
    }),
    environment,
    executionContext,
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.code, "INVALID_REQUEST");
  assert.match(body.message, /1–6 位人物/);
});

test("preparation API selects an invited speaker without waiting for model configuration", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/dialogue/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: "技术让我们更自由了吗？",
        castIds: ["zhuangzi", "alan-turing"],
        history: [],
      }),
    }),
    environment,
    executionContext,
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.ok(["zhuangzi", "alan-turing"].includes(body.preparation.speaker_id));
  assert.equal(body.preparation.responds_to, "user");
  assert.ok(body.preparation.allowed_actions.length > 0);
});

test("dialogue API rejects a stale prepared speaker before calling a model", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/dialogue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: "可以开始吗？",
        castIds: ["zhuangzi", "audre-lorde"],
        history: [],
        preparedSpeakerId: "audre-lorde",
      }),
    }),
    environment,
    executionContext,
  );

  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, "STALE_PREPARATION");
});
