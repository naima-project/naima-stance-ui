import { assert, assertEquals } from "@std/assert";
import * as tasks from "../demo/machines/tasks.ts";
import { buildTokens, readThemes } from "../scripts/tokens.ts";
import type { Theme as ThemeClass, ThemeChoice, ThemeOutputs, ThemePort } from "../src/lib/theme/theme.svelte.ts";
import type { AuthOutputs, AuthPort } from "../src/lib/auth/auth.svelte.ts";
import type {
  ControlOutputs,
  ControlPort,
} from "../examples/calculator/logic/generated/typescript/control/control.svelte.ts";
import { compileModule } from "svelte/compiler";
import typescript from "typescript";
import { fromFileUrl, join, toFileUrl } from "@std/path";

const root = fromFileUrl(new URL("..", import.meta.url)).replace(/[\\/]$/, "");

Deno.test("every mood board builds to the same custom properties, with a dark theme and reduced motion", async () => {
  const dir = await Deno.makeTempDir();
  const names: string[][] = [];
  for (const mood of ["white", "dusk", "calm"]) {
    const css = await Deno.readTextFile(await buildTokens(`${root}/tokens/moods/${mood}`, `${dir}/${mood}.css`));
    assert(!/NaN|undefined|\[object/.test(css), css);
    for (
      const block of [
        "color-scheme: light dark;",
        '@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n    --color-',
        ':root[data-theme="dark"] {\n  color-scheme: dark;\n  --color-',
        "@media (prefers-reduced-motion: reduce) {\n  :root {\n    --motion-duration-fast: 0s;",
      ]
    ) assert(css.includes(block), `${mood}: ${block}`);
    const base = css.slice(css.indexOf(":root {"), css.indexOf("}"));
    names.push([...base.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]).sort());
  }
  assert(names[0].length > 40);
  assertEquals(names[0], names[1]);
  assertEquals(names[0], names[2]);
  await Deno.remove(dir, { recursive: true });
});

Deno.test("a resolver without a dark theme, or with a file that is not there, is refused", async () => {
  const dir = await Deno.makeTempDir();
  await Deno.writeTextFile(
    `${dir}/m.resolver.json`,
    JSON.stringify({
      version: "2025.10",
      sets: { base: { sources: [{ $ref: "base.tokens.json" }] } },
      modifiers: { theme: { contexts: { light: [{ $ref: "light.tokens.json" }] } } },
      resolutionOrder: [{ $ref: "#/sets/base" }, { $ref: "#/modifiers/theme" }],
    }),
  );
  const { errors } = await readThemes(dir);
  assert(errors.includes('no "dark" theme'), errors.join("; "));
  assert(errors.some((e) => e.includes("base.tokens.json is not a file of the mood board")), errors.join("; "));
  await Deno.remove(dir, { recursive: true });
});

Deno.test("the theme is chosen only through its transition, and its outputs show each choice", async () => {
  // The machine is a .svelte.ts module: its types stripped by TypeScript and its runes compiled by Svelte,
  // as a bundler would, then run.
  const ts = await Deno.readTextFile(`${root}/src/lib/theme/theme.svelte.ts`);
  const plain = typescript.transpileModule(ts, {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.ESNext },
  }).outputText;
  const js = compileModule(plain, {
    generate: "client",
    filename: "theme.svelte.js",
  }).js.code;
  const dir = await Deno.makeTempDir({ dir: root });
  await Deno.writeTextFile(`${dir}/theme.js`, js);
  const { Theme } = (await import(toFileUrl(join(dir, "theme.js")).href)) as { Theme: typeof ThemeClass };
  await Deno.remove(dir, { recursive: true });
  const shown: string[] = [];
  const theme = new Theme({ initial: "dark" }, { apply: (c) => shown.push(c) });
  assertEquals(theme.view.choice, "dark");
  assertEquals(theme.choose("dark"), false);
  assertEquals(theme.choose("system"), true);
  assertEquals(theme.allowed({ type: "choose", choice: "sepia" as ThemeChoice }), false);
  assertEquals(shown, ["dark", "system"]);
});

Deno.test("the old port names of a machine's outputs still type-check, deprecated, for one more release", () => {
  // Type checking is the test: each old name must be the same type as the new one, both ways.
  const theme: ThemeOutputs = { apply() {} };
  const oldTheme: ThemePort = theme;
  const auth: AuthOutputs = { password: () => Promise.resolve({ result: "signed-in" }), code: () => Promise.reject() };
  const oldAuth: AuthPort = auth;
  const control = {} as ControlOutputs;
  const oldControl: ControlPort = control;
  const back: [ThemeOutputs, AuthOutputs, ControlOutputs] = [oldTheme, oldAuth, oldControl];
  assertEquals(back, [theme, auth, control]);
});

Deno.test("the tasks machine removes a task only after a confirmation", () => {
  let s = tasks.initial({ limit: 2 }).state;
  const go = (e: tasks.Event) => {
    const r = tasks.step(s, e);
    assert(r, `refused: ${JSON.stringify(e)}`);
    s = r.state;
    return r.actions;
  };
  assertEquals(go({ type: "add", title: " one " }), [{ type: "save", tasks: [{ id: 1, title: "one", done: false }] }]);
  go({ type: "add", title: "two" });
  assertEquals(tasks.step(s, { type: "add", title: "three" }), null); // the limit
  assertEquals(go({ type: "askRemove", id: 1 }), []);
  assertEquals(tasks.step(s, { type: "toggle", id: 2 }), null); // nothing else while confirming
  go({ type: "cancel" });
  assertEquals(s.tasks.length, 2);
  go({ type: "askRemove", id: 1 });
  go({ type: "confirm" });
  assertEquals(s.tasks.map((t) => t.title), ["two"]);
});

Deno.test("the demo builds", async () => {
  const out = await new Deno.Command(Deno.execPath(), {
    args: ["task", "demo:build"],
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  })
    .output();
  assertEquals(out.code, 0, new TextDecoder().decode(out.stderr));
  const html = await Deno.readTextFile(`${root}/demo/dist/index.html`);
  assert(html.includes('<script type="module"'));
});
