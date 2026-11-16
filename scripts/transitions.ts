// Generates the transition registry: what every machine of the app's store can be told to do, read from the machines'
// own files, so that nothing about it is written twice. The store file's createStore({ name: ... }) names the machines:
// each is made by `new Machine(...)`, by a call of a factory function that returns one (in the store file or another
// file of the app), or by a call that is given a function making it (`lazily(group, () => new Machine())`). A machine's
// class is declared once, in a file of its own, and the store may make it many times. A machine can hold others: a field
// (`zoom = new Zoom()`), a constructor's `this.zoom = makeZoom()`, or a method that makes one by an argument
// (`historyOf(ref)`, no transition); each is found through its parent and named by its path, `features.gantt`,
// `bugs.historyOf(ref)`. A class counts as a nested machine when it has a `view`. Every public method of a machine is a
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
import { pathToFileURL } from "node:url";
import ts from "typescript";

/** An argument of a transition: its name, its type as the code writes it, the values an enumerated one takes. */
export interface Arg {
  name: string;
  type: string;
  /** The values of an argument whose type is a union of string literals. */
  values?: string[];
  optional?: boolean;
}

export interface Entry {
  machine: string;
  name: string;
  args: Arg[];
  description: string;
  sequence: boolean;
  /** Only a person takes it (a secret, a passkey): an agent is refused. */
  person: boolean;
  /** model: an input of a machine generated from a model (a file under `generated/<model>/`); code: written by hand. */
  kind: "model" | "code";
  /** The model's name, for a model's input. */
  model?: string;
  /** The machine's file, from the root. */
  file: string;
}

/** A public method of a machine that a component may call but that is no transition: plumbing (@internal). */
export interface Internal {
  machine: string;
  name: string;
}

export interface Reading {
  entries: Entry[];
  /** The plumbing: public methods tagged @internal, which components call and agents cannot. */
  internals: Internal[];
  /** Every machine of the store by its path, also one with no transition (a status that is only read). */
  machines: string[];
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

type Module = { sf: ts.SourceFile; imports: Map<string, { imported: string; from: string }> };
/** A machine as the sources show it: its class, and the file that declares the class. */
type Made = { cls: string; file: string };

const unwrap = (e: ts.Expression): ts.Expression => {
  while (
    ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isAwaitExpression(e)
  ) {
    e = e.expression;
  }
  return e;
};

/** Reads and parses the files of the app by name, once each; the imports of each by the name they bind. */
class Sources {
  #modules = new Map<string, Module | null>();
  constructor(readonly root: string) {}

  async load(file: string): Promise<Module | null> {
    if (this.#modules.has(file)) return this.#modules.get(file)!;
    let m: Module | null = null;
    try {
      const sf = parse(file, await Deno.readTextFile(`${this.root}/${file}`));
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
      m = { sf, imports };
    } catch {
      m = null;
    }
    this.#modules.set(file, m);
    return m;
  }

  /** The file an import of `file` names, when it is a file of the app (a relative path). */
  static target(file: string, from: string): string | null {
    return from.startsWith(".") ? posix.normalize(posix.join(posix.dirname(file), from)) : null;
  }

  /** The class `name` as `file` sees it: declared there, or imported from a file of the app. */
  async classOf(file: string, name: string, depth = 0): Promise<Made | null> {
    const m = await this.load(file);
    if (!m || depth > 4) return null;
    if (m.sf.statements.some((s) => ts.isClassDeclaration(s) && s.name?.text === name)) return { cls: name, file };
    const imp = m.imports.get(name);
    const target = imp && Sources.target(file, imp.from);
    return imp && target ? await this.classOf(target, imp.imported, depth + 1) : null;
  }

  /** The function `name` as `file` sees it, with the file it is declared in. */
  async functionOf(
    file: string,
    name: string,
    depth = 0,
  ): Promise<{ file: string; fn: ts.FunctionLikeDeclaration } | null> {
    const m = await this.load(file);
    if (!m || depth > 4) return null;
    // Declared anywhere in the file, a function inside another (a helper the store's own function defines) included.
    let found: { file: string; fn: ts.FunctionLikeDeclaration } | null = null;
    const visit = (n: ts.Node) => {
      if (found) return;
      if (ts.isFunctionDeclaration(n) && n.name?.text === name && n.body) found = { file, fn: n };
      else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) {
        const init = unwrap(n.initializer);
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) found = { file, fn: init };
      }
      ts.forEachChild(n, visit);
    };
    visit(m.sf);
    if (found) return found;
    const imp = m.imports.get(name);
    const target = imp && Sources.target(file, imp.from);
    return imp && target ? await this.functionOf(target, imp.imported, depth + 1) : null;
  }

