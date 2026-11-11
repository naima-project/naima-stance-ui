/// <reference lib="dom" />
// Phone and desktop are equals (rule 28): five browser checks, each run on the app's built pages and on every state
// stance-ui.json names, in the profiles of the testing matrix (matrix.ts, EQUALS_PROFILES).
//
//   action-parity      in each profile (a desktop with a mouse, two phones and a tablet with a finger), every visible
//                      control is clicked or tapped, and every control a click opens (a menu, a sheet) after it; the
//                      store's transitions each one reaches are recorded (the store's probe hook, filtered by the
//                      generated registry when the project has one). The sets must be equal on every screen: a finding
//                      names the transition, the screen and the profile that cannot reach it.
//   hover-only         with no hover (a phone), nothing that a :hover rule or a mouseenter handler reveals stays
//                      hidden: it is on screen, or a tap on the element shows it too.
//   keyboard-viewport  on a phone, with a text field focused and the visual viewport shrunk to 60% (the on-screen
//                      keyboard), the field lies inside what is left; it says with enterkeyhint what Enter does.
//   phone-layout       on a phone, the navigation is a bar at the bottom, in the thumb's reach, of at most five
//                      destinations and a More; what a control opens is a bottom sheet with a Close button, never a
//                      popover anchored to the control; no table is wider than the window; the screen's primary action
//                      ([data-primary-action]) sits in the bottom third.
//   desktop-keys       on a desktop, every control that takes a click takes the focus too and shows a ring; what a
//                      control opens takes the keyboard and closes with Escape, giving the focus back; ? opens a
//                      Keyboard shortcuts sheet that lists every aria-keyshortcuts of the page.

import type { Browser, BrowserContextOptions, Page } from "playwright";
import type { Page as PageConfig } from "./config.ts";
import { DESKTOP, EQUALS_PROFILES, PHONES } from "./matrix.ts";
import { NAME_SOURCE, TARGETS } from "./responsive.ts";
import { tabWalk } from "./browser.ts";

export const EQUALS_CHECKS = [
  "action-parity",
  "hover-only",
  "keyboard-viewport",
  "phone-layout",
  "desktop-keys",
] as const;
export type EqualsCheck = typeof EQUALS_CHECKS[number];

/** Where a finding goes: the check, the page's file, the message, the profile it was seen in. */
export type Add = (check: EqualsCheck, file: string, message: string, variant: string) => void;

/** The most controls a screen is explored through in one profile, menus included. */
const MAX_CLICKS = 300;
/** How long a click is given to call its transitions and draw what it opens, ms. */
const SETTLE = 250;

/** The probe the page's store calls when it is made (createStore): it wraps every method of every machine so that a
 *  call is recorded, as "machine.name". Serialised into the page before its scripts run. */
const PROBE = `(() => {
  const probe = { calls: [], attach(store) {
    for (const [machine, m] of Object.entries(store)) {
      if (!m || typeof m !== "object") continue;
      const names = new Set();
      const own = (o) => { for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(o))) {
        if (typeof d.value === "function" && k !== "constructor" && k !== "allowed") names.add(k);
      } };
      own(m);
      for (let o = Object.getPrototypeOf(m); o && o !== Object.prototype; o = Object.getPrototypeOf(o)) own(o);
      for (const k of names) {
        const f = m[k];
        try {
          Object.defineProperty(m, k, { configurable: true, writable: true, value: function (...a) {
            probe.calls.push(machine + "." + k);
            return f.apply(this, a);
          } });
        } catch { /* a frozen machine is not recorded */ }
      }
    }
  } };
  globalThis.__stanceProbe = probe;
  // The elements a page listens on for the mouse's arrival: what hover may reveal.
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, ...rest) {
    if (this instanceof Element && /^(mouseenter|mouseover|pointerenter|pointerover)$/.test(type)) {
      this.setAttribute("data-stance-hover", "");
    }
    if (this instanceof Element && type === "click") this.setAttribute("data-stance-click", "");
    return add.call(this, type, ...rest);
  };
  // The visual viewport, which the keyboard probe shrinks as an on-screen keyboard does.
  const real = globalThis.visualViewport;
  if (real) {
    let height = null;
    const fake = new EventTarget();
    for (const k of ["width", "offsetLeft", "pageLeft", "scale"]) Object.defineProperty(fake, k, { get: () => real[k] });
    Object.defineProperty(fake, "height", { get: () => height ?? real.height });
    Object.defineProperty(fake, "offsetTop", { get: () => height === null ? real.offsetTop : 0 });
    Object.defineProperty(fake, "pageTop", { get: () => scrollY });
    for (const t of ["resize", "scroll"]) real.addEventListener(t, () => fake.dispatchEvent(new Event(t)));
    Object.defineProperty(globalThis, "visualViewport", { configurable: true, get: () => fake });
    globalThis.__stanceKeyboard = (part) => {
      height = part === null ? null : Math.round(innerHeight * part);
      fake.dispatchEvent(new Event("resize"));
    };
  }
})()`;

