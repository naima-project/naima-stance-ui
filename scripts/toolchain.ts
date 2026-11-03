// The project's own Rust, for the Tauri shell, installed without admin rights.
//
//   deno task toolchain [--project <dir>] [--check]
//
// The project pins its Rust in rust-toolchain.toml, at its root. This script installs that version, with the targets
// the file lists that this machine can build for, into the project's .stance-ui/rust/ folder, which git ignores:
// rustup's own files in .stance-ui/rust/rustup and cargo's in .stance-ui/rust/cargo (RUSTUP_HOME and CARGO_HOME).
// Nothing outside the project is touched: no profile is edited and no PATH is changed. When rustup is not there yet,
// rustup-init is downloaded from static.rust-lang.org, its SHA-256 is checked against the one published beside it,
// and it runs with -y --no-modify-path --profile minimal --default-toolchain <pin>.
//
// Some of what the platforms need cannot be installed without admin rights: the Xcode command line tools on macOS,
// Visual Studio Build Tools and WebView2 on Windows, webkit2gtk on Linux, and the Android SDK, NDK and a JDK. The
// script looks for each, installs none, and prints the exact command that installs each one that is missing. On
// Windows it also says whether Smart App Control is on, since it can stop an unsigned app built here from running.
//
// With --check it installs nothing and only says what is there. The platforms check (checks/platforms.ts) builds with
// this Rust first, when it is installed.

import { join, resolve } from "node:path";
import { encodeHex } from "@std/encoding/hex";

type Os = typeof Deno.build.os;

/** What rust-toolchain.toml asks for: the version, and the targets and components to add to it. */
export interface Pin {
  channel: string;
  targets: string[];
  components: string[];
}

export const PIN_FILE = "rust-toolchain.toml";

/** The [toolchain] table of a rust-toolchain.toml: the keys rustup reads that this script uses. */
export function parsePin(text: string): Pin {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/#.*$/, ""));
  const start = lines.findIndex((l) => /^\s*\[toolchain\]\s*$/.test(l));
  if (start < 0) throw new Error(`${PIN_FILE} has no [toolchain] table`);
  const end = lines.findIndex((l, i) => i > start && /^\s*\[/.test(l));
  const table = lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
  const channel = /^\s*channel\s*=\s*"([^"]+)"/m.exec(table)?.[1];
  if (!channel) throw new Error(`${PIN_FILE} names no channel in [toolchain]`);
  const list = (key: string) =>
    [...(new RegExp(`^\\s*${key}\\s*=\\s*\\[([^\\]]*)\\]`, "m").exec(table)?.[1] ?? "").matchAll(/"([^"]+)"/g)]
      .map((m) => m[1]);
  return { channel, targets: list("targets"), components: list("components") };
}

/** Where the project's Rust goes: rustup's files and cargo's, both under .stance-ui/rust/. */
export function rustHomes(root: string): { dir: string; rustupHome: string; cargoHome: string; bin: string } {
  const dir = join(resolve(root), ".stance-ui", "rust");
  const cargoHome = join(dir, "cargo");
  return { dir, rustupHome: join(dir, "rustup"), cargoHome, bin: join(cargoHome, "bin") };
}

const exe = (name: string, os: Os) => os === "windows" ? `${name}.exe` : name;

/** The host's target triple, as rustup-init is published for it; null on a system it is not built for here. */
export function hostTriple(os: Os = Deno.build.os, arch: string = Deno.build.arch): string | null {
  if (arch !== "x86_64" && arch !== "aarch64") return null;
  if (os === "linux") return `${arch}-unknown-linux-gnu`;
  if (os === "darwin") return `${arch}-apple-darwin`;
  if (os === "windows") return `${arch}-pc-windows-msvc`;
  return null;
}

/** Where rustup-init for a host is published; its SHA-256 is at the same address with .sha256 added. */
export const rustupInitUrl = (triple: string) =>
  `https://static.rust-lang.org/rustup/dist/${triple}/rustup-init${triple.includes("windows") ? ".exe" : ""}`;

/** The pin's targets this machine can build for: iOS only on macOS, every other one anywhere. */
export const targetsFor = (pin: Pin, os: Os) => pin.targets.filter((t) => os === "darwin" || !t.includes("-apple-ios"));

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * The environment that makes the project's Rust the one found first, when it is installed: RUSTUP_HOME, CARGO_HOME
 * and the folder of its commands, to put first on the PATH. Null when the project has none.
 */
export async function projectRust(
  root: string,
  os: Os = Deno.build.os,
): Promise<{ RUSTUP_HOME: string; CARGO_HOME: string; bin: string } | null> {
  const h = rustHomes(root);
  if (!(await exists(join(h.bin, exe("rustup", os))))) return null;
  return { RUSTUP_HOME: h.rustupHome, CARGO_HOME: h.cargoHome, bin: h.bin };
}

