<script setup>
import { computed, ref } from "vue";
import { BeatListEditor, defaultBeatEditors, beatsOf, withBeats } from "@mulmocast/beat-editor";
import PromptBeatEditor from "./PromptBeatEditor.vue";
import LiveGeneration from "./LiveGeneration.vue";
import starterScript from "../../docs/sns-video/examples/experimental-three-cut-onepass-narrated.json";

const ACTION_URL = "https://github.com/ToramaruA/sns-video-factory/actions/workflows/sns-video-groq-flux-three-cut-manual.yml";
const SOURCE_URL = "https://github.com/ToramaruA/sns-video-factory/blob/restart/mulmocast-upstream-free-ai/docs/sns-video/examples/experimental-three-cut-onepass-narrated.json";
const copy = (value) => JSON.parse(JSON.stringify(value));
const script = ref(copy(starterScript));
const cuts = computed(() => beatsOf(script.value));
const message = ref("");
const brief = ref("");
const pastedText = ref("");
const showPaste = ref(false);
const showRaw = ref(false);
const rawText = ref("");
const rawError = ref("");

const promptEditor = { id: "sns.image-movie-prompt", label: "映像指示", beatType: "(no image)", component: PromptBeatEditor };
const editors = [...defaultBeatEditors, promptEditor];

const setScript = (data) => {
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.beats)) {
    throw new Error("MulmoScript形式ではありません（beats配列が必要です）。");
  }
  if (data.beats.length < 1) throw new Error("カットが1つもありません。");
  script.value = copy(data);
  rawError.value = "";
  message.value = "MulmoScriptを読み込みました。";
};

const loadFile = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 500_000) throw new Error("ファイルが大きすぎます。");
    setScript(JSON.parse(await file.text()));
  } catch (error) {
    message.value = "読み込み失敗：" + String(error.message || error);
  }
  event.target.value = "";
};

const loadPasted = () => {
  try {
    setScript(JSON.parse(pastedText.value));
    pastedText.value = "";
    showPaste.value = false;
  } catch (error) {
    message.value = "貼り付けたJSONを読み込めません：" + String(error.message || error);
  }
};

const updateBeats = (next) => {
  script.value = withBeats(script.value, next);
  message.value = "";
};

const addMovieCut = () => {
  if (cuts.value.length >= 3) {
    message.value = "現在の無料Wan実験は最大3カットです。新しいカットを追加する場合は利用モデルの条件確認が必要です。";
    return;
  }
  updateBeats([...cuts.value, { text: "", speaker: "Presenter", duration: 2, imagePrompt: "", moviePrompt: "" }]);
};

const updateTitle = (event) => {
  script.value = { ...script.value, title: event.target.value };
};

