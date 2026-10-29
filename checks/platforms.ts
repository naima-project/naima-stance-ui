// The `platforms` check: builds the app for every platform this machine can reach, launches it, waits until
// it is ready, runs its end-to-end script inside it, and takes a screenshot. Each platform is reported at the
// level it reached: built, launched, end-to-end passed, or skipped with the reason. A platform this machine
// cannot reach is skipped, never passed.
//
//   web       the frontend build, served by the stance's port server, in Playwright's Chromium, Firefox and
//             WebKit (WebKit is the engine of the macOS and iOS webviews)
//   macos     tauri build; the app launched with the end-to-end script; screencapture of its window
//   ios       tauri ios build for the simulator; simctl install and launch with the script; simctl screenshot
//   linux     tauri build; through tauri-driver (WebDriver) when it and WebKitWebDriver are installed, else
//   windows   launched with the script; tauri-driver needs msedgedriver on Windows
//   android   tauri android build; adb install and launch on a running emulator or device; adb screencap
//
// The app is ready when its page first calls the platform port: the Tauri shell prints "port: <command>"
// then. The end-to-end script (stance-ui.json's platforms.e2e) is one JavaScript expression whose value is a
// promise of { ok, says }; the shell runs it when STANCE_UI_E2E holds it and prints "e2e: <report>".

import { posix } from "node:path";
import { TextLineStream } from "@std/streams/text-line-stream";
import { decodeBase64 } from "@std/encoding/base64";
import { portHandler } from "../platform/server.ts";
import type { Finding } from "./finding.ts";

export const PLATFORMS = ["web", "macos", "ios", "linux", "windows", "android"] as const;
export type Platform = typeof PLATFORMS[number];

export interface PlatformConfig {
  /** The app's folder, from the project's root: where src-tauri is. */
  app: string;
  /** The end-to-end script, from the project's root, or null to stop at launched. */
  e2e: string | null;
}

/** What one platform (one browser, for the web) reached. */
export interface PlatformReport {
  platform: string;
  built: boolean;
  launched: boolean;
  endToEnd: boolean;
  /** Why the platform was not tried, or why it stopped where it did without failing. */
  skipped?: string;
  /** What went wrong; a failed platform is a problem of the check. */
  failed?: string;
  /** The end-to-end script's own words. */
  says?: string;
  screenshot?: string;
  log?: string;
}

interface Ctx {
  root: string;
  app: string;
  tauriDir: string;
  out: string;
  script: string | null;
  conf: TauriConf;
  env: Record<string, string>;
  progress: (stage: string) => void;
}

interface TauriConf {
  productName?: string;
  identifier: string;
  build: { frontendDist: string; beforeBuildCommand?: string | { script: string; cwd?: string } };
}

const STANCE = posix.resolve(new URL("..", import.meta.url).pathname);
const exe = (name: string) => Deno.build.os === "windows" ? `${name}.exe` : name;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/** The first of `names` found on the PATH, or in one of `extra` folders. */
async function which(name: string, extra: string[] = []): Promise<string | null> {
  const sep = Deno.build.os === "windows" ? ";" : ":";
  const dirs = [...(Deno.env.get("PATH") ?? "").split(sep), ...extra].filter(Boolean);
  for (const d of dirs) {
    const p = posix.join(d.replaceAll("\\", "/"), exe(name));
    if (await exists(p)) return p;
  }
  return null;
}

