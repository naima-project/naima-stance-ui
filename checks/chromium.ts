// Playwright's Chromium for the browser checks, found or installed on demand.
//
// The browser checks need the Chromium build of the Playwright version this stance pins in package.json. It is looked
// for, in order: where PLAYWRIGHT_BROWSERS_PATH points, when it is set; the project's own .stance-ui/browsers/; and
// Playwright's shared cache for this user. When it is in none of them, it is installed into .stance-ui/browsers/,
// which ignores itself in git, and one line on stderr says so. ensureChromium sets PLAYWRIGHT_BROWSERS_PATH to the
// folder it chose, which Playwright reads once, when it is first imported: so it runs before that import.
//
// On Linux, Chromium also needs system libraries. When some are missing, Playwright's launch names them; installing
// them takes root, so as root they are installed (playwright install-deps chromium) and the launch is tried again,
// and otherwise the launch fails with the exact list and the command that installs them.

import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";

const stanceRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");

/** The Playwright version the stance pins (package.json). */
export const PLAYWRIGHT_VERSION: string = JSON.parse(
  Deno.readTextFileSync(join(stanceRoot, "package.json")),
).devDependencies.playwright;
const playwrightCli = (command: string) => `deno run -A npm:playwright@${PLAYWRIGHT_VERSION} ${command} chromium`;

/** The folder of a project where its own copy of the browser goes. */
export const projectBrowsers = (root: string) => join(resolve(root), ".stance-ui", "browsers");

/** The revision of the headless Chromium that the pinned Playwright launches, from playwright-core's browsers.json. */
function headlessRevision(): string {
  const require = createRequire(join(stanceRoot, "checks", "chromium.ts"));
  const core = createRequire(require.resolve("playwright/package.json")).resolve("playwright-core/package.json");
  const browsers: { name: string; revision: string }[] =
    JSON.parse(Deno.readTextFileSync(join(dirname(core), "browsers.json"))).browsers;
  const shell = browsers.find((b) => b.name === "chromium-headless-shell");
  if (!shell) throw new Error("playwright-core's browsers.json names no chromium-headless-shell");
  return shell.revision;
}

/** Playwright's shared cache for this user, as Playwright computes it. */
function sharedCache(): string | null {
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
  if (Deno.build.os === "linux") {
    const base = Deno.env.get("XDG_CACHE_HOME") ?? (home && join(home, ".cache"));
    return base ? join(base, "ms-playwright") : null;
  }
  if (Deno.build.os === "darwin") return home ? join(home, "Library", "Caches", "ms-playwright") : null;
  if (Deno.build.os === "windows") {
    const base = Deno.env.get("LOCALAPPDATA") ?? (home && join(home, "AppData", "Local"));
    return base ? join(base, "ms-playwright") : null;
  }
  return null;
}

