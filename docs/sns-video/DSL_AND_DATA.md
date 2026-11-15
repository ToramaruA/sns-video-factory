# MulmoScript / DSL / 制作管理データの設計

**状態:** 既存MulmoCastの仕様に基づく案。ここで説明する独自マニフェスト・状態モデルは初期版の標準実行方式ではない。**初期版ではMulmoScriptをそのまま既存MulmoCastへ渡し、画像生成→動画生成→編集を連続実行する。** カット単位承認/個別MP4再利用の例は将来オプション。

## 1. DSLとは何か

DSL（Domain-Specific Language）は、特定の仕事を記述するための言語。ここでは「動画の設計書」をコンピューターに理解させることが仕事。

MulmoCastのDSLである **MulmoScript** はJSONの構造を使う。

- **記述する人:** AIディレクター、またはWeb画面を操作する利用者
- **読む人:** MulmoCastのプログラム
- **何を指定するか:** カット順、画像内容、動き、長さ、参照素材、音声・字幕・BGM等
- **何を指定しないか:** 誰が承認したか、無料枠の残り、ジョブが何回失敗したか等の「実行状況」

MulmoCastが公開している仕様に合わせ、当面は**MulmoScript v1.1**をそのまま使う。`src/types/const.ts`に`currentMulmoScriptVersion = "1.1"`、`src/types/schema.ts`にZodスキーマがある。

## 2. 通常の生成例：2カットの画像→動画

下記は「設計図」の例。**AIの生成費用が無料という意味ではない**。接続するAIは別途選定する。

~~~json
{
  "$mulmocast": { "version": "1.1" },
  "title": "ロケットイベント紹介",
  "lang": "ja",
  "canvasSize": { "width": 720, "height": 1280 },
  "audioParams": {
    "suppressSpeech": true,
    "introPadding": 0,
    "padding": 0,
    "closingPadding": 0,
    "outroPadding": 0,
    "bgmVolume": 0
  },
  "beats": [
    {
      "id": "shot_01",
      "text": "",
      "duration": 5,
      "imagePrompt": "夕暮れの発射台に立つ水ロケット。縦構図",
      "moviePrompt": "カメラがゆっくり機体に近づく"
    },
    {
      "id": "shot_02",
      "text": "",
      "duration": 5,
      "imagePrompt": "水ロケットが打ち上がる瞬間。縦構図",
      "moviePrompt": "水を噴射しながら力強く上昇し、カメラが追う"
    }
  ]
}
~~~

- `beats` の配列は映像のカット順。
- `imagePrompt` が静止画の生成指示。
- `moviePrompt` が動画生成指示。
- 両方あれば、MulmoCastの既存フローは静止画を作り、それを動画化する。
- `audioParams.suppressSpeech: true` はTTS（音声読み上げ）を抑止する。BGM等は必要な時だけ使う。

**注意:** 画像→動画の対応・尺・品質は、接続するモデルによって異なる。`duration: 5` を書けば必ず5秒の生成クリップが無料で出るわけではない。

参照: [MulmoCastの生成ルール](../image.md)、[既存コード](../../src/actions/images.ts)。

## 3. 将来オプション：承認済み静止画から動画を作る場合

初期版では利用しない拡張例。将来、必要になったら生成・承認済みの画像を再利用し、「企画→画像承認→動画化」という人間の確認工程を分離できる。

~~~json
{
  "id": "shot_01",
  "text": "",
  "duration": 5,
  "image": {
    "type": "image",
    "source": {
      "kind": "path",
      "path": "./approved/shot_01.png"
    }
  },
  "moviePrompt": "カメラがゆっくり機体に近づく"
}
~~~

これは上位の`beats`配列へ入れる1件の例。`kind: "path"` は、MulmoScriptを置いた場所に対する相対パス。ワーカーは安全な作業用ディレクトリを準備し、承認済み画像をその中へ配置する。

`image` と `moviePrompt` を同時指定する既存仕様は [MulmoCastの生成ルール](../image.md)に記載されている。ただし新たに採用するAIエージェントとの接続はテストが必要。

## 4. 将来オプション：承認済みMP4だけで再編集する

初期版では採用しない個別レビュー・再編集の方法。将来動画がすべて承認されたら、編集中に画像生成・動画生成AIを再呼び出ししない設計も選べる。

~~~json
{
  "id": "shot_01",
  "text": "",
  "duration": 5,
  "image": {
    "type": "movie",
    "source": {
      "kind": "path",
      "path": "./approved/shot_01.mp4"
    }
  }
}
~~~

将来この方式を採用する場合、各beatに承認済みMP4を設定した**最終編集用のMulmoScript**を自動生成しMulmoCastへ渡す。初期版の連続生成にこの段階は設けない。

既存のMP4入力は`src/types/schema.ts`の`mulmoMovieMediaSchema`と、`docs/image.md`で定義されている。

## 5. 参照画像と参考動画の違い