/** Runs a command to its end with its output in a log file; resolves with its exit code. */
async function runLogged(cmd: string, args: string[], opts: { cwd: string; env: Record<string, string>; log: string }) {
  const file = await Deno.open(opts.log, { write: true, create: true, append: true });
  await file.write(new TextEncoder().encode(`$ ${cmd} ${args.join(" ")}\n`));
  try {
    const child = new Deno.Command(cmd, {
      args,
      cwd: opts.cwd,
      env: opts.env,
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    const copy = async (stream: ReadableStream<Uint8Array>) => {
      for await (const chunk of stream) file.writeSync(chunk);
    };
    await Promise.all([copy(child.stdout), copy(child.stderr)]);
    return (await child.status).code;
  } catch (e) {
    await file.write(new TextEncoder().encode(`cannot run ${cmd}: ${(e as Error).message}\n`));
    return 127;
  } finally {
    file.close();
  }
}

/** A launched app: its output lines as they come, kept in a log, and the means to end it. */
class Launched {
  readonly lines: string[] = [];
  readonly #waiters: { test: (l: string) => boolean; done: (l: string) => void }[] = [];
  readonly #child: Deno.ChildProcess;
  readonly ended: Promise<number>;

  constructor(cmd: string, args: string[], opts: { cwd: string; env: Record<string, string>; log: string }) {
    this.#child = new Deno.Command(cmd, { args, cwd: opts.cwd, env: opts.env, stdout: "piped", stderr: "piped" })
      .spawn();
    const log = Deno.openSync(opts.log, { write: true, create: true, append: true });
    log.writeSync(new TextEncoder().encode(`$ ${cmd} ${args.join(" ")}\n`));
    const read = async (s: ReadableStream<Uint8Array>) => {
      for await (const line of s.pipeThrough(new TextDecoderStream()).pipeThrough(new TextLineStream())) {
        log.writeSync(new TextEncoder().encode(line + "\n"));
        this.lines.push(line);
        for (const w of [...this.#waiters]) {
          if (w.test(line)) {
            this.#waiters.splice(this.#waiters.indexOf(w), 1);
            w.done(line);
          }
        }
      }
    };
    const reading = Promise.all([read(this.#child.stdout), read(this.#child.stderr)]);
    this.ended = this.#child.status.then(async (s) => {
      await reading.catch(() => {});
      log.close();
      return s.code;
    });
  }

  get pid(): number {
    return this.#child.pid;
  }

  /** The first line, past or future, that passes `test`; null if none came within `ms` or the app ended. */
  waitFor(test: (l: string) => boolean, ms: number): Promise<string | null> {
    const seen = this.lines.find(test);
    if (seen !== undefined) return Promise.resolve(seen);
    return new Promise((resolve) => {
      const w = { test, done: (l: string) => (clearTimeout(t), resolve(l)) };
      const t = setTimeout(() => (this.#waiters.splice(this.#waiters.indexOf(w), 1), resolve(null)), ms);
      this.#waiters.push(w);
      this.ended.then(() => (clearTimeout(t), resolve(this.lines.find(test) ?? null)));
    });
  }

  async stop(): Promise<void> {
    try {
      this.#child.kill("SIGTERM");
    } catch {
      // already ended
    }
    await Promise.race([this.ended, sleep(5000)]);
  }
}

const READY = (l: string) => /^port: |^e2e: \{/.test(l);
const REPORT = (l: string) => l.startsWith("e2e: {");

/** The end-to-end report printed by the shell, or a failed one when the line is missing or malformed. */
function parseReport(line: string | null): { ok: boolean; says: string } {
  if (line === null) return { ok: false, says: "the end-to-end script reported nothing" };
  try {
    const r = JSON.parse(line.slice("e2e: ".length)) as { ok?: unknown; says?: unknown };
    return { ok: r.ok === true, says: String(r.says ?? "") };
  } catch {
    return { ok: false, says: `unreadable report: ${line}` };
  }
}

/** The Tauri CLI, at the version the stance pins, run by this Deno. */
async function tauri(ctx: Ctx, args: string[], log: string): Promise<number> {
  const pkg = JSON.parse(await Deno.readTextFile(`${STANCE}/package.json`)) as {
    devDependencies: Record<string, string>;
  };
  const cli = `npm:@tauri-apps/cli@${pkg.devDependencies["@tauri-apps/cli"]}`;
  return runLogged(Deno.execPath(), ["run", "-A", cli, ...args], { cwd: ctx.app, env: ctx.env, log });
}

/** The frontend build: the same command Tauri runs before its own build. */
async function buildWeb(ctx: Ctx): Promise<{ ok: boolean; dist: string; log: string }> {
  const log = `${ctx.out}/web-build.log`;
  const before = ctx.conf.build.beforeBuildCommand;
  const script = typeof before === "string" ? before : before?.script;
  const dist = posix.resolve(ctx.tauriDir, ctx.conf.build.frontendDist);
  if (script) {
    const cwd = typeof before === "object" && before.cwd ? posix.resolve(ctx.app, before.cwd) : ctx.app;
    const shell = Deno.build.os === "windows" ? ["cmd", "/c", script] : ["sh", "-c", script];
    const code = await runLogged(shell[0], shell.slice(1), { cwd, env: ctx.env, log });
    if (code !== 0) return { ok: false, dist, log };
  }
  return { ok: await exists(`${dist}/index.html`), dist, log };
}

async function web(ctx: Ctx): Promise<PlatformReport[]> {
  const built = await buildWeb(ctx);
  const browsers = ["chromium", "firefox", "webkit"] as const;
  if (!built.ok) {
    return browsers.map((b) => ({
      platform: `web-${b}`,
      built: false,
      launched: false,
      endToEnd: false,
      failed: "the frontend build failed",
      log: built.log,
    }));
  }
  let pw: typeof import("playwright");
  try {
    pw = await import("playwright");
  } catch (e) {
    return browsers.map((b) => ({
      platform: `web-${b}`,
      built: true,
      launched: false,
      endToEnd: false,
      skipped: `Playwright is not installed (${(e as Error).message.split("\n")[0]})`,
    }));
  }
  // The page as a web server would give it: the stance's own server, static files and the port.
  const server = Deno.serve(
    { port: 0, hostname: "127.0.0.1", onListen: () => {} },
    portHandler({
      handlers: {},
      static: built.dist,
    }),
  );
  const url = `http://127.0.0.1:${server.addr.port}/`;
  const out: PlatformReport[] = [];
  try {
    for (const name of browsers) {
      ctx.progress(`web-${name}`);
      const r: PlatformReport = { platform: `web-${name}`, built: true, launched: false, endToEnd: false };
      out.push(r);
      const type = pw[name];
      if (!(await exists(type.executablePath()))) {
        r.skipped = `${name} is not installed: deno run -A npm:playwright install ${name}`;
        continue;
      }
      const browser = await type.launch();
      try {
        const page = await browser.newPage({ viewport: { width: 400, height: 660 } });
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(url, { waitUntil: "load" });
        r.launched = true;
        if (ctx.script) {
          const rep = await page.evaluate(ctx.script).catch((e: Error) => ({ ok: false, says: e.message })) as {
            ok: boolean;
            says: string;
          };
          r.endToEnd = rep.ok === true;
          r.says = rep.says;
          if (!r.endToEnd) r.failed = `end-to-end: ${rep.says}${errors.length ? `; page errors: ${errors[0]}` : ""}`;
        }
        r.screenshot = `${ctx.out}/web-${name}.png`;
        await page.screenshot({ path: r.screenshot });
      } catch (e) {
        r.failed = (e as Error).message.split("\n")[0];
      } finally {
        await browser.close();
      }
    }
  } finally {
    await server.shutdown();
  }
  return out;
}

/** The desktop binary tauri build made: the Cargo package's binary, in release. */
async function desktopBinary(ctx: Ctx): Promise<string | null> {
  const cargo = await Deno.readTextFile(`${ctx.tauriDir}/Cargo.toml`);
  const name = /^\s*name\s*=\s*"([^"]+)"/m.exec(cargo)?.[1] ?? "app";
  if (Deno.build.os === "darwin") {
    const bundle = `${ctx.tauriDir}/target/release/bundle/macos/${ctx.conf.productName ?? name}.app/Contents/MacOS`;
    try {
      for await (const e of Deno.readDir(bundle)) if (e.isFile) return `${bundle}/${e.name}`;
    } catch {
      return null;
    }
  }
  const bin = `${ctx.tauriDir}/target/release/${exe(name)}`;
  return (await exists(bin)) ? bin : null;
}

/** Launches the app with the end-to-end script, waits for it to be ready and for its report. */
async function launchWithScript(
  ctx: Ctx,
  r: PlatformReport,
  cmd: string,
  args: string[],
  env: Record<string, string>,
  shoot: (l: Launched) => Promise<string | null>,
) {
  const log = `${ctx.out}/${r.platform}-launch.log`;
  r.log = log;
  const app = new Launched(cmd, args, { cwd: ctx.app, env: { ...ctx.env, ...env }, log });
  try {
    const ready = await app.waitFor(READY, 90_000);
    if (ready === null) {
      r.failed = `the app did not get ready within 90 s (no "port:" line); see ${log}`;
      return;
    }
    r.launched = true;
    if (ctx.script) {
      const rep = parseReport(await app.waitFor(REPORT, 60_000));
      r.endToEnd = rep.ok;
      r.says = rep.says;
      if (!rep.ok) r.failed = `end-to-end: ${rep.says}`;
    }
    await sleep(800); // the last frame painted
    const shot = await shoot(app).catch(() => null);
    if (shot) r.screenshot = shot;
  } finally {
    await app.stop();
  }
}

const SWIFT_WINDOW = `import CoreGraphics
let pid = Int(CommandLine.arguments[1])!
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as! [[String: Any]]
for w in list where (w["kCGWindowOwnerPID"] as? Int) == pid && (w["kCGWindowLayer"] as? Int) == 0 {
  print(w["kCGWindowNumber"]!); break
}
`;

async function macos(ctx: Ctx): Promise<PlatformReport> {
  const r: PlatformReport = { platform: "macos", built: false, launched: false, endToEnd: false };
  r.log = `${ctx.out}/macos-build.log`;
  if ((await tauri(ctx, ["build", "--bundles", "app"], r.log)) !== 0) return { ...r, failed: "tauri build failed" };
  const bin = await desktopBinary(ctx);
  if (!bin) return { ...r, failed: "tauri build made no app bundle" };
  r.built = true;
  await launchWithScript(ctx, r, bin, [], ctx.script ? { STANCE_UI_E2E: ctx.script } : {}, async (app) => {
    const swift = `${ctx.out}/window-id.swift`;
    await Deno.writeTextFile(swift, SWIFT_WINDOW);
    const id = new TextDecoder().decode(
      (await new Deno.Command("xcrun", { args: ["swift", swift, String(app.pid)], stdout: "piped", stderr: "null" })
        .output()).stdout,
    ).trim();
    if (!id) return null;
    const png = `${ctx.out}/macos.png`;
    const ok = (await new Deno.Command("screencapture", { args: ["-x", "-o", `-l${id}`, png] }).output()).success;
    return ok ? png : null;
  });
  return r;
}

async function ios(ctx: Ctx): Promise<PlatformReport> {
  const r: PlatformReport = { platform: "ios", built: false, launched: false, endToEnd: false };
  const booted = JSON.parse(new TextDecoder().decode(
    (await new Deno.Command("xcrun", { args: ["simctl", "list", "devices", "booted", "-j"], stdout: "piped" })
      .output()).stdout,
  )) as { devices: Record<string, { udid: string; name: string }[]> };
  const devices = Object.values(booted.devices).flat();
  const device = devices.find((d) => d.name.startsWith("iPhone")) ?? devices[0];
  if (!device) return { ...r, skipped: "no iOS simulator is booted (xcrun simctl boot <device>)" };
  r.log = `${ctx.out}/ios-build.log`;
  if (!(await exists(`${ctx.tauriDir}/gen/apple`))) {
    if ((await tauri(ctx, ["ios", "init", "--ci"], r.log)) !== 0) return { ...r, failed: "tauri ios init failed" };
  }
  if ((await tauri(ctx, ["ios", "build", "--target", "aarch64-sim", "--debug", "--ci"], r.log)) !== 0) {
    return { ...r, failed: "tauri ios build failed" };
  }
  const found = await findApp(`${ctx.tauriDir}/gen/apple/build`);
  if (!found) return { ...r, failed: "tauri ios build made no .app for the simulator" };
  r.built = true;
  const simctl = async (...args: string[]) =>
    (await new Deno.Command("xcrun", { args: ["simctl", ...args], stdout: "null", stderr: "null" }).output()).success;
  if (!(await simctl("install", device.udid, found))) {
    return { ...r, failed: `simctl install on ${device.name} failed` };
  }
  await launchWithScript(
    ctx,
    r,
    "xcrun",
    ["simctl", "launch", "--console-pty", "--terminate-running-process", device.udid, ctx.conf.identifier],
    ctx.script ? { SIMCTL_CHILD_STANCE_UI_E2E: ctx.script } : {},
    async () => {
      const png = `${ctx.out}/ios.png`;
      return (await simctl("io", device.udid, "screenshot", png)) ? png : null;
    },
  );
  await simctl("terminate", device.udid, ctx.conf.identifier);
  return r;
}

/** The newest simulator .app under `dir`. */
async function findApp(dir: string): Promise<string | null> {
  let best: { path: string; at: number } | null = null;
  const walk = async (d: string, depth: number) => {
    if (depth > 6) return;
    let entries: Deno.DirEntry[];
    try {
      entries = await Array.fromAsync(Deno.readDir(d));
    } catch {
      return;
    }
    for (const e of entries) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory && e.name.endsWith(".app")) {
        if (!p.includes("iphonesimulator") && !p.includes("simulator")) continue;
        const at = (await Deno.stat(p)).mtime?.getTime() ?? 0;
        if (!best || at > best.at) best = { path: p, at };
      } else if (e.isDirectory) await walk(p, depth + 1);
    }
  };
  await walk(dir, 0);
  return (best as { path: string } | null)?.path ?? null;
}

/** A minimal W3C WebDriver client: the four calls the check needs, as the protocol defines them. */
async function webdriver(base: string, method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json() as { value: unknown };
  if (!res.ok) throw new Error(`WebDriver ${method} ${path}: ${JSON.stringify(json.value).slice(0, 300)}`);
  return json.value;
}

/** Linux and Windows: through tauri-driver when it and the native driver are there, else by the shell's hook. */
async function desktop(ctx: Ctx, platform: "linux" | "windows"): Promise<PlatformReport> {
  const r: PlatformReport = { platform, built: false, launched: false, endToEnd: false };
  r.log = `${ctx.out}/${platform}-build.log`;
  if ((await tauri(ctx, ["build", "--no-bundle"], r.log)) !== 0) return { ...r, failed: "tauri build failed" };
  const bin = await desktopBinary(ctx);
  if (!bin) return { ...r, failed: "tauri build made no binary" };
  r.built = true;
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? "";
  const driver = await which("tauri-driver", [`${home}/.cargo/bin`]);
  const native = platform === "linux" ? await which("WebKitWebDriver") : await which("msedgedriver");
  const display = platform === "windows" || Deno.env.get("DISPLAY") || Deno.env.get("WAYLAND_DISPLAY");
  const xvfb = display ? null : await which("xvfb-run");
  if (!display && !xvfb) return { ...r, skipped: "no display, and xvfb-run is not installed to make one" };
  const wrap = (cmd: string, args: string[]): [string, string[]] =>
    xvfb ? [xvfb, ["-a", "-s", "-screen 0 1280x900x24", cmd, ...args]] : [cmd, args];

  if (driver && native) {
    r.log = `${ctx.out}/${platform}-webdriver.log`;
    const port = 4444 + Math.floor(Math.random() * 1000);
    const [cmd, args] = wrap(driver, ["--port", String(port), "--native-driver", native]);
    const td = new Launched(cmd, args, { cwd: ctx.app, env: ctx.env, log: r.log });
    const base = `http://127.0.0.1:${port}`;
    let session: string | null = null;
    try {
      for (let i = 0; i < 50; i++) {
        try {
          await webdriver(base, "GET", "/status");
          break;
        } catch {
          await sleep(200);
        }
      }
      const s = await webdriver(base, "POST", "/session", {
        capabilities: { alwaysMatch: { "tauri:options": { application: bin } } },
      }) as { sessionId: string };
      session = s.sessionId;
      r.launched = true;
      if (ctx.script) {
        const rep = await webdriver(base, "POST", `/session/${session}/execute/async`, {
          script:
            `const done = arguments[arguments.length - 1]; Promise.resolve().then(() => (${ctx.script})).then(done, (e) => done({ ok: false, says: String(e) }));`,
          args: [],
        }) as { ok: boolean; says: string };
        r.endToEnd = rep?.ok === true;
        r.says = rep?.says;
        if (!r.endToEnd) r.failed = `end-to-end: ${rep?.says}`;
      }
      const png = await webdriver(base, "GET", `/session/${session}/screenshot`) as string;
      r.screenshot = `${ctx.out}/${platform}.png`;
      await Deno.writeFile(r.screenshot, decodeBase64(png));
    } catch (e) {
      r.failed = (e as Error).message;
    } finally {
      if (session) await webdriver(base, "DELETE", `/session/${session}`).catch(() => {});
      await td.stop();
    }
    return r;
  }

  const [cmd, args] = wrap(bin, []);
  await launchWithScript(
    ctx,
    r,
    cmd,
    args,
    ctx.script ? { STANCE_UI_E2E: ctx.script } : {},
    () => Promise.resolve(null),
  );
  if (!r.failed) {
    r.skipped = `no screenshot: tauri-driver ${driver ? "is" : "is not"} installed, ${
      platform === "linux" ? "WebKitWebDriver" : "msedgedriver"
    } ${native ? "is" : "is not"}; launched with the shell's own end-to-end hook instead`;
  }
  return r;
}

async function android(ctx: Ctx): Promise<PlatformReport> {
  const r: PlatformReport = { platform: "android", built: false, launched: false, endToEnd: false };
  const sdk = Deno.env.get("ANDROID_HOME") ?? Deno.env.get("ANDROID_SDK_ROOT");
  if (!sdk || !(await exists(sdk))) {
    return { ...r, skipped: "no Android SDK (ANDROID_HOME): install it with the NDK, a JDK and an emulator" };
  }
  if (!Deno.env.get("NDK_HOME")) return { ...r, skipped: "no Android NDK (NDK_HOME)" };
  const adb = await which("adb", [`${sdk}/platform-tools`]);
  if (!adb) return { ...r, skipped: "no adb in the SDK's platform-tools" };
  const devices = new TextDecoder().decode(
    (await new Deno.Command(adb, { args: ["devices"], stdout: "piped" })
      .output()).stdout,
  ).split("\n").slice(1).filter((l) => /\tdevice$/.test(l));
  if (!devices.length) return { ...r, skipped: "no emulator or device is running (emulator -avd <name>)" };
  r.log = `${ctx.out}/android-build.log`;
  if (!(await exists(`${ctx.tauriDir}/gen/android`))) {
    if ((await tauri(ctx, ["android", "init", "--ci"], r.log)) !== 0) {
      return { ...r, failed: "tauri android init failed" };
    }
  }
  if ((await tauri(ctx, ["android", "build", "--apk", "--debug", "--ci"], r.log)) !== 0) {
    return { ...r, failed: "tauri android build failed" };
  }
  const apk = await findFile(`${ctx.tauriDir}/gen/android/app/build/outputs/apk`, ".apk");
  if (!apk) return { ...r, failed: "tauri android build made no .apk" };
  r.built = true;
  const run = (args: string[]) => runLogged(adb, args, { cwd: ctx.app, env: ctx.env, log: r.log! });
  if ((await run(["install", "-r", apk])) !== 0) return { ...r, failed: "adb install failed" };
  if ((await run(["shell", "monkey", "-p", ctx.conf.identifier, "1"])) !== 0) {
    return { ...r, failed: "the app did not start" };
  }
  await sleep(5000);
  r.launched = true;
  const png = await new Deno.Command(adb, { args: ["exec-out", "screencap", "-p"], stdout: "piped" }).output();
  if (png.success) {
    r.screenshot = `${ctx.out}/android.png`;
    await Deno.writeFile(r.screenshot, png.stdout);
  }
  r.skipped = "end-to-end is not automated on Android yet: the app cannot be handed the script there";
  return r;
}

async function findFile(dir: string, suffix: string): Promise<string | null> {
  try {
    for await (const e of Deno.readDir(dir)) {
      const p = `${dir}/${e.name}`;
      if (e.isFile && e.name.endsWith(suffix)) return p;
      if (e.isDirectory) {
        const f = await findFile(p, suffix);
        if (f) return f;
      }
    }
  } catch {
    // not there
  }
  return null;
}

/** The platforms this machine can try at all; the others are reported skipped with the reason. */
function reachable(): Map<Platform, string | null> {
  const os = Deno.build.os;
  return new Map<Platform, string | null>([
    ["web", null],
    ["macos", os === "darwin" ? null : "macOS apps build only on macOS"],
    ["ios", os === "darwin" ? null : "iOS apps build only on macOS"],
    ["linux", os === "linux" ? null : "the Linux app builds on Linux; run this check there"],
    ["windows", os === "windows" ? null : "the Windows app builds on Windows; run this check there"],
    ["android", null],
  ]);
}

/** Builds, launches and drives the app on every platform it can; returns one report per platform. */
export async function checkPlatforms(
  root: string,
  cfg: PlatformConfig,
  opts: { only?: Platform[]; out?: string } = {},
): Promise<PlatformReport[]> {
  const app = posix.resolve(root, cfg.app);
  const tauriDir = `${app}/src-tauri`;
  const out = posix.resolve(opts.out ?? `${root}/.stance-ui/platforms`);
  await Deno.mkdir(out, { recursive: true });
  const conf = JSON.parse(await Deno.readTextFile(`${tauriDir}/tauri.conf.json`)) as TauriConf;
  const denoDir = posix.dirname(Deno.execPath());
  const sep = Deno.build.os === "windows" ? ";" : ":";
  const progressFile = Deno.env.get("NAIMA_RUN_PROGRESS");
  const chosen = PLATFORMS.filter((p) => !opts.only || opts.only.includes(p));
  let done = 0;
  const ctx: Ctx = {
    root,
    app,
    tauriDir,
    out,
    script: cfg.e2e ? await Deno.readTextFile(posix.resolve(root, cfg.e2e)) : null,
    conf,
    // The Deno running the check is the one the app's build commands find first.
    env: { ...Deno.env.toObject(), PATH: `${denoDir}${sep}${Deno.env.get("PATH") ?? ""}`, NO_COLOR: "1" },
    progress: (stage) => {
      if (progressFile) {
        Deno.writeTextFileSync(
          progressFile,
          JSON.stringify({ stage, done, total: chosen.length, unit: "platforms" }) + "\n",
          { append: true },
        );
      }
    },
  };
  const reports: PlatformReport[] = [];
  const why = reachable();
  for (const p of chosen) {
    ctx.progress(p);
    const skip = why.get(p);
    if (skip) {
      reports.push({ platform: p, built: false, launched: false, endToEnd: false, skipped: skip });
    } else {
      try {
        if (p === "web") reports.push(...await web(ctx));
        else if (p === "macos") reports.push(await macos(ctx));
        else if (p === "ios") reports.push(await ios(ctx));
        else if (p === "linux" || p === "windows") reports.push(await desktop(ctx, p));
        else reports.push(await android(ctx));
      } catch (e) {
        reports.push({ platform: p, built: false, launched: false, endToEnd: false, failed: (e as Error).message });
      }
    }
    done++;
  }
  await Deno.writeTextFile(`${out}/report.json`, JSON.stringify(reports, null, 2) + "\n");
  return reports;
}

/** One line per platform: the furthest level it reached, and what stopped it. */
export function describeReport(r: PlatformReport, root: string): string {
  const rel = (p?: string) => (p ? posix.relative(root, p) : "");
  const level = r.endToEnd
    ? "end-to-end passed"
    : r.launched
    ? "launched"
    : r.built
    ? "built"
    : r.failed
    ? "failed"
    : "skipped";
  const parts = [`${r.platform.padEnd(14)} ${level}`];
  if (r.says) parts.push(`(${r.says})`);
  if (r.failed) parts.push(`problem: ${r.failed}`);
  if (r.skipped) parts.push(`skipped: ${r.skipped}`);
  if (r.screenshot) parts.push(`screenshot ${rel(r.screenshot)}`);
  return parts.join(" · ");
}

/** The reports as the stance's findings: a failed platform is a problem, every other one a note. */
export function platformFindings(reports: PlatformReport[], root: string): Finding[] {
  return reports.map((r) => ({
    check: "platforms",
    level: r.failed ? "problem" : "note",
    message: describeReport(r, root),
  }));
}
