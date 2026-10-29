// The UI stance as a Naima plugin: its rules, shipped to every agent of a project that loads it, its checks,
// run by `naima check`, and `naima stance-ui`, which copies the stance into the project and says what changed.
//
// Plain JavaScript with no import outside the runtime's own modules, so it loads as it is on Deno, Node and
// Bun. The checks themselves are the stance's TypeScript (checks/), run by Deno in a child process from
// this repository's checkout: add the plugin from git, pinned by commit, so the whole repository is there.
//
// naima.json:
//   { "plugins": { "stance-ui": { "source": { "git": "<this repository>", "commit": "<full commit>", "path": "plugin/index.mjs" },
//                                 "options": { "app": "." } } } }

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { readRules } from "./rules.mjs";

const CONTRACT = 2;
/** The examples the stance ships, each a project that follows it (see the README's "Examples"). */
export const EXAMPLES = [
  { name: "calculator", path: "examples/calculator", says: "a four-operation calculator on the calm mood board" },
];

/** Who made the stance, where it is published, its licence and version: what `naima credits` prints (provisional in Naima). */
export const ATTRIBUTION = {
  name: "UI stance",
  homepage: "https://make-become.github.io/",
  source: "https://github.com/naima-project/naima-stance-ui",
  authors: ["make become"],
  license: "MIT",
  version: "0.1.0",
};
const STANCE = fileURLToPath(new URL("..", import.meta.url));

const CHECKS = [
  {
    name: "ui-tokens",
    runs: "tokens",
    says: "the design tokens follow the W3C Design Tokens (DTCG) format, and every mood board defines the same tokens",
  },
  {
    name: "ui-contrast",
    runs: "contrast",
    says:
      "every colour pair the widgets use reaches 4.5:1 for text and 3:1 for controls and focus rings, in every theme of every mood board",
  },
  {
    name: "ui-no-raw-literals",
    runs: "no-raw-literals",
    says: "components hold no raw colour, size or duration, and read only tokens the mood board defines",
  },
  {
    name: "ui-component-imports",
    runs: "component-imports",
    says: "components import no app logic beyond the store; the widgets of the set not even the store",
  },
  {
    name: "ui-svelte-check",
    runs: "svelte-check",
    says: "svelte-check passes: types hold, and nothing writes the store around its transitions",
  },
  {
    name: "ui-a11y",
    runs: "a11y",
    says:
      "the app's pages pass axe-core at WCAG 2.2 AA in both themes on desktop and phone, every control is reached with Tab and shows its focus, and the page reflows at 320 CSS px",
  },
  {
    name: "ui-target-size",
    runs: "target-size",
    says: "every pointer target is at least 24 by 24 CSS px, or far enough from the others (WCAG 2.2 SC 2.5.8)",
  },
  {
    name: "ui-reduced-motion",
    runs: "reduced-motion",
    says: "nothing moves when the system asks for reduced motion",
  },
];

/** The stance's rules, read from rules/, one Markdown file each (plugin/rules.mjs), as the `rules` point takes them. */
export const RULES = readRules(join(STANCE, "rules"));

