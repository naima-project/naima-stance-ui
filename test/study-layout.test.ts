// The layered graph layout of the study widgets' drawings (src/lib/components/study/layout.ts): its geometry, not only
// that it runs — nodes apart, edges ending on the borders, arrows along the curve, back edges and self-loops
// flagged, the same output for the same input, a growing graph that keeps what is drawn, and its speed.

import assert from "node:assert/strict";
import { test } from "node:test";
import { type GEdge, type GNode, type Layout, layout } from "../src/lib/components/study/layout.ts";
import {
  dividers,
  DRAG_IDLE,
  dragStep,
  junctionAt,
  junctionEnds,
  type Mosaic,
  moveDividers,
  snappedTo,
} from "../src/lib/components/study/mosaic.ts";

const circle = (id: string, r = 20): GNode => ({
  id,
  width: 2 * r,
  height: 2 * r,
  shape: "circle",
});
const box = (id: string, w = 80, h = 32): GNode => ({
  id,
  width: w,
  height: h,
  shape: "rect",
});
const edge = (from: string, to: string, i = 0, label = false): GEdge => ({
  id: `${from}>${to}#${i}`,
  from,
  to,
  ...(label ? { labelWidth: 40, labelHeight: 14 } : {}),
});

// A deterministic pseudo-random generator, so a failing case can be replayed.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
function randomDag(count: number, seed: number) {
  const r = rng(seed);
  const nodes = Array.from(
    { length: count },
    (
      _,
      i,
    ) => (r() < 0.5 ? box(`n${i}`, 40 + Math.floor(r() * 60)) : circle(`n${i}`)),
  );
  const edges: GEdge[] = [];
  for (let i = 1; i < count; i++) {
    const k = 1 + Math.floor(r() * 2);
    for (let j = 0; j < k; j++) {
      edges.push(edge(`n${Math.floor(r() * i)}`, `n${i}`, j, r() < 0.3));
    }
  }
  return { nodes, edges };
}

// A state machine: a cycle, a 2-cycle, parallel edges, self-loops and a back edge over several layers.
const machine = {
  nodes: ["idle", "run", "wait", "done", "err"].map((id) => circle(id)),
  edges: [
    edge("idle", "run", 0, true),
    edge("run", "wait", 0, true),
    edge("wait", "run", 0, true),
    edge("run", "done"),
    edge("run", "done", 1),
    edge("done", "idle", 0, true),
    edge("run", "run", 0, true),
    edge("run", "run", 1),
    edge("wait", "err"),
    edge("err", "err"),
  ],
};

function onBorder(
  n: GNode & { x: number; y: number },
  [x, y]: [number, number],
): boolean {
  const dx = x - n.x, dy = y - n.y;
  if (n.shape === "circle") {
    return Math.abs(Math.hypot(dx, dy) - n.width / 2) <= 0.5;
  }
  const a = n.width / 2, b = n.height / 2;
  const inside = Math.abs(dx) <= a + 0.5 && Math.abs(dy) <= b + 0.5;
  return inside &&
    (Math.abs(Math.abs(dx) - a) <= 0.5 || Math.abs(Math.abs(dy) - b) <= 0.5);
}

