/// <reference lib="dom" />
// The UI card's runtime: the project's real app, mounted in the card's sandboxed frame of Naima's UI tab, on a store of
// its own. The tab posts a road, the labels of the model's steps from the start to the cursor, and the runtime walks the
// store along it through the machine's own input methods, so the state the card shows is always one the real code
// reached. When the road grows on the same store only the new inputs are fired; otherwise a fresh store is made and
// walked from the start, after the inputs of the app's machines that bring it to the screen holding the machine's
// component (its place). A step the person takes on the real controls is reported to the tab (acted), and an input the
// model refuses too (refused). The same walk draws the Every state card: each state a small picture of the app, its
// static HTML, rendered a few at a time inside the frame. Plain TypeScript; the page gives it the app's mount, its store,
// its places and, when the project keeps one, its registry of transitions, which names each step by what offers it.

import { argOf, parseLabel } from "./labels.ts";

/** A message between the card's frame and the tab, either way. */
export type CardMessage = { naima: "uicard"; t: string; [k: string]: unknown };

/** What the runtime reads of a generated module (naima-codegen's TypeScript backend): its inputs and its labels. */
export interface GeneratedModule {
  readonly inputs: readonly {
    readonly type: string;
    readonly label?: string;
    readonly args: readonly { readonly name: string }[];
  }[];
  mcrl2Label?(entry: { event: Record<string, unknown> }): string;
}

/** Where a machine of the app is shown: the screen's inputs walked first, and the component's root element. */
export interface Place {
  /** The machine in the store, by the model's name. */
  machine(store: unknown): object | null | undefined;
  /** The inputs that bring the app to the machine's screen: a machine of the store, its input method, its arguments. */
  walk?: readonly {
    machine(store: unknown): object | null | undefined;
    input: string;
    args: readonly unknown[];
  }[];
  /** The component's root element, scrolled into view and outlined. */
  root?: string;
}

/** What the runtime reads of an entry of the stance's registry of transitions (`deno task transitions`). */
export interface RegistryEntry {
  readonly name: string;
  readonly model?: string;
  readonly affordance?: { readonly element?: string } | { readonly none: string };
}

export interface CardOptions {
  /** The model the card shows, as the tab names it (its naima-codegen project's folder). */
  model: string;
  /** Makes a fresh store of the app, on the fixture's data. */
  makeStore(): unknown;
  /** Mounts the app on that store into the target; answers how to unmount it. */
  mount(target: HTMLElement, store: unknown): () => void;
  /** Applies what Svelte has pending, so the page shows the state walked. */
  flush(): void;
  places: Readonly<Record<string, Place>>;
  /** The generated modules, by the model's name. */
  modules: Readonly<Record<string, () => Promise<GeneratedModule>>>;
  /** The project's registry of transitions, when it keeps one: the steps are named by the elements that offer them. */
  registry?: readonly RegistryEntry[];
  /** Where messages go: the tab. */
  post(m: Omit<CardMessage, "naima">): void;
}

type Machine = Record<string, unknown>;

/**
 * The names of a model's steps in the app: each input of the machine that the registry says a person takes through an
 * element, by the step's action as the model's labels write it (without `c_`), named by that element.
 */
export function stepNames(
  module: GeneratedModule,
  registry: readonly RegistryEntry[] | undefined,
  model: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of registry ?? []) {
    const element = t.affordance && "element" in t.affordance ? t.affordance.element : undefined;
    if (t.model !== model || !element) continue;
    const input = module.inputs.find((i) => i.type === t.name);
    if (!input) continue;
    const action = (input.label ?? input.type).replace(/^c_/, "");
    out[action] ??= element;
  }
  return out;
}

/** The machine's input method for a label's action: the core's action without c_ (show_count) is the type (showCount). */
function typeOf(module: GeneratedModule | null, action: string): string {
  return module?.inputs.find((t) => (t.label ?? t.type).replace(/^c_/, "") === action)?.type ?? action;
}

/** Fires a label's input on the machine; false when the machine has no such input or refuses it. */
function fireOn(m: Machine | null, module: GeneratedModule | null, label: string): boolean {
  const { action, args } = parseLabel(label);
  const f = m?.[typeOf(module, action)];
  if (typeof f !== "function") return false;
  return (f as (...a: unknown[]) => unknown).apply(m, args.map(argOf)) !== false;
}

/** A fresh store, mounted, at the model's place: its screen's inputs walked. Throws when the store has no such machine. */
function placed(
  o: CardOptions,
  target: HTMLElement,
): { store: unknown; machine: Machine; unmount: () => void } {
  const store = o.makeStore();
  const unmount = o.mount(target, store);
  const place = o.places[o.model]!;
  for (const w of place.walk ?? []) {
    const m = w.machine(store) as Machine | null | undefined;
    const f = m?.[w.input];
    if (typeof f === "function") f.apply(m, w.args);
  }
  const machine = place.machine(store) as Machine | null | undefined;
  if (!machine) {
    unmount();
    throw new Error(`the store holds no machine ${o.model} on this screen`);
  }
  return { store, machine, unmount };
}

