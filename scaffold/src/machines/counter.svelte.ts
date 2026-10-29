// The counter machine, as the store holds it: a read-only view, `allowed`, and one method per input. It is
// written by hand because a model of two inputs and one bound would prove nothing a reader cannot see.
// Replace it with your app's machines; a generated one has the same shape.
import * as logic from "./counter.ts";

export interface CounterView {
  readonly count: number;
  readonly limit: number;
  /** What a screen reader announces after each change. */
  readonly said: string;
}

export interface CounterPort {
  /** The count got to the limit. */
  reached(limit: number): void;
}

export class Counter {
  #state: logic.State = $state({ count: 0, limit: 0 });
  readonly view: CounterView;
  readonly #port: CounterPort;

  constructor(config: logic.Config, port: CounterPort = { reached() {} }) {
    this.#state = logic.initial(config).state;
    this.#port = port;
    const state = () => this.#state;
    this.view = {
      get count() {
        return state().count;
      },
      get limit() {
        return state().limit;
      },
      get said() {
        const s = state();
        return s.count === s.limit ? `${s.count} of ${s.limit}: the limit` : `${s.count} of ${s.limit}`;
      },
    };
  }

  allowed(event: logic.Event): boolean {
    return logic.allowed(this.#state, event);
  }

  add(): boolean {
    return this.#send({ type: "add" });
  }

  reset(): boolean {
    return this.#send({ type: "reset" });
  }

  #send(event: logic.Event): boolean {
    const r = logic.step(this.#state, event);
    if (!r) return false;
    this.#state = r.state;
    for (const a of r.actions) if (a.type === "reached") this.#port.reached(a.limit);
    return true;
  }
}
