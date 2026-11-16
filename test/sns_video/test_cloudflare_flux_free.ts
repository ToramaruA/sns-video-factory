import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MulmoScriptMethods } from "../../src/methods/mulmo_script.js";
import { assertSnsNoPaidApiMovie } from "../../src/sns-video/safety/no_paid_api.js";
import { generateCloudflareFluxImage } from "../../src/agents/image_cloudflare_flux_agent.js";
import { assertCloudflareFreePlanConfigured, CLOUDFLARE_FLUX_MODEL } from "../../src/sns-video/safety/cloudflare_free_plan.js";

const freeEnv = {
  SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED: "1",
  CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  CLOUDFLARE_API_TOKEN: "fake-unit-test-token",
};
// Minimal test bytes, not a valid standalone photograph. The production caller
// hands the returned JPEG bytes to MulmoCast's image/FFmpeg pipeline.
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

test("the manual real-image script validates and passes the free-only preflight without any API call", () => {
  const script = MulmoScriptMethods.validate(JSON.parse(readFileSync("experiments/05-cloudflare-flux-one-shot/mulmo_script.json", "utf8")));
  assert.equal(script.beats.length, 1);
  assert.equal(script.imageParams.provider, "cloudflare_free");
  assert.equal(script.movieParams.provider, "mock");
  assert.doesNotThrow(() => assertSnsNoPaidApiMovie(script, { env: freeEnv }));
});

test("official REST endpoint, exact FLUX model and Bearer header; one mock network request", async () => {
  let calls = 0;
  const result = await generateCloudflareFluxImage("A concert stage", {
    model: CLOUDFLARE_FLUX_MODEL,
    env: freeEnv,
    fetcher: async (url, init) => {
      calls++;
      assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${freeEnv.CLOUDFLARE_ACCOUNT_ID}/ai/run/${CLOUDFLARE_FLUX_MODEL}`);
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(String(init.body)), { prompt: "A concert stage", steps: 4 });
      assert.equal(new Headers(init.headers).get("Authorization"), "Bearer fake-unit-test-token");
      return Response.json({ success: true, result: { image: jpeg.toString("base64") } });
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, jpeg);
});

test("Free Plan confirmation and credentials are required before network access", async () => {
  for (const env of [
    {},
    { ...freeEnv, SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED: "0" },
    { ...freeEnv, CLOUDFLARE_ACCOUNT_ID: "not-valid" },
    { ...freeEnv, CLOUDFLARE_API_TOKEN: "" },
  ]) {
    await assert.rejects(
      generateCloudflareFluxImage("concert", {
        env,
        fetcher: async () => {
          throw new Error("NETWORK MUST NOT BE CALLED");
        },
      }),
      /Free|CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN/,
    );
  }
});

test("pin the model, ban reference images and oversized prompts before any API request", async () => {
  for (const item of [{ model: "@cf/black-forest-labs/flux-2-dev" }, { referenceImages: ["./logo.png"] }, { prompt: "x".repeat(2049) }]) {
    await assert.rejects(
      generateCloudflareFluxImage(item.prompt ?? "concert", {
        model: item.model,
        referenceImages: item.referenceImages,
        env: freeEnv,
        fetcher: async () => {
          throw new Error("NETWORK MUST NOT BE CALLED");
        },
      }),
      /pinned|reference images|2048/,
    );
  }
});

test("HTTP quota or authorization failures never retry or switch to a paid model", async () => {
  let calls = 0;
  await assert.rejects(
    generateCloudflareFluxImage("concert", {
      env: freeEnv,
      fetcher: async () => {
        calls++;
        return Response.json({ success: false, errors: [{ code: 3036 }] }, { status: 429 });
      },
    }),
    /HTTP 429/,
  );
  assert.equal(calls, 1);
});

test("malformed API responses fail closed without returning a corrupt image", async () => {
  for (const result of [{}, { result: { image: "NOT+JPEG==" } }, { result: { image: 123 } }]) {
    await assert.rejects(
      generateCloudflareFluxImage("concert", {
        env: freeEnv,
        fetcher: async () => Response.json(result),
      }),
      /base64|JPEG/,
    );
  }
});

test("account Free Plan attestation is not inferred from mere presence of an API key", () => {
  assert.throws(
    () => assertCloudflareFreePlanConfigured({ CLOUDFLARE_API_TOKEN: "token", CLOUDFLARE_ACCOUNT_ID: freeEnv.CLOUDFLARE_ACCOUNT_ID }),
    /Workers Free/,
  );
  assert.deepEqual(assertCloudflareFreePlanConfigured(freeEnv), {
    apiToken: "fake-unit-test-token",
    accountId: freeEnv.CLOUDFLARE_ACCOUNT_ID,
  });
});
