/**
 * Small, private browser entry for the existing free MulmoCast CLI.
 * No AI implementation, model selector, persistent DB or new render pipeline.
 *
 * Run: node scripts/sns-video-browser.mjs
 * Default bind: localhost only. For sharing, put it behind a trusted HTTPS/VPN proxy.
 */
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_BYTES = 5000;
const MAX_HISTORY = 10;
const planPath = join(root, "experiments/06-groq-planning/generated/sns-video-plan.json");
const previewPath = join(root, "experiments/07-groq-flux-three-cut/generated/three-cut-preview.json");
const moviePath = join(root, "output/three-cut-preview_ja.mp4");
const jobRoot = join(root, "output/sns-video-browser");
const pagePath = join(root, "scripts/sns-video-browser.html");

function json(res, status, value) {
  const payload = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": payload.length, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(payload);
}

function authorized(req, token) {
  const supplied = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(req) {
  let size = 0;
  const buffers = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error("Request exceeds the 5 KB limit");
    buffers.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(buffers).toString("utf8"));
  } catch {
    throw new Error("Invalid JSON request");
  }
}

function requireFreeConfiguration(env) {
  if (env.SNS_VIDEO_GROQ_FREE_PLAN_CONFIRMED !== "1" || env.SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED !== "1") {
    throw new Error("Confirm both Groq and Cloudflare Free plans in the server environment before use");
  }
  for (const key of ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]) {
    if (!env[key]?.trim()) throw new Error(key + " is missing");
  }
  if (!(env.LLM_GROQ_API_KEY || env.GROQ_API_KEY)?.trim()) throw new Error("GROQ_API_KEY (or LLM_GROQ_API_KEY) is missing");
}

