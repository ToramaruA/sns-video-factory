# Phase 2 接続先調査と容量共有の注意（2026-11-15）

**結論:** Wan 2.2への実接続は成功しているが、**商用の共同利用Webサービスにそのまま載せてよい、継続無料の実行枠を確保できたとは言えない**。2番目の実用接続先もまだ確定していない。

## 一次資料

- [Hugging Face ZeroGPUの公式仕様](https://huggingface.co/docs/hub/spaces-zerogpu): 認証なし2分/日、無料アカウント5分/日（初回利用から24時間後リセット）、Proなど有料ユーザーは超過時に前払クレジットで自動請求され得る
- [Hugging Face Gradio SpacesをAPIとして使う公式説明](https://huggingface.co/docs/hub/spaces-api-endpoints): 公開Gradio Spaceは正式なAPIエンドポイントとして呼び出せる。ただしAPIが存在することと共有サービスとしての安定供給・権利承認は別
- [Hugging Face ZeroGPUの残枠を取得する公式API](https://huggingface.co/docs/huggingface_hub/main/guides/manage-spaces): \`get_zero_gpu_quota()\`は認証したユーザーの残時間を取得する用途。利用するトークンの権限と有料枠への請求リスクに注意。**本プロジェクトでは当面トークンを使わない**
- [Lightricks公式LTX-2.3 Spaceのソース](https://huggingface.co/spaces/Lightricks/LTX-2-3/blob/main/app.py): 画像を先頭フレームとして動画を生成できるGradio実装を公開（\`input_image\`, \`prompt\`, \`duration\`等）
- [LTX-2.3モデルのライセンス全文](https://huggingface.co/Lightricks/LTX-2.3/blob/main/LICENSE): LTX-2 Community License Agreement。年間売上1000万ドル以上の企業は別の有償商用ライセンスが必要。利用競合禁止条件（Attachment Aの条項20など）があり、SNS動画生成Webサービスに適合するか**法的・サービス上の確認が必要**

## 機械可読な接続先の状況

| 経路 | 技術的i2v | 継続無料の証拠 | 宣伝・商用Webサービスに使う権利 | 同時接続先としての扱い |
| --- | --- | --- | --- | --- |
| \`wan22_zerogpu_experimental\` (匿名ZeroGPU) | 2秒MP4を実生成、MulmoCastでも直接成功 | ZeroGPUの匿名共用の上限制利用 | Space/共同利用条件・運用の継続性は未承認 | 実験専用。通常は無効 |
| Lightricks公式 \`LTX-2-3\` Space | Gradio実装が画像→動画に対応。**本プロジェクトでの実生成は未検証** | ZeroGPUの日次枠と待ち行列に依存 | 独自モデルライセンスに使用制限あり。競合サービスへの該当性未確認 | **未登録・未承認**。無理に接続しない |
| Hugging Face上の別の無料Space | モデルごとに異なる | 同一ユーザー/匿名プールが同じ可能性あり | Spaceごとに別途確認が必要 | **独立した無料供給元とは見なさない** |
| 自己ホストモデル | モデル/実行環境次第 | 重み無料でもGPU費用別 | モデルごとのライセンス確認 | **GPUの無料実行先を確保してから** |

### 重要: 同じGPU枠を使う2つのSpaceは独立した無料提供元ではない

Wan 2.2用SpaceとLTX 2.3用SpaceがどちらもHugging Faceの「匿名ZeroGPU枠」を使っていれば、**別のAPIでも同じ利用枠に制約される**。片方の無料枠不足が分かった際には、同じ\`quotaPoolId\`の他候補も停止する。無料枠の不明な回復時刻を推測しない。

今回のコードでは、\`quotaPoolId = "huggingface-zerogpu-anonymous"\`をWanの実験ルートに付け、ジョブ調整器のテストでも同じプールの2番目をスキップする。将来追加する候補にも共通IDを付ける。

### 実装フェーズの区別

- **実装済み:** AI接続用の共通Agent。Wan2.2による2秒動画の直接生成。無料以外を拒否するセレクター。
- **PR #5で開発中:** ジョブID、入力画像リビジョン、プロンプトのハッシュ、同じリクエストの重複予約拒否、明確な枠不足では共有プールを閉じる状態遷移、曖昧な失敗では人の確認へ、ローカルの排他保存。
- **未実装:** 自動代替を実際に外部APIへ送信するサービス。本番用の複数ホスト対応DB/キュー、実際のZeroGPU残量照会、共有サービスとしての利用条件への承認、2番目の独立した無料AI実行経路。

## 運用・禁止事項

1. **匿名アクセスが成功した1回**を「継続無制限無料」の証明とはしない。
2. Hugging Faceの有料アカウントの認証トークンをこの実験に流さない（超過時のクレジット消費を防ぐ）。
3. 無料枠不足が曖昧であるときに別アカウントへ自動切替しない。大量アカウント・VPN等による制限回避は行わない。
4. 画像や動画などの個人素材を未承認の公開Spaceに送らない。
5. LTXモデルの競合サービス禁止等の制限は無視しない。法的に曖昧な経路を勝手に有効化しない。
6. GitHub Actionsは検証先であり、本番ワーカー・永続DBではない。

[Phase 2実装計画](./IMPLEMENTATION_PLAN.md) | [接続機能](./FREE_I2V_AGENT.md)
