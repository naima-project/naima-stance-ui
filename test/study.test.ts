// The study widgets' plain parts (src/lib/components/study/): the mosaic of cards as a tree, the named diagrams a view
// declares, and the mCRL2 highlighting of the editor.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  arrange,
  cardsOf,
  close,
  dock,
  maximise,
  type Mosaic,
  neighbour,
  open,
  resize,
  sideAt,
} from "../src/lib/components/study/mosaic.ts";
import { declaredDiagrams, NAMED } from "../src/lib/components/study/named.ts";
import { languageName, mcrl2Parser, type Stream } from "../src/lib/components/study/mcrl2-tokens.ts";

const MOSAIC: Mosaic = {
  root: {
    dir: "row",
    ratio: 0.6,
    a: { dir: "col", ratio: 0.5, a: { card: "a" }, b: { card: "b" } },
    b: { card: "c" },
  },
  closed: ["d"],
  maximised: null,
};

test("a mosaic is a tree the page draws: closing, opening, docking, swapping, resizing and maximising change only the tree", () => {
  let m = resize(MOSAIC, "", 0.7);
  assert.equal((m.root as { ratio: number }).ratio, 0.7);
  assert.equal(
    (resize(m, "", 0.99).root as { ratio: number }).ratio,
    0.88,
    "no card shrinks to nothing",
  );
  m = close(m, "b");
  assert.deepEqual(cardsOf(m.root), ["a", "c"]);
  assert.deepEqual(m.closed, ["d", "b"]);
  assert.deepEqual(m.root, {
    dir: "row",
    ratio: 0.7,
    a: { card: "a" },
    b: { card: "c" },
  }, "the neighbour takes the space");
  m = open(m, "d");
  assert.deepEqual(cardsOf(m.root), ["a", "c", "d"]);
  m = dock(m, "a", "c", "bottom");
  assert.deepEqual(m.root, {
    dir: "row",
    ratio: 0.75,
    a: { dir: "col", ratio: 0.5, a: { card: "c" }, b: { card: "a" } },
    b: { card: "d" },
  }, "docked under c");
  const before = cardsOf(m.root);
  m = dock(m, "a", "c", "center");
  assert.deepEqual(
    cardsOf(m.root),
    before.map((x) => (x === "a" ? "c" : x === "c" ? "a" : x)),
    "swapped",
  );
  assert.equal(neighbour(MOSAIC, "a", "right"), "b");
  assert.equal(neighbour(MOSAIC, "a", "left"), null);
  m = maximise(m, "d");
  assert.equal(m.maximised, "d");
  assert.equal(sideAt(0.5, 0.5), "center");
  assert.equal(sideAt(0.05, 0.5), "left");
  assert.equal(sideAt(0.5, 0.95), "bottom");
});

test("a kept mosaic drops cards that are gone and opens new ones", () => {
  const m = arrange(MOSAIC, { ...MOSAIC, closed: [] }, ["a", "c", "e"]);
  assert.deepEqual(cardsOf(m.root).sort(), ["a", "c", "e"]);
});

test("declared diagrams are checked against the named ones", () => {
  const d = declaredDiagrams(
    "uml-sequence: two parties; flowchart: boxes; directed-graph",
  );
  assert.deepEqual(d.diagrams.map((x) => x.diagram.name), [
    "uml-sequence",
    "directed-graph",
  ]);
  assert.equal(d.diagrams[0]!.maps, "two parties");
  assert.equal(d.problems.length, 1);
  assert.match(d.problems[0]!, /flowchart/);
  assert.ok(NAMED.every((n) => n.standard.length > 0 && n.elements.length > 0));
});

/** A line read as CodeMirror's StringStream reads it, for the tokenizer: only what it uses. */
function stream(line: string): Stream & { pos: number; start: number; eol(): boolean; current(): string } {
  return {
    pos: 0,
    start: 0,
    eol() {
      return this.pos >= line.length;
    },
    current() {
      return line.slice(this.start, this.pos);
    },
    peek() {
      return line[this.pos];
    },
    next() {
      return line[this.pos++];
    },
    skipToEnd() {
      this.pos = line.length;
    },
    eatSpace() {
      const from = this.pos;
      while (/\s/.test(line[this.pos] ?? "")) this.pos++;
      return this.pos > from;
    },
    match(p: string | RegExp) {
      const rest = line.slice(this.pos);
      if (typeof p === "string") return rest.startsWith(p) ? ((this.pos += p.length), true) : false;
      const m = p.exec(rest);
      if (!m || m.index !== 0) return null;
      this.pos += m[0].length;
      return m;
    },
  };
}

test("mCRL2 is highlighted: sections, operators, sorts, Naima's annotations, comments, process names", () => {
  const tokens = (line: string, ui = false): [string, string][] => {
    const st = { ...mcrl2Parser.startState(), ui };
    const out: [string, string][] = [];
    const s = stream(line);
    while (!s.eol()) {
      const t = mcrl2Parser.token(s, st);
      if (t) out.push([s.current(), t]);
      s.start = s.pos;
    }
    return out;
  };
  assert.deepEqual(tokens("proc Core(free: Bool) = sum c: Client . (free) -> c_grant(c) . Core();").slice(0, 6), [
    ["proc", "keyword"],
    ["Core", "className"],
    ["(", "punctuation"],
    ["free", "variableName"],
    [":", "operator"],
    ["Bool", "typeName"],
  ]);
  assert.deepEqual(tokens("  + delta; % nothing"), [["+", "operator"], ["delta", "controlKeyword"], [
    ";",
    "punctuation",
  ], ["% nothing", "lineComment"]]);
  assert.deepEqual(tokens("%@ui begin"), [["%@ui begin", "meta"]]);
  assert.deepEqual(tokens("% title     The lock", true), [["% title", "propertyName"], ["The", "className"], [
    "lock",
    "variableName",
  ]]);
  assert.deepEqual(tokens("[true* . grant(c)] mu X . <true> true").map((t) => t[1]).slice(0, 4), [
    "punctuation",
    "bool",
    "operator",
    "operator",
  ]);
  assert.deepEqual(["a.mcrl2", "p.mcf", "lib.rs", "codegen.toml", "build.sh", "notes.txt"].map(languageName), [
    "mCRL2",
    "mCRL2 formula",
    "Rust",
    "TOML",
    "shell",
    "text",
  ]);
});
