import { assert, assertEquals } from "@std/assert";
import { runChecks } from "../checks/run.ts";

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url).pathname;
const problems = async (name: string, only?: Parameters<typeof runChecks>[1]) =>
  (await runChecks(fixture(name), only)).filter((f) => f.level === "problem");
const has = (fs: { check: string; file?: string; message: string }[], check: string, text: string) =>
  assert(
    fs.some((f) => f.check === check && `${f.file}: ${f.message}`.includes(text)),
    `expected ${check}: ${text}\n${JSON.stringify(fs, null, 1)}`,
  );

Deno.test("a clean project passes every check", async () => {
  assertEquals(await problems("clean"), []);
});

Deno.test("raw colours, sizes, durations and unknown tokens are refused", async () => {
  const fs = await problems("violating", ["no-raw-literals"]);
  for (
    const text of [
      "colour literal #fff",
      "colour literal rgb(0 0 0 / 0.5)",
      "size literal 12px",
      "var(--radius-nope) is not a token",
      "size literal 8px", // a var() fallback is a literal too
      "duration literal 200ms",
      "colour literal red", // in a style="" attribute
      "size literal 4px",
      "fill: colour literal #000000", // an SVG paint attribute
      "size literal 1rem", // a style: directive
    ]
  ) has(fs, "no-raw-literals", text);
  assertEquals(fs.length, 10);
});

Deno.test("components import no app logic; widgets do not even read the store", async () => {
  const fs = await problems("violating", ["component-imports"]);
  has(fs, "component-imports", 'src/App.svelte: imports "./machines/counter.svelte.ts": is app logic');
  has(fs, "component-imports", 'imports "date-fns"');
  has(fs, "component-imports", 'Greedy.svelte: imports "../store/store.svelte.ts": a widget of the set is generic');
  assertEquals(fs.length, 4); // the static import, the package, the dynamic import(), the widget
});

Deno.test("tokens are checked against the DTCG format, and mood boards against each other", async () => {
  const fs = await problems("violating", ["tokens"]);
  for (
    const text of [
      'unknown $type "speed"',
      "bad.name: a name must not contain",
      "color.text: has no $type",
      "color.accent: a color is an object",
      "refers to {color.missing}, which is not a token",
      "aliases form a cycle",
      'space.md: a dimension is { value: number, unit: "px" | "rem" }',
      "space.lg: a dimension",
      "moods/b: color.only-a: defined by moods/a, missing here",
    ]
  ) has(fs, "tokens", text);
});

Deno.test("a write to the store around its transitions fails the type check", async () => {
  const fs = await problems("types", ["svelte-check"]);
  has(fs, "svelte-check", "src/Writer.svelte: Cannot assign to 'on' because it is a read-only property");
  has(fs, "svelte-check", "src/Writer.svelte: Cannot assign to 'toggle' because it is a read-only property");
  assertEquals(fs.length, 2);
});

Deno.test("this repository holds to its own stance", async () => {
  const fs = await runChecks(new URL("..", import.meta.url).pathname);
  assertEquals(fs.filter((f) => f.level === "problem"), []);
});
