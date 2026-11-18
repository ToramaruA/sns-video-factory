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
- テストは node --test scripts/test-sns-video-browser.mjs 。外部AIキーを使わず認証、重複生成拒否、進捗、MP4ダウンロード、失敗時の秘密情報非公開を検証します。
- **実際のGroq・Cloudflare・VOICEVOX Nemoによるブラウザからの動画生成は未検証**です。まず小規模なMVPとしてホスト環境を整えた上で実生成を確認します。
