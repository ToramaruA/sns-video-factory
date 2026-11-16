import { audio, images, movie, captions, avatar } from "../../../actions/index.js";
import { assertSnsNoPaidApiMovie } from "../../../sns-video/safety/no_paid_api.js";
import { CliArgs } from "../../../types/cli_types.js";
import { dumpUsageIfRequested, initializeContext, runTranslateIfNeeded, printUsageEstimate } from "../../helpers.js";

export const handler = async (argv: CliArgs<{ estimate?: boolean; json?: boolean; a?: string; i?: string; c?: string; "sns-free-only"?: boolean }>) => {
  const context = await initializeContext(argv);
  if (!context) {
    process.exit(1);
  }
  if (argv.estimate) {
    printUsageEstimate(context, "movie", argv.json);
    return;
  }
  // Check the effective script and presentation style before translation, TTS,
  // any image/movie Agent, or FFmpeg rendering can begin. No paid fallback.
  if (argv["sns-free-only"]) {
    assertSnsNoPaidApiMovie(context.studio.script, {
      targetLang: context.lang,
      presentationStyle: context.presentationStyle,
    });
  }
  await runTranslateIfNeeded(context, true);
  await audio(context).then(images).then(captions).then(avatar).then(movie);
  dumpUsageIfRequested(context);
};