const labelOf = new Map<string, GEdge>();
function checkGeometry(l: Layout, gap = 0, edges: GEdge[] = []) {
  labelOf.clear();
  for (const e of edges) labelOf.set(e.id, e);
  for (let i = 0; i < l.nodes.length; i++) {
    for (let j = i + 1; j < l.nodes.length; j++) {
      const a = l.nodes[i]!, b = l.nodes[j]!;
      const apartX = Math.abs(a.x - b.x) >= (a.width + b.width) / 2 + gap - 1e-6;
      const apartY = Math.abs(a.y - b.y) >= (a.height + b.height) / 2 + gap - 1e-6;
      assert.ok(apartX || apartY, `${a.id} and ${b.id} overlap`);
    }
  }
  const byId = new Map(l.nodes.map((n) => [n.id, n]));
  for (const e of l.edges) {
    const first = e.points[0]!, last = e.points[e.points.length - 1]!;
    assert.ok(
      onBorder(byId.get(e.from)!, first),
      `${e.id} starts on the border of ${e.from}`,
    );
    assert.ok(
      onBorder(byId.get(e.to)!, last),
      `${e.id} ends on the border of ${e.to}`,
    );
    assert.equal(
      (e.points.length - 1) % 3,
      0,
      `${e.id} is made of whole cubic segments`,
    );
    assert.match(
      e.path,
      /^M [-\d.]+ [-\d.]+( C [-\d.]+ [-\d.]+, [-\d.]+ [-\d.]+, [-\d.]+ [-\d.]+)+$/,
    );
    assert.equal(e.arrow.x, last[0]);
    assert.equal(e.arrow.y, last[1]);
    const prev = e.points[e.points.length - 2]!;
    const tangent = (Math.atan2(last[1] - prev[1], last[0] - prev[0]) * 180) /
      Math.PI;
    assert.ok(
      Math.abs(e.arrow.angle - tangent) < 1e-6,
      `${e.id}'s arrow follows the curve`,
    );
    for (
      const [x, y] of [...e.points, [e.label.x, e.label.y] as [number, number]]
    ) {
      assert.ok(
        x >= 0 && y >= 0 && x <= l.width && y <= l.height,
        `${e.id} stays inside the drawing`,
      );
    }
  }
  for (const e of l.edges) {
    const ge = labelOf.get(e.id);
    if (!ge?.labelWidth) continue;
    for (const n of l.nodes) {
      const apart = Math.abs(e.label.x - n.x) >= (ge.labelWidth + n.width) / 2 - 0.5 ||
        Math.abs(e.label.y - n.y) >= (ge.labelHeight! + n.height) / 2 - 0.5;
      assert.ok(apart, `${e.id}'s label sits on ${n.id}`);
    }
  }
  for (const n of l.nodes) {
    assert.ok(
      n.x - n.width / 2 >= 0 && n.y - n.height / 2 >= 0,
      `${n.id} starts inside the drawing`,
    );
    assert.ok(
      n.x + n.width / 2 <= l.width && n.y + n.height / 2 <= l.height,
      `${n.id} ends inside the drawing`,
    );
  }
}

// The relative order of the nodes within each layer.
function orders(l: Layout, horizontal = true): Map<number, string[]> {
  const res = new Map<number, string[]>();
  for (
    const n of [...l.nodes].sort((a, b) => (horizontal ? a.y - b.y : a.x - b.x))
  ) {
    if (!res.has(n.layer)) res.set(n.layer, []);
    res.get(n.layer)!.push(n.id);
  }
  return res;
}

test("a state machine: nodes apart, edges from border to border, arrows along the curve", () => {
  for (const direction of ["horizontal", "vertical"] as const) {
    checkGeometry(
      layout(machine.nodes, machine.edges, { direction }),
      28,
      machine.edges,
    );
  }
});

test("random DAGs of rectangles and circles keep the geometry in both directions", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { nodes, edges } = randomDag(25, seed);
    checkGeometry(layout(nodes, edges), 28, edges);
    checkGeometry(
      layout(nodes, edges, { direction: "vertical", nodeGap: 12 }),
      12,
      edges,
    );
  }
});

test("layers follow the flow: a forward edge goes to a later layer, the reversed ones are flagged back", () => {
  const l = layout(machine.nodes, machine.edges);
  const at = new Map(l.nodes.map((n) => [n.id, n]));
  for (const e of l.edges) {
    if (e.self) continue;
    const a = at.get(e.from)!, b = at.get(e.to)!;
    assert.equal(
      e.back,
      b.layer < a.layer,
      `${e.id} is back exactly when it runs against the layers`,
    );
    assert.ok(a.layer !== b.layer);
    if (!e.back) assert.ok(b.x > a.x, `${e.id} runs left to right`);
  }
  const back = l.edges.filter((e) => e.back).map((e) => e.id).sort();
  assert.deepEqual(
    back,
    ["done>idle#0", "wait>run#0"],
    "the fewest reversals, into the earlier nodes",
  );
  assert.equal(at.get("idle")!.layer, 0);
});

