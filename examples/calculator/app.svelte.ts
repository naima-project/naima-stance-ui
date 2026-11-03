// The example's store: the calculator, the theme the user chose, and where the app runs, made once, outside
// any component, with the platform bridge that carries out their outputs. The bridge is the only thing here that
// differs by platform, and connect() chooses it: the Tauri shell's commands inside the app, the handlers
// of bridge.ts in a browser. The calculator is a pure client app, so on the web it needs no server.
import { createStore } from "../../src/lib/store/store.svelte.ts";
import { connect } from "../../src/lib/platform/bridge.ts";
import { documentTheme, savedTheme } from "../../src/lib/theme/document.ts";
import { Theme } from "../../src/lib/theme/theme.svelte.ts";
import { Calculator } from "./logic/calculator.svelte.ts";
import { Host, type HostInfo } from "./logic/host.svelte.ts";
import { webHandlers } from "./bridge.ts";

export function makeStore(bridge = connect({ handlers: webHandlers })) {
  const host: Host = new Host({
    describe: () => bridge.call<HostInfo>("describe").then((info) => host.described(info), () => host.failed()),
  });
  const store = createStore({
    calculator: new Calculator(),
    theme: new Theme({ initial: savedTheme("calculator-theme") }, documentTheme("calculator-theme")),
    host,
  });
  host.ask();
  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
