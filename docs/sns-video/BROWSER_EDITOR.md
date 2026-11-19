# ブラウザからMulmoScriptを編集する（2026-11-19）

## 方針

- **UI内部の編集エンジンは公式 `@mulmocast/beat-editor@1.1.1`。** Vueの薄いホスト `sns-editor/` により、元MulmoScript全体を保持したまま `beats` を編集する。公式 `beatsOf` / `withBeats` を利用し、別スキーマや独自生成エンジンは作らない。
- SNS動画向けの `imagePrompt`・`moviePrompt` と `speaker` フィールドだけ、公式拡張ポイント `BeatEditorDefinition` で追加表示する。
- AIはブラウザから実行しない。無料APIキーをWebページへ埋め込まず、動画制作は既存の `sns-video-groq-flux-three-cut-manual.yml` と、既存MulmoCastの `movie` コマンドで実行する。
- **まだ完全な制作Webサービスではない。** ファイルの自動アップロード、実動画プレビュー、GitHub Actionsへの直接発火、モデル自由切替、共同編集・認証は未実装。ユーザーの合意なしにサービス用の秘密情報や新しいバックエンドを追加しない。

## 現在動く機能

1. 縦型3カットの実API確認済みMulmoScriptサンプルを画面に初期表示
2. 任意の既存MulmoScript JSONファイルをブラウザで開く、またはJSONを貼り付ける
3. 公式BeatListEditorでカットのナレーション（`text`）、順番、既存メディアタイプを編集
4. 追加した公式拡張エディターでカットの `imagePrompt`・`moviePrompt`・`speaker` を編集
5. MulmoScriptの元の設定・画像参照・音声指定・その他のフィールドを保持し、全文JSON直接編集も可能
6. 編集済みJSONをクリップボードにコピー、またはファイルダウンロード
7. 既存Actionsへ移動し、`script_json` にそのまま貼り付けるか、リポジトリのファイルを `script_path` で指定して実動画を生成

**注意:** 現在のWan第三者デモ試験枠は各2秒、最大3カット。ブラウザUIでこれを勝手に延長したり、静止画へ置き換えたりしない。人数が複数でも各API無料枠は共有ではない。SNS宣伝利用と公開運用の許可は別途確認する。

## 使い方

- 簡易版：`sns-editor/` の画面から台本を編集し、**「編集したJSONをコピー」**を押す
- [GitHub Actions（無料MulmoCast）](https://github.com/ToramaruA/sns-video-factory/actions/workflows/sns-video-groq-flux-three-cut-manual.yml) の `Run workflow` を開く
- ブランチは `restart/mulmocast-upstream-free-ai`。**`script_json` にペースト、`script_path` は空欄、`confirm_groq_free_plan` はOFF（Groqは呼ばない）**。動画にするなら `render_movie` はONとし、無料アカウント・Wan公開デモへの送信について本人が確認・同意した場合のみ該当4つのチェックをONにする
- 完成MP4はActions実行結果の `free-groq-full-mulmocast-video` artifactに保存

## ブラウザUIのビルド・公開

UIは**静的ファイルだけ**。AIキー不要。

```bash
cd sns-editor
npm install
npm run build
```

GitHub Actions [SNS MulmoCast browser editor](https://github.com/ToramaruA/sns-video-factory/actions/workflows/sns-editor-build.yml) がpush時にビルド確認し、成果物を `sns-beat-editor-static` として添付する。

**GitHub Pages公開の現在地：** ビルドは成功。ただし [実行44495219259](https://github.com/ToramaruA/sns-video-factory/actions/runs/44495219259) の `deploy-pages` は GitHub Pages がまだ有効になっていないため `actions/configure-pages@v5` で失敗。**利用者が1度だけ**リポジトリの **Settings → Pages → Build and deployment → Source を「GitHub Actions」に変更**する必要がある。設定後、失敗した `deploy-pages` ジョブを再実行すれば公開を試せる。GitHub側の環境保護で開発ブランチの公開が拒否された場合は、その設定を確認する（勝手にmainへマージしない）。成功したdeploymentが返す `page_url` を正とする。公開完了前にURLを稼働中とは案内しない。

## 留意事項

公式 [MulmoCast Beat Editor](https://github.com/receptron/mulmocast-beat-editor) は元々「台本のbeatsを編集するコンポーネント」であり、映画生成バックエンドや保存先は持たない。公式Electron [mulmocast-app](https://github.com/receptron/mulmocast-app) はブラウザアプリではない。したがって、**既存UIの薄いホストと既存Actionsへの導線**に止めた。無理なWebバックエンド自作を避ける。

「最大3人がログインなしで企画入力 → 編集 → 動画作成をワンストップ実行」は、無料の静的編集ページだけでは達成しない。APIキーの秘匿・利用制限・実行権限を満たすバックエンドと利用者アクセス方式が必要なので、提供方法の選定と運用承認を終えてから着手する。
