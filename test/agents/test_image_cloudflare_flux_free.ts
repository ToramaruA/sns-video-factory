import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateCloudflareFluxImage } from "../../src/agents/image_cloudflare_flux_agent.js";
import { MulmoScriptMethods } from "../../src/methods/mulmo_script.js";
import { MulmoPresentationStyleMethods } from "../../src/methods/mulmo_presentation_style.js";

const env = {
  SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED: "1",
  CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  CLOUDFLARE_API_TOKEN: "test-token",
};
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

test("native MulmoScript uses Cloudflare Free image provider without changing beats or local image inputs", () => {
  const script = MulmoScriptMethods.validate({
    $mulmocast: { version: "1.1" },
    lang: "ja",
    imageParams: { provider: "cloudflare_free" },
    audioParams: { suppressSpeech: true },
    beats: [
      { text: "", duration: 3, image: { type: "image", source: { kind: "path", path: "./photo.jpg" } } },
      { text: "", duration: 3, imagePrompt: "A concert hall at night" },
    ],
  });
  assert.equal(script.beats.length, 2);
  assert.equal(script.beats[0].image?.type, "image");
  assert.equal(script.beats[1].imagePrompt, "A concert hall at night");
  const imageAgent = MulmoPresentationStyleMethods.getImageAgentInfo(script);
  assert.equal(imageAgent.agent, "imageCloudflareFluxAgent");
  assert.equal(imageAgent.imageParams.model, "@cf/black-forest-labs/flux-1-schnell");
});

test("fixed Cloudflare Free endpoint receives only supported prompt and steps", async () => {
  let requests = 0;
  const out = await generateCloudflareFluxImage("A concert stage", {
    env,
    fetcher: async (url, init) => {
      requests += 1;
      assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`);
      assert.equal(new Headers(init.headers).get("Authorization"), "Bearer test-token");
      assert.deepEqual(JSON.parse(String(init.body)), { prompt: "A concert stage", steps: 4 });
      return Response.json({ success: true, result: { image: jpeg.toString("base64") } });
    },
  });
  assert.equal(requests, 1);
  assert.deepEqual(out, jpeg);
});

test("plan verification, model, reference-image restrictions are enforced before a request", async () => {
  const cases = [
    { env: { ...env, SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED: "0" }, prompt: "concert" },
    { env: { ...env, CLOUDFLARE_ACCOUNT_ID: "bad-id" }, prompt: "concert" },
    { env, prompt: "concert", model: "paid-model" },
    { env, prompt: "concert", referenceImages: ["./photo.jpg"] },
    { env, prompt: "x".repeat(2049) },
  ];
  for (const scenario of cases) {
    await assert.rejects(generateCloudflareFluxImage(scenario.prompt, {
      ...scenario,
      fetcher: async () => { throw new Error("Unexpected network request"); },
    }), /Free|ACCOUNT_ID|pinned|reference images|2048/);
  }
});

test("quota failure does not fall back to a paid API", async () => {
  let requests = 0;
  await assert.rejects(generateCloudflareFluxImage("concert", {
    env,
    fetcher: async () => {
      requests += 1;
      return Response.json({ success: false, errors: [{ code: 3036 }] }, { status: 429 });
    },
  }), /HTTP 429/);
  assert.equal(requests, 1);
});

test("example MulmoScript keeps original Japanese TTS and image provider fields", () => {
  const example = JSON.parse(readFileSync("docs/sns-video/examples/free-stills-ja-narration.json", "utf8"));
  const script = MulmoScriptMethods.validate(example);
  assert.equal(script.imageParams.provider, "cloudflare_free");
  assert.equal(script.speechParams.speakers.Presenter.provider, "gemini");
  assert.equal(script.speechParams.speakers.Presenter.model, "gemini-3.8-flash-tts");
  assert.equal(script.audioParams.suppressSpeech, false);
  assert.equal(script.beats.length, 2);
});
