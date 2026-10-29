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

const CONTRACT = 2;

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
];

/** The stance's rules, as the rules plugin's `rules` point takes them. */
export const RULES = [
  {
    name: "ui-logic-without-ui",
    title: "The app's logic is code with no UI",
    audience: "everyone",
    strength: "must",
    text:
      "Everything the app decides (what may happen now, what happens next, what is sent where) lives in plain TypeScript modules that import nothing of the UI, and the components only show it. The two are fully decoupled: the logic runs and is tested without a browser, and the UI can be replaced without touching it.",
    why:
      "logic inside components can only be tested through the screen, is copied between components that need it, and changes whenever the look does.",
    enforcedBy: "ui-component-imports",
  },
  {
    name: "ui-one-store-written-by-transitions",
    title: "One central store holds every state machine and is written only through their transitions",
    audience: "everyone",
    strength: "must",
    text:
      "The app's state is one deep-reactive Svelte 5 store ($state, made once with createStore), which holds every state machine of the app. A machine has the shape naima-codegen emits: a read-only view of its state, allowed(event), and one method per input, its transitions. Nothing changes the state except those methods; side effects are the machine's outputs, carried out by a port passed to it.",
    why:
      "one store read by everyone and written by transitions alone makes every change of state a step of a machine that can be checked, replayed and tested, instead of an assignment anywhere in the UI.",
    enforcedBy: "ui-svelte-check",
  },
  {
    name: "ui-machines-composed-and-modelled-first",
    title: "Machines are composed of simpler ones, and modelled first",
    audience: "everyone",
    strength: "should",
    text:
      "A machine is built from simpler ones as far as the formalism allows: machines side by side are their product; machines that synchronise on shared actions are parallel processes. Each is modelled first in mCRL2 and its code generated with naima-codegen, with its properties checked. Only where a model is clearly, justifiably useless overhead (a few states, no concurrency, nothing worth proving) is the machine written directly as a .svelte.ts class in the same shape, with the reason in a comment at its top.",
    why:
      "behaviour with states fails in the orders of events nobody tested; a model checker explores every order, and small machines composed are small models to check.",
  },
  {
    name: "ui-components-keep-only-local-ui-state",
    title: "Components keep only their own UI state, read the store and call transitions",
    audience: "everyone",
    strength: "must",
    text:
      "A component may keep state that is purely its own and means nothing to the app: whether a dropdown is open, the caps lock, the text being typed before it is sent. Everything else it reads from the store's views and changes by calling a machine's transition. A component imports Svelte, other components and the store module; anything else only as a type. A widget of the set is generic and does not even read the store: it takes props and reports through callbacks.",
    why:
      "state kept in a component is invisible to the machines, so the app's behaviour would depend on what is mounted; generic widgets are what makes them reusable across projects.",
    enforcedBy: "ui-component-imports",
  },
  {
    name: "ui-design-tokens-only",
    title: "Every colour, size and duration is a design token",
    audience: "everyone",
    strength: "must",
    text:
      "The design's values are design tokens in the W3C Design Tokens (DTCG) format, built to CSS custom properties, and a component uses them only as var(--token): no hex, rgb() or named colour, no px, rem or ms, not in a <style>, a style attribute, a style: directive or an SVG paint attribute. Percentages, fr, viewport units and unitless numbers describe layout and stay allowed.",
    why:
      "a value written in a component is a design decision nobody can find or change in one place, and it breaks the next mood board.",
    enforcedBy: "ui-no-raw-literals",
  },
  {
    name: "ui-mood-board-chosen-at-design-time",
    title: "The mood board is chosen at design time",
    audience: "everyone",
    strength: "must",
    text:
      "A mood board is a complete set of token values, and every mood board defines the same tokens. The project chooses one while it is designed and builds it into its CSS; the app does not switch between mood boards at run time.",
    why:
      "a mood board is a design choice, made once and reviewed; the same token names in every mood board are what lets a project change its choice without touching a component.",
    enforcedBy: "ui-tokens",
  },
  {
    name: "ui-compositional-widget-set",
    title: "Larger components are built from smaller ones",
    audience: "everyone",
    strength: "should",
    text:
      "The widget set has primitives (Button, Text, Input, Checkbox, Icon, Stack, Cluster) and components composed from them (Field, Dropdown, Dialog, Card, Toolbar); a new component is built from existing ones before it is written from scratch. The set is copied into the project with `naima stance-ui adopt`, as source the project owns, and stance-ui.json records the stance's version so that later updates can be compared.",
    why:
      "composition keeps the look and the behaviour (focus, keyboard, labels) consistent, since each is written once, in the smallest component that needs it.",
  },
];

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
      "the UI stance by makebecome: logic without UI, one store written by transitions, design tokens, a compositional widget set",
    about:
      "A stance is a set of authored, opinionated choices and rules a project adopts. This one, by makebecome, is about user interfaces: the app's logic is code with no UI; one deep-reactive Svelte 5 store holds every state machine and is written only through their transitions; machines are composed of simpler ones and modelled first; components keep only their own UI state; every colour, size and duration is a DTCG design token; the mood board is chosen at design time; the widget set is compositional. " +
      "Its rules are listed by `naima rules`; its checks run with `naima check` and need Deno on the PATH; `naima stance-ui adopt` copies the widget set, the store and a mood board into the project.",
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
