import { assert, assertEquals } from "@std/assert";
import * as tasks from "../demo/machines/tasks.ts";
import { buildTokens } from "../scripts/tokens.ts";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

Deno.test("every mood board builds to the same custom properties", async () => {
  const dir = await Deno.makeTempDir();
  const names: string[][] = [];
  for (const mood of ["white", "dusk"]) {
    const css = await Deno.readTextFile(await buildTokens(root, mood, `${dir}/${mood}.css`));
    assert(!/NaN|undefined|\[object/.test(css), css);
    names.push([...css.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]).sort());
  }
  assert(names[0].length > 40);
  assertEquals(names[0], names[1]);
  await Deno.remove(dir, { recursive: true });
});

Deno.test("the tasks machine removes a task only after a confirmation", () => {
  let s = tasks.initial({ limit: 2 }).state;
  const go = (e: tasks.Event) => {
    const r = tasks.step(s, e);
    assert(r, `refused: ${JSON.stringify(e)}`);
    s = r.state;
    return r.actions;
  };
  assertEquals(go({ type: "add", title: " one " }), [{ type: "save", tasks: [{ id: 1, title: "one", done: false }] }]);
  go({ type: "add", title: "two" });
  assertEquals(tasks.step(s, { type: "add", title: "three" }), null); // the limit
  assertEquals(go({ type: "askRemove", id: 1 }), []);
  assertEquals(tasks.step(s, { type: "toggle", id: 2 }), null); // nothing else while confirming
  go({ type: "cancel" });
  assertEquals(s.tasks.length, 2);
  go({ type: "askRemove", id: 1 });
  go({ type: "confirm" });
  assertEquals(s.tasks.map((t) => t.title), ["two"]);
});

Deno.test("the demo builds", async () => {
  const out = await new Deno.Command(Deno.execPath(), {
    args: ["task", "demo:build"],
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  })
    .output();
  assertEquals(out.code, 0, new TextDecoder().decode(out.stderr));
  const html = await Deno.readTextFile(`${root}/demo/dist/index.html`);
  assert(html.includes('<script type="module"'));
});