interface Control {
  /** Its role, its name and its place among the controls of the same role and name: the same control in every
   *  profile and after every reload. */
  key: string;
  /** How a finding says it. */
  name: string;
  /** It opens something (a menu, a sheet, a disclosure). */
  opens: boolean;
  /** Its shape: its role and the tags and classes of its place in the page, without its text. The rows of one list
   *  share it, and only the first few of a shape are explored: the others reach what they reach. */
  shape: string;
}

/** How many controls of one shape are explored on a screen. */
const PER_SHAPE = 3;
const fewOfEach = (cs: Control[]) => {
  const n = new Map<string, number>();
  return cs.filter((c) => {
    const k = (n.get(c.shape) ?? 0) + 1;
    n.set(c.shape, k);
    return k <= PER_SHAPE;
  });
};

/** The controls a person can see now, each tagged data-stance-ctl with its key. Serialised into the page. */
function visibleControls(page: Page): Promise<Control[]> {
  return page.evaluate(({ nameSource, targets }) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    const role = (el: Element) => {
      const r = el.getAttribute("role");
      if (r) return r;
      const t = el.tagName.toLowerCase();
      if (t === "a") return "link";
      if (t === "input") {
        const type = (el as HTMLInputElement).type;
        return type === "checkbox" || type === "radio" || type === "range"
          ? type
          : type === "button"
          ? "button"
          : "textbox";
      }
      return t === "select" ? "combobox" : t === "textarea" ? "textbox" : t === "summary" ? "button" : t;
    };
    const seen = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      if (el.closest("[inert], [aria-hidden=true]")) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.pointerEvents === "none") return false;
      for (let a: Element | null = el; a; a = a.parentElement) {
        if (parseFloat(getComputedStyle(a).opacity) < 0.05) return false;
      }
      return true;
    };
    const count = new Map<string, number>();
    const out: { key: string; name: string; opens: boolean; shape: string }[] = [];
    const shapeOf = (el: Element) => {
      const parts: string[] = [];
      for (let a: Element | null = el; a && a !== document.body && parts.length < 6; a = a.parentElement) {
        parts.push(
          a.tagName.toLowerCase() +
            [...a.classList].filter((c) => !c.startsWith("svelte-")).map((c) => `.${c}`).join(""),
        );
      }
      return `${role(el)}|${parts.reverse().join(">")}`;
    };
    for (const el of document.querySelectorAll("[data-stance-ctl]")) el.removeAttribute("data-stance-ctl");
    for (const el of document.querySelectorAll(targets)) {
      if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true" || !seen(el)) continue;
      // A link that leaves the app is not one of its actions.
      if (
        el instanceof HTMLAnchorElement &&
        (el.target === "_blank" || (el.href && new URL(el.href).origin !== location.origin))
      ) continue;
      const base = `${role(el)}|${name(el)}`;
      const n = count.get(base) ?? 0;
      count.set(base, n + 1);
      const key = `${base}|${n}`;
      el.setAttribute("data-stance-ctl", key);
      const popup = el.getAttribute("aria-haspopup");
      out.push({
        key,
        name: name(el),
        opens: (popup !== null && popup !== "false") || el.getAttribute("aria-expanded") === "false" ||
          el.tagName === "SUMMARY",
        shape: shapeOf(el),
      });
    }
    return out;
  }, { nameSource: NAME_SOURCE, targets: TARGETS });
}