function installed(dir: string, revision: string): boolean {
  try {
    Deno.statSync(join(dir, `chromium_headless_shell-${revision}`, "INSTALLATION_COMPLETE"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Finds the pinned Chromium, installing it into the project's .stance-ui/browsers/ when it is nowhere, and points
 * Playwright at it. Returns null when it is in place, or why it could not be installed.
 */
export async function ensureChromium(
  root: string,
  say: (line: string) => void = (l) => console.error(l),
): Promise<string | null> {
  const revision = headlessRevision();
  const set = Deno.env.get("PLAYWRIGHT_BROWSERS_PATH");
  const own = projectBrowsers(root);
  const shared = sharedCache();
  const dir = set ? resolve(set) : installed(own, revision) || !shared || !installed(shared, revision) ? own : shared;
  Deno.env.set("PLAYWRIGHT_BROWSERS_PATH", dir);
  if (installed(dir, revision)) return null;
  if (dir === own) {
    await Deno.mkdir(own, { recursive: true });
    await Deno.writeTextFile(join(dirname(own), ".gitignore"), "*\n");
  }
  const where = relative(resolve(root), dir);
  say(
    `stance ui: installing Chromium for Playwright ${PLAYWRIGHT_VERSION} into ${
      where && !where.startsWith("..") ? where : dir
    }`,
  );
  const install = (env: Record<string, string>) =>
    new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", `npm:playwright@${PLAYWRIGHT_VERSION}`, "install", "chromium"],
      cwd: stanceRoot,
      env: { PLAYWRIGHT_BROWSERS_PATH: dir, ...env },
      stdout: "piped",
      stderr: "piped",
    }).output();
  let r = await install({});
  const text = (o: Deno.CommandOutput) => new TextDecoder().decode(o.stderr) + new TextDecoder().decode(o.stdout);
  const unsupported = text(r).match(/does not support chromium on (\S+)/);
  if (!r.success && unsupported && Deno.build.os === "linux") {
    // A Linux distribution newer than those Playwright lists: its Chromium for Linux is one build for every
    // distribution, filed under the newest Ubuntu it knows, and the launch does not depend on the name.
    const build = `ubuntu24.04-${Deno.build.arch === "aarch64" ? "arm64" : "x64"}`;
    say(`stance ui: Playwright lists no Chromium for ${unsupported[1]}; installing its ${build} build`);
    r = await install({ PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: build });
  }
  if (r.success && installed(dir, revision)) return null;
  const out = new TextDecoder().decode(r.stderr).trim() || new TextDecoder().decode(r.stdout).trim();
  return `could not install Chromium for Playwright ${PLAYWRIGHT_VERSION} into ${dir}: ${
    out.split("\n").slice(-3).join(" ") || `exit code ${r.code}`
  }`;
}

/** What Playwright says is missing when Chromium cannot start for lack of system libraries, or null. */
export function missingDependencies(message: string): { libraries: string[]; packages: string[] } | null {
  if (!message.includes("Host system is missing dependencies")) return null;
  // Playwright draws the message in a box: strip its borders, then read the two lists it can hold.
  const lines = message.split("\n").map((l) => l.replace(/^[\s║╔╚═╗╝]+|[\s║╔╚═╗╝\\]+$/g, ""));
  const packages: string[] = [];
  const libraries: string[] = [];
  let into: string[] | null = null;
  for (const line of lines) {
    const apt = line.match(/apt-get install\s+(.*)$/);
    if (apt) {
      into = packages;
      packages.push(...apt[1].split(/\s+/).filter(Boolean));
      continue;
    }
    if (/^Missing libraries:/.test(line)) {
      into = libraries;
      continue;
    }
    if (!line || /\s/.test(line) || line.startsWith("<3")) {
      into = null;
      continue;
    }
    into?.push(line);
  }
  return { libraries, packages };
}

/** The problem to report for missing system libraries: the exact list and the command that installs them. */
export function dependencyProblem(missing: { libraries: string[]; packages: string[] }): string {
  const sudo = Deno.uid?.() === 0 ? "" : "sudo ";
  const what = [
    missing.packages.length ? `the packages ${missing.packages.join(", ")}` : "",
    missing.libraries.length ? `the libraries ${missing.libraries.join(", ")}` : "",
  ].filter(Boolean).join(" and ") || "system libraries Playwright did not name";
  const command = missing.packages.length && !missing.libraries.length
    ? `${sudo}apt-get install ${missing.packages.join(" ")}`
    : `${sudo}${playwrightCli("install-deps")}`;
  return `Chromium cannot start: this system lacks ${what}, which installing needs root: run ${command}`;
}

/**
 * Launches the pinned headless Chromium for the project at root, installing what is missing first. Returns the
 * browser, or the problem that kept it from starting.
 */
export async function launchChromium(
  root: string,
): Promise<{ browser: import("playwright").Browser } | { problem: string }> {
  const failed = await ensureChromium(root);
  if (failed) return { problem: failed };
  const { chromium } = await import("playwright");
  type Attempt = { browser: import("playwright").Browser } | { error: string };
  const attempt = async (): Promise<Attempt> => {
    try {
      return { browser: await chromium.launch() };
    } catch (e) {
      return { error: (e as Error).message };
    }
  };
  let r = await attempt();
  if ("browser" in r) return r;
  let missing = missingDependencies(r.error);
  if (missing && Deno.build.os === "linux" && Deno.uid?.() === 0) {
    console.error("stance ui: installing the system libraries Chromium needs (playwright install-deps chromium)");
    await new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", `npm:playwright@${PLAYWRIGHT_VERSION}`, "install-deps", "chromium"],
      cwd: stanceRoot,
      stdout: "null",
      stderr: "null",
    }).output();
    r = await attempt();
    if ("browser" in r) return r;
    missing = missingDependencies(r.error);
  }
  if (missing) return { problem: dependencyProblem(missing) };
  return {
    problem: `cannot start headless Chromium (${r.error.trim().split("\n")[0]}); to install it by hand: ` +
      `PLAYWRIGHT_BROWSERS_PATH=${Deno.env.get("PLAYWRIGHT_BROWSERS_PATH")} ${playwrightCli("install")}`,
  };
}