test("self-loops are flagged and drawn on the side away from the flow", () => {
  for (const direction of ["horizontal", "vertical"] as const) {
    const l = layout(machine.nodes, machine.edges, { direction });
    const loops = l.edges.filter((e) => e.self);
    assert.deepEqual(loops.map((e) => e.id), [
      "run>run#0",
      "run>run#1",
      "err>err#0",
    ]);
    for (const e of loops) {
      const n = l.nodes.find((x) => x.id === e.from)!;
      // every control point lies above (horizontal) or left of (vertical) the node's centre
      for (const [x, y] of e.points) {
        assert.ok(
          (direction === "horizontal" ? y : x) <
            (direction === "horizontal" ? n.y : n.x),
        );
      }
    }
    const reach = (e: (typeof loops)[number]) =>
      Math.min(
        ...e.points.map(([x, y]) => (direction === "horizontal" ? y : x)),
      );
    assert.notEqual(
      reach(loops[0]!),
      reach(loops[1]!),
      "two loops on one node are nested, not drawn on each other",
    );
  }
});

test("parallel edges and a 2-cycle fan out instead of overlapping", () => {
  const l = layout(machine.nodes, machine.edges);
  const get = (id: string) => l.edges.find((e) => e.id === id)!;
  const mid = (id: string) => get(id).points[3]!;
  assert.notDeepEqual(mid("run>done#0"), mid("run>done#1"));
  const dist = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  assert.ok(
    dist(mid("run>done#0"), mid("run>done#1")) >= 14 - 1e-6,
    "half the node gap apart at least",
  );
  const f = mid("run>wait#0"), b = mid("wait>run#0");
  assert.ok(dist(f, b) >= 14 - 1e-6, "the two edges of a 2-cycle run apart");
  const lab = (id: string) => get(id).label;
  assert.notDeepEqual(lab("run>wait#0"), lab("wait>run#0"));
});

test("a label sits beside its curve, not on it", () => {
  const l = layout(machine.nodes, machine.edges);
  for (const e of l.edges.filter((x) => x.id.endsWith("#0") && !x.self)) {
    const ge = machine.edges.find((x) => x.id === e.id)!;
    if (!ge.labelWidth) continue;
    // sample the curve and check none of it passes through the middle of the label's box
    const p = (j: number) => e.points[j]!;
    for (let k = 0; k + 3 < p.length; k += 3) {
      for (let t = 0; t <= 1; t += 0.05) {
        const s = 1 - t;
        const x = s ** 3 * p(k)[0] + 3 * s * s * t * p(k + 1)[0] +
          3 * s * t * t * p(k + 2)[0] + t ** 3 * p(k + 3)[0];
        const y = s ** 3 * p(k)[1] + 3 * s * s * t * p(k + 1)[1] +
          3 * s * t * t * p(k + 2)[1] + t ** 3 * p(k + 3)[1];
        const inside = Math.abs(x - e.label.x) < ge.labelWidth! / 2 - 2 &&
          Math.abs(y - e.label.y) < ge.labelHeight! / 2 - 2;
        assert.ok(!inside, `${e.id}'s curve crosses its label`);
      }
    }
  }
});

test("a long edge runs through its layers and a chain of nodes is drawn straight", () => {
  const nodes = ["a", "b", "c", "d"].map((id) => box(id));
  const l = layout(nodes, [
    edge("a", "b"),
    edge("b", "c"),
    edge("c", "d"),
    edge("a", "d"),
  ]);
  const ys = l.nodes.map((n) => n.y);
  assert.deepEqual(l.nodes.map((n) => n.layer), [0, 1, 2, 3]);
  const long = l.edges.find((e) => e.id === "a>d#0")!;
  assert.equal(
    long.points.length,
    1 + 3 * 3,
    "one cubic segment per layer crossed",
  );
  // the inner chain is straight, the long edge runs parallel to it, and its ends sit balanced between the two
  const [ya, yb, yc, yd] = ys as [number, number, number, number];
  assert.ok(Math.abs(yb - yc) < 1);
  const inner = long.points.slice(3, 7);
  assert.ok(
    inner.every(([, y]) => Math.abs(y - inner[0]![1]) < 1),
    "the long edge is straight across the inner layers",
  );
  const yl = inner[0]![1];
  assert.ok(
    Math.abs(yl - yb) >= 16 + 14 - 0.01,
    "the long edge passes beside the chain, a gap away",
  );
  assert.ok(
    Math.abs(ya - (yb + yl) / 2) < 1 && Math.abs(yd - (yc + yl) / 2) < 1,
  );
});

test("a parent is balanced over its children", () => {
  const nodes = [box("p"), box("a"), box("b"), box("c")];
  const l = layout(nodes, [edge("p", "a"), edge("p", "b"), edge("p", "c")]);
  const [p, a, b, c] = l.nodes.map((x) => x.y) as [
    number,
    number,
    number,
    number,
  ];
  assert.ok(Math.abs(p - b) < 1 && Math.abs(p - (a + c) / 2) < 1);
});

