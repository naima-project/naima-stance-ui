// The demo's store: every machine of the app, made once, outside any component. The port carries out the
// outputs (here, saving the list in the browser) and is the only place with side effects.
import { createStore } from "../src/lib/store/store.svelte.ts";
import { documentTheme, savedTheme } from "../src/lib/theme/document.ts";
import { Theme } from "../src/lib/theme/theme.svelte.ts";
import { Filter } from "./machines/filter.svelte.ts";
import { type Task, Tasks } from "./machines/tasks.svelte.ts";

export function makeStore() {
  return createStore({
    tasks: new Tasks({ limit: 12 }, {
      save(tasks: readonly Task[]) {
        try {
          localStorage.setItem("stance-ui-demo", JSON.stringify(tasks));
        } catch {
          // Storage may be unavailable (a private window); the list still works for this visit.
        }
      },
    }),
    filter: new Filter(),
    theme: new Theme({ initial: savedTheme("stance-ui-demo-theme") }, documentTheme("stance-ui-demo-theme")),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
