import { assert, assertEquals, assertRejects } from "@std/assert";
import { adopt, status } from "../scripts/adopt.ts";
import { runChecks } from "../checks/run.ts";

Deno.test("a project adopts the stance, keeps its edits, and sees what changed", async () => {
  const project = await Deno.makeTempDir();
  try {
    const lines = await adopt(project, { mood: "dusk" });
    assert(lines.includes("copied src/lib/ui/components/Button.svelte"));
    assert(lines.includes("copied tokens/themes/dark/color.tokens.json"));
    assert(lines.includes("copied tokens/contrast.json"));
    assert(lines.includes("copied src/lib/ui/theme/theme.svelte.ts"));
    const record = JSON.parse(await Deno.readTextFile(`${project}/stance-ui.json`));
    assertEquals(record.mood, "dusk");
    assertEquals(record.stance.version, "0.1.0");
    assert(/^[0-9a-f]{40}/.test(record.stance.commit));

    // What was copied holds to the stance in the project too.
    const fs = await runChecks(project, ["tokens", "contrast", "no-raw-literals", "component-imports"]);
    assertEquals(fs.filter((f) => f.level === "problem"), []);

    // The project edits a widget: a second copy refuses to overwrite it, and status names it.
    await Deno.writeTextFile(`${project}/src/lib/ui/components/Card.svelte`, "<section></section>\n");
    await assertRejects(() => adopt(project, {}), Error, "src/lib/ui/components/Card.svelte");
    assert((await status(project)).includes("changed in the project: src/lib/ui/components/Card.svelte"));
    // Unless told to.
    assert((await adopt(project, { force: true })).includes("updated src/lib/ui/components/Card.svelte"));
    assert((await status(project)).includes("nothing changed on either side"));
  } finally {
    await Deno.remove(project, { recursive: true });
  }
});

Deno.test("a file that was never the stance's is not overwritten", async () => {
  const project = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${project}/tokens`);
    await Deno.writeTextFile(`${project}/tokens/motion.tokens.json`, "{}\n");
    await assertRejects(() => adopt(project, {}), Error, "tokens/motion.tokens.json");
  } finally {
    await Deno.remove(project, { recursive: true });
  }
});
