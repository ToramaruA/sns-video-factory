# Free-only MulmoCast direct movie agent — 1 beat

This proves the wiring, **not visual quality**. The simple test image is intentionally synthetic, so it must not be used to judge the best image-to-video quality obtainable from other input photos.

A normal build and offline unit test never make GPU calls. A live 2-second Wan2.2 request is optional and should only be done by an operator who has reviewed the shared ZeroGPU quota and third-party usage conditions.

```sh
python3 -m pip install gradio_client==2.7.2 Pillow
python3 experiments/03-free-i2v-agent/create_input.py
yarn install --frozen-lockfile && yarn build
SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT=1 node lib/cli/bin.js movie experiments/03-free-i2v-agent/mulmo_script.json
```

The `free_i2v` provider routes to `movieFreeRouterAgent`, which selects the experimental anonymous Wan2.2 adapter. It rejects unsupported capabilities, disables all billed fallback, and allows at most one Gradio inference per Node process.

The final rendered MP4 should appear in `output/mulmo_script_ja.mp4` (or a similarly named output based on the script filename); inspect it with FFprobe. If the public Space changes, runs out of shared GPU quota, or disallows anonymous calls, the probe should fail without switching to a paid endpoint.

> The Space's API and shared GPU rules may change. Do not promise production service availability from this experiment. Use no HF authentication tokens.

For details, see [free i2v agent architecture](../../docs/sns-video/FREE_I2V_AGENT.md).
