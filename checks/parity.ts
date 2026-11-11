// Agent parity: the user and an agent do the same things, and the registry of transitions is the one list of them.
// Two checks, both active when stance-ui.json's check.transitions is set (the project chose to serve its bridge to
// agents over MCP):
//
//   transitions     the registry file is what the machines generate now (scripts/transitions.ts), every machine
//                   says in its comment what each transition does, a machine's file holds one machine, and every
//                   transition a component calls is in the registry: a component reads `view`, asks `allowed`, and
//                   calls only what an agent can call too.
//   agent-endpoint  the MCP server's files import no app logic: only the registry, the agent channel, the bridge's own
//                   modules and the runtime's standard library. What an agent reads and does it reads and does
//                   through the page, over the channel, so the server has nothing of the app's to import.

import { posix } from "node:path";
import { parse } from "svelte/compiler";
import ts from "typescript";
import type { StanceConfig } from "./config.ts";
import { type Finding, lineOf } from "./finding.ts";
import { readMachines, renderRegistry } from "../scripts/transitions.ts";

// deno-lint-ignore no-explicit-any
type Node = any;

export interface RegistryEntry {
  machine: string;
  name: string;
}

const TRANSITIONS = "transitions";
const ENDPOINT = "agent-endpoint";

/** What a component may use of a machine besides its transitions. */
const READS = new Set(["view", "allowed"]);

/** The modules beside the MCP server that are the agent channel and the bridge, by file name. */
const CHANNEL = new Set(["agent-endpoint.ts", "bridge-mcp.ts", "bridge-handler.ts", "bridge-server.ts"]);

/** The entries of a generated registry file, or null when the file is not one. */
export function parseRegistry(source: string): RegistryEntry[] | null {
  // The list after "= [", ending at "] as const" (the stance's registry) or at "];" (a project's own, typed one).
  const at = source.indexOf("= [\n");
  const start = at >= 0 ? at + 2 : source.indexOf("[\n");
  const asConst = source.lastIndexOf("] as const");
  const end = asConst >= 0 ? asConst : source.lastIndexOf("];");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(source.slice(start, end).replace(/,\s*$/, "") + "]") as RegistryEntry[];
  } catch {
    return null;
  }
}