/** The surfaces open now: menus, dialogs, sheets and popovers, by a key and their box. */
function openSurfaces(page: Page): Promise<{ id: string; name: string; box: DOMRect; close: boolean }[]> {
  return page.evaluate((nameSource) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    const out: { id: string; name: string; box: DOMRect; close: boolean }[] = [];
    const sel = "[role=menu], [role=dialog], [role=alertdialog], dialog[open], [popover], [data-sheet]";
    let i = 0;
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || getComputedStyle(el).visibility === "hidden") continue;
      if (el.parentElement?.closest(sel)) continue;
      const id = el.getAttribute("data-stance-surface") ?? `s${Date.now()}-${i++}`;
      el.setAttribute("data-stance-surface", id);
      const close = [...el.querySelectorAll("button, [role=button]")].some((b) =>
        /\b(close|done|cancel)\b/i.test(b.getAttribute("aria-label") ?? b.textContent ?? "")
      );
      out.push({ id, name: name(el), box: r.toJSON() as DOMRect, close });
    }
    return out;
  }, NAME_SOURCE);
}

/** The state's clicks, as the DOM's own click on each element: a state is the same screen in every profile, even where
 *  the control that leads to it is hidden at that width (the phone reaches it otherwise, which action-parity checks). */
async function reachState(page: Page, clicks: string[]) {
  for (const sel of clicks) {
    const at = page.locator(sel).first();
    try {
      await at.waitFor({ state: "attached", timeout: 5000 });
      await at.evaluate((el) => (el as HTMLElement).click());
      await page.waitForTimeout(150);
    } catch {
      // nothing to click: the screen stays as it is, and the checks say what they find there
    }
  }
}

/** Opens a screen: the page, the state's clicks, then a moment for it to settle. */
async function openScreen(
  browser: Browser,
  url: string,
  clicks: string[],
  options: BrowserContextOptions,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext(options);
  await context.addInitScript(PROBE);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await reachState(page, clicks);
  await page.waitForTimeout(clicks.length ? 400 : 100);
  return { page, close: () => context.close() };
}

async function goto(page: Page, url: string, clicks: string[]) {
  await page.goto("about:blank");
  await page.goto(url, { waitUntil: "networkidle" });
  await reachState(page, clicks);
  await page.waitForTimeout(clicks.length ? 400 : 100);
}

const calls = (page: Page) =>
  page.evaluate(() => {
    const p = (globalThis as unknown as { __stanceProbe?: { calls: string[] } }).__stanceProbe;
    const out = p ? [...p.calls] : [];
    if (p) p.calls.length = 0;
    return out;
  });

