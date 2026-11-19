<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import { unzipSync } from "fflate";

const props = defineProps({
  mode: { type: String, required: true },
  brief: { type: String, default: "" },
  script: { type: Object, default: null },
});
const emit = defineEmits(["loaded"]);
const enabled = ref(false);
const busy = ref(false);
const message = ref("");
const runUrl = ref("");
const runId = ref(null);
const videoUrl = ref("");
const groqConsent = ref(false);
const cloudflareConsent = ref(false);
const geminiConsent = ref(false);
const wanConsent = ref(false);
const uploadConsent = ref(false);
let pollTimer = null;
let polling = false;

onMounted(async () => {
  try {
    const r = await fetch("/api/health", { credentials: "same-origin", cache: "no-store" });
    enabled.value = r.ok && (await r.json()).ready === true;
  } catch {
    enabled.value = false; // GitHub Pages remains manual; do not expose GitHub credentials.
  }
});
onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value);
});

const getJson = async (path, options = {}) => {
  const r = await fetch(path, { ...options, credentials: "same-origin", cache: "no-store" });
  const value = await r.json();
  if (!r.ok) throw new Error(value.error || "API error: " + r.status);
  return value;
};
const fetchResult = async (id) => {
  const data = await getJson("/api/runs/" + id + "/artifacts");
  const wanted = props.mode === "plan" ? "free-groq-mulmoscript" : "free-groq-full-mulmocast-video";
  const artifact = (data.artifacts || []).find(a => a.name === wanted);
  if (!artifact) throw new Error("GitHub Actionsの成果物が見つかりません。実行結果を開いて確認してください。");
  if (artifact.size > 100 * 1024 * 1024) throw new Error("成果物が大きすぎます。GitHub Actionsから取得してください。");
  const r = await fetch("/api/runs/" + id + "/artifacts/" + artifact.id + "/zip", { credentials: "same-origin" });
  if (!r.ok) throw new Error("成果物のダウンロードに失敗しました（HTTP " + r.status + "）");
  const zipData = new Uint8Array(await r.arrayBuffer());
  const ext = props.mode === "plan" ? ".json" : ".mp4";
  const entries = unzipSync(zipData, { filter: file => file.name.toLowerCase().endsWith(ext) });
  const bytes = Object.entries(entries).find(([name]) => name.toLowerCase().endsWith(ext))?.[1];
  if (!bytes) throw new Error("成果物に" + ext + "が見つかりません。");
  if (props.mode === "plan") {
    const result = JSON.parse(new TextDecoder().decode(bytes));
    emit("loaded", result);
    message.value = "AI台本を読み込みました。カットを編集してください。";
  } else {
    if (videoUrl.value) URL.revokeObjectURL(videoUrl.value);
    videoUrl.value = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
    message.value = "MP4完成。下で再生・ダウンロードできます。";
  }
};
const poll = async () => {
  if (!runId.value || polling) return;
  polling = true;
  try {
    const result = await getJson("/api/runs/" + runId.value);
    runUrl.value = result.url || runUrl.value;
    if (result.status !== "completed") {
      message.value = "GitHub Actionsで処理中：" + result.status;
    } else {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      if (result.conclusion !== "success") {
        message.value = "生成が完了しませんでした（" + result.conclusion + "）。実行結果のログを確認してください。";
      } else {
        message.value = "完成した成果物を読み込み中…";
        await fetchResult(runId.value);
      }
      busy.value = false;
    }
  } catch (err) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    busy.value = false;
    message.value = "取得エラー：" + (err.message || err);
  } finally {
    polling = false;
  }
};
const start = async () => {
  if (busy.value) return;
  const consent = props.mode === "plan" ?
    { groq: groqConsent.value } :
    { cloudflare: cloudflareConsent.value, gemini: geminiConsent.value,
      wan: wanConsent.value, upload: uploadConsent.value };
  if (props.mode === "plan" && !consent.groq) { message.value = "Groq Free Planを確認してください。"; return; }
  if (props.mode === "render" && !Object.values(consent).every(Boolean)) {
    message.value = "無料枠・Wan試験利用・第三者アップロードへの確認が必要です。"; return;
  }
  busy.value = true;
  message.value = "GitHub Actionsに送信中…";
  if (videoUrl.value) { URL.revokeObjectURL(videoUrl.value); videoUrl.value = ""; }
  try {
    const body = props.mode === "plan" ?
      { mode: "plan", brief: props.brief, consent } :
      { mode: "render", script: props.script, consent };
    const reply = await getJson("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    runId.value = reply.run_id;
    runUrl.value = reply.url;
    message.value = "実行を受け付けました。";
    await poll();
    if (busy.value) pollTimer = setInterval(poll, 7000);
  } catch (err) {
    busy.value = false;
    message.value = "実行エラー：" + (err.message || err);
  }
};
</script>

<template>
  <div v-if="enabled" class="live-generation">
    <div v-if="mode === 'plan'">
      <label class="live-consent">
        <input type="checkbox" v-model="groqConsent" />
        <span>Groqの利用アカウントがFree Planであることを確認し、今回の台本生成を許可する</span>
      </label>
      <button type="button" class="action-button primary" :disabled="busy" @click="start">
        {{ busy ? '台本を生成中…' : 'AIで台本を生成する' }}
      </button>
    </div>
    <div v-else>
      <p class="live-warning">試験用Wanは3カット・各2秒のみ。第三者の公開デモを使うため、SNS宣伝・継続運用の利用条件は未確定です。</p>
      <label class="live-consent"><input type="checkbox" v-model="cloudflareConsent" /><span>Cloudflare Workers AIがFree Planであると確認した</span></label>
      <label class="live-consent"><input type="checkbox" v-model="geminiConsent" /><span>Gemini APIプロジェクトがFree Tierであると確認した</span></label>
      <label class="live-consent"><input type="checkbox" v-model="wanConsent" /><span>Wan ZeroGPUを試作用途に限って使用し、本番利用可とはみなさない</span></label>
      <label class="live-consent"><input type="checkbox" v-model="uploadConsent" /><span>生成した画像3枚をHugging Faceの第三者公開デモへ送信することに同意する</span></label>
      <button type="button" class="action-button primary" :disabled="busy" @click="start">
        {{ busy ? '動画を生成中…' : '動画を生成して確認する' }}
      </button>
    </div>
    <p v-if="message" class="message" role="status">{{ message }}</p>
    <p v-if="runUrl" class="live-link"><a :href="runUrl" target="_blank" rel="noopener noreferrer">GitHub Actionsの実行ログを見る</a></p>
    <div v-if="videoUrl" class="live-preview">
      <video :src="videoUrl" controls playsinline preload="metadata"></video>
      <a :href="videoUrl" class="action-button secondary" download="sns-video.mp4">完成MP4をダウンロード</a>
    </div>
  </div>
</template>
