// Copies the stance into a project, as source the project owns and may edit, and records what was copied:
// the stance's version and commit, and the sha256 of every file as copied. Later runs compare against that
// record, so an update never overwrites a file the project changed without saying so.
//
//   deno task adopt --project <dir> [--mood white] [--to src/lib/ui] [--parts study,list] [--tauri] [--server] [--force] [--no-scaffold] [--no-install]
//                                                                    copy (or update) the stance
//   deno task adopt --project <dir> --only <stance path>[,<path>]   take only these files or folders of the stance
//   deno task adopt --project <dir> --status                        what changed, here and there
//
// With --only, a project that has made the stance its own takes part of an update, say a new part of the widget set
// (--only src/lib/components/study), and leaves the rest as it is: only the files under those paths of the stance are
// copied or checked for changes, each recorded with the commit it came from, and nothing else is written (no scaffold,
// no registry, no token build).
//
// What is copied: the widget set to <to>/components/, and with --parts the parts of it a project asks for, each a
// folder of its own (study, the drawings of models, the mosaic of cards and the editor; list, the one list; PARTS
// says what each needs), recorded so that later runs take them again, the store module to <to>/store/, the theme machine
// and its outputs for the page to <to>/theme/, the sign-in machine and its passkey helper to <to>/auth/, the platform bridge to
// <to>/platform/ (with port.ts, its deprecated old name), the chosen mood board with its themes and the contrast
// pairs to tokens/, and the token build to scripts/stance-ui-tokens.ts. With --tauri, the Tauri 2 shell to
// src-tauri/; with --server, the Deno bridge server to server/bridge-server.ts and its request handler to
// server/bridge-handler.ts. With --mcp, the bridge as an MCP server for agents, and agent parity with it (rule 27),
// a choice the project makes at design time: until it answers --mcp or --no-mcp, adopt asks it in what it prints, and
// stance-ui.json records the answer. Yes copies the MCP server's modules to server/ (bridge-mcp.ts, agent-endpoint.ts,
// and the server of --server), the page's agent tools to <to>/agent/, the generator of the registry of transitions to
// scripts/stance-ui-transitions.ts, and scaffolds the entry server/mcp.ts with the three tools `store`, `transitions`
// and `transition` and the bridge's read tool, the page's wiring in src/main.ts, and the registry
// src/transitions.generated.ts, which the checks `transitions` and `agent-endpoint` hold the project to.
// stance-ui.json records the copy and configures `deno task check`.
//
// Then the scaffold, which a new project needs to build and run and which belongs to the project from the start:
// deno.json (tasks tokens, dev, build, check, test), package.json (the npm packages at the stance's exact
// versions), tsconfig.json, vite.config.ts, index.html, .gitignore, and a minimal app wired to the store
// (src/main.ts, src/App.svelte, src/app.svelte.ts, a counter machine in src/machines/ and its test in test/).
// A scaffold file already in the project is never overwritten, only named as skipped; --no-scaffold skips them
// all. Last, the chosen mood board is built, both themes, into <to>/tokens.css. Run as a command, it then installs
// the project's npm packages (deno install, with the Deno that runs it) when the project has a package.json, so the
// checks that follow find them in place, and Playwright's Chromium for the browser checks when this machine has no copy
// of the pinned build (checks/chromium.ts), into the project's gitignored .stance-ui/browsers/; --no-install leaves
// both to the project, and the browser checks install the browser themselves when it is missing.

import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeHex } from "@std/encoding/hex";
import { ensureChromium } from "../checks/chromium.ts";
import { loadConfig } from "../checks/config.ts";
import { checkedLines } from "../checks/record.ts";
import { buildTokens } from "./tokens.ts";
import { readMachines, renderRegistry } from "./transitions.ts";

const STANCE = resolve(fileURLToPath(new URL("..", import.meta.url)));
const RECORD = "stance-ui.json";

interface Record {
  stance: { name: string; author: string; version: string; commit: string };
  mood: string;
  to: string;
  /** The platform parts the project took: the Tauri shell, the Deno bridge server. */
  /** mcp: absent until the project answers whether agents reach the bridge through MCP. */
  platforms?: { tauri: boolean; server: boolean; mcp?: boolean };
  /** The parts of the widget set the project took besides its components, by folder (PARTS). */
  parts?: string[];
  /** Every copied file, by its path in the project: where it came from, its sha256 as copied, and, when it was taken
   * with --only, the commit it came from (the others came from `stance.commit`). */
  files: { [path: string]: { from: string; sha256: string; commit?: string } };
  check: unknown;
}

