import { assert, assertEquals, assertRejects } from "@std/assert";
import { copy } from "@std/fs";
import { fromFileUrl } from "@std/path";
import { runChecks } from "../checks/run.ts";
import { AGENT_ANSWER, AGENT_FEED, agentEndpoint, agentTools } from "../platform/agent-endpoint.ts";
import { bridgeMcp } from "../platform/bridge-mcp.ts";
import { adopt } from "../scripts/adopt.ts";
import * as page from "../src/lib/agent/agent.ts";
import { localBridge } from "../src/lib/platform/bridge.ts";

const root = fromFileUrl(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const fixture = fromFileUrl(new URL("./fixtures/parity", import.meta.url));
const CHECKS = ["transitions", "agent-endpoint"] as const;

/** The fixture, copied, with each file in `edits` rewritten by its function; the problems the two checks find in it. */
async function broken(edits: { [file: string]: (text: string) => string }): Promise<string[]> {
  const dir = await Deno.makeTempDir();
  try {
    await copy(fixture, dir, { overwrite: true });
    for (const [file, edit] of Object.entries(edits)) {
      await Deno.writeTextFile(`${dir}/${file}`, edit(await Deno.readTextFile(`${dir}/${file}`)));
    }
    return (await runChecks(dir, CHECKS)).filter((f) => f.level === "problem").map((f) =>
      `${f.check} ${f.file}: ${f.message}`
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}
const refused = (found: string[], text: string) =>
  assert(found.some((m) => m.includes(text)), `${text}\n${found.join("\n")}`);

Deno.test("agent parity: a project whose components call only registered transitions and whose MCP server imports only the channel passes", async () => {
  assertEquals(await broken({}), []);
});

Deno.test("a component that calls what the registry does not list is refused, whichever way it reaches the machine", async () => {
  const found = await broken({
    "src/App.svelte": (t) =>
      t.replace(
        "<button onclick={counter.reset}>",
        "<button onclick={() => counter.poke(2)}>{store.counter.poke}{notes['write']}{counter.nope()}</button><button onclick={counter.reset}>",
      ),
  });
  refused(found, "uses counter.poke, which is not a transition in the registry");
  refused(found, "uses counter.nope, which is not a transition in the registry");
  refused(found, "computed member");
  assertEquals(found.length, 4, found.join("\n"));
});

Deno.test("a machine the registry does not know, and a store taken apart by a pattern that cannot be followed, are refused", async () => {
  const found = await broken({
    "src/App.svelte": (t) =>
      t.replace("const { counter } = store;", "const { counter, ghost } = store;\n  const { ...rest } = store;"),
  });
  refused(found, "the store's machine ghost is not in the registry");
  refused(found, "cannot be followed");
});

Deno.test("a registry that no longer matches the machines, or is missing, is refused", async () => {
  refused(
    await broken({
      "src/machines/counter.svelte.ts": (t) =>
        t.replace("  #bump", "  /** Does it twice. */\n  twice(): boolean {\n    return true;\n  }\n\n  #bump"),
    }),
    "is not what the machines generate now: run deno task transitions",
  );
  const dir = await Deno.makeTempDir();
  try {
    await copy(fixture, dir, { overwrite: true });
    await Deno.remove(`${dir}/src/transitions.generated.ts`);
    refused(
      (await runChecks(dir, CHECKS)).map((f) => `${f.file}: ${f.message}`),
      "no registry: run deno task transitions",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("a transition with no comment, and a file with two machines, are refused", async () => {
  refused(
    await broken({ "src/machines/notes.svelte.ts": (t) => t.replace("  /** Writes a note at the end. */\n", "") }),
    "notes.write has no comment",
  );
  refused(
    await broken({
      "src/machines/notes.svelte.ts": (t) => t + "\nexport class Other {\n  readonly view = {};\n}\n",
    }),
    "defines Notes and Other, each with a view: one machine to a file",
  );
  refused(
    await broken({ "src/app.svelte.ts": (t) => t.replace("new Counter()", "new Counter(), again: new Notes()") }),
    "holds the machines again and notes: one file for each machine",
  );
});

Deno.test("an MCP server file that imports app logic, a package or a computed path is refused; types and the standard library are not", async () => {
  const found = await broken({
    "server/mcp.ts": (t) =>
      t + `import { Counter } from "../src/machines/counter.svelte.ts";
import { makeStore } from "../src/app.svelte.ts";
import left from "left-pad";
import { join } from "node:path";
import { assert } from "@std/assert";
const lazy = await import("../src/machines/" + join("a", "b"));
export * from "../src/machines/notes.svelte.ts";
void [Counter, makeStore, left, assert, lazy];
`,
  });
  refused(found, 'imports "../src/machines/counter.svelte.ts": is app logic');
  refused(found, 'imports "../src/app.svelte.ts": is app logic');
  refused(found, 'imports "left-pad": is a package');
  refused(found, 'imports "../src/machines/notes.svelte.ts": is app logic');
  refused(found, "an import of a computed path cannot be checked");
  assertEquals(found.length, 5, found.join("\n"));
});

// The agent's tools over the channel, end to end: an endpoint as the server has it, the page serving its store.

class Counter {
  n = 0;
  readonly view = { count: 0 };
  allowed(e: { type: string }) {
    return e.type === "add" ? this.n < 2 : true;
  }
  add() {
    this.n++;
    this.view.count = this.n;
    return true;
  }
  put(text: string, times = 1) {
    this.n += text.length * times;
    this.view.count = this.n;
    return true;
  }
  secret(_word: string) {
    return true;
  }
}
const registry = [
  { machine: "counter", name: "add", args: [], description: "Adds one.", sequence: false },
  {
    machine: "counter",
    name: "put",
    args: [{ name: "text", type: "string" }, { name: "times", type: "number", optional: true }],
    description: "Adds the length.",
  },
  {
    machine: "counter",
    name: "secret",
    args: [{ name: "word", type: "string" }],
    description: "A secret.",
    person: true,
  },
] as const;

function channel(options: { open?: boolean; timeoutMs?: number } = {}) {
  const machines = { counter: new Counter() };
  const agent = agentEndpoint({ timeoutMs: options.timeoutMs });
  // The page's bridge to the server, in process: the server's feed and command, as the bridge's contract has them.
  const bridge = localBridge(agent.handlers, agent.feeds);
  const stop = options.open === false ? () => {} : page.serveAgent({
    bridge,
    machines,
    registry,
    snapshot: () => ({ counter: { ...machines.counter.view } }),
  });
  const call = (tool: string, args: { [k: string]: unknown } = {}) =>
    agent.handlers[tool]!(args as never) as Promise<any>; // deno-lint-ignore no-explicit-any
  return { machines, call, stop };
}

Deno.test("the page and the server agree on the channel's names", () => {
  assertEquals([page.AGENT_FEED, page.AGENT_ANSWER], [AGENT_FEED, AGENT_ANSWER]);
});

Deno.test("store reads the page's snapshot, narrowed and cut; transitions lists the registry with what is allowed now", async () => {
  const { call, machines, stop } = channel();
  assertEquals(await call("store", {}), { counter: { count: 0 } });
  assertEquals(await call("store", { machine: "counter", path: "counter.count" }), 0);
  await assertRejects(() => call("store", { machine: "nope" }), Error, "no machine nope");
  const list = await call("transitions", {});
  assertEquals(list.map((t: { name: string; allowed: boolean | null }) => [t.name, t.allowed]), [
    ["add", true],
    ["put", null],
    ["secret", null],
  ]);
  assertEquals(list[2].person, true);
  assertEquals((await call("transitions", { machine: "counter", name: "put", args: { text: "ab" } }))[0].allowed, true);
  machines.counter.n = 2;
  assertEquals((await call("transitions", { machine: "counter", name: "add" }))[0].allowed, false);
  stop();
});

Deno.test("transition calls the machine's own method, by name and with its arguments by name, and says what the machine shows", async () => {
  const { call, machines, stop } = channel();
  assertEquals(await call("transition", { machine: "counter", name: "add" }), {
    done: true,
    shows: { counter: { count: 1 } },
  });
  assertEquals((await call("transition", { machine: "counter", name: "put", args: { text: "abc", times: 2 } })).shows, {
    counter: { count: 7 },
  });
  assertEquals(machines.counter.n, 7);
  // Refused: not allowed now (nothing changes), not in the registry, missing arguments, for the person alone.
  assertEquals((await call("transition", { machine: "counter", name: "add" })).done, false);
  assertEquals(machines.counter.n, 7);
  await assertRejects(() => call("transition", { machine: "counter", name: "poke" }), Error, "is not in the registry");
  await assertRejects(() => call("transition", { machine: "counter", name: "put" }), Error, "needs text");
  await assertRejects(
    () => call("transition", { machine: "counter", name: "secret", args: { word: "x" } }),
    Error,
    "for the person alone",
  );
  stop();
});

Deno.test("with no page open, or one that does not answer, a call says so", async () => {
  await assertRejects(() => channel({ open: false }).call("store"), Error, "no page is open");
  const slow = agentEndpoint({ timeoutMs: 20 });
  slow.feeds[AGENT_FEED]!(() => {});
  await assertRejects(async () => await slow.handlers["store"]!({}), Error, "did not answer store");
});

Deno.test("the three tools are described from the registry, and served as MCP tools over the endpoint's handlers", async () => {
  const tools = agentTools(registry);
  assertEquals(Object.keys(tools), ["store", "transitions", "transition"]);
  assert(
    tools["transition"]!.description.length > 0 && JSON.stringify(tools["transition"]).includes('"enum":["counter"]'),
  );
  const { call, stop } = channel();
  const mcp = bridgeMcp({ name: "t", version: "1", handlers: { store: (a) => call("store", a) }, tools });
  const list = await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }) as { result: { tools: { name: string }[] } };
  assertEquals(list.result.tools.map((t) => t.name), ["store"], "a tool with no handler is not offered");
  const shown = await mcp({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "store", arguments: {} },
  }) as {
    result: { structuredContent: unknown };
  };
  assertEquals(shown.result.structuredContent, { counter: { count: 0 } });
  stop();
});

Deno.test("yes to MCP at adoption scaffolds the registry, the agent endpoint and the three tools, and the checks hold the copy", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const lines = await adopt(dir, { mcp: true });
    for (
      const file of [
        "server/mcp.ts",
        "server/agent-endpoint.ts",
        "server/bridge-mcp.ts",
        "server/bridge-server.ts",
        "src/lib/ui/agent/agent.ts",
        "scripts/stance-ui-transitions.ts",
        "src/transitions.generated.ts",
      ]
    ) assert(await Deno.stat(`${dir}/${file}`).then(() => true, () => false), file);
    assert(lines.some((l) => l.startsWith("generated src/transitions.generated.ts: ")), lines.join("\n"));
    const record = JSON.parse(await Deno.readTextFile(`${dir}/stance-ui.json`));
    assertEquals(record.platforms, { tauri: false, server: true, mcp: true });
    assertEquals(record.check.transitions.server, ["server/mcp.ts", "server/agent-endpoint.ts"]);
    const mcp = await Deno.readTextFile(`${dir}/server/mcp.ts`);
    assert(mcp.includes("agentTools(registry)") && mcp.includes("describe"));
    const main = await Deno.readTextFile(`${dir}/src/main.ts`);
    assert(main.includes('serveAgent({ bridge: webBridge("/bridge")'));
    const registry = await Deno.readTextFile(`${dir}/src/transitions.generated.ts`);
    for (const name of ['"machine":"counter","name":"add"', '"machine":"theme","name":"choose"']) {
      assert(registry.includes(name), name);
    }
    const found = (await runChecks(dir, CHECKS)).filter((f) => f.level === "problem");
    assertEquals(found, []);
    // The copy is the stance's own: a change to a copied file is named by status, and a second adopt keeps it quiet.
    assertEquals((await adopt(dir, {})).filter((l) => l.startsWith("copied") || l.startsWith("updated")), []);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
  assert(root.length > 0);
});

Deno.test("no to MCP sets up none of it, and a project that never answered is asked", async () => {
  const no = await Deno.makeTempDir();
  const asked = await Deno.makeTempDir();
  try {
    await adopt(no, { mcp: false });
    assertEquals(await Deno.stat(`${no}/server/agent-endpoint.ts`).then(() => true, () => false), false);
    assertEquals(JSON.parse(await Deno.readTextFile(`${no}/stance-ui.json`)).check.transitions, undefined);
    assertEquals(await runChecks(no, CHECKS), []);
    const lines = await adopt(asked, {});
    assert(
      lines.some((l) => l.startsWith("asked: should agents read and act on the app as an MCP server")),
      lines.join("\n"),
    );
  } finally {
    await Deno.remove(no, { recursive: true });
    await Deno.remove(asked, { recursive: true });
  }
});
