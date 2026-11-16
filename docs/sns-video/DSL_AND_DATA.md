# MulmoScriptを唯一の制作データとして使う

**基準:** 既存MulmoCastのMulmoScript v1.1。スキーマは`src/types/schema.ts`、検証は`src/methods/mulmo_script.ts`を再利用。SNS動画専用の別の脚本DSLは作らない。

## 企画から動画への最短経路

1. 企画文（通常の日本語・外部AIからの貼り付け）を既存GraphAIに渡す。
2. 既存のスキーマで検証されたMulmoScriptを生成/修正する。
3. ユーザーが企画を確認し「生成開始」する。
4. 許可済み無料APIの事前検査後に、既存のMulmoCastで画像→動画→最終MP4まで**連続実行**する。

以下は**構造説明用の例**であり、無料AIの設定がないまま実行してよいスクリプトではない。MulmoCast既定の画像生成等は有料の可能性がある。

```json
{
  "$mulmocast": { "version": "1.1" },
  "title": "コンサート宣伝",
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
      "duration": 2,
      "imagePrompt": "暗い舞台に一筋のスポットライト、縦型構図",
      "moviePrompt": "ライトが徐々に明るくなり、カメラがゆっくり前進する"
    },
    {
      "id": "shot_02",
      "text": "",
      "duration": 2,
      "imagePrompt": "演奏中のピアノとヴァイオリンを印象的な光で描く",
      "moviePrompt": "弓が動き、カメラが緩やかに横移動する"
    }
  ]
}
```

- `beats`: 各カット。`id`は固定の識別子。
- `imagePrompt`: 画像生成指示。`moviePrompt`: 画像から動画を生成する動作指示。
- `duration`: 目標秒数。モデルがその秒数を無料で生成できるかは別途確認する。
- `audioParams.suppressSpeech`: ナレーション（TTS）の抑止。字幕・BGMは必要な場合に既存MulmoCastの機能で追加する。

## スクリプトに保存しない情報

無料枠の残量、ジョブ状態、APIキー、ユーザー権限等の**運用情報**はMulmoScriptへ追加しない。実際に必要になった段階で別管理する。元スキーマは未知プロパティを拒否するため、独自の項目を直接混ぜない。

**参考画像・ロゴ・既存動画:** MulmoCastの既存の参照・ローカル素材の仕組みを優先使用。`docs/image.md`・`docs/movie_reference_images.md`を参照。**既存MP4の取り込み**と**参考動画の動きを生成AIへ転写すること**は別機能。

将来のカットごとの承認・一部分だけの再生成は、必要になった場合に[PR #7](https://github.com/ToramaruA/sns-video-factory/pull/7)を参考に設計する。現行MVPにはそのための独自状態データや中間承認は置かない。

[計画](./IMPLEMENTATION_PLAN.md) | [構成](./ARCHITECTURE.md)
