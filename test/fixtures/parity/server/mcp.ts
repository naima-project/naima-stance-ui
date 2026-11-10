// The fixture's MCP server: the channel, the bridge's own modules and the registry; the app only as a type.
import type { AppStore } from "../src/app.svelte.ts";
import { agentEndpoint, agentTools } from "./agent-endpoint.ts";
import { bridgeMcp } from "./bridge-mcp.ts";
import { registry } from "../src/transitions.generated.ts";
import { argv } from "node:process";

export type Shown = AppStore;
const agent = agentEndpoint();
export const server = bridgeMcp({
  name: argv[2] ?? "fixture",
  version: "1.0.0",
  handlers: agent.handlers,
  tools: agentTools(registry),
});
