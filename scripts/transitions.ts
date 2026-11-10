// Generates the transition registry: what every machine of the app's store can be told to do, read from the machines'
// own files, so that nothing about it is written twice. The store file's createStore({ name: new Machine(...) }) names
// the machines; each machine's file, one machine to a file, holds its class; every public method of the class is a
// transition (machine, name, arguments, description), except `allowed`, a name that begins with an underscore and
// anything its comment tags @internal. A comment tagged @sequence says the method is a named sequence of transitions
// (a convenience such as "show the open tasks"), which components and agents call like any other. One tagged @person
// is for a person alone, such as typing a password: the agent's tools refuse it.
//
//   deno task transitions [--project <dir>] [--store src/app.svelte.ts] [--out src/transitions.generated.ts] [--check]
//
// The registry is plain data, importing nothing: the page's agent tools run on it (src/lib/agent/agent.ts), the MCP
// server describes its tools from it, and the transitions check refuses a component that calls anything not in it, and
// a registry that no longer matches the machines. By default the paths are the ones stance-ui.json's
// check.transitions gives. `--check` writes nothing and exits 1 when the file on disk is not the one to generate.

import { dirname, posix, resolve } from "node:path";
import ts from "typescript";

export interface Entry {
  machine: string;
  name: string;
  args: { name: string; type: string; optional?: boolean }[];
  description: string;
  sequence: boolean;
  /** Only a person takes it (a secret, a passkey): an agent is refused. */
  person: boolean;
  /** The machine's file, from the root. */
  file: string;
}

export interface Reading {
  entries: Entry[];
  /** What is wrong with the machines: a message, and the file it is about. */
  problems: { file: string; message: string }[];
}

type Doc = { comment?: string | readonly { text: string }[]; tags?: readonly { tagName: { text: string } }[] };

const text = (c: Doc["comment"]) => typeof c === "string" ? c : (c ?? []).map((p) => p.text).join("");
const docOf = (node: ts.Node): Doc | undefined => {
  const docs = (node as unknown as { jsDoc?: Doc[] }).jsDoc;
  return docs?.at(-1);
};
const parse = (file: string, source: string) =>
  ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/** The machines createStore names in the store file: name, class, and the module the class is imported from. */
