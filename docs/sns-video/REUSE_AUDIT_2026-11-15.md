# 既存MulmoCast再利用監査・簡素化方針（2026-11-15）

**目的:** 既存機能を再開発しない。AIや動画処理の本体はMulmoCast＋GraphAIに任せ、SNS Video Factory独自の追加は承認・無料枠・共同利用など不足部分に限定する。

**確認範囲:** フォークのPR #1〜#8（PR #3は未マージの実験）、mainのCI、親repo `receptron/mulmocast-cli`との差分、`src/tools/`・`src/actions/`・`src/agents/`・`src/methods/`・`src/types/`、独自の`src/sns-video/`を確認。コードの実行を伴う新たな生成サービス実証ではない。

## 1. 結論：コピーで増やさず、フォークにある処理を直接使う

元のMulmoCastはすでにGraphAIとLLM接続、画像・動画生成Agent、MulmoScript検証、キャッシュ、音声・字幕、FFmpeg結合を備えている。「GraphAIをコピーして入れる」は不要。このフォークに入っている既存コードを再利用する。

| 既存資産 | 既存コード | 今後の扱い |
| --- | --- | --- |
| LLM会話とモデル選択 | `src/tools/create_mulmo_script_interactively.ts`、`src/utils/utils.ts:llmPair`、`src/types/provider2agent.ts:provider2LLMAgent` | **再利用**。Web UI用にCLIの`textInputAgent`／`fileWriteAgent`部分からGraphAI本体を分離・関数化する。LLM呼び出しを自作しない |
| 既存文章の取り込み | `src/tools/create_mulmo_script_from_url.ts:createMulmoScriptFromFile`、`graphDataText` | **再利用**。Webの文章ペーストを渡せる薄い入口を用意。専用の外部AIインポート形式は作らない |
| ストーリー→カット構成 | `src/tools/story_to_script.ts` | **再利用**。二重の構成生成処理を作らない |
| MulmoScript検証・テンプレート | `src/types/schema.ts`、`src/methods/mulmo_script.ts`、`src/tools/complete_script.ts` | **再利用**。独自の脚本DSL・独自スキーマは極力増やさない |
| 画像・動画の生成とキャッシュ | `src/actions/images.ts`、`src/actions/graph_option.ts:fileCacheAgentFilter`、`src/agents/` | **再利用**。別の画像生成/動画生成パイプラインを作らず、必要な無料APIアダプターだけ登録 |
| 出力編集、字幕・音声 | `src/actions/movie.ts`、`audio.ts`、`captions.ts`、`avatar.ts` | **再利用**。生成済み素材を既存のFFmpeg合成へ渡す |
| カット単位承認（不足分） | `src/sns-video/workflow/shot_review.ts`（PR #7） | **維持**。アセットID＋revision、古い生成物の拒否、最小差し戻しは既存MulmoCast外の機能 |
| 無料経路・ジョブ予約（不足分） | `src/sns-video/providers/*`（PR #4〜#6） | **維持しつつ統合**。料金安全ガードとジョブの冪等性はキャッシュと別の役割だが、動画ファイル保存を二重管理しない |

## 2. 既存実装のレビュー結果

- **PR #1 / Phase 0:** MulmoCast本体でMP4を2本結合するテスト。妥当で維持。独自の結合エンジン不要。
- **PR #2:** 設計文書。実装済みと構想の区別を継続して更新。
- **PR #3:** 外部ZeroGPU画像→動画の実験PRは未マージ。**本番運用へ流用しない**。
- **PR #4:** 無料の画像→動画アダプターをMulmoCastの既存`movieGenerator`へ接続。方向性は妥当。ただし現在実装された実行先は実験用Wan 2.2のみで、通常は無効。
- **PR #5 / #6:** 無料接続先の能力・無料判定・排他予約・同一依頼の再送防止と単一ホストのMP4保存。無料枠と外部AIへの二重依頼防止は必要。**ただしMulmoCast既存の`fileCacheAgentFilter`もある**ため、ファイルキャッシュの責務と運用時の整合性を整理する。単一ホスト台帳を本番DBと誤認しない。
- **PR #7:** カット単位の画像/動画承認・差し戻し。元のMulmoCastに不足するため、現在の純粋状態モデルは維持。
- **PR #8:** 企画会話・revision・承認は必要。ただし**独自の`Storyboard`とMulmoScriptが脚本内容を二重管理し得る**。現状の`buildApprovedStoryboardDraft`は画像・動きのプロンプト中心で、元MulmoScriptの多彩な字幕・音声・演出項目を失う可能性がある。今後の実装では **MulmoScriptを企画の正本**にして、チャット履歴・revision・承認と参照素材の権限だけを外側に記録する。PR #8を即削除せず、実データ変換テストを作ってから段階的に置き換える。

