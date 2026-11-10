// The app's server for agents, from one process: the built page and the bridge over HTTP, and the same bridge as an
// MCP server on the standard input and output. An agent's client starts it (the command `deno`, the arguments
// `run -A server/mcp.ts`, after `deno task build`); the person opens the page it serves, and what the agent reads and
// does reaches that page's store.
//
// This file holds no logic of the app, and the check `agent-endpoint` refuses an import of any: the three tools,
// `store`, `transitions` and `transition`, are the page's own, reached over the agent channel (agent-endpoint.ts),
// described from the registry of transitions. Your own commands, the bridge's read and act tools, go in `mine` and
// `tools` below, as commands of the bridge, which the page may call as well.
import { agentEndpoint, agentTools } from "./agent-endpoint.ts";
import { bridgeMcp, serveMcpLines } from "./bridge-mcp.ts";
import { bridgeHandler } from "./bridge-server.ts";
import { registry } from "../src/transitions.generated.ts";

const PORT = 8000;
const agent = agentEndpoint();

// The bridge's read and act tools: a read one, to start from.
const mine = {
  describe: () => ({ platform: Deno.build.os, page: `http://127.0.0.1:${PORT}/` }),
};
const handlers = { ...agent.handlers, ...mine };

Deno.serve({
  port: PORT,
  hostname: "127.0.0.1",
  // Standard output is the MCP stream: nothing else goes there.
  onListen: ({ port }) => console.error(`the page and the bridge are at http://127.0.0.1:${port}/`),
}, bridgeHandler({ handlers, feeds: agent.feeds, static: "dist" }));

const mcp = bridgeMcp({
  name: "app",
  version: "1.0.0",
  instructions:
    "Open the page at the address the server prints, then read the app with `store` and act with `transition`; `transitions` lists what can be done.",
  handlers,
  tools: { ...agentTools(registry), describe: { description: "Where the app is served, and on what system." } },
});

async function* lines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let rest = "";
  for await (const chunk of stream) {
    rest += decoder.decode(chunk, { stream: true });
    let at: number;
    while ((at = rest.indexOf("\n")) >= 0) {
      yield rest.slice(0, at);
      rest = rest.slice(at + 1);
    }
  }
  if (rest) yield rest;
}

const encoder = new TextEncoder();
await serveMcpLines(mcp, lines(Deno.stdin.readable), (line) => void Deno.stdout.writeSync(encoder.encode(line + "\n")));
