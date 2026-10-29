// Runs every check of the stance on a project and returns what they found.

import { posix } from "node:path";
import { loadConfig, type StanceConfig } from "./config.ts";
import type { Finding } from "./finding.ts";
import { checkImports } from "./imports.ts";
import { checkLiterals } from "./literals.ts";
import { AUTH_COMPONENT, checkPrimitives, DRAG_PRIMITIVE } from "./primitives.ts";
import { readThemes } from "../scripts/tokens.ts";
import { BROWSER_CHECKS, type BrowserCheck, browserChecks } from "./browser.ts";
import { checkContrast, readPairs } from "./contrast.ts";
import { compareMoods, cssName, readNamedFiles, type Token, validate } from "./tokens.ts";

export const CHECKS = [
  "tokens",
  "contrast",
  "no-raw-literals",
  "component-imports",
  "svelte-check",
  "no-raw-drag",
  "auth-only",
  ...BROWSER_CHECKS,
] as const;
export type CheckName = typeof CHECKS[number];

const norm = (p: string) => posix.normalize(p).replace(/\/+$/, "");

async function svelteFiles(root: string, dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (rel: string) => {
    let entries: Deno.DirEntry[];
    try {
      entries = await Array.fromAsync(Deno.readDir(`${root}/${rel}`));
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
      const path = `${rel}/${e.name}`;
      if (e.isDirectory) await walk(path);
      else if (e.isFile && e.name.endsWith(".svelte")) out.push(path);
    }
  };
  await walk(norm(dir));
  return out.sort();
}

/** Every theme of the mood board in `label`, its tokens validated, and the findings about it. */
async function readMood(
  root: string,
  label: string,
): Promise<{ themes: Map<string, Map<string, Token>>; findings: Finding[] }> {
  const dir = `${root}/${label}`;
  const findings: Finding[] = [];
  const themes = new Map<string, Map<string, Token>>();
  let resolved;
  try {
    resolved = await readThemes(dir);
  } catch {
    return {
      themes,
      findings: [{ check: "tokens", level: "problem", file: label, message: "no such folder of tokens" }],
    };
  }
  for (const e of resolved.errors) {
    findings.push({ check: "tokens", level: "problem", file: `${label}/${resolved.resolver ?? ""}`, message: e });
  }
  for (const theme of resolved.themes) {
    if (theme.files.length === 0) {
      findings.push({ check: "tokens", level: "problem", file: label, message: "holds no *.tokens.json file" });
    }
    const read = await readNamedFiles(dir, label, theme.files);
    const v = validate(read.files);
    findings.push(...read.findings, ...v.findings);
    themes.set(theme.name, v.tokens);
  }
  // A file shared by every theme is validated once per theme: say each thing once.
  const seen = new Set<string>();
  return { themes, findings: findings.filter((f) => !seen.has(JSON.stringify(f)) && !!seen.add(JSON.stringify(f))) };
}

const themed = (label: string, theme: string) => theme === "default" ? label : `${label} (${theme})`;

/** The token and contrast checks, and the token names components may use. */
async function tokenCheck(
  root: string,
  cfg: StanceConfig,
): Promise<{ findings: Finding[]; contrast: Finding[]; names: Set<string> }> {
  const own = norm(cfg.tokens);
  const moods = new Map<string, Map<string, Map<string, Token>>>();
  const findings: Finding[] = [];
  const project = await readMood(root, own);
  findings.push(...project.findings);
  moods.set(own, project.themes);
  if (cfg.moods) {
    const names = (await Array.fromAsync(Deno.readDir(`${root}/${cfg.moods}`))).filter((e) => e.isDirectory).map((e) =>
      e.name
    ).sort();
    for (const mood of names) {
      const label = `${norm(cfg.moods)}/${mood}`;
      if (label === own) continue;
      const m = await readMood(root, label);
      findings.push(...m.findings);
      moods.set(label, m.themes);
    }
  }
  // Every theme of every mood board defines the same tokens: they are interchangeable.
  const all = new Map<string, Map<string, Token>>();
  for (const [label, themes] of [...moods].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const [theme, tokens] of themes) all.set(themed(label, theme), tokens);
  }
  findings.push(...compareMoods(all));

  const contrast: Finding[] = [];
  const file = norm(cfg.contrast);
  let json: unknown;
  try {
    json = JSON.parse(await Deno.readTextFile(`${root}/${file}`));
  } catch (e) {
    contrast.push({ check: "contrast", level: "problem", file, message: `no contrast pairs: ${(e as Error).message}` });
  }
  if (json !== undefined) {
    const { pairs, findings: bad } = readPairs(json, file);
    contrast.push(...bad);
    for (const [label, tokens] of all) contrast.push(...checkContrast(label, tokens, pairs));
  }
  const names = new Set<string>();
  for (const tokens of project.themes.values()) for (const k of tokens.keys()) names.add(cssName(k));
  return { findings, contrast, names };
}