test("a forced rank places a node at its depth", () => {
  const nodes = ["s0", "s1", "s2", "x"].map((id) => circle(id));
  const edges = [edge("s0", "s1"), edge("s1", "s2"), edge("s0", "x")];
  const l = layout(nodes, edges, { rank: { s0: 0, s1: 1, s2: 2, x: 3 } });
  assert.deepEqual(l.nodes.map((n) => n.layer), [0, 1, 2, 3]);
  checkGeometry(l);
});

test("the same input gives the same output", () => {
  const { nodes, edges } = randomDag(40, 7);
  assert.deepEqual(layout(nodes, edges), layout(nodes, edges));
  assert.deepEqual(
    layout(machine.nodes, machine.edges),
    layout(machine.nodes, machine.edges),
  );
});

test("appending a node to a growing path keeps the order of what is already drawn", () => {
  // a growing explored path, as the Models tab draws it: each new state at the end, after the last one
  for (const incremental of [false, true]) {
    const path = ["s0", "s1", "s2", "s3", "s4", "s5", "s6"];
    let nodes: GNode[] = [circle("s0")];
    let edges: GEdge[] = [];
    let before = orders(layout(nodes, edges, { incremental }));
    for (let k = 1; k < path.length; k++) {
      nodes = [...nodes, circle(path[k]!)];
      edges = [
        ...edges,
        edge(path[k - 1]!, path[k]!),
        ...(k % 2 ? [edge(path[k]!, "s0")] : [edge(path[k]!, path[k]!)]),
      ];
      const after = orders(layout(nodes, edges, { incremental }));
      for (const [layer, ids] of before) {
        assert.deepEqual(
          after.get(layer)!.filter((id) => ids.includes(id)),
          ids,
        );
      }
      before = after;
    }
  }
});

test("incremental: every node appended, one at a time, leaves the others' order unchanged", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = randomDag(30, seed);
    // back edges into earlier nodes too, with each node at its depth, as an explored state machine has
    const r = rng(seed + 100);
    const extra = Array.from({ length: 6 }, (_, k) => {
      const a = Math.floor(r() * 30), b = Math.floor(r() * 30);
      return edge(`n${Math.max(a, b)}`, `n${Math.min(a, b)}`, 10 + k);
    });
    const all = [...g.edges, ...extra];
    const depth: Record<string, number> = {};
    for (const x of g.nodes) {
      depth[x.id] = Math.max(
        0,
        ...g.edges.filter((e) => e.to === x.id).map((e) => depth[e.from]! + 1),
      );
    }
    const sub = (k: number) => {
      const ids = new Set(g.nodes.slice(0, k).map((x) => x.id));
      const edges = all.filter((e) => ids.has(e.from) && ids.has(e.to));
      return layout(g.nodes.slice(0, k), edges, {
        incremental: true,
        rank: depth,
      });
    };
    let before = orders(sub(1));
    for (let k = 2; k <= 30; k++) {
      const l = sub(k);
      checkGeometry(l, 28);
      const after = orders(l);
      for (const [layer, ids] of before) {
        const kept = after.get(layer)!.filter((id) => ids.includes(id));
        assert.deepEqual(kept, ids, `seed ${seed}, ${k} nodes, layer ${layer}`);
      }
      before = after;
    }
  }
});

test("a 60-node random DAG lays out in under 200 ms", () => {
  const { nodes, edges } = randomDag(60, 3);
  layout(nodes, edges); // warm up
  const t0 = performance.now();
  const l = layout(nodes, edges);
  const ms = performance.now() - t0;
  checkGeometry(l, 28);
  assert.ok(ms < 200, `${ms.toFixed(1)} ms, budget 200 ms`);
});

test("an empty graph and a lone node", () => {
  assert.deepEqual(layout([], []), {
    nodes: [],
    edges: [],
    width: 40,
    height: 40,
  });
  const l = layout([box("a")], [edge("a", "a")]);
  assert.equal(l.nodes[0]!.layer, 0);
  assert.ok(l.edges[0]!.self);
  checkGeometry(l);
});

// ---- dividers and junctions, from the tree's ratios (develop/models-tab.md §13)

