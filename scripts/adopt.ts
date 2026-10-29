// Copies the stance into a project, as source the project owns and may edit, and records what was copied:
// the stance's version and commit, and the sha256 of every file as copied. Later runs compare against that
// record, so an update never overwrites a file the project changed without saying so.
//
//   deno task adopt --project <dir> [--mood white] [--to src/lib/ui] [--tauri] [--server] [--force] [--no-scaffold] [--no-install]
//                                                                    copy (or update) the stance
//   deno task adopt --project <dir> --status                        what changed, here and there
//
// What is copied: the widget set to <to>/components/, the store module to <to>/store/, the theme machine
// and its port to <to>/theme/, the sign-in machine and its passkey helper to <to>/auth/, the platform port to
// <to>/platform/, the chosen mood board with its themes and the contrast pairs to tokens/, and the token build to
// scripts/stance-ui-tokens.ts. With --tauri, the Tauri 2 shell to src-tauri/; with --server, the Deno port server
// to server/port-server.ts. stance-ui.json records the copy and configures `deno task check`.
//
// Then the scaffold, which a new project needs to build and run and which belongs to the project from the start:
// deno.json (tasks tokens, dev, build, check, test), package.json (the npm packages at the stance's exact
// versions), tsconfig.json, vite.config.ts, index.html, .gitignore, and a minimal app wired to the store
// (src/main.ts, src/App.svelte, src/app.svelte.ts, a counter machine in src/machines/ and its test in test/).
// A scaffold file already in the project is never overwritten, only named as skipped; --no-scaffold skips them
// all. Last, the chosen mood board is built, both themes, into <to>/tokens.css. Run as a command, it then installs
// the project's npm packages (deno install, with the Deno that runs it) when the project has a package.json, so the
// checks that follow find them in place; --no-install leaves that to the project.

import { posix } from "node:path";
import { encodeHex } from "@std/encoding/hex";
import { loadConfig } from "../checks/config.ts";
import { checkedLines } from "../checks/record.ts";
import { buildTokens } from "./tokens.ts";

const STANCE = posix.resolve(new URL("..", import.meta.url).pathname);
const RECORD = "stance-ui.json";

interface Record {
  stance: { name: string; author: string; version: string; commit: string };
  mood: string;
  to: string;
  /** The platform parts the project took: the Tauri shell, the Deno port server. */
  platforms?: { tauri: boolean; server: boolean };
  /** Every copied file, by its path in the project: where it came from and its sha256 as copied. */
  files: { [path: string]: { from: string; sha256: string } };
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

/** The files to copy: path in the stance → path in the project. */
async function plan(
  mood: string,
  to: string,
  platforms: { tauri: boolean; server: boolean },
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for await (const e of Deno.readDir(`${STANCE}/src/lib/components`)) {
    if (e.isFile) files.set(`src/lib/components/${e.name}`, `${to}/components/${e.name}`);
  }
  files.set("src/lib/store/store.svelte.ts", `${to}/store/store.svelte.ts`);
  for (const dir of ["theme", "auth"]) {
    for await (const e of Deno.readDir(`${STANCE}/src/lib/${dir}`)) {
      if (e.isFile) files.set(`src/lib/${dir}/${e.name}`, `${to}/${dir}/${e.name}`);
    }
  }
  files.set("src/lib/platform/port.ts", `${to}/platform/port.ts`);
  if (platforms.server) files.set("platform/server.ts", "server/port-server.ts");
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
async function scaffoldFiles(to: string, tauri: boolean): Promise<Map<string, string>> {
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
        dev: `deno task tokens && ${vite}`,
        build: `deno task tokens && ${vite} build --logLevel warn`,
        check: `deno run -A npm:svelte-check@${v("svelte-check")} --tsconfig ./tsconfig.json`,
        test: "deno test -A test/",
        ...(tauri ? { tauri: `deno run -A npm:@tauri-apps/cli@${v("@tauri-apps/cli")}` } : {}),
      },
      imports: { "@std/assert": denoJson.imports["@std/assert"] },
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
  // The type check reads the app's sources only; the tests are in test/, type-checked by deno test.
  const include = ["src/**/*.ts", "src/**/*.svelte"];
  if (!to.startsWith("src/")) include.push(`${to}/**/*.ts`, `${to}/**/*.svelte`);
  files.set("tsconfig.json", json({ compilerOptions: tsconfig.compilerOptions, include, exclude: ["**/*.test.ts"] }));
  // The templates import the copy at its default place, src/lib/ui; elsewhere, the import is rewritten.
  const rel = posix.relative("src", to);
  const ui = rel.startsWith(".") ? rel : `./${rel}`;
  const walk = async (dir: string) => {
    for await (const e of Deno.readDir(`${STANCE}/scaffold/${dir}`)) {
      const path = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory) await walk(path);
      else if (e.isFile) {
        let text = await Deno.readTextFile(`${STANCE}/scaffold/${path}`);
        if (path.startsWith("src/")) text = text.replaceAll(`"./lib/ui/`, `"${ui}/`);
        files.set(path === "gitignore" ? ".gitignore" : path, text);
      }
    }
  };
  await walk("");
  files.set(".gitignore", files.get(".gitignore")! + `${tokensCss}\n`);
  return new Map([...files].sort());
}

