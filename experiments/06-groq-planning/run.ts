/**
 * Manual one-shot: real Groq Free Plan LLM -> existing GraphAI -> MulmoScript JSON.
 * Intentionally does not call image/movie/TTS APIs. Do not render the draft.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMulmoScriptWithGroqFreePlan } from "../../src/sns-video/safety/free_planning.js";
import { validateSnsShortPlan } from "../../src/sns-video/planning/validate_sns_short.js";
import { mulmoScriptSchema } from "../../src/types/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "generated");
const brief = process.env.SNS_VIDEO_BRIEF?.trim() || readFileSync(join(here, "brief.txt"), "utf8").trim();
if (brief.length < 1 || brief.length > 3500) throw new Error("Brief must contain 1–3500 characters");

const startedAt = Date.now();
const scriptPath = await createMulmoScriptWithGroqFreePlan(brief, {
  urls: [],
  outDirPath: out,
  cacheDirPath: join(out, "cache"),
  templateName: "sns_video_short",
  filename: "groq-sns-plan",
});
const script = validateSnsShortPlan(mulmoScriptSchema.parse(JSON.parse(readFileSync(scriptPath, "utf8"))));
const stablePath = join(out, "sns-video-plan.json");
writeFileSync(stablePath, JSON.stringify(script, null, 2) + "\n");
process.stdout.write(`PASS: Groq -> existing GraphAI -> variable-cut MulmoScript JSON; elapsedMs=${Date.now() - startedAt}; output=${stablePath}\n`);
process.stdout.write("NOTICE: This is a plan, not an AI movie or an approved rendering job.\n");
