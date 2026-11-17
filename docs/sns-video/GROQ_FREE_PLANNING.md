# Groq Free Plan — SNS 3カット企画生成（2026-11-17）

## 何を実装したか

- **新しいLLMエンジンは作らない。** PR #12の`createMulmoScriptWithGroqFreePlan`から既存MulmoCast/GraphAIの`createMulmoScriptFromText`を使う。
- SNS専用の**既存MulmoCastテンプレート形式**を`assets/templates/sns_video_short.json`と`scripts/templates/sns_video_short.json`で用意。縦720×1280、3カット、各2秒、画像プロンプトと動画化プロンプトの両方を企画する。
- 企画モデルは`groq / openai/gpt-oss-20b`で固定。**画像や動画、ナレーション等の生成は実行しない。**
- `validateSnsShortPlan`でLLMが余計な有料プロバイダーを指定した場合や3カットの契約に違反した場合は停止。これは**企画の検査**であり、生成された`moviePrompt`を現在の`--sns-free-only`でレンダリングする許可ではない。
- GitHub Actionsの`SNS Video Factory - Groq Free planning (MANUAL ONLY)`を**明示的に実行した場合だけ**、実際のGroq APIを使う。PR/pushでは必ずオフラインテストだけを使う。

## 公式情報と無料プランの注意

- [Groq: GPT-OSS-20B](https://console.groq.com/docs/model/openai/gpt-oss-20b)
- [Groq: Rate Limits](https://console.groq.com/docs/rate-limits) — 組織単位の制限、超過はHTTP 429
- [Groq: GroqCloudのAPIキー](https://console.groq.com/keys)
- [Groq: Freeプランの説明](https://community.groq.com/t/do-i-get-charged-for-anything-on-the-groq-free-plan/832)

**重要:** Groqは**FreeとDeveloperで課金が異なる**。このモデルには有料の料金表も存在する。アカウントがFreeかどうかは手動で確認する。キーを持っているだけで無料と判断してはいけない。

既存GraphAIはスキーマエラーの場合**最大3回**の企画生成呼び出しを行うことがある。したがって「ワークフロー1回＝Groq API 1リクエスト」とは限らない。Freeでレート制限されれば停止し、Developer（有料）プランへ自動移行しない。

## 実際に試す手順（準備はユーザー側、ログ調査はGitHub連携で支援可能）

1. [Groq Console](https://console.groq.com/)にログインし、**使用するOrganizationのプランがFree**であることを確認する。Developer/有料プランなら実行しない。画面の組織を間違えない。
2. [Groq API Keys](https://console.groq.com/keys)で、`sns-video-factory`などの名前のAPIキーを作成。**キーはチャット・Issue・PR・ソースコードに貼らない**。
3. [SNS動画ツールのRepository Secrets](https://github.com/ToramaruA/sns-video-factory/settings/secrets/actions) → **New repository secret**を押し、`Name`に`GROQ_API_KEY`、`Secret`に先ほどのキーを貼り、`Add secret`で保存。
4. [Actions → SNS Video Factory - Groq Free planning (MANUAL ONLY)](https://github.com/ToramaruA/sns-video-factory/actions/workflows/sns-video-groq-planning-manual.yml)を開く。**Run workflow**を押し、ブランチは`main`。Groq Freeプラン確認のチェック項目にチェックして実行。
5. 実行履歴の`one-groq-plan`ジョブが**Success**であることを確認し、`Artifacts → groq-free-three-cut-mulmoscript`から`sns-video-plan.json`を取得。**3カットの企画JSON**で、MP4ではない。

ユーザーの既存Cloudflareトークンはこのテストには使わない。新しい`GROQ_API_KEY`が必要。

## 実測の境界と速度

- **済:** GraphAIのモックLLM・Zod検証・企画JSON出力をオフラインCIで検証
- **未:** 実Groq APIでの日本語からの企画生成。ユーザーのGroq Freeアカウント＋APIキー接続後に手動試験
- **未:** Groq企画JSON→FLUX実画像→Wanなど実I2V→MP4の**連続自動生成**。別段階で接続先と利用権利を確認する

前回のCloudflare画像テストの約1分34秒には**CIの依存導入・ビルド・MulmoCastレンダリング**が含まれる。Groqの企画テストは動画の編集・FFmpegインストールを行わないため、純粋な企画生成区間の時間をログに`elapsedMs`として記録する。
