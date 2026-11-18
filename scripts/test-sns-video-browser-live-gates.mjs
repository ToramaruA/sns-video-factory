/**
 * Check every fail-closed branch of the real browser live verifier without
 * granting full permissions or making a single Groq / Cloudflare request.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const liveVerifier = join(here, "verify-sns-video-browser-live.mjs");
const noKeys = {
  ...process.env,
  SNS_VIDEO_GROQ_FREE_PLAN_CONFIRMED: "0",
  SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED: "0",
  SNS_VIDEO_BRIEF: "",
  SNS_VIDEO_WEB_VOICE_ENABLED: "false",
  SNS_VIDEO_NEMO_CREDIT_CONFIRMED: "false",
  GROQ_API_KEY: "",
  LLM_GROQ_API_KEY: "",
  CLOUDFLARE_ACCOUNT_ID: "",
  CLOUDFLARE_API_TOKEN: "",
  OPENAI_API_KEY: "",
  LLM_OPENAI_API_KEY: "",
  REPLICATE_API_TOKEN: "",
};

const cases = [
  {
    name: "No account-level Free Plan confirmation",
    env: {},
    error: /Both account-level Free plans must be explicitly confirmed/,
  },
  {
    name: "Free Plan flags supplied but no API credentials",
    env: {
      SNS_VIDEO_GROQ_FREE_PLAN_CONFIRMED: "1",
      SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED: "1",
    },
    error: /Missing one or more existing Groq\/Cloudflare Free Plan secrets/,
  },
  {
    name: "Credentials present but no user video brief",
    env: {
      SNS_VIDEO_GROQ_FREE_PLAN_CONFIRMED: "1",
      SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED: "1",
      GROQ_API_KEY: "test-dummy-key-not-an-api-key",
      CLOUDFLARE_ACCOUNT_ID: "test-account-only",
      CLOUDFLARE_API_TOKEN: "test-dummy-token",
    },
    error: /Provide a brief of 1-3500 characters/,
  },
  {
    name: "Voice synthesis requested without Nemo credit confirmation",
    env: {
      SNS_VIDEO_GROQ_FREE_PLAN_CONFIRMED: "1",
      SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED: "1",
      GROQ_API_KEY: "test-dummy-key-not-an-api-key",
      CLOUDFLARE_ACCOUNT_ID: "test-account-only",
      CLOUDFLARE_API_TOKEN: "test-dummy-token",
      SNS_VIDEO_BRIEF: "架空のピアノ演奏会のSNS用告知",
      SNS_VIDEO_WEB_VOICE_ENABLED: "true",
    },
    error: /VOICEVOX Nemo credit confirmation is required/,
  },
];

for (const scenario of cases) {
  test("live browser E2E blocks before any network generation: " + scenario.name, () => {
    const result = spawnSync(process.execPath, [liveVerifier], {
      cwd: join(here, ".."),
      env: { ...noKeys, ...scenario.env },
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, scenario.error);
    assert.doesNotMatch(result.stdout + result.stderr, /Browser accepted authenticated generation request/);
    assert.doesNotMatch(result.stdout + result.stderr, /test-dummy-key-not-an-api-key|test-dummy-token/);
  });
}
