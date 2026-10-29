// The counter's logic, plain TypeScript with no UI, in the shape naima-codegen emits: `initial`, `step` and
// `allowed`. `step` returns the next state and the outputs the port carries out, or null when the event is
// not allowed now. Tested in test/counter.test.ts without a browser.

export interface Config {
  readonly limit: number;
}

export interface State {
  readonly count: number;
  readonly limit: number;
}

export type Event = { type: "add" } | { type: "reset" };

/** The outputs: `reached` when the count gets to the limit. */
export type Action = { type: "reached"; limit: number };

export function initial(config: Config): { state: State } {
  return { state: { count: 0, limit: config.limit } };
}

export function step(state: State, event: Event): { state: State; actions: Action[] } | null {
  switch (event.type) {
    case "add": {
      if (state.count >= state.limit) return null;
      const next = { ...state, count: state.count + 1 };
      return { state: next, actions: next.count === next.limit ? [{ type: "reached", limit: next.limit }] : [] };
    }
    case "reset":
      return state.count === 0 ? null : { state: { ...state, count: 0 }, actions: [] };
  }
}

export function allowed(state: State, event: Event): boolean {
  return step(state, event) !== null;
}
