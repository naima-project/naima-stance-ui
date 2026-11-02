import { assert, assertEquals } from "@std/assert";
import { buildFrame, checkVariant, comparisonPage } from "../scripts/variants.ts";
import { themeFromHash, variantFromQuery } from "../src/lib/theme/variant.ts";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const reference = `${root}/tokens/moods/white`;
const pairs = `${root}/tokens/contrast.json`;

Deno.test("a frame reads its variant from the query, and nothing that is not a plain name", () => {
  assertEquals(variantFromQuery("?tokens=b&theme=dark"), { tokens: "b", theme: "dark" });
  assertEquals(variantFromQuery("?tokens=round-1_a"), { tokens: "round-1_a" });
  assertEquals(variantFromQuery("?tokens=../x&theme=system"), {});
  assertEquals(variantFromQuery("?tokens=https://evil.example/x"), {});
  assertEquals(variantFromQuery(""), {});
});

Deno.test("the comparison page shows every variant in light and dark, with its problems", () => {
  const html = comparisonPage("Palette, round 1", [{ name: "a", problems: [] }, {
    name: "b",
    problems: ["problem [contrast] <b> (dark): too low"],
  }]);
  for (const v of ["a", "b"]) {
    for (const t of ["light", "dark"]) assert(html.includes(`src="app/variant.html?tokens=${v}&amp;theme=${t}"`));
  }
  assert(html.includes("tokens and contrast pass, light and dark"));
  assert(html.includes("1 problem: fix before choosing"));
  assert(html.includes("&lt;b&gt; (dark): too low"));
  assert(html.includes('data-theme="dark"'));
});

Deno.test("with --builds, each frame is a built app of its own", () => {
  const html = comparisonPage("Screens", [{ name: "list-first", problems: [] }], buildFrame);
  // The theme rides in the hash, which the app reads itself: Safari blocks reaching into a frame on file://.
  assert(html.includes('src="list-first/index.html#theme=light"'));
  assert(html.includes('src="list-first/index.html#theme=dark"'));
  assert(html.includes('class="dark" data-theme="dark"'));
});

Deno.test("a frame's theme is read from its hash, and only light or dark", () => {
  assertEquals(themeFromHash("#theme=dark"), "dark");
  assertEquals(themeFromHash("theme=light"), "light");
  assertEquals(themeFromHash("#theme=system"), undefined);
  assertEquals(themeFromHash(""), undefined);
});

Deno.test("no frame loads lazily, so a column out of view is not left blank", () => {
  const html = comparisonPage("Screens", [{ name: "a", problems: [] }, { name: "b", problems: [] }], buildFrame);
  assert(!html.includes('loading="lazy"'));
});

Deno.test("a variant copied from a mood board passes; one that drops a token or loses contrast does not", async () => {
  assertEquals(await checkVariant(`${root}/tokens/moods/calm`, reference, pairs), []);
  const dir = await Deno.makeTempDir();
  const v = `${dir}/bad`;
  await Deno.mkdir(v);
  for (const f of ["mood.resolver.json", "motion.tokens.json", "radius.tokens.json", "spacing.tokens.json"]) {
    await Deno.copyFile(`${root}/tokens/moods/calm/${f}`, `${v}/${f}`);
  }
  const typo = JSON.parse(await Deno.readTextFile(`${root}/tokens/moods/calm/typography.tokens.json`));
  const group = typo.font ?? typo[Object.keys(typo).find((k) => !k.startsWith("$"))!];
  delete group[Object.keys(group).find((k) => !k.startsWith("$"))!];
  await Deno.writeTextFile(`${v}/typography.tokens.json`, JSON.stringify(typo));
  for (const theme of ["light", "dark"]) {
    await Deno.mkdir(`${v}/themes/${theme}`, { recursive: true });
    await Deno.copyFile(
      `${root}/tokens/moods/calm/themes/${theme}/shadow.tokens.json`,
      `${v}/themes/${theme}/shadow.tokens.json`,
    );
    const color = JSON.parse(await Deno.readTextFile(`${root}/tokens/moods/calm/themes/${theme}/color.tokens.json`));
    if (theme === "dark") color.color.text.$value = color.color.surface.$value;
    await Deno.writeTextFile(`${v}/themes/${theme}/color.tokens.json`, JSON.stringify(color));
  }
  const problems = await checkVariant(v, reference, pairs);
  assert(problems.some((p) => p.includes("[tokens]") && p.includes("missing here")), problems.join("\n"));
  assert(problems.some((p) => p.includes("[contrast]") && p.includes("bad (dark)")), problems.join("\n"));
  assert(!problems.some((p) => p.includes("[contrast]") && p.includes("bad (light)")), problems.join("\n"));
  await Deno.remove(dir, { recursive: true });
});
