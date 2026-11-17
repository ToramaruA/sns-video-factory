# Groq → FLUX → MulmoCast: 3-cut still preview (manual, Free Plan only)

This is the next smallest integration test after PR #14. It reuses the existing GraphAI planner, Cloudflare FLUX image Agent, and MulmoCast movie pipeline. It **does not generate moving AI video**; it outputs a 6-second silent MP4 assembled from three AI-generated stills.

## Safety

- Manual GitHub Actions run only; there is no API call in PR/push CI.
- The two run inputs must both be checked **after** confirming the Groq organization is on the Free Plan and Cloudflare Workers account is on the Free plan. The workflow refuses missing Secrets.
- The workflow may call Groq up to three times if the existing GraphAI planner has to retry schema errors, and requests up to three separate FLUX images. An upstream error can leave the quota partially consumed.
- The plan JSON remains unchanged, including all three `moviePrompt` fields for later I2V. The adapter builds a separate still-only MulmoScript from a **strict allowlist**: three `imagePrompt` values, timings, and approved free/mocked providers. It **does not spread** the AI-generated JSON.
- The adapter validates all three image prompts and the Cloudflare Free Plan account gate before invoking MulmoCast. The standard `--sns-free-only` guard checks the final script again before any generation.
- Upstream MulmoCast may add default OpenAI TTS and Replicate sound-effect provider fields when parsing its schema. Here they are inactive because speech is suppressed and no sound-effect prompts exist. The app must never use these defaults as a signal to enable paid APIs.
- Image generation errors do not trigger a paid fallback. Cloudflare API responses and free quota may change; a successful CI test does not guarantee future free availability.

## Manual test

Run [SNS Video Factory - Groq to FLUX 3-cut preview (MANUAL ONLY)](https://github.com/ToramaruA/sns-video-factory/actions/workflows/sns-video-groq-flux-three-cut-manual.yml) after verifying both Free Plans. The repository Actions Secrets must already contain `GROQ_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN`.

The workflow runs:

1. `experiments/06-groq-planning/run.ts`: real Groq via existing GraphAI writes `sns-video-plan.json`.
2. `prepare_preview.ts`: no API calls; creates `three-cut-preview.json` without `moviePrompt`.
3. Original `mulmo movie ... --sns-free-only`: real FLUX still image generation + MulmoCast MP4 rendering.
4. ffprobe checks resolution and duration. Artifacts contain the plan, preview JSON, MP4 and images.

Until the manual run succeeds, this PR proves the safe handoff and tests **offline only**, not a completed real 3-image video. Revisit video generation (I2V), sound and Web UI in later stages.
