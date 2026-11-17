/**
 * Offline only: consume PR #15's saved Groq plan and 3 FLUX image artifacts.
 *
 * Usage:
 *   tsx prepare.ts probe <downloaded-artifact-dir> main
 *   tsx prepare.ts mixed <downloaded-artifact-dir> main
 *
 * This never calls Groq, FLUX or Wan. The calling manual workflow decides
 * whether an experimental Wan request is allowed.
 */
import { copyFileSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MulmoScriptMethods } from "../../src/methods/mulmo_script.js";
import {
  makeSnsMixedI2vPreview,
  makeSnsOneCutWanProbe,
  SNS_PREVIEW_BEAT_IDS,
  type SnsPreviewBeatId,
} from "../../src/sns-video/planning/one_cut_i2v_preview.js";

const mode = process.argv[2];
const artifactDirectory = process.argv[3];
const selected = process.argv[4];

if (mode !== "probe" && mode !== "mixed") throw new Error("First argument must be probe or mixed");
if (!artifactDirectory) throw new Error("Downloaded PR #15 artifact directory is required");
if (!SNS_PREVIEW_BEAT_IDS.includes(selected as SnsPreviewBeatId)) {
  throw new Error("Selected beat must be hook, main or closing");
}
const beatId = selected as SnsPreviewBeatId;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const artifactRoot = resolve(artifactDirectory);
const out = join(projectRoot, "experiments/08-one-cut-wan/generated");
const assets = join(out, "assets");
const planFile = join(artifactRoot, "experiments/06-groq-planning/generated/sns-video-plan.json");
const plan = MulmoScriptMethods.validate(JSON.parse(readFileSync(planFile, "utf8")));

// Validate the original plan and the intended new script before copying files.
const script = mode === "probe" ? makeSnsOneCutWanProbe(plan, beatId) : makeSnsMixedI2vPreview(plan, beatId);
mkdirSync(assets, { recursive: true });

const checkedCopy = (source: string, destination: string, isMovie: boolean): void => {
  const stats = lstatSync(source);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1024 || stats.size > (isMovie ? 100_000_000 : 15_000_000)) {
    throw new Error("Input media must be a regular, non-empty and size-limited file");
  }
  const bytes = readFileSync(source);
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (isMovie ? bytes.toString("ascii", 4, 8) !== "ftyp" : !isPng && !isJpeg) {
    throw new Error("Input media signature is not a supported image or MP4");
  }
  copyFileSync(source, destination);
};

for (const id of SNS_PREVIEW_BEAT_IDS) {
  checkedCopy(join(artifactRoot, "output/images/three-cut-preview", id + ".png"), join(assets, id + ".png"), false);
}

if (mode === "mixed") {
  checkedCopy(join(projectRoot, "output/images/i2v-one-cut", beatId + ".mov"), join(assets, beatId + ".mov"), true);
}

const filename = mode === "probe" ? "i2v-one-cut.json" : "mixed-i2v-preview.json";
const destination = join(out, filename);
writeFileSync(destination, JSON.stringify(script, null, 2) + "\n");
process.stdout.write(`PASS: offline ${mode} handoff for ${beatId}; output=${destination}\n`);
