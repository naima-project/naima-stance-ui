// Shows several variants of the design side by side, live, for the owner to choose from (method/design.md).
//
//   deno task variants --from <dir> [--reference <mood board>] [--out <dir>] [--serve <port>]
//   deno task variants --builds <dir> [--serve <port>]
//
// <dir> holds one folder per variant, each a complete mood board (a copy of one, with some values changed):
// design/palette/round-1/a, .../b, and so on. For each variant this checks that it defines the same tokens as
// the reference mood board (default: the project's own, from stance-ui.json, else tokens/moods/white) and
// that both its themes pass the contrast pairs, and builds its token CSS. It builds the gallery once in the
// variants mode, and writes <out>/index.html (default <dir>/preview): every variant in a column, its light
// and dark theme one above the other, each a frame of the real gallery, with what the checks found on top.
// With --serve it serves <out> on that port (the frames need a server: a file:// page cannot load them).
//
// --builds is for variants that differ in more than tokens, such as the layouts of a screen: <dir> holds one
// folder per variant, each a built app (its index.html and assets, from vite build --outDir <dir>/<name>).
// The page, <dir>/index.html, frames each one in light and dark. Each frame's URL ends in #theme=<light|dark>,
// which the app reads with themeFromHash (src/lib/theme/variant.ts): Safari refuses a page opened from file://
// any access to its frames, so the theme cannot be set from outside. Over http the page also sets data-theme
// on each frame once it loads, for an app that does not read the hash.
// Frames load at once, never lazily: a column scrolled out of view would otherwise stay blank.
import { serveDir } from "@std/http/file-server";
import { fileURLToPath } from "node:url";
import { checkContrast, readPairs } from "../checks/contrast.ts";
import { describe, type Finding } from "../checks/finding.ts";
import { readMood } from "../checks/run.ts";
import { compareMoods, type Token } from "../checks/tokens.ts";
import { buildTokens } from "./tokens.ts";

/** One variant and what the checks found in it: problems make it unfit to choose until they are fixed. */
export interface VariantReport {
  name: string;
  problems: string[];
}

const here = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");

/** Token and contrast findings for one variant folder, against a reference mood board. */
export async function checkVariant(dir: string, reference: string, pairsFile: string): Promise<string[]> {
  const split = (p: string) => [p.slice(0, p.lastIndexOf("/")) || ".", p.slice(p.lastIndexOf("/") + 1)];
  const [vRoot, vName] = split(dir);
  const [rRoot, rName] = split(reference);
  const variant = await readMood(vRoot, vName);
  const ref = await readMood(rRoot, rName);
  const all = new Map<string, Map<string, Token>>();
  for (const [theme, tokens] of ref.themes) all.set(`reference (${theme})`, tokens);
  for (const [theme, tokens] of variant.themes) all.set(`${vName} (${theme})`, tokens);
  const findings: Finding[] = [...variant.findings, ...compareMoods(all).filter((f) => f.file?.startsWith(vName))];
  for (const theme of ["light", "dark"]) {
    if (!variant.themes.has(theme)) {
      findings.push({ check: "tokens", level: "problem", file: vName, message: `has no ${theme} theme` });
    }
  }
  const { pairs, findings: bad } = readPairs(JSON.parse(await Deno.readTextFile(pairsFile)), pairsFile);
  findings.push(...bad);
  for (const [theme, tokens] of variant.themes) findings.push(...checkContrast(`${vName} (${theme})`, tokens, pairs));
  return findings.filter((f) => f.level === "problem").map(describe);
}

const escape = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Where a frame of the gallery built in the variants mode finds one variant in one theme. */
export const galleryFrame = (name: string, theme: string) =>
  `app/variant.html?tokens=${encodeURIComponent(name)}&theme=${theme}`;

/** Where a frame finds one built app in one theme, in --builds: the theme rides in the hash. */
export const buildFrame = (name: string, theme: string) => `${encodeURIComponent(name)}/index.html#theme=${theme}`;

