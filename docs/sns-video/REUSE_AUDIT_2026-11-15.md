# 再利用監査・整理した履歴

**初回監査:** 2026-11-15（[PR #9](https://github.com/ToramaruA/sns-video-factory/pull/9)）。**整理方針更新:** 2026-11-16。  
**現在の作業順序は**[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)**だけを正本とする**。この文書は、何を残し何を削ったかの記録。

## 再利用できる既存機能

| MulmoCast資産 | 対応する実装 | 判断 |
| --- | --- | --- |
| LLMとのチャット・企画生成 | `src/tools/create_mulmo_script_interactively.ts`、`src/types/provider2agent.ts` | そのまま活用。独自LLMやチャットエンジンは作らない |
| 文章→台本 | `src/tools/create_mulmo_script_from_url.ts`、`src/tools/story_to_script.ts` | 普通の文章のコピペに流用 |
| 台本とスキーマ | `src/types/schema.ts`、`src/methods/mulmo_script.ts`、`src/tools/complete_script.ts` | **MulmoScriptだけを正本**とする |
| 画像・動画・音声・字幕 | `src/actions/images.ts`、`src/actions/audio.ts`、`src/actions/captions.ts` | 既存GraphAI/Agentを使用 |
| 編集・書き出し | `src/actions/movie.ts` | 既存FFmpeg連結を使用 |
| キャッシュ | `src/actions/graph_option.ts` | 既存キャッシュを利用。外部I2Vの重複予約は別途必要 |

## 今回本流から除いたもの

- **PR #7** の`src/sns-video/workflow/shot_review.ts`と専用テスト: 画像・動画を**各カットで承認する**機能を実装していたが、MVPでは中間承認しないため使われない。コードを保持するコストを避け、本流から削除。
- **PR #8** の`src/sns-video/director/storyboard_planning.ts`と専用テスト: 独自のStoryboard/Revisionを作る試作だったが、元のMulmoScriptと脚本が二重化し、字幕・音声・演出などを落とす危険があった。本流から削除。
- 上記2機能の個別設計文書も削除し、計画の二重管理を解消。

**データは失われていない。** 両PRはGitHubの履歴に残っているため、将来本当にカット承認や履歴が必要になった時に該当部分を取り出せる。[PR #7](https://github.com/ToramaruA/sns-video-factory/pull/7) / [PR #8](https://github.com/ToramaruA/sns-video-factory/pull/8)

## 意図的に残したもの

- **PR #1**: 既存MulmoCastによる2本のMP4結合の実証。
- **PR #4**: 無料I2Vルーターと実験Wan2.2接続。Wan2.2は商用共同利用の条件が未確認で**既定無効**。
- **PR #5/#6**: 無料経路の選別、同一ジョブの排他予約、曖昧な失敗後の二重再送防止。**MulmoCastのファイルキャッシュとは異なる安全機能**なので、検証なしに削除しない。
- **PR #3**: 未マージの画像→動画実験PR。PR #4で実験経路の一部を取り込んだ。試行の記録として参照するが、本番機能と混同しない。

## 今後の開発で避けること

- 既存のGraphAIやMulmoCast編集処理を独自実装する。
- まだ存在しない無料生成元を前提に、大量の管理コードを先に作る。
- OpenAI/Replicate等の元の**有料既定API**へ暗黙にフォールバックさせる。実行前に全経路と実際の料金Tierをチェックする。
- GUIを作り直す前に、[mulmocast-app](https://github.com/receptron/mulmocast-app)（Electron/Vue）や[GUI Chat Plugin](https://github.com/receptron/GUIChatPluginMulmocast)、[Beat Editor](https://github.com/receptron/mulmocast-beat-editor)を未確認のまま無視する。ただし移植・依存関係・ライセンスは確認が必要。

**現在のMVP:** 企画入力・コピペ → 既存GraphAIでMulmoScript生成/修正 → ユーザーが生成開始 → 画像生成・I2V・既存編集・MP4を連続実行。Web化と無料モデル接続はまだ未完成。

[現行計画](./IMPLEMENTATION_PLAN.md) | [README](./README.md)
