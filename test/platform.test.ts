import { assert, assertEquals, assertRejects } from "@std/assert";
import { BridgeError, localBridge, webBridge } from "../src/lib/platform/bridge.ts";
import * as old from "../src/lib/platform/port.ts";
import { bridgeHandler, portHandler, serveBridge, servePort } from "../platform/server.ts";
import { labelFor } from "../examples/calculator/logic/host.ts";
import { webHandlers } from "../examples/calculator/bridge.ts";
import { adopt } from "../scripts/adopt.ts";
import { checkPlatforms, platformFindings } from "../checks/platforms.ts";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

Deno.test("the local bridge answers from its handlers and refuses an unknown command", async () => {
  const bridge = localBridge({ twice: ({ n }) => (n as number) * 2 });
  assertEquals(await bridge.call("twice", { n: 21 }), 42);
  await assertRejects(() => bridge.call("thrice"), BridgeError, "thrice: no such command");
});

Deno.test("the web bridge and the Deno server speak the same contract as the local bridge", async () => {
  const handlers = {
    ...webHandlers,
    twice: ({ n }: { [k: string]: unknown }) => (n as number) * 2,
    broken: () => {
      throw new Error("out of order");
    },
  };
  const handle = bridgeHandler({ handlers });
  const bridge = webBridge("http://app.test/bridge", (input, init) => handle(new Request(input as string, init)));
  assertEquals(await bridge.call("twice", { n: 21 }), 42);
  assertEquals(await bridge.call("describe"), await localBridge(webHandlers).call("describe"));
  await assertRejects(() => bridge.call("thrice"), Error, "no such command: thrice");
  await assertRejects(() => bridge.call("broken"), Error, "out of order");
  const notJson = await handle(new Request("http://app.test/bridge/twice", { method: "POST", body: "[1]" }));
  assertEquals(notJson.status, 400);
  await notJson.body?.cancel();
  const get = await handle(new Request("http://app.test/bridge/twice"));
  assertEquals(get.status, 405);
  await get.body?.cancel();
});

Deno.test("the old port names and the /port prefix still work, deprecated, for one more release", async () => {
  assertEquals([old.localPort, old.webPort, old.tauriPort], [localBridge, webBridge, old.tauriBridge]);
  assertEquals(old.PortError, BridgeError);
  assertEquals([portHandler, servePort], [bridgeHandler, serveBridge]);
  const handle = portHandler({ handlers: { twice: ({ n }) => (n as number) * 2 } });
  const legacy = old.webPort("http://app.test/port", (input, init) => handle(new Request(input as string, init)));
  assertEquals(await legacy.call("twice", { n: 21 }), 42);
  // A prefix given by name is the only one answered.
  const named = await bridgeHandler({ handlers: { twice: () => 0 }, prefix: "/api" })(
    new Request("http://app.test/port/twice", { method: "POST" }),
  );
  assertEquals(named.status, 404);
  await named.body?.cancel();
});

Deno.test("the server gives the built page as static files", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${dir}/index.html`, "<p>page</p>");
    const res = await bridgeHandler({ handlers: {}, static: dir })(new Request("http://app.test/"));
    assertEquals(await res.text(), "<p>page</p>");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("the calculator says where it runs from the bridge's description", () => {
  assertEquals(labelFor({ platform: "web", shell: "browser" }), "Web page");
  assertEquals(labelFor({ platform: "macos", shell: "tauri" }), "macOS app");
  assertEquals(labelFor({ platform: "ios", shell: "tauri" }), "iOS app");
});

Deno.test("the calculator's Tauri shell is the stance's template, with only its own configuration", async () => {
  const files = async (dir: string, rel = ""): Promise<string[]> => {
    const out: string[] = [];
    for await (const e of Deno.readDir(`${dir}/${rel}`)) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory && !["target", "gen"].includes(e.name)) out.push(...await files(dir, p));
      else if (e.isFile) out.push(p);
    }
    return out.sort();
  };
  const template = `${root}/platform/tauri`;
  const example = `${root}/examples/calculator/src-tauri`;
  const own = new Set(["tauri.conf.json", "Cargo.lock"]);
  const shared = (await files(template)).filter((f) => !own.has(f));
  assertEquals((await files(example)).filter((f) => !own.has(f)), shared);
  for (const f of shared) {
    assertEquals(await Deno.readFile(`${example}/${f}`), await Deno.readFile(`${template}/${f}`), f);
  }
});

Deno.test("adopt adds the bridge, and the Tauri shell and the server when asked", async () => {
  const project = await Deno.makeTempDir();
  try {
    let lines = await adopt(project, { mood: "white" });
    assert(lines.includes("copied src/lib/ui/platform/bridge.ts"));
    assert(lines.includes("copied src/lib/ui/platform/port.ts"));
    assert(!lines.some((l) => l.includes("src-tauri")));
    lines = await adopt(project, { tauri: true, server: true });
    assert(lines.includes("copied src-tauri/tauri.conf.json"));
    assert(lines.includes("copied src-tauri/src/bridge.rs"));
    assert(lines.includes("copied server/bridge-server.ts"));
    const record = JSON.parse(await Deno.readTextFile(`${project}/stance-ui.json`));
    assertEquals(record.platforms, { tauri: true, server: true });
  } finally {
    await Deno.remove(project, { recursive: true });
  }
});

Deno.test("a platform the machine cannot reach is skipped with the reason, never passed", async () => {
  const out = await Deno.makeTempDir();
  try {
    const other = Deno.build.os === "windows" ? "linux" : "windows";
    const reports = await checkPlatforms(root, { app: "examples/calculator", e2e: null }, { only: [other], out });
    assertEquals(reports.length, 1);
    assertEquals([reports[0].built, reports[0].launched, reports[0].endToEnd], [false, false, false]);
    assert(reports[0].skipped);
    const [finding] = platformFindings(reports, root);
    assertEquals(finding.level, "note");
    assert(finding.message.includes("skipped"));
    assertEquals(
      platformFindings([{ platform: "ios", built: true, launched: false, endToEnd: false, failed: "x" }], root)[0]
        .level,
      "problem",
    );
  } finally {
    await Deno.remove(out, { recursive: true });
  }
});
