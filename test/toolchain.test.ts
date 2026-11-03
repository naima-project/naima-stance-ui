// The project's own Rust (scripts/toolchain.ts) and the Windows desktop-session launch (checks/windows-session.ts).
// Nothing here downloads or installs anything: the network and the commands are stood in for.

import { assert, assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { encodeHex } from "@std/encoding/hex";
import { fromFileUrl, join } from "@std/path";
import {
  describePrerequisites,
  hostTriple,
  type InstallDeps,
  installRust,
  linuxFamily,
  parsePin,
  prerequisites,
  type Probe,
  projectRust,
  rustHomes,
  rustupInitUrl,
  smartAppControlState,
  targetsFor,
} from "../scripts/toolchain.ts";
import { desktopSignedIn, sessionLaunch, taskCommands, taskScript } from "../checks/windows-session.ts";

const root = fromFileUrl(new URL("..", import.meta.url));

Deno.test("the stance pins its Rust, and the pin is read with its targets", async () => {
  const pin = parsePin(await Deno.readTextFile(join(root, "rust-toolchain.toml")));
  assert(/^\d+\.\d+\.\d+$/.test(pin.channel), pin.channel);
  assert(pin.targets.includes("aarch64-linux-android"));
  assert(pin.targets.includes("aarch64-apple-ios-sim"));
  assertEquals(
    parsePin('[toolchain] # the pin\nchannel = "1.90.0"\ncomponents = ["rustfmt"]\n[other]\nchannel = "x"\n'),
    { channel: "1.90.0", targets: [], components: ["rustfmt"] },
  );
  let said = "";
  try {
    parsePin('[toolchain]\nprofile = "minimal"\n');
  } catch (e) {
    said = (e as Error).message;
  }
  assertStringIncludes(said, "no channel");
});

Deno.test("rustup-init is fetched for the host, and iOS targets only on macOS", () => {
  assertEquals(hostTriple("linux", "x86_64"), "x86_64-unknown-linux-gnu");
  assertEquals(hostTriple("darwin", "aarch64"), "aarch64-apple-darwin");
  assertEquals(hostTriple("windows", "x86_64"), "x86_64-pc-windows-msvc");
  assertEquals(hostTriple("freebsd", "x86_64"), null);
  assertEquals(
    rustupInitUrl("x86_64-pc-windows-msvc"),
    "https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe",
  );
  assertEquals(
    rustupInitUrl("aarch64-apple-darwin"),
    "https://static.rust-lang.org/rustup/dist/aarch64-apple-darwin/rustup-init",
  );
  const pin = { channel: "1.96.0", targets: ["x86_64-linux-android", "aarch64-apple-ios-sim"], components: [] };
  assertEquals(targetsFor(pin, "linux"), ["x86_64-linux-android"]);
  assertEquals(targetsFor(pin, "darwin"), ["x86_64-linux-android", "aarch64-apple-ios-sim"]);
});

/** A project folder with a pin, and an installer whose network and commands are stand-ins that record their calls. */
async function fakeInstall(published: Uint8Array<ArrayBuffer>, sha: string) {
  const project = await Deno.makeTempDir();
  await Deno.writeTextFile(
    join(project, "rust-toolchain.toml"),
    '[toolchain]\nchannel = "1.96.0"\ntargets = ["x86_64-linux-android", "aarch64-apple-ios"]\n',
  );
  const fetched: string[] = [];
  const ran: { cmd: string; args: string[]; env: Record<string, string> }[] = [];
  const h = rustHomes(project);
  const deps: InstallDeps = {
    os: "linux",
    arch: "x86_64",
    fetch: (url) => {
      fetched.push(url);
      return Promise.resolve(new Response(url.endsWith(".sha256") ? `${sha}  rustup-init\n` : published));
    },
    run: async (cmd, args, env) => {
      ran.push({ cmd, args, env });
      // rustup-init puts rustup in CARGO_HOME/bin, as the real one does.
      if (cmd.endsWith("rustup-init")) {
        await Deno.mkdir(h.bin, { recursive: true });
        await Deno.writeTextFile(join(h.bin, "rustup"), "");
      }
      return 0;
    },
    say: () => {},
  };
  return { project, fetched, ran, h, deps };
}

Deno.test("the toolchain installs the pinned Rust into the project, after checking rustup-init's SHA-256", async () => {
  const bytes = new TextEncoder().encode("a stand-in for rustup-init");
  const sha = encodeHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  const { project, fetched, ran, h, deps } = await fakeInstall(bytes, sha);
  try {
    assertEquals(await projectRust(project, "linux"), null);
    const pin = await installRust(project, deps);
    assertEquals(pin.channel, "1.96.0");
    const url = "https://static.rust-lang.org/rustup/dist/x86_64-unknown-linux-gnu/rustup-init";
    assertEquals(fetched, [url, `${url}.sha256`]);
    assertEquals(ran[0].cmd, join(h.dir, "rustup-init"));
    assertEquals(ran[0].args, ["-y", "--no-modify-path", "--profile", "minimal", "--default-toolchain", "1.96.0"]);
    for (const r of ran) {
      assertEquals([r.env.RUSTUP_HOME, r.env.CARGO_HOME], [join(h.dir, "rustup"), join(h.dir, "cargo")]);
    }
    assertEquals(ran[1].args, ["toolchain", "install", "1.96.0", "--profile", "minimal"]);
    // the iOS target is left out on Linux
    assertEquals(ran[2].args, ["target", "add", "--toolchain", "1.96.0", "x86_64-linux-android"]);
    assertEquals(await projectRust(project, "linux"), {
      RUSTUP_HOME: join(h.dir, "rustup"),
      CARGO_HOME: join(h.dir, "cargo"),
      bin: h.bin,
    });
    // A second run finds rustup there: nothing is downloaded, and the pin is installed again in case it moved.
    fetched.length = ran.length = 0;
    await installRust(project, deps);
    assertEquals(fetched, []);
    assertEquals(ran.map((r) => r.args[0]), ["toolchain", "target"]);
  } finally {
    await Deno.remove(project, { recursive: true });
  }
});

Deno.test("a rustup-init whose SHA-256 differs from the published one is never run", async () => {
  const { project, ran, deps } = await fakeInstall(new TextEncoder().encode("tampered"), "0".repeat(64));
  try {
    await assertRejects(() => installRust(project, deps), Error, "SHA-256");
    assertEquals(ran, []);
  } finally {
    await Deno.remove(project, { recursive: true });
  }
});

Deno.test("a project with no pin is told so", async () => {
  const { project, deps } = await fakeInstall(new Uint8Array(), "");
  try {
    await Deno.remove(join(project, "rust-toolchain.toml"));
    await assertRejects(() => installRust(project, deps), Error, "rust-toolchain.toml");
  } finally {
    await Deno.remove(project, { recursive: true });
  }
});

/** A machine where only the commands in `ok` succeed and only the paths in `files` exist. */
const probe = (os: Probe["os"], ok: Record<string, string>, files: string[] = [], osRelease?: string): Probe => ({
  os,
  env: { HOME: "/home/u" },
  run: (cmd, args) => {
    const key = [cmd.split(/[\\/]/).pop(), ...args].join(" ");
    const hit = Object.entries(ok).find(([k]) => key.startsWith(k));
    return Promise.resolve(hit ? { ok: true, out: hit[1] } : { ok: false, out: "" });
  },
  exists: (p) => Promise.resolve(files.includes(p)),
  read: () => Promise.resolve(osRelease ?? null),
});

Deno.test("admin-level prerequisites are found or named with the command that installs them, never installed", async () => {
  const linux = await prerequisites(probe("linux", { "cc --version": "" }, [], 'ID=ubuntu\nID_LIKE="debian"\n'));
  const webkit = linux.find((p) => p.name.startsWith("webkit2gtk"))!;
  assertEquals(webkit.found, false);
  assertStringIncludes(webkit.install, "sudo apt install libwebkit2gtk-4.1-dev");
  assertEquals(linux.filter((p) => p.platforms.includes("android")).map((p) => p.found), [false, false, false]);
  assertStringIncludes(linux.find((p) => p.name.startsWith("a JDK"))!.install, "openjdk-17-jdk");

  const sdk = "/home/u/Android/Sdk";
  const found = await prerequisites(
    probe("linux", { "pkg-config": "", "cc": "", "java -version": "" }, [join(sdk, "platform-tools")]),
  );
  assertEquals(found.find((p) => p.name.startsWith("webkit2gtk"))!.found, true);
  assertEquals(found.find((p) => p.name === "the Android SDK")!.found, true);
  assertEquals(found.find((p) => p.name.startsWith("a JDK"))!.found, true);

  const mac = await prerequisites(probe("darwin", { "xcode-select -p": "/Library/Developer/CommandLineTools" }));
  assertEquals(mac.slice(0, 2).map((p) => [p.name, p.found]), [["the Xcode command line tools", true], [
    "Xcode",
    false,
  ]]);

  const win = await prerequisites(probe("windows", {
    "vswhere.exe": "C:\\BuildTools\r\n",
    "reg query HKLM\\SOFTWARE\\WOW6432Node": "    pv    REG_SZ    130.0.2849.80\r\n",
  }));
  assertEquals(win.slice(0, 2).map((p) => p.found), [true, true]);
  const none = await prerequisites(probe("windows", {}));
  assertStringIncludes(none[0].install, "winget install --id Microsoft.VisualStudio.2022.BuildTools");
  assertEquals(none[1].install, "winget install --id Microsoft.EdgeWebView2Runtime");
  const lines = describePrerequisites(none, "on");
  assert(lines.some((l) => l.startsWith("missing: the WebView2 runtime (windows), which needs admin rights")));
  assertStringIncludes(lines.at(-1)!, "Smart App Control is on");
});

Deno.test("the Linux family and Smart App Control's state are read from what the system says", () => {
  assertEquals(linuxFamily("ID=fedora\n"), "fedora");
  assertEquals(linuxFamily('ID="linuxmint"\nID_LIKE="ubuntu debian"\n'), "debian");
  assertEquals(linuxFamily(null), "other");
  const reg = (v: string) =>
    `\r\nHKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy\r\n    VerifiedAndReputablePolicyState    REG_DWORD    ${v}\r\n`;
  assertEquals(smartAppControlState(reg("0x1")), "on");
  assertEquals(smartAppControlState(reg("0x2")), "evaluation");
  assertEquals(smartAppControlState(reg("0x0")), "off");
  assertEquals(smartAppControlState(""), "unknown");
});

Deno.test("the Windows app is launched by a scheduled task in the desktop session, with the script read from a file", () => {
  const l = sessionLaunch("C:\\proj\\.stance-ui\\platforms", true, "stance-ui-test");
  const ps = taskScript(l, "C:\\proj\\it's\\app.exe", "C:\\proj");
  assertStringIncludes(ps, "$env:STANCE_UI_E2E = Get-Content -Raw -LiteralPath ");
  assertStringIncludes(ps, "-FilePath 'C:\\proj\\it''s\\app.exe'");
  assertStringIncludes(ps, "-RedirectStandardOutput ");
  assertStringIncludes(ps, "Set-Content -LiteralPath ");
  assert(!taskScript(sessionLaunch("C:\\out", false), "a.exe", "C:\\").includes("STANCE_UI_E2E"));
  const c = taskCommands(l);
  assertEquals(c.create.slice(0, 3), ["/Create", "/TN", "stance-ui-test"]);
  assert(c.create.includes("/IT"), "the task runs in the desktop session of the signed-in user");
  assertStringIncludes(c.create[4], `-File "${l.script}"`);
  assertEquals(c.run, ["/Run", "/TN", "stance-ui-test"]);
  assertEquals(c.remove, ["/Delete", "/TN", "stance-ui-test", "/F"]);
  const quser = (out: string) => desktopSignedIn({ ok: true, out });
  assertEquals(quser(" USERNAME  SESSIONNAME  ID  STATE\n>me  console  1  Active\n"), true);
  assertEquals(quser(" USERNAME  SESSIONNAME  ID  STATE\n me    2  Disc\n"), false);
  assertEquals(quser(""), null);
});
