import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMulmoScriptFromText } from "../../src/tools/create_mulmo_script_from_url.js";
import { getScriptFromPromptTemplate, readTemplatePrompt } from "../../src/utils/file.js";
import { mulmoScriptSchema } from "../../src/types/schema.js";
import { validateSnsShortPlan } from "../../src/sns-video/planning/validate_sns_short.js";
import { assertGroqFreePlanConfigured, GROQ_FREE_PLANNING_MODEL } from "../../src/sns-video/safety/free_planning.js";

test("the new SNS 3-cut template reuses MulmoCast's existing prompt template and schema", () => {
  const template = getScriptFromPromptTemplate("sns_video_short");
  assert.ok(template);
  assert.match(readTemplatePrompt("sns_video_short"), /cloudflare_free/);
  assert.equal(template.beats.length, 3);
  assert.equal(template.canvasSize.width, 720);
  assert.equal(template.movieParams.provider, "mock");
  assert.equal(template.audioParams.suppressSpeech, true);
  assert.equal(GROQ_FREE_PLANNING_MODEL, "openai/gpt-oss-20b");
});

test("existing GraphAI text-to-script works with the new 3-cut template, without using any external LLM", async () => {
  const template = getScriptFromPromptTemplate("sns_video_short");
  assert.ok(template);
  const fixture = {
    ...template,
    title: "室内楽の夜",
    beats: template.beats.map((beat, index) => ({
      ...beat,
      imagePrompt: `Cinematic classical concert scene ${index + 1} with a piano and violin, no text`,
      moviePrompt: `Slow cinematic camera movement around a concert stage, scene ${index + 1}`,
    })),
  };
  const outDirPath = mkdtempSync(join(tmpdir(), "sns-groq-offline-"));
  try {
    let calls = 0;
    const output = await createMulmoScriptFromText(
      "架空の室内楽コンサート。ピアノとヴァイオリン。",
      { llm: "mock", templateName: "sns_video_short", urls: [], outDirPath, cacheDirPath: join(outDirPath, "cache"), filename: "plan-test" },
      async () => {
        calls += 1;
        return { text: ["```json", JSON.stringify(fixture), "```"].join(String.fromCharCode(10)) };
      },
    );
    const script = validateSnsShortPlan(mulmoScriptSchema.parse(JSON.parse(readFileSync(output, "utf8"))));
    assert.equal(calls, 1);
    assert.equal(script.beats.length, 3);
    assert.equal(script.beats[1].moviePrompt?.includes("cinematic"), true);
  } finally {
    rmSync(outDirPath, { recursive: true, force: true });
  }
});

test("unsafe or placeholder plans are rejected before any downstream paid provider can run", () => {
  const template = getScriptFromPromptTemplate("sns_video_short");
  assert.ok(template);
  const withPrompts = {
    ...template,
    beats: template.beats.map((beat) => ({ ...beat, imagePrompt: "A concert stage", moviePrompt: "Slow camera pan" })),
  };
  const safe = mulmoScriptSchema.parse(withPrompts);
  assert.doesNotThrow(() => validateSnsShortPlan(safe));
  const wrongProvider = mulmoScriptSchema.parse({ ...withPrompts, movieParams: { provider: "replicate" } });
  assert.throws(() => validateSnsShortPlan(wrongProvider), /movie generator/);
  const placeholder = mulmoScriptSchema.parse(template);
  assert.throws(() => validateSnsShortPlan(placeholder), /real image prompt/);
  const injectedAudio = mulmoScriptSchema.parse({ ...withPrompts, audioParams: { suppressSpeech: false } });
  assert.throws(() => validateSnsShortPlan(injectedAudio), /audio/);
  const extraBeat = mulmoScriptSchema.parse({ ...withPrompts, beats: [...withPrompts.beats, withPrompts.beats[0]] });
  assert.throws(() => validateSnsShortPlan(extraBeat), /exactly three beats/);
});

test("Groq Free Plan and API key must both be explicitly provided, without using the API", () => {
  assert.throws(() => assertGroqFreePlanConfigured({ GROQ_API_KEY: "dummy" }), /CONFIRMED/);
  assert.throws(() => assertGroqFreePlanConfigured({ SNS_VIDEO_GROQ_FREE_PLAN_CONFIRMED: "1" }), /API key/);
  assert.doesNotThrow(() => assertGroqFreePlanConfigured({ GROQ_API_KEY: "dummy", SNS_VIDEO_GROQ_FREE_PLAN_CONFIRMED: "1" }));
});
