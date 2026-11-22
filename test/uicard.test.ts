/// <reference lib="dom" />
// The UI card's runtime (src/lib/uicard): a road walked through the machine's input methods, on the same store while it
// grows and on a fresh one otherwise; the person's steps reported and the walk's not; the steps named by the registry;
// the Every state card's pictures drawn a few at a time, each the app walked along its state's road. The app here is a
// counter machine and a stand-in for the DOM, so the test runs on Deno alone.
import { assert, assertEquals } from "@std/assert";
import { argOf, parseLabel } from "../src/lib/uicard/labels.ts";
import { Card, type GeneratedModule, Pictures, type RegistryEntry, stepNames } from "../src/lib/uicard/runtime.ts";

/** A generated module of a counter: inc, add(n), reset; c_ labels as naima-codegen writes them. */
const module: GeneratedModule = {
  inputs: [
    { type: "inc", label: "c_inc", args: [] },
    { type: "add", label: "c_add", args: [{ name: "n" }] },
    { type: "reset", label: "c_reset", args: [] },
  ],
  mcrl2Label: ({ event }) => (event.type === "add" ? `c_add(${event.n})` : `c_${String(event.type)}`),
};

class Counter {
  count = 0;
  inc() {
    this.count++;
  }
  add(n: number) {
    if (n > 3) return false;
    this.count += n;
  }
  reset() {
    this.count = 0;
  }
}

/** Just enough of an element for the runtime: children replaced, an HTML text, a document that makes more. */
class El {
  children: El[] = [];
  innerHTML = "";
  dataset: Record<string, string> = {};
  attrs: Record<string, string> = {};
  className = "";
  textContent = "";
  title = "";
  type = "";
  inert = false;
  isConnected = true;
  id = "";
  clicks: (() => void)[] = [];
  constructor(readonly ownerDocument: Doc) {}
  replaceChildren(...c: El[]) {
    this.children = c;
  }
  append(...c: El[]) {
    this.children.push(...c);
  }
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  addEventListener(_: string, f: () => void) {
    this.clicks.push(f);
  }
  querySelectorAll() {
    return [];
  }
  querySelector() {
    return null;
  }
}
class Doc {
  head: El;
  constructor() {
    this.head = new El(this);
  }
  createElement() {
    return new El(this);
  }
  getElementById() {
    return null;
  }
}

function app() {
  const posted: Record<string, unknown>[] = [];
  const stores: { counter: Counter }[] = [];
  const opts = {
    model: "counter",
    makeStore: () => {
      const s = { counter: new Counter() };
      stores.push(s);
      return s;
    },
    mount: (target: HTMLElement, store: unknown) => {
      const t = target as unknown as El;
      const s = store as { counter: Counter };
      // The "app" renders its count when flushed.
      rendered.set(t, s);
      return () => void rendered.delete(t);
    },
    flush: () => {
      for (const [t, s] of rendered) t.innerHTML = `<p>count ${s.counter.count}</p>`;
    },
    places: { counter: { machine: (s: unknown) => (s as { counter: Counter }).counter } },
    modules: { counter: () => Promise.resolve(module) },
    registry: [
      { name: "inc", model: "counter", affordance: { element: "Plus one, under the count" } },
      { name: "reset", model: "counter", affordance: { none: "only the app resets it" } },
      { name: "inc", model: "other", affordance: { element: "not this model's" } },
    ] satisfies RegistryEntry[],
    post: (m: Record<string, unknown>) => void posted.push(m),
  };
  const rendered = new Map<El, { counter: Counter }>();
  return { opts, posted, stores };
}

Deno.test("labels split at the top level, and their arguments become the method's", () => {
  assertEquals(parseLabel("go(HOME)"), { action: "go", args: ["HOME"] });
  assertEquals(parseLabel("pick(item(2), f(1, 2))"), { action: "pick", args: ["item(2)", "f(1, 2)"] });
  assertEquals([argOf("true"), argOf("3"), argOf("commit(0)"), argOf("HOME")], [true, 3, 0, "HOME"]);
});

Deno.test("the registry names a model's steps by the element that offers them", () => {
  const { opts } = app();
  assertEquals(stepNames(module, opts.registry, "counter"), { inc: "Plus one, under the count" });
  assertEquals(stepNames(module, undefined, "counter"), {});
});

Deno.test("a road is walked on the same store while it grows, and on a fresh one otherwise", async () => {
  const { opts, posted, stores } = app();
  const doc = new Doc();
  const card = new Card(new El(doc) as unknown as HTMLElement, opts);
  await card.start();
  assertEquals(posted[0], { t: "loaded", names: { inc: "Plus one, under the count" } });
  card.road(1, ["inc", "add(2)"]);
  assertEquals(stores.at(-1)!.counter.count, 3);
  const made = stores.length;
  card.road(2, ["inc", "add(2)", "inc"]);
  assertEquals(stores.length, made, "a road that grows is walked on the same store");
  assertEquals(stores.at(-1)!.counter.count, 4);
  card.road(3, ["inc"]);
  assertEquals(stores.length, made + 1, "another road is walked on a fresh store");
  assertEquals(stores.at(-1)!.counter.count, 1);
  card.road(4, ["inc", "add(5)"]);
  assert(posted.some((m) => m.t === "refused" && m.label === "add(5)" && m.walking === true));
  assertEquals(posted.filter((m) => m.t === "synced").map((m) => m.seq), [1, 2, 3, 4]);
  assert(!posted.some((m) => m.t === "acted"), "the walk's own steps are not reported");
  // A step the person takes on the app's controls is reported with the model's label.
  (stores.at(-1)!.counter as unknown as { add(n: number): void }).add(1);
  assertEquals(posted.at(-1), { t: "acted", label: "add(1)" });
});

Deno.test("Every state draws each state's picture, a few at a time, and keeps it", async () => {
  const { opts, posted, stores } = app();
  const doc = new Doc();
  const target = new El(doc);
  const later: (() => void)[] = [];
  const pictures = new Pictures(target as unknown as HTMLElement, opts, { batch: 2, later: (f) => later.push(f) });
  await pictures.start();
  assertEquals(posted[0]?.t, "loaded");
  const states = [
    { key: "a", name: "s0", road: [], current: true },
    { key: "b", name: "s1", road: ["inc"], current: false },
    { key: "c", name: "s2", road: ["inc", "add(2)"], current: false },
  ];
  pictures.states(states);
  const shots = () => target.children[0]!.children.map((li) => li.children[0]!.children[0]!.innerHTML);
  assertEquals(shots(), ["<p>count 0</p>", "<p>count 1</p>", ""], "the first batch is drawn at once");
  later.shift()!();
  assertEquals(shots(), ["<p>count 0</p>", "<p>count 1</p>", "<p>count 3</p>"]);
  const made = stores.length;
  pictures.states(states);
  assertEquals(stores.length, made, "pictures already drawn are kept");
  assertEquals(shots()[2], "<p>count 3</p>");
  target.children[0]!.children[2]!.children[0]!.clicks[0]!();
  assertEquals(posted.at(-1), { t: "pick", key: "c", road: ["inc", "add(2)"] });
});
