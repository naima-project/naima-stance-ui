import { assert, assertEquals } from "@std/assert";
import stanceUi, { RULES } from "../plugin/index.mjs";

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url).pathname;
// deno-lint-ignore no-explicit-any
type Any = any;

Deno.test("the plugin's manifest has the shape Naima's contract 2 asks for", () => {
  const m: Any = stanceUi({}, { plugin: "stance-ui" });
  assertEquals(m.name, "stance-ui");
  assertEquals(m.contract, 2);
  assert(m.says && m.about);
  assertEquals(m.optional, ["rules"]);
  const checks = new Set(m.checks.map((c: Any) => c.name));
  for (const r of RULES) {
    // What Naima's rules point requires of a shipped rule.
    for (const k of ["name", "title", "text", "why"] as const) {
      assert(typeof r[k] === "string" && r[k].trim(), `${r.name}: ${k}`);
    }
    assert(["agents", "people", "everyone"].includes(r.audience));
    assert(["must", "should"].includes(r.strength));
    if (r.enforcedBy) assert(checks.has(r.enforcedBy), `${r.name}: enforced by ${r.enforcedBy}, not a check`);
  }
  assertEquals(m.commands[0].runs, ["deno"]);
});

Deno.test("the plugin's checks report the stance's findings as Naima findings", async () => {
  const m: Any = stanceUi({}, { plugin: "stance-ui" });
  const literals = m.checks.find((c: Any) => c.name === "ui-no-raw-literals");
  const bad = await literals.run({ root: fixture("violating") });
  assert(bad.length > 0 && bad.every((f: Any) => f.level === "problem" && f.subject));
  assert(
    bad.some((f: Any) =>
      f.message === "src/lib/ui/components/Raw.svelte:7: color: colour literal #fff: use a color token"
    ),
  );
  for (const c of m.checks.filter((c: Any) => c.name !== "ui-svelte-check")) {
    assertEquals(await c.run({ root: fixture("clean") }), [], c.name);
  }
});

Deno.test("the manifest declares the stance's attribution, its version the package's", async () => {
  const m: Any = stanceUi({}, { plugin: "stance-ui" });
  const a = m.attribution;
  for (const k of ["name", "homepage", "source", "license", "version"]) {
    assert(typeof a[k] === "string" && a[k].trim(), k);
  }
  assertEquals(a.authors, ["make become"]);
  assertEquals(a.license, "MIT");
  const pkg = JSON.parse(await Deno.readTextFile(new URL("../package.json", import.meta.url)));
  assertEquals(a.version, pkg.version);
  assertEquals(a.license, pkg.license);
});