/** Clicks or taps a control by its key, as the profile's pointer does; false when it is not there. */
async function press(page: Page, key: string, touch: boolean): Promise<boolean> {
  const at = page.locator(`[data-stance-ctl="${key.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"]`).first();
  if ((await at.count()) === 0) return false;
  try {
    if (touch) await at.tap({ timeout: 2000 });
    else await at.click({ timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

// --- action parity ---------------------------------------------------------------------------------------------

/** What one profile reaches on a screen: each transition, with the first control that reached it. */
async function reach(
  browser: Browser,
  url: string,
  clicks: string[],
  options: BrowserContextOptions,
): Promise<{ reached: Map<string, string>; ambient: Set<string> }> {
  const touch = !!options.hasTouch;
  const { page, close } = await openScreen(browser, url, clicks, options);
  const reached = new Map<string, string>();
  const ambient = new Set<string>();
  try {
    // What the page calls by itself, with nobody touching it, is not an action of anyone.
    await calls(page);
    await page.waitForTimeout(600);
    for (const c of await calls(page)) ambient.add(c);
    const base = await visibleControls(page);
    const baseKeys = new Set(base.map((c) => c.key));
    const queue: { path: string[]; name: string }[] = fewOfEach(base).map((c) => ({ path: [c.key], name: c.name }));
    let clicked = 0;
    let fresh = true;
    while (queue.length && clicked < MAX_CLICKS) {
      const { path, name } = queue.shift()!;
      if (!fresh) {
        await goto(page, url, clicks);
        await calls(page);
      }
      await visibleControls(page);
      let ok = true;
      for (const [i, key] of path.entries()) {
        if (i > 0) await visibleControls(page);
        await calls(page);
        const href = page.url();
        if (!(await press(page, key, touch))) {
          ok = false;
          break;
        }
        clicked++;
        await page.waitForTimeout(SETTLE);
        for (const c of await calls(page)) if (!reached.has(c)) reached.set(c, name);
        if (i === path.length - 1 && path.length < 2 && page.url() === href) {
          // What this click opened: explore its controls in turn.
          const now = await visibleControls(page);
          const opened = now.filter((c) => !baseKeys.has(c.key));
          for (const c of fewOfEach(opened)) {
            queue.push({ path: [...path, c.key], name: `${c.name} (in what ${name} opens)` });
          }
          const same = page.url() === url && now.length === base.length && now.every((c) => baseKeys.has(c.key));
          fresh = same;
          if (same) await page.keyboard.press("Escape").catch(() => {});
        } else fresh = false;
      }
      if (!ok) fresh = false;
    }
  } finally {
    await close();
  }
  return { reached, ambient };
}

/** Each transition reached on a screen in one profile and not in another, said as a finding. */
async function actionParity(
  browser: Browser,
  url: string,
  file: string,
  where: string,
  clicks: string[],
  registry: Set<string> | null,
  add: Add,
) {
  const runs = await Promise.all(EQUALS_PROFILES.map((p) => reach(browser, url, clicks, p.options)));
  const ambient = new Set(runs.flatMap((r) => [...r.ambient]));
  const counts = (t: string) => !ambient.has(t) && (registry === null || registry.has(t));
  const all = new Set(runs.flatMap((r) => [...r.reached.keys()].filter(counts)));
  for (const t of [...all].sort()) {
    const have = EQUALS_PROFILES.filter((_, i) => runs[i]!.reached.has(t));
    for (const [i, p] of EQUALS_PROFILES.entries()) {
      if (runs[i]!.reached.has(t)) continue;
      const by = runs[EQUALS_PROFILES.indexOf(have[0]!)]!.reached.get(t);
      add(
        "action-parity",
        file,
        `${where}: ${t} is reached on ${have.map((h) => h.name).join(" and ")} (by ${by}) but not on ${p.name}`,
        p.name,
      );
    }
  }
}

// --- hover only ------------------------------------------------------------------------------------------------

/** What a :hover rule reveals that stays hidden without hover, and the elements that listen for the mouse. */
function hoverReveals(page: Page): Promise<{ css: string[]; listeners: string[] }> {
  return page.evaluate((nameSource) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    const css: string[] = [];
    const rules: CSSStyleRule[] = [];
    const walk = (list: CSSRuleList) => {
      for (const r of list) {
        if (r instanceof CSSStyleRule) rules.push(r);
        if ("cssRules" in r && (r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules);
      }
    };
    for (const s of document.styleSheets) {
      try {
        walk(s.cssRules);
      } catch { /* another origin's sheet */ }
    }
    const closed = (el: Element) =>
      !!el.parentElement?.closest("[hidden], details:not([open]), [inert]") ||
      (() => {
        for (let a = el.parentElement; a; a = a.parentElement) if (getComputedStyle(a).display === "none") return true;
        return false;
      })();
    for (const r of rules) {
      if (!r.selectorText.includes(":hover")) continue;
      const opacity = r.style.opacity !== "" && parseFloat(r.style.opacity) > 0.05;
      const visible = r.style.visibility === "visible";
      const display = r.style.display !== "" && r.style.display !== "none";
      if (!opacity && !visible && !display) continue;
      for (const sel of r.selectorText.split(",").map((s) => s.trim())) {
        if (!sel.includes(":hover") || /:not\([^)]*:hover/.test(sel)) continue;
        let els: Element[] = [];
        try {
          els = [...document.querySelectorAll(sel.replace(/:hover/g, ""))];
        } catch {
          continue;
        }
        const hidden = els.find((el) => {
          if (closed(el)) return false;
          const cs = getComputedStyle(el);
          return (opacity && parseFloat(cs.opacity) < 0.05) || (visible && cs.visibility === "hidden") ||
            (display && cs.display === "none");
        });
        if (hidden) css.push(`${sel} shows ${name(hidden)} only on hover: without hover it stays hidden`);
      }
    }
    const listeners: string[] = [];
    let i = 0;
    for (const el of document.querySelectorAll("*")) {
      const own = el as unknown as Record<string, unknown>;
      if (!el.hasAttribute("data-stance-hover") && !own["__mouseover"] && !own["__pointerover"]) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || el === document.body || el === document.documentElement) continue;
      el.setAttribute("data-stance-hover", String(i++));
      listeners.push(el.getAttribute("data-stance-hover")!);
    }
    return { css, listeners: listeners.slice(0, 30) };
  }, NAME_SOURCE);
}

/** The text and controls visible now, as a set of strings. */
const visibleText = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.children.length > 0 && !el.matches("button, a, [role=button]")) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 1 || r.height < 1 || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.05) continue;
      const t = (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (t) out.push(t);
    }
    return out;
  });

