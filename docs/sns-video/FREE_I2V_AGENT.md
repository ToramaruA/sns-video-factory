# 無料画像→動画生成の共通Agent（開発版）

**2026-11-15 時点:** 実装ブランチ `feat/free-i2v-provider-architecture`。通常時は**無効**。本番の共有サービスに採用したわけではない。

## 何が変わった？

以前: 外部PythonからWan 2.2を呼び、完成MP4をあとでMulmoCastに渡す。

今回: MulmoCastの`movieGenerator`から共通エージェント `movieFreeRouterAgent` を呼び、選ばれた無料接続先を経由してMP4のバイト列を戻す。既存のMulmoCastキャッシュ・動画結合処理で使える形式。

```text
MulmoScript (movieParams.provider = "free_i2v")
  └─ MulmoCast movieGenerator
       └─ movieFreeRouterAgent ─ 無料経路だけ選択（選定失敗なら停止）
            ├─ movieWan22ZeroGpuAgent (登録済み・実験専用)
            │    └─ Python bridge → 公開Gradio Space → MP4
            └─ [今後別の無料AIのAdapterを登録]
```

**注意:** 現在の登録先はWan 2.2のみ。モデルAの失敗後にモデルBへ再実行する仕組みや、無料枠を管理するサーバ側のキューはまだない。共通の選択ロジックを先に実装した段階。

## 使い方（手動の技術試験に限定）

MulmoScript v1.1の`movieParams.provider`に`free_i2v`を指定する。ほかのプロバイダーを自動選択しない。絵の準備に有料画像生成APIが混じらないよう、**既にあるローカル画像**を使う。

```json
{
  "$mulmocast": {"version": "1.1"},
  "lang": "ja",
  "canvasSize": {"width": 720, "height": 1280},
  "movieParams": {"provider": "free_i2v", "model": "auto-free", "concurrency": 1},
  "audioParams": {
    "suppressSpeech": true,
    "introPadding": 0,
    "padding": 0,
    "closingPadding": 0,
    "outroPadding": 0
  },
  "beats": [{
    "id": "shot_01",
    "text": "",
    "duration": 2,
    "image": {"type": "image", "source": {"kind": "path", "path": "./assets/input.png"}},
    "moviePrompt": "The camera follows the rocket as it slowly rises"
  }]
}
```

このJSONは`test/sns_video/test_free_movie_router.ts`のMulmoScriptスキーマ検証に使用する。実ファイル例は`experiments/03-free-i2v-agent/`のテストを参照。

### 実行条件

- Node.js 24 / MulmoCastを`yarn build`済み、FFmpeg
- Python 3 と **任意の**`gradio_client==2.7.2`（Python依存は通常のMulmoCastビルドには不要）
- Hugging FaceのAPIトークンを設定しない
- **ユーザーが利用条件・無料枠を確認してから手動で**`SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT=1`を設定
- 推論用リクエストは**プロセス当たり最大1回**。無料GPUの枠に入るかは保証されない
- 2秒生成・初期画像1枚のみ対応。最終MP4はMulmoCastで任意の画面サイズに編集可能

```sh
# ローカルでテストする場合のみ:
python3 -m pip install gradio_client==2.7.2
yarn build
SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT=1 node lib/cli/bin.js movie experiments/03-free-i2v-agent/mulmo_script.json
```

**本番ではこのフラグを自動的にONにしない。** UIから直接環境変数を切り替えさせる設計にもしていない。

## ソースと責務

| パス | 役割 |
|---|---|
| `src/sns-video/providers/free_movie_router.ts` | 無料接続先だけを選ぶ副作用なしの共通ロジック |
| `src/agents/movie_free_router_agent.ts` | MulmoCast内の共通エントリーポイント |
| `src/agents/movie_wan22_zerogpu_agent.ts` | Wan 2.2接続、無料条件検査、サブプロセス起動、MP4返却 |
| `src/sns-video/providers/wan22_zerogpu_client.py` | 任意依存のGradio Pythonクライアント。匿名で1回だけ生成 |
| `src/types/provider2agent.ts` | `free_i2v` / `wan22_zerogpu_experimental`を追加 |
| `src/actions/images.ts` | MulmoCast既存GraphAI登録に追加 |
| `test/sns_video/test_free_movie_router.ts` | オフライン検証（無料以外選ばない、能力不一致、既定無効など） |

## 無料・安全性のガード

1. `free_i2v`と実験用Wanエージェントの接続先は **料金なしの匿名Gradio実験に固定**。有料プロバイダーへの自動フォールバックなし。
2. `SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT=1`未指定ではネットワーク実行禁止。
3. `HF_TOKEN` / `HUGGING_FACE_HUB_TOKEN` が存在する場合は拒否。Pythonサブプロセスは秘密情報とHF認証キャッシュから隔離。
4. 開始画像、2秒、対応モデル以外、末尾画像・参考画像・音声生成などの未対応機能は拒否。入力を無言で省略しない。
5. 1プロセス1回、リトライなし、タイムアウトあり。混雑・無料枠不足でも勝手に有料へ移行しない。
6. `src/sns-video/providers/free_movie_router.ts`は候補の順序と能力で無料プロバイダーを選べる設計。ただしWan以外はまだ登録・認可していない。
7. `routeStatus=ready` は**運営者による実験の明示的許可**であり、リアルタイムの無料残量があるという意味ではない。

### 実装上の限界

- 共有ZeroGPUの利用規約・商用第三者サービスとしての運用可否・継続提供・レート制限は未確認。正式採用しない。
- 一度だけ動いた実験から無料残量・生成成功率を推測しない。
- 実験で使うスペースのAPI名・パラメータが変わったら停止。無断スクレイピングやUI自動操作を代替として使わない。
- プロセス内の呼び出し上限は**複数ワーカーに跨る永続的なクォータ管理ではない**。本番キュー・DBでの管理は別工程。
- 現状のPythonブリッジはこのフォークの**ソースチェックアウト環境**から動作させるもので、MulmoCastのnpm配布物単体から使える保証はない。
- プロバイダー選択を`free_i2v`と書くだけで、元のMulmoCastの有料画像生成・TTSを自動無効にするわけではない。**既存静止画と`suppressSpeech:true`を利用する試験手順に限定**する。
- `auto-free`は複数の**有効かつ仕様が合う無料経路**が登録されたときに優先候補を選ぶ意図。生成エラー後の自動再試行・フォールバックは未実装。

## 次の段階

1. このPRの型チェック、単体テスト、既存MulmoCast CIを通す。
2. 実際の1beatで手動起動し、Gradioクライアントから返ったMP4をMulmoCastが保存・出力できるか確認。
3. 共有サービスとして許可された無料経路を調べ、追加候補を比較してから2番目のAdapterを実装。
4. 後続PRで**永続的なジョブ状態・クォータ待機・人間の承認**と連携させる。

[設計入口](./README.md)
