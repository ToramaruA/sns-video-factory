# One animated Wan 2.2 cut + two existing FLUX stills (EXPERIMENT ONLY)

This is the **next small step** after the real Groq → 3 FLUX stills → MulmoCast six-second MP4 success ([run #44066142099](https://github.com/ToramaruA/sns-video-factory/actions/runs/44066142099)). It reuses:

- The saved original Groq MulmoScript, with all three `moviePrompt` fields.
- The three actual FLUX stills from that same run, **without another Groq or FLUX API request**.
- The existing experimental `free_i2v` → `movieFreeRouterAgent` → Wan 2.2 ZeroGPU adapter, and its local one-host ledger.
- Original MulmoCast for both the one-cut movie render and the final 3-cut local-media composition.

**Output target:** a silent, portrait 720×1280, approximately six-second MP4. One selected cut contains a real generated two-second moving AI clip, the other two remain still images. This is *not* the final three-moving-cuts product and does not implement TTS.

## Free-only boundary

- **Wan model:** Apache-2.0 weights, but using somebody else's public Hugging Face Space is a **separate service permission and quota question**. A one-time technical experiment is **not** approval to use the Space as backend infrastructure for a commercial or shared Web service.
- **ZeroGPU:** Hugging Face's [official usage limits](https://huggingface.co/docs/hub/spaces-api-endpoints) show 2 minutes per day unauthenticated and 5 minutes per day on free accounts. Anonymous requests use a shared, constrained pool. No guaranteed capacity, runtime or stable API.
- This workflow is `workflow_dispatch` only, and requires **two unchecked-by-default affirmative inputs**: free anonymous demo experiment and consent to send an AI-generated, non-private still to the third-party Space. If conditions are not met, **do not run**.
- The workflow clears all billed-provider API keys, Hugging Face tokens and inferred HF auth; it does not use a paid fallback. The Python bridge submits **only one** I2V request, no retry.
- There is no general use of `--sns-free-only` with `moviePrompt`: existing safety policy correctly rejects experimental remote video generation. The *one-cut* Wan script is created from an exact allowlist with fixed local image path, one two-second `moviePrompt`, `free_i2v` provider, TTS disabled; the manual workflow explicitly enables the experimental route just for that one generation. The **three-cut local composition** then uses normal `--sns-free-only`.
- The local ledger on the Actions runner is **not durable between separate workflow runs**. This is not a production queue or a permanent quota record. Do not automatically retry, schedule this workflow, or treat it as a deployable service.
- If the Space returns 403/429, is unavailable, or its API changes, stop; no fallback to another service or account.

## Manual single-experiment test

1. Confirm this remains a one-time, anonymous Free-tier technical experiment, that the third-party public Space may receive this non-private AI still, and that no paid HF account token is involved.
2. Visit [SNS Video Factory - 1-cut Wan I2V experiment (MANUAL ONLY)](https://github.com/ToramaruA/sns-video-factory/actions/workflows/sns-video-wan-one-cut-manual.yml).
3. Select a completed **same-repository** Groq → FLUX preview run ID with its artifact still available (the default `44066142099` expires on **2026-11-20 at approximately 10:36 UTC**); select one beat, default `main`.
4. Deliberately check both affirmative inputs and run on `main`. This may fail due to the shared anonymous quota without any charge. The workflow does not renew the original images or attempt additional media generation.
5. On success download `wan-single-moving-cut-with-two-stills`: it includes a two-second standalone clip and the six-second portrait MP4.

The downloaded artifact structure from PR #15 must include:
- `experiments/06-groq-planning/generated/sns-video-plan.json`
- `output/images/three-cut-preview/{hook,main,closing}.png`

The `prepare.ts` handoff reads only these files and creates a fresh one-beat experimental MulmoScript. After Wan returns, it creates a safe three-cut script referencing only copied **local** stills and the newly generated local clip. No extra storyboard format, image generator, movie engine or persistence system is introduced.

### Code verification (no APIs)

`test/sns_video/test_one_cut_i2v_preview.ts` checks that the original plan is not mutated; paid or altered plans fail; the one-cut Wan script has exactly one source still and one motion prompt; the final mixed script contains **no** generation prompts and passes the original `assertSnsNoPaidApiMovie` guard.

This PR can be merged based on offline CI only. A successful manual run must be verified separately and does **not** prove continuous free or SaaS usage rights.
