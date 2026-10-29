import { assert, assertEquals, assertThrows } from "@std/assert";
import { parse as parseYaml } from "@std/yaml";
import stanceUi, { RULES } from "../plugin/index.mjs";
import { parseRule } from "../plugin/rules.mjs";

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url).pathname;
// deno-lint-ignore no-explicit-any
type Any = any;

Deno.test("the plugin's manifest has the shape Naima's contract 4 asks for", () => {
  const m: Any = stanceUi({}, { plugin: "stance-ui" });
  assertEquals(m.name, "stance-ui");
  assertEquals(m.contract, 4);
  assert(m.says && m.about);
  assertEquals(m.optional, ["rules", "landing-reports"]);
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

Deno.test("the rules are data: each file's front matter reads the same as YAML, and a bad one is refused", async () => {
  const dir = new URL("../rules/", import.meta.url).pathname;
  const names = [...Deno.readDirSync(dir)].filter((e) => e.name.endsWith(".md")).map((e) => e.name);
  assertEquals(names.length, RULES.length);
  for (const r of RULES) {
    const text = await Deno.readTextFile(`${dir}/${r.name}.md`);
    const front = parseYaml(text.split("\n---\n")[0].slice(4)) as Record<string, unknown>;
    for (const [k, v] of Object.entries(front)) assertEquals((r as Any)[k], v, `${r.name}: ${k}`);
    assert(r.verifiedBy === "agent" || r.verifiedBy === r.enforcedBy, r.name);
  }
  for (
    const [bad, why] of [
      ["---\nname: a\n---\n", "title is missing"],
      ["---\nname: a\ntitle: one: two\n---\n", "quote it"],
      [
        "---\nname: a\ntitle: t\naudience: all\nstrength: must\nverifiedBy: agent\n---\ntext\n\n## Why\n\nr\n",
        "audience",
      ],
      ["---\nname: a\ntitle: t\naudience: agents\nstrength: must\nverifiedBy: agent\n---\ntext\n", '"## Why"'],
      ["---\nname: a\nshade: t\n---\n", "not a field"],
    ]
  ) assertThrows(() => parseRule("a.md", bad), Error, why);
  assertEquals(
    parseRule(
      "a.md",
      "---\nname: a\ntitle: 'It''s one'\naudience: agents\nstrength: should\nverifiedBy: agent\n---\n\nline one\nline two\n\nnext\n\n## Why\n\nbecause\n",
    ),
    {
      name: "a",
      title: "It's one",
      audience: "agents",
      strength: "should",
      verifiedBy: "agent",
      text: "line one line two\n\nnext",
      why: "because",
    },
  );
});

Deno.test("a landing that changes what the checks read is refused while one fails; any other is not looked at", async () => {
  const m: Any = stanceUi({ app: "violating" }, { plugin: "stance-ui" });
  const report = m.contributes["landing-reports"][0];
  assertEquals(report.name, "ui-stance-checks");
  assert(m.optional.includes("landing-reports"));
  const ctx = { root: fixture("") };
  const at = (changed: string[]) => report.refuses(ctx, { branch: "b", from: "a", to: "b", changed });
  assertEquals(await at(["README.md", "clean/src/App.svelte"]), []);
  const lines: string[] = await at(["violating/src/Dragging.svelte"]);
  assert(lines.some((l) => l.startsWith("no-raw-drag: src/Dragging.svelte:")), lines.join("\n"));
  assert(lines.some((l) => l.startsWith("auth-only: ")));
  // A checker that cannot run holds the landing rather than letting it through unchecked.
  const broken: Any = stanceUi({ app: "violating", deno: "no-such-deno" }, { plugin: "stance-ui" });
  assertEquals(report.blocks, undefined, "a failing check refuses the landing: it is not a proof out of date");
  const held = await broken.contributes["landing-reports"][0].refuses(ctx, {
    branch: "b",
    from: "a",
    to: "b",
    changed: ["violating/tokens/base.tokens.json"],
  });
  assert(held.length === 1 && held[0].includes("could not run"), held.join("\n"));
});

Deno.test("the edit hook is an agent hook Naima installs; the stance writes no settings file, and declares what its checks run", () => {
  const m: Any = stanceUi({ deno: "/opt/deno" }, { plugin: "stance-ui" });
  assertEquals(m.contract, 4);
  assertEquals(m.setup, undefined);
  assertEquals(m.contributes["agent-hooks"], [{
    name: "ui-edit-hook",
    says: "after an agent edits tokens, widgets or components, the stance's fast checks run again",
    tool: "claude-code",
    event: "PostToolUse",
    matcher: "Edit|Write|MultiEdit",
    command: ["stance-ui", "hook"],
  }]);
  assert(m.commands.some((c: Any) => c.name === "stance-ui"), "the command the hook runs is the stance's own");
  assert(m.checks.every((c: Any) => c.runs.length === 1 && c.runs[0] === "/opt/deno"));
  assertEquals(m.contributes["landing-reports"][0].runs, ["/opt/deno"]);
});