async function hoverOnly(browser: Browser, url: string, file: string, where: string, clicks: string[], add: Add) {
  const phone = PHONES[0]!;
  const { page, close } = await openScreen(browser, url, clicks, phone.options);
  try {
    const { css, listeners } = await hoverReveals(page);
    for (const m of css.slice(0, 15)) add("hover-only", file, `${where}: ${m}`, phone.name);
    for (const id of listeners) {
      const at = page.locator(`[data-stance-hover="${id}"]`).first();
      const before = new Set(await visibleText(page));
      const label = await at.evaluate(
        (el, src) => (new Function(`return ${src}`)() as (e: Element) => string)(el),
        NAME_SOURCE,
      )
        .catch(() => "");
      await at.dispatchEvent("pointerover", { pointerType: "mouse" }).catch(() => {});
      await at.dispatchEvent("pointerenter", { pointerType: "mouse" }).catch(() => {});
      await at.dispatchEvent("mouseover").catch(() => {});
      await at.dispatchEvent("mouseenter").catch(() => {});
      await page.waitForTimeout(150);
      const shown = (await visibleText(page)).filter((t) => !before.has(t));
      await at.dispatchEvent("mouseleave").catch(() => {});
      await at.dispatchEvent("pointerleave", { pointerType: "mouse" }).catch(() => {});
      if (shown.length === 0) continue;
      // Shown by hover: a tap on the same element must show it too.
      await goto(page, url, clicks);
      await hoverReveals(page);
      await page.locator(`[data-stance-hover="${id}"]`).first().tap({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(SETTLE);
      const after = new Set(await visibleText(page));
      const missing = shown.filter((t) => !after.has(t));
      if (missing.length) {
        add(
          "hover-only",
          file,
          `${where}: ${label} shows "${missing[0]!.slice(0, 40)}" on hover only: a tap does not show it`,
          phone.name,
        );
      }
      await goto(page, url, clicks);
      await hoverReveals(page);
    }
  } finally {
    await close();
  }
}

// --- the on-screen keyboard ------------------------------------------------------------------------------------

const FIELDS = "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])" +
  ":not([type=range]):not([type=color]):not([type=file]):not([type=reset]):not([type=image]), textarea, [contenteditable=true]";

async function keyboardViewport(
  browser: Browser,
  url: string,
  file: string,
  where: string,
  clicks: string[],
  add: Add,
) {
  for (const phone of PHONES) {
    const { page, close } = await openScreen(browser, url, clicks, phone.options);
    try {
      const resizes = await page.evaluate(() =>
        /interactive-widget\s*=\s*resizes-content/.test(
          document.querySelector("meta[name=viewport]")?.getAttribute("content") ?? "",
        )
      );
      const count = await page.evaluate((sel) => {
        let i = 0;
        for (const el of document.querySelectorAll(sel)) {
          const r = el.getBoundingClientRect();
          if (r.width < 1 || el.closest("[inert]") || getComputedStyle(el).visibility === "hidden") continue;
          el.setAttribute("data-stance-field", String(i++));
        }
        return i;
      }, FIELDS);
      const full = page.viewportSize()!;
      for (let i = 0; i < Math.min(count, 15); i++) {
        const facts = await page.evaluate(({ i, nameSource, resizes }) => {
          const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
          const el = document.querySelector<HTMLElement>(`[data-stance-field="${i}"]`)!;
          scrollTo(0, 0);
          el.focus();
          if (!resizes) {
            (globalThis as unknown as { __stanceKeyboard?: (p: number | null) => void }).__stanceKeyboard?.(0.6);
          }
          return { name: name(el), hint: el.getAttribute("enterkeyhint"), area: el.tagName === "TEXTAREA" };
        }, { i, nameSource: NAME_SOURCE, resizes });
        if (resizes) await page.setViewportSize({ width: full.width, height: Math.round(full.height * 0.6) });
        await page.waitForTimeout(SETTLE);
        const seen = await page.evaluate(({ i, nameSource }) => {
          const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
          const el = document.querySelector<HTMLElement>(`[data-stance-field="${i}"]`)!;
          const top = visualViewport ? visualViewport.offsetTop : 0;
          const bottom = top + (visualViewport ? visualViewport.height : innerHeight);
          const r = el.getBoundingClientRect();
          if (r.top < top - 1 || r.bottom > bottom + 1) {
            return `lies at ${Math.round(r.top)} to ${Math.round(r.bottom)} px, outside the ${
              Math.round(bottom - top)
            } px the keyboard leaves`;
          }
          const hit = document.elementFromPoint(
            Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1),
            r.top + Math.min(r.height / 2, 12),
          );
          const label = hit?.closest("label");
          if (hit && hit !== el && !el.contains(hit) && !(label && (label as HTMLLabelElement).control === el)) {
            return `is under ${name(hit)}`;
          }
          return null;
        }, { i, nameSource: NAME_SOURCE });
        if (seen) {
          add(
            "keyboard-viewport",
            file,
            `${where}: ${facts.name} ${seen} while it has the focus and the keyboard is up`,
            phone.name,
          );
        }
        if (!facts.area && !facts.hint) {
          add(
            "keyboard-viewport",
            file,
            `${where}: ${facts.name} has no enterkeyhint: say what Enter does (search, go, done, send)`,
            phone.name,
          );
        }
        await page.evaluate(() => {
          (globalThis as unknown as { __stanceKeyboard?: (p: number | null) => void }).__stanceKeyboard?.(null);
          (document.activeElement as HTMLElement | null)?.blur();
        });
        if (resizes) await page.setViewportSize(full);
      }
    } finally {
      await close();
    }
  }
}

// --- the phone's layout ----------------------------------------------------------------------------------------

/** The navigation bars and their place, the tables wider than the window, the primary actions and their place. */
function phoneFacts(page: Page) {
  return page.evaluate((nameSource) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    const vw = document.documentElement.clientWidth;
    const vh = innerHeight;
    const out: string[] = [];
    const shown = (e: Element) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
    const navs = [...document.querySelectorAll("nav, [role=navigation]")].filter((n) =>
      shown(n) && !n.closest("main, [role=main], dialog, [role=dialog], [data-sheet]")
    );
    const entries = (n: Element) =>
      [...n.querySelectorAll("a[href], [role=link], [role=tab], button, [role=button]")].filter(shown);
    const bars = navs.filter((n) => entries(n).length >= 2);
    const bottom = bars.filter((n) => {
      const r = n.getBoundingClientRect();
      return r.bottom >= vh - 2 && r.top >= vh * 0.75;
    });
    if (bars.length > 0 && bottom.length === 0) {
      out.push(`the navigation (${name(bars[0]!)}) is not a bar at the bottom of the window, in the thumb's reach`);
    }
    for (const n of bars) {
      if (bottom.includes(n)) continue;
      const r = n.getBoundingClientRect();
      if (r.top < vh / 2 && entries(n).filter((e) => e.matches("a[href], [role=link], [role=tab]")).length >= 3) {
        out.push(`${name(n)} lists destinations at the top of the window: on a phone they sit in the bottom bar`);
      }
    }
    for (const n of bottom) {
      const es = entries(n);
      const more = es.filter((e) => /^(more|…|⋯)$/i.test((e.getAttribute("aria-label") ?? e.textContent ?? "").trim()));
      if (es.length - more.length > 5) {
        out.push(`${name(n)} holds ${es.length - more.length} destinations: at most five, and More for the rest`);
      }
    }
    for (const t of document.querySelectorAll("table, [role=table], [role=grid], [role=treegrid]")) {
      if (!shown(t)) continue;
      const w = Math.max(t.scrollWidth, t.getBoundingClientRect().width);
      if (w > vw + 1) {
        out.push(`${name(t)} is ${Math.round(w)} CSS px wide in a ${vw} px window: show its rows as cards`);
      }
    }
    const primary = [...document.querySelectorAll("[data-primary-action]")].filter(shown);
    if (primary.length > 1) out.push(`the screen has ${primary.length} primary actions: it has one`);
    for (const p of primary.slice(0, 1)) {
      const r = p.getBoundingClientRect();
      const y = r.top + r.height / 2;
      if (y < (vh * 2) / 3 || y > vh) {
        out.push(
          `the primary action ${name(p)} is at ${
            Math.round(y)
          } px of ${vh}: put it in the bottom third, in the thumb's reach`,
        );
      }
    }
    return out;
  }, NAME_SOURCE);
}

