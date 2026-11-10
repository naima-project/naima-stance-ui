// The page's half of agent parity: three tools, `store`, `transitions` and `transition`, that run on the app's one
// store and nowhere else. An agent reaches them over the bridge the page already has to its server (a feed the server
// pushes its requests on, a command the page answers with), never over an API of its own, and they do exactly what
// a component does: read the store, call a machine's transition. They hold no logic about any app: what a machine
// can do is the registry, generated from the machines' own files (scripts/transitions.ts), and whether it can do it
// now is the machine's own `allowed`.
//
// A machine's `allowed(event)` is asked with the event that names the transition: `{ type: <name>, <arg>: <value> }`,
// the shape naima-codegen's machines take. A machine without `allowed` answers null, "not known".

import type { Bridge, Json } from "../platform/bridge.ts";

/** One transition of one machine, as the generated registry lists it. */
export interface TransitionInfo {
  readonly machine: string;
  readonly name: string;
  readonly args: readonly { readonly name: string; readonly type: string; readonly optional?: boolean }[];
  readonly description: string;
  /** A named sequence of transitions of the machines, a convenience that components and agents call alike. */
  readonly sequence?: boolean;
  /** Only a person takes it, as a sign-in with a password: an agent's call is refused. */
  readonly person?: boolean;
}
export type Registry = readonly TransitionInfo[];

/** The feed the server pushes agent requests on, and the command the page answers each with. */
export const AGENT_FEED = "agent";
export const AGENT_ANSWER = "agent-answer";

export type AgentTool = "store" | "transitions" | "transition";
export type AgentRequest = { id: string; tool: AgentTool; args: { [key: string]: Json } };

type Machines = { readonly [name: string]: unknown };
type Machine = { allowed?: (event: object) => boolean } & { [name: string]: unknown };

const isObject = (v: unknown): v is { [key: string]: Json } => typeof v === "object" && v !== null && !Array.isArray(v);

/** A value cut to `depth` levels and `limit` entries an array or object, so that a long list answers briefly. */
export function compact(value: unknown, depth = 3, limit = 20): Json {
  if (value === undefined) return null;
  if (typeof value !== "object" || value === null) return value as Json;
  if (depth <= 0) return Array.isArray(value) ? `[${value.length} items]` : "{…}";
  if (Array.isArray(value)) {
    const items = value.slice(0, limit).map((v) => compact(v, depth - 1, limit));
    return value.length > limit ? [...items, `… ${value.length - limit} more`] : items;
  }
  const out: { [key: string]: Json } = {};
  const keys = Object.keys(value);
  for (const k of keys.slice(0, limit)) out[k] = compact((value as { [k: string]: unknown })[k], depth - 1, limit);
  if (keys.length > limit) out["…"] = `${keys.length - limit} more`;
  return out;
}

/**
 * `store`: what the machines show now. `machine` (a name, or a list) and `path` (dot-separated, into a machine's
 * view, with an array's index) narrow it; `depth` and `limit` cut it short, three levels and twenty entries by default.
 */
export function readStore(snapshot: () => unknown, args: { [key: string]: Json }): Json {
  let value = snapshot();
  const asked = args["machine"];
  const names = typeof asked === "string" ? [asked] : Array.isArray(asked) ? asked.map(String) : null;
  if (names && isObject(value)) {
    for (const n of names) {
      if (!Object.hasOwn(value, n)) {
        throw new Error(`no machine ${n}: the store has ${Object.keys(value).join(", ")}`);
      }
    }
    value = Object.fromEntries(names.map((n) => [n, (value as { [k: string]: unknown })[n]]));
  }
  const path = typeof args["path"] === "string" ? args["path"].split(".").filter(Boolean) : [];
  for (const [i, key] of path.entries()) {
    if (typeof value !== "object" || value === null || !(key in value)) {
      throw new Error(`nothing at ${path.slice(0, i + 1).join(".")}`);
    }
    value = (value as { [k: string]: unknown })[key];
  }
  const depth = typeof args["depth"] === "number" ? args["depth"] : 3;
  const limit = typeof args["limit"] === "number" ? args["limit"] : 20;
  return compact(value, depth, limit);
}

/** The event that names a transition and its arguments, for `allowed`. */
function eventOf(t: TransitionInfo, args: { [key: string]: Json }): object {
  return { type: t.name, ...args };
}

