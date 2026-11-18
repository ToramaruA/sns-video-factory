# AI接続の監査・最小実装（2026-11-18）

対象: 公式MulmoCastコミット `c410d188536cfe4150a12c47c2a767525b9100ed` を起点にした `restart/mulmocast-upstream-free-ai`。

**基本方針:** 元の `mulmo tool scripting` / MulmoScript / `mulmo movie` / 画像参照 / 既存素材入力 / 音声 / 字幕 / 結合をそのまま使用する。独自の制作ワークフローは追加しない。

| 工程 | 元MulmoCastの接続点・既存AI | 無課金化の判断 | 実装状態 |
| --- | --- | --- | --- |
| 企画・カット割り | `tool scripting` / `llmPair` / `provider2LLMAgent.groq` | Groq Freeの `openai/gpt-oss-20b` を**既存CLIオプション**で選択可能。新コード不要 | **既存機能のみ** |
| 画像生成 | `provider2ImageAgent` / `images` / `image_references` | Google Gemini画像APIのFree Tierは公式料金表で「Not available」。既存Google設定だけでは無料化できない。Cloudflare Workers FreeのFLUX.1 schnellを既存image agent境界に追加 | **最小provider接続を追加** |
| 画像入力・参照 | `imageParams.images` / `beat.image` / `imageNames` | 元の画像入力・素材使用は維持。FLUX.1 schnellは**テキストから画像のみ**で、参照画像が指定された生成はAPI送信前に明示的エラー。他の参照画像対応モデルや独自画像ファイル入力を削除しない | **元の形式を維持** |
| I2V / T2V | `provider2MovieAgent.google/replicate`, `moviePrompt` | 既存プロバイダーはAPI有料。継続無料・API・SNS宣伝利用を満たすモデルを未確認。無料と確認できるまで接続しない・動画化済みと呼ばない | **未対応** |
| 日本語音声 | `provider2TTSAgent`, `audio` | 既存のOpenAI等は有料。VOICEVOX Nemoはローカルで商用可（クレジット「VOICEVOX Nemo」が必要）だが、元MulmoCastのTTSエージェントとの直接連携は未実装。既存音声ファイルの入力は変更しない | **無料TTS接続は未対応** |
| 字幕・音声素材・合成・MP4 | 既存 `audio → images → captions → avatar → movie` | 変更不要 | **未変更** |

## 既存機能を使う最短経路

### A: 無料LLMによるMulmoScript生成

Groqの**実際のアカウントがFree Plan**であり、無料APIキーの取得・モデル利用条件を確認した場合:

```bash
export GROQ_API_KEY='自分のGroqキー'
mulmo tool scripting --llm groq --llm_model openai/gpt-oss-20b -i
```

文章ファイルの場合:

```bash
mulmo tool scripting --llm groq --llm_model openai/gpt-oss-20b --input-file story.txt
```

**元のMulmoCastの既存LLM処理**でカット割りとMulmoScriptを出す。無料LLMの出力品質・API実通信はこのブランチではまだ実証していない。

### B: 無料画像モデルを元のMulmoScriptから使う

Cloudflare Workers **Free Plan**を確認した上で `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN` を環境変数に設定する。**Workers Paidではこの無料専用経路を許可しない**。確認した場合のみ:

```bash
export SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED=1
```

従来のMulmoScriptの `imageParams` に追加する:

```json
"imageParams": {
  "provider": "cloudflare_free",
  "model": "@cf/black-forest-labs/flux-1-schnell"
}
```

例えば `beats` に `imagePrompt` を残したまま `mulmo images script.json` を実行する（`mulmo movie` は既定の有料音声設定なども実行する可能性があるため、料金の確認なしには実行しない）。このproviderは公式の既存GraphAI画像生成・参照画像処理へ登録されるだけで、動画制作経路やMulmoScriptは置き換えない。

- `beat.image: {type:"image",source:{kind:"path",path:"..."}}` などの既存素材入力は引き続きMulmoCastが利用できる。
- `imageNames` 等で指定した参照画像を使って**新たな画像を生成**する場合、FLUX.1 schnellには画像入力パラメーターがなく、画像参照は明示的に停止する。入力された画像自体を静止画素材として使用する経路まで禁止しない。
- 無料契約の確認は利用者の申告であり、自動検証ではない。無料枠切れ・契約違いでは失敗し、有料サービスにはフォールバックしない。
- Cloudflareの定額・従量課金条件やモデル使用条件は変わり得る。APIキー設定だけで無料と判断しない。

## 変更範囲と検証

- 元のMulmoCastの `src/types/provider2agent.ts` に選択可能な画像providerを1件追加。
- 元の `src/agents/index.ts`、`src/actions/images.ts`、`src/actions/image_references.ts` に画像エージェントを登録。
- Cloudflare公式APIのみ使う小さなエージェントと、無料プラン確認ガードを追加。
- オフラインのHTTPモックテストを追加。**実際のGroq/Cloudflare API、画像品質、本番動画生成の検証ではない**。

## 公式料金・仕様

- Groq Free Planのレート制限（`openai/gpt-oss-20b`）: https://console.groq.com/docs/rate-limits
- Cloudflare Workers AI Free（10,000 Neurons/日、Workers Freeでは上限超過後に拒否）: https://developers.cloudflare.com/workers-ai/platform/pricing/
- FLUX.1 schnell API仕様（`prompt`、`steps`、画像はJPEG/base64）: https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/
- Google Gemini image API料金（Free Tier不可）: https://ai.google.dev/gemini-api/docs/pricing
- VOICEVOX Nemo利用規約（クレジット要）: https://voicevox.hiroshiba.jp/nemo/term/
