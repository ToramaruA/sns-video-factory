import test from "node:test";
import assert from "node:assert/strict";

import { FreeVideoProviderError, selectFreeVideoProvider, type FreeVideoProvider } from "../../src/sns-video/providers/free_movie_router.js";
import { getWan22FreeProvider, WAN22_FREE_PROVIDER_ID, WAN22_FREE_MODEL } from "../../src/agents/movie_wan22_zerogpu_agent.js";
import { movieFreeRouterAgent } from "../../src/agents/movie_free_router_agent.js";
import { provider2MovieAgent } from "../../src/types/provider2agent.js";
import { mulmoScriptSchema } from "../../src/types/schema.js";

const enabledWan = (): FreeVideoProvider => getWan22FreeProvider({ SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT: "1" });
const request = { hasFirstFrame: true, durationSeconds: 2 };

test("registered free_i2v provider uses the shared free router, not a paid agent", () => {
  assert.equal(provider2MovieAgent.free_i2v.agentName, "movieFreeRouterAgent");
  assert.equal(provider2MovieAgent.free_i2v.keyName, "");
  assert.equal(provider2MovieAgent.free_i2v.defaultModel, "auto-free");
  assert.equal(provider2MovieAgent.wan22_zerogpu_experimental.keyName, "");
});

test("free model route is OFF by default", () => {
  const wan = getWan22FreeProvider({});
  assert.equal(wan.routeStatus, "blocked");
  assert.throws(
    () => selectFreeVideoProvider([wan], request),
    (err: unknown) => err instanceof FreeVideoProviderError && err.code === "free_route_not_approved",
  );
});

test("Wan2.2 is selected only when explicitly enabled, with a real input image", () => {
  const wan = enabledWan();
  assert.equal(selectFreeVideoProvider([wan], { ...request, model: WAN22_FREE_MODEL, providerId: WAN22_FREE_PROVIDER_ID }), wan);
  assert.throws(
    () => selectFreeVideoProvider([wan], { ...request, hasFirstFrame: false }),
    (err: unknown) => err instanceof FreeVideoProviderError && err.code === "missing_image",
  );
});

test("paid and unknown-billing providers can never be selected", () => {
  const wan = enabledWan();
  const paid = { ...wan, id: "charged-website", billing: "paid" as const };
  const unknown = { ...wan, id: "unknown-website", billing: "unknown" as const };
  assert.equal(selectFreeVideoProvider([paid, unknown, wan], request).id, wan.id);
  assert.throws(
    () => selectFreeVideoProvider([paid, unknown], request),
    (err: unknown) => err instanceof FreeVideoProviderError && err.code === "free_route_not_approved",
  );
});

test("unsupported reference images, last frame, audio, length are rejected instead of ignored", () => {
  const wan = enabledWan();
  for (const unsupported of [
    { hasLastFrame: true },
    { hasReferenceImages: true },
    { hasReferenceVideo: true },
    { generateAudio: true },
    { durationSeconds: 5 },
    { model: "not-supported" },
  ]) {
    assert.throws(
      () => selectFreeVideoProvider([wan], { ...request, ...unsupported }),
      (err: unknown) => err instanceof FreeVideoProviderError && err.code === "no_compatible_free_provider",
    );
  }
});

test("future free providers can be registered and selected without choosing a paid fallback", () => {
  const wan = getWan22FreeProvider({});
  const future: FreeVideoProvider = {
    ...enabledWan(),
    id: "future_verified_free",
    model: "future-i2v",
    capabilities: { ...wan.capabilities, durationsSeconds: [2, 5], lastFrame: true },
  };
  const picked = selectFreeVideoProvider([wan, future], { ...request, durationSeconds: 5, hasLastFrame: true });
  assert.equal(picked.id, "future_verified_free");
});

test("unregistered provider IDs fail closed", () => {
  assert.throws(
    () => selectFreeVideoProvider([enabledWan()], { ...request, providerId: "replicate" }),
    (err: unknown) => err instanceof FreeVideoProviderError && err.code === "unknown_provider",
  );
});

test("MulmoScript v1.1 accepts free_i2v route and local input image", () => {
  const result = mulmoScriptSchema.safeParse({
    $mulmocast: { version: "1.1" },
    lang: "ja",
    canvasSize: { width: 720, height: 1280 },
    audioParams: { suppressSpeech: true, introPadding: 0, padding: 0, closingPadding: 0, outroPadding: 0 },
    movieParams: { provider: "free_i2v", model: "auto-free", concurrency: 1 },
    beats: [
      {
        id: "shot_01",
        text: "",
        duration: 2,
        image: { type: "image", source: { kind: "path", path: "./assets/input.png" } },
        moviePrompt: "The rocket rises into the sky",
      },
    ],
  });
  assert.equal(result.success, true, result.success ? "" : JSON.stringify(result.error.issues));
});

test("shared movie agent cannot invoke an external service if experimental route is disabled", async () => {
  // A dummy path deliberately does not exist. The network guard must reject
  // before Python subprocess invocation or filesystem reads.
  const previous = process.env.SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT;
  delete process.env.SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT;
  try {
    const invoke = movieFreeRouterAgent as unknown as (arg: {
      namedInputs: { imagePath: string; prompt: string; movieFile: string };
      params: { model: string; canvasSize: { width: number; height: number }; duration: number };
    }) => Promise<unknown>;
    await assert.rejects(
      () =>
        invoke({
          namedInputs: { imagePath: "/does/not/exist.png", prompt: "test", movieFile: "/nothing.mov" },
          params: { model: "auto-free", canvasSize: { width: 720, height: 1280 }, duration: 2 },
        }),
      (err: unknown) => err instanceof FreeVideoProviderError && err.code === "free_route_not_approved",
    );
  } finally {
    if (previous === undefined) delete process.env.SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT;
    else process.env.SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT = previous;
  }
});
