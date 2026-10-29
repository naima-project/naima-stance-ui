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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
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
    name: "ui-no-raw-drag",
    runs: "no-raw-drag",
    says:
      "only the widget set's Draggable handles dragging, so every drag has the same moves as buttons and keys (WCAG 2.2 SC 2.5.7)",
  },
  {
    name: "ui-auth-only",
    runs: "auth-only",
    says:
      "only the widget set's Auth asks for a password or a one-time code, so every sign-in is accessible (WCAG 2.2 SC 3.3.8)",
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
function runScript(deno, script, args, out, err, stdin = "ignore") {
  return new Promise((done) => {
    const child = spawn(deno, ["run", "-A", "--quiet", join(STANCE, "scripts", script), ...args], {
      cwd: STANCE,
      stdio: [stdin, "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => out(String(d).trimEnd()));
    child.stderr.on("data", (d) => err(String(d).trimEnd()));
    child.on("error", (e) => (err(`cannot run ${deno}: ${e.message}`), done(2)));
    child.on("close", (code) => done(code ?? 2));
  });
}

const where = (f) => `${f.file ?? ""}${f.line ? `:${f.line}` : ""}`;

/** Claude Code's project settings, where its hooks are, from the project's root. */
const CLAUDE_SETTINGS = join(".claude", "settings.json");
/** The tools whose edits the hook follows. */
const EDITS = "Edit|Write|MultiEdit";
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const commandsOf = (entry) =>
  isObject(entry) && Array.isArray(entry.hooks)
    ? entry.hooks.flatMap((h) => (isObject(h) && typeof h.command === "string" ? [h.command] : []))
    : [];
const isOurs = (command) => command.trimEnd().endsWith(" stance-ui hook");

/**
 * Puts the stance's hook into Claude Code's project settings, the way Naima puts its own hooks there: added to what
 * the file holds, an older form replaced where it stands, never twice. The hook runs `naima stance-ui hook` after
 * every edit, which reruns the fast checks when the edit touched a file they read. Only for a project that uses
 * Claude Code (it has .claude/ or CLAUDE.md); returns the lines to say.
 */
export function installHook(root, program) {
  if (!existsSync(join(root, ".claude")) && !existsSync(join(root, "CLAUDE.md"))) return [];
  const launcher = relative(root, join(program, "naima.ts")).split(sep).join(posix.sep);
  const command = `deno run -A "$CLAUDE_PROJECT_DIR/${launcher}" stance-ui hook`;
  const entry = { matcher: EDITS, hooks: [{ type: "command", command }] };
  const path = join(root, CLAUDE_SETTINGS);
  const add = `add to ${CLAUDE_SETTINGS} by hand: "hooks": { "PostToolUse": [ ${JSON.stringify(entry)} ] }`;
  let settings = {};
  if (existsSync(path)) {
    try {
      settings = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return [`the UI stance's edit hook is not installed: ${CLAUDE_SETTINGS} is not plain JSON; ${add}`];
    }
    if (!isObject(settings)) {
      return [`the UI stance's edit hook is not installed: ${CLAUDE_SETTINGS} is not an object; ${add}`];
    }
  }
  const hooks = settings.hooks ?? {};
  const list = isObject(hooks) ? (hooks.PostToolUse ?? []) : null;
  if (!Array.isArray(list)) {
    return [`the UI stance's edit hook is not installed: its hooks are not as expected; ${add}`];
  }
  const at = list.findIndex((e) => commandsOf(e).some(isOurs));
  if (at !== -1 && JSON.stringify(list[at]) === JSON.stringify(entry)) return [];
  const next = at === -1 ? [...list, entry] : list.map((e, i) => (i === at ? entry : e));
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ ...settings, hooks: { ...hooks, PostToolUse: next } }, null, 2) + "\n");
  return [
    `${
      at === -1 ? "installed" : "updated"
    } the UI stance's edit hook in ${CLAUDE_SETTINGS}: after an agent edits tokens, widgets or components, the stance's fast checks run again`,
  ];
}

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
    contributes: {
      rules: RULES,
      "landing-reports": [{
        name: "ui-stance-checks",
        says:
          "a landing that changes a file the UI stance's checks read (tokens, mood boards, contrast pairs, widgets, components, stance-ui.json) is refused while any of its checks fails on the branch's files",
        async blocks(ctx, landing) {
          const root = appRoot(ctx);
          const changed = landing.changed
            .map((f) => relative(root, resolve(ctx.root, f)).split(sep).join(posix.sep))
            .filter((f) => f && !f.startsWith(".."));
          if (!changed.length) return [];
          try {
            const { findings } = await runChecker(deno, [
              "--project",
              root,
              "--changed",
              JSON.stringify(changed),
              "--json",
            ]);
            return findings.filter((f) => f.level === "problem").map((f) =>
              `${f.check}: ${where(f)}${where(f) ? ": " : ""}${f.message}`
            );
          } catch (e) {
            // A check that cannot run holds the landing: the change was not checked.
            return [`the stance's checks could not run: ${e.message}`];
          }
        },
      }],
    },
    optional: ["rules", "landing-reports"],
    setup: [{
      name: "ui-edit-hook",
      says:
        "in a project that uses Claude Code, a PostToolUse hook in .claude/settings.json that reruns the UI stance's fast checks after an agent edits a file they read",
      install: (ctx) => (ctx.program ? installHook(ctx.root, ctx.program) : []),
    }],
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
      says:
        "copies the UI stance into the project, says what the project customized and whether the checks passed since, runs its checks, reruns the fast ones after an agent's edit, or builds and drives the app on every platform the machine reaches",
      usage:
        "naima stance-ui adopt [--mood <name>] [--to <dir>] [--tauri] [--server] [--force] | status | check | hook | platforms [--platforms <list>]",
      options: [
        { name: "--mood", says: "the mood board to copy", default: "white, or the one recorded" },
        { name: "--to", says: "where the widget set and the store go, from the app's folder", default: "src/lib/ui" },
        { name: "--tauri", says: "also copy the Tauri 2 shell to src-tauri/" },
        { name: "--server", says: "also copy the Deno port server to server/port-server.ts" },
        { name: "--force", says: "overwrite files the project changed since they were copied" },
        { name: "--platforms", says: "with platforms: the platforms to try", default: "every one" },
      ],
      examples: [
        "stance-ui adopt --mood white --tauri",
        "stance-ui status",
        "stance-ui check",
        "stance-ui hook < hook-input.json",
        "stance-ui platforms",
      ],
      enforces: "nothing: it copies the stance and reports; the checks hold the rules",
      runs: [deno],
      async run(args, ctx) {
        const out = print(ctx, "out");
        const err = print(ctx, "err");
        const [sub, ...rest] = args;
        const project = ["--project", appRoot(ctx)];
        if (sub === "adopt") return runScript(deno, "adopt.ts", [...project, ...rest], out, err);
        if (sub === "status") return runScript(deno, "adopt.ts", [...project, "--status"], out, err);
        if (sub === "platforms") {
          // Builds and launches the app on every platform this machine reaches: long, so never a Naima check.
          const child = spawn(deno, [
            "run",
            "-A",
            "--quiet",
            join(STANCE, "checks", "cli.ts"),
            ...project,
            "--only",
            "platforms",
            ...rest,
          ], { cwd: STANCE, stdio: ["ignore", "pipe", "pipe"] });
          child.stdout.on("data", (d) => out(String(d).trimEnd()));
          child.stderr.on("data", (d) => err(String(d).trimEnd()));
          return new Promise((done) => {
            child.on("error", (e) => (err(`cannot run ${deno}: ${e.message}`), done(2)));
            child.on("close", (code) => done(code ?? 2));
          });
        }
        if (sub === "check") {
          const { code, findings } = await runChecker(deno, [...project, "--json"]);
          for (const f of findings) out(`${f.level} [${f.check}] ${where(f)}${where(f) ? ": " : ""}${f.message}`);
          if (!findings.length) out("stance ui: no problem");
          return code === 0 ? 0 : 1;
        }
        // An agent tool's hook input on standard input; exits 2 with the problems on standard error, which Claude
        // Code shows the agent.
        if (sub === "hook") {
          return runScript(deno, "hook.ts", [...project, "--root", ctx.root, ...rest], out, err, "inherit");
        }
        err(
          "usage: naima stance-ui adopt [--mood <name>] [--to <dir>] [--tauri] [--server] [--force] | status | check | hook | platforms",
        );
        return 2;
      },
    }],
  };
}
