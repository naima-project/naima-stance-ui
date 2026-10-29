// What the checks found the last time they ran on a project, kept so that `stance-ui status` can say whether they
// passed after the last change. Each run writes, for each check it ran, whether it passed, how many problems it
// found, when, and a fingerprint of the files the checks read: the token files, the mood boards, the contrast pairs,
// the widgets, the components and stance-ui.json. A check whose fingerprint differs from the files' now has not
// run since they changed.
//
// The record is stance-ui.checked.json, beside stance-ui.json. It describes one checkout, so it is not committed:
// add it to the project's .gitignore.

import { posix } from "node:path";
import { encodeHex } from "@std/encoding/hex";
import type { StanceConfig } from "./config.ts";
import type { Finding } from "./finding.ts";

export const CHECKED = "stance-ui.checked.json";

export interface CheckRun {
  passed: boolean;
  problems: number;
  at: string;
  fingerprint: string;
}

export type Checked = Record<string, CheckRun>;

const norm = (p: string) => posix.normalize(p).replace(/\/+$/, "");

/** Every file under `rel` (or `rel` itself), from the root, skipping dependencies, builds and hidden folders. */
async function filesUnder(root: string, rel: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (path: string) => {
    let info: Deno.FileInfo;
    try {
      info = await Deno.stat(`${root}/${path}`);
    } catch {
      return;
    }
    if (info.isFile) return void out.push(path);
    for await (const e of Deno.readDir(`${root}/${path}`)) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
      await walk(`${path}/${e.name}`);
    }
  };
  await walk(norm(rel));
  return out;
}

/** The paths, from the root, whose files the checks read: a change under one of them asks for the checks again. */
export function checkedPaths(cfg: StanceConfig): string[] {
  return [
    "stance-ui.json",
    cfg.tokens,
    ...(cfg.moods ? [cfg.moods] : []),
    cfg.contrast,
    ...cfg.widgets,
    ...cfg.components,
  ].map(norm);
}

/** Whether a file, from the root, is one the checks read. A component counts only as a .svelte file. */
export function isChecked(cfg: StanceConfig, file: string): boolean {
  const f = norm(file);
  const under = (dir: string) => f === norm(dir) || f.startsWith(norm(dir) + "/");
  if (f === "stance-ui.json" || under(cfg.tokens) || under(cfg.contrast) || (cfg.moods && under(cfg.moods))) {
    return true;
  }
  if (cfg.widgets.some(under)) return true;
  return cfg.components.some(under) && f.endsWith(".svelte");
}

/** One hash over every file the checks read, by path and content. */
export async function fingerprint(root: string, cfg: StanceConfig): Promise<string> {
  const files = new Set<string>();
  for (const p of checkedPaths(cfg)) for (const f of await filesUnder(root, p)) if (isChecked(cfg, f)) files.add(f);
  const lines: string[] = [];
  for (const f of [...files].sort()) {
    const bytes = await Deno.readFile(`${root}/${f}`);
    lines.push(`${f}\0${encodeHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))}`);
  }
  const all = new TextEncoder().encode(lines.join("\n"));
  return encodeHex(new Uint8Array(await crypto.subtle.digest("SHA-256", all)));
}

export async function readChecked(root: string): Promise<Checked> {
  try {
    return JSON.parse(await Deno.readTextFile(`${root}/${CHECKED}`)) as Checked;
  } catch {
    return {};
  }
}

/** Records what a run of `checks` found, keeping the record of the checks it did not run. */
export async function recordRun(
  root: string,
  cfg: StanceConfig,
  checks: readonly string[],
  findings: Finding[],
  at = new Date(),
): Promise<void> {
  const record = await readChecked(root);
  const print = await fingerprint(root, cfg);
  for (const check of checks) {
    const problems = findings.filter((f) => f.check === check && f.level === "problem").length;
    record[check] = { passed: problems === 0, problems, at: at.toISOString(), fingerprint: print };
  }
  const sorted = Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
  await Deno.writeTextFile(`${root}/${CHECKED}`, JSON.stringify(sorted, null, 2) + "\n");
}

/** One line per check recorded: passed or failed on the files as they are now, or not run since they changed. */
export async function checkedLines(root: string, cfg: StanceConfig): Promise<string[]> {
  const record = await readChecked(root);
  const names = Object.keys(record).sort();
  if (!names.length) return ["checks: never run on this checkout"];
  const now = await fingerprint(root, cfg);
  return names.map((name) => {
    const r = record[name];
    const when = r.at.slice(0, 16).replace("T", " ");
    if (r.fingerprint !== now) {
      return `check ${name}: not run since the last change (it ${r.passed ? "passed" : "failed"} at ${when} UTC)`;
    }
    return r.passed
      ? `check ${name}: passed after the last change (${when} UTC)`
      : `check ${name}: failed after the last change, ${r.problems} problem(s) (${when} UTC)`;
  });
}
