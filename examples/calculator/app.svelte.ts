// The example's store: its machines, made once, outside any component, and the platform port that carries
// out their outputs. The port is the only thing here that differs by platform, and connect() chooses it: the
// Tauri shell's commands inside the app, the handlers below in a browser. The calculator is a pure client
// app, so on the web it needs no server.
import { createStore } from "../../src/lib/store/store.svelte.ts";
import { connect, type Handlers } from "../../src/lib/platform/port.ts";
import { Calculator } from "./logic/calculator.svelte.ts";
import { Host, type HostInfo } from "./logic/host.svelte.ts";

/** The port's commands answered in the page: what the Tauri shell's src-tauri/src/port.rs answers there. */
export const webHandlers: Handlers = {
  describe: () => ({ platform: "web", shell: "browser" }),
};

export function makeStore(port = connect({ handlers: webHandlers })) {
  const host: Host = new Host({
    describe: () => port.call<HostInfo>("describe").then((info) => host.described(info), () => host.failed()),
  });
  const store = createStore({ calculator: new Calculator(), host });
  host.ask();
  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
