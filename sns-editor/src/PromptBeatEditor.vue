<script setup>
const props = defineProps({
  beat: { type: Object, required: true },
});
const emit = defineEmits(["update"]);
const change = (key, event) => emit("update", { ...props.beat, [key]: event.target.value });
</script>

<template>
  <div class="sns-prompt-fields">
    <label>
      画像の指示（imagePrompt）
      <textarea
        rows="5"
        :value="typeof beat.imagePrompt === 'string' ? beat.imagePrompt : ''"
        @input="change('imagePrompt', $event)"
      ></textarea>
    </label>
    <label>
      動画の動き（moviePrompt）
      <textarea
        rows="5"
        :value="typeof beat.moviePrompt === 'string' ? beat.moviePrompt : ''"
        @input="change('moviePrompt', $event)"
      ></textarea>
    </label>
    <label>
      話者（speaker）
      <input
        :value="typeof beat.speaker === 'string' ? beat.speaker : ''"
        @input="change('speaker', $event)"
      />
    </label>
    <p class="hint">現在の無料Wan実験は1カット2秒、最大3カットです。元のdurationを勝手に変更しません。</p>
  </div>
</template>
