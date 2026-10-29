// The port's commands answered in the page, for the web: what the Tauri shell's src-tauri/src/port.rs answers
// in the app. The calculator is a pure client app, so these are its whole backend on the web.
import type { Handlers } from "../../src/lib/platform/port.ts";

export const webHandlers: Handlers = {
  describe: () => ({ platform: "web", shell: "browser" }),
};
