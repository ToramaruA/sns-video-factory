/**
 * An offline fake LLM feeds the real MulmoCast/GraphAI text-to-script graph.
 * This proves prompt wiring, Zod validation, file output and handoff to movie.
 * It does not test a real LLM or image-to-video provider.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMulmoScriptFromText } from "../../src/tools/create_mulmo_script_from_url.js";
import { mulmoScriptSchema } from "../../src/types/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const generated = join(here, "generated");
const brief = readFileSync(join(here, "brief.txt"), "utf8");

const cannedScript = {
  $mulmocast: { version: "1.1" },
  title: "Offline SNS concert demo",
  lang: "ja",
  canvasSize: { width: 720, height: 1280 },
  imageParams: { provider: "mock", model: "mock-model" },
  movieParams: { provider: "mock", model: "mock-model" },
  speechParams: { speakers: { Presenter: { provider: "mock", voiceId: "shimmer" } } },
  audioParams: {
    suppressSpeech: true,
    introPadding: 0,
    padding: 0,
    closingPadding: 0,
    outroPadding: 0,
    bgmVolume: 0,
    audioVolume: 0,
  },
  beats: [
    {
      id: "blue_stage",
      text: "",
      duration: 2,
      image: { type: "image", source: { kind: "path", path: "./assets/blue.png" } },
    },
    {
      id: "mock_image_generation",
      text: "",
      duration: 2,
      imagePrompt: "静かな舞台と楽器。SNS向け縦型構図。今回は既存のオフラインmock画像Agentを呼ぶ。",
    },
    {
      id: "red_stage",
      text: "",
      duration: 2,
      image: { type: "image", source: { kind: "path", path: "./assets/red.png" } },
    },
  ],
};

let calls = 0;
const scriptPath = await createMulmoScriptFromText(
  brief,
  {
    urls: [],
    outDirPath: generated,
    cacheDirPath: join(generated, "cache"),
    templateName: "business",
    filename: "offline-graphai",
    llm: "mock",
  },
  async ({ namedInputs }) => {
    calls += 1;
    assert.match(String(namedInputs.prompt), /クリスマス|室内楽|演奏会/);
    return { text: "```json\n" + JSON.stringify(cannedScript) + "\n```" };
  },
);

const script = mulmoScriptSchema.parse(JSON.parse(readFileSync(scriptPath, "utf8")));
assert.equal(calls, 1, "The mock LLM should be called by the existing GraphAI graph exactly once");
assert.equal(script.beats.length, 3);
assert.equal(script.imageParams?.provider, "mock");
assert.equal(script.movieParams?.provider, "mock");
assert.equal(script.audioParams.suppressSpeech, true);
assert.equal(script.canvasSize.width, 720);
assert.equal(script.canvasSize.height, 1280);

// Fail closed: the fixture must never invoke any real provider, remote source,
// narration, HTML/LLM generation, or paid image-to-video in this offline test.
for (const beat of script.beats) {
  assert.equal(beat.moviePrompt, undefined);
  assert.equal(beat.soundEffectPrompt, undefined);
  assert.equal(beat.htmlPrompt, undefined);
  assert.equal(beat.enableLipSync, undefined);
  assert.equal(beat.imageParams?.provider === undefined || beat.imageParams?.provider === "mock", true);
  if (beat.image?.type === "image") assert.equal(beat.image.source.kind, "path");
}
assert.equal(script.audioParams.bgm, undefined);

const stableScriptPath = resolve(generated, "offline-sns.json");
writeFileSync(stableScriptPath, JSON.stringify(script, null, 2) + "\n");
process.stdout.write("PASS: existing GraphAI generated and validated " + stableScriptPath + "\n");