async function phoneLayout(browser: Browser, url: string, file: string, where: string, clicks: string[], add: Add) {
  for (const phone of PHONES) {
    const { page, close } = await openScreen(browser, url, clicks, phone.options);
    try {
      for (const m of await phoneFacts(page)) add("phone-layout", file, `${where}: ${m}`, phone.name);
      const openers = fewOfEach((await visibleControls(page)).filter((c) => c.opens)).slice(0, 25);
      const before = new Set((await openSurfaces(page)).map((s) => s.id));
      for (const c of openers) {
        if (!(await press(page, c.key, true))) continue;
        await page.waitForTimeout(SETTLE + 100);
        const vw = phone.options.viewport!.width;
        const vh = phone.options.viewport!.height;
        for (const s of (await openSurfaces(page)).filter((s) => !before.has(s.id))) {
          const sheet = s.box.left <= 1 && s.box.right >= vw - 1 && s.box.bottom >= vh - 2;
          if (!sheet) {
            add(
              "phone-layout",
              file,
              `${where}: ${c.name} opens ${s.name} as a popover by the control: on a phone it is a bottom sheet`,
              phone.name,
            );
          } else if (!s.close) {
            add("phone-layout", file, `${where}: ${c.name} opens ${s.name}, a sheet with no Close button`, phone.name);
          }
        }
        await goto(page, url, clicks);
        await visibleControls(page);
        for (const s of await openSurfaces(page)) before.add(s.id);
      }
    } finally {
      await close();
    }
  }
}

