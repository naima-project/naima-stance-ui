/// <reference lib="dom" />
// The browser checks: the app's built pages, opened headless in Chromium through Playwright, in the light and
// the dark theme, on a desktop and a phone, in each state the configuration names.
//
//   a11y            axe-core at WCAG 2.2 AA (the tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa), so every
//                   violation axe can find is a problem; then the keyboard: every control is reached with Tab,
//                   shows a focus ring at least two pixels wide and is not hidden under other content when
//                   focused (SC 2.1.1, 2.4.7, 2.4.11); the page reflows at 320 CSS px without scrolling sideways
//                   (SC 1.4.10), and still fits with text at 200% (SC 1.4.4).
//   target-size     every pointer target is at least 24 by 24 CSS px, or far enough from the others (SC 2.5.8).
//   reduced-motion  with the system asking for reduced motion, no transition or animation lasts any time.
//
// The pages are served over HTTP from the project's root, on the loopback address, for the run only.

import { serveDir } from "@std/http/file-server";
import { posix } from "node:path";
import type { Page as PageConfig } from "./config.ts";
import type { Finding } from "./finding.ts";

export const BROWSER_CHECKS = ["a11y", "target-size", "reduced-motion"] as const;
export type BrowserCheck = typeof BROWSER_CHECKS[number];

/** The axe-core tags of WCAG 2.2 level A and AA, earlier versions' criteria included. */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SCHEMES = ["light", "dark"] as const;
const VIEWPORTS = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } } as const;
const PLAYWRIGHT_INSTALL = "deno run -A npm:playwright@1.60.0 install chromium";

/** One problem seen in one or more variants of a page (theme, viewport). */
class Collector {
  #seen = new Map<string, { check: BrowserCheck; file: string; message: string; variants: string[] }>();
  add(check: BrowserCheck, file: string, message: string, variant: string) {
    const key = `${check}\n${file}\n${message}`;
    const entry = this.#seen.get(key) ?? { check, file, message, variants: [] };
    if (!entry.variants.includes(variant)) entry.variants.push(variant);
    this.#seen.set(key, entry);
  }
  findings(): Finding[] {
    return [...this.#seen.values()].map((e) => ({
      check: e.check,
      level: "problem",
      file: e.file,
      message: `${e.message} (${e.variants.join("; ")})`,
    }));
  }
}

async function build(root: string, command: string[]): Promise<string | null> {
  const [cmd, ...args] = command;
  try {
    const out = await new Deno.Command(cmd === "deno" ? Deno.execPath() : cmd, {
      args,
      cwd: root,
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (out.code === 0) return null;
    const err = new TextDecoder().decode(out.stderr).trim().split("\n").slice(-3).join(" ");
    return `${command.join(" ")} exited with ${out.code}: ${err}`;
  } catch (e) {
    return `${command.join(" ")}: ${(e as Error).message}`;
  }
}

// --- What runs inside the page. Each function is serialised by Playwright, so it uses nothing from outside.

/** A short, readable name for an element: its tag and its accessible-ish name. */
const NAME_SOURCE = `(el) => {
  const tag = el.tagName.toLowerCase();
  const label = el.getAttribute("aria-label") || (el.labels && el.labels[0] && el.labels[0].textContent) ||
    el.textContent || el.getAttribute("title") || el.getAttribute("name") || "";
  const text = label.replace(/\\s+/g, " ").trim().slice(0, 40);
  return text ? tag + ' "' + text + '"' : tag + (el.id ? "#" + el.id : "");
}`;

interface FocusStop {
  name: string;
  ring: boolean;
  covered: string | null;
}

async function tabWalk(page: import("playwright").Page): Promise<{ stops: FocusStop[]; missed: string[] }> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const count = await page.evaluate(() => document.querySelectorAll("*").length);
  const stops: FocusStop[] = [];
  const visited = new Set<string>();
  for (let i = 0; i < Math.min(count, 400); i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate((nameSource) => {
      const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      const id = el.getAttribute("data-stance-visited") ?? String(Math.random());
      const again = el.hasAttribute("data-stance-visited");
      el.setAttribute("data-stance-visited", id);
      // A focus ring: what the control, or the label that wraps it, shows when focused and not otherwise —
      // an outline at least two pixels wide, or a change of its box shadow.
      const look = (x: Element | null) => {
        if (!x) return null;
        const cs = getComputedStyle(x);
        return { outline: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2, shadow: cs.boxShadow };
      };
      const host = el.closest("label");
      const focused = [look(el), look(host)];
      (el as HTMLElement).blur();
      const blurred = [look(el), look(host)];
      (el as HTMLElement).focus();
      const ring = focused.some((f, i) =>
        f !== null && ((f.outline && !blurred[i]!.outline) || f.shadow !== blurred[i]!.shadow)
      );
      const r = el.getBoundingClientRect();
      const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
      const y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
      const hit = document.elementFromPoint(x, y);
      const label = hit?.closest("label");
      const own = hit !== null && (hit === el || el.contains(hit) ||
        (label !== null && label !== undefined && (label.contains(el) || (label as HTMLLabelElement).control === el)));
      return {
        id,
        again,
        name: name(el),
        ring,
        covered: own ? null : hit ? name(hit) : "nothing",
      };
    }, NAME_SOURCE);
    if (stop === null) {
      if (stops.length > 0) break;
      continue;
    }
    if (stop.again || visited.has(stop.id)) break;
    visited.add(stop.id);
    stops.push({ name: stop.name, ring: stop.ring, covered: stop.covered });
  }
  const missed = await page.evaluate((nameSource) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    const out: string[] = [];
    const sel = "a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex]";
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      if (el.hasAttribute("data-stance-visited") || el.tabIndex < 0) continue;
      if ((el as HTMLButtonElement).disabled || el.closest("[inert]")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
      // In a group of radio buttons, Tab reaches one and the arrow keys the others.
      if (el instanceof HTMLInputElement && el.type === "radio" && el.name) {
        const group = document.querySelectorAll(`input[type=radio][name="${CSS.escape(el.name)}"]`);
        if ([...group].some((g) => g.hasAttribute("data-stance-visited"))) continue;
      }
      out.push(name(el));
    }
    for (const el of document.querySelectorAll("[data-stance-visited]")) el.removeAttribute("data-stance-visited");
    return out;
  }, NAME_SOURCE);
  return { stops, missed };
}