function allowedNow(machines: Machines, t: TransitionInfo, args: { [key: string]: Json } | null): boolean | null {
  const m = machines[t.machine] as Machine | undefined;
  if (!m || typeof m.allowed !== "function") return null;
  const needed = t.args.filter((a) => !a.optional);
  if (args === null && needed.length > 0) return null;
  try {
    return m.allowed(eventOf(t, args ?? {}));
  } catch {
    return null;
  }
}

/**
 * `transitions`: the registry, each entry with whether the machine allows it now. An entry with no arguments is
 * asked at once; one with arguments is asked when `args` is given along with its `machine` and `name`, else null.
 */
export function listTransitions(machines: Machines, registry: Registry, args: { [key: string]: Json }): Json {
  const machine = typeof args["machine"] === "string" ? args["machine"] : null;
  const name = typeof args["name"] === "string" ? args["name"] : null;
  const given = isObject(args["args"]) ? args["args"] : null;
  const known = registry.filter((t) => (!machine || t.machine === machine) && (!name || t.name === name));
  if (machine && !registry.some((t) => t.machine === machine)) {
    throw new Error(
      `no machine ${machine}: the registry has ${[...new Set(registry.map((t) => t.machine))].join(", ")}`,
    );
  }
  return known.map((t) => ({
    machine: t.machine,
    name: t.name,
    args: t.args.map((a) => ({ name: a.name, type: a.type, ...(a.optional ? { optional: true } : {}) })),
    description: t.description,
    ...(t.sequence ? { sequence: true } : {}),
    ...(t.person ? { person: true } : {}),
    allowed: allowedNow(machines, t, machine && name ? given : null),
  }));
}

/**
 * `transition`: calls one transition by machine and name, with its arguments by name. It answers whether the machine
 * took it, and what the machine shows after. A transition the registry does not list is refused, as is one the
 * machine does not allow now (it says so, and nothing changes).
 */
export function callTransition(
  machines: Machines,
  registry: Registry,
  snapshot: () => unknown,
  args: { [key: string]: Json },
): Json {
  const machine = String(args["machine"] ?? "");
  const name = String(args["name"] ?? "");
  const t = registry.find((r) => r.machine === machine && r.name === name);
  if (!t) throw new Error(`${machine}.${name} is not in the registry: ask \`transitions\` for what there is`);
  if (t.person) {
    throw new Error(`${machine}.${name} is for the person alone (a secret, a passkey): ask the user to do it`);
  }
  const given = isObject(args["args"]) ? args["args"] : {};
  const missing = t.args.filter((a) => !a.optional && !(a.name in given)).map((a) => a.name);
  if (missing.length) throw new Error(`${machine}.${name} needs ${missing.join(", ")}`);
  const m = machines[machine] as Machine | undefined;
  const fn = m?.[name];
  if (typeof fn !== "function") throw new Error(`the store has no ${machine}.${name}`);
  const shown = () => readStore(snapshot, { machine });
  if (allowedNow(machines, t, given) === false) return { done: false, reason: "not allowed now", shows: shown() };
  const done = (fn as (...a: unknown[]) => unknown).apply(m, t.args.map((a) => given[a.name])) !== false;
  return { done, shows: shown() };
}

/** Runs one request on the store. The only place an agent's request becomes a call. */
export function runAgentRequest(
  store: { machines: Machines; registry: Registry; snapshot: () => unknown },
  request: AgentRequest,
): Json {
  switch (request.tool) {
    case "store":
      return readStore(store.snapshot, request.args);
    case "transitions":
      return listTransitions(store.machines, store.registry, request.args);
    case "transition":
      return callTransition(store.machines, store.registry, store.snapshot, request.args);
    default:
      throw new Error(`no tool ${String((request as { tool: unknown }).tool)}`);
  }
}

/**
 * Serves the agent's requests on the app's store: listens to the agent feed of the bridge, runs each request, and
 * answers it on the agent-answer command. Call it once, where the store is made. Returns what stops it.
 *
 *   serveAgent({ bridge: webBridge("/bridge"), machines: store, registry, snapshot: () => snapshot(store) });
 */
export function serveAgent(
  options: { bridge: Bridge; machines: Machines; registry: Registry; snapshot: () => unknown },
): () => void {
  const { bridge, machines, registry, snapshot } = options;
  return bridge.listen<AgentRequest>(AGENT_FEED, (request) => {
    let answer: { [key: string]: Json };
    try {
      answer = { id: request.id, ok: true, answer: runAgentRequest({ machines, registry, snapshot }, request) };
    } catch (e) {
      answer = { id: request.id, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    void bridge.call(AGENT_ANSWER, answer).catch(() => {});
  });
}
