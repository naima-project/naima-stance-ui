import { assert, assertEquals } from "@std/assert";
import { bridgeMcp, MCP_VERSIONS, serveMcpLines } from "../platform/bridge-mcp.ts";
import { adopt } from "../scripts/adopt.ts";

const handlers = {
  twice: ({ n }: { [k: string]: unknown }) => (n as number) * 2,
  describe: () => ({ app: "test" }),
  broken: () => {
    throw new Error("out of order");
  },
  hidden: () => "never a tool",
};
const tools = {
  twice: { description: "doubles n", inputSchema: { type: "object", properties: { n: { type: "number" } } } },
  describe: { description: "the app" },
  broken: { description: "always fails" },
};

Deno.test("the bridge as an MCP server lists the commands the app offers, and only those", async () => {
  const mcp = bridgeMcp({ name: "test", version: "1.0.0", handlers, tools, instructions: "be kind" });
  const init = await mcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } });
  assertEquals((init as { result: { protocolVersion: string } }).result.protocolVersion, "2025-03-26");
  assertEquals((init as { result: { instructions: string } }).result.instructions, "be kind");
  const newer = await mcp({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2099-01-01" } });
  assertEquals((newer as { result: { protocolVersion: string } }).result.protocolVersion, MCP_VERSIONS[0]);
  assertEquals(await mcp({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  const list = await mcp({ jsonrpc: "2.0", id: 3, method: "tools/list" }) as { result: { tools: { name: string }[] } };
  assertEquals(list.result.tools.map((t) => t.name), ["twice", "describe", "broken"]);
});

Deno.test("a tool call answers the command's JSON, and a command that throws answers a tool error", async () => {
  const mcp = bridgeMcp({ name: "test", version: "1.0.0", handlers, tools });
  const call = (name: string, args: unknown) =>
    mcp({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } as never }) as Promise<
      { result?: { content: { text: string }[]; structuredContent?: unknown; isError: boolean }; error?: unknown }
    >;
  assertEquals((await call("twice", { n: 21 })).result?.content[0]?.text, "42");
  assertEquals((await call("describe", {})).result?.structuredContent, { app: "test" });
  const broken = await call("broken", {});
  assert(broken.result?.isError);
  assertEquals(broken.result?.content[0]?.text, "out of order");
  assert((await call("hidden", {})).error, "a command not offered is no tool");
  const unknown = await mcp({ jsonrpc: "2.0", id: 4, method: "resources/list" }) as { error: { code: number } };
  assertEquals(unknown.error.code, -32601);
});

Deno.test("the stdio transport answers each line with one line, and ignores notifications", async () => {
  const mcp = bridgeMcp({ name: "test", version: "1.0.0", handlers, tools });
  async function* lines() {
    yield JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });
    yield JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });
    yield "not json";
    yield JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "twice", arguments: { n: 2 } },
    });
  }
  const out: string[] = [];
  await serveMcpLines(mcp, lines(), (l) => out.push(l));
  const answers = out.map((l) => JSON.parse(l));
  assertEquals(answers.length, 3);
  assertEquals(answers.find((a) => a.id === 1).result, {});
  assertEquals(answers.find((a) => a.id === 2).result.content[0].text, "4");
  assertEquals(answers.find((a) => a.id === null).error.code, -32700);
});

Deno.test("adopt asks whether the bridge is served to agents over MCP, and records the answer", async () => {
  const project = await Deno.makeTempDir();
  try {
    let lines = await adopt(project, { mood: "white", scaffold: false });
    assert(lines.some((l) => l.startsWith("asked: should agents read and act through the app's bridge")));
    let record = JSON.parse(await Deno.readTextFile(`${project}/stance-ui.json`));
    assertEquals(record.platforms.mcp, undefined);
    lines = await adopt(project, { mcp: true, scaffold: false });
    assert(lines.includes("copied server/bridge-mcp.ts"));
    assert(!lines.some((l) => l.startsWith("asked:")));
    record = JSON.parse(await Deno.readTextFile(`${project}/stance-ui.json`));
    assertEquals(record.platforms.mcp, true);
    lines = await adopt(project, { scaffold: false });
    assert(!lines.some((l) => l.startsWith("asked:")), "the answer recorded is not asked again");
  } finally {
    await Deno.remove(project, { recursive: true });
  }
});
