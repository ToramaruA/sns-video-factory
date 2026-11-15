# SNS Video Factory — 設計の入口

**作成日:** 2026-11-15  
**文書の状態:** 初期アーキテクチャ案（実装と検証の進展に応じて更新する）  
**基盤:** [MulmoCast](../../README.md) のフォーク。元プロジェクトのライセンスは [AGPL-3.0-only](../../LICENSE)。

> **重要:** この文書に書かれた完成形がすでに実装されたわけではない。「確定した要求」「暫定設計」「未検証」を区別する。Wan 2.2の匿名API→MulmoCast MP4書き出しは技術実証済みだが、継続無料の本番サービスとしての利用規約・容量・共有運用は未承認。

## 何を作るのか

団体・チームがSNS用の短い動画を**可能な限り継続無料で**作れるWebツール。

1. 利用者がテーマ、用途、SNS、長さ、参考写真・動画・ロゴ等を指定する。
2. AIディレクターが構成・カット割り・演出方針を提案する。
3. 利用者が通常のチャットで企画を修正し、「生成開始」を指示する。
4. **MulmoCastの既存連続処理を使って**各カットの静止画生成→画像から動画生成→字幕・音声/BGM・編集→MP4書き出しまで一括で実行する。
5. 利用者が完成動画を確認して受け取る。**カット単位の画像/動画承認と部分的な再生成は初期版では実装しない**（必要に応じて後からPR #7の仕組みを接続）。

**静止画のズームだけで動画化を代用しない。** 画像→動画AIによる生成が、このツールの中核的要件。

## 利用者と料金に関する基本方針

- **利用人数を固定で3人に制限しない。** 当初は小規模な団体を想定するが、人数上限はプロダクト要件ではない。
- 利用者全員がAI提供元の個別アカウントを作る必要はない。運営者が接続情報を管理する。
- 継続的な無料利用を第一目標とする。期間限定の無料体験だけで「無料運用可能」とは判定しない。
- 生成枠が足りない場合はキューで待機させ、分かる範囲で理由・再試行可能条件を表示する。**回復時刻が不明な場合は推測時刻を表示しない。**
- 意図しない有料API呼び出し、無限再試行、無制限並列生成を許さない。
- 公開URLから誰でも生成できる形にはしない。ログイン方法は後で選ぶがアクセス制御は必須。

## ドキュメント

| ファイル | 内容 |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | コンポーネント、処理フロー、データ、障害対応、既存MulmoCastとの境界 |
| [DSL_AND_DATA.md](./DSL_AND_DATA.md) | MulmoScriptの使い方・独自の制作管理データ・カットの再生成 |
| [COST_SECURITY_AND_OPERATIONS.md](./COST_SECURITY_AND_OPERATIONS.md) | 無料運用、モデル選定、安全性、著作権、アクセス制御、運用 |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | 段階ごとの実装・検証基準、作業優先順位、未決事項 |
| [REUSE_AUDIT_2026-11-15.md](./REUSE_AUDIT_2026-11-15.md) | PR #1〜#8再点検、MulmoCast既存機能の再利用と設計簡素化、無料API方針 |
| [FREE_I2V_AGENT.md](./FREE_I2V_AGENT.md) | 複数AIに拡張できる無料画像→動画の共通Agent・接続先・安全条件 |
| [LOCAL_FREE_VIDEO_EXECUTION.md](./LOCAL_FREE_VIDEO_EXECUTION.md) | Phase 2の生成ジョブ排他予約・MP4キャッシュ接続と安全条件 |
| [SHOT_REVIEW_WORKFLOW.md](./SHOT_REVIEW_WORKFLOW.md) | 将来オプションとして実装済みのカット単位承認・差し戻し状態（初期版では未接続） |
| [STORYBOARD_PLANNING.md](./STORYBOARD_PLANNING.md) | Phase 3の一つの企画を対話で修正・承認する状態管理とMulmoScript下書き |

## 状況（2026-11-15時点）

