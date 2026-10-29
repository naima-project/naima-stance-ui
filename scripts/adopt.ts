// Copies the stance into a project, as source the project owns and may edit, and records what was copied:
// the stance's version and commit, and the sha256 of every file as copied. Later runs compare against that
// record, so an update never overwrites a file the project changed without saying so.
//
//   deno task adopt --project <dir> [--mood white] [--to src/lib/ui] [--tauri] [--server] [--force]
//                                                                    copy (or update) the stance
//   deno task adopt --project <dir> --status                        what changed, here and there
//
// What is copied: the widget set to <to>/components/, the store module to <to>/store/, the platform port to
// <to>/platform/, the chosen mood board to tokens/, and the token build to scripts/stance-ui-tokens.ts. With
// --tauri, the Tauri 2 shell to src-tauri/; with --server, the Deno port server to server/port-server.ts.
// stance-ui.json records the copy and configures `deno task check`.

import { posix } from "node:path";
import { encodeHex } from "@std/encoding/hex";

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
  files.set("src/lib/platform/port.ts", `${to}/platform/port.ts`);
  if (platforms.server) files.set("platform/server.ts", "server/port-server.ts");
  if (platforms.tauri) {
    const walk = async (rel: string) => {
      for await (const e of Deno.readDir(`${STANCE}/platform/tauri/${rel}`)) {
        const path = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory && !["target", "gen"].includes(e.name)) await walk(path);
        else if (e.isFile) files.set(`platform/tauri/${path}`, `src-tauri/${path}`);
      }
    };
    await walk("");
  }
  const moodDir = `tokens/moods/${mood}`;
  try {
    for await (const e of Deno.readDir(`${STANCE}/${moodDir}`)) {
      if (e.isFile) files.set(`${moodDir}/${e.name}`, `tokens/${e.name}`);
    }
  } catch {
    throw new Error(
      `no mood board "${mood}"; the stance has ${
        (await Array.fromAsync(Deno.readDir(`${STANCE}/tokens/moods`))).map((e) => e.name).join(", ")
      }`,
    );
  }
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

/** Copies the stance into the project. Returns the lines to print, and throws when it refuses. */
export async function adopt(
  project: string,
  opts: { mood?: string; to?: string; force?: boolean; tauri?: boolean; server?: boolean },
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
    },
  };
  await Deno.writeTextFile(`${project}/${RECORD}`, JSON.stringify(out, null, 2) + "\n");
  lines.push(
    `recorded stance ui ${out.stance.version} (${out.stance.commit.slice(0, 12)}), mood ${mood}, in ${RECORD}`,
  );
  return lines;
}

/** What changed since the copy: in the project (edited files) and in the stance (newer files). */
export async function status(project: string): Promise<string[]> {
  const record = await loadRecord(project);
  if (!record) throw new Error(`${RECORD} not found: the stance was never copied into this project`);
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
  return lines;
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
    });
    for (const l of lines) console.log(l);
  } catch (e) {
    console.error(`stance ui: ${(e as Error).message}`);
    Deno.exit(2);
  }
}
