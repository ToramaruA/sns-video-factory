# 無料でMulmoCastを使う — 最小操作

## 目的

このフォークは**MulmoCastを置き換えません**。MulmoCastの標準的な企画、画像、音声、動画、レンダラーを利用します。無料で使いたい人向けに、既存のGroq Free Plan＋Cloudflare Workers Free Planの接続と安全チェックだけを追加しています。通常のMulmoCastが対応済みの有料モデルを、自分のAPIキーで使うときはMulmoCast標準の設定を利用してください。新しいモデル選択システムはありません。

## いま使える最短の方法

1. GitHubリポジトリの **Actions** を開く
2. **Free MulmoCast - 文章から縦型動画（無料枠・音声任意）** を選ぶ
3. **Run workflow** で作りたい動画の説明文を日本語で入力する。日本語ナレーションも付けたい場合のみ **enable_free_japanese_voice** と **confirm_nemo_credit** を両方オンにする
4. **Groq組織がFree Plan**、**Cloudflare WorkersアカウントがFree** であることを自分のアカウントで確認し、確認欄を両方有効にして実行する
5. 成功したRunの **Artifacts** にある `free-mulmocast-portrait-still-video` を開き、MP4と元のMulmoScriptを取得する

**ブラウザ経由の実API検証:** 同じ画面の **verify_browser_api** をONにすると、GitHubの一時実行環境で認証付きブラウザHTTP入口を起動し、Groq→Cloudflare→MulmoCast→ブラウザ経由MP4ダウンロードまでの実動作を**1回の動画生成で**検証します。通常の直接実行とは分岐するので画像生成が二重に走ることはありません。Groq/Cloudflare双方のFree Plan確認は引き続き必須です。**これは自分の端末・別の人のブラウザからアクセスできるWeb公開の検証ではありません。** 外部APIを使う実行は必要な場合だけ明示的に行ってください。

このGitHub連携からは、現在のGroq/Cloudflareの契約TierやSecretsの中身を直接確認できません。2026-11-17には同じリポジトリの手動実API実行が成功していますが、**現在も無料プランかはアカウント所有者が確認**してください。

事前にリポジトリの **Actions Secrets** に `GROQ_API_KEY`、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN` を登録する必要があります。**権限のない人と共有しないでください**。GitHub Actionsの入力文は秘密情報用ではなく、認証情報を入力しないでください。

この実行には **Groqの文章→MulmoScript（カット数・尺をAIが決める）** → **Cloudflare FLUXで各カットの静止画像生成** → **MulmoCast標準の縦型720x1280 MP4結合** が含まれます。AIが1〜12カット、各1〜15秒、合計60秒以内で決めます（無料枠への大量アクセスを防ぐ上限）。MulmoScript自体はカット数固定ではありません。既存の`aspectFill`で縦型画面を埋めますが、正方形画像の左右は切り落とされるため実際の構図確認は必要です。

## 明確な限界

- **これは静止画を連結した動画です。AIによって人物や風景が動くI2Vの全自動無料版ではありません**。試験的なWan 2.2による1カット生成には成功していますが、匿名デモの長期無料・複数人利用・SNS宣伝用途は承認されていません。安全なフリーモードへ勝手に組み込みません。
- **日本語ナレーション（任意）:** ローカルのVOICEVOX Nemo CPUエンジンで日本語WAVを生成し、MulmoCast既存の`beat.audio`に渡すオプションがあります。**初期値OFF**で、ユーザーが有効にした時だけGitHub Actions上でDockerを起動します。外部の有料TTS APIは使用しません。VOICEVOX Nemoの商用・非商用利用には **「VOICEVOX Nemo」のクレジット表記が必須**です（[公式規約](https://voicevox.hiroshiba.jp/nemo/term/)）。同意していない場合は実行しません。実際のCPU音質・起動時間は未検証で、単体テストはモック音声を使用しています。音声がカットの尺を超える場合、許容上限内でカット時間を延ばします。短い説明文にしてください。
- 制作実行中に無料枠のAPI側の制限（429など）に当たった場合、停止します。**有料APIへの自動切替はありません**。無料プランの状態は利用者が事前に確認する方式で、コードが請求先の状態を取得して保証するわけではありません。
- GitHub Actionsの実行時間には無料枠・利用制限があり、DockerによるCPU音声生成にも実行時間を消費します。GitHub側の無料分を超えた場合の扱いは各アカウントの設定に依存します。**各API/Actionsの無料枠が永続無制限という保証はありません**。
- GitHub Actionsは当面の**操作入口**です。一般向けのWebアプリ、会員登録、独自エディターは作りません。数人の運用で本当に必要になったら検討します。
- 動画の説明文・生成物に、秘密情報や権利を持たない人の素材を入れないでください。

## 自分のAPIで有料モデルを使う場合

**MulmoCast標準の**`mulmo.config.json`、MulmoScriptの`imageParams.provider/model`や`movieParams.provider/model`、各プロバイダーの環境変数を設定します。`--sns-free-only`モードは意図的に有料APIを拒否します。無理にガードを書き換えたり、無料モードでの有料モデルへのフォールバックを加えたりしないでください。

## 今後、本当に必要になった場合だけ

無料・権利条件の確認できる継続I2V接続先があれば、MulmoCastの標準Movie Agentに接続してこの入口を動く動画へ拡張します。無料TTSはまずローカルVOICEVOX NemoからWAVを作り、MulmoCast既存の取り込み機能を再利用するオプションを用意します。新しいAI切替機構、独自動画編集エンジン、マルチユーザー管理システムは作りません。