const sha = async (bytes: Uint8Array<ArrayBuffer>) =>
  encodeHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
const read = (p: string) => Deno.readFile(p).catch(() => null);

async function git(...args: string[]): Promise<string> {
  const out = await new Deno.Command("git", { args: ["-C", STANCE, ...args], stdout: "piped", stderr: "null" })
    .output();
  return new TextDecoder().decode(out.stdout).trim();
}

/**
 * The parts of the widget set a project takes only when it asks for them (--parts), each a folder of
 * src/lib/components: the npm packages it needs, the module specifiers of those its widgets import (the
 * component-imports check's allowImports), and its drawings, which hold inline SVG (the icons check's drawings).
 * Their icons are Lucide's, so a project that takes one draws its icons from Lucide.
 */
export const PARTS: { [part: string]: { npm: string[]; imports: string[]; drawings: string[] } } = {
  study: {
    npm: [
      "@codemirror/commands",
      "@codemirror/lang-rust",
      "@codemirror/language",
      "@codemirror/legacy-modes",
      "@codemirror/search",
      "@codemirror/state",
      "@codemirror/view",
      "@lezer/highlight",
      "@lucide/svelte",
    ],
    imports: [
      "@codemirror/commands",
      "@codemirror/lang-rust",
      "@codemirror/language",
      "@codemirror/legacy-modes",
      "@codemirror/search",
      "@codemirror/state",
      "@codemirror/view",
      "@lezer/highlight",
    ],
    drawings: ["Graph.svelte", "Sequence.svelte", "Timeline.svelte"],
  },
  // The one list uses the study part's Action and Segmented.
  list: { npm: ["@lucide/svelte"], imports: [], drawings: [] },
};
const PART_NEEDS: { [part: string]: string[] } = { list: ["study"] };

/** The parts asked for with those they need. */
function withNeeds(parts: readonly string[]): string[] {
  const out = new Set<string>();
  const add = (p: string) => {
    if (!PARTS[p]) throw new Error(`no part "${p}" of the widget set; the parts are ${Object.keys(PARTS).join(", ")}`);
    if (out.has(p)) return;
    out.add(p);
    for (const n of PART_NEEDS[p] ?? []) add(n);
  };
  parts.forEach(add);
  return [...out].sort();
}

/** The files to copy: path in the stance → path in the project. */
async function plan(
  mood: string,
  to: string,
  platforms: { tauri: boolean; server: boolean; mcp?: boolean },
  parts: readonly string[],
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  // The widget set, and the parts of it the project asked for, each a folder (study/, the drawings of models and the
  // editor; list/, the one list).
  const widgets = async (rel: string) => {
    for await (const e of Deno.readDir(`${STANCE}/src/lib/components${rel}`)) {
      if (e.isDirectory && (rel || parts.includes(e.name))) await widgets(`${rel}/${e.name}`);
      else if (e.isFile) files.set(`src/lib/components${rel}/${e.name}`, `${to}/components${rel}/${e.name}`);
    }
  };
  await widgets("");
  files.set("src/lib/store/store.svelte.ts", `${to}/store/store.svelte.ts`);
  for (const dir of ["theme", "auth"]) {
    for await (const e of Deno.readDir(`${STANCE}/src/lib/${dir}`)) {
      if (e.isFile) files.set(`src/lib/${dir}/${e.name}`, `${to}/${dir}/${e.name}`);
    }
  }
  files.set("src/lib/platform/bridge.ts", `${to}/platform/bridge.ts`);
  // The bridge's old name, deprecated: it re-exports bridge.ts, for one more release.
  files.set("src/lib/platform/port.ts", `${to}/platform/port.ts`);
  if (platforms.server) {
    files.set("platform/server.ts", "server/bridge-server.ts");
    files.set("platform/bridge-handler.ts", "server/bridge-handler.ts");
  }
  if (platforms.mcp) {
    // Agents reach the page over the bridge's server, so the MCP server needs the web server and the agent channel.
    files.set("platform/server.ts", "server/bridge-server.ts");
    files.set("platform/bridge-mcp.ts", "server/bridge-mcp.ts");
    files.set("platform/bridge-handler.ts", "server/bridge-handler.ts");
    files.set("platform/agent-endpoint.ts", "server/agent-endpoint.ts");
    files.set("src/lib/agent/agent.ts", `${to}/agent/agent.ts`);
    files.set("scripts/transitions.ts", "scripts/stance-ui-transitions.ts");
    files.set("scripts/affordance.ts", "scripts/affordance.ts");
  }
  if (platforms.tauri) {
    const shell = async (rel: string) => {
      for await (const e of Deno.readDir(`${STANCE}/platform/tauri/${rel}`)) {
        const path = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory && !["target", "gen"].includes(e.name)) await shell(path);
        else if (e.isFile) files.set(`platform/tauri/${path}`, `src-tauri/${path}`);
      }
    };
    await shell("");
  }
  const moodDir = `tokens/moods/${mood}`;
  // The mood board with its themes, sub-folders included.
  const walk = async (rel: string) => {
    for await (const e of Deno.readDir(`${STANCE}/${moodDir}${rel}`)) {
      if (e.isDirectory) await walk(`${rel}/${e.name}`);
      else if (e.isFile) files.set(`${moodDir}${rel}/${e.name}`, `tokens${rel}/${e.name}`);
    }
  };
  try {
    await walk("");
  } catch {
    throw new Error(
      `no mood board "${mood}"; the stance has ${
        (await Array.fromAsync(Deno.readDir(`${STANCE}/tokens/moods`))).map((e) => e.name).join(", ")
      }`,
    );
  }
  files.set("tokens/contrast.json", "tokens/contrast.json");
  files.set("scripts/tokens.ts", "scripts/stance-ui-tokens.ts");
  return new Map([...files].sort());
}