/** Targets smaller than 24 by 24 CSS px whose 24 px circle meets another target (SC 2.5.8). */
async function smallTargets(page: import("playwright").Page): Promise<string[]> {
  return await page.evaluate((nameSource) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    const sel = [
      "a[href]",
      "button",
      "input:not([type=hidden])",
      "select",
      "textarea",
      "summary",
      ...["button", "checkbox", "radio", "switch", "tab", "menuitem", "menuitemradio", "menuitemcheckbox", "option"]
        .map((r) => `[role=${r}]`),
      "[role=link]",
      "[role=slider]",
      "[tabindex]:not([tabindex='-1'])",
    ].join(", ");
    type T = { el: Element; x: number; y: number; w: number; h: number };
    const targets: T[] = [];
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || el.closest("[inert]")) continue;
      // A control inside its label is clicked through the whole label.
      const box = (el.closest("label") ?? el).getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      // A link inside a sentence is exempt (the inline exception).
      if (
        el.tagName === "A" && getComputedStyle(el).display === "inline" && el.parentElement &&
        [...el.parentElement.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim() !== "")
      ) continue;
      targets.push({ el, x: box.left, y: box.top, w: box.width, h: box.height });
    }
    const small = (t: T) => t.w < 24 || t.h < 24;
    const centre = (t: T) => [t.x + t.w / 2, t.y + t.h / 2];
    const distToRect = (px: number, py: number, t: T) => {
      const dx = Math.max(t.x - px, 0, px - (t.x + t.w));
      const dy = Math.max(t.y - py, 0, py - (t.y + t.h));
      return Math.hypot(dx, dy);
    };
    const out: string[] = [];
    for (const t of targets.filter(small)) {
      const [cx, cy] = centre(t);
      const crowded = targets.some((o) => {
        if (o === t || o.el.contains(t.el) || t.el.contains(o.el)) return false;
        if (distToRect(cx, cy, o) < 12) return true;
        if (small(o)) {
          const [ox, oy] = centre(o);
          return Math.hypot(cx - ox, cy - oy) < 24;
        }
        return false;
      });
      if (crowded) {
        out.push(`${name(t.el)} is ${Math.round(t.w)}×${Math.round(t.h)} CSS px, too close to other targets`);
      }
    }
    return out;
  }, NAME_SOURCE);
}

/** Elements that still move when the system asks for reduced motion. */
async function moving(page: import("playwright").Page): Promise<string[]> {
  return await page.evaluate((nameSource) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    const seconds = (list: string) =>
      Math.max(0, ...list.split(",").map((d) => d.trim().endsWith("ms") ? parseFloat(d) / 1000 : parseFloat(d) || 0));
    const out: string[] = [];
    for (const el of document.querySelectorAll("*")) {
      for (const pseudo of [null, "::before", "::after"]) {
        const cs = getComputedStyle(el, pseudo);
        const t = seconds(cs.transitionDuration);
        const a = cs.animationName !== "none" ? seconds(cs.animationDuration) : 0;
        if (t > 0) out.push(`${name(el)}${pseudo ?? ""} has a transition of ${t}s`);
        if (a > 0) out.push(`${name(el)}${pseudo ?? ""} has an animation of ${a}s`);
      }
    }
    return out;
  }, NAME_SOURCE);
}

