// The example's store: its one machine, made once, outside any component.
import { createStore } from "../../src/lib/store/store.svelte.ts";
import { Calculator } from "./logic/calculator.svelte.ts";

export function makeStore() {
  return createStore({ calculator: new Calculator() });
}

export type AppStore = ReturnType<typeof makeStore>;
