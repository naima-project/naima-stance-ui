// The gallery's store: the theme the user chose, and whether the sample dialog is open.
import { createStore } from "../src/lib/store/store.svelte.ts";
import { documentTheme, savedTheme } from "../src/lib/theme/document.ts";
import { Theme } from "../src/lib/theme/theme.svelte.ts";
import { Sheet } from "./machines/sheet.svelte.ts";

export function makeStore() {
  return createStore({
    theme: new Theme({ initial: savedTheme("stance-ui-theme") }, documentTheme("stance-ui-theme")),
    sheet: new Sheet(),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
