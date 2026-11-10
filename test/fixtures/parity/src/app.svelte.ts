import { createStore } from "./lib/ui/store/store.svelte.ts";
import { Counter } from "./machines/counter.svelte.ts";
import { Notes } from "./machines/notes.svelte.ts";

export function makeStore() {
  const notes = new Notes();
  return createStore({ counter: new Counter(), notes });
}

export type AppStore = ReturnType<typeof makeStore>;