function storeMachines(sf: ts.SourceFile): { name: string; cls: string; from: string | null }[] {
  const imports = new Map<string, { imported: string; from: string }>();
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) continue;
    const bindings = s.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const e of bindings.elements) {
        imports.set(e.name.text, { imported: (e.propertyName ?? e.name).text, from: s.moduleSpecifier.text });
      }
    }
  }
  const out: { name: string; cls: string; from: string | null }[] = [];
  // A machine made before the store, `const tasks = new Tasks(...)`, and put in it by name.
  const made = new Map<string, string>();
  const find = (n: ts.Node) => {
    if (
      ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isNewExpression(n.initializer) &&
      ts.isIdentifier(n.initializer.expression)
    ) made.set(n.name.text, n.initializer.expression.text);
    ts.forEachChild(n, find);
  };
  find(sf);
  const machine = (name: string, cls: string | undefined) => {
    if (cls) out.push({ name, cls: imports.get(cls)?.imported ?? cls, from: imports.get(cls)?.from ?? null });
  };
  const visit = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "createStore" &&
      n.arguments[0] && ts.isObjectLiteralExpression(n.arguments[0])
    ) {
      for (const p of n.arguments[0].properties) {
        if (ts.isShorthandPropertyAssignment(p)) machine(p.name.text, made.get(p.name.text));
        else if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
          const v = p.initializer;
          if (ts.isNewExpression(v) && ts.isIdentifier(v.expression)) machine(p.name.text, v.expression.text);
          else if (ts.isIdentifier(v)) machine(p.name.text, made.get(v.text));
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** The machines of the store at `storeFile` (from `root`), and what each can be told to do. */
export async function readMachines(root: string, storeFile: string): Promise<Reading> {
  const entries: Entry[] = [];
  const problems: Reading["problems"] = [];
  let source: string;
  try {
    source = await Deno.readTextFile(`${root}/${storeFile}`);
  } catch {
    return { entries, problems: [{ file: storeFile, message: "the store file is not there" }] };
  }
  const machines = storeMachines(parse(storeFile, source));
  if (machines.length === 0) {
    problems.push({
      file: storeFile,
      message: "no machine: createStore({ name: new Machine(...) }) is not called here",
    });
  }
  const used = new Map<string, string>();
  for (const m of machines) {
    if (!m.from?.startsWith(".")) {
      problems.push({ file: storeFile, message: `${m.name}: ${m.cls} is not imported from a file of the app` });
      continue;
    }
    const file = posix.normalize(posix.join(posix.dirname(storeFile), m.from));
    if (used.has(file)) {
      problems.push({ file, message: `holds the machines ${used.get(file)} and ${m.name}: one file for each machine` });
    }
    used.set(file, m.name);
    let msrc: string;
    try {
      msrc = await Deno.readTextFile(`${root}/${file}`);
    } catch {
      problems.push({ file: storeFile, message: `${m.name}: ${m.from} is not there` });
      continue;
    }
    const sf = parse(file, msrc);
    const classes = sf.statements.filter((s): s is ts.ClassDeclaration => ts.isClassDeclaration(s) && !!s.name);
    const withView = classes.filter((c) =>
      c.members.some((x) => ts.isPropertyDeclaration(x) && x.name.getText() === "view")
    );
    if (withView.length > 1) {
      problems.push({
        file,
        message: `defines ${withView.map((c) => c.name!.text).join(" and ")}, each with a view: one machine to a file`,
      });
    }
    const cls = classes.find((c) => c.name!.text === m.cls);
    if (!cls) {
      problems.push({ file, message: `${m.name}: no class ${m.cls}` });
      continue;
    }
    for (const member of cls.members) {
      if (!ts.isMethodDeclaration(member) || member.name.kind === ts.SyntaxKind.PrivateIdentifier) continue;
      const name = member.name.getText(sf);
      const modifiers = ts.getCombinedModifierFlags(member);
      if (
        name === "allowed" || name.startsWith("_") || name.startsWith("#") ||
        modifiers & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected | ts.ModifierFlags.Static)
      ) continue;
      const doc = docOf(member);
      const tags = new Set((doc?.tags ?? []).map((t) => t.tagName.text));
      if (tags.has("internal")) continue;
      entries.push({
        machine: m.name,
        name,
        args: member.parameters.map((p) => ({
          name: p.name.getText(sf),
          type: p.type?.getText(sf) ?? "unknown",
          ...(p.questionToken || p.initializer ? { optional: true } : {}),
        })),
        description: text(doc?.comment).replace(/\s+/g, " ").trim(),
        sequence: tags.has("sequence"),
        person: tags.has("person"),
        file,
      });
    }
  }
  return { entries, problems };
}

/** The registry's file: data only, so that a server on any runtime can import it. */
export function renderRegistry(entries: Entry[], storeFile: string): string {
  const lines = entries.map((e) => "  " + JSON.stringify(e));
  return `// deno-fmt-ignore-file
// Generated by \`deno task transitions\` from the machines createStore names in ${storeFile}. Do not edit: change a
// machine, and generate it again. Plain data: the page's agent tools, the MCP server and the transitions check read it.
export const registry = [
${lines.join(",\n")}${lines.length ? "," : ""}
] as const;
`;
}

if (import.meta.main) {
  const args = Deno.args;
  const arg = (f: string) => args.indexOf(f) >= 0 ? args[args.indexOf(f) + 1] : undefined;
  const root = resolve(arg("--project") ?? Deno.cwd());
  let cfg: { store?: string; registry?: string } = {};
  try {
    const rec = JSON.parse(await Deno.readTextFile(`${root}/stance-ui.json`)) as {
      check?: { transitions?: { machines?: string; registry?: string } };
    };
    cfg = { store: rec.check?.transitions?.machines, registry: rec.check?.transitions?.registry };
  } catch {
    // no stance-ui.json: the flags say where
  }
  const store = arg("--store") ?? cfg.store;
  const out = arg("--out") ?? cfg.registry;
  if (!store || !out) {
    console.error(
      "transitions: say where the store is (--store) and where to write (--out), or set check.transitions in stance-ui.json",
    );
    Deno.exit(2);
  }
  const { entries, problems } = await readMachines(root, store);
  for (const p of problems) console.error(`${p.file}: ${p.message}`);
  if (problems.length) Deno.exit(1);
  const body = renderRegistry(entries, store);
  if (args.includes("--check")) {
    const now = await Deno.readTextFile(`${root}/${out}`).catch(() => null);
    if (now !== body) {
      console.error(`${out} is not what the machines generate: run deno task transitions`);
      Deno.exit(1);
    }
  } else {
    await Deno.mkdir(dirname(`${root}/${out}`), { recursive: true });
    await Deno.writeTextFile(`${root}/${out}`, body);
    console.log(`${out}: ${entries.length} transitions of ${new Set(entries.map((e) => e.machine)).size} machines`);
  }
}
