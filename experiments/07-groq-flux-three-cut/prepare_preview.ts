/**
 * Prepare a safe MulmoScript still-image preview from the real Groq plan.
 * The original moviePrompt remains in 06-groq-planning/generated/sns-video-plan.json.
 * This program makes NO external calls.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MulmoScriptMethods } from "../../src/methods/mulmo_script.js";
import { makeSnsStillPreview } from "../../src/sns-video/planning/still_preview.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const planPath = join(root, "experiments/06-groq-planning/generated/sns-video-plan.json");
const source = MulmoScriptMethods.validate(JSON.parse(readFileSync(planPath, "utf8")));
const preview = makeSnsStillPreview(source, process.env);
const directory = join(here, "generated");
mkdirSync(directory, { recursive: true });
const output = join(directory, "three-cut-preview.json");
writeFileSync(output, JSON.stringify(preview, null, 2) + "\n");
process.stdout.write(`PASS: validated Groq plan -> safe 3-image MulmoScript preview; output=${output}\n`);
process.stdout.write("NOTICE: still-image MP4 only; original moviePrompt is preserved for later I2V.\n");
