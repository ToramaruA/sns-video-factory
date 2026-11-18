/**
 * Opt-in live integration check:
 * HTTP POST -> production browser runner -> Groq Free -> Cloudflare Workers Free
 * -> original MulmoCast renderer -> authenticated HTTP MP4 download.
 *
 * Do not run on push/PR/CI. Run only after explicit Free Plan confirmations.
 * The test uses the real browser runner; it never substitutes a mock response.
 */
import { randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createBrowserServer } from "./sns-video-browser.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "output/sns-video-browser-smoke");
const previewFile = join(root, "experiments/07-groq-flux-three-cut/generated/three-cut-preview.json");
const directVideo = join(root, "output/three-cut-preview_ja.mp4");
const MAX_POLL_MINUTES = 18;

const fail = (message) => { throw new Error(message); };
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const loadJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const probeVideo = (path) => {
  const raw = execFileSync("ffprobe", [
    "-v", "error", "-show_streams", "-show_format", "-of", "json", path,
  ], { encoding: "utf8", timeout: 30_000 });
  const result = JSON.parse(raw);
  const video = result.streams?.find((stream) => stream.codec_type === "video");
  const hasAudio = result.streams?.some((stream) => stream.codec_type === "audio");
  return {
    width: video?.width,
    height: video?.height,
    duration: Number(result.format?.duration),
    hasAudio: Boolean(hasAudio),
  };
};

const get = async (base, path, token) => {
  return fetch(base + path, {
    headers: { Authorization: "Bearer " + token },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
};

async function main() {
  if (process.env.SNS_VIDEO_WEB_SMOKE_CONFIRMED !== "1") {
    fail("Explicit manual browser integration confirmation is required");
  }
  if (process.env.SNS_VIDEO_GROQ_FREE_PLAN_CONFIRMED !== "1" ||
      process.env.SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED !== "1") {
    fail("Both real accounts must be confirmed Free Plan before any API calls");
  }
  for (const name of ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]) {
    if (!process.env[name]?.trim()) fail("Required Free Plan configuration is missing: " + name);
  }
  if (!(process.env.GROQ_API_KEY || process.env.LLM_GROQ_API_KEY)?.trim()) {
    fail("Groq Free API key is missing");
  }

  const brief = process.env.SNS_VIDEO_BRIEF?.trim();
  const voice = process.env.SNS_VIDEO_WEB_SMOKE_VOICE === "true";
  const credit = process.env.SNS_VIDEO_WEB_SMOKE_CREDIT === "true";
  if (!brief || brief.length > 3500) fail("Provide a 1–3500 character brief");
  if (voice && !credit) fail("VOICEVOX Nemo attribution agreement is required");

  const token = randomBytes(32).toString("hex");
  const server = createBrowserServer({ token });
  await new Promise((ok, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", ok);
  });
  const base = "http://127.0.0.1:" + server.address().port;

  try {
    const submitted = await fetch(base + "/api/jobs", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ brief, voice, confirmNemoCredit: credit }),
      signal: AbortSignal.timeout(30_000),
    });
    if (submitted.status !== 202) {
      fail("Browser API refused the verified manual job (HTTP " + submitted.status + ")");
    }
    const { id } = await submitted.json();
    if (!/^[a-f0-9]{24}$/.test(id)) fail("Invalid browser job identifier");
    const noAuth = await fetch(base + "/api/jobs/" + id + "/video");
    if (noAuth.status !== 401) fail("Critical: the video endpoint was reachable without authorization");

    let previousStep = "";
    let finished = false;
    const until = Date.now() + MAX_POLL_MINUTES * 60_000;
    while (Date.now() < until) {
      const response = await get(base, "/api/jobs/" + id, token);
      if (!response.ok) fail("Could not read browser job status: HTTP " + response.status);
      const job = await response.json();
      if (job.step !== previousStep) {
        previousStep = job.step;
        console.log("Browser stage: " + job.step);
      }
      if (job.state === "failed") fail("Browser job failed during " + job.step + "; see server diagnostic stage");
      if (job.state === "done") {
        finished = true;
        break;
      }
      await new Promise((done) => setTimeout(done, 2500));
    }
    if (!finished) fail("Browser job exceeded its manual test deadline");

    const [videoResponse, scriptResponse] = await Promise.all([
      get(base, "/api/jobs/" + id + "/video", token),
      get(base, "/api/jobs/" + id + "/script", token),
    ]);
    if (!videoResponse.ok || !scriptResponse.ok) {
      fail("Could not download the rendered video or MulmoScript through authenticated HTTP");
    }

    const [video, planText] = await Promise.all([
      videoResponse.arrayBuffer().then((data) => Buffer.from(data)),
      scriptResponse.text(),
    ]);
    const plan = JSON.parse(planText);
    const original = await readFile(directVideo);
    if (!video.equals(original) || sha(video) !== sha(original)) {
      fail("Downloaded MP4 differs from the original MulmoCast render");
    }
    if (video.length < 1024 || video.toString("ascii", 4, 8) !== "ftyp") {
      fail("The downloaded file is not a real MP4");
    }

    await mkdir(out, { recursive: true });
    const outputVideo = join(out, "video.mp4");
    await writeFile(outputVideo, video);
    await writeFile(join(out, "mulmo-plan.json"), planText);

    const preview = await loadJson(previewFile);
    const beats = preview.beats;
    const plannedSeconds = beats.reduce((sum, beat) => sum + beat.duration, 0);
    const media = probeVideo(outputVideo);
    if (!Array.isArray(plan.beats) || plan.beats.length !== beats.length ||
        beats.length < 1 || beats.length > 12 || media.width !== 720 || media.height !== 1280 ||
        !Number.isFinite(media.duration) || Math.abs(media.duration - plannedSeconds) > 1.0) {
      fail("Rendered video dimensions, duration or number of cuts do not match the safe plan");
    }
    if (voice && !media.hasAudio) fail("Narration was requested but the MP4 has no audio track");

    const summary = {
      result: "PASS",
      mode: "real-Groq-Free-Cloudflare-Free-browser-HTTP",
      voiceRequested: voice,
      cuts: beats.length,
      requestedSeconds: plannedSeconds,
      renderedSeconds: media.duration,
      width: media.width,
      height: media.height,
      hasAudio: media.hasAudio,
      authenticatedDownloadMatchesMulmoCast: true,
      noAuthDownloadRejected: true,
      stillImagesOnly: true,
    };
    await writeFile(join(out, "verification.json"), JSON.stringify(summary, null, 2) + "\n");
    console.log("PASS: Browser HTTP -> real free-plan APIs -> original MulmoCast -> " +
                media.width + "x" + media.height + " MP4, " + beats.length + " cuts");
  } finally {
    await new Promise((done) => server.close(done));
  }
}

main().catch((error) => {
  // Never print API response bodies, arbitrary environment variables or credentials.
  console.error("Browser live Free-Plan smoke failed: " + error.message);
  process.exitCode = 1;
});
