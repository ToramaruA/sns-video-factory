/**
 * Manual ONLY: exercise the actual private browser HTTP entry with the
 * already-approved Groq Free + Cloudflare Workers Free accounts.
 * The browser runner calls the existing MulmoCast pipeline ONCE.
 * Never called on CI pull_request/push; no API keys or briefs are printed.
 */
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrowserServer } from "./sns-video-browser.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const videoPath = join(root, "output/three-cut-preview_ja.mp4");
const previewPath = join(root, "experiments/07-groq-flux-three-cut/generated/three-cut-preview.json");

function freePlansConfirmed(env) {
  if (env.SNS_VIDEO_GROQ_FREE_PLAN_CONFIRMED !== "1" || env.SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED !== "1") {
    throw new Error("Both account-level Free plans must be explicitly confirmed before a live run");
  }
  if (!(env.GROQ_API_KEY || env.LLM_GROQ_API_KEY) || !env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw new Error("Missing one or more existing Groq/Cloudflare Free Plan secrets");
  }
}

async function getJSON(url, token, method, body) {
  const response = await fetch(url, {
    method,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error("Browser HTTP request failed (" + response.status + "): " + (json.error || "unknown error"));
  return json;
}

async function verify() {
  freePlansConfirmed(process.env);
  const brief = process.env.SNS_VIDEO_BRIEF?.trim();
  if (!brief || brief.length > 3500) throw new Error("Provide a brief of 1-3500 characters");
  const voice = process.env.SNS_VIDEO_WEB_VOICE_ENABLED === "true";
  if (voice && process.env.SNS_VIDEO_NEMO_CREDIT_CONFIRMED !== "true") {
    throw new Error("VOICEVOX Nemo credit confirmation is required for narration");
  }

  const token = randomBytes(32).toString("hex");
  const server = createBrowserServer({ token });
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", done);
  });
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const unauthorized = await fetch(base + "/api/jobs", { method: "POST" });
    assert.equal(unauthorized.status, 401);

    // One real Groq planning and one real FLUX image generation pass only.
    const { id } = await getJSON(base + "/api/jobs", token, "POST", {
      brief,
      voice,
      confirmNemoCredit: voice,
    });
    assert.match(id, /^[0-9a-f]{24}$/);
    console.log("Browser accepted authenticated generation request (no public HTTP listener)");

    const deadline = Date.now() + 22 * 60_000;
    let state;
    while (Date.now() < deadline) {
      state = await getJSON(base + "/api/jobs/" + id, token, "GET");
      if (state.state === "done") break;
      if (state.state === "failed") throw new Error("Free generation failed during: " + state.step);
      await new Promise((done) => setTimeout(done, 3000));
    }
    if (state?.state !== "done") throw new Error("Browser free generation exceeded the smoke-test deadline");

    const videoResponse = await fetch(base + "/api/jobs/" + id + "/video", {
      headers: { Authorization: "Bearer " + token },
    });
    assert.equal(videoResponse.status, 200);
    assert.match(videoResponse.headers.get("content-type") ?? "", /^video\/mp4/);
    const downloadedMP4 = Buffer.from(await videoResponse.arrayBuffer());
    assert.ok(downloadedMP4.length > 1000, "downloaded MP4 is unexpectedly small");
    assert.equal(downloadedMP4.subarray(4, 8).toString(), "ftyp");
    const sourceMP4 = await readFile(videoPath);
    const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
    assert.equal(digest(downloadedMP4), digest(sourceMP4), "Browser HTTP download differs from MulmoCast output");

    const script = await getJSON(base + "/api/jobs/" + id + "/script", token, "GET");
    assert.ok(script.beats.length >= 1 && script.beats.length <= 12, "invalid Groq planned cut count");
    const preview = JSON.parse(await readFile(previewPath, "utf8"));
    assert.equal(preview.beats.length, script.beats.length);
    assert.equal(preview.audioParams.suppressSpeech, true);
    assert.equal(preview.movieParams.provider, "mock");
    assert.equal(preview.imageParams.provider, "cloudflare_free");

    const probe = JSON.parse(execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "stream=width,height:format=duration",
      "-of", "json", videoPath,
    ], { encoding: "utf8" }));
    const stream = probe.streams?.find((item) => item.width && item.height);
    assert.deepEqual([stream?.width, stream?.height], [720, 1280]);
    const duration = Number(probe.format?.duration);
    const target = preview.beats.reduce((sum, beat) => sum + beat.duration, 0);
    assert.ok(Number.isFinite(duration) && Math.abs(duration - target) < 1, "invalid MP4 duration");
    assert.ok((await stat(videoPath)).size > 1000);
    console.log("PASS: real Groq Free -> FLUX Workers Free -> private browser HTTP -> original MulmoCast -> " +
      script.beats.length + " cuts, " + duration.toFixed(2) + "s, 720x1280 MP4, authenticated download");
    console.log("NOTE: still-image video, NOT real I2V. API Free Tier is checked by account confirmation, not billing lookup.");
  } finally {
    await new Promise((done) => server.close(done));
  }
}

await verify();