/** Loads the model's module, after checking that the app gives it a module and a place. */
async function loadModule(o: CardOptions): Promise<GeneratedModule> {
  const load = o.modules[o.model];
  if (!load) throw new Error(`the app has no generated module ${o.model}`);
  if (!o.places[o.model]) throw new Error(`the app gives no place for ${o.model} (src/uicard/places.ts)`);
  return await load();
}

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class Card {
  readonly #o: CardOptions;
  readonly #target: HTMLElement;
  #unmount: (() => void) | null = null;
  #machine: Machine | null = null;
  #walked: string[] = [];
  #walking = false;
  #module: GeneratedModule | null = null;

  constructor(target: HTMLElement, o: CardOptions) {
    this.#target = target;
    this.#o = o;
  }

  /** Loads the model's module and mounts the app at its place; says loaded, with the steps' names, or failed. */
  async start(): Promise<void> {
    try {
      this.#module = await loadModule(this.#o);
      this.#fresh();
      this.#o.post({ t: "loaded", names: stepNames(this.#module, this.#o.registry, this.#o.model) });
    } catch (e) {
      this.#o.post({ t: "failed", why: why(e) });
    }
  }

  /** The road from the start to the cursor: its inputs, walked on this store or on a fresh one. */
  road(seq: number, labels: readonly string[]): void {
    try {
      const same = this.#walked.length <= labels.length && this.#walked.every((l, i) => l === labels[i]);
      if (!same) this.#fresh();
      for (const label of labels.slice(this.#walked.length)) {
        if (!this.#fire(label)) this.#o.post({ t: "refused", label, walking: true });
        this.#walked.push(label);
      }
      this.#o.flush();
      this.#outline();
      this.#o.post({ t: "synced", seq });
    } catch (e) {
      this.#o.post({ t: "failed", why: why(e) });
    }
  }

  #fresh(): void {
    this.#unmount?.();
    this.#unmount = null;
    this.#target.replaceChildren();
    this.#walking = true;
    try {
      const p = placed(this.#o, this.#target);
      this.#unmount = p.unmount;
      this.#machine = p.machine;
    } finally {
      this.#walking = false;
    }
    this.#watch(this.#machine!);
    this.#walked = [];
    this.#o.flush();
  }

  /** Each input method of the machine, wrapped: a step the person takes is reported, one taken by a walk is not. */
  #watch(m: Machine): void {
    for (const t of this.#module?.inputs ?? []) {
      const own = m[t.type];
      if (typeof own !== "function") continue;
      const label = (args: unknown[]) => this.#label(t.type, t.args.map((a) => a.name), args);
      m[t.type] = (...args: unknown[]) => {
        const ok = (own as (...a: unknown[]) => unknown).apply(m, args);
        if (!this.#walking) {
          const l = label(args);
          if (ok === false) this.#o.post({ t: "refused", label: l });
          else {
            this.#walked.push(l);
            this.#o.post({ t: "acted", label: l });
          }
        }
        return ok;
      };
    }
  }

  #label(type: string, names: readonly string[], args: readonly unknown[]): string {
    const event: Record<string, unknown> = { type };
    names.forEach((n, i) => (event[n] = args[i]));
    try {
      if (this.#module?.mcrl2Label) return this.#module.mcrl2Label({ event }).replace(/^c_/, "");
    } catch {
      // A label the module cannot print is written from the event.
    }
    return args.length ? `${type}(${args.map(String).join(", ")})` : type;
  }

  #fire(label: string): boolean {
    this.#walking = true;
    try {
      return fireOn(this.#machine, this.#module, label);
    } finally {
      this.#walking = false;
    }
  }

  #outline(): void {
    const root = this.#o.places[this.#o.model]?.root;
    for (const el of Array.from(this.#target.querySelectorAll<HTMLElement>(".uicard-outlined"))) {
      el.classList.remove("uicard-outlined");
    }
    if (!root) return;
    const el = this.#target.querySelector(root);
    el?.classList.add("uicard-outlined");
    el?.scrollIntoView({ block: "nearest" });
  }
}

/** A state of the Every state card, as the tab posts it: its key, its name, its road from the start, whether it is shown. */
export interface PictureState {
  key: string;
  name: string;
  road: readonly string[];
  current: boolean;
}

/** The pictures' own layout, inserted once: a grid of the app's pictures, each its top at a quarter of its size. */
const PICTURES_CSS = `
.uicard-pictures { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(13rem, 100%), 1fr));
  gap: var(--space-md, 1rem); margin: 0; padding: var(--space-md, 1rem); list-style: none; }
.uicard-picture { display: flex; flex-direction: column; gap: var(--space-xs, 0.25rem); inline-size: 100%;
  padding: var(--space-xs, 0.25rem); border: 0; border-radius: var(--radius-lg, 0.75rem); background: none;
  color: inherit; font: inherit; text-align: start; cursor: pointer; }
.uicard-picture:hover { background: var(--color-surface-sunken, rgba(0, 0, 0, 0.04)); }
.uicard-picture:focus-visible { outline: 2px solid var(--color-focus, currentColor); outline-offset: 2px; }
.uicard-shot { display: block; block-size: 9rem; contain: paint; overflow: hidden; pointer-events: none;
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.12)); border-radius: var(--radius-md, 0.5rem);
  background: var(--color-surface, transparent); }
.uicard-shot > * { zoom: 0.25; }
.uicard-picture[aria-current="true"] .uicard-shot { border-color: var(--color-accent, currentColor); border-width: 2px; }
.uicard-caption { font-size: var(--font-size-sm, 0.875rem); color: var(--color-text-muted, inherit); }
.uicard-picture[aria-current="true"] .uicard-caption { color: var(--color-text, inherit); }
`;

/**
 * The Every state card: each state the tab posts, drawn as a picture of the real app in that state (a fresh store
 * walked along the state's road, its static HTML kept), a few at a time so that the frame stays responsive. A picture is
 * kept by its road while the frame lives: the frame is loaded again after the app is built. A click on one posts `pick`.
 */
export class Pictures {
  readonly #o: CardOptions;
  readonly #target: HTMLElement;
  readonly #batch: number;
  readonly #later: (f: () => void) => void;
  #module: GeneratedModule | null = null;
  readonly #kept = new Map<string, string>();
  #queue: { road: readonly string[]; shot: HTMLElement }[] = [];
  #running = false;

  constructor(
    target: HTMLElement,
    o: CardOptions,
    opts: { batch?: number; later?: (f: () => void) => void } = {},
  ) {
    this.#target = target;
    this.#o = o;
    this.#batch = opts.batch ?? 4;
    this.#later = opts.later ?? ((f) => void setTimeout(f, 0));
  }

  /** Loads the model's module and checks that a fresh store reaches its place; says loaded, or failed. */
  async start(): Promise<void> {
    try {
      this.#module = await loadModule(this.#o);
      const doc = this.#target.ownerDocument;
      if (!doc.getElementById("uicard-pictures-css")) {
        const style = doc.createElement("style");
        style.id = "uicard-pictures-css";
        style.textContent = PICTURES_CSS;
        doc.head.append(style);
      }
      this.#o.post({ t: "loaded", names: stepNames(this.#module, this.#o.registry, this.#o.model) });
    } catch (e) {
      this.#o.post({ t: "failed", why: why(e) });
    }
  }

  /** The states to draw, in the tab's order; pictures already drawn are reused, the others queued. */
  states(states: readonly PictureState[]): void {
    const doc = this.#target.ownerDocument;
    const list = doc.createElement("ul");
    list.className = "uicard-pictures";
    list.setAttribute("aria-label", "Every state of the machine");
    this.#queue = [];
    for (const s of states) {
      const li = doc.createElement("li");
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "uicard-picture";
      button.dataset["key"] = s.key;
      button.setAttribute("aria-current", String(s.current));
      button.title = s.road.length ? s.road.join(" · ") : "the start";
      const shot = doc.createElement("span");
      shot.className = "uicard-shot";
      shot.setAttribute("aria-hidden", "true");
      shot.inert = true;
      const caption = doc.createElement("span");
      caption.className = "uicard-caption";
      caption.textContent = s.name;
      button.append(shot, caption);
      button.addEventListener("click", () => this.#o.post({ t: "pick", key: s.key, road: [...s.road] }));
      li.append(button);
      list.append(li);
      const kept = this.#kept.get(JSON.stringify(s.road));
      if (kept !== undefined) shot.innerHTML = kept;
      else this.#queue.push({ road: s.road, shot });
    }
    this.#target.replaceChildren(list);
    this.#run();
  }

  /** Draws the pictures queued, a batch at a time, the page drawn between batches. */
  #run(): void {
    if (this.#running) return;
    this.#running = true;
    const next = () => {
      const batch = this.#queue.splice(0, this.#batch);
      for (const { road, shot } of batch) {
        const key = JSON.stringify(road);
        const html = this.#kept.get(key) ?? this.picture(road);
        this.#kept.set(key, html);
        if (shot.isConnected) shot.innerHTML = html;
      }
      if (this.#queue.length) this.#later(next);
      else this.#running = false;
    };
    next();
  }

  /** The static HTML of the app walked along a road from its place; empty when the walk fails. */
  picture(road: readonly string[]): string {
    const stage = this.#target.ownerDocument.createElement("div");
    let unmount: (() => void) | null = null;
    try {
      const p = placed(this.#o, stage);
      unmount = p.unmount;
      for (const label of road) fireOn(p.machine, this.#module, label);
      this.#o.flush();
      return stage.innerHTML;
    } catch {
      return "";
    } finally {
      unmount?.();
    }
  }
}

/** Browser storage in memory: an opaque origin has none, and the app keeps its preferences there. */
export function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}
