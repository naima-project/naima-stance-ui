// The server's half of agent parity: the channel between an agent's MCP tools and the page. It holds no app logic and
// imports nothing but types, like the request handler. An agent's call becomes a request on a feed of the bridge the
// page already listens to (`agent`); the page runs it on its store and answers with the `agent-answer` command; the
// call returns that answer. So the three tools, `store`, `transitions` and `transition`, are the page's own functions
// seen from outside, over the channel the UI already has to its server, and never a second API.
//
//   const agent = agentEndpoint();
//   bridgeHandler({ handlers: { ...agent.handlers, ...mine }, feeds: agent.feeds });
//   bridgeMcp({ ..., handlers: { ...agent.handlers, ...mine }, tools: { ...agentTools(registry), ...myTools } });
//
// With no page open there is nothing to read or act on, and a call says so. With several, the one that connected last
// answers, so that a transition is never taken twice. The registry is the generated one (scripts/transitions.ts).

import type { Feeds, Handlers, Json } from "./bridge-handler.ts";
import type { McpTool } from "./bridge-mcp.ts";

/** The registry's entries, as the generated file has them. */
export interface RegistryEntry {
  readonly machine: string;
  readonly name: string;
  readonly args: readonly { readonly name: string; readonly type: string; readonly optional?: boolean }[];
  readonly description: string;
  readonly sequence?: boolean;
  readonly person?: boolean;
}

/** The names the page and the server agree on: the same as the page's src/lib/agent/agent.ts, tested to match. */
export const AGENT_FEED = "agent";
export const AGENT_ANSWER = "agent-answer";

export interface AgentEndpoint {
  /** The three tools' handlers, and the command the page answers on. */
  handlers: Handlers;
  /** The feed the page listens to. */
  feeds: Feeds;
}

/** How long a call waits for the page, in milliseconds, before it says the page did not answer. */
const WAIT_MS = 10_000;

export function agentEndpoint(options: { timeoutMs?: number } = {}): AgentEndpoint {
  const wait = options.timeoutMs ?? WAIT_MS;
  const pages: ((event: Json) => void)[] = [];
  const waiting = new Map<string, { ok: (answer: Json) => void; fail: (error: Error) => void }>();
  let next = 0;
  const ask = (tool: string) => (args: { [key: string]: Json }): Promise<Json> =>
    new Promise((ok, fail) => {
      const page = pages.at(-1);
      if (!page) return fail(new Error("no page is open: open the app, then ask again"));
      const id = `a${++next}`;
      const timer = setTimeout(() => {
        waiting.delete(id);
        fail(new Error(`the page did not answer ${tool} in ${wait / 1000} s`));
      }, wait);
      waiting.set(id, {
        ok: (a) => (clearTimeout(timer), ok(a)),
        fail: (e) => (clearTimeout(timer), fail(e)),
      });
      page({ id, tool, args });
    });
  return {
    handlers: {
      store: ask("store"),
      transitions: ask("transitions"),
      transition: ask("transition"),
      [AGENT_ANSWER]: (a) => {
        const w = waiting.get(String(a["id"]));
        if (!w) return null;
        waiting.delete(String(a["id"]));
        if (a["ok"] === true) w.ok(a["answer"] ?? null);
        else w.fail(new Error(String(a["error"] ?? "the page refused")));
        return null;
      },
    },
    feeds: {
      [AGENT_FEED]: (emit) => {
        pages.push(emit);
        return () => {
          const at = pages.indexOf(emit);
          if (at >= 0) pages.splice(at, 1);
        };
      },
    },
  };
}

/** The three tools, described from the registry so that an agent knows the machines before it asks. */
export function agentTools(registry: readonly RegistryEntry[]): { [tool: string]: McpTool } {
  const machines = [...new Set(registry.map((t) => t.machine))];
  const listing = machines.map((m) => `${m} (${registry.filter((t) => t.machine === m).map((t) => t.name).join(", ")})`)
    .join("; ");
  return {
    store: {
      description:
        "Read what the app shows now: the one store's snapshot, the same state the user sees. Narrow it with machine and path; " +
        "it is cut to depth and limit, so ask again for more of one part. Machines: " + machines.join(", ") + ".",
      inputSchema: {
        type: "object",
        properties: {
          machine: { type: "string", description: "One machine's name; omit for all." },
          path: { type: "string", description: "Dot-separated path into the answer, e.g. tasks.tasks.0.title." },
          depth: { type: "number", description: "Levels to show, 3 by default." },
          limit: { type: "number", description: "Entries of an array or object to show, 20 by default." },
        },
      },
    },
    transitions: {
      description:
        "List what the app can be told to do: every machine's transitions, with their arguments, what each does and whether " +
        "the machine allows it now (null when that depends on arguments: give machine, name and args to ask). The user's " +
        "buttons call these same transitions. " + listing + ".",
      inputSchema: {
        type: "object",
        properties: {
          machine: { type: "string" },
          name: { type: "string" },
          args: {
            type: "object",
            description: "Arguments by name, to ask whether one transition is allowed with them.",
          },
        },
      },
    },
    transition: {
      description:
        "Do what the user could do: call one transition of one machine, by name, with its arguments by name. It answers " +
        "whether the machine took it, and the machine's state after. A transition not allowed now changes nothing.",
      inputSchema: {
        type: "object",
        properties: {
          machine: { type: "string", enum: machines },
          name: { type: "string" },
          args: { type: "object", description: "The transition's arguments by name." },
        },
        required: ["machine", "name"],
      },
    },
  };
}
