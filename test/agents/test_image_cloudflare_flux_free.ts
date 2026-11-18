import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateCloudflareFluxImage } from "../../src/agents/image_cloudflare_flux_agent.js";
import { MulmoScriptMethods } from "../../src/methods/mulmo_script.js";
import { MulmoPresentationStyleMethods } from "../../src/methods/mulmo_presentation_style.js";

const env = {
  SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED: "1",
  CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  CLOUDFLARE_API_TOKEN: "test-token",
};
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGMUmXaCgYGBiYGBgYGBAQAQzgF2ispLVwAAAABJRU5ErkJggg==", "base64");
const klein = "@cf/black-forest-labs/flux-2-klein-4b";
const schnell = "@cf/black-forest-labs/flux-1-schnell";

test("existing MulmoScript reference image and uploaded asset fields are unchanged", () => {
  const script = MulmoScriptMethods.validate({
    $mulmocast: { version: "1.1" },
    lang: "ja",
    imageParams: {
      provider: "cloudflare_free",
      images: {
        sample: { type: "image", source: { kind: "path", path: "./photo.jpg" } },
      },
    },
    audioParams: { suppressSpeech: true },
    beats: [
      { text: "", duration: 3, image: { type: "image", source: { kind: "path", path: "./photo.jpg" } } },
      { text: "", duration: 3, imagePrompt: "A concert hall at night", imageNames: ["sample"] },
    ],
  });
  assert.equal(script.beats.length, 2);
  assert.equal(script.beats[0].image?.type, "image");
  assert.deepEqual(script.beats[1].imageNames, ["sample"]);
  const agent = MulmoPresentationStyleMethods.getImageAgentInfo(script);
  assert.equal(agent.agent, "imageCloudflareFluxAgent");
  assert.equal(agent.imageParams.model, klein);
});

test("FLUX.2 Klein sends native multipart image bytes and prompt in same request", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mulmo-flux2-test-"));
  const reference = join(dir, "source.png");
  await writeFile(reference, png);
  try {
    let calls = 0;
    const output = await generateCloudflareFluxImage("Match the performer from image 0", {
      env,
      model: klein,
      referenceImages: [reference],
      canvasSize: { width: 720, height: 1280 },
      fetcher: async (url, init) => {
        calls++;
        assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${klein}`);
        assert.equal(init.method, "POST");
        assert.equal(new Headers(init.headers).get("Authorization"), "Bearer test-token");
        assert.equal(new Headers(init.headers).get("Content-Type"), null);
        assert.ok(init.body instanceof FormData);
        const form = init.body;
        assert.equal(form.get("prompt"), "Match the performer from image 0");
        assert.equal(form.get("width"), "720");
        assert.equal(form.get("height"), "1280");
        assert.equal(form.get("input_image_1"), null);
        const source = form.get("input_image_0");
        assert.ok(source instanceof Blob);
        const binary = Buffer.from(await source.arrayBuffer());
        assert.equal(binary.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        // PNG width/height at IHDR offsets; both must be below Cloudflare's 512px strict limit.
        assert.ok(binary.readUInt32BE(16) < 512);
        assert.ok(binary.readUInt32BE(20) < 512);
        return Response.json({ success: true, result: { image: png.toString("base64") } });
      },
    });
    assert.equal(calls, 1);
    assert.deepEqual(output, png);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("FLUX.1 Schnell remains selectable for prompts without references", async () => {
  let calls = 0;
  const output = await generateCloudflareFluxImage("A concert stage", {
    env,
    model: schnell,
    fetcher: async (url, init) => {
      calls++;
      assert.ok(url.endsWith(schnell));
      assert.deepEqual(JSON.parse(String(init.body)), { prompt: "A concert stage", steps: 4 });
      return Response.json({ success: true, result: { image: png.toString("base64") } });
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(output, png);
});

test("invalid plan/model/oversized reference-list cannot send an API request", async () => {
  const cases = [
    { env: { ...env, SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED: "0" }, prompt: "concert" },
    { env: { ...env, CLOUDFLARE_ACCOUNT_ID: "bad-id" }, prompt: "concert" },
    { env, prompt: "concert", model: "paid-model" },
    { env, prompt: "concert", model: schnell, referenceImages: ["./photo.jpg"] },
    { env, prompt: "concert", model: klein, referenceImages: Array(5).fill("./photo.jpg") },
    { env, prompt: "x".repeat(2049) },
  ];
  for (const scenario of cases) {
    await assert.rejects(
      generateCloudflareFluxImage(scenario.prompt, {
        ...scenario,
        fetcher: async () => {
          throw new Error("Unexpected network request");
        },
      }),
      /Free|ACCOUNT_ID|Unsupported|reference images|maximum|2048/,
    );
  }
});

test("missing reference image blocks API request", async () => {
  await assert.rejects(
    generateCloudflareFluxImage("concert", {
      env,
      model: klein,
      referenceImages: ["/path/that/does/not/exist.png"],
      fetcher: async () => {
        throw new Error("NETWORK MUST NOT BE CALLED");
      },
    }),
    /ENOENT/,
  );
});

test("HTTP quota error does not fall back to a paid API", async () => {
  let calls = 0;
  await assert.rejects(
    generateCloudflareFluxImage("concert", {
      env,
      model: klein,
      fetcher: async () => {
        calls++;
        return Response.json({ success: false, errors: [{ code: 3036 }] }, { status: 429 });
      },
    }),
    /HTTP 429/,
  );
  assert.equal(calls, 1);
});

test("existing Japanese TTS and image provider example stays valid", () => {
  const example = JSON.parse(readFileSync("docs/sns-video/examples/free-stills-ja-narration.json", "utf8"));
  const script = MulmoScriptMethods.validate(example);
  assert.equal(script.imageParams.provider, "cloudflare_free");
  assert.equal(script.speechParams.speakers.Presenter.provider, "gemini");
  assert.equal(script.speechParams.speakers.Presenter.model, "gemini-3.8-flash-tts");
  assert.equal(script.audioParams.suppressSpeech, false);
  assert.equal(script.beats.length, 2);
});
