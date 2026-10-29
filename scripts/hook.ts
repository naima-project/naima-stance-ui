// Reruns the stance's fast checks when an agent has just edited a file they read: a token file, a mood board, the
// contrast pairs, a widget, a component or stance-ui.json. An agent tool runs it after each edit (in Claude Code, a
// PostToolUse hook, which the Naima plugin installs); it is quiet when the edit touched nothing the checks read or
// when they pass, and otherwise prints what they found on standard error and exits 2, which Claude Code shows the
// agent after the edit, so the agent fixes it before going on.
//
//   deno run -A scripts/hook.ts --project <app> [--root <project root>] [--file <path>]
//
// Without --file it reads the tool's hook input on standard input, a JSON object whose tool_input names the file
// (file_path, or notebook_path). A path is taken from --root (the project's root, where the tool runs; the app's
// folder by default) or is absolute. The run is recorded like any other (checks/record.ts).
//
// The fast checks are the static ones, which read files and take a second or two. svelte-check and the browser
// checks are left to `naima check` and the landing.

import { posix } from "node:path";
import { loadConfig } from "../checks/config.ts";
import { describe } from "../checks/finding.ts";
import { isChecked, recordRun } from "../checks/record.ts";
import { type CheckName, runChecks } from "../checks/run.ts";

export const FAST: readonly CheckName[] = [
  "tokens",
  "contrast",
  "no-raw-literals",
  "component-imports",
  "no-raw-drag",
  "auth-only",
];

/** The edited file named by a hook input, or null. */
export function editedFile(input: string): string | null {
  try {
    const json = JSON.parse(input) as { tool_input?: { file_path?: unknown; notebook_path?: unknown } };
    const path = json.tool_input?.file_path ?? json.tool_input?.notebook_path;
    return typeof path === "string" && path ? path : null;
  } catch {
    return null;
  }
}

/** What the hook says after an edit of `file`: nothing, or the problems the checks found, for the agent. */
export async function afterEdit(app: string, file: string, from = app): Promise<string | null> {
  const root = posix.resolve(app);
  const rel = posix.relative(root, posix.resolve(from, file));
  if (rel.startsWith("..")) return null;
  const cfg = await loadConfig(root);
  if (!isChecked(cfg, rel)) return null;
  const findings = await runChecks(root, FAST);
  await recordRun(root, cfg, FAST, findings);
  const problems = findings.filter((f) => f.level === "problem");
  if (!problems.length) return null;
  const shown = problems.slice(0, 20).map(describe);
  if (problems.length > shown.length) shown.push(`and ${problems.length - shown.length} more`);
  return `The UI stance's checks fail after the edit of ${rel}; fix these before going on:\n${shown.join("\n")}`;
}

if (import.meta.main) {
  const arg = (flag: string) => {
    const i = Deno.args.indexOf(flag);
    return i >= 0 ? Deno.args[i + 1] : undefined;
  };
  const app = arg("--project") ?? Deno.cwd();
  const file = arg("--file") ?? editedFile(await new Response(Deno.stdin.readable).text());
  if (file) {
    const problems = await afterEdit(app, file, arg("--root") ?? app);
    if (problems) {
      console.error(problems);
      Deno.exit(2);
    }
  }
}
