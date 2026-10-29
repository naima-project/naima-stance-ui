// The app's logic, tested without a browser. Tests live here, in test/, outside tsconfig.json's include:
// `deno task check` (svelte-check) reads src/ only, and `deno task test` type-checks and runs these.
import { assertEquals } from "@std/assert";
import * as counter from "../src/machines/counter.ts";

Deno.test("the counter stops at its limit, says so once, and starts over", () => {
  let s = counter.initial({ limit: 2 }).state;
  const actions = [];
  for (const event of [{ type: "add" }, { type: "add" }] as const) {
    const r = counter.step(s, event);
    if (!r) throw new Error(`refused: ${event.type}`);
    s = r.state;
    actions.push(...r.actions);
  }
  assertEquals(actions, [{ type: "reached", limit: 2 }]);
  assertEquals(counter.allowed(s, { type: "add" }), false);
  assertEquals(counter.step(s, { type: "reset" })?.state.count, 0);
});
