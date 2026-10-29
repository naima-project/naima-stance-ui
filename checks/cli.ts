// deno task check [--project <dir>] [--only <check>[,<check>]] [--json] [--no-record] [--changed <json list>]
//
// Runs the stance's checks on a project (the current directory by default) and exits 1 when one finds a
// problem. With --json it prints the findings as one JSON array, which the Naima plugin reads. Unless told not to,
// it records what each check found in stance-ui.checked.json (checks/record.ts), which `stance-ui status` reads.
// With --changed, a JSON list of files from the project's folder, it runs nothing unless one of them is a file the
// checks read: what a landing asks.

import { loadConfig } from "./config.ts";
import { describe } from "./finding.ts";
import { isChecked, recordRun } from "./record.ts";
import { type CheckName, CHECKS, runChecks } from "./run.ts";

const args = Deno.args;
const value = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = (value("--project") ?? Deno.cwd()).replace(/\/+$/, "");
const only = (value("--only")?.split(",") ?? [...CHECKS]) as CheckName[];
for (const c of only) {
  if (!CHECKS.includes(c)) {
    console.error(`unknown check "${c}"; the checks are ${CHECKS.join(", ")}`);
    Deno.exit(2);
  }
}

const changed = value("--changed");
if (changed !== undefined) {
  const cfg = await loadConfig(root);
  if (!(JSON.parse(changed) as string[]).some((f) => isChecked(cfg, f))) {
    console.log(args.includes("--json") ? "[]" : "stance ui: no file the checks read has changed");
    Deno.exit(0);
  }
}
const findings = await runChecks(root, only);
if (!args.includes("--no-record")) await recordRun(root, await loadConfig(root), only, findings);
if (args.includes("--json")) console.log(JSON.stringify(findings));
else {
  for (const f of findings) console.log(describe(f));
  const problems = findings.filter((f) => f.level === "problem").length;
  console.log(problems === 0 ? `stance ui: ${only.join(", ")}: no problem` : `stance ui: ${problems} problem(s)`);
}
Deno.exit(findings.some((f) => f.level === "problem") ? 1 : 0);
