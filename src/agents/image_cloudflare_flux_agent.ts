import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { type AgentFunction, type AgentFunctionInfo } from "graphai";
import {
  assertCloudflareFreePlanConfigured,
  CLOUDFLARE_FLUX_MODEL,
  CLOUDFLARE_FLUX_REFERENCE_MODEL,
} from "../sns-video/safety/cloudflare_free_plan.js";

/** Only two Cloudflare Workers AI models are enabled; never silently switch to paid providers. */
type CloudflareModel = typeof CLOUDFLARE_FLUX_MODEL | typeof CLOUDFLARE_FLUX_REFERENCE_MODEL;
type Fetcher = (url: string, init: NonNullable<Parameters<typeof fetch>[1]>) => Promise<Response>;
const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff]);

const isPng = (data: Buffer) => data.subarray(0, PNG_HEADER.length).equals(PNG_HEADER);
const isJpeg = (data: Buffer) => data.subarray(0, JPEG_HEADER.length).equals(JPEG_HEADER);
const imageType = (data: Buffer) => (isPng(data) ? "png" : isJpeg(data) ? "jpeg" : "unsupported");

const assertModel = (value?: string): CloudflareModel => {
  const model = value ?? CLOUDFLARE_FLUX_REFERENCE_MODEL;
  if (model !== CLOUDFLARE_FLUX_MODEL && model !== CLOUDFLARE_FLUX_REFERENCE_MODEL) {
    throw new Error("Unsupported Cloudflare Free model; no paid fallback");
  }
  return model;
};

/** MulmoCast writes beat images to .png; normalize output and reference images with existing FFmpeg. */
const ffmpegToPng = async (bytes: Buffer, resizeReference: boolean): Promise<Buffer> =>
  await new Promise((resolve, reject) => {
    const args = ["-hide_banner", "-loglevel", "error", "-i", "pipe:0"];
    if (resizeReference) {
      // Cloudflare requires reference inputs strictly smaller than 512 x 512 pixels.
      args.push("-vf", "scale=510:510:force_original_aspect_ratio=decrease");
    }
    args.push("-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1");
    const child = spawn("ffmpeg", args, { signal: AbortSignal.timeout(45_000) });
    const chunks: Buffer[] = [];
    let size = 0;
    let error = "";
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 12_000_000) child.kill();
      else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => { error += chunk.toString().slice(0, 512); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 || size > 12_000_000) {
        reject(new Error("Image conversion failed; check FFmpeg and source image: " + error.slice(0, 180)));
        return;
      }
      const out = Buffer.concat(chunks);
      if (!isPng(out)) reject(new Error("FFmpeg did not return a PNG image"));
      else resolve(out);
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(bytes);
  });

const loadReference = async (file: string): Promise<Buffer> => {
  const info = await stat(file);
  if (!info.isFile() || info.size > 20_000_000 || info.size === 0) {
    throw new Error("Reference image must be a local file of 1–20 MB maximum");
  }
  const input = await readFile(file);
  return await ffmpegToPng(input, true);
};

