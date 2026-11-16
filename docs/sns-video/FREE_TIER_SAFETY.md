# 無料モードの安全チェック（2026-11-16）

## 対象と重要な限界

初期SNS制作向けに、既存MulmoCastを**勝手に課金させない**ための最小ガードを追加。

- **動画レンダリング:** `mulmo movie <script.json> --sns-free-only` を使う。実行前にMulmoScriptと実効PresentationStyleを検査。現在許可するのは、**ローカル画像/動画/音声ファイル、既存のmock画像Agent、ローカルFFmpeg編集**のみ。
- **企画生成:** `createMulmoScriptWithGroqFreePlan` は既存`createMulmoScriptFromText`を再利用して `groq / openai/gpt-oss-20b`へ固定。利用者/運用者が**Groq組織がFree Planであることを確認**し、`SNS_VIDEO_GROQ_FREE_PLAN_CONFIRMED=1`と`GROQ_API_KEY`（または`LLM_GROQ_API_KEY`）を設定した時だけ呼べる。
- 本PRのCIでは**外部生成AI APIを呼び出さない**。前段のモック確認も継続。

**この安全チェックを使わない通常のMulmoCast `movie` / `tool scripting` は従来どおり有料プロバイダーを使う可能性がある。** Webアプリの制作開始ボタンは、必ずこのガード付き入口を使うこと。一般的なマシンやコードのネットワーク遮断装置ではない。公開サービスでは、必ず認証・サーバー側キー管理・コンテナ/実行権限制限を追加すること。

## 動画モードで拒否するもの

- MulmoCast既定の有料画像プロバイダー（OpenAI等）、動画プロバイダー（Replicate等）と、カットごとの上書き
- **moviePromptは全て拒否**。MulmoCastの`mock`動画Agentですら外部ファイルをダウンロードするため、AI動画生成を認める前に別途接続先の審査が必要
- TTS、字幕言語変更に伴うOpenAI翻訳、HTML LLM、効果音のAI生成、口パク・アバター、未審査の画像プラグインや参考素材経由の生成
- 外部URLの画像・音声・BGM（安全を優先し、この初期モードではローカルパスのみ認める）

## なぜ実際のAI動画をまだ生成できない？

無料I2V実験のWan2.2は、単体で2秒生成できたものの、長期の無料枠、SNS宣伝・商用・共用Webアプリでの利用条件はまだ未承認。**無料モードで自動的にWan2.2や有料I2Vへ流さない。** 今後、権利・枠・モデル・アカウント課金状態を確認できた経路だけ拡張する。

## Groqの公式情報（企画用LLM）

- [Groq Free Planの課金説明](https://community.groq.com/t/do-i-get-charged-for-anything-on-the-groq-free-plan/832): Free Planでは課金されず、超過時は429で停止すると説明されている
- [Groq API rate limits](https://console.groq.com/docs/rate-limits): `openai/gpt-oss-20b` などの組織単位の利用制限。**現在の自身の枠はGroq Consoleで確認**すること
- [Groq model](https://console.groq.com/docs/model/openai/gpt-oss-20b): 提供されるLLMモデル

**Free Plan以外の契約で料金がゼロとは限らない。** 同名モデルでもDeveloper Planでは有料料金表がある。だからモデル名だけで「無料」と判断せず、運用者が契約を確認した場合に限ってこの関数を使う。アカウントのFree Plan確認は申告方式であり、Groq APIから契約を直接検証できたという意味ではない。

Gemini APIも[公式無料枠](https://ai.google.dev/gemini-api/docs/pricing)があるが、同じモデルが有料Tierで従量課金される可能性があるため、**今回の自動利用先には追加しない**。

## テスト方法

```sh
yarn install --frozen-lockfile
yarn build
./node_modules/.bin/tsx --test test/sns_video/test_no_paid_api.ts
bash experiments/04-offline-e2e/run.sh
```

2行目以降にAPIキーは不要。既存の3カット・6秒・720×1280のオフラインMP4を、`--sns-free-only`経由で生成できることを確認する。CIワークフロー `sns-video-offline-e2e.yml` も自動実行する。

## 次に必要なもの

1. Groqの**無料プラン上のキー**を接続し、既存GraphAIで実際にスクリプトが生成できることを少数回で確認（現時点では未実施）
2. 無料画像生成元の利用規約・実モデル・無料枠を確認し、最小の画像生成実験
3. SNS宣伝用途・自動API実行・長期無料枠を満たすI2V元を確認し、実験的に1カット生成
4. 許可済み無料モデルだけを安全チェックに追加する。その際、無料枠不足で停止し、有料モデルに切り替えないテストを追加する

[実装計画](./IMPLEMENTATION_PLAN.md) | [構成](./ARCHITECTURE.md)
