/**
 * Browser -> original MulmoCast CLI -> real 720x1280 MP4 -> authorized download.
 * No external AI calls, API tokens, Docker, or dedicated video engine.
 * The only mocked part is the LLM inside MulmoCast's existing offline fixture.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrowserServer } from "./sns-video-browser.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const token = "offline-integration-test-access-token";
const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };

async function runOriginalOfflinePipeline(setStep) {
  setStep("既存MulmoCastのオフラインMP4生成");
  await new Promise((done, fail) => {
    const env = {
      ...process.env,
      OPENAI_API_KEY: "",
      GEMINI_API_KEY: "",
      GROQ_API_KEY: "",
      CLOUDFLARE_ACCOUNT_ID: "",
      CLOUDFLARE_API_TOKEN: "",
      LLM_GROQ_API_KEY: "",
      LLM_OPENAI_API_KEY: "",
      IMAGE_OPENAI_API_KEY: "",
      TTS_OPENAI_API_KEY: "",
      SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT: "0",
      SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED: "0",
      SNS_VIDEO_GROQ_FREE_PLAN_CONFIRMED: "0",
      MULMO_STRICT_NETWORK: "1",
    };
    const proc = spawn("bash", ["experiments/04-offline-e2e/run.sh"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    for (const stream of [proc.stdout, proc.stderr]) {
      stream.on("data", (data) => { tail = (tail + data.toString()).slice(-3000); });
    }
    proc.once("error", fail);
    proc.once("close", (code) => code === 0 ? done() : fail(new Error("Original MulmoCast offline pipeline failed: " + tail)));
  });
  return {
    video: join(root, "output/offline-sns_ja.mp4"),
    plan: join(root, "experiments/04-offline-e2e/generated/offline-sns.json"),
  };
}

async function complete(url, id) {
  for (let attempt = 0; attempt < 240; attempt++) {
    const response = await fetch(url + "/api/jobs/" + id, { headers });
    assert.equal(response.status, 200);
    const job = await response.json();
    if (job.state === "done" || job.state === "failed") return job;
    await new Promise((resume) => setTimeout(resume, 500));
  }
  throw new Error("Timed out waiting for the offline MulmoCast video");
}

test("private browser submits a job to real MulmoCast and downloads an actual 9:16 MP4", { timeout: 180_000 }, async () => {
  const server = createBrowserServer({
    token,
    runner: ({ brief, voice, setStep }) => {
      assert.equal(brief, "架空の室内楽コンサートを紹介してください");
      assert.equal(voice, false);
      return runOriginalOfflinePipeline(setStep);
    },
  });
  await new Promise((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
  const url = "http://127.0.0.1:" + server.address().port;
  try {
    const request = await fetch(url + "/api/jobs", {
      method: "POST",
      headers,
      body: JSON.stringify({ brief: "架空の室内楽コンサートを紹介してください", voice: false }),
    });
    assert.equal(request.status, 202);
    const { id } = await request.json();
    const finished = await complete(url, id);
    assert.equal(finished.state, "done", JSON.stringify(finished));
    const unauthorized = await fetch(url + "/api/jobs/" + id + "/video");
    assert.equal(unauthorized.status, 401);
    const response = await fetch(url + "/api/jobs/" + id + "/video", { headers });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /video\/mp4/);
    const received = Buffer.from(await response.arrayBuffer());
    assert.ok(received.length > 1000, "the MP4 should not be a mock placeholder");
    const original = await readFile(join(root, "output/offline-sns_ja.mp4"));
    assert.equal(createHash("sha256").update(received).digest("hex"), createHash("sha256").update(original).digest("hex"));
    assert.equal(received.subarray(4, 8).toString(), "ftyp", "downloaded file must have MP4 header");
    const plan = await fetch(url + "/api/jobs/" + id + "/script", { headers });
    assert.equal(plan.status, 200);
    assert.equal(JSON.parse(await plan.text()).beats.length, 3);
    assert.ok((await stat(join(root, "output/offline-sns_ja.mp4"))).size > 1000);
  } finally {
    await new Promise((end) => server.close(end));
  }
});
