import { assert, assertEquals, assertRejects } from "@std/assert";
import { localPort, webPort } from "../src/lib/platform/port.ts";
import { portHandler } from "../platform/server.ts";
import { labelFor } from "../examples/calculator/logic/host.ts";
import { webHandlers } from "../examples/calculator/port.ts";
import { adopt } from "../scripts/adopt.ts";
import { checkPlatforms, platformFindings } from "../checks/platforms.ts";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

Deno.test("the local port answers from its handlers and refuses an unknown command", async () => {
  const port = localPort({ twice: ({ n }) => (n as number) * 2 });
  assertEquals(await port.call("twice", { n: 21 }), 42);
  await assertRejects(() => port.call("thrice"), Error, "thrice: no such command");
});

Deno.test("the web port and the Deno server speak the same contract as the local port", async () => {
  const handlers = {
    ...webHandlers,
    twice: ({ n }: { [k: string]: unknown }) => (n as number) * 2,
    broken: () => {
      throw new Error("out of order");
    },
  };
  const handle = portHandler({ handlers });
  const port = webPort("http://app.test/port", (input, init) => handle(new Request(input as string, init)));
  assertEquals(await port.call("twice", { n: 21 }), 42);
  assertEquals(await port.call("describe"), await localPort(webHandlers).call("describe"));
  await assertRejects(() => port.call("thrice"), Error, "no such command: thrice");
  await assertRejects(() => port.call("broken"), Error, "out of order");
  const notJson = await handle(new Request("http://app.test/port/twice", { method: "POST", body: "[1]" }));
  assertEquals(notJson.status, 400);
  await notJson.body?.cancel();
  const get = await handle(new Request("http://app.test/port/twice"));
  assertEquals(get.status, 405);
  await get.body?.cancel();
});

Deno.test("the server gives the built page as static files", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${dir}/index.html`, "<p>page</p>");
    const res = await portHandler({ handlers: {}, static: dir })(new Request("http://app.test/"));
    assertEquals(await res.text(), "<p>page</p>");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("the calculator says where it runs from the port's description", () => {
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

Deno.test("adopt adds the port, and the Tauri shell and the server when asked", async () => {
  const project = await Deno.makeTempDir();
  try {
    let lines = await adopt(project, { mood: "white" });
    assert(lines.includes("copied src/lib/ui/platform/port.ts"));
    assert(!lines.some((l) => l.includes("src-tauri")));
    lines = await adopt(project, { tauri: true, server: true });
    assert(lines.includes("copied src-tauri/tauri.conf.json"));
    assert(lines.includes("copied src-tauri/src/port.rs"));
    assert(lines.includes("copied server/port-server.ts"));
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