async function loadRecord(project: string): Promise<Record | null> {
  try {
    return JSON.parse(await Deno.readTextFile(`${project}/${RECORD}`)) as Record;
  } catch {
    return null;
  }
}

const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";

/**
 * The scaffold's files, path in the project → content: the configuration made here from the stance's own
 * (its exact package versions, its compiler options), and the templates of scaffold/, their imports of the
 * stance's copy pointed at `to`.
 */
async function scaffoldFiles(
  to: string,
  tauri: boolean,
  mcp: boolean,
  parts: readonly string[] = [],
): Promise<Map<string, string>> {
  const pkg = JSON.parse(await Deno.readTextFile(`${STANCE}/package.json`)) as {
    devDependencies: { [name: string]: string };
  };
  const denoJson = JSON.parse(await Deno.readTextFile(`${STANCE}/deno.json`)) as {
    imports: { [name: string]: string };
  };
  const tsconfig = JSON.parse(await Deno.readTextFile(`${STANCE}/tsconfig.json`)) as { compilerOptions: object };
  const v = (name: string) => {
    const version = pkg.devDependencies[name];
    if (!version) throw new Error(`the stance's package.json has no ${name}`);
    return version;
  };
  const npm = [
    "@sveltejs/vite-plugin-svelte",
    "@tauri-apps/api",
    "style-dictionary",
    "svelte",
    "svelte-check",
    "typescript",
    "vite",
    ...(tauri ? ["@tauri-apps/cli"] : []),
    ...new Set(parts.flatMap((p) => PARTS[p]!.npm)),
  ];
  const tokensCss = `${to}/tokens.css`;
  const vite = `deno run -A npm:vite@${v("vite")}`;
  const files = new Map<string, string>();
  files.set(
    "deno.json",
    json({
      nodeModulesDir: "auto",
      tasks: {
        tokens: `deno run -A scripts/stance-ui-tokens.ts --tokens tokens --out ${tokensCss}`,
        ...(mcp
          ? {
            transitions: "deno run -A scripts/stance-ui-transitions.ts",
            mcp: "deno run -A server/mcp.ts",
          }
          : {}),
        dev: `deno task tokens && ${vite}`,
        build: `deno task tokens && ${mcp ? "deno task transitions && " : ""}${vite} build --logLevel warn`,
        check: `deno run -A npm:svelte-check@${v("svelte-check")} --tsconfig ./tsconfig.json`,
        test: "deno test -A test/",
        ...(tauri ? { tauri: `deno run -A npm:@tauri-apps/cli@${v("@tauri-apps/cli")}` } : {}),
      },
      imports: {
        "@std/assert": denoJson.imports["@std/assert"],
        ...(mcp ? { "@std/http": denoJson.imports["@std/http"] } : {}),
      },
      fmt: { exclude: ["node_modules", "dist", ".stance-ui"] },
      lint: { exclude: ["node_modules", "dist", ".stance-ui"] },
    }),
  );
  files.set(
    "package.json",
    json({
      private: true,
      type: "module",
      devDependencies: Object.fromEntries(npm.sort().map((n) => [n, v(n)])),
    }),
  );
  // The Rust the shell builds with, pinned as the stance pins its own; `naima stance-ui toolchain` installs it.
  if (tauri) files.set("rust-toolchain.toml", await Deno.readTextFile(`${STANCE}/rust-toolchain.toml`));
  // The type check reads the app's sources only; the tests are in test/, type-checked by deno test.
  const include = ["src/**/*.ts", "src/**/*.svelte"];
  if (!to.startsWith("src/")) include.push(`${to}/**/*.ts`, `${to}/**/*.svelte`);
  files.set("tsconfig.json", json({ compilerOptions: tsconfig.compilerOptions, include, exclude: ["**/*.test.ts"] }));
  // The templates import the copy at its default place, src/lib/ui; elsewhere, the import is rewritten.
  const rel = posix.relative("src", to);
  const ui = rel.startsWith(".") ? rel : `./${rel}`;
  const walk = async (dir: string, from = "scaffold") => {
    for await (const e of Deno.readDir(`${STANCE}/${from}/${dir}`)) {
      const path = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory) await walk(path, from);
      else if (e.isFile) {
        let text = await Deno.readTextFile(`${STANCE}/${from}/${path}`);
        if (path.startsWith("src/")) text = text.replaceAll(`"./lib/ui/`, `"${ui}/`);
        files.set(path === "gitignore" ? ".gitignore" : path, text);
      }
    }
  };
  await walk("");
  // Agent parity: the page wires the agent's tools to its store, and the server for agents is the project's own file.
  if (mcp) await walk("", "scaffold-mcp");
  files.set(".gitignore", files.get(".gitignore")! + `${tokensCss}\n`);
  return new Map([...files].sort());
}

