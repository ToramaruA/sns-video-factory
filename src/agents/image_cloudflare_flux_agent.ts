import { type AgentFunction, type AgentFunctionInfo } from "graphai";
import { assertCloudflareFreePlanConfigured, CLOUDFLARE_FLUX_MODEL } from "../sns-video/safety/cloudflare_free_plan.js";

/** Restrict transport to Cloudflare's official, fixed Workers AI endpoint. */
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export const generateCloudflareFluxImage = async (
  prompt: string,
  options: {
    model?: string;
    referenceImages?: string[];
    env: Record<string, string | undefined>;
    fetcher?: Fetcher;
  },
): Promise<Buffer> => {
  // Every refusal must happen before a request is sent.
  const { accountId, apiToken } = assertCloudflareFreePlanConfigured(options.env);
  if (options.model !== undefined && options.model !== CLOUDFLARE_FLUX_MODEL) {
    throw new Error("Cloudflare free image Agent only supports the pinned FLUX.1 schnell model");
  }
  if (options.referenceImages?.length) {
    throw new Error("Cloudflare FLUX.1 schnell does not accept reference images; refusing to silently discard them");
  }
  const cleanPrompt = prompt.trim();
  if (cleanPrompt.length < 1 || cleanPrompt.length > 2048) throw new Error("Cloudflare FLUX prompt must contain 1–2048 characters");

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLOUDFLARE_FLUX_MODEL}`;
  const response = await (options.fetcher ?? fetch)(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    // Four steps is the official default and avoids unnecessary free quota use.
    body: JSON.stringify({ prompt: cleanPrompt, steps: 4 }),
    signal: AbortSignal.timeout(90_000),
  });

  // Do not log the prompt, API key or untrusted upstream response.
  if (!response.ok) throw new Error(`Cloudflare Workers AI refused the image request (HTTP ${response.status}); no fallback attempted`);
  const payload: unknown = await response.json();
  const image =
    payload && typeof payload === "object" && "result" in payload &&
    payload.result && typeof payload.result === "object" && "image" in payload.result
      ? payload.result.image
      : undefined;
  if (typeof image !== "string" || !image || image.length > 16_000_000 || !/^[a-zA-Z0-9+/]+={0,2}$/.test(image)) {
    throw new Error("Cloudflare Workers AI did not return a valid base64-encoded image");
  }
  const buffer = Buffer.from(image, "base64");
  // Cloudflare documents a JPEG output for FLUX.1 schnell.
  if (buffer.length < 4 || buffer.length > 12_000_000 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    throw new Error("Cloudflare Workers AI returned a missing or unsupported JPEG image");
  }
  return buffer;
};

// MulmoCast's imageGenerator retries failed Agent nodes. A free-tier request
// must not be silently re-submitted after a timeout or ambiguous HTTP error.
const submitted = new Map<string, Promise<Buffer>>();

export const imageCloudflareFluxAgent: AgentFunction = async ({ namedInputs, params }) => {
  if (namedInputs.media !== "image") throw new Error("Cloudflare FLUX agent supports images only");
  const env = process.env;
  const { accountId } = assertCloudflareFreePlanConfigured(env);
  const prompt = String(namedInputs.prompt ?? "");
  const model = params.model as string | undefined;
  const referenceImages = namedInputs.referenceImages as string[] | undefined;
  // Validate locally even when this exact prompt was seen earlier.
  if (model !== undefined && model !== CLOUDFLARE_FLUX_MODEL) throw new Error("Unapproved Cloudflare image model");
  if (referenceImages?.length) throw new Error("FLUX.1 schnell does not support reference images");
  if (prompt.trim().length < 1 || prompt.trim().length > 2048) throw new Error("FLUX prompt must contain 1–2048 characters");

  const key = JSON.stringify([accountId, CLOUDFLARE_FLUX_MODEL, prompt.trim()]);
  let promise = submitted.get(key);
  if (!promise) {
    promise = generateCloudflareFluxImage(prompt, { model, referenceImages, env });
    // Keep both successes and failures. Even a failed request may have reached
    // Cloudflare: never auto-resubmit within the same process.
    submitted.set(key, promise);
  }
  return { buffer: await promise };
};

const imageCloudflareFluxAgentInfo: AgentFunctionInfo = {
  name: "imageCloudflareFluxAgent",
  agent: imageCloudflareFluxAgent,
  mock: imageCloudflareFluxAgent,
  samples: [],
  description: "Opt-in Workers Free FLUX.1 schnell image Agent; denies unconfirmed billing plans",
  category: ["image"],
  author: "SNS Video Factory",
  repository: "https://github.com/ToramaruA/sns-video-factory",
  license: "MIT",
  environmentVariables: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED"],
};
export default imageCloudflareFluxAgentInfo;
