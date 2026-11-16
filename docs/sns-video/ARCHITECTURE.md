# 最小構成アーキテクチャ（MVP）

**状態:** 設計。2026-11-16時点では、Web画面・LLM無料API接続・連続I2Vの本番動作は未実装。新しい開発の順序は[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)を参照。

## 目指す処理の流れ

```text
利用者の普通の文章・外部AIからの貼り付け
            │
            ▼
MulmoCast既存の GraphAI / LLM / tool scripting
            │
            ▼
MulmoScript v1.1  ← 修正も既存LLM＋Schemaを利用
            │
         「生成開始」
            │
            ▼
無料Tier・利用条件の事前検査（追加が必要）
            │
            ▼
既存 MulmoCast
  audio → images（画像生成 → 画像→動画生成）
        → captions → avatar → movie（FFmpeg）
            │
            ▼
      完成した縦型 MP4
```

**中間の人手承認は挟まない。** 既存のMulmoCastが`moviePrompt`で画像→動画を生成できるため、生成エンジンや動画結合を再実装しない。

## 既存のコードを再利用する

| 目的 | 実装済み |
| --- | --- |
| LLMとの会話 | `src/tools/create_mulmo_script_interactively.ts`、`src/utils/utils.ts`、`src/types/provider2agent.ts` |
| 貼り付けた文章→MulmoScript | `src/tools/create_mulmo_script_from_url.ts`（ファイル入力の既存処理を再利用） |
| ストーリー→脚本 | `src/tools/story_to_script.ts` |
| MulmoScriptの正規化と検証 | `src/types/schema.ts`、`src/methods/mulmo_script.ts`、`src/tools/complete_script.ts` |
| 画像→動画、字幕・音声・BGM、最終編集 | `src/actions/images.ts`、`src/actions/audio.ts`、`src/actions/captions.ts`、`src/actions/movie.ts` |
| 既存のファイルキャッシュ | `src/actions/graph_option.ts` の `fileCacheAgentFilter` |
| 無料I2Vのモデル選択・台帳・重複送信防止 | `src/sns-video/providers/`、`src/agents/movie_free_router_agent.ts`（PR #4〜#6で一部実装） |

現時点の無料I2V接続先は実験用Wan2.2のみ。**本番用の許可済み無料供給元はない**。GraphAI自体の利用は無料でも、呼び出すLLMや画像生成APIには課金可能性がある。

## MVPに追加する薄い接続

1. **スクリプト生成の外側の入口:** 既存のCLI向け会話をWebから呼びやすくする。ユーザーはJSONを直接編集する必要がない。
2. **生成前の安全チェック:** 動画・画像・LLM・音声等のすべてのAPI経路について、許可済み無料モデルか確認してから起動。利用条件・無料枠が不明なら停止。元MulmoCastのOpenAI/Replicate等の既定値に依存しない。
3. **Web UI:** 企画テキスト・会話・生成開始・進捗・完成MP4の表示。デスクトップ版`mulmocast-app`やWeb向けGUIプラグインは再利用を**検証**してから選ぶ。
4. **公開/共有運用になった場合の最低限の追加:** 認証、APIキーのサーバー管理、素材の権限・保存先、ジョブの重複防止と永続化。単一ホスト試作に最初からマルチクラウド基盤を作らない。

## 実装済み無料ルーターとキャッシュの境界

MulmoCastの`fileCacheAgentFilter`は、すでに得られた画像/動画を再利用する役割。PR #5/#6のローカル台帳は、**無料APIへ送信する前に同一ジョブを排他予約し、曖昧なタイムアウト時の二重推論を防ぐ**役割を持つ。

両者の責務は異なるため、確認前に台帳を削除すると無駄な再送・無料枠消費の危険がある。本番移行時にはファイル保存を一本化できるか検証し、単一ホストのロック台帳をそのままマルチホストに持ち込まない。

## 初期版では作らない

- 別のStoryboard構造とMulmoScriptの二重管理
- カット単位の画像・動画承認/差し戻しワークフロー（旧PR #7）
- 独自AIフレームワーク、独自FFmpegエンジン
- 動画・画像の生成先を裏で有料に自動切替する処理
- 事前に巨大なDBや、実用モデルの未検証のままの複雑な自動切替

[実装計画](./IMPLEMENTATION_PLAN.md) | [MulmoScript](./DSL_AND_DATA.md) | [料金安全](./COST_SECURITY_AND_OPERATIONS.md)
