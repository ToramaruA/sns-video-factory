# Phase 3：企画案・カット割り・MulmoScript下書き

状態：**AIモデル非依存のデータ管理実装**。AIディレクターの生成モデル、実画像生成、共同利用Web UIは未接続。

## 実装範囲

`src/sns-video/director/storyboard_planning.ts` に以下を実装。

- `VideoBrief`: 目的、対象視聴者、SNS、言語、希望尺、参考写真・ロゴ・動画（asset IDと意図）
- `StoryboardProposal`: 企画案ID、revision、タイトル、演出コンセプト、統一ビジュアルスタイル、個別カット
- `StoryboardShot`: 永続beat ID、秒数、画面内容、静止画の指示、動きの指示、参考素材のID
- `createStoryboardPlanningState`: **1案から開始可能**。必要なときだけ複数案を登録。一意なID・有効な参照・全カットの合計尺を検査
- `selectStoryboardProposal`: 対象案の正確なrevisionに対する明示的な承認
- `reviseStoryboardProposal`: 1案の版を進める。選択済みの案を修正すると**その承認を失効**させ、別案は保持
- `buildApprovedStoryboardDraft`: 承認済み案からMulmoScript v1.1形式（720×1280、画像と動きのプロンプト付き）を組み立て、MulmoCast本来のZodスキーマで検証
- `initializeSelectedShotReviews`: PR #7の`createShotReviewStates`へbeat IDを橋渡し

## 実行安全性

重要：`buildApprovedStoryboardDraft`は**設計の下書き**であって実行可能な生成ジョブではない。戻り値に`executionAllowed: false`を付ける。

MulmoCastのスキーマには既定の画像・動画プロバイダーが存在する。**スキーマに通るだけでは無料実行を保証できない。** 下書きをそのまま`mulmo movie`へ渡してはいけない。後のオーケストレーター実装で、接続先が無料・許可済みであることとカット単位の承認を検査してから実行する。

参考写真・ロゴ・参考動画のIDは、勝手にファイルパスやURLへ変換せず`referencesByBeat`に保持する。参考動画のモーション転写は、その機能を持つモデルと接続するまでは**未対応**。企画が参考動画を記録できることと、AIが動画の動きを再現できることは別。

## 未実装の範囲

- AIディレクターによる企画案の自動発案・推敲・質の評価（MulmoCast既存の `src/tools/story_to_script.ts`・`create_mulmo_script_interactively.ts` を優先して再利用し、生成処理をゼロから作り直さない）
- Web画面・ログイン・利用権限・共同編集・DBへの状態保存・監査履歴
- 承認済み画像の保存先と、参考素材への実際の安全なアクセス
- モデル能力/無料枠に合わせた尺の調整、画像生成・動画生成ジョブと接続
- 修正後のカット映像の再検査と完成動画生成

`reviewerId`は今は単なるIDであり、本人認証ではない。状態は純粋な関数で変更する想定だが、複数利用者による競合更新・永続化はまだ扱っていない。

## オフラインテスト

`test/sns_video/test_storyboard_planning.ts` で、企画案の一意性・合計尺・参照素材の整合性・承認・版更新・古い承認の拒否・スキーマ検証・カットレビュー初期化を検査する。外部API呼び出しは一切不要。

次の工程は、この企画データを実際のAIディレクターに渡す入出力契約、生成結果の検査、および安全なレビュー・再生成の接続。モデル候補の選定は別工程で実証する。

[正式実装計画](./IMPLEMENTATION_PLAN.md) | [承認状態](./SHOT_REVIEW_WORKFLOW.md) | [MulmoScriptと制作状態](./DSL_AND_DATA.md)
