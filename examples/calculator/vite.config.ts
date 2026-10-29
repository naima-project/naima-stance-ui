import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";

// The built page opens straight from disk (file://), where browsers refuse module scripts: the bundle is
// one classic script, loaded with defer.
const classicScript: Plugin = {
  name: "classic-script",
  apply: "build",
  transformIndexHtml: {
    order: "post",
    handler: (html) => html.replace(/<script type="module" crossorigin src=/g, "<script defer src="),
  },
};

export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  plugins: [svelte(), classicScript],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: { output: { format: "iife", inlineDynamicImports: true } },
  },
  server: { fs: { allow: ["../.."] } },
});
