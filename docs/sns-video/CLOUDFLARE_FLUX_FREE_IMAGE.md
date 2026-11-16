# Cloudflare Workers AI / FLUX.1 Schnell（画像生成）

**更新:** 2026-11-17。既存MulmoCastの`imageGenerator`へCloudflare画像Agentを登録した。**コード接続とオフライン契約テストまで。認証された実APIでの生成成功はまだ確認していない。**

## 公式情報

- [Cloudflare: FLUX.1 schnellのAPI・入力仕様](https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/) — `@cf/black-forest-labs/flux-1-schnell`、REST API、`prompt`（最大2048文字）、`steps`（最大8、既定4）、JPEG画像のbase64返却
- [Cloudflare Workers AI料金](https://developers.cloudflare.com/workers-ai/platform/pricing/) — Workers Freeは**毎日10,000 Neurons**、超過すると失敗。Workers Paidは無料枠超過分を**課金する**ため、勝手に利用しない
- [Cloudflare REST APIのキー取得](https://developers.cloudflare.com/workers-ai/get-started/rest-api/) — Workers AI API TokenとAccount IDが必要
- [Black Forest Labs公式モデル一覧](https://github.com/black-forest-labs/flux) — FLUX.1 Schnellは**Apache 2.0**。別モデルFLUX.1 Devの非商用ライセンスと混同しない

### 動作範囲

- 新しい画像生成フレームワークは作らず、`src/types/provider2agent.ts`、`src/agents/index.ts`、`src/actions/images.ts`に**既存MulmoCastの画像Agentとして追加**。
- providerは`cloudflare_free`、モデルは`@cf/black-forest-labs/flux-1-schnell`に固定。**任意のモデル切替・参照画像による編集は拒否**。CloudflareのAPIがサポートしないオプションは無言で破棄しない。
- Cloudflareが返すJPEG画像を既存MulmoCastの`buffer`出力形式に変換。キャッシュ・FFmpeg編集は既存処理を使用。モデルの生成画像の縦横比は未検証で、最終動画が9:16でも生成画像そのものが縦長とは限らない。
- **有料APIへのフォールバックなし。** HTTP 429・403等では停止。同じプロセスでGraphAIが同一画像リクエストを再試行しても、Cloudflareに同じリクエストを再送しない。異なるプロセス・ホストでの重複防止は未実装。
- `--sns-free-only`の事前チェックでもFree確認・固定モデル・参照画像未使用を検証する。moviePromptを含め、動画生成は**引き続き拒否**（無料I2V先は未承認）。

## 認証情報を自分で用意できた場合の手動実験

**チャットやGitHubのソース・Issue・PRにはAPI Tokenを貼らない。** 実験マシンの環境変数としてのみ指定する。Cloudflareダッシュボードの**WorkersプランがFreeであること**を自分で確認し、Workers AI API Tokenを発行する。必要権限以外は与えない。

```bash
export SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED=1
export CLOUDFLARE_ACCOUNT_ID='<実際の32桁のAccount ID>'
export CLOUDFLARE_API_TOKEN='<Workers AI専用のAPI Token>'
```

実際の生成には、次のようなMulmoScriptを作成する（既存スキーマ v1.1、抜粋）。

```json
{
  "$mulmocast": { "version": "1.1" },
  "title": "FLUX image test",
  "lang": "ja",
  "canvasSize": { "width": 720, "height": 1280 },
  "imageParams": { "provider": "cloudflare_free", "model": "@cf/black-forest-labs/flux-1-schnell" },
  "movieParams": { "provider": "mock", "model": "mock-model" },
  "audioParams": {
    "suppressSpeech": true,
    "introPadding": 0,
    "padding": 0,
    "closingPadding": 0,
    "outroPadding": 0,
    "bgmVolume": 0
  },
  "beats": [{
    "id": "shot_01",
    "text": "",
    "duration": 2,
    "imagePrompt": "An elegant concert stage, dramatic deep blue light, piano and violin, cinematic composition"
  }]
}
```

```bash
yarn build
node lib/cli/bin.js movie ./your-safe-flux-script.json --sns-free-only
```

**注意:** `--sns-free-only`を外さないこと。通常のMulmoCast CLIでは有料既定APIが生きている。Workers Freeという設定が実際に成立している場合のみに限って実APIを使う。APIキーだけでFreeと判定することはできず、`CONFIRMED=1`は**運用者による確認**であって自動の契約監査ではない。アカウントがPaidになったら絶対に確認フラグを外す。

## オフラインのテスト（キー不要）

```bash
yarn build
./node_modules/.bin/tsx --test test/sns_video/test_cloudflare_flux_free.ts test/sns_video/test_no_paid_api.ts
bash experiments/04-offline-e2e/run.sh
```

API契約テストは**通信部分に偽の応答を注入**し、REST URL、Bearer、prompt、モデル固定、Freeプラン未確認拒否、異常応答・429で再送しないことを検証。現在の3カット6秒のMP4は引き続き**モック生成**で書き出す。

次の合格条件は、実際のWorkers Freeアカウントで**1枚生成して画像を確認**し、その結果を使ってMulmoCastで縦動画に書き出すこと。実API検証前に「無料画像生成が完成」とは扱わない。
