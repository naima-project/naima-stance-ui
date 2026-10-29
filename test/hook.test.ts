import { assert, assertEquals } from "@std/assert";
import { copy } from "@std/fs/copy";
import { afterEdit, editedFile } from "../scripts/hook.ts";
import { status } from "../scripts/adopt.ts";
import { checkedLines } from "../checks/record.ts";
import { loadConfig } from "../checks/config.ts";

const clean = new URL("./fixtures/clean", import.meta.url).pathname;

Deno.test("the hook input names the edited file", () => {
  assertEquals(
    editedFile(JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "/p/a.svelte" } })),
    "/p/a.svelte",
  );
  assertEquals(editedFile("not json"), null);
  assertEquals(editedFile(JSON.stringify({ tool_input: {} })), null);
});

Deno.test("an edit the checks read reruns them and says what fails; any other edit is left alone", async () => {
  const app = await Deno.makeTempDir();
  try {
    await copy(clean, app, { overwrite: true });
    await Deno.remove(`${app}/stance-ui.checked.json`).catch(() => {});
    const cfg = await loadConfig(app);
    assertEquals(await checkedLines(app, cfg), ["checks: never run on this checkout"]);
    assertEquals(await afterEdit(app, `${app}/README.md`), null);
    assertEquals(await afterEdit(app, "src/lib/ui/components/Box.svelte"), null);
    assert((await checkedLines(app, cfg)).every((l) => l.includes("passed after the last change")));

    // A customized widget drags by hand: the hook says so, and status says it failed on the files as they are.
    await Deno.writeTextFile(`${app}/src/lib/ui/components/Box.svelte`, `<div draggable="true">box</div>\n`);
    const said = await afterEdit(app, `${app}/src/lib/ui/components/Box.svelte`, "/");
    assert(said?.includes("Box.svelte") && said.includes("no-raw-drag"), said ?? "");
    const lines = await checkedLines(app, cfg);
    assert(
      lines.some((l) => l.startsWith("check no-raw-drag: failed after the last change, 1 problem(s)")),
      lines.join("\n"),
    );

    // Fixed by hand without the hook: the record is older than the files.
    await Deno.writeTextFile(`${app}/src/lib/ui/components/Box.svelte`, `<div>box</div>\n`);
    assert((await checkedLines(app, cfg)).every((l) => l.includes("not run since the last change")));
  } finally {
    await Deno.remove(app, { recursive: true });
  }
});

Deno.test("status names the files customized since the copy and whether the checks passed since", async () => {
  const { adopt } = await import("../scripts/adopt.ts");
  const project = await Deno.makeTempDir();
  try {
    await adopt(project, { mood: "white" });
    await Deno.writeTextFile(`${project}/tokens/contrast.json`, "[]\n");
    const lines = await status(project);
    assert(lines.includes("changed in the project: tokens/contrast.json"), lines.join("\n"));
    assert(lines.includes("checks: never run on this checkout"));
    await afterEdit(project, "tokens/contrast.json");
    assert((await status(project)).some((l) => l.startsWith("check tokens: ")));
  } finally {
    await Deno.remove(project, { recursive: true });
  }
});
