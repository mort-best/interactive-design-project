import { resolve } from "node:path";
import { defineConfig } from "vite";

// Use a relative base so the built assets resolve correctly regardless of the
// GitHub Pages subpath (e.g. https://user.github.io/repo/). This works for both
// project pages and user/organization pages.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    rollupOptions: {
      // 작품(index.html)과 할로윈 모델 미리보기(models.html) 두 페이지
      input: {
        main: resolve(__dirname, "index.html"),
        models: resolve(__dirname, "models.html"),
      },
    },
  },
});