// --- the desktop's keyboard ------------------------------------------------------------------------------------

/** The elements that take a click and no focus: a mouse reaches them, the keyboard does not. */
function clickOnly(page: Page): Promise<string[]> {
  return page.evaluate((nameSource) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    const out: string[] = [];
    const composite = "[role=menu], [role=menubar], [role=tablist], [role=listbox], [role=grid], [role=radiogroup], " +
      "[role=toolbar], [role=tree], [role=treegrid]";
    for (const el of document.querySelectorAll<HTMLElement>("*")) {
      const own = el as unknown as Record<string, unknown>;
      const clicks = el.hasAttribute("onclick") || el.hasAttribute("data-stance-click") ||
        typeof own["__click"] === "function" ||
        typeof own["onclick"] === "function" ||
        /^(button|link|menuitem|tab|checkbox|switch|option)$/.test(el.getAttribute("role") ?? "");
      if (!clicks || el.tabIndex >= 0 || el.closest("[inert], [aria-hidden=true]")) continue;
      if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") continue;
      if (
        el.parentElement?.closest(composite) &&
        el.matches(
          "[role=menuitem], [role=tab], [role=option], [role=gridcell], [role=row], [role=treeitem], [role=radio]",
        )
      ) continue;
      // A click caught on a box that holds a real control is that control's.
      if (el.querySelector("a[href], button, input, select, textarea, summary, [tabindex]")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      out.push(`${name(el)} takes a click but not the keyboard's focus`);
    }
    return out.slice(0, 15);
  }, NAME_SOURCE);
}

