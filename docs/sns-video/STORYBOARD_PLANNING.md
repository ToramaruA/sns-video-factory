# Phase 3：AIと会話しながら一つの動画企画を仕上げる

状態：**PR #8でモデル非依存の会話・企画revision管理を実装済み**。WebチャットUI・LLM実行アダプター・DB・実際の画像/動画生成は未接続。**再利用監査で独自StoryboardとMulmoScriptの脚本内容が二重管理になり得る問題を確認。今後はMulmoScriptを脚本の正本とし、会話・承認情報のみ周辺で管理する方針に変更する**（[監査](./REUSE_AUDIT_2026-11-15.md)）。

## ユーザー体験（2026-11-15決定）

1. 利用者が作りたいSNS動画を自然な言葉で説明。
2. AIディレクターが最初の**一つの**企画・カット割り・演出案を提案。
3. 利用者が「2カット目を短くして」「冒頭をもっと印象的に」などチャットで修正を依頼。
4. AIは従前の企画と会話を参照して同じ企画を修正。必要なら質問・説明だけ返し、企画は変更しないことも可能。
5. 納得したら利用者が「生成開始」し、MulmoCast既存フローで画像生成→動画生成→編集→MP4出力を連続実行する。**画像・動画のカット単位承認は初期版では省略する**。

**複数案の比較・選択は必須ではない。** 固定の修正回数上限を設けない。AIを呼ぶ回数は、ユーザーが会話した回数に応じる。

## 既存MulmoCastの再利用

- `src/tools/create_mulmo_script_interactively.ts`：既存の対話型GraphAI/LLM生成処理。新しいLLMエンジンを自作しない。
- `src/tools/story_to_script.ts`：既存のストーリーからMulmoScriptへ変換する処理。
- `src/types/schema.ts` の `mulmoScriptSchema`：実際に出力する下書きの検証。
- PR #7の `src/sns-video/workflow/shot_review.ts`：将来、必要になった場合に接続するカットごとの画像/動画承認状態。初期版では使わない。

これらの**既存処理をWeb向けに再利用するアダプターは今後実装**する。既存のCLI対話をWeb APIと同一視せず、接続時にUIの会話履歴とLLM実行境界を検証する。

## 今回の実装（`src/sns-video/director/storyboard_planning.ts`）

- `VideoBrief`：目的、ターゲット、SNS、希望秒数、参考写真・ロゴ・動画のasset IDと用途
- `Storyboard`：最新版の企画、演出、カット割り、各カットの静止画プロンプト・動画動作指示
- `createStoryboardPlanningState`：LLMが作った最初の企画（revision 1）を検証して登録
- `submitStoryboardFeedback`：通常の文章による修正指示を受け、LLM応答待ちにする
- `getStoryboardChatContext`：現在の企画・過去の対話・今回の修正依頼を、後の既存LLMアダプターに渡すための情報として返す
- `applyStoryboardAssistantReply`：LLMの説明/質問のみ、または新しい企画revisionを反映し、会話と旧revisionを保持
- `approveCurrentStoryboard`：人間の承認を現在のrevisionへ固定。新たに修正を依頼したら承認は失効
- `buildApprovedStoryboardDraft`：承認後の企画から既存MulmoScript v1.1に沿った設計下書きを作る。720×1280、TTS抑止、各カットの画像/動画指示。実行は禁止（`executionAllowed: false`）
- `initializeApprovedShotReviews`：PR #7のカット承認状態を初期化（既存コードとして保持し、初期の連続生成経路には接続しない）

競合時の古い返信・古いrevision、未知の参考素材、重複beat IDは拒否する。会話による編集で尺が変わる可能性があるため、希望尺は**目安**とし、実際のカット合計尺を下書きに記録する。

## 境界と未完了事項

- **会話エンジンは未接続**。このコードはAIを呼び出さず、既存MulmoCastが生成した企画と返答を受け取る契約を用意したもの。初期版は独自Storyboardを正本にせず、元のMulmoScriptを中心にする
- 対話の意味理解や変更はLLMが担当し、固定キーワードを解析する修正ロジックは作らない
- 企画のログと資産は将来DB/ストレージに保存。現段階の `reviewerId` は本人認証ではない
- 確認済み素材の保持や参考画像の実際の取り込み、生成ジョブ投入、Web UIは別工程
- モデルの無料利用と商用利用は未確認。MulmoScriptにスキーマ適合しただけではAIの呼び出しを許可しない
- 参考動画の「情報としての参照」と、動画AIがその動きを実際に転写できることは別

[実装計画](./IMPLEMENTATION_PLAN.md) | [カット承認状態](./SHOT_REVIEW_WORKFLOW.md) | [MulmoScript設計](./DSL_AND_DATA.md)