/** What the installer reaches the outside with, so that a test can stand in for the network and the commands. */
export interface InstallDeps {
  os: Os;
  arch: string;
  fetch: (url: string) => Promise<Response>;
  run: (cmd: string, args: string[], env: Record<string, string>) => Promise<number>;
  say: (line: string) => void;
}

const realDeps = (): InstallDeps => ({
  os: Deno.build.os,
  arch: Deno.build.arch,
  fetch: (url) => fetch(url),
  run: async (cmd, args, env) =>
    (await new Deno.Command(cmd, { args, env, stdout: "inherit", stderr: "inherit" }).output()).code,
  say: (line) => console.log(line),
});

async function download(deps: InstallDeps, url: string): Promise<Uint8Array<ArrayBuffer>> {
  const res = await deps.fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** rustup-init for this host, downloaded and checked against its published SHA-256, written where `file` says. */
export async function fetchRustupInit(deps: InstallDeps, file: string): Promise<void> {
  const triple = hostTriple(deps.os, deps.arch);
  if (!triple) throw new Error(`rustup-init is not published for ${deps.os} on ${deps.arch}`);
  const url = rustupInitUrl(triple);
  const bytes = await download(deps, url);
  const expected = new TextDecoder().decode(await download(deps, `${url}.sha256`)).trim().split(/\s+/)[0]
    .toLowerCase();
  const actual = encodeHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error(`${url}.sha256 holds no SHA-256`);
  if (actual !== expected) {
    throw new Error(`rustup-init's SHA-256 is ${actual}, not the ${expected} published with it: not run`);
  }
  await Deno.writeFile(file, bytes, { mode: 0o755 });
}

/** Installs the pinned Rust and its targets into the project; throws with the reason when a step fails. */
export async function installRust(root: string, deps: InstallDeps = realDeps()): Promise<Pin> {
  const pin = parsePin(
    await Deno.readTextFile(join(root, PIN_FILE)).catch(() => {
      throw new Error(`the project has no ${PIN_FILE}, which says the Rust it builds with`);
    }),
  );
  const h = rustHomes(root);
  await Deno.mkdir(h.dir, { recursive: true });
  const env = { ...Deno.env.toObject(), RUSTUP_HOME: h.rustupHome, CARGO_HOME: h.cargoHome };
  const step = async (cmd: string, args: string[], what: string) => {
    const code = await deps.run(cmd, args, env);
    if (code !== 0) throw new Error(`${what} failed (exit ${code})`);
  };
  const rustup = join(h.bin, exe("rustup", deps.os));
  if (!(await exists(rustup))) {
    const init = join(h.dir, exe("rustup-init", deps.os));
    deps.say(`downloading rustup-init from static.rust-lang.org into ${h.dir}`);
    await fetchRustupInit(deps, init);
    await step(
      init,
      ["-y", "--no-modify-path", "--profile", "minimal", "--default-toolchain", pin.channel],
      "rustup-init",
    );
    await Deno.remove(init).catch(() => {});
  }
  // Again when rustup was there already: the pin may have moved since. Rustup does nothing when it is installed.
  await step(rustup, [
    "toolchain",
    "install",
    pin.channel,
    "--profile",
    "minimal",
    ...pin.components.flatMap((c) => ["--component", c]),
  ], `rustup toolchain install ${pin.channel}`);
  const targets = targetsFor(pin, deps.os);
  if (targets.length) {
    await step(rustup, ["target", "add", "--toolchain", pin.channel, ...targets], `rustup target add`);
  }
  return pin;
}

/** One thing a platform needs that takes admin rights to install: whether it is there, and how to install it. */
export interface Prerequisite {
  name: string;
  platforms: string[];
  found: boolean;
  install: string;
}

/** How the prerequisites are looked for: commands to run, files to find, the environment. A test stands in for it. */
export interface Probe {
  os: Os;
  env: Record<string, string | undefined>;
  run: (cmd: string, args: string[]) => Promise<{ ok: boolean; out: string }>;
  exists: (path: string) => Promise<boolean>;
  read: (path: string) => Promise<string | null>;
}

export const realProbe = (): Probe => ({
  os: Deno.build.os,
  env: Deno.env.toObject(),
  run: async (cmd, args) => {
    try {
      const o = await new Deno.Command(cmd, { args, stdout: "piped", stderr: "piped" }).output();
      return { ok: o.success, out: new TextDecoder().decode(o.stdout) };
    } catch {
      return { ok: false, out: "" };
    }
  },
  exists,
  read: (path) => Deno.readTextFile(path).catch(() => null),
});

/** The Linux distribution's family, from /etc/os-release, as the install commands differ by it. */
export function linuxFamily(osRelease: string | null): "debian" | "fedora" | "arch" | "other" {
  const ids = [...(osRelease ?? "").matchAll(/^(?:ID|ID_LIKE)="?([^"\n]*)"?$/gm)].flatMap((m) => m[1].split(" "));
  if (ids.some((i) => ["debian", "ubuntu"].includes(i))) return "debian";
  if (ids.some((i) => ["fedora", "rhel", "centos"].includes(i))) return "fedora";
  if (ids.some((i) => ["arch", "manjaro"].includes(i))) return "arch";
  return "other";
}

const LINUX_WEBKIT: Record<ReturnType<typeof linuxFamily>, string> = {
  debian:
    "sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev",
  fedora:
    'sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel libxdo-devel && sudo dnf group install "c-development"',
  arch:
    "sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg xdotool",
  other: "install webkit2gtk 4.1 with its development files, and a C compiler, with the system's package manager",
};

const LINUX_JDK: Record<ReturnType<typeof linuxFamily>, string> = {
  debian: "sudo apt install openjdk-17-jdk",
  fedora: "sudo dnf install java-17-openjdk-devel",
  arch: "sudo pacman -S --needed jdk17-openjdk",
  other: "install a JDK, version 17 or later, with the system's package manager",
};

/** The NDK version the install command names. */
export const ANDROID_NDK = "28.2.13676358";

const WEBVIEW2 = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

/** Where an Android SDK is, from ANDROID_HOME or ANDROID_SDK_ROOT, else the place Android Studio puts it. */
export async function androidSdk(probe: Probe = realProbe()): Promise<string | null> {
  const home = probe.env.HOME ?? probe.env.USERPROFILE ?? "";
  const local = probe.env.LOCALAPPDATA ?? "";
  for (
    const d of [
      probe.env.ANDROID_HOME,
      probe.env.ANDROID_SDK_ROOT,
      join(home, "Library", "Android", "sdk"),
      join(home, "Android", "Sdk"),
      ...(local ? [join(local, "Android", "Sdk")] : []),
    ]
  ) {
    if (d && (await probe.exists(join(d, "platform-tools")))) return d;
  }
  return null;
}

/** The NDK: NDK_HOME, else the newest one installed side by side in the SDK. */
export async function androidNdk(sdk: string, probe: Probe = realProbe()): Promise<string | null> {
  const env = probe.env.NDK_HOME;
  if (env && (await probe.exists(env))) return env;
  try {
    const versions = (await Array.fromAsync(Deno.readDir(join(sdk, "ndk")))).filter((e) => e.isDirectory)
      .map((e) => e.name);
    const num = (v: string) => v.split(".").map(Number);
    versions.sort((a, b) => {
      const [x, y] = [num(a), num(b)];
      for (let i = 0; i < Math.max(x.length, y.length); i++) {
        if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
      }
      return 0;
    });
    return versions.length ? join(sdk, "ndk", versions.at(-1)!) : null;
  } catch {
    return null;
  }
}

/** A JDK: JAVA_HOME, then java on the PATH, then the one Android Studio ships. */
async function jdk(probe: Probe): Promise<boolean> {
  const java = exe("java", probe.os);
  if (probe.env.JAVA_HOME && (await probe.exists(join(probe.env.JAVA_HOME, "bin", java)))) return true;
  if ((await probe.run("java", ["-version"])).ok) return true;
  const studio = probe.os === "darwin"
    ? "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
    : probe.os === "windows"
    ? join(probe.env.ProgramFiles ?? "C:\\Program Files", "Android", "Android Studio", "jbr")
    : "/opt/android-studio/jbr";
  return await probe.exists(join(studio, "bin", java));
}

/** Smart App Control's state on Windows, read from the registry: on, evaluation, off, or unknown. */
export function smartAppControlState(regOutput: string): "on" | "evaluation" | "off" | "unknown" {
  const m = /VerifiedAndReputablePolicyState\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(regOutput);
  if (!m) return "unknown";
  return ({ 0: "off", 1: "on", 2: "evaluation" } as Record<number, "off" | "on" | "evaluation">)[parseInt(m[1], 16)] ??
    "unknown";
}

export async function smartAppControl(probe: Probe = realProbe()): Promise<ReturnType<typeof smartAppControlState>> {
  if (probe.os !== "windows") return "off";
  const r = await probe.run("reg", [
    "query",
    "HKLM\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy",
    "/v",
    "VerifiedAndReputablePolicyState",
  ]);
  return r.ok ? smartAppControlState(r.out) : "unknown";
}

/** Everything the platforms need from the system on this machine, found or not, with the command that installs it. */
export async function prerequisites(probe: Probe = realProbe()): Promise<Prerequisite[]> {
  const out: Prerequisite[] = [];
  const add = (name: string, platforms: string[], found: boolean, install: string) =>
    out.push({ name, platforms, found, install });
  if (probe.os === "darwin") {
    add(
      "the Xcode command line tools",
      ["macos", "ios"],
      (await probe.run("xcode-select", ["-p"])).ok,
      "xcode-select --install",
    );
    add(
      "Xcode",
      ["ios"],
      (await probe.run("xcodebuild", ["-version"])).ok,
      "install Xcode from the App Store, then: sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer",
    );
  }
  if (probe.os === "linux") {
    const webkit = (await probe.run("pkg-config", ["--exists", "webkit2gtk-4.1"])).ok &&
      (await probe.run("cc", ["--version"])).ok;
    add(
      "webkit2gtk 4.1 and a C compiler",
      ["linux"],
      webkit,
      LINUX_WEBKIT[linuxFamily(await probe.read("/etc/os-release"))],
    );
  }
  if (probe.os === "windows") {
    const vswhere = join(
      probe.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
      "Microsoft Visual Studio",
      "Installer",
      "vswhere.exe",
    );
    const vs = await probe.run(vswhere, [
      "-products",
      "*",
      "-requires",
      "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-property",
      "installationPath",
    ]);
    add(
      "Visual Studio Build Tools with the C++ workload",
      ["windows", "android"],
      vs.ok && vs.out.trim() !== "",
      'winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"',
    );
    let webview = false;
    for (
      const key of [
        `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2}`,
        `HKCU\\Software\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2}`,
      ]
    ) {
      const r = await probe.run("reg", ["query", key, "/v", "pv"]);
      if (r.ok && /pv\s+REG_SZ\s+(?!0\.0\.0\.0)\d/.test(r.out)) webview = true;
    }
    add("the WebView2 runtime", ["windows"], webview, "winget install --id Microsoft.EdgeWebView2Runtime");
  }
  const sdk = await androidSdk(probe);
  add(
    "the Android SDK",
    ["android"],
    sdk !== null,
    'install Android Studio (https://developer.android.com/studio) with its SDK, or the SDK command-line tools, then: sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0", and set ANDROID_HOME to the SDK folder',
  );
  add(
    "the Android NDK",
    ["android"],
    sdk !== null && (await androidNdk(sdk, probe)) !== null,
    `sdkmanager "ndk;${ANDROID_NDK}"`,
  );
  add(
    "a JDK, version 17 or later",
    ["android"],
    await jdk(probe),
    probe.os === "darwin"
      ? "brew install --cask temurin@17"
      : probe.os === "windows"
      ? "winget install --id EclipseAdoptium.Temurin.17.JDK"
      : LINUX_JDK[linuxFamily(await probe.read("/etc/os-release"))],
  );
  return out;
}

/** What the script prints about the prerequisites and Smart App Control. */
export function describePrerequisites(found: Prerequisite[], sac: ReturnType<typeof smartAppControlState>): string[] {
  const lines = found.map((p) =>
    p.found
      ? `found: ${p.name} (${p.platforms.join(", ")})`
      : `missing: ${p.name} (${p.platforms.join(", ")}), which needs admin rights to install: ${p.install}`
  );
  if (sac === "on" || sac === "evaluation") {
    lines.push(
      `Smart App Control is ${sac === "on" ? "on" : "in evaluation mode"}: Windows may refuse to run the app built ` +
        "here, which is not signed. It is set in Windows Security, under App & browser control.",
    );
  }
  return lines;
}

if (import.meta.main) {
  const i = Deno.args.indexOf("--project");
  const root = resolve(i >= 0 ? Deno.args[i + 1] : Deno.cwd());
  const h = rustHomes(root);
  let code = 0;
  if (Deno.args.includes("--check")) {
    const rust = await projectRust(root);
    console.log(rust ? `rust: installed in ${h.dir}` : `rust: not installed in ${h.dir} (deno task toolchain)`);
  } else {
    try {
      const pin = await installRust(root);
      const targets = targetsFor(pin, Deno.build.os);
      console.log(`rust: ${pin.channel} in ${h.dir}${targets.length ? `, with ${targets.join(", ")}` : ""}`);
    } catch (e) {
      console.error(`rust: ${(e as Error).message}`);
      code = 1;
    }
  }
  const probe = realProbe();
  for (const line of describePrerequisites(await prerequisites(probe), await smartAppControl(probe))) console.log(line);
  Deno.exit(code);
}
