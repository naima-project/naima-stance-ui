import { assert, assertEquals } from "@std/assert";
import { runChecks } from "../checks/run.ts";
import { ICON_SETS, iconSource } from "../checks/icons.ts";
import { fromFileUrl } from "@std/path";

const fixture = (name: string) => fromFileUrl(new URL(`./fixtures/${name}`, import.meta.url));
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
  const fs = await runChecks(fromFileUrl(new URL("..", import.meta.url)));
  assertEquals(fs.filter((f) => f.level === "problem"), []);
});

Deno.test("every colour pair is checked in every theme: one below its minimum is refused", async () => {
  const fs = await problems("inaccessible", ["contrast"]);
  has(fs, "contrast", "tokens (dark): color.text on color.surface: 2.");
  has(fs, "contrast", "below 4.5:1 for text");
  has(fs, "contrast", "tokens (dark): color.focus on color.surface");
  has(fs, "contrast", "below 3:1 for a control or a focus ring");
  assertEquals(fs.length, 2);
});

Deno.test("an inaccessible page fails axe at WCAG 2.2 AA, the keyboard walk and reflow, in both themes", async () => {
  const fs = await problems("inaccessible", ["a11y"]);
  for (
    const text of [
      "html-has-lang",
      "color-contrast",
      "label: Form elements must have labels",
      'button "Moves" shows no focus ring when focused',
      "at 320 CSS px wide the page scrolls sideways",
    ]
  ) has(fs, "a11y", text);
  assert(fs.some((f) => f.message.includes("light, desktop") && f.message.includes("dark, phone")));
});

Deno.test("targets under 24 by 24 CSS px next to each other are refused", async () => {
  const fs = await problems("inaccessible", ["target-size"]);
  has(fs, "target-size", 'button "a" is 16×16 CSS px, too close to other targets');
  has(fs, "target-size", 'button "b" is 16×16 CSS px');
});

Deno.test("a transition that ignores reduced motion is refused", async () => {
  const fs = await problems("inaccessible", ["reduced-motion"]);
  has(fs, "reduced-motion", 'button "Moves" has a transition of 0.2s');
  assertEquals(fs.length, 1);
});

Deno.test("a project with no pages to open fails the browser checks rather than passing them", async () => {
  const fs = await problems("violating", ["a11y", "target-size", "reduced-motion"]);
  assertEquals(fs.map((f) => f.check).sort(), ["a11y", "reduced-motion", "target-size"]);
  has(fs, "a11y", "no pages to open");
});

Deno.test("dragging outside the drag primitive is refused, in the markup and in the scripts", async () => {
  const fs = await problems("violating", ["no-raw-drag"]);
  for (
    const text of [
      "Dragging.svelte: listens to touchmove",
      "Dragging.svelte: handles dragstart", // el.ondragstart = …
      "Dragging.svelte: captures the pointer",
      "Dragging.svelte: handles pointermove",
      "Dragging.svelte: is draggable (HTML5 drag and drop)",
      "Dragging.svelte: handles mousemove", // on:mousemove
      "Dragging.svelte: handles drop",
    ]
  ) has(fs, "no-raw-drag", text);
  assertEquals(fs.length, 7); // draggable="false" and a pointerdown alone are not dragging
  assert(fs.every((f) => f.message.includes("SC 2.5.7")));
});

Deno.test("a password or a one-time code asked for outside the sign-in component is refused", async () => {
  const fs = await problems("violating", ["auth-only"]);
  for (
    const text of [
      'forms/SignIn.svelte: asks for a password (type="password")',
      'asks for a secret (autocomplete="one-time-code")',
      'asks for a secret (autocomplete="new-password")',
      "forms/SignIn.svelte: makes a password field",
    ]
  ) has(fs, "auth-only", text);
  // type="password", the one in an expression, the one on a component, the code, the new password, the script's
  assertEquals(fs.length, 6);
  assert(fs.every((f) => f.message.includes("SC 3.3.8")));
});

Deno.test("the widget set's Draggable and Auth are the ones allowed to drag and to ask for secrets", async () => {
  assertEquals(await problems("clean", ["no-raw-drag", "auth-only"]), []);
});

Deno.test("an icon from outside the chosen set is refused: another library, an icon font, an SVG file or inline SVG", async () => {
  const fs = await problems("icons", ["icons"]);
  for (
    const text of [
      'Bad.svelte: imports "phosphor-svelte", an icon of Phosphor, which is not the chosen set',
      'imports "@tabler/icons-svelte", an icon of Tabler Icons',
      'imports "@iconify/svelte", an icon library that is not a predefined set',
      'imports "@fortawesome/svelte-fontawesome", an icon library',
      'imports "./logo.svg?raw", an SVG file as an icon',
      "an <svg> written in a string",
      "an inline <svg> drawn by hand",
      "uses the icon font of Material Symbols",
      "uses Font Awesome",
      "uses Bootstrap Icons",
    ]
  ) has(fs, "icons", text);
  assertEquals(fs.length, 10, JSON.stringify(fs, null, 1)); // Good.svelte and the chart listed as a drawing pass
  assert(
    fs.every((f) =>
      f.file === "src/Bad.svelte" && f.message.endsWith("use an icon of Lucide, the set chosen in check.icons")
    ),
  );
  // The chosen set's package is no app logic to the import check, and the other libraries are the icons check's.
  const imports = await problems("icons", ["component-imports"]);
  assertEquals(imports.map((f) => f.message), [
    'imports "./logo.svg?raw": is app logic: a component reads the store\'s view and calls its transitions (useStore), and imports anything else only as a type',
  ]);
});

Deno.test("before a set is chosen any icon is refused, and a set that is not predefined is refused", async () => {
  const fs = await problems("icons-unchosen", ["icons"]);
  has(
    fs,
    "icons",
    'stance-ui.json: check.icons names "feather", which is not one of the predefined icon sets: lucide, phosphor',
  );
  has(
    fs,
    "icons",
    'Early.svelte: imports "@lucide/svelte", an icon of Lucide, which is not the chosen set: no icon set is chosen',
  );
  assertEquals(fs.length, 2);
  assertEquals(await problems("clean", ["icons"]), [], "no set chosen yet, and its one SVG is listed as a drawing");
});

Deno.test("the predefined icon sets: each one's packages are its own, and the method offers exactly these", async () => {
  for (const set of ICON_SETS) {
    for (const p of set.packages) assertEquals(iconSource(p.replace(/\*$/, "svg-400")), set, p);
    assert(set.licence && set.style && set.icons && set.homepage.startsWith("https://"), set.id);
  }
  assertEquals(iconSource("@lucide/svelte/icons/search"), ICON_SETS[0]);
  assertEquals(iconSource("lucide-static"), "other", "a set's SVG files are for the design rounds, not components");
  assertEquals(iconSource("svelte"), null);
  assertEquals(iconSource("date-fns"), null);
  const method = await Deno.readTextFile(new URL("../method/design.md", import.meta.url));
  for (const set of ICON_SETS) {
    assert(method.includes(`${set.name} (\`${set.id}\`)`), `method/design.md offers ${set.id}`);
    for (const p of set.packages.filter((p) => !p.endsWith("*"))) assert(method.includes(`\`${p}\``), p);
  }
});
