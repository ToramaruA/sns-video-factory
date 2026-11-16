# Phase 2: 無料動画生成のローカルジョブ実行・キャッシュ

状態：Phase 2の開発用シングルホスト実装。**共同利用の本番ワーカー・本番DBではない。**

## 今回の変更

既存のfree_i2v経路に、PR #5のジョブ台帳を実際に組み込んだ。

    MulmoScript (free_i2v または wan22_zerogpu_experimental)
      └ movieFreeRouterAgent
          ├ 無料モデル・機能の検査（有料を拒否）
          ├ ローカル台帳に「画像のSHA256＋動きの指示＋モデル条件」でジョブ登録
          ├ ジョブを排他的に予約（他の生成中ジョブがあれば停止）
          ├ 初回だけ Wan 2.2 Agent を呼び出す【明示的な実験フラグ必須】
          ├ 完成MP4を保存→SHA256を台帳に記録
          └ 同じ内容の再リクエストでは保存MP4を検証して再利用

## 安全性

- SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT=1 を明示しない場合、外部生成は停止する。
- SNS_VIDEO_FREE_VIDEO_LEDGER_PATH を**絶対パス**で指定しなければ、生成は停止する。自動でランダムな一時ディレクトリへ台帳を置かない。
- free_i2vだけでなく、**明示的なWan provider名**からも共通ルーターを通るように変更。
- 台帳でジョブをrunningに予約してから外部生成を開始する。同一ジョブが処理中なら二重送信しない。
- 結果が分からない失敗ではneeds_reviewで停止する。失敗したジョブを勝手にもう一度生成しない。
- 一度成功したMP4は台帳と同じ場所の free-video-assets/<jobId>.mp4 に保存。再読込時はMP4ヘッダーと記録されたSHA256を確認。ファイルが見つからない・改変された場合は**自動再生成しない**。
- 1台の台帳では動画生成を全体で同時1件に制限。生成途中のクラッシュでrunningが残った場合は、手動で整合性を確認するまで安全側に停止する。
- Wan/ZeroGPUの第三者Spaceの利用条件・継続無料性・本番共同利用は未承認。

## 手動の技術実験

    # 利用条件・匿名ZeroGPU枠を確認した運営者だけが使う
    export SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT=1
    export SNS_VIDEO_FREE_VIDEO_LEDGER_PATH=/absolute/persistent/path/sns-video-ledger.json
    node lib/cli/bin.js movie experiments/03-free-i2v-agent/mulmo_script.json

台帳ファイルの親ディレクトリは、MP4と履歴を保持できるストレージである必要がある。消すと過去の重複防止・キャッシュ効果が失われる。GitHub Actionsの一時ディレクトリは異なるrunを跨ぐ永続ストレージではない。

このPRでは、**外部GPUを使うライブ推論は再実施しない**。生成処理の代わりに模擬MP4を返すオフラインテストを使う。

## 実装上の境界と今後の課題

1. ローカルJSON台帳はWeb公開の複数ホスト向けではない。本番ではDBの一意制約・トランザクション予約と永続オブジェクトストレージに置き換える。
2. 画像の版は現時点で画像ファイル内容のSHA256で区別し、形式上 sourceAssetRevision=1 を採用。将来Web化した際には、プロジェクト/カットIDと画像アセットの版を扱う（途中の人間承認は必須にしない）。
3. 画像の途中書換え対策・生成結果の厳密な検証（FFprobe、動き検査、音声等）は本番素材ストレージを選んでから強化する。
4. APIのエラーが「確実に生成未開始」と判断できない場合はneeds_review。**自動再開・自動切替は未実装**。
5. 無料動画生成先・無料画像生成・企画用無料LLMの選定は未完了。現行の優先順位は[実装計画](./IMPLEMENTATION_PLAN.md)を参照する。
6. 生成MP4の著作権・モデルと外部Spaceの宣伝用途条件は別途確認が必要。

## 確認方法

- test/sns_video/test_local_free_video_executor.ts：AIを呼ばないローカル実行・キャッシュ・重複防止のテスト
- test/sns_video/test_free_video_job_coordinator.ts：選択・状態遷移・共有ZeroGPU枠のテスト
- GitHub Actions：フォークの主要Linux CIでビルド、Lint、オフラインテスト。**ライブAPIは自動実行しない**

[正式な実装計画](./IMPLEMENTATION_PLAN.md) | [共通Agent設計](./FREE_I2V_AGENT.md)
