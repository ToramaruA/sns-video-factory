# 最小ブラウザ版（ローカル・少人数向け）

既存MulmoCastを動かすための小さな操作入口です。新しい動画エンジン・モデル選択画面・ユーザーDB・編集エンジンは作りません。**無料APIの契約・規約・残り枠を自動で保証するものではありません。**

## できること

ブラウザで日本語の動画依頼を入力 → 既存GraphAIとGroq Freeでカット割り → Cloudflare Workers Freeの画像生成 → MulmoCastの安全モードで720×1280 MP4を作成 → MP4とMulmoScriptをダウンロード。生成中の進捗も表示します。1〜12カット、合計60秒以内で、現在は**静止画をつないだ動画**です。各カットが動くI2Vは未対応です。

## ホストPCでの準備

1. Node.js 24、FFmpegを用意し、リポジトリで yarn install --frozen-lockfile と yarn build を実行する。
2. リポジトリ直下の .env またはサーバープロセスの環境変数に GROQ_API_KEY（または LLM_GROQ_API_KEY）、CLOUDFLARE_ACCOUNT_ID、CLOUDFLARE_API_TOKEN を設定する。
3. **実際のアカウントが無料プランであることを自分で確認した場合のみ**、SNS_VIDEO_GROQ_FREE_PLAN_CONFIRMED=1 と SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED=1 を設定する。
4. リポジトリ直下で node scripts/sns-video-browser.mjs を起動する。http://127.0.0.1:8787 をブラウザで開き、コンソールに表示されたアクセスキーを入力する。固定のブラウザ用キーを使う場合は SNS_VIDEO_WEB_TOKEN に24文字以上の値を設定できる。
5. 動画の説明を入力し、生成開始。完成したMP4と企画用MulmoScriptをダウンロードする。

日本語音声を付ける場合は、VOICEVOX Nemoをホスト上の127.0.0.1:50021で**事前に起動**する必要があります。別途PythonとFFmpegが必要です。VOICEVOX Nemoの商用・非商用利用時は公開動画または投稿文への「VOICEVOX Nemo」のクレジット表記が必要です。音声オプションは初期OFFです。

## 数人に共有するには

最初は安全のため**localhost（127.0.0.1）からのみ**接続可能です。数人に使ってもらうには、Tailscale Serveなど、認証・HTTPSを提供するプライベートなプロキシでlocalhostの8787番へ接続する方法を推奨します。実際のVPN・他端末からの接続はまだテストしていません。**このHTTPサーバーを公開インターネットに直接開放しないでください。**

共有するのはブラウザURLと画面用アクセスキーで、Groq・CloudflareのAPIキーはサーバーだけに置きます。無料APIの利用枠はホスト管理者のアカウントで**共有**され、利用者人数が増えても枠は増えません。1本ずつ順番に生成します（処理中の別リクエストは拒否）。過去10件の完成物だけをサーバー内で扱い、保存先は output/sns-video-browser/ です。

## 制限と検証範囲

- API料金不明なら停止します。有料AIへの自動フォールバックはありません。Freeプランの確認はサーバー管理者による申告であり、契約をAPIから検証しているわけではありません。
- サーバーは1プロセス運用。公開Webサービス、ログイン画面、ジョブDB、永続履歴、ブラウザ内の台本編集は未完成です。
- APIキーはブラウザに渡しません。画面用アクセスキーはWebストレージに保存しません。
- API認証・二重起動防止・エラー非漏洩のテスト：`node --test scripts/test-sns-video-browser.mjs`（API無し・ダミー出力）。
- **実際のMulmoCastレンダラーを通すオフライン結合テスト**：`node --test scripts/test-sns-video-browser-real-mp4.mjs`（`yarn build`とFFmpegが必要）。ブラウザHTTPで動画作成を依頼し、元MulmoCastの既存GraphAIモック企画→既存画像処理→720×1280の実MP4→認証付きHTTPダウンロードを確認します。外部LLM・画像・動画APIは使いません。
- **実際のGroq・Cloudflare・VOICEVOX Nemoによるブラウザからの動画生成は未検証**です。まず小規模なMVPとしてホスト環境を整えた上で実生成を確認します。

## 実APIを使った「ブラウザ → MP4」検証（任意・手動）

[既存の無料MulmoCast GitHub Actions](https://github.com/ToramaruA/sns-video-factory/actions/workflows/sns-video-groq-flux-three-cut-manual.yml) に **verify_browser_http_end_to_end** を追加しています。このオプションをONにすると、通常のCLI直接実行の代わりに、今回作成したブラウザ用HTTPサーバーをGitHub Actions内の `127.0.0.1` で起動し、**実際の**Groq Free／Cloudflare Workers Free → MulmoCast → 認証付きMP4ダウンロードを1回だけ検証します。ブラウザ向けのURLをインターネットへ公開するわけではありません。

1. **Groqの組織がFree Plan、Cloudflare WorkersのアカウントがFreeプラン**であることを各サービス側で確認する。GitHub Actionsに各APIのSecretsが登録されている必要があります（接続ツールはSecretsの値や契約プランを読むことができません）。
2. **Run workflow** で短い架空の動画企画を入力し、両方の無料プランの確認欄と **verify_browser_http_end_to_end** にチェック。初回は日本語音声をOFFにして試す。
3. 成功したRunのArtifacts `free-mulmocast-portrait-still-video` に含まれる `output/sns-video-browser-smoke/video.mp4`、`mulmo-plan.json`、`verification.json` を確認する。

検証すること：画面と同じHTTP APIの受付・進捗、認証なしダウンロードの拒否、元MulmoCastの出力とダウンロードしたMP4の一致、720×1280のサイズ、カット数・再生時間、必要なら音声トラックの有無。**実I2Vは検証しません（現時点では静止画ベース）**。

このテストは外部APIとGitHub Actions実行時間を消費します。**無料枠の契約状態は利用者が確認したものに限って実行**し、CIのPR/pushからは呼びません。失敗すると有料サービスへ切り替えずに停止します。なお、この実行が通っても、実際の複数人向けネットワーク公開・VPN認証まで検証したことにはなりません。

誤解を避けるため、**オフラインCIの成功**と、確認欄を有効にした**実サービスAPIの成功**は別々に記録します。