- **参考写真・ロゴ・人物・商品:** 画像生成または対応する動画生成モデルの参照画像として使う。
- **既存の動画をそのまま採用:** `image.type = "movie"` で取り込む。
- **参考動画の動きをAI生成動画へ移す:** その機能を持つモデルへの**専用アダプターが必要**。現行MulmoScriptが既存動画ファイルを読めることと、動画を動作条件としてAIに渡せることは同義ではない。

MulmoCastには`movieParams.firstFrameImageName`、`lastFrameImageName`、`referenceImages`があるが、モデルごとに対応差がある。参照画像と開始/終了画像を併用できないモデルもある。[既存の参照画像仕様](../movie_reference_images.md)を確認する。

動画参照の独自拡張が必要なら、**プロジェクト管理データに参考動画のIDと意図（動き／画角／雰囲気）を記録**する。MulmoScript本体に項目を足すのは、実際にモデルとアダプターが必要になってからにする。

## 6. 元のDSLと「進捗」を分ける理由

MulmoScriptの`mulmoBeatSchema`と`mulmoScriptSchema`は`.strict()`で定義され、任意の未知のプロパティを直接足すと検証エラーになる。

そこで、次の情報は**独自の制作管理データ**に保存する。

- 承認状況
- 選んだモデルと実際に使ったモデル
- 同時実行・キュー状況
- プロンプトのリビジョンと生成履歴
- 無料枠／待機理由
- 生成済み素材の識別子と保存場所

下記は**独自設計の例であり、MulmoScriptでも実装済み形式でもない**。

~~~json
{
  "schemaVersion": 1,
  "projectId": "project_demo",
  "scriptRevision": 3,
  "shots": [
    {
      "beatId": "shot_01",
      "image": {
        "assetId": "img_001",
        "revision": 2,
        "status": "approved"
      },
      "video": {
        "assetId": null,
        "status": "queued",
        "sourceImageRevision": 2
      }
    },
    {
      "beatId": "shot_02",
      "image": {
        "assetId": "img_002",
        "revision": 1,
        "status": "approved"
      },
      "video": {
        "assetId": "clip_002",
        "status": "approved",
        "sourceImageRevision": 1
      }
    }
  ]
}
~~~

後でDBへ移しても概念は変えない。**beat IDを永続的な識別子として使い、配列の位置だけでカットを特定しない**（順序変更しても対応を保つため）。

## 7. 将来オプション：カット単位の状態遷移と承認

状態は「プロジェクト全体」と「各カットの画像／動画」で分ける。最低限、各生成ステップに以下を持つ。

~~~text
pending → queued → running → ready_for_review
             ↘ waiting_for_quota      ↙     ↓
               retryable_failure   approved / revision_requested
                     ↓                   ↓
                  queued            新リビジョンでpending
~~~

- `waiting_for_quota` は「失敗して消えた」ではなく、処理可能になるまで待機中であることを表す。
- 権利・利用規約・対応機能などの**恒久的エラー**は自動再試行しない。
- 承認は**対象のasset IDとrevision**に対して与え、後から別のファイルがその承認を使い回せないようにする。
- 生成中の画像に対して新しい修正が届いても、古い生成結果は最新版を上書きしない（revision check）。

## 8. 将来オプション：再生成時の最小無効化

| 変更したもの | 失効させるもの | 保持するもの |
|---|---|---|
| カットAの動画動作指示 | カットAの生成MP4、最終結合 | 承認済み画像、他カット |
| カットAの画像 | カットAの画像承認とそれ由来のMP4、最終結合 | 他カット（依存がなければ） |
| 全体の字幕・BGM | 最終結合の出力 | 承認済みの画像・MP4 |
| 共通スタイル・キャラクター資料 | 実際に参照しているカットを再評価 | 無関係なカット |

生成AIがモデル切替で絵柄・動きが変わることがあるので、**モデル切替後の成果物は再度人間に提示する**。

## 9. 実行時の安全チェック

MulmoScriptをMulmoCastに渡す前に：

1. スキーマに通るか、ビートIDが一意か、参照ファイルが存在するか。
2. SNS向け画面比率と、モデルの対応画面比率が整合するか。
3. 必要な開始フレーム・参照素材をそのモデルが使えるか。
4. 書き出し専用なら**生成プロンプトを含むbeatが混入していないか**。
5. 有料APIの呼び出し経路を遮断できているか。
6. ユーザー入力のファイルパス／URLが許可範囲か（任意のローカルファイル・内部URLの読み込みを防ぐ）。

## 10. 設計上まだ決めないこと

- 参考動画のモーション転写用DSL拡張の正確なフィールド名。
- 生成先による複数フレーム補間の共通表現。
- 各プロバイダーのモデルID、無料利用枠、回復条件。
- プロンプト修正に用いるLLMの具体名。

これらは対応モデルを実際にテストしてから決める。

[設計入口](./README.md)
