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

/** Runs a task of the project, as its owner would, and fails with its output when it fails. */
async function task(project: string, name: string): Promise<void> {
  const out = await new Deno.Command(Deno.execPath(), {
    args: ["task", name],
    cwd: project,
    env: { NO_COLOR: "1" },
    stdout: "piped",
    stderr: "piped",
  }).output();
  const text = new TextDecoder();
  assertEquals(out.code, 0, `deno task ${name}:\n${text.decode(out.stdout)}\n${text.decode(out.stderr)}`);
}

Deno.test("an empty folder adopts the stance, builds, and passes every check with no hand edit", async () => {
  const project = await Deno.makeTempDir();
  try {
    const lines = await adopt(project, { mood: "calm" });
    for (const f of ["deno.json", "package.json", "tsconfig.json", "vite.config.ts", "index.html", "src/App.svelte"]) {
      assert(lines.includes(`created ${f}`), f);
    }
    assert(lines.includes("built src/lib/ui/tokens.css: mood calm, light and dark"));
    await task(project, "build");
    await task(project, "test");
    await task(project, "check");
    const fs = await runChecks(project);
    assertEquals(fs.filter((f) => f.level === "problem"), []);

    // Run again, the scaffold is the project's: nothing of it is overwritten, and each file is named as skipped.
    await Deno.writeTextFile(`${project}/index.html`, "<!doctype html>\n");
    const again = await adopt(project, {});
    assert(again.includes("skipped index.html: the project has one"));
    assertEquals(await Deno.readTextFile(`${project}/index.html`), "<!doctype html>\n");
  } finally {
    await Deno.remove(project, { recursive: true });
  }
});

Deno.test("the scaffold imports the copy where --to put it", async () => {
  const project = await Deno.makeTempDir();
  try {
    await adopt(project, { to: "src/ui" });
    assert((await Deno.readTextFile(`${project}/src/main.ts`)).includes(`from "./ui/store/store.svelte.ts"`));
    assert((await Deno.readTextFile(`${project}/deno.json`)).includes("--out src/ui/tokens.css"));
    await Deno.stat(`${project}/src/ui/tokens.css`);
  } finally {
    await Deno.remove(project, { recursive: true });
  }
});
