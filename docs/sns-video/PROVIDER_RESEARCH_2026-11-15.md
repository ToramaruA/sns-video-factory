# 継続無料の画像→動画生成 — 候補調査と初回実証（2026-11-15）

**区分:** Phase 1 技術検証記録。**本番プロバイダー採用の承認ではない。**

## 採用要件

このツールはSNS宣伝用の動画を複数の利用者が制作する。モデル名だけでなく、**利用経路、継続無料かどうか、第三者利用・商用利用条件、画像→動画への対応**を確認する。API単位で課金されるサービスには自動接続しない。

## 候補の比較

| 候補/経路 | 画像→動画とAPI | 無料枠の継続 | 商用利用/外部Webサービス | 現時点の判断 |
|---|---|---|---|---|
| **Wan 2.2 / Hugging Face ZeroGPUの公開Gradio Space** | あり（`/generate_video`）。1回実生成成功 | ZeroGPUの利用者ごとの日次枠がある。**共有の匿名枠は少ない** | WanモデルはApache 2.0。ただし第三者がホストするSpaceの継続提供・実際のサービス組込みの条件と可用性は別途確認 | **技術実証済み・本番適合は保留** |
| **Cloudflare Workers AI の画像→動画（HappyHorse 1.1）** | あり | 対象モデルは**秒単位の料金表示**。Workers AI一般の無料Neuron枠が第三者モデルの生成料金を無料にするとは扱わない | 料金と規約に従う必要 | **初期無料運用には使わない** |
| **Replicate / fal.ai の画像→動画API** | 複数あり | 初回クレジットや有料従量課金が中心。継続無料の実行可能枠は確認できていない | モデル・プランによる | **継続無料の証明ができるまで不採用** |
| **自己ホストWan 2.2** | モデル重み公開。実装次第でAPI化可能 | モデル自体に従量API料はない。ただしGPU費用やホストの無料枠が別途必要 | 重みはApache 2.0、実行環境の条件は別 | **将来の代替候補。GPU基盤未決定** |

「無料APIの呼び出しが1回できた」だけでは、チーム全体で無料運用を保証できない。

## Hugging Face ZeroGPU の公式情報

- [公開SpaceのAPI](https://huggingface.co/docs/hub/spaces-api-endpoints)：公開Gradio SpaceのAPI利用を説明。Python/JS/HTTPから利用できる。
- [ZeroGPU公式仕様](https://huggingface.co/docs/hub/spaces-zerogpu)：認証なし**2分/日**、無料アカウント**5分/日**。初回GPU利用から24時間後に枠がリセット。混雑・利用者ごとの枠あり。
- [Wan 2.2 I2V Diffusersモデルカード](https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B-Diffusers)：Apache-2.0。
- [今回使った公開Space](https://huggingface.co/spaces/zerogpu-aoti/wan2-2-fp8da-aoti-faster) / [実装ソース `app.py`](https://huggingface.co/spaces/zerogpu-aoti/wan2-2-fp8da-aoti-faster/blob/main/app.py)：9項目の入力を持つGradioの`/generate_video`。各回にGPU枠を消費し、MP4を生成。

**注意:** ZeroGPUの「無料5分」は実行可能な動画尺5分ではない。GPU処理に消費した時間であり、どの程度の動画を生成できるかはモデル・負荷・入力・待ち時間で異なる。複数ユーザーに同一アカウントを無断で使い回して継続無料枠を拡張できる保証もない。

## 実生成の証拠

- **2026-11-15（JST）:** [GitHub Actions run 43622599531](https://github.com/ToramaruA/sns-video-factory/actions/runs/43622599531) で**匿名API呼び出しを1回実施**。
- 生成物は`wan22-zerogpu-single-probe`アーティファクトに保存された。詳細は [probe README](../../experiments/02-free-i2v-probe/README.md)。
- 検証環境に`ffprobe`がなかったためジョブ判定は失敗だったが、**出力MP4そのものは作られていた**。
- 別の実行環境で解析・全フレームのデコードを行い、**H.264 / 560×832 / 16fps / 33フレーム / 2.0625秒**の正常なMP4と確認。
- 初期画像からロケットが飛び上がる動きが生成されており、単なる画像のPan/Zoomではない。
- 最初と最後に近いフレームの違いを数値でも確認。
- 利用した画像はテスト用にPythonで独自作成。有料APIキー・HF認証・リトライはなし。
- **未達:** MulmoCastの生成Agentから直接呼び出すこと。モデルの可用性を連日測ること。共有アプリとしての利用条件の追加確認。

## MulmoCast本体との結合実験（追加検証）

- [GitHub Actions run 43623282651](https://github.com/ToramaruA/sns-video-factory/actions/runs/43623282651) にて、**先ほど生成したAIの実MP4を、再生成せずに**アーティファクトからダウンロード。
- `mulmo_ai_render.json` の第1カットにWan 2.2の実動画、第2カットにFFmpeg製のダミー後半カットを配置。
- MulmoCast本体で結合・書き出しに成功。最終ファイルは**720×1280 / 30fps / 122フレーム / 4.0667秒**、映像H.264＋音声AAC。ローカルFFprobeで解析し、FFmpegによる全ファイルのデコードも成功。
- 保存先: GitHub Actionsの `wan22-mulmocast-render` アーティファクト（有効期限あり）。
- SHA-256: `f58cca5e260f952d100d67feeb7f789d42c05714f53bf7d28c2959dbb10663b4`
- ここで検証したのは**外部生成したMP4をMulmoCastに入力する接続経路**。MulmoCastの`movieGenerator`内部にZeroGPU専用Agentを登録したわけではない。そちらは次段階。

## この実証から分かったこと

**できると確認したこと**
1. 外部GPUに動画モデルを置き、自分のPCやGitHub ActionsでGPUを用意せずに画像→動画を呼び出せる。
2. 公開Gradio APIから実際のMP4を受け取り、既存MulmoCastが利用できる動画ファイル形式に変換なしで保存できる。
3. 小規模テストは料金を伴うAPI鍵なしで実行できた。

**まだ確認していないこと**
1. APIが今後も安定して呼び出せるか、モデル/Spaceが廃止されないか。
2. 第三者SpaceのGPU枠を共有Webサービスから利用することが許可・実用的か。
3. 宣伝目的・複数ユーザーの入力画像のアップロード条件、保存期間、個人情報の扱い。
4. 同じ予算で何本生成できるか、連日回復するか、混雑時の待ち時間。
5. カット単位の承認・再生成、MulmoScript v1.1からの自動呼び出し。

## 次の実装基準

- [ ] 無料/規約適合の候補を少なくとも1つ本番用途として承認できることを再確認
- [ ] モデルに必要な入力条件（画像、長さ、縦横比、動き）の検証
- [ ] 「無料と判断できない場合は呼ばない」実装上のガード
- [ ] MulmoCastのmovie agentとして画像→動画の1カットを動かす
- [ ] 受け取ったMP4を保存し、既存の結合エンジンまで通す
- [ ] 枠不足時に記録・停止・待機する。規約を避けるための自動複数アカウント作成はしない

## 運用・料金上の注意

Hugging Face APIの実行には事前に無料枠が必要。今後Webで公開するときは、**利用者に無制限の無料生成を約束しない**。第三者のSpaceはテスト先であって、保証された本番インフラではない。利用枠がなくなれば安全に停止し、利用者には理由と不確実性を表示する。

[設計入口](./README.md) | [実装計画](./IMPLEMENTATION_PLAN.md)
