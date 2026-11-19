import { assert, assertEquals } from "@std/assert";
import { copy } from "@std/fs";
import { fromFileUrl } from "@std/path";
import { runChecks } from "../checks/run.ts";
import { affordanceGaps, KINDS, parseAffordance } from "../scripts/affordance.ts";
import { readMachines, renderRegistry } from "../scripts/transitions.ts";

const fixture = fromFileUrl(new URL("./fixtures/parity", import.meta.url));
const COUNTER = "src/machines/counter.svelte.ts";

/** The fixture, copied, with each file in `edits` rewritten and the registry generated again; what `affordances` finds. */
async function found(edits: { [file: string]: (text: string) => string }): Promise<string[]> {
  const dir = await Deno.makeTempDir();
  try {
    await copy(fixture, dir, { overwrite: true });
    for (const [file, edit] of Object.entries(edits)) {
      await Deno.writeTextFile(`${dir}/${file}`, edit(await Deno.readTextFile(`${dir}/${file}`)));
    }
    const read = await readMachines(dir, "src/app.svelte.ts");
    if (!read.problems.length) {
      await Deno.writeTextFile(
        `${dir}/src/transitions.generated.ts`,
        renderRegistry(read.entries, "src/app.svelte.ts"),
      );
    }
    return (await runChecks(dir, ["transitions", "affordances"])).filter((f) => f.level === "problem").map((f) =>
      `${f.check} ${f.file}: ${f.message}`
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}
const has = (all: string[], text: string) => assert(all.some((m) => m.includes(text)), `${text}\n${all.join("\n")}`);

Deno.test("an affordance of the widget set takes the widget's cues; one of the app's own says them; none says why", () => {
  assertEquals(parseAffordance("button: the Add button"), {
    kind: "button",
    element: "the Add button",
    ...KINDS.button,
  });
  assertEquals(
    parseAffordance("the thread of a line; rest: a faint thread\n hover: it lifts and names its line; touch: tap it"),
    {
      kind: "custom",
      element: "the thread of a line",
      rest: "a faint thread",
      hover: "it lifts and names its line",
      touch: "tap it",
    },
  );
  assertEquals((parseAffordance("button: Add; hover: it darkens") as { hover?: string }).hover, "it darkens");
  assertEquals(parseAffordance("none: the app calls it when the data arrives"), {
    none: "the app calls it when the data arrives",
  });
  assert("error" in parseAffordance("none:"));
  assert("error" in parseAffordance("widget: a thing"));
  assert("error" in parseAffordance("button: Add; colour: red"));
});

Deno.test("a cue invisible at rest needs a way to discover it; a missing cue is named", () => {
  const key = parseAffordance("key: the key N");
  assert(!("none" in key) && !("error" in key));
  assertEquals(affordanceGaps(key).length, 1);
  const found = parseAffordance("key: the key N; discover: the shortcut shown beside Add");
  assert(!("none" in found) && !("error" in found));
  assertEquals(affordanceGaps(found), []);
  const bare = parseAffordance("a dot on the timeline; rest: a small dot");
  assert(!("none" in bare) && !("error" in bare));
  assertEquals(affordanceGaps(bare), ["says no cue on hover or focus", "says no cue on touch"]);
});

Deno.test("the registry carries each transition's affordance", async () => {
  const read = await readMachines(fixture, "src/app.svelte.ts");
  assertEquals(read.entries.find((e) => e.name === "add")?.affordance, {
    kind: "button",
    element: "Add",
    ...KINDS.button,
  });
  assert(renderRegistry(read.entries, "src/app.svelte.ts").includes('"affordance":{"kind":"button","element":"Add"'));
});

Deno.test("affordances: a project whose every person's transition declares one passes", async () => {
  assertEquals(await found({}), []);
});

Deno.test("affordances: a person's transition with none, or with an invisible cue and no discovery, is refused", async () => {
  const all = await found({
    [COUNTER]: (t) =>
      t.replace(" @affordance button: Add */", " */").replace(
        "@affordance button: Start over",
        "@affordance a corner of the counter; rest: nothing; hover: it glows; touch: tap it",
      ),
  });
  has(all, "counter.add declares no affordance");
  has(all, "counter.reset: its affordance (a corner of the counter) shows nothing at rest");
  assertEquals(all.length, 2, all.join("\n"));
});

Deno.test("affordances: a transition said to be no person's that a component calls from a handler is refused", async () => {
  const all = await found({
    [COUNTER]: (t) => t.replace("@affordance button: Start over", "@affordance none: the app"),
  });
  has(all, "counter.reset says no person takes it (the app), but a component calls it from an event handler");
});

Deno.test("affordances: a class's affordance holds for its methods that say none; a wrong tag stops the registry", async () => {
  assertEquals(
    await found({
      [COUNTER]: (t) =>
        t.replace(" @affordance button: Add */", " */").replace(
          "export class Counter {",
          "/** @affordance button: the counter's buttons */\nexport class Counter {",
        ),
    }),
    [],
  );
  has(
    await found({ [COUNTER]: (t) => t.replace("@affordance button: Add", "@affordance widget: Add") }),
    "counter.add: @affordance widget: not a kind of the widget set",
  );
});