/** Writes the scaffold's files the project does not have yet, and names those it keeps. */
async function scaffold(
  project: string,
  to: string,
  tauri: boolean,
  mcp: boolean,
  parts: readonly string[],
): Promise<string[]> {
  const lines: string[] = [];
  for (const [path, text] of await scaffoldFiles(to, tauri, mcp, parts)) {
    const target = `${project}/${path}`;
    if (await read(target)) {
      lines.push(`skipped ${path}: the project has one`);
      continue;
    }
    await Deno.mkdir(dirname(target), { recursive: true });
    await Deno.writeTextFile(target, text);
    lines.push(`created ${path}`);
  }
  return lines;
}

/** Copies the stance into the project. Returns the lines to print, and throws when it refuses. */
export async function adopt(
  project: string,
  opts: {
    mood?: string;
    to?: string;
    force?: boolean;
    tauri?: boolean;
    server?: boolean;
    mcp?: boolean;
    scaffold?: boolean;
    /** Paths of the stance, files or folders: only these are taken. */
    only?: string[];
    /** Parts of the widget set to take besides its components (PARTS), with those they need. */
    parts?: string[];
  },
): Promise<string[]> {
  const before = await loadRecord(project);
  const mood = opts.mood ?? before?.mood ?? "white";
  const to = opts.to ?? before?.to ?? "src/lib/ui";
  const platforms = {
    tauri: opts.tauri || (before?.platforms?.tauri ?? false),
    mcp: opts.mcp ?? before?.platforms?.mcp,
    // Agents reach the page through the web server: yes to MCP takes it along.
    server: opts.server || (before?.platforms?.server ?? false) || (opts.mcp ?? before?.platforms?.mcp) === true,
  };
  if (platforms.mcp === undefined) delete platforms.mcp;
  const parts = withNeeds([...(before?.parts ?? []), ...(opts.parts ?? [])]);
  // --only may name a part's folder the project has not taken yet: the plan holds every part, and --only picks.
  const all = await plan(mood, to, platforms, opts.only ? Object.keys(PARTS) : parts);
  const only = opts.only?.map((p) => posix.normalize(p).replace(/\/+$/, ""));
  const taken = (from: string) => !only || only.some((p) => from === p || from.startsWith(`${p}/`));
  const files = new Map([...all].filter(([from]) => taken(from)));
  if (only && files.size === 0) throw new Error(`the stance has no file under ${only.join(", ")}`);
  if (only && !before) {
    throw new Error(`--only updates a copy: ${RECORD} records none, so adopt the stance whole first`);
  }
  const head = (await git("rev-parse", "HEAD")) + ((await git("status", "--porcelain")) !== "" ? "+changes" : "");
  const lines: string[] = [];
  const conflicts: string[] = [];
  // With --only, the files not taken keep what the record says of them.
  const record: Record["files"] = only ? { ...before!.files } : {};
  for (const [from, dest] of files) {
    const src = await Deno.readFile(`${STANCE}/${from}`);
    const there = await read(`${project}/${dest}`);
    const copied = before?.files[dest]?.sha256;
    if (there && (await sha(there)) !== (await sha(src))) {
      // A file the project has changed since the copy, or one that was never ours: not overwritten silently.
      if (!copied || (await sha(there)) !== copied) conflicts.push(dest);
    }
    record[dest] = { from, sha256: await sha(src), ...(only ? { commit: head } : {}) };
  }
  if (conflicts.length && !opts.force) {
    throw new Error(
      `these files differ from what the stance copied, so the project changed them (or they were never the stance's):\n  ${
        conflicts.join("\n  ")
      }\nmerge by hand, or rerun with --force to overwrite them`,
    );
  }
  for (const [from, dest] of files) {
    const target = `${project}/${dest}`;
    await Deno.mkdir(dirname(target), { recursive: true });
    const src = await Deno.readFile(`${STANCE}/${from}`);
    const there = await read(target);
    if (there && (await sha(there)) === (await sha(src))) continue;
    await Deno.writeFile(target, src);
    lines.push(`${there ? "updated" : "copied"} ${dest}`);
  }
  // Files the stance no longer has are left in place, and named.
  for (const dest of Object.keys(before?.files ?? {})) {
    if (!record[dest]) lines.push(`no longer in the stance, kept: ${dest}`);
  }
  if (only) {
    const named = Object.keys(PARTS).filter((p) =>
      [...files.keys()].some((f) => f.startsWith(`src/lib/components/${p}/`))
    );
    const took = withNeeds([...parts, ...named]);
    await Deno.writeTextFile(
      `${project}/${RECORD}`,
      json({ ...before!, ...(took.length ? { parts: took } : {}), files: record }),
    );
    lines.push(`recorded ${files.size} file(s) of stance ui at ${head.slice(0, 12)} in ${RECORD}`);
    return lines;
  }
  const pkg = JSON.parse(await Deno.readTextFile(`${STANCE}/package.json`)) as { version: string };
  // Agent parity: where the machines are made, the registry of their transitions, and the MCP server's own files.
  const transitions = {
    machines: "src/app.svelte.ts",
    registry: "src/transitions.generated.ts",
    server: ["server/mcp.ts", "server/agent-endpoint.ts"],
  };
  const kept = (before?.check as { transitions?: unknown } | undefined)?.transitions;
  const out: Record = {
    stance: {
      name: "ui",
      author: "makebecome",
      version: pkg.version,
      commit: head,
    },
    mood,
    to,
    platforms,
    ...(parts.length ? { parts } : {}),
    files: record,
    check: before?.check
      ? { ...(before.check as object), ...(platforms.mcp ? { transitions: kept ?? transitions } : {}) }
      : {
        tokens: "tokens",
        widgets: [`${to}/components`],
        components: ["src"],
        store: [`${to}/store/store.svelte.ts`],
        allowImports: [...new Set(parts.flatMap((p) => PARTS[p]!.imports))].sort(),
        // A part of the widget set draws Lucide's icons, so the project that takes one has chosen them.
        ...(parts.length
          ? {
            icons: {
              set: "lucide",
              drawings: parts.flatMap((p) => PARTS[p]!.drawings.map((d) => `${to}/components/${p}/${d}`)),
            },
          }
          : {}),
        tsconfig: "tsconfig.json",
        contrast: "tokens/contrast.json",
        // The scaffold's page, built by its build task; a project without the scaffold lists its own.
        pages: opts.scaffold === false
          ? []
          : [{ name: "app", path: "dist/index.html", build: ["deno", "task", "build"] }],
        ...(platforms.mcp ? { transitions } : {}),
      },
  };
  await Deno.writeTextFile(`${project}/${RECORD}`, json(out));
  lines.push(
    `recorded stance ui ${out.stance.version} (${out.stance.commit.slice(0, 12)}), mood ${mood}, in ${RECORD}`,
  );
  if (platforms.mcp === undefined) {
    lines.push(
      "asked: should agents read and act on the app as an MCP server, through its store and the same transitions the user's buttons call (agent parity, rule 27)? Answer with --mcp or --no-mcp; until then it is not set up",
    );
  }
  if (opts.scaffold !== false) {
    lines.push(...await scaffold(project, to, platforms.tauri, platforms.mcp === true, parts));
  }
  if (platforms.mcp) lines.push(await writeRegistry(project, out.check as { transitions: typeof transitions }));
  await buildTokens(`${project}/tokens`, `${project}/${to}/tokens.css`, "tokens");
  lines.push(`built ${to}/tokens.css: mood ${mood}, light and dark`);
  return lines;
}