| 項目 | 状態 |
|---|---|
| 既存MulmoCastの構造・DSL調査 | **ソース確認済み** |
| フォーク | **完了**（このリポジトリ） |
| ローカルMP4を2本結合するMulmoCastのテスト | **PR [#1](https://github.com/ToramaruA/sns-video-factory/pull/1) をマージ済み**。専用GitHub Actionsおよび元のNode.js CIが成功 |
| 継続無料の画像→動画モデルの外部接続 | **技術実証済み**：[直接Agentからの生成テスト](https://github.com/ToramaruA/sns-video-factory/actions/runs/43675580505)は成功。ただし本番利用条件は保留 |
| 無料動画生成の共通Agent | **[PR #4](https://github.com/ToramaruA/sns-video-factory/pull/4)をmainにマージ済み**。Wan2.2実験経路のみ・既定無効 |
| Phase 2の無料枠・二重送信防止 | **[PR #5](https://github.com/ToramaruA/sns-video-factory/pull/5)をmainへマージ済み**。ジョブ状態とローカル台帳は実装済み |
| Phase 2の台帳→動画生成接続とキャッシュ | **[PR #6](https://github.com/ToramaruA/sns-video-factory/pull/6)をmainにマージ済み**。開発用の単一ホスト経路。共有Web・本番DB/キューとは未接続 |
| カット単位の承認・差し戻し（将来オプション） | **PR #7をmainにマージ済み**。状態遷移の基盤は残すが、初期版の連続実行には接続しない |
| Phase 3の対話型企画・カット割り | **PR #8をmainにマージ済み**。会話履歴・承認とMulmoScript下書きの基盤。既存MulmoCastのGraphAI対話接続は未実装。独自Storyboardとの二重管理を今後簡素化する |
| Web UI、共有ログイン、データベース、永続ストレージ | **未実装** |
| GitHub Actionsが本番映像処理に最適か | **未決定** |

## 設計上の優先順位

1. **既存MulmoCastとGraphAIを最大限再利用する。** 会話LLM、文章→MulmoScript、生成、キャッシュ、字幕、FFmpeg結合を再実装しない。無料API（課金を起こさない無料Tier）は使用可。
2. 動画の設計図（MulmoScript）と、制作の途中経過（独自状態）を分ける。
3. **無料APIによる既存LLMの活用と、画像→動画AIの実証**を両方進める。初期版は企画確定後に既存MulmoCastの画像→動画→MP4連続実行を使い、カットごとの中間承認は求めない。
4. 各生成AIは交換可能にし、提供元の利用条件・機能差・無料枠を明示する。
5. 生成済み素材はできるだけ既存MulmoCastのキャッシュを活用して保持する。カット単位の差し戻しや部分再生成は将来必要になったときに導入する。
6. 「無料」は無制限を意味しない。負荷・容量・時間・権利面の制約を可視化する。

## 既存ソースと混同しないために

- `src/actions/images.ts` — カット内の画像／動画生成フロー（GraphAI）
- `src/actions/image_agents.ts` — 画像・動画生成前処理、フレーム参照
- `src/agents/` — モデル・プロバイダーごとの生成実装
- `src/types/provider2agent.ts` — 生成先の登録
- `src/types/schema.ts` — MulmoScriptの検証スキーマ
- `src/methods/mulmo_script.ts` — MulmoScriptの検証
- `src/actions/movie.ts` — FFmpegを使った結合・書き出し
- `docs/image.md` / `docs/movie_reference_images.md` / `docs/api.md` — MulmoCast側の既存仕様

詳細は [ARCHITECTURE.md](./ARCHITECTURE.md) と [DSL_AND_DATA.md](./DSL_AND_DATA.md)。

## 変更管理

- 大きな設計変更はこのフォルダーの文書を更新してPRに残す。
- 実装のPRは関係する設計文書の更新要否を確認する。
- 「未検証」を「実装済み」に変更する際は、テスト手順・結果へのリンクを添える。
- この文書は進行の基準であり、検証結果が異なれば設計を見直す。