async function execute(command, args, env, label, timeoutMs) {
  await new Promise((pass, fail) => {
    const child = spawn(command, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = "";
    const collect = (part) => {
      output = (output + part.toString("utf8")).slice(-4000);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.once("error", (err) => {
      clearTimeout(timer);
      fail(new Error(label + " could not start: " + err.message));
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) pass();
      else fail(new Error(label + " failed (" + (signal || code) + "): " + output));
    });
  });
}

async function runExistingMulmoCast({ brief, voice, outputDir, setStep }) {
  const env = { ...process.env, SNS_VIDEO_BRIEF: brief };
  requireFreeConfiguration(env);
  await stat(join(root, "lib/cli/bin.js")).catch(() => {
    throw new Error("Build MulmoCast first: yarn install && yarn build");
  });
  // The existing experiments use fixed paths. This server permits ONE job at a
  // time and removes stale files before every run, so failures cannot serve an
  // earlier user's MP4. Successful outputs are copied into unique job folders.
  await rm(planPath, { force: true });
  await rm(previewPath, { force: true });
  await rm(moviePath, { force: true });
  await rm(join(root, "output/images/three-cut-preview"), { recursive: true, force: true });
  setStep("企画・カット割り");
  await execute(process.execPath, ["--import", "tsx", "experiments/06-groq-planning/run.ts"], env, "Free storyboard", 8 * 60_000);
  setStep("画像・動画の準備");
  await execute(process.execPath, ["--import", "tsx", "experiments/07-groq-flux-three-cut/prepare_preview.ts"], env, "Free preview", 3 * 60_000);
  if (voice) {
    setStep("ローカルの日本語音声");
    const python = process.env.SNS_VIDEO_PYTHON || (process.platform === "win32" ? "python" : "python3");
    await execute(python, ["experiments/07-groq-flux-three-cut/add_nemo_narration.py"], env, "VOICEVOX Nemo", 10 * 60_000);
  }
  setStep("MulmoCastでMP4生成");
  await execute(process.execPath, ["lib/cli/bin.js", "movie", "experiments/07-groq-flux-three-cut/generated/three-cut-preview.json", "--sns-free-only"], env, "MulmoCast", 35 * 60_000);
  await stat(moviePath);
  await mkdir(outputDir, { recursive: true });
  const video = join(outputDir, "video.mp4");
  const plan = join(outputDir, "mulmo-plan.json");
  await copyFile(moviePath, video);
  await copyFile(planPath, plan);
  return { video, plan };
}

/** Inject a fake runner in tests; the real one always enforces Free Tier. */
export function createBrowserServer({ token, runner = runExistingMulmoCast, htmlPath = pagePath } = {}) {
  if (typeof token !== "string" || token.length < 24) throw new Error("Private access token must contain at least 24 characters");
  const jobs = new Map();
  let activeId = null;
  const httpServer = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      if (req.method === "GET" && pathname === "/") {
        const contents = await readFile(htmlPath);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": contents.length, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" });
        res.end(contents);
        return;
      }
      if (!pathname.startsWith("/api/")) return json(res, 404, { error: "Not found" });
      if (!authorized(req, token)) return json(res, 401, { error: "Invalid access token" });
      if (req.method === "POST" && pathname === "/api/jobs") {
        if (activeId !== null) return json(res, 409, { error: "別の動画を生成しています。完了後に再実行してください。" });
        const data = await readJson(req);
        const brief = typeof data.brief === "string" ? data.brief.trim() : "";
        const voice = data.voice === true;
        if (!brief || brief.length > 3500 || typeof data.voice !== "boolean" || (voice && data.confirmNemoCredit !== true)) {
          return json(res, 400, { error: "依頼文（1〜3500文字）と音声利用時のクレジット同意を確認してください。" });
        }
        const id = randomBytes(12).toString("hex");
        const job = { id, state: "running", step: "準備中", files: null, error: null };
        jobs.set(id, job);
        activeId = id;
        json(res, 202, { id });
        // Only the static fail-closed MulmoCast pipeline is permitted.
        Promise.resolve()
          .then(() => runner({ brief, voice, outputDir: join(jobRoot, id), setStep: (step) => (job.step = step) }))
          .then((files) => { job.files = files; job.state = "done"; job.step = "完了"; })
          .catch((err) => {
            // Never send upstream errors to clients or print accidental tokens.
            console.error("Free MulmoCast job failed during " + job.step + " (" + (err?.name || "Error") + ")");
            job.state = "failed";
            job.step = "失敗";
            job.error = "生成に失敗しました。APIの無料枠・接続・設定を確認してください。";
          })
          .finally(async () => {
            activeId = null;
            while (jobs.size > MAX_HISTORY) {
              const oldestId = jobs.keys().next().value;
              if (oldestId === id) break;
              jobs.delete(oldestId);
              await rm(join(jobRoot, oldestId), { recursive: true, force: true }).catch(() => {});
            }
          });
        return;
      }
      const match = /^\/api\/jobs\/([a-f0-9]{24})(?:\/(video|script))?$/.exec(pathname);
      if (req.method === "GET" && match) {
        const [, id, attachment] = match;
        const job = jobs.get(id);
        if (!job) return json(res, 404, { error: "Job not found" });
        if (!attachment) return json(res, 200, { id, state: job.state, step: job.step, error: job.error });
        if (job.state !== "done" || !job.files) return json(res, 409, { error: "Job not complete" });
        const file = job.files[attachment === "video" ? "video" : "plan"];
        const stats = await stat(file);
        res.writeHead(200, {
          "Content-Type": attachment === "video" ? "video/mp4" : "application/json; charset=utf-8",
          "Content-Length": stats.size,
          "Content-Disposition": 'attachment; filename="' + (attachment === "video" ? "sns-video.mp4" : "mulmo-plan.json") + '"',
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        createReadStream(file).pipe(res);
        return;
      }
      json(res, 404, { error: "Not found" });
    } catch (err) {
      if (!res.headersSent) json(res, err.message?.includes("limit") ? 413 : 400, { error: "Request could not be processed" });
    }
  });
  return httpServer;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(join(root, ".env")); } catch (err) { if (err.code !== "ENOENT") throw err; }
  const env = process.env;
  requireFreeConfiguration(env);
  const token = env.SNS_VIDEO_WEB_TOKEN || randomBytes(24).toString("hex");
  const host = env.SNS_VIDEO_WEB_HOST || "127.0.0.1";
  const port = Number(env.SNS_VIDEO_WEB_PORT || 8787);
  const server = createBrowserServer({ token });
  server.listen(port, host, () => {
    console.log("MulmoCast browser: http://" + host + ":" + port);
    console.log("Access token (share only with trusted users): " + token);
    if (host !== "127.0.0.1" && host !== "::1") console.warn("Use an HTTPS-terminated VPN or private proxy. Do not expose this HTTP server on the public internet.");
  });
}