  /** The machine an expression makes: `new Cls(..)`, a call of a factory that returns one, or a name bound to either. */
  async machineOf(file: string, expr: ts.Expression, scope: ts.Node, depth = 0): Promise<Made | null> {
    if (depth > 6) return null;
    const e = unwrap(expr);
    if (ts.isNewExpression(e) && ts.isIdentifier(e.expression)) return await this.classOf(file, e.expression.text);
    if (ts.isIdentifier(e)) {
      const init = bound(scope, e.text);
      return init ? await this.machineOf(file, init, scope, depth + 1) : null;
    }
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) {
      const f = await this.functionOf(file, e.expression.text);
      for (const r of f ? returned(f.fn) : []) {
        const made = await this.machineOf(f!.file, r, f!.fn, depth + 1);
        if (made) return made;
      }
    }
    // A call that is given a function making the machine (`lazily(group, () => new Screen())`): that machine.
    if (ts.isCallExpression(e)) {
      for (const a of e.arguments) {
        const f = unwrap(a);
        if (!ts.isArrowFunction(f) && !ts.isFunctionExpression(f)) continue;
        for (const r of returned(f)) {
          const made = await this.machineOf(file, r, f, depth + 1);
          if (made) return made;
        }
      }
    }
    return null;
  }
}

/** What a variable called `name` is initialised with, anywhere under `scope`. */
function bound(scope: ts.Node, name: string): ts.Expression | null {
  let found: ts.Expression | null = null;
  const visit = (n: ts.Node) => {
    if (!found && ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) {
      found = n.initializer;
    }
    if (!found) ts.forEachChild(n, visit);
  };
  visit(scope);
  return found;
}

/** The expressions a function returns, not looking into the functions it holds. */
function returned(fn: ts.FunctionLikeDeclaration): ts.Expression[] {
  if (!fn.body) return [];
  if (!ts.isBlock(fn.body)) return [fn.body];
  const out: ts.Expression[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isFunctionLike(n)) return;
    if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
    ts.forEachChild(n, visit);
  };
  visit(fn.body);
  return out;
}