async function desktopKeys(browser: Browser, url: string, file: string, where: string, clicks: string[], add: Add) {
  const cell = DESKTOP;
  const { page, close } = await openScreen(browser, url, clicks, cell.options);
  const say = (m: string) => add("desktop-keys", file, `${where}: ${m}`, cell.name);
  try {
    for (const m of await clickOnly(page)) say(m);
    if (clicks.length === 0) {
      const { stops, missed } = await tabWalk(page);
      for (const s of stops) if (!s.ring) say(`${s.name} shows no focus ring when focused`);
      for (const m of missed) say(`${m} cannot be reached with Tab`);
      await goto(page, url, clicks);
    }
    // What a control opens takes the keyboard, and Escape closes it, giving the focus back.
    const openers = fewOfEach((await visibleControls(page)).filter((c) => c.opens)).slice(0, 20);
    for (const c of openers) {
      const before = new Set((await openSurfaces(page)).map((s) => s.id));
      const at = page.locator(`[data-stance-ctl="${c.key.replaceAll('"', '\\"')}"]`).first();
      if ((await at.count()) === 0) continue;
      await at.focus().catch(() => {});
      await page.keyboard.press("Enter");
      await page.waitForTimeout(SETTLE);
      const opened = (await openSurfaces(page)).filter((s) => !before.has(s.id));
      for (const s of opened.slice(0, 1)) {
        const inside = () =>
          page.evaluate((id) => !!document.activeElement?.closest(`[data-stance-surface="${id}"]`), s.id);
        if (!(await inside())) {
          await page.keyboard.press("Tab");
          if (!(await inside())) say(`${c.name} opens ${s.name}, which the keyboard does not reach`);
        }
        await page.keyboard.press("Escape");
        await page.waitForTimeout(SETTLE);
        const still = await page.evaluate((id) => {
          const el = document.querySelector(`[data-stance-surface="${id}"]`);
          return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
        }, s.id);
        if (still) say(`Escape does not close ${s.name}, opened by ${c.name}`);
        else {
          const back = await page.evaluate(
            (key) => document.activeElement?.getAttribute("data-stance-ctl") === key,
            c.key,
          );
          if (!back) say(`closing ${s.name} does not give the focus back to ${c.name}`);
        }
      }
      await goto(page, url, clicks);
      await visibleControls(page);
    }
    // ? opens the Keyboard shortcuts sheet, which lists every shortcut the page declares.
    await goto(page, url, clicks);
    const declared = await page.evaluate((nameSource) => {
      const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
      return [...document.querySelectorAll("[aria-keyshortcuts]")].map((el) => ({
        keys: el.getAttribute("aria-keyshortcuts")!,
        name: name(el),
      }));
    }, NAME_SOURCE);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Shift+Slash");
    await page.waitForTimeout(SETTLE);
    const sheet = await page.evaluate(() => {
      const sel = "[role=dialog], dialog[open], [data-sheet], [popover]";
      for (const el of document.querySelectorAll(sel)) {
        if (el.getClientRects().length === 0 || getComputedStyle(el).visibility === "hidden") continue;
        const label = (el.getAttribute("aria-label") ?? "") + " " +
          (el.getAttribute("aria-labelledby")
            ? document.getElementById(el.getAttribute("aria-labelledby")!)?.textContent ?? ""
            : el.querySelector("h1, h2, h3")?.textContent ?? "");
        if (!/shortcut/i.test(label)) continue;
        return {
          keys: [...el.querySelectorAll("[data-keys]")].flatMap((k) => k.getAttribute("data-keys")!.split(" ")),
          kbd: el.querySelectorAll("kbd").length,
        };
      }
      return null;
    });
    // A page that declares no shortcut needs no sheet to list them.
    if (!sheet && declared.length > 0) say("pressing ? opens no Keyboard shortcuts sheet");
    else if (!sheet) { /* nothing to list */ }
    else {
      if (sheet.kbd === 0) say("the Keyboard shortcuts sheet shows no key (kbd)");
      const listed = new Set(sheet.keys.map((k) => k.toLowerCase()));
      for (const d of declared) {
        for (const k of d.keys.split(" ")) {
          if (!listed.has(k.toLowerCase())) {
            say(`the shortcut ${k} of ${d.name} is not in the Keyboard shortcuts sheet`);
          }
        }
      }
    }
  } finally {
    await close();
  }
}

/** Runs the chosen checks of rule 28 on every page and state. */
export async function equalsChecks(
  browser: Browser,
  base: string,
  pages: PageConfig[],
  only: readonly string[],
  registry: Set<string> | null,
  add: Add,
): Promise<void> {
  const on = (c: EqualsCheck) => only.includes(c);
  if (!EQUALS_CHECKS.some(on)) return;
  const total = pages.reduce((n, p) => n + 1 + (p.states?.length ?? 0), 0);
  let done = 0;
  const started = Date.now();
  for (const p of pages) {
    const url = `${base}/${p.path.replace(/^\.?\//, "")}`;
    for (const state of [{ name: "", click: [] as string[] }, ...(p.states ?? [])]) {
      const where = `${p.name}${state.name ? ` (${state.name})` : ""}`;
      // The progress, on stderr: the screen, how many are done of the total, and the time left at this pace.
      const left = done ? Math.round(((Date.now() - started) / done) * (total - done) / 1000) : null;
      console.error(
        `stance ui: phone and desktop, screen ${done + 1} of ${total}: ${where}${
          left === null ? "" : `, about ${left} s left`
        }`,
      );
      const jobs: Promise<void>[] = [];
      if (on("action-parity")) jobs.push(actionParity(browser, url, p.path, where, state.click, registry, add));
      if (on("hover-only")) jobs.push(hoverOnly(browser, url, p.path, where, state.click, add));
      if (on("keyboard-viewport")) jobs.push(keyboardViewport(browser, url, p.path, where, state.click, add));
      if (on("phone-layout")) jobs.push(phoneLayout(browser, url, p.path, where, state.click, add));
      if (on("desktop-keys")) jobs.push(desktopKeys(browser, url, p.path, where, state.click, add));
      await Promise.all(jobs);
      done++;
    }
  }
}
