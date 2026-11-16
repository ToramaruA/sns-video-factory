import type { Argv } from "yargs";
import { commonOptions, estimateOptions } from "../../common.js";
import { languages } from "../../../types/const.js";

export const builder = (yargs: Argv) =>
  estimateOptions(commonOptions(yargs))
    .option("a", {
      alias: "audiodir",
      describe: "Audio output directory",
      type: "string",
    })
    .option("i", {
      alias: "imagedir",
      describe: "Image output directory",
      type: "string",
    })
    .option("sns-free-only", {
      describe: "Fail closed unless this movie uses only local assets and bundled mock generators (SNS MVP safe mode)",
      type: "boolean",
      default: false,
    })
    .option("c", {
      alias: "caption",
      describe: "Video captions",
      choices: languages,
      type: "string",
    });