/** Runs the stance's checker on the app and returns its findings, or throws with why it could not. */
function runChecker(deno, args) {
  return new Promise((done, fail) => {
    const child = spawn(deno, ["run", "-A", "--quiet", join(STANCE, "checks", "cli.ts"), ...args], {
      cwd: STANCE,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => fail(new Error(`cannot run ${deno}: ${e.message}`)));
    child.on("close", (code) => {
      try {
        done({ code, findings: JSON.parse(out.trim().split("\n").pop() || "[]") });
      } catch {
        fail(new Error(`the stance's checker exited with ${code}: ${err.trim().split("\n").slice(-3).join(" ")}`));
      }
    });
  });
}

/** Runs a script of the stance with its output passed through, and returns its exit code. */
function runScript(deno, script, args, out, err) {
  return new Promise((done) => {
    const child = spawn(deno, ["run", "-A", "--quiet", join(STANCE, "scripts", script), ...args], {
      cwd: STANCE,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => out(String(d).trimEnd()));
    child.stderr.on("data", (d) => err(String(d).trimEnd()));
    child.on("error", (e) => (err(`cannot run ${deno}: ${e.message}`), done(2)));
    child.on("close", (code) => done(code ?? 2));
  });
}

const where = (f) => `${f.file ?? ""}${f.line ? `:${f.line}` : ""}`;

export default function stanceUi(options = {}, api = {}) {
  const app = typeof options.app === "string" ? options.app : ".";
  const deno = typeof options.deno === "string" ? options.deno : "deno";
  const appRoot = (ctx) => resolve(ctx.root, app);
  const print = (ctx, stream) =>
  (
    line,
  ) => (ctx[stream] ? ctx[stream](line) : (stream === "err" ? console.error : console.log)(line));

  return {
    name: api.plugin ?? "stance-ui",
    contract: CONTRACT,
    attribution: ATTRIBUTION,
    says:
      "the UI stance by makebecome: logic without UI, one store written by transitions, design tokens in light and dark, accessible at WCAG 2.2 AA, a compositional widget set",
    about:
      "A stance is a set of authored, opinionated choices and rules a project adopts. This one, by makebecome, is about user interfaces: the app's logic is code with no UI; one deep-reactive Svelte 5 store holds every state machine and is written only through their transitions; machines are composed of simpler ones and modelled first; components keep only their own UI state; every colour, size and duration is a DTCG design token; the mood board is chosen at design time, with a light and a dark theme the user can choose; the interface meets EN 301 549 and WCAG 2.2 AA; the widget set is compositional. " +
      "Its rules are listed by `naima rules`; its checks run with `naima check` and need Deno on the PATH, and the browser checks need Playwright's Chromium; `naima stance-ui adopt` copies the widget set, the store and a mood board into the project.",
    options: [
      {
        name: "app",
        says: "the folder of the Svelte app, from the project's root: where stance-ui.json is",
        default: ".",
      },
      { name: "deno", says: "the Deno executable that runs the stance's checks and scripts", default: "deno" },
    ],
    contributes: { rules: RULES },
    optional: ["rules"],
    checks: CHECKS.map((c) => ({
      name: c.name,
      says: c.says,
      async run(ctx) {
        const { findings } = await runChecker(deno, ["--project", appRoot(ctx), "--only", c.runs, "--json"]);
        return findings.map((f) => ({
          level: f.level,
          message: `${where(f)}${where(f) ? ": " : ""}${f.message}`,
          subject: `${where(f)}: ${f.message}`,
        }));
      },
    })),
    commands: [{
      name: "stance-ui",
      says: "copies the UI stance into the project, says what changed since, or runs its checks",
      usage: "naima stance-ui adopt [--mood <name>] [--to <dir>] [--force] | status | check",
      options: [
        { name: "--mood", says: "the mood board to copy", default: "white, or the one recorded" },
        { name: "--to", says: "where the widget set and the store go, from the app's folder", default: "src/lib/ui" },
        { name: "--force", says: "overwrite files the project changed since they were copied" },
      ],
      examples: ["stance-ui adopt --mood white", "stance-ui status", "stance-ui check"],
      enforces: "nothing: it copies the stance and reports; the checks hold the rules",
      runs: [deno],
      async run(args, ctx) {
        const out = print(ctx, "out");
        const err = print(ctx, "err");
        const [sub, ...rest] = args;
        const project = ["--project", appRoot(ctx)];
        if (sub === "adopt") return runScript(deno, "adopt.ts", [...project, ...rest], out, err);
        if (sub === "status") return runScript(deno, "adopt.ts", [...project, "--status"], out, err);
        if (sub === "check") {
          const { code, findings } = await runChecker(deno, [...project, "--json"]);
          for (const f of findings) out(`${f.level} [${f.check}] ${where(f)}${where(f) ? ": " : ""}${f.message}`);
          if (!findings.length) out("stance ui: no problem");
          return code === 0 ? 0 : 1;
        }
        err("usage: naima stance-ui adopt [--mood <name>] [--to <dir>] [--force] | status | check");
        return 2;
      },
    }],
  };
}
