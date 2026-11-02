import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// --mode variants builds variant.html, the page each frame of a comparison opens (scripts/variants.ts);
// every other build is the gallery itself, which never loads other tokens.
export default defineConfig(({ mode }) => ({
  root: import.meta.dirname,
  base: "./",
  plugins: [svelte()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: `${import.meta.dirname}/${mode === "variants" ? "variant" : "index"}.html`,
    },
  },
  server: { fs: { allow: [".."] } },
}));
