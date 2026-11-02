// The gallery's store: the theme the user chose, whether the sample dialog is open, the sample list's order, and
// the sample sign-in, whose port is a stand-in for a service.
import { Auth, type AuthPort } from "../src/lib/auth/auth.svelte.ts";
import { createStore } from "../src/lib/store/store.svelte.ts";
import { documentTheme, savedTheme } from "../src/lib/theme/document.ts";
import { Theme, type ThemeChoice } from "../src/lib/theme/theme.svelte.ts";
import { Shelf } from "./machines/shelf.svelte.ts";
import { Sheet } from "./machines/sheet.svelte.ts";

/** A pretend service: "ada" with "correct horse" is asked a code, 123456; the passkey always works. */
const service: AuthPort = {
  password: (username, password) =>
    Promise.resolve(
      username === "ada" && password === "correct horse"
        ? { result: "code" }
        : { result: "refused", error: "That username and password do not match. Check both and try again." },
    ),
  passkey: () => Promise.resolve({ result: "signed-in" }),
  code: (code) =>
    Promise.resolve(
      code === "123456"
        ? { result: "signed-in" }
        : { result: "refused", error: "That code is not the one we sent. Check it and try again.", field: "code" },
    ),
};

/** The store; `theme`, given by a frame of a comparison of variants, overrides the remembered choice. */
export function makeStore(theme?: ThemeChoice) {
  return createStore({
    theme: theme
      ? new Theme({ initial: theme }, documentTheme("stance-ui-variant-theme"))
      : new Theme({ initial: savedTheme("stance-ui-theme") }, documentTheme("stance-ui-theme")),
    sheet: new Sheet(),
    shelf: new Shelf(["Apples", "Pears", "Quinces"]),
    auth: new Auth(service),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