export const generateCloudflareFluxImage = async (
  prompt: string,
  options: {
    model?: string;
    referenceImages?: string[];
    canvasSize?: { width: number; height: number };
    env: Record<string, string | undefined>;
    fetcher?: Fetcher;
  },
): Promise<Buffer> => {
  // Refuse invalid plans, unsupported models and unsupported references before any API call.
  const { accountId, apiToken } = assertCloudflareFreePlanConfigured(options.env);
  const model = assertModel(options.model);
  const refs = options.referenceImages ?? [];
  if (refs.length > 4) throw new Error("FLUX.2 Klein supports a maximum of four reference images");
  if (model === CLOUDFLARE_FLUX_MODEL && refs.length) {
    throw new Error("FLUX.1 Schnell does not support reference images; select FLUX.2 Klein");
  }
  const cleanPrompt = prompt.trim();
  if (cleanPrompt.length < 1 || cleanPrompt.length > 2048) {
    throw new Error("Cloudflare image prompt must contain 1–2048 characters");
  }
  const canvas = options.canvasSize;
  if (canvas && (![canvas.width, canvas.height].every((v) => Number.isInteger(v) && v >= 256 && v <= 1920))) {
    throw new Error("Cloudflare image canvas dimensions must be integers between 256 and 1920");
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${apiToken}` };
  let body: FormData | string;
  if (model === CLOUDFLARE_FLUX_REFERENCE_MODEL) {
    const form = new FormData();
    form.append("prompt", cleanPrompt);
    if (canvas) {
      form.append("width", String(canvas.width));
      form.append("height", String(canvas.height));
    }
    // The model accepts exactly input_image_0 ... input_image_3, as binary multipart parts.
    for (let i = 0; i < refs.length; i++) {
      const png = await loadReference(refs[i]);
      form.append(`input_image_${i}`, new Blob([new Uint8Array(png)], { type: "image/png" }), `reference_${i}.png`);
    }
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ prompt: cleanPrompt, steps: 4 });
  }

  const response = await (options.fetcher ?? fetch)(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Cloudflare Workers AI image request failed (HTTP ${response.status}); no fallback`);

  const payload: unknown = await response.json();
  const result = payload && typeof payload === "object" && "result" in payload ? payload.result : undefined;
  const encoded = result && typeof result === "object" && "image" in result ? result.image : undefined;
  if (typeof encoded !== "string" || encoded.length > 16_000_000 || !/^[a-zA-Z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error("Cloudflare did not return a valid base64 image");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length < 8 || bytes.length > 12_000_000) throw new Error("Cloudflare image is empty or too large");
  if (isPng(bytes)) return bytes;
  if (isJpeg(bytes)) return await ffmpegToPng(bytes, false);
  throw new Error("Cloudflare image is neither PNG nor JPEG");
};

// MulmoCast's GraphAI already caches per file. Here we deduplicate retries within
// one output-file+prompt+references job, not across different beats with similar prompts.
const submitted = new Map<string, Promise<Buffer>>();

export const imageCloudflareFluxAgent: AgentFunction = async ({ namedInputs, params }) => {
  if (namedInputs.media !== "image") throw new Error("Cloudflare Free image agent supports images only");
  const env = process.env;
  const { accountId } = assertCloudflareFreePlanConfigured(env);
  const model = assertModel(params.model as string | undefined);
  const prompt = String(namedInputs.prompt ?? "");
  const referenceImages = namedInputs.referenceImages as string[] | undefined;
  const canvasSize = params.canvasSize as { width: number; height: number } | undefined;
  const outputFile = (namedInputs.cache as { file?: string } | undefined)?.file ?? "";
  // Use image paths plus file metadata, not only the text prompt, to prevent wrong reuse.
  const refSignature = await Promise.all((referenceImages ?? []).map(async (file) => {
    const info = await stat(file);
    return [file, info.size, info.mtimeMs];
  }));
  const key = createHash("sha256").update(JSON.stringify([accountId, model, outputFile, prompt, canvasSize, refSignature])).digest("hex");
  let pending = submitted.get(key);
  if (!pending) {
    pending = generateCloudflareFluxImage(prompt, { model, referenceImages, canvasSize, env });
    submitted.set(key, pending);
  }
  return { buffer: await pending };
};

const imageCloudflareFluxAgentInfo: AgentFunctionInfo = {
  name: "imageCloudflareFluxAgent",
  agent: imageCloudflareFluxAgent,
  mock: imageCloudflareFluxAgent,
  samples: [],
  description: "Cloudflare Workers Free FLUX.2 Klein reference images / FLUX.1 Schnell with fail-closed plan check",
  category: ["image"],
  author: "SNS Video Factory",
  repository: "https://github.com/ToramaruA/sns-video-factory",
  license: "MIT",
  environmentVariables: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED"],
};
export default imageCloudflareFluxAgentInfo;
