// The tasks machine's logic, plain TypeScript with no Svelte: the shape of the `<module>.ts` naima-codegen
// writes from a model (its docs/spec.md §3.18). `step(state, event)` returns the next state and the output
// actions, or null when the machine does not allow the event now.
//
// Written by hand, not generated: it has five inputs, one output and no concurrency, and its one rule worth
// proving (a task is removed only after a confirmation) is a single state; a model would add nothing its
// tests do not. The day it grows, a model replaces it and the generated pair keeps this API, so no component
// changes.

export type Phase = "LISTING" | "CONFIRMING";

export interface Task {
  readonly id: number;
  readonly title: string;
  readonly done: boolean;
}

export interface Config {
  /** At most this many tasks; `add` is refused beyond it. */
  readonly limit: number;
}

export interface State {
  readonly limit: number;
  readonly phase: Phase;
  readonly tasks: readonly Task[];
  readonly next: number;
  /** The task waiting for its removal to be confirmed, or -1. */
  readonly pending: number;
}

export type Event =
  | { type: "add"; title: string }
  | { type: "toggle"; id: number }
  | { type: "askRemove"; id: number }
  | { type: "confirm" }
  | { type: "cancel" };

/** The outputs: what the machine asks the outside world to do. */
export type Action = { type: "save"; tasks: readonly Task[] };

export interface Step {
  readonly state: State;
  readonly actions: readonly Action[];
}

/** An error that stops the machine; this one has none, the type is here for the shape. */
export class StepError extends Error {}

export const inputs = ["add", "toggle", "askRemove", "confirm", "cancel"] as const;
export const outputs = ["save"] as const;

export function initial(config: Config): Step {
  return { state: { limit: config.limit, phase: "LISTING", tasks: [], next: 1, pending: -1 }, actions: [] };
}

const has = (s: State, id: number) => s.tasks.some((t) => t.id === id);

export function allowed(s: State, e: Event): boolean {
  switch (e.type) {
    case "add":
      return s.phase === "LISTING" && e.title.trim() !== "" && s.tasks.length < s.limit;
    case "toggle":
    case "askRemove":
      return s.phase === "LISTING" && has(s, e.id);
    case "confirm":
    case "cancel":
      return s.phase === "CONFIRMING";
  }
}

export function step(s: State, e: Event): Step | null {
  if (!allowed(s, e)) return null;
  const saved = (state: State): Step => ({ state, actions: [{ type: "save", tasks: state.tasks }] });
  switch (e.type) {
    case "add":
      return saved({ ...s, tasks: [...s.tasks, { id: s.next, title: e.title.trim(), done: false }], next: s.next + 1 });
    case "toggle":
      return saved({ ...s, tasks: s.tasks.map((t) => t.id === e.id ? { ...t, done: !t.done } : t) });
    case "askRemove":
      return { state: { ...s, phase: "CONFIRMING", pending: e.id }, actions: [] };
    case "confirm":
      return saved({ ...s, phase: "LISTING", tasks: s.tasks.filter((t) => t.id !== s.pending), pending: -1 });
    case "cancel":
      return { state: { ...s, phase: "LISTING", pending: -1 }, actions: [] };
  }
}
