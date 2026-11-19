# SNS動画制作: ブラウザからの直接生成

方針: 公式MulmoCastをGitHub Actions上で動かす現在の経路を維持する。Cloudflare WorkerはAPIキーを守って既存Actionsを起動するだけ。カット割り・画像・I2V・音声・MP4結合エンジンを作らない。

## 確認済みと未確認

- Groq無料台本生成と、編集済みMulmoScriptからの音声付きMP4制作はGitHub Actionsで実際に成功済み。
- ブラウザUIには「AI台本生成」「動画生成」「進捗」「MP4プレビュー・ダウンロード」を実装。Web UIのビルドを確認。
- Cloudflare WorkerのJWT必須・秘密情報が欠けた際の拒否・4項目の無料枠と第三者サービス同意はオフラインテストを通過。
- Workerの本番デプロイ、Cloudflare Access認証、GitHub API起動と成果物取り込みの全経路はまだ実通信未確認。
- Wanの第三者ZeroGPU公開デモの商用・継続利用条件は未承認。完成した本番システムと呼ばない。

## 最短の公開手順 (GitHub画面で実施)

第1段階。CloudflareでWorkersをデプロイできる権限を持つAPI Tokenを作る。GitHubのSettings > Secrets and variables > Actionsに SNS_CF_WORKER_DEPLOY_TOKEN として保存。既存の CLOUDFLARE_ACCOUNT_ID は流用。Actionsにある SNS Cloudflare browser generation — manual secure deployment を選択して、開発ブランチ、activate_secure_api=OFF で起動する。秘密情報がまだないのでAPIは無効のままWorkerが作られる。

第2段階。Cloudflare Dashboardの Workers & Pages から sns-video-factory-secure を選択し、Accessタブで Protect this Worker behind Access を有効にする。Production and previewの両方を保護し、許可する利用者のメールアドレスだけを登録する。Cloudflare AccessのAudience tagとチームドメインを控える。

GitHubのfine-grained Personal Access Tokenは ToramaruA/sns-video-factory のリポジトリだけに、Actions: Read and write 権限で作成する。GitHub Actions Secretsには SNS_GITHUB_ACTIONS_PAT、SNS_CF_ACCESS_TEAM_DOMAIN、SNS_CF_ACCESS_AUD として登録する。トークンの値をチャット、Web画面、リポジトリのファイルに貼らない。

その後、同じGitHub Actionsのデプロイワークフローを activate_secure_api=ON で再実行する。Cloudflare Workerの保護された公開URLで、一連の作業を試す。

## 安全性と制約

APIはCloudflare AccessのJWTがない場合401、秘密情報がなければ503で停止する。GitHub PATやAIキーはブラウザへ送信しない。POSTは同一オリジンのみ許可する。既存のGitHub Pages公開版は、バックエンドがない限り従来の手動GitHub Actions導線で利用できる。

無料試験の動画は3カット・各2秒に限定。Wan公開Spaceへ画像3枚を送信することを明示確認し、有料モデルには切り替えない。動画の素材ファイル自体をブラウザからアップロードする機能は未実装。