const exportJson = () => JSON.stringify(script.value, null, 2) + "\n";
const copyBrief = async () => {
  if (!brief.value.trim()) {
    message.value = "まず企画の文章を入力してください。";
    return;
  }
  try {
    await navigator.clipboard.writeText(brief.value.trim());
    message.value = "企画文をコピーしました。GitHub Actionsのbrief欄に貼り、render_movie=OFFで台本を生成してください。";
  } catch {
    message.value = "企画文をコピーできませんでした。テキストを選択して手動でコピーしてください。";
  }
};
const copyJson = async () => {
  const json = exportJson();
  if (json.length > 60000) {
    message.value = "60,000文字を超えています。GitHub ActionsのJSON貼り付け入力ではなく、ファイルを保存してscript_pathを使ってください。";
    return;
  }
  try {
    await navigator.clipboard.writeText(json);
    message.value = "MulmoScriptをコピーしました。GitHub Actionsのscript_json欄に貼り付けてください。";
  } catch {
    message.value = "コピーできませんでした。JSONダウンロードを使ってください。";
  }
};
const downloadJson = () => {
  const blob = new Blob([exportJson()], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sns-edited-mulmoscript.json";
  a.click();
  URL.revokeObjectURL(url);
  message.value = "MulmoScriptを保存しました。";
};
const openRaw = () => {
  rawText.value = exportJson();
  rawError.value = "";
  showRaw.value = !showRaw.value;
};
const applyRaw = () => {
  try {
    setScript(JSON.parse(rawText.value));
    showRaw.value = false;
  } catch (error) {
    rawError.value = String(error.message || error);
  }
};
</script>

<template>
  <main class="sns-shell">
    <header class="sns-header">
      <div>
        <p class="eyebrow">SNS VIDEO FACTORY / MULMOCAST</p>
        <h1>動画の台本を編集</h1>
        <p class="subheading">公式MulmoCastのBeat Editorを利用。構成を保ったままカットを編集し、既存の無料AI制作へ渡します。</p>
      </div>
      <span class="demo-mark">ローカル編集・APIキー不要</span>
    </header>

    <section class="sns-toolbar">
      <div class="step-head">
        <strong><span class="step">0</span> 企画文から始める（任意）</strong>
        <span>既存MulmoCastのGroq無料台本生成を使用</span>
      </div>
      <textarea class="brief-input" v-model="brief" rows="3" maxlength="2000" placeholder="例：12月の室内楽コンサートを紹介する15秒の縦型SNS動画。温かく上品な雰囲気。"></textarea>
      <div class="toolbar-actions">
        <button type="button" class="action-button secondary" @click="copyBrief">企画文をコピー</button>
        <a class="plain-link" :href="ACTION_URL" target="_blank" rel="noopener noreferrer">Groqで台本を生成（GitHub Actions）</a>
      </div>
      <p class="info">GitHub Pagesでは手動のActions操作が必要です。保護されたCloudflare版では次のボタンから直接台本を生成できます。</p>
      <LiveGeneration mode="plan" :brief="brief" @loaded="setScript" />
    </section>

    <section class="sns-toolbar">
      <div class="step-head">
        <strong><span class="step">1</span> MulmoScriptを準備</strong>
        <span>最初は動作確認済みの3カット台本が開いています</span>
      </div>
      <div class="toolbar-actions">
        <label class="action-button file-button">JSONファイルを読み込む
          <input type="file" accept=".json,application/json" @change="loadFile" />
        </label>
        <button class="action-button secondary" type="button" @click="showPaste = !showPaste">JSONを貼り付ける</button>
        <a class="plain-link" :href="SOURCE_URL" target="_blank" rel="noopener noreferrer">元の台本を見る</a>
      </div>
      <div v-if="showPaste" class="paste-pane">
        <textarea v-model="pastedText" rows="5" placeholder="MulmoScriptのJSON全文を貼り付け" spellcheck="false"></textarea>
        <button class="action-button primary" type="button" @click="loadPasted">この台本を読み込む</button>
      </div>
      <label class="title-field">動画タイトル
        <input :value="script.title || ''" @input="updateTitle" />
      </label>
    </section>

    <section class="sns-workspace">
      <div class="step-head">
        <strong><span class="step">2</span> カットを編集</strong>
        <span>{{ cuts.length }}カット / 現行の試験用Wanは各2秒・最大3カット</span>
      </div>
      <p class="info">各カットの「text」はナレーションです。映像指示タブから画像の内容と動きを編集できます。画像や動画の既存素材指定は元のMulmoScriptから保持されます。</p>
      <div class="editor-zone">
        <BeatListEditor :beats="cuts" :editors="editors" @update:beats="updateBeats" />
      </div>
      <div class="bottom-actions">
        <button type="button" class="action-button secondary" @click="addMovieCut">＋ 動画カットを追加</button>
        <button type="button" class="plain-button" @click="openRaw">{{ showRaw ? "JSON直接編集を閉じる" : "JSONを直接編集（高度な設定）" }}</button>
      </div>
      <div v-if="showRaw" class="paste-pane">
        <textarea v-model="rawText" rows="14" spellcheck="false"></textarea>
        <p v-if="rawError" class="error" role="alert">{{ rawError }}</p>
        <button class="action-button primary" type="button" @click="applyRaw">JSONの変更を反映</button>
      </div>
    </section>

    <section class="sns-toolbar">
      <div class="step-head">
        <strong><span class="step">3</span> 動画生成へ</strong>
        <span>生成AIの実行とMP4の保存は既存GitHub Actionsが担当</span>
      </div>
      <div class="toolbar-actions">
        <button type="button" class="action-button primary" @click="copyJson">編集したJSONをコピー</button>
        <button type="button" class="action-button secondary" @click="downloadJson">JSONを保存</button>
        <a class="action-button github" :href="ACTION_URL" target="_blank" rel="noopener noreferrer">GitHub Actionsで動画生成</a>
      </div>
      <p class="info">GitHub Pagesで手動実行する場合は <code>script_json</code> にコピーしたJSONを貼り、<code>render_movie</code> をONにします。<code>script_path</code> は空欄です。</p>
      <LiveGeneration mode="render" :script="script" />
      <p v-if="message" class="message" role="status">{{ message }}</p>
    </section>
    <footer class="sns-footer">このページは編集のみ。台本の内容・APIキーはこの画面からサーバーに送信しません。動画素材ファイル自体のアップロードは未対応です。</footer>
  </main>
</template>