/** Generates the registry of transitions from the machines of the project's store, and says what it did. */
async function writeRegistry(
  project: string,
  check: { transitions: { machines: string; registry: string } },
): Promise<string> {
  const { machines, registry } = check.transitions;
  const { entries, problems } = await readMachines(project, machines);
  if (problems.length) {
    return `no registry yet: ${
      problems.map((p) => `${p.file}: ${p.message}`).join("; ")
    }; fix it and run deno task transitions`;
  }
  await Deno.mkdir(dirname(`${project}/${registry}`), { recursive: true });
  await Deno.writeTextFile(`${project}/${registry}`, renderRegistry(entries, machines));
  return `generated ${registry}: ${entries.length} transitions`;
}

/**
 * What changed since the copy: in the project (files customized, their hash no longer the one copied) and in the
 * stance (newer files); then, for each check, whether it passed after the last change to the files it reads.
 */
export async function status(project: string): Promise<string[]> {
  const record = await loadRecord(project);
  if (!record) throw new Error(`${RECORD} not found: the stance was never copied into this project`);
  if (!record.stance?.commit || !record.files) {
    // Configured for the checks by hand, never copied by adopt: there is no copy to compare with.
    return [
      `${RECORD} records no copy of the stance: nothing to compare`,
      ...await checkedLines(project, await loadConfig(project)),
    ];
  }
  const lines = [
    `copied from stance ui ${record.stance.version} (${record.stance.commit.slice(0, 12)}), mood ${record.mood}`,
  ];
  for (const [dest, { from, sha256 }] of Object.entries(record.files)) {
    const here = await read(`${project}/${dest}`);
    const there = await read(`${STANCE}/${from}`);
    if (!here) lines.push(`removed in the project: ${dest}`);
    else if ((await sha(here)) !== sha256) lines.push(`changed in the project: ${dest}`);
    if (!there) lines.push(`gone from the stance: ${from}`);
    else if ((await sha(there)) !== sha256) lines.push(`newer in the stance: ${from} → ${dest}`);
  }
  if (lines.length === 1) lines.push("nothing changed on either side");
  lines.push(...await checkedLines(project, await loadConfig(project)));
  return lines;
}

