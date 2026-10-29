// A component imports no app logic. A widget of the set imports Svelte and other components only; an app's
// component may also import the store module, for the store's read view and its transitions. Anything may be
// imported as a type, since a type import is erased and carries no logic. The scripts are parsed by Svelte's
// compiler, and every import, re-export and dynamic import() is looked at.

import { posix } from "node:path";
import { parse } from "svelte/compiler";
import { type Finding, lineOf } from "./finding.ts";

const CHECK = "component-imports";

// deno-lint-ignore no-explicit-any
type Node = any;

export interface ImportRules {
  /** True for a widget of the set: no store either. */
  widget: boolean;
  /** Whether a resolved path is a store module. */
  isStore: (resolved: string) => boolean;
  /** Whether a resolved path is the widget set's index module. */
  isWidgetIndex: (resolved: string) => boolean;
  /** Packages allowed besides svelte. */
  packages: readonly string[];
}

const typeOnly = (n: Node) =>
  n.importKind === "type" || n.exportKind === "type" ||
  (n.specifiers?.length > 0 && n.specifiers.every((s: Node) => s.importKind === "type" || s.exportKind === "type"));

const resolveFrom = (file: string, spec: string): string =>
  spec.startsWith(".") ? posix.normalize(posix.join(posix.dirname(file), spec)) : spec;

/** Why a value import of `spec` from `file` breaks the rule, or null. */
function refusal(file: string, spec: string, rules: ImportRules): string | null {
  if (spec === "svelte" || spec.startsWith("svelte/")) return null;
  if (spec.endsWith(".svelte")) return null;
  const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
  if (!spec.startsWith(".") && rules.packages.includes(pkg)) return null;
  const resolved = resolveFrom(file, spec);
  if (rules.isWidgetIndex(resolved)) return null;
  if (rules.isStore(resolved)) {
    return rules.widget ? "a widget of the set is generic: it takes props and never reads the store" : null;
  }
  return rules.widget
    ? "a widget imports only Svelte and other components"
    : "is app logic: a component reads the store's view and calls its transitions (useStore), and imports anything else only as a type";
}

/** Every import in a component's scripts that breaks the rule. */
export function checkImports(file: string, source: string, rules: ImportRules): Finding[] {
  let ast: Node;
  try {
    ast = parse(source, { modern: true, filename: file });
  } catch (e) {
    return [{ check: CHECK, level: "problem", file, message: `does not parse: ${(e as Error).message}` }];
  }
  const findings: Finding[] = [];
  const report = (spec: string, at: number) => {
    const why = refusal(file, spec, rules);
    if (why) {
      findings.push({
        check: CHECK,
        level: "problem",
        file,
        line: lineOf(source, at),
        message: `imports "${spec}": ${why}`,
      });
    }
  };
  const walk = (n: Node) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (
      (n.type === "ImportDeclaration" || n.type === "ExportNamedDeclaration" || n.type === "ExportAllDeclaration") &&
      n.source
    ) {
      if (!typeOnly(n)) report(String(n.source.value), n.start);
    } else if (n.type === "ImportExpression") {
      if (n.source?.type === "Literal") report(String(n.source.value), n.start);
      else {findings.push({
          check: CHECK,
          level: "problem",
          file,
          line: lineOf(source, n.start),
          message: "a dynamic import() of a computed path cannot be checked",
        });}
    }
    for (const [k, v] of Object.entries(n)) if (k !== "parent" && v && typeof v === "object") walk(v);
  };
  walk(ast.instance?.content);
  walk(ast.module?.content);
  return findings;
}