/** Writes the scaffold's files the project does not have yet, and names those it keeps. */
async function scaffold(project: string, to: string, tauri: boolean): Promise<string[]> {
  const lines: string[] = [];
  for (const [path, text] of await scaffoldFiles(to, tauri)) {
    const target = `${project}/${path}`;
    if (await read(target)) {
      lines.push(`skipped ${path}: the project has one`);
      continue;
    }
    await Deno.mkdir(posix.dirname(target), { recursive: true });
    await Deno.writeTextFile(target, text);
    lines.push(`created ${path}`);
  }
  return lines;
}

/** Copies the stance into the project. Returns the lines to print, and throws when it refuses. */
export async function adopt(
  project: string,
  opts: { mood?: string; to?: string; force?: boolean; tauri?: boolean; server?: boolean; scaffold?: boolean },
): Promise<string[]> {
  const before = await loadRecord(project);
  const mood = opts.mood ?? before?.mood ?? "white";
  const to = opts.to ?? before?.to ?? "src/lib/ui";
  const platforms = {
    tauri: opts.tauri || (before?.platforms?.tauri ?? false),
    server: opts.server || (before?.platforms?.server ?? false),
  };
  const files = await plan(mood, to, platforms);
  const lines: string[] = [];
  const conflicts: string[] = [];
  const record: Record["files"] = {};
  for (const [from, dest] of files) {
    const src = await Deno.readFile(`${STANCE}/${from}`);
    const there = await read(`${project}/${dest}`);
    const copied = before?.files[dest]?.sha256;
    if (there && (await sha(there)) !== (await sha(src))) {
      // A file the project has changed since the copy, or one that was never ours: not overwritten silently.
      if (!copied || (await sha(there)) !== copied) conflicts.push(dest);
    }
    record[dest] = { from, sha256: await sha(src) };
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
    await Deno.mkdir(posix.dirname(target), { recursive: true });
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
  const pkg = JSON.parse(await Deno.readTextFile(`${STANCE}/package.json`)) as { version: string };
  const dirty = (await git("status", "--porcelain")) !== "";
  const out: Record = {
    stance: {
      name: "ui",
      author: "makebecome",
      version: pkg.version,
      commit: (await git("rev-parse", "HEAD")) + (dirty ? "+changes" : ""),
    },
    mood,
    to,
    platforms,
    files: record,
    check: (before?.check as object | undefined) ?? {
      tokens: "tokens",
      widgets: [`${to}/components`],
      components: ["src"],
      store: [`${to}/store/store.svelte.ts`],
      allowImports: [],
      tsconfig: "tsconfig.json",
      contrast: "tokens/contrast.json",
      // The scaffold's page, built by its build task; a project without the scaffold lists its own.
      pages: opts.scaffold === false
        ? []
        : [{ name: "app", path: "dist/index.html", build: ["deno", "task", "build"] }],
    },
  };
  await Deno.writeTextFile(`${project}/${RECORD}`, json(out));
  lines.push(
    `recorded stance ui ${out.stance.version} (${out.stance.commit.slice(0, 12)}), mood ${mood}, in ${RECORD}`,
  );
  if (opts.scaffold !== false) lines.push(...await scaffold(project, to, platforms.tauri));
  await buildTokens(`${project}/tokens`, `${project}/${to}/tokens.css`, "tokens");
  lines.push(`built ${to}/tokens.css: mood ${mood}, light and dark`);
  return lines;
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
  const project = posix.resolve(arg("--project") ?? Deno.cwd());
  try {
    const lines = args.includes("--status") ? await status(project) : await adopt(project, {
      mood: arg("--mood"),
      to: arg("--to"),
      force: args.includes("--force"),
      tauri: args.includes("--tauri"),
      server: args.includes("--server"),
      scaffold: !args.includes("--no-scaffold"),
    });
    for (const l of lines) console.log(l);
    if (!args.includes("--status") && !args.includes("--no-install")) console.log(await install(project));
  } catch (e) {
    console.error(`stance ui: ${(e as Error).message}`);
    Deno.exit(2);
  }
}
