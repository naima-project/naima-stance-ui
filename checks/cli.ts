// deno task check [--project <dir>] [--only <check>[,<check>]] [--json]
// deno task check --only platforms [--platforms web,macos,...] [--out <dir>]
//
// Runs the stance's checks on a project (the current directory by default) and exits 1 when one finds a
// problem. With --json it prints the findings as one JSON array, which the Naima plugin reads.
//
// `platforms` builds and launches the app, so it runs only when named; the others run by default.

import { loadConfig } from "./config.ts";
import { describe, type Finding } from "./finding.ts";
import { checkPlatforms, type Platform, platformFindings, PLATFORMS } from "./platforms.ts";
import { type CheckName, CHECKS, runChecks } from "./run.ts";

const args = Deno.args;
const value = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = (value("--project") ?? Deno.cwd()).replace(/\/+$/, "");
const asked = value("--only")?.split(",") ?? [...CHECKS];
for (const c of asked) {
  if (c !== "platforms" && !CHECKS.includes(c as CheckName)) {
    console.error(`unknown check "${c}"; the checks are ${[...CHECKS, "platforms"].join(", ")}`);
    Deno.exit(2);
  }
}
const only = asked.filter((c): c is CheckName => c !== "platforms");

const findings: Finding[] = only.length ? await runChecks(root, only) : [];
if (asked.includes("platforms")) {
  const cfg = await loadConfig(root);
  const platforms = value("--platforms")?.split(",") as Platform[] | undefined;
  for (const p of platforms ?? []) {
    if (!PLATFORMS.includes(p)) {
      console.error(`unknown platform "${p}"; the platforms are ${PLATFORMS.join(", ")}`);
      Deno.exit(2);
    }
  }
  const reports = await checkPlatforms(root, cfg.platforms ?? { app: ".", e2e: null }, {
    only: platforms,
    out: value("--out"),
  });
  findings.push(...platformFindings(reports, root));
}
if (args.includes("--json")) console.log(JSON.stringify(findings));
else {
  for (const f of findings) console.log(describe(f));
  const problems = findings.filter((f) => f.level === "problem").length;
  console.log(problems === 0 ? `stance ui: ${asked.join(", ")}: no problem` : `stance ui: ${problems} problem(s)`);
}
Deno.exit(findings.some((f) => f.level === "problem") ? 1 : 0);