// Two columns, each cut in two at the same height, the right one's top cut again: the horizontal lines at 0.5 are
// aligned; the vertical line of the left column at 0.5 meets them in a cross.
const grid: Mosaic = {
  root: {
    dir: "row",
    ratio: 0.5,
    a: { dir: "col", ratio: 0.5, a: { card: "A" }, b: { card: "B" } },
    b: { dir: "col", ratio: 0.5, a: { dir: "row", ratio: 0.5, a: { card: "C" }, b: { card: "D" } }, b: { card: "E" } },
  },
  closed: [],
  maximised: null,
};

test("dividers stand where the ratios put them; a junction moves what meets there and what is aligned with it", () => {
  const ds = dividers(grid.root);
  assert.deepEqual(ds.map((d) => [d.path, d.dir, d.at, d.from, d.to]), [
    ["", "row", 0.5, 0, 1],
    ["a", "col", 0.5, 0, 0.5],
    ["b", "col", 0.5, 0.5, 1],
    ["ba", "row", 0.75, 0, 0.5],
  ]);
  // The left column's cut ends on the middle line: a cross there, with the right column's cut on the other side.
  const j = junctionAt(grid.root, "a", "end")!;
  assert.deepEqual([j.x, j.y, j.cross], [0.5, 0.5, true]);
  assert.deepEqual(j.meeting.sort(), ["", "a", "b"]);
  assert.deepEqual(j.moves.sort(), ["", "a", "b"]);
  // The right top cut ends on the outer border at the top, on the right column's cut below: a T.
  assert.equal(junctionAt(grid.root, "ba", "start"), null, "the border is no junction");
  const t = junctionAt(grid.root, "ba", "end")!;
  assert.deepEqual([t.x, t.y, t.cross], [0.75, 0.5, false]);
  assert.deepEqual(
    t.moves.sort(),
    ["a", "b", "ba"],
    "the T's lines: its own and the aligned middle line across both columns",
  );
  assert.deepEqual(junctionEnds(grid.root, "a"), { start: false, end: true });
});

test("moving dividers: the others stay where they stand; a moved line snaps onto an aligned one; ratios stay in bounds", () => {
  // The middle vertical line alone, 0.1 right: the right column's own cut stays at 0.75.
  const one = moveDividers(grid, [""], { x: 0.1, y: 0 });
  const at = (m: Mosaic, path: string) => dividers(m.root).find((d) => d.path === path)!.at;
  assert.ok(Math.abs(at(one, "") - 0.6) < 1e-9);
  assert.ok(Math.abs(at(one, "ba") - 0.75) < 1e-9);
  // A junction's set moves both axes at once.
  const set = moveDividers(grid, ["", "a", "b"], { x: -0.05, y: 0.1 });
  assert.deepEqual([at(set, ""), at(set, "a"), at(set, "b")].map((x) => Math.round(x * 100) / 100), [0.45, 0.6, 0.6]);
  // Close to an aligned line, a moved one lands on it: the left cut moved near 0.5 from 0.4 snaps.
  const apart = moveDividers(grid, ["a"], { x: 0, y: -0.1 }, false);
  const back = moveDividers(apart, ["a"], { x: 0, y: 0.09 });
  assert.ok(Math.abs(at(back, "a") - 0.5) < 1e-9 && snappedTo(back, ["a"]));
  // Never past the bounds a card keeps.
  const far = moveDividers(grid, [""], { x: 2, y: 0 });
  assert.ok(far.root && !("card" in far.root) && far.root.ratio < 1);
});

test("the drag machine follows its model: a press drags what was lit, and a release or a cancel ends it", () => {
  let s = DRAG_IDLE;
  assert.equal(dragStep(s, "press"), null, "a press over nothing drags nothing");
  s = dragStep(s, "enter_junction")!;
  s = dragStep(s, "press")!;
  assert.equal(s.drag, "SET");
  assert.deepEqual(dragStep(s, "enter_divider"), s, "while dragging, what the pointer crosses changes nothing");
  assert.deepEqual(dragStep(s, "move"), s);
  s = dragStep(s, "release")!;
  assert.equal(s.drag, "NONE");
  s = dragStep(dragStep(s, "enter_divider")!, "press")!;
  assert.equal(s.drag, "ONE");
  assert.equal(dragStep(s, "cancel")!.drag, "NONE");
  assert.equal(dragStep(DRAG_IDLE, "move"), null, "no move outside a drag");
});