**重要な既存の動作:** `src/cli/commands/movie/handler.ts`は`audio → images → captions → avatar → movie`を順次実行する。また`src/actions/images.ts`の`movieGenerator`は`beat.moviePrompt`があれば動画AIを呼ぶ。**承認が終わっていない脚本をそのまま`mulmo movie`に渡してはいけない**。画像承認まで動画生成を起動しないよう、既存の処理と互換性のある「画像用」「動画用」「最終編集用」の実行スクリプトを用意して制御する。既存の生成ロジックそのものは作り直さない。

**親リポジトリとの差:** 2026-11-15の比較でフォークmainは上流から2コミット分岐（上流変更2件未取り込み）。以後、実装前に差分と新しい既存機能を再確認する。無条件マージせず、既存の無料ルーターやテストへの影響を確認する。

## 3. 無料APIを許可する仕様（ユーザー確認済み）

**無料APIは使用してよい。** 無料にするために既存GraphAIを避けたり、ローカルLLMや独自AIエンジンを新造したりしない。

- **標準の内蔵AI:** MulmoCastがすでに持つ`geminiAgent`や`groqAgent`を第一候補にし、**実際の無料Tierで許可されたモデル・利用方法**だけを運営者のサーバー側で有効化。モデル名とAPI経路の両方を確認する。品質・上限・エラーを実測してから採用。
- **外部AI利用:** ChatGPT等で相談した**普通の文章をチャット欄へ貼り付けるだけ**。既存`graphDataText`系のLLM変換を共通化し、コピー用JSONやインポート専用形式は要求しない。
- **課金安全:** 既定の`llmPair()`はOpenAIにフォールバックする。画像・動画の元MulmoCastも有料経路が既定になり得る。**既定値に依存せず、モデル・Agent・実行アカウントが許可済み無料Tierのときだけ実行**。無料枠の終了時は停止・待機し、有料Tierへ切り替えない。
- **利用者の個別APIキーは必須にしない。** 運営者がサーバー側の無料API認証情報を管理し、Web利用者へキーを渡さない。
- **利用規約と個人情報:** Gemini無料枠では入力・出力がサービス改善に使用され得る。個人素材・未公開資料・広告目的の内容を送る前に提供元の規約を確認し、必要な同意・説明を行う。モデル別の無料枠・地域・商用/広告での利用条件は個別に実証。
- **参考となる公式情報:** [Gemini API料金と無料Tier](https://ai.google.dev/gemini-api/docs/pricing)、[Gemini APIの課金とTier](https://ai.google.dev/gemini-api/docs/billing)、[Groq無料Tierと課金](https://console.groq.com/docs/billing-faqs)、[Groqのレート制限](https://console.groq.com/docs/rate-limits)。

**無料であることと、品質が十分であることは別の判定。** サンプル企画の修正精度を評価し、品質が不足する場合は別の無料APIを試す。未検証の無料枠を「無制限」と説明しない。

## 4. 更新した実装順序

1. **既存コードの活用確認（今回）:** PR #1〜#8を監査し、LLM・生成・キャッシュ・編集の既存接続点を明示。無断の有料呼び出しと重複実装のリスクを一覧化。
2. **既存GraphAIのWeb向けの薄いアダプター:** CLIの入出力から既存のGraphAIフローを切り離し、**1つの企画を自然言語で編集する**形でWeb APIへ呼び出せるようにする。無料Tierの明示的な許可リスト、失敗時停止、無課金の負のテストを必須とする。外部AIの文章ペーストは同じチャット入口で受ける。
3. **二重企画データの解消:** MulmoScriptを脚本の正本に統一し、PR #8の履歴・承認メタデータのみ生かす。元MulmoCastの全項目（字幕・音声・画像参照など）を保持する回帰テストを追加。
4. **承認ステージの接続:** 既存の画像/動画処理を**画像生成→画像承認→動画生成→動画承認→既存の最終編集**に区切る。承認されていない`moviePrompt`を実行経路へ渡さない。最終編集時にAIを再呼び出ししない。
5. **無料画像APIと動画API:** 新しいフレームワークや大規模ルーターを作らず、既存のAgent/GraphAI登録に必要なアダプターのみ追加。技術動作、無料枠の継続性、権利、9:16等をそれぞれ実証。
6. **共有Web本番化:** 上記が動作してから、認証、DBへの承認・ジョブ保存、共有クォータ・ジョブキュー、ストレージを最小構成で選定・実装。

### 各変更の必須チェック

- 追加機能が既存MulmoCastの`src/tools/`・`src/actions/`・`src/methods/`・`src/agents/`にないか確認した記録
- 新たに作る処理が必要な理由（既存機能でできないこと）
- 元のMulmoScriptとの互換性、既存の画像/動画キャッシュとの整合性
- 無料APIが有効でも、有料API・未知の請求Tierが絶対に呼ばれない単体テスト
- PRで全CI成功後にのみマージし、実際に生成した成果物と単なる状態テストを区別する

**この文書は監査と方針の記録であり、上記のリファクタリングや無料LLMの実接続が完了したことを意味しない。**

[実装計画](./IMPLEMENTATION_PLAN.md) | [現在のコード](../../src/sns-video/director/storyboard_planning.ts)
