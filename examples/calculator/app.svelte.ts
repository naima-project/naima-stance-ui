// The example's store: the calculator and the theme the user chose, made once, outside any component.
import { createStore } from "../../src/lib/store/store.svelte.ts";
import { documentTheme, savedTheme } from "../../src/lib/theme/document.ts";
import { Theme } from "../../src/lib/theme/theme.svelte.ts";
import { Calculator } from "./logic/calculator.svelte.ts";

export function makeStore() {
  return createStore({
    calculator: new Calculator(),
    theme: new Theme({ initial: savedTheme("calculator-theme") }, documentTheme("calculator-theme")),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
