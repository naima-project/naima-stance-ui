import { mount } from "svelte";
import "./tokens.css";
import { storeContext } from "../src/lib/store/store.svelte.ts";
import App from "./App.svelte";
import { makeStore } from "./app.svelte.ts";

mount(App, { target: document.getElementById("app")!, context: storeContext(makeStore()) });