/** Every use of a store machine in a component that is neither its view nor `allowed` nor a registered transition. */
export function checkTransitionCalls(file: string, source: string, registry: readonly RegistryEntry[]): Finding[] {
  let ast: Node;
  try {
    ast = parse(source, { modern: true, filename: file });
  } catch (e) {
    return [{ check: TRANSITIONS, level: "problem", file, message: `does not parse: ${(e as Error).message}` }];
  }
  const nodes: Node[] = [];
  const walk = (n: Node) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n.type === "string") nodes.push(n);
    for (const [k, v] of Object.entries(n)) if (k !== "parent" && v && typeof v === "object") walk(v);
  };
  walk(ast.instance?.content);
  walk(ast.module?.content);
  walk(ast.fragment);
  const machines = new Set(registry.map((t) => t.machine));
  const stores = new Set<string>();
  const alias = new Map<string, string>(); // a name in the component → the machine it holds
  const findings: Finding[] = [];
  const say = (at: number, message: string) =>
    findings.push({ check: TRANSITIONS, level: "problem", file, line: lineOf(source, at), message });
  const nameOf = (n: Node): string | null =>
    n?.type === "Identifier" ? n.name : n?.type === "Literal" && typeof n.value === "string" ? n.value : null;
  const isStore = (n: Node) => n?.type === "Identifier" && stores.has(n.name);
  // The names bound to the store and to its machines, until no new one appears.
  for (let pass = 0; pass < 3; pass++) {
    for (const n of nodes) {
      if (n.type !== "VariableDeclarator" || !n.init) continue;
      const init = n.init.type === "TSAsExpression" ? n.init.expression : n.init;
      if (n.id.type === "Identifier") {
        if (init.type === "CallExpression" && init.callee.type === "Identifier" && init.callee.name === "useStore") {
          stores.add(n.id.name);
        } else if (init.type === "MemberExpression" && isStore(init.object) && !init.computed) {
          alias.set(n.id.name, init.property.name);
        }
      } else if (n.id.type === "ObjectPattern" && isStore(init)) {
        for (const p of n.id.properties) {
          const key = p.type === "Property" ? nameOf(p.key) : null;
          const value = p.value?.type === "AssignmentPattern" ? p.value.left : p.value;
          if (key && value?.type === "Identifier") alias.set(value.name, key);
          else say(p.start, "a destructuring of the store that cannot be followed: name each machine");
        }
      }
    }
  }
  for (const [name, machine] of alias) {
    if (!machines.has(machine)) {
      const at = nodes.find((n) => n.type === "VariableDeclarator" && JSON.stringify(n.id).includes(`"${name}"`));
      say(at?.start ?? 0, `the store's machine ${machine} is not in the registry`);
    }
  }
  const seen = new Set<string>();
  for (const n of nodes) {
    if (n.type !== "MemberExpression") continue;
    let machine: string | undefined;
    if (n.object.type === "Identifier") machine = alias.get(n.object.name);
    else if (n.object.type === "MemberExpression" && isStore(n.object.object) && !n.object.computed) {
      machine = nameOf(n.object.property) ?? undefined;
    }
    if (!machine || !machines.has(machine)) continue;
    const member = n.computed ? null : nameOf(n.property);
    if (member === null) {
      say(n.start, `${machine} is used with a computed member, which cannot be checked: name the transition`);
      continue;
    }
    if (READS.has(member) || registry.some((t) => t.machine === machine && t.name === member)) continue;
    const key = `${n.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    say(
      n.start,
      `uses ${machine}.${member}, which is not a transition in the registry: a component reads the view and calls transitions, ` +
        "the ones an agent can call too",
    );
  }
  return findings;
}

/** The transitions check on a project: the registry's freshness, the machines' comments, the components' calls. */
export async function checkTransitions(
  root: string,
  cfg: StanceConfig,
  components: readonly string[],
  read: (file: string) => Promise<string>,
): Promise<Finding[]> {
  const t = cfg.transitions;
  if (!t) return [];
  const findings: Finding[] = [];
  const problem = (file: string, message: string) =>
    findings.push({ check: TRANSITIONS, level: "problem", file, message });
  const machines = await readMachines(root, t.machines);
  for (const p of machines.problems) problem(p.file, p.message);
  for (const e of machines.entries) {
    if (!e.description) {
      problem(e.file, `${e.machine}.${e.name} has no comment: say in a comment what it does, an agent reads it`);
    }
  }
  const have = await Deno.readTextFile(`${root}/${t.registry}`).catch(() => null);
  if (machines.problems.length === 0) {
    if (have === null) problem(t.registry, "no registry: run deno task transitions");
    else if (have !== renderRegistry(machines.entries, t.machines)) {
      problem(t.registry, "is not what the machines generate now: run deno task transitions");
    }
  }
  const registry = (have ? parseRegistry(have) : null) ?? machines.entries;
  for (const file of components) findings.push(...checkTransitionCalls(file, await read(file), registry));
  return findings;
}

/** Why an import in an MCP server file is refused, or null when it is the channel, the registry or the standard library. */
function refusal(file: string, spec: string, registry: string): string | null {
  if (spec.startsWith("node:") || spec.startsWith("@std/") || spec.startsWith("jsr:@std/")) return null;
  if (spec.startsWith(".")) {
    const resolved = posix.normalize(posix.join(posix.dirname(file), spec));
    if (resolved === posix.normalize(registry)) return null;
    if (CHANNEL.has(posix.basename(resolved)) && posix.dirname(resolved) === posix.dirname(file)) return null;
    return "is app logic: the MCP server imports only the registry and the agent channel, and reaches the app through the page";
  }
  return "is a package the MCP server has no need of: it imports only the registry, the agent channel and the standard library";
}

/** The agent-endpoint check: no import in the MCP server's files other than the registry and the channel. */
export async function checkAgentEndpoint(root: string, cfg: StanceConfig): Promise<Finding[]> {
  const t = cfg.transitions;
  if (!t) return [];
  const findings: Finding[] = [];
  for (const file of t.server) {
    let source: string;
    try {
      source = await Deno.readTextFile(`${root}/${file}`);
    } catch {
      findings.push({
        check: ENDPOINT,
        level: "problem",
        file,
        message: "is listed in check.transitions.server and is not there",
      });
      continue;
    }
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const report = (spec: string, at: number) => {
      const why = refusal(file, spec, t.registry);
      if (why) {
        findings.push({
          check: ENDPOINT,
          level: "problem",
          file,
          line: lineOf(source, at),
          message: `imports "${spec}": ${why}`,
        });
      }
    };
    const visit = (n: ts.Node) => {
      if (
        (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier &&
        ts.isStringLiteral(n.moduleSpecifier)
      ) {
        const typeOnly = ts.isImportDeclaration(n) ? n.importClause?.isTypeOnly === true : n.isTypeOnly;
        if (!typeOnly) report(n.moduleSpecifier.text, n.getStart());
      } else if (ts.isCallExpression(n)) {
        const dynamic = n.expression.kind === ts.SyntaxKind.ImportKeyword;
        const require = ts.isIdentifier(n.expression) && n.expression.text === "require";
        if (dynamic || require) {
          const arg = n.arguments[0];
          if (arg && ts.isStringLiteral(arg)) report(arg.text, n.getStart());
          else {
            findings.push({
              check: ENDPOINT,
              level: "problem",
              file,
              line: lineOf(source, n.getStart()),
              message: "an import of a computed path cannot be checked",
            });
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return findings;
}
