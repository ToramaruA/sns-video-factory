# SNS Video Factory — 現行の方針

**基盤:** [MulmoCast CLI](https://github.com/receptron/mulmocast-cli) のフォーク（AGPL-3.0）。  
**現状:** MVPは**未完成**。2026-11-16に、未使用の試作機構を整理し、既存MulmoCast優先の構成に変更。

## MVPで実現すること

1. ユーザーが普通の日本語で動画の目的や企画を入力する。ChatGPTなどで作成した文章の**コピペ**でもよい。
2. **既存のMulmoCast/GraphAI**で企画・カット割りのMulmoScriptを作り、会話で修正する。特別なJSON形式をユーザーへ要求しない。
3. 企画を確認したユーザーが「生成開始」を押す。
4. **既存MulmoCastをそのまま利用**して、画像生成 → 画像から実際の動画生成（I2V） → 字幕/BGM等 → MP4出力まで**連続実行**する。
5. 完成したMP4を確認・取得する。

**初期版には作らない:** カット単位の画像/動画承認、独自Storyboard DSL、独自動画編集エンジン、複数案の自動採点、独自のLLMエンジン、大規模な管理画面。必要になったら後から検討する。

**無料運用:** 無料TierのAPI利用は可。ただし契約・利用規約・モデルの無料範囲を確認し、事前に**全生成経路を許可リストで検査**する。MulmoCast既定の有料LLM/画像/動画/音声APIを無断実行しない。無料枠不足では停止する。無料枠があることと、商用・共同利用の許可があることは別。

## 既存資産と新しく必要なもの

| 既存・再利用するもの | 新規に必要なもの |
| --- | --- |
| GraphAIによる会話、文章→MulmoScript、スキーマ検証 | Web画面から既存処理を呼ぶ薄い接続 |
| MulmoCastの画像・動画Agent、ファイルキャッシュ、FFmpeg結合 | 許可済み無料APIの設定と不足するアダプター |
| PR #4〜#6の無料I2Vルーター、同一生成の重複防止 | Webの生成開始・進捗・結果表示、必要に応じたジョブ永続化 |

本番の複数人共有Webサービスには、認証・サーバー側のAPIキー管理・永続ストレージ等が追加で必要。**試作段階で大規模なDB・ジョブ基盤を先に作らない。**

## 2026-11-16時点の検証状況

- **済:** 既存MulmoCastで2つのMP4を結合（[PR #1](https://github.com/ToramaruA/sns-video-factory/pull/1)）。
- **済（実験限定）:** 匿名ZeroGPU/Wan 2.2で2秒I2V生成・MulmoCastへ接続（[PR #4](https://github.com/ToramaruA/sns-video-factory/pull/4)）。**本番の継続無料・商用/宣伝利用の許可は未確認**で、既定無効。
- **済（基盤のみ）:** 無料ルーティング、ローカル台帳、MP4再利用、重複予約拒否（PR #4〜#6）。本番複数ホスト向けDBではない。
- **未:** 無料LLM/無料画像生成の実接続、制作全工程の連続生成、Webの利用画面、本番無料I2V経路。

PR #7/#8のカット承認・独自企画モデルは**実行経路に接続されていない試作コード**だったため、今回の整理PRで本流から削除する。必要になった場合はGit履歴の[PR #7](https://github.com/ToramaruA/sns-video-factory/pull/7)・[PR #8](https://github.com/ToramaruA/sns-video-factory/pull/8)から復元できる。

## どの文書を読むか

- **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** — **唯一の作業順序・合格基準**（計画の正本）
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 既存MulmoCastと新規接続の境界
- [DSL_AND_DATA.md](./DSL_AND_DATA.md) — 既存MulmoScriptをそのまま使う仕様
- [COST_SECURITY_AND_OPERATIONS.md](./COST_SECURITY_AND_OPERATIONS.md) — 課金・規約・セキュリティの条件
- [FREE_I2V_AGENT.md](./FREE_I2V_AGENT.md) / [LOCAL_FREE_VIDEO_EXECUTION.md](./LOCAL_FREE_VIDEO_EXECUTION.md) — 実装済み無料ルーターの技術説明
- [PHASE2_PROVIDER_RESEARCH_2026-11-15.md](./PHASE2_PROVIDER_RESEARCH_2026-11-15.md) — 画像→動画の実験先を調べた履歴
- [REUSE_AUDIT_2026-11-15.md](./REUSE_AUDIT_2026-11-15.md) — 設計を簡素化した理由・過去PRの扱い

## 開発の原則

- **新機能より既存機能の再利用を優先する。** GUIも[MulmoCastデスクトップアプリ](https://github.com/receptron/mulmocast-app)や[GUI Chat Plugin](https://github.com/receptron/GUIChatPluginMulmocast)の流用可否を先に調べる。ただしElectronアプリはそのままWebサービスではなく、実際の適合は未検証。
- **1機能・1PR。** テスト成功後にマージ。課金可能な外部APIをCIで勝手に使わない。
- 実験ができたことと本番運用できることを混同しない。
