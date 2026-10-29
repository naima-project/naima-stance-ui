// Runs every check of the stance on a project and returns what they found.

import { posix } from "node:path";
import { loadConfig, type StanceConfig } from "./config.ts";
import type { Finding } from "./finding.ts";
import { checkImports } from "./imports.ts";
import { checkLiterals } from "./literals.ts";
import { compareMoods, cssName, readTokenFiles, type Token, validate } from "./tokens.ts";

export const CHECKS = ["tokens", "no-raw-literals", "component-imports", "svelte-check"] as const;
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

/** The token check, and the token names components may use. */
async function tokenCheck(root: string, cfg: StanceConfig): Promise<{ findings: Finding[]; names: Set<string> }> {
  const read = await readTokenFiles(`${root}/${cfg.tokens}`, norm(cfg.tokens));
  const { tokens, findings } = validate(read.files);
  findings.unshift(...read.findings);
  if (cfg.moods) {
    const moods = new Map<string, Map<string, Token>>();
    const names = (await Array.fromAsync(Deno.readDir(`${root}/${cfg.moods}`))).filter((e) => e.isDirectory).map((e) =>
      e.name
    ).sort();
    for (const mood of names) {
      const label = `${norm(cfg.moods)}/${mood}`;
      const r = await readTokenFiles(`${root}/${label}`, label);
      const v = validate(r.files);
      if (label !== norm(cfg.tokens)) findings.push(...r.findings, ...v.findings);
      moods.set(label, v.tokens);
    }
    findings.push(...compareMoods(moods));
  }
  return { findings, names: new Set([...tokens.keys()].map(cssName)) };
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
    cwd: root,
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
  const { findings: tokenFindings, names } = await tokenCheck(root, cfg);
  if (only.includes("tokens")) findings.push(...tokenFindings);
  const widgetDirs = cfg.widgets.map(norm);
  const stores = new Set(cfg.store.map((s) => norm(s).replace(/\.(ts|js)$/, "")));
  const inWidgets = (f: string) => widgetDirs.some((d) => f.startsWith(d + "/"));
  const files = new Set<string>();
  for (const dir of [...cfg.widgets, ...cfg.components]) for (const f of await svelteFiles(root, dir)) files.add(f);
  for (const file of [...files].sort()) {
    const source = await Deno.readTextFile(`${root}/${file}`);
    if (only.includes("no-raw-literals")) findings.push(...checkLiterals(file, source, names));
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
  return findings;
}