/** The comparison page: one column per variant, light above dark, the checks' findings on top of each. */
export function comparisonPage(
  title: string,
  variants: VariantReport[],
  src: (name: string, theme: string) => string = galleryFrame,
): string {
  const columns = variants.map((v) => {
    const status = v.problems.length
      ? `<details class="bad"><summary>${v.problems.length} problem${
        v.problems.length > 1 ? "s" : ""
      }: fix before choosing</summary><ul>${v.problems.map((p) => `<li>${escape(p)}</li>`).join("")}</ul></details>`
      : `<p class="ok">tokens and contrast pass, light and dark</p>`;
    const frame = (theme: string) =>
      `<iframe class="${theme}" data-theme="${theme}" title="variant ${escape(v.name)}, ${theme} theme" src="${
        escape(src(v.name, theme))
      }"></iframe>`;
    return `<section aria-labelledby="v-${escape(v.name)}"><h2 id="v-${escape(v.name)}">${
      escape(v.name)
    }</h2>${status}${frame("light")}${frame("dark")}</section>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
  /* The comparison page's own chrome, outside every variant: neutral, so it favours none of them. */
  :root { color-scheme: light dark; font: 15px/1.4 system-ui, sans-serif; }
  body { margin: 0; padding: 16px; background: Canvas; color: CanvasText; }
  header { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center; margin-bottom: 12px; }
  h1 { font-size: 18px; margin: 0; }
  fieldset { border: 0; padding: 0; margin: 0; display: flex; gap: 12px; }
  main { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(var(--w, 360px), 1fr); gap: 16px; overflow-x: auto; }
  section { min-width: 0; }
  h2 { font-size: 16px; margin: 0 0 4px; }
  .ok, .bad { font-size: 13px; margin: 0 0 8px; }
  .ok { color: GrayText; }
  .bad summary { color: #b00020; font-weight: 600; cursor: pointer; }
  @media (prefers-color-scheme: dark) { .bad summary { color: #ff8a80; } }
  iframe { display: block; width: 100%; height: var(--h, 70vh); border: 1px solid GrayText; border-radius: 6px; margin-bottom: 8px; }
  body[data-show="light"] iframe.dark, body[data-show="dark"] iframe.light { display: none; }
  body[data-show="both"] iframe { height: calc(var(--h, 70vh) / 2 + 8vh); }
</style>
</head>
<body data-show="both">
<header>
  <h1>${escape(title)}</h1>
  <fieldset><legend>Show</legend>
    <label><input type="radio" name="show" value="both" checked> light and dark</label>
    <label><input type="radio" name="show" value="light"> light</label>
    <label><input type="radio" name="show" value="dark"> dark</label>
  </fieldset>
  <label>Column width <select id="width">
    <option value="360px">phone</option><option value="768px">tablet</option><option value="1024px">desktop</option>
  </select></label>
</header>
<main>
${columns}
</main>
<script>
  // A frame shows its theme whatever the app remembered: the token CSS reads data-theme on the root.
  for (const f of document.querySelectorAll("iframe[data-theme]")) {
    f.addEventListener("load", () => { try { f.contentDocument.documentElement.dataset.theme = f.dataset.theme; } catch {} });
  }
  for (const r of document.querySelectorAll("input[name=show]")) r.onchange = () => document.body.dataset.show = r.value;
  document.getElementById("width").onchange = (e) => document.body.style.setProperty("--w", e.target.value);
</script>
</body>
</html>
`;
}

async function run(cmd: string[]): Promise<void> {
  const { code } = await new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    cwd: here,
    stdout: "inherit",
    stderr: "inherit",
  })
    .output();
  if (code !== 0) throw new Error(`failed (${code}): ${cmd.join(" ")}`);
}

if (import.meta.main) {
  const arg = (flag: string) => {
    const i = Deno.args.indexOf(flag);
    return i >= 0 ? Deno.args[i + 1] : undefined;
  };
  const port = arg("--serve");
  const serve = (root: string) => {
    if (!port) return;
    Deno.serve({ port: Number(port), hostname: "127.0.0.1" }, (req) => serveDir(req, { fsRoot: root, quiet: true }));
    console.log(`open http://127.0.0.1:${port}/`);
  };
  const plain = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
  const builds = arg("--builds")?.replace(/[\\/]$/, "");
  if (builds) {
    const names = [];
    for await (const e of Deno.readDir(builds)) {
      if (e.isDirectory && plain.test(e.name)) {
        if (await Deno.stat(`${builds}/${e.name}/index.html`).then(() => true, () => false)) names.push(e.name);
      }
    }
    if (names.length === 0) throw new Error(`no built app (<name>/index.html) in ${builds}`);
    const reports = names.sort().map((name) => ({ name, problems: [] }));
    await Deno.writeTextFile(`${builds}/index.html`, comparisonPage(`Variants in ${builds}`, reports, buildFrame));
    console.log(`${builds}/index.html`);
    serve(builds);
  }
  const from = arg("--from")?.replace(/[\\/]$/, "");
  if (!from) {
    if (builds) Deno.exit(0);
    console.error("usage: deno task variants --from <dir> [--reference <mood board>] [--out <dir>] [--serve <port>]");
    console.error("       deno task variants --builds <dir> [--serve <port>]");
    Deno.exit(2);
  }
  let reference = arg("--reference");
  if (!reference) {
    try {
      reference = JSON.parse(await Deno.readTextFile("stance-ui.json")).check?.tokens;
    } catch { /* no configuration here: the stance's own reference */ }
  }
  reference ??= `${here}/tokens/moods/white`;
  const pairs = (await Deno.stat("tokens/contrast.json").then(() => true, () => false))
    ? "tokens/contrast.json"
    : `${here}/tokens/contrast.json`;
  const out = (arg("--out") ?? `${from}/preview`).replace(/[\\/]$/, "");
  const outName = out.slice(out.lastIndexOf("/") + 1);
  const names = (await Array.fromAsync(Deno.readDir(from)))
    .filter((e) => e.isDirectory && e.name !== outName && plain.test(e.name))
    .map((e) => e.name).sort();
  if (names.length === 0) throw new Error(`no variant folders in ${from}`);
  const reports: VariantReport[] = [];
  for (const name of names) {
    const problems = await checkVariant(`${from}/${name}`, reference, pairs);
    if (!problems.some((p) => p.includes("[tokens]"))) {
      await buildTokens(`${from}/${name}`, `${out}/tokens/${name}.css`, `variant ${name}`);
    }
    reports.push({ name, problems });
    console.log(`${name}: ${problems.length ? `${problems.length} problem(s)` : "passes"}`);
  }
  // The gallery, built once with the reference tokens; each frame then loads its variant's.
  await buildTokens(reference, `${here}/gallery/tokens.css`, "reference");
  const absOut = await Deno.realPath(".").then((cwd) => out.startsWith("/") ? out : `${cwd}/${out}`);
  await run([
    Deno.execPath(),
    "run",
    "-A",
    "npm:vite@8.3.5",
    "build",
    `${here}/gallery`,
    "--mode",
    "variants",
    "--outDir",
    `${absOut}/app`,
    "--emptyOutDir",
    "--logLevel",
    "warn",
  ]);
  await Deno.writeTextFile(`${out}/index.html`, comparisonPage(`Variants in ${from}`, reports));
  console.log(`${out}/index.html`);
  serve(out);
}