/**
 * Installs the project's npm packages with the Deno that runs this script, when the project has a package.json: the
 * checks run svelte-check and vite from them, and several checks starting at once must not each install them.
 */
async function install(project: string): Promise<string> {
  if (!(await read(`${project}/package.json`))) return "no package.json: no npm packages to install";
  const r = await new Deno.Command(Deno.execPath(), {
    args: ["install", "--quiet"],
    cwd: project,
    stdout: "null",
    stderr: "piped",
  }).output();
  if (r.success) return "installed the npm packages (deno install)";
  const why = new TextDecoder().decode(r.stderr).trim().split("\n").at(-1) ?? "";
  return `could not install the npm packages: run deno install in the project before its checks${
    why ? ` (${why})` : ""
  }`;
}

if (import.meta.main) {
  const args = Deno.args;
  const arg = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  // The OS's own resolve: a Windows path such as C:\a\b is absolute there, where posix.resolve would prefix it.
  const project = resolve(arg("--project") ?? Deno.cwd());
  try {
    const lines = args.includes("--status") ? await status(project) : await adopt(project, {
      mood: arg("--mood"),
      to: arg("--to"),
      force: args.includes("--force"),
      tauri: args.includes("--tauri"),
      server: args.includes("--server"),
      mcp: args.includes("--mcp") ? true : args.includes("--no-mcp") ? false : undefined,
      scaffold: !args.includes("--no-scaffold"),
      only: arg("--only")?.split(","),
      parts: arg("--parts")?.split(","),
    });
    for (const l of lines) console.log(l);
    if (!args.includes("--status") && !args.includes("--no-install") && !args.includes("--only")) {
      console.log(await install(project));
      const failed = await ensureChromium(project, (l) => console.log(l.replace(/^stance ui: /, "")));
      if (failed) console.log(`${failed}; the browser checks will try again`);
    }
  } catch (e) {
    console.error(`stance ui: ${(e as Error).message}`);
    Deno.exit(2);
  }
}
