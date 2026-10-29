// deno task check [--project <dir>] [--only <check>[,<check>]] [--json]
//
// Runs the stance's checks on a project (the current directory by default) and exits 1 when one finds a
// problem. With --json it prints the findings as one JSON array, which the Naima plugin reads.

import { describe } from "./finding.ts";
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

const findings = await runChecks(root, only);
if (args.includes("--json")) console.log(JSON.stringify(findings));
else {
  for (const f of findings) console.log(describe(f));
  const problems = findings.filter((f) => f.level === "problem").length;
  console.log(problems === 0 ? `stance ui: ${only.join(", ")}: no problem` : `stance ui: ${problems} problem(s)`);
}
Deno.exit(findings.some((f) => f.level === "problem") ? 1 : 0);
