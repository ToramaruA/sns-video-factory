import type { AgentFunction, AgentFunctionInfo } from "graphai";
import type { AgentBufferResult, GoogleMovieAgentParams, MovieAgentInputs } from "../types/agent.js";
import { selectFreeVideoProvider } from "../sns-video/providers/free_movie_router.js";
import { runLocalFreeVideoExecution } from "../sns-video/providers/local_free_video_executor.js";
import { getWan22FreeProvider, movieWan22ZeroGpuAgent, WAN22_FREE_PROVIDER_ID, WAN22_FREE_MODEL } from "./movie_wan22_zerogpu_agent.js";

/**
 * The common MulmoCast entry point for free-only image-to-video.
 *
 * More providers can be added here without changing MulmoScript's shape.
 * Candidate order defines preference. The selector NEVER invokes paid or
 * unknown-billing routes, and there is NO automatic retry on generation errors.
 */
export const movieFreeRouterAgent: AgentFunction<GoogleMovieAgentParams, AgentBufferResult, MovieAgentInputs, Record<string, never>> = async (args) => {
  const { namedInputs, params } = args;
  const model = params.model === "auto-free" ? undefined : params.model;
  const providers = [getWan22FreeProvider()];
  const request = {
    model,
    hasFirstFrame: Boolean(namedInputs.imagePath),
    durationSeconds: params.duration ?? 2,
    hasLastFrame: Boolean(namedInputs.lastFrameImagePath),
    hasReferenceImages: Boolean(namedInputs.referenceImages?.length),
    generateAudio: params.generateAudio === true,
  };

  // Reject unapproved/non-free models before touching the local disk.
  selectFreeVideoProvider(providers, request);
  const buffer = await runLocalFreeVideoExecution({
    ledgerPath: process.env.SNS_VIDEO_FREE_VIDEO_LEDGER_PATH ?? "",
    imagePath: namedInputs.imagePath ?? "",
    prompt: namedInputs.prompt ?? "",
    request,
    providers,
    generate: async (chosen) => {
      if (chosen.id === WAN22_FREE_PROVIDER_ID) {
        const result = await movieWan22ZeroGpuAgent({ ...args, params: { ...params, model: WAN22_FREE_MODEL } });
        return result.buffer;
      }
      // This path is deliberately closed until a second provider is explicitly
      // registered and approved, never a fallback to paid MulmoCast models.
      throw new Error("Selected free provider has no registered adapter");
    },
  });
  return { buffer };
};

const movieFreeRouterAgentInfo: AgentFunctionInfo = {
  name: "movieFreeRouterAgent",
  agent: movieFreeRouterAgent,
  mock: movieFreeRouterAgent,
  samples: [],
  description: "Common free-only image-to-video provider selector (experimental, disabled unless approved)",
  category: ["movie"],
  author: "SNS Video Factory contributors",
  repository: "https://github.com/ToramaruA/sns-video-factory",
  license: "AGPL-3.0-only",
  environmentVariables: ["SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT", "SNS_VIDEO_FREE_VIDEO_LEDGER_PATH"],
};

export default movieFreeRouterAgentInfo;