/** The machines createStore names in the store file: the name and the expression that makes each. */
function storeMachines(sf: ts.SourceFile): { name: string; expr: ts.Expression }[] {
  const out: { name: string; expr: ts.Expression }[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "createStore" &&
      n.arguments[0] && ts.isObjectLiteralExpression(n.arguments[0])
    ) {
      for (const p of n.arguments[0].properties) {
        if (ts.isShorthandPropertyAssignment(p)) out.push({ name: p.name.text, expr: p.name });
        else if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
          out.push({ name: p.name.text, expr: p.initializer });
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const hasView = (c: ts.ClassDeclaration) =>
  c.members.some((x) => (ts.isPropertyDeclaration(x) || ts.isGetAccessor(x)) && x.name.getText() === "view");

/** The machines of the store at `storeFile` (from `root`), and what each can be told to do. */
export async function readMachines(root: string, storeFile: string): Promise<Reading> {
  const entries: Entry[] = [];
  const internals: Internal[] = [];
  const paths: string[] = [];
  const problems: Reading["problems"] = [];
  const sources = new Sources(root);
  const store = await sources.load(storeFile);
  if (!store) {
    return {
      entries,
      internals,
      machines: paths,
      problems: [{ file: storeFile, message: "the store file is not there" }],
    };
  }
  const machines = storeMachines(store.sf);
  if (machines.length === 0) {
    problems.push({
      file: storeFile,
      message: "no machine: createStore({ name: new Machine(...) }) is not called here",
    });
  }
  // A file holds one machine class, however many times the store makes it (a zoom in each of three screens).
  const classIn = new Map<string, { cls: string; name: string }>();
  const viewed = new Set<string>();

  /** Reads one machine at `path`: its transitions, then the machines it holds and the machines it makes on demand. */
  const read = async (path: string, made: Made, stack: string[]) => {
    const { cls: className, file } = made;
    paths.push(path);
    const held = classIn.get(file);
    if (held && held.cls !== className) {
      problems.push({ file, message: `holds the machines ${held.name} and ${path}: one file for each machine` });
    }
    classIn.set(file, held ?? { cls: className, name: path });
    const m = (await sources.load(file))!;
    const sf = m.sf;
    const classes = sf.statements.filter((s): s is ts.ClassDeclaration => ts.isClassDeclaration(s) && !!s.name);
    const withView = classes.filter(hasView);
    if (withView.length > 1 && !viewed.has(file)) {
      problems.push({
        file,
        message: `defines ${withView.map((c) => c.name!.text).join(" and ")}, each with a view: one machine to a file`,
      });
    }
    viewed.add(file);
    const cls = classes.find((c) => c.name!.text === className)!;
    const key = `${file}#${className}`;
    // The machines the class holds in a field, or sets in its constructor, and those a method makes by an argument.
    const nested: { path: string; made: Made }[] = [];
    const makes = new Set<ts.Node>();
    const isHidden = (member: ts.ClassElement, name: string) =>
      name.startsWith("_") || name.startsWith("#") ||
      !!(ts.getCombinedModifierFlags(member as ts.Declaration) &
        (ts.ModifierFlags.Private | ts.ModifierFlags.Protected | ts.ModifierFlags.Static));
    const holds = async (name: string, expr: ts.Expression) => {
      const inner = await sources.machineOf(file, expr, sf);
      if (inner && hasViewClass(await sources.load(inner.file), inner.cls)) {
        nested.push({ path: `${path}.${name}`, made: inner });
      }
    };
    for (const member of cls.members) {
      if (ts.isPropertyDeclaration(member) && member.initializer && !ts.isPrivateIdentifier(member.name)) {
        const name = member.name.getText(sf);
        if (!isHidden(member, name)) await holds(name, member.initializer);
      } else if (ts.isConstructorDeclaration(member) && member.body) {
        for (const st of member.body.statements) {
          if (
            ts.isExpressionStatement(st) && ts.isBinaryExpression(st.expression) &&
            st.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isPropertyAccessExpression(st.expression.left) &&
            st.expression.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
            !ts.isPrivateIdentifier(st.expression.left.name)
          ) await holds(st.expression.left.name.text, st.expression.right);
        }
      } else if (ts.isMethodDeclaration(member) && member.name.kind !== ts.SyntaxKind.PrivateIdentifier) {
        const name = member.name.getText(sf);
        if (isHidden(member, name) || name === "allowed") continue;
        for (const r of returned(member)) {
          const inner = await sources.machineOf(file, r, member);
          if (inner && hasViewClass(await sources.load(inner.file), inner.cls)) {
            nested.push({
              path: `${path}.${name}(${member.parameters.map((p) => p.name.getText(sf)).join(", ")})`,
              made: inner,
            });
            makes.add(member);
            break;
          }
        }
      }
    }
    for (const member of cls.members) {
      if (!ts.isMethodDeclaration(member) || member.name.kind === ts.SyntaxKind.PrivateIdentifier) continue;
      const name = member.name.getText(sf);
      const modifiers = ts.getCombinedModifierFlags(member);
      if (
        name === "allowed" || name.startsWith("_") || name.startsWith("#") || makes.has(member) ||
        modifiers & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected | ts.ModifierFlags.Static)
      ) continue;
      const doc = docOf(member);
      const tags = new Set((doc?.tags ?? []).map((t) => t.tagName.text));
      if (tags.has("internal")) {
        internals.push({ machine: path, name });
        continue;
      }
      entries.push({
        machine: path,
        name,
        args: member.parameters.map((p) => {
          const values = p.type && ts.isUnionTypeNode(p.type) &&
              p.type.types.every((t) => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal))
            ? p.type.types.map((t) => ((t as ts.LiteralTypeNode).literal as ts.StringLiteral).text)
            : null;
          return {
            name: p.name.getText(sf),
            type: p.type?.getText(sf) ?? "unknown",
            ...(values ? { values } : {}),
            ...(p.questionToken || p.initializer ? { optional: true } : {}),
          };
        }),
        description: text(doc?.comment).replace(/\s+/g, " ").trim(),
        sequence: tags.has("sequence"),
        person: tags.has("person"),
        ...kindOf(file),
        file,
      });
    }
    for (const n of nested) {
      if (stack.includes(key)) {
        problems.push({ file, message: `${n.path}: a machine that holds itself` });
        continue;
      }
      await read(n.path, n.made, [...stack, key]);
    }
  };

  for (const m of machines) {
    const made = await sources.machineOf(storeFile, m.expr, store.sf);
    if (!made) {
      problems.push({
        file: storeFile,
        message: `${m.name}: not made by \`new Machine()\` or a factory of a file of the app`,
      });
      continue;
    }
    await read(m.name, made, []);
  }
  return { entries, internals, machines: paths, problems };
}

/** The entry's kind: a machine generated from a model lives in a folder `generated/<model>/`. */
export function kindOf(file: string): Pick<Entry, "kind" | "model"> {
  const model = /(?:^|\/)generated\/([^/]+)\//.exec(file)?.[1];
  return model ? { kind: "model", model } : { kind: "code" };
}

function hasViewClass(m: Module | null, cls: string): boolean {
  const c = m?.sf.statements.find((s): s is ts.ClassDeclaration => ts.isClassDeclaration(s) && s.name?.text === cls);
  return !!c && hasView(c);
}

/**
 * The machines of a project, read by the stance, or by the project's own reader when check.transitions.reader names
 * one: a module of the project exporting `read(root, storeFile)`, which answers a Reading. A project whose store builds
 * machines the sources do not show by name (a machine made when a screen is first looked at, one handed to its parent
 * as an argument) reads them with the compiler's types there, and keeps this script's rendering, comments and checks.
 */
export async function loadReading(root: string, storeFile: string, reader?: string): Promise<Reading> {
  if (!reader) return await readMachines(root, storeFile);
  const mod = await import(toFileURL(resolve(root, reader)));
  if (typeof mod.read !== "function") {
    return {
      entries: [],
      internals: [],
      machines: [],
      problems: [{
        file: reader,
        message: "is the project's reader of machines and exports no `read(root, storeFile)`",
      }],
    };
  }
  return await mod.read(root, storeFile) as Reading;
}

const toFileURL = (path: string) => pathToFileURL(path).href;

/** The registry's file: data only, so that a server on any runtime can import it. */
export function renderRegistry(entries: Entry[], storeFile: string): string {
  const lines = entries.map((e) => "  " + JSON.stringify(e));
  return `// deno-fmt-ignore-file
// Generated by \`deno task transitions\` from the machines createStore names in ${storeFile}. Do not edit: change a
// machine, and generate it again. Plain data: the page's agent tools, the MCP server and the transitions check read it.

/** An argument of a transition: its name, its type as the code writes it, the values an enumerated one takes. */
export interface Arg {
  readonly name: string;
  readonly type: string;
  readonly values?: readonly string[];
  readonly optional?: boolean;
}

/** A transition of the store, called on its machine by its name, as the components call it. */
export interface Transition {
  readonly machine: string;
  readonly name: string;
  readonly args: readonly Arg[];
  readonly description: string;
  readonly sequence: boolean;
  readonly person: boolean;
  readonly kind: "model" | "code";
  readonly model?: string;
  readonly file: string;
}

export const registry: readonly Transition[] = [
${lines.join(",\n")}${lines.length ? "," : ""}
];
`;
}

if (import.meta.main) {
  const args = Deno.args;
  const arg = (f: string) => args.indexOf(f) >= 0 ? args[args.indexOf(f) + 1] : undefined;
  const root = resolve(arg("--project") ?? Deno.cwd());
  let cfg: { store?: string; registry?: string; reader?: string } = {};
  try {
    const rec = JSON.parse(await Deno.readTextFile(`${root}/stance-ui.json`)) as {
      check?: { transitions?: { machines?: string; registry?: string; reader?: string } };
    };
    cfg = {
      store: rec.check?.transitions?.machines,
      registry: rec.check?.transitions?.registry,
      reader: rec.check?.transitions?.reader,
    };
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
  const { entries, problems } = await loadReading(root, store, cfg.reader);
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