const overflows = (page: import("playwright").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Runs the chosen browser checks on the configured pages of the project at `root`. */
export async function browserChecks(
  root: string,
  pages: PageConfig[],
  only: readonly BrowserCheck[],
): Promise<Finding[]> {
  if (only.length === 0) return [];
  if (pages.length === 0) {
    return only.map((check) => ({
      check,
      level: "problem" as const,
      file: "stance-ui.json",
      message: "no pages to open: list the app's built pages under check.pages",
    }));
  }
  const findings: Finding[] = [];
  const built = new Set<string>();
  for (const p of pages) {
    if (!p.build || built.has(JSON.stringify(p.build))) continue;
    built.add(JSON.stringify(p.build));
    const err = await build(root, p.build);
    if (err) findings.push({ check: only[0], level: "problem", file: p.path, message: `the build failed: ${err}` });
  }
  if (findings.length) return findings;

  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen: () => {} },
    (req) => serveDir(req, { fsRoot: root, quiet: true }),
  );
  const base = `http://127.0.0.1:${server.addr.port}`;
  const { chromium } = await import("playwright");
  const axeSource: string = ((await import("axe-core")) as unknown as { default: { source: string } }).default.source;
  let browser: import("playwright").Browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    await server.shutdown();
    return [{
      check: only[0],
      level: "problem",
      message: `cannot start headless Chromium (${
        (e as Error).message.split("\n")[0]
      }): install it with ${PLAYWRIGHT_INSTALL}`,
    }];
  }
  const found = new Collector();
  try {
    for (const p of pages) {
      const url = `${base}/${posix.normalize(p.path)}`;
      try {
        await Deno.stat(`${root}/${p.path}`);
      } catch {
        findings.push({ check: only[0], level: "problem", file: p.path, message: "no such page: is it built?" });
        continue;
      }
      for (const state of [{ name: "", click: [] as string[] }, ...(p.states ?? [])]) {
        const where = `${p.name}${state.name ? ` (${state.name})` : ""}`;
        const open = async (options: import("playwright").BrowserContextOptions) => {
          const context = await browser.newContext(options);
          const page = await context.newPage();
          const errors: string[] = [];
          page.on("pageerror", (e) => errors.push(e.message));
          page.on(
            "response",
            (r) => r.status() >= 400 && errors.push(`${r.url().slice(base.length)} answered ${r.status()}`),
          );
          await page.goto(url, { waitUntil: "networkidle" });
          for (const sel of state.click) {
            try {
              await page.click(sel, { timeout: 5000 });
            } catch {
              errors.push(`nothing to click at ${sel}`);
            }
          }
          await page.waitForTimeout(state.click.length ? 400 : 50);
          return { context, page, errors };
        };
        for (const scheme of SCHEMES) {
          for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
            const variant = `${scheme}, ${vp}`;
            const { context, page, errors } = await open({
              viewport,
              colorScheme: scheme,
              reducedMotion: "no-preference",
              ...(vp === "phone" ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
            });
            for (const e of errors) found.add(only[0], p.path, `${where}: ${e}`, variant);
            if (only.includes("a11y")) {
              await page.addScriptTag({ content: axeSource });
              const violations = await page.evaluate(async (tags) => {
                // deno-lint-ignore no-explicit-any
                const axe = (globalThis as any).axe;
                const r = await axe.run(document, {
                  runOnly: { type: "tag", values: tags },
                  resultTypes: ["violations"],
                });
                // deno-lint-ignore no-explicit-any
                return r.violations.flatMap((v: any) =>
                  // deno-lint-ignore no-explicit-any
                  v.nodes.map((n: any) => `${v.id}: ${v.help} at ${n.target.join(" ")}`)
                );
              }, WCAG_TAGS);
              for (const v of violations) found.add("a11y", p.path, `${where}: ${v}`, variant);
              // The keyboard walk starts from the page as it loads: in a state reached by clicking, a modal
              // dialog or an open menu holds the focus on purpose.
              if (vp === "desktop" && state.click.length === 0) {
                const { stops, missed } = await tabWalk(page);
                for (const s of stops) {
                  if (!s.ring) {
                    found.add("a11y", p.path, `${where}: ${s.name} shows no focus ring when focused`, variant);
                  }
                  if (s.covered) {
                    found.add("a11y", p.path, `${where}: ${s.name} is under ${s.covered} when focused`, variant);
                  }
                }
                for (const m of missed) found.add("a11y", p.path, `${where}: ${m} cannot be reached with Tab`, variant);
                await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
                const over = await overflows(page);
                if (over > 1) {
                  found.add(
                    "a11y",
                    p.path,
                    `${where}: with text at 200% the page scrolls sideways by ${over} px`,
                    variant,
                  );
                }
              }
            }
            if (only.includes("target-size")) {
              for (const t of await smallTargets(page)) found.add("target-size", p.path, `${where}: ${t}`, variant);
            }
            await context.close();
          }
          if (only.includes("a11y")) {
            const { context, page } = await open({ viewport: { width: 320, height: 640 }, colorScheme: scheme });
            const over = await overflows(page);
            if (over > 1) {
              found.add("a11y", p.path, `${where}: at 320 CSS px wide the page scrolls sideways by ${over} px`, scheme);
            }
            await context.close();
          }
          if (only.includes("reduced-motion")) {
            const { context, page } = await open({
              viewport: VIEWPORTS.desktop,
              colorScheme: scheme,
              reducedMotion: "reduce",
            });
            for (const m of await moving(page)) {
              found.add("reduced-motion", p.path, `${where}: with reduced motion asked for, ${m}`, scheme);
            }
            await context.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
    await server.shutdown();
  }
  return [...findings, ...found.findings()];
}
