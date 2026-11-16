# Offline: normal text → GraphAI → MulmoScript → MulmoCast MP4

This is the smallest **no-API-cost integration test** of the existing creation pipeline. It reuses MulmoCast's real GraphAI script graph, Zod schema, media mock Agent, standard `movie` CLI, image cache and FFmpeg editor.

## Run

Requires Node 24, Yarn v1, FFmpeg + FFprobe, Python 3.

```sh
yarn install --frozen-lockfile
yarn build
bash experiments/04-offline-e2e/run.sh
```

Or see GitHub Actions: **SNS Video Factory - offline text to MP4**.

## Actual coverage

- A Japanese-language brief is passed into the **original** `graphDataText` GraphAI graph (not a second script parser).
- A **deterministic fake LLM** supplies a fixture response, verified by the original MulmoScript schema and written through the existing `fileWriteAgent`.
- The resulting MulmoScript contains 3 beats: two local colored images and one `imagePrompt` using MulmoCast's existing **`mediaMockAgent`**, which uses a bundled image rather than generating via a paid AI API.
- The original `movie` CLI performs audio → images → captions → avatar → FFmpeg movie; no approvals in between.
- The existing PR #1 FFprobe verifier checks a 720×1280, approximately 6-second MP4 and visibly different first two scenes.
- API credentials are explicitly blank; the test script checks that no real provider, `moviePrompt`, background music or remote asset is present.

## What this does **not** prove

**No real LLM, text-to-image API, image-to-video AI, or shared Web UI is run.** This test deliberately does not exercise I2V: `moviePrompt` is absent. The experimental Wan 2.2 I2V test is a **separate** proof and its ongoing free/commercial eligibility remains unverified. Do not advertise this as a fully free production video-generation service.

The existing MulmoCast CLI still defaults to billable providers outside this isolated fixture. **Never execute arbitrary user MulmoScript before a separate provider/usage-tier allowlist guard is implemented.**

The new `createMulmoScriptFromText` is a thin entry point into the same GraphAI graph already used by the file-input CLI. It requires an explicit LLM selection, and allows an injected mock **only** with `llm: "mock"`. Later Web work should reuse it, not create a new LLM pipeline.

## Caching boundary

MulmoCast's image cache stores generated images and prevents redundant local image generation. PR #5/#6's separate ledger concerns **submission to external I2V providers** and ambiguous failures; no external I2V submission occurs here, so the ledger is not exercised and must not be deleted based on this test.
