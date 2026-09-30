import { defineConfig } from "vite";

// Use a relative base so the built assets resolve correctly regardless of the
// GitHub Pages subpath (e.g. https://user.github.io/repo/). This works for both
// project pages and user/organization pages.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
  },
});
