// The tasks machine as a Svelte 5 class, in the shape of the `<module>.svelte.ts` naima-codegen writes
// (its docs/spec.md §3.18.4): the state in $state fields behind a read-only `view`, one method per input,
// the outputs as calls to a port. The logic is all in tasks.ts; nothing here decides anything.
import * as M from "./tasks.ts";
import type { Action, Config, Event, Phase, State, Task } from "./tasks.ts";

export type { Action, Config, Event, Phase, State, Task };

/** What the machine asks the outside world to do: one method per output action. */
export interface TasksPort {
  save(tasks: readonly Task[]): void;
  /** An input the machine does not allow now was called; nothing changed. */
  refused?(event: Event): void;
}

/** The state, read only. */
export interface TasksView {
  readonly limit: number;
  readonly phase: Phase;
  readonly tasks: readonly Task[];
  readonly pending: number;
}

class _Fields implements TasksView {
  #limit: number;
  #phase: Phase;
  #tasks: readonly Task[];
  #pending: number;

  constructor(s: State) {
    this.#limit = $state.raw(s.limit);
    this.#phase = $state.raw(s.phase);
    this.#tasks = $state.raw(s.tasks);
    this.#pending = $state.raw(s.pending);
  }

  get limit(): number {
    return this.#limit;
  }

  get phase(): Phase {
    return this.#phase;
  }

  get tasks(): readonly Task[] {
    return this.#tasks;
  }

  get pending(): number {
    return this.#pending;
  }

  __show(s: State): void {
    this.#limit = s.limit;
    this.#phase = s.phase;
    this.#tasks = s.tasks;
    this.#pending = s.pending;
  }
}

export class Tasks {
  /** The state, for components: read only; it changes only through the input methods. */
  readonly view: TasksView;
  readonly #fields: _Fields;
  readonly #port: TasksPort;
  #state: State;
  #queue: Action[] = [];
  #busy = false;

  constructor(config: Config, port: TasksPort) {
    this.#port = port;
    const r = M.initial(config);
    this.#state = $state.raw(r.state);
    this.#fields = new _Fields(r.state);
    this.view = this.#fields;
    this.#emit(r.actions);
  }

  /** Whether the event is allowed now: what a component enables. */
  allowed(event: Event): boolean {
    return M.allowed(this.#state, event);
  }

  add(title: string): boolean {
    return this.#input({ type: "add", title });
  }

  toggle(id: number): boolean {
    return this.#input({ type: "toggle", id });
  }

  askRemove(id: number): boolean {
    return this.#input({ type: "askRemove", id });
  }

  confirm(): boolean {
    return this.#input({ type: "confirm" });
  }

  cancel(): boolean {
    return this.#input({ type: "cancel" });
  }

  #input(event: Event): boolean {
    const r = M.step(this.#state, event);
    if (r === null) {
      this.#port.refused?.(event);
      return false;
    }
    this.#state = r.state;
    this.#fields.__show(r.state);
    this.#emit(r.actions);
    return true;
  }

  #emit(actions: readonly Action[]): void {
    this.#queue.push(...actions);
    if (this.#busy) return;
    this.#busy = true;
    try {
      for (let a = this.#queue.shift(); a !== undefined; a = this.#queue.shift()) {
        switch (a.type) {
          case "save":
            this.#port.save(a.tasks);
            break;
        }
      }
    } finally {
      this.#busy = false;
    }
  }
}
