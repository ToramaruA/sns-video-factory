import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentFunction, AgentFunctionInfo } from "graphai";
import type { AgentBufferResult, GoogleMovieAgentParams, MovieAgentInputs } from "../types/agent.js";
import { selectFreeVideoProvider, type FreeVideoProvider } from "../sns-video/providers/free_movie_router.js";

/**
 * Explicitly experimental, intentionally disabled by default.
 * The third-party ZeroGPU Space is a demonstration target, not an approved
 * production service. No credentials or billed fallback are supported.
 */
export const WAN22_FREE_PROVIDER_ID = "wan22_zerogpu_experimental";
export const WAN22_FREE_MODEL = "wan2.2-i2v";

export const getWan22FreeProvider = (environment: Record<string, string | undefined> = process.env): FreeVideoProvider => ({
  id: WAN22_FREE_PROVIDER_ID,
  model: WAN22_FREE_MODEL,
  billing: "free",
  routeStatus: environment.SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT === "1" ? "ready" : "blocked",
  experimental: true,
  quotaPoolId: "huggingface-zerogpu-anonymous",
  capabilities: {
    imageToVideo: true,
    lastFrame: false,
    referenceImages: false,
    referenceVideo: false,
    generatedAudio: false,
    durationsSeconds: [2],
  },
});

type BridgeResponse = {
  ok?: boolean;
  output_path?: string;
  size?: number;
  error_code?: string;
  error?: string;
};

const callPythonBridge = async (script: string, request: unknown, workingDir: string): Promise<BridgeResponse> => {
  const environment = {
    ...process.env,
    // Both account token sources and the on-disk Hugging Face credential cache
    // are explicitly removed from the spawned anonymous experiment process.
    HF_TOKEN: "",
    HUGGING_FACE_HUB_TOKEN: "",
    HF_HOME: join(workingDir, "hf-anonymous"),
    HF_HUB_DISABLE_IMPLICIT_TOKEN: "1",
  };
  const command = process.env.SNS_VIDEO_PYTHON_BINARY || "python3";
  return new Promise((resolve, reject) => {
    const child = spawn(command, ["-B", script], {
      stdio: ["pipe", "pipe", "pipe"],
      env: environment,
      cwd: workingDir,
    });
    let stdout = "";
    let stderr = "";
    let completed = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!completed) reject(new Error("Wan2.2 experiment timed out; no automatic retry"));
    }, 570_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = (stdout + chunk).slice(-5000);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-2000);
    });
    child.on("error", (error) => {
      completed = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      completed = true;
      clearTimeout(timer);
      try {
        const lines = stdout.trim().split("\n");
        const response = JSON.parse(lines[lines.length - 1]) as BridgeResponse;
        if (code !== 0 || response.ok !== true) {
          reject(new Error("Wan2.2 free endpoint: " + (response.error_code ?? "provider_error") + ": " + (response.error ?? "Unknown provider error")));
          return;
        }
        resolve(response);
      } catch (error) {
        reject(
          new Error(
            "Wan2.2 bridge failed without a valid success response: " +
              (error instanceof Error ? error.message : String(error)) +
              " (exit " +
              String(code) +
              "; stderr length " +
              stderr.length +
              ")",
          ),
        );
      }
    });
    child.stdin.on("error", () => {
      // The child exit/close handler reports the failure.
    });
    child.stdin.end(JSON.stringify(request));
  });
};

let startedCalls = 0;

/** Return a buffer for MulmoCast's existing movie cache and final render logic. */
export const movieWan22ZeroGpuAgent: AgentFunction<GoogleMovieAgentParams, AgentBufferResult, MovieAgentInputs, Record<string, never>> = async ({
  namedInputs,
  params,
}) => {
  const imagePath = namedInputs.imagePath;
  const requestedDuration = params.duration ?? 2;

  // Guard before any network or executable invocation.
  selectFreeVideoProvider([getWan22FreeProvider()], {
    providerId: WAN22_FREE_PROVIDER_ID,
    model: params.model ?? WAN22_FREE_MODEL,
    hasFirstFrame: Boolean(imagePath),
    durationSeconds: requestedDuration,
    hasLastFrame: Boolean(namedInputs.lastFrameImagePath),
    hasReferenceImages: Boolean(namedInputs.referenceImages?.length),
    generateAudio: params.generateAudio === true,
  });
  if (process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN) {
    throw new Error("Wan2.2 experimental adapter only permits anonymous free access; remove Hugging Face tokens");
  }
  if (startedCalls >= 1) {
    throw new Error("Wan2.2 experiment permits only one generation per process; no automatic repeated calls");
  }
  if (!imagePath) {
    throw new Error("Wan2.2 image-to-video requires a still image");
  }
  if (!namedInputs.prompt?.trim()) {
    throw new Error("Wan2.2 image-to-video requires a movie prompt");
  }
  const inputFile = await stat(imagePath);
  if (!inputFile.isFile() || inputFile.size > 15_000_000) {
    throw new Error("Wan2.2 image file must exist and be <= 15 MB");
  }
  // Only increment after all local validations; never retry automatically.
  startedCalls += 1;
  const workingDir = await mkdtemp(join(tmpdir(), "sns-video-wan22-"));
  const outputFile = join(workingDir, "generated.mp4");
  try {
    const script = fileURLToPath(new URL("../../src/sns-video/providers/wan22_zerogpu_client.py", import.meta.url));
    const result = await callPythonBridge(
      script,
      {
        image_path: imagePath,
        output_path: outputFile,
        prompt: namedInputs.prompt,
        model: WAN22_FREE_MODEL,
        duration_seconds: requestedDuration,
      },
      workingDir,
    );
    if (result.output_path !== outputFile) {
      throw new Error("Wan2.2 bridge returned an unexpected output path");
    }
    const videoStats = await stat(outputFile);
    if (videoStats.size < 1024 || videoStats.size > 100_000_000) {
      throw new Error("Wan2.2 bridge returned an invalid MP4 size");
    }
    const buffer = await readFile(outputFile);
    if (buffer.toString("ascii", 4, 8) !== "ftyp") {
      throw new Error("Wan2.2 bridge returned a file without an MP4 header");
    }
    return { buffer };
  } finally {
    await rm(workingDir, { recursive: true, force: true });
  }
};

const movieWan22ZeroGpuAgentInfo: AgentFunctionInfo = {
  name: "movieWan22ZeroGpuAgent",
  agent: movieWan22ZeroGpuAgent,
  mock: movieWan22ZeroGpuAgent,
  samples: [],
  description: "Experimental free-only anonymous Wan 2.2 image-to-video bridge (disabled by default)",
  category: ["movie"],
  author: "SNS Video Factory contributors",
  repository: "https://github.com/ToramaruA/sns-video-factory",
  license: "AGPL-3.0-only",
  environmentVariables: ["SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT"],
};

export default movieWan22ZeroGpuAgentInfo;
