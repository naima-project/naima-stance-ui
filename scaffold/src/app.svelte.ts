// The app's store: every machine of the app, made once, outside any component, each with the port that
// carries out its outputs. The ports are the only place with side effects: here, moving the focus and
// showing the chosen theme.
import { tick } from "svelte";
import { createStore } from "./lib/ui/store/store.svelte.ts";
import { documentTheme, savedTheme } from "./lib/ui/theme/document.ts";
import { Theme } from "./lib/ui/theme/theme.svelte.ts";
import { Counter } from "./machines/counter.svelte.ts";

export function makeStore() {
  return createStore({
    counter: new Counter({ limit: 3 }, {
      // At the limit the add button is disabled and would drop the focus: it moves to "Start over" once the
      // page shows the new state.
      reached: () => tick().then(() => document.getElementById("reset")?.focus()),
    }),
    theme: new Theme({ initial: savedTheme("app-theme") }, documentTheme("app-theme")),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