/** svelte-check on the project: its type errors are problems, its warnings notes. */
async function svelteCheck(root: string, tsconfig: string): Promise<Finding[]> {
  // The project's own svelte-check if it has one, else the stance's; run by Deno, so that no particular Node
  // is needed.
  const stance = new URL("..", import.meta.url).pathname;
  const args = ["--tsconfig", `${root}/${tsconfig}`, "--output", "machine", "--workspace", root];
  let bin: string | null = null;
  for (const dir of [root, stance]) {
    try {
      await Deno.stat(`${dir}/node_modules/svelte-check/bin/svelte-check`);
      bin = `${dir}/node_modules/svelte-check/bin/svelte-check`;
      break;
    } catch {
      // not installed there
    }
  }
  if (!bin) {
    return [{
      check: "svelte-check",
      level: "problem",
      message: "svelte-check is not installed: run deno install (or npm install) in the project",
    }];
  }
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", bin, ...args],
    // Deno resolves svelte-check's own packages from the folder it runs in: the one that installed it.
    cwd: bin.startsWith(stance) ? stance : root,
    env: { NO_COLOR: "1" },
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  const text = new TextDecoder().decode(out.stdout);
  const findings: Finding[] = [];
  for (const line of text.split("\n")) {
    const m = /^\d+ (ERROR|WARNING) "([^"]+)" (\d+):\d+ "(.*)"$/.exec(line.trim());
    if (m) {
      findings.push({
        check: "svelte-check",
        level: m[1] === "ERROR" ? "problem" : "note",
        line: Number(m[3]),
        message: JSON.parse(`"${m[4]}"`),
        file: posix.relative(root, posix.resolve(root, m[2])),
      });
    }
  }
  if (out.code !== 0 && !findings.some((f) => f.level === "problem")) {
    findings.push({
      check: "svelte-check",
      level: "problem",
      message: `exited with ${out.code}: ${
        new TextDecoder().decode(out.stderr).trim().split("\n").slice(-3).join(" ")
      }`,
    });
  }
  return findings;
}

/** Every finding of the chosen checks on the project at `root`. */
export async function runChecks(dir: string, only: readonly CheckName[] = CHECKS): Promise<Finding[]> {
  const root = posix.resolve(dir);
  const cfg = await loadConfig(root);
  const findings: Finding[] = [];
  const { findings: tokenFindings, contrast, names } = await tokenCheck(root, cfg);
  if (only.includes("tokens")) findings.push(...tokenFindings);
  if (only.includes("contrast")) findings.push(...contrast);
  const widgetDirs = cfg.widgets.map(norm);
  const stores = new Set(cfg.store.map((s) => norm(s).replace(/\.(ts|js)$/, "")));
  const inWidgets = (f: string) => widgetDirs.some((d) => f.startsWith(d + "/"));
  const files = new Set<string>();
  for (const dir of [...cfg.widgets, ...cfg.components]) for (const f of await svelteFiles(root, dir)) files.add(f);
  for (const file of [...files].sort()) {
    const source = await Deno.readTextFile(`${root}/${file}`);
    if (only.includes("no-raw-literals")) findings.push(...checkLiterals(file, source, names));
    if (only.includes("no-raw-drag") || only.includes("auth-only")) {
      const base = posix.basename(file);
      const found = checkPrimitives(file, source, {
        drag: inWidgets(file) && base === DRAG_PRIMITIVE,
        auth: inWidgets(file) && base === AUTH_COMPONENT,
      });
      if (only.includes("no-raw-drag")) findings.push(...found.drag);
      if (only.includes("auth-only")) findings.push(...found.auth);
    }
    if (only.includes("component-imports")) {
      findings.push(...checkImports(file, source, {
        widget: inWidgets(file),
        isStore: (r) => stores.has(r.replace(/\.(ts|js)$/, "")),
        isWidgetIndex: (r) =>
          widgetDirs.some((d) => r === d || /^index\.(ts|js)$/.test(r.slice(d.length + 1)) && r.startsWith(d + "/")),
        packages: cfg.allowImports,
      }));
    }
  }
  if (only.includes("svelte-check") && cfg.tsconfig) findings.push(...await svelteCheck(root, cfg.tsconfig));
  const browser = only.filter((c): c is BrowserCheck => (BROWSER_CHECKS as readonly string[]).includes(c));
  findings.push(...await browserChecks(root, cfg.pages, browser));
  return findings;
}
