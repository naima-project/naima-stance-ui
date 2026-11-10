// Mounts the app: the store is made once, here, and handed to every component through the context. The agent's
// tools, `store`, `transitions` and `transition`, run on that store over the bridge to the server (server/mcp.ts),
// so an agent does what a person does and nothing else.
import { mount } from "svelte";
import "./lib/ui/tokens.css";
import { serveAgent } from "./lib/ui/agent/agent.ts";
import { webBridge } from "./lib/ui/platform/bridge.ts";
import { snapshot, storeContext } from "./lib/ui/store/store.svelte.ts";
import App from "./App.svelte";
import { makeStore } from "./app.svelte.ts";
import { registry } from "./transitions.generated.ts";

const store = makeStore();
// Only a page served over HTTP has a server to take an agent's requests from (not a page opened from disk).
if (location.protocol.startsWith("http")) {
  serveAgent({ bridge: webBridge("/bridge"), machines: store, registry, snapshot: () => snapshot(store) });
}
mount(App, { target: document.getElementById("app")!, context: storeContext(store) });
