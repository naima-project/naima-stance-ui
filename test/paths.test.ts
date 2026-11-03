// Paths on every operating system. The checks name files from the app's root with forward slashes; a path of the
// operating system (C:\app\src on Windows) is made with node:path's own functions, never with posix.resolve, and a
// module's folder comes from fileURLToPath, never from a URL's pathname, which on Windows reads /C:/app.

import { assert, assertEquals } from "@std/assert";
import { fromFileUrl, join, relative } from "@std/path";
import { loadConfig } from "../checks/config.ts";
import { isChecked } from "../checks/record.ts";

const root = fromFileUrl(new URL("..", import.meta.url));

Deno.test("a file named with Windows separators counts as the same file the checks read", async () => {
  const cfg = await loadConfig(join(root, "test", "fixtures", "clean"));
  assert(isChecked(cfg, "src\\lib\\ui\\components\\Button.svelte"));
  assert(isChecked(cfg, "stance-ui.json"));
  assert(!isChecked(cfg, "README.md"));
});

Deno.test("no source builds an operating system's path with POSIX rules", async () => {
  const banned: [RegExp, string][] = [
    [/import\.meta\.url\)\.pathname/, "a module URL's pathname (use fileURLToPath or fromFileUrl)"],
    [/posix\.resolve\(/, "posix.resolve, which takes C:\\app for a relative path (use node:path's resolve)"],
  ];
  const found: string[] = [];
  const walk = async (dir: string) => {
    for await (const e of Deno.readDir(dir)) {
      const p = join(dir, e.name);
      if (e.isDirectory && !["fixtures", "node_modules"].includes(e.name)) await walk(p);
      else if (e.isFile && /\.(ts|mjs)$/.test(e.name) && e.name !== "paths.test.ts") {
        const text = await Deno.readTextFile(p);
        for (const [re, why] of banned) if (re.test(text)) found.push(`${relative(root, p)}: ${why}`);
      }
    }
  };
  for (const d of ["checks", "scripts", "plugin", "test"]) await walk(join(root, d));
  assertEquals(found, []);
});
