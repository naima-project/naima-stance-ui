// The gallery as one variant of a comparison (scripts/variants.ts): built only with --mode variants, it
// loads the variant's tokens and theme named in the query before it mounts.
import { mount } from "svelte";
import "./tokens.css";
import { storeContext } from "../src/lib/store/store.svelte.ts";
import { loadVariant, variantFromQuery } from "../src/lib/theme/variant.ts";
import App from "./App.svelte";
import { makeStore } from "./app.svelte.ts";

const variant = variantFromQuery(location.search);
loadVariant(variant).then(() =>
  mount(App, { target: document.getElementById("app")!, context: storeContext(makeStore(variant.theme)) })
);
