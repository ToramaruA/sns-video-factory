import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// The editor is a static wrapper; it never receives API keys and never runs paid AI.
export default defineConfig({
  base: process.env.PUBLIC_BASE_PATH ?? "/sns-video-factory/",
  plugins: [vue()],
  build: { outDir: "dist" },
});
