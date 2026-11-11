// What the responsive checks look at in a page: probes that run inside the page, and the reading of its stylesheets.
// browser.ts opens each page in the cells of the testing matrix (matrix.ts) and calls these; each returns the problems
// it found, as plain sentences, and browser.ts files them under the check they belong to.
//
//   reflow       no sideways scroll or cut-off text in any cell, at 400% zoom, with text at 200% and with the text spacing
//                of SC 1.4.12 (rule 17)
//   fluid        viewport media queries only for the page frame; logical properties (rule 18)
//   type-scale   no fixed pixel font size; the text grows with the reader's setting (rule 19)
//   input-modes  nothing revealed only on hover; 44 CSS px targets for a finger (rule 20)
//   viewport     no 100vh, no zoom lock, safe areas for fixed bars, the keyboard leaves a focused field in view (rule 21)
//   nav          every destination of the top bar shows on a wide window, none hides behind "More" (rule 22)
//   media        images that reserve their box and fit their size, long lists that skip off-screen work (rule 23)
//   budget       a mid-range phone's profile: paint, layout shift, blocking time and bytes (rule 23)
//   preferences  forced colours, more contrast, reduced transparency (rule 24)

import type { Browser, Page } from "playwright";
import type { Budget } from "./matrix.ts";
import { BUDGET, MOBILE_PROFILE, PHONE } from "./matrix.ts";

/** A short, readable name for an element: its tag and its accessible-ish name. Serialised into the page. */
export const NAME_SOURCE = `(el) => {
  const tag = el.tagName.toLowerCase();
  const label = el.getAttribute("aria-label") || (el.labels && el.labels[0] && el.labels[0].textContent) ||
    el.textContent || el.getAttribute("title") || el.getAttribute("name") || "";
  const text = label.replace(/\\s+/g, " ").trim().slice(0, 40);
  return text ? tag + ' "' + text + '"' : tag + (el.id ? "#" + el.id : "");
}`;

export const TARGETS = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "summary",
  ...[
    "button",
    "checkbox",
    "radio",
    "switch",
    "tab",
    "menuitem",
    "menuitemradio",
    "menuitemcheckbox",
    "option",
    "link",
    "slider",
  ]
    .map((r) => `[role=${r}]`),
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

// --- reflow -------------------------------------------------------------------------------------------------------

/** How far the page scrolls sideways, and the elements that reach furthest past the right edge. */
export function sideways(page: Page): Promise<string[]> {
  return page.evaluate((nameSource) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    const vw = document.documentElement.clientWidth;
    const over = document.documentElement.scrollWidth - vw;
    if (over <= 1) return [];
    const reach: { el: Element; right: number }[] = [];
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.right <= vw + 1 || cs.position === "fixed" || cs.display === "none") continue;
      let a = el.parentElement;
      let held = false;
      while (a && a !== document.body && a !== document.documentElement) {
        if (getComputedStyle(a).overflowX !== "visible" && a.getBoundingClientRect().right <= vw + 1) {
          held = true;
          break;
        }
        a = a.parentElement;
      }
      if (!held) reach.push({ el, right: r.right });
    }
    reach.sort((x, y) => y.right - x.right);
    const who = reach.slice(0, 3).map((x) => name(x.el)).join(", ");
    return [`the page scrolls sideways${who ? `, past its right edge at ${who}` : ""}`];
  }, NAME_SOURCE);
}

/** Boxes that hide part of their text: overflow hidden or clipped around more content than fits. */
export function cutOff(page: Page): Promise<string[]> {
  return page.evaluate((nameSource) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    const out: string[] = [];
    const clips = (o: string) => o === "hidden" || o === "clip";
    for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      // A box of 1 px or less is hidden on purpose (the visually hidden pattern); one outside the window is off-screen.
      if (el.clientWidth <= 1 || el.clientHeight <= 1) continue;
      const r = el.getBoundingClientRect();
      if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight + 4000) continue;
      const w = el.scrollWidth - el.clientWidth;
      const h = el.scrollHeight - el.clientHeight;
      const wide = clips(cs.overflowX) && w > 1;
      const high = clips(cs.overflowY) && h > 1;
      if ((wide || high) && (el.textContent ?? "").trim() !== "") {
        out.push(`${name(el)} cuts its text off${cs.textOverflow === "ellipsis" ? " with an ellipsis" : ""}`);
      }
    }
    return out;
  }, NAME_SOURCE);
}

/** Pairs of text that lie on top of each other. */
export function overlaps(page: Page): Promise<string[]> {
  return page.evaluate((nameSource) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    type T = { el: Element; x: number; y: number; w: number; h: number };
    const texts: T[] = [];
    for (const el of document.body.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
      // Labels drawn inside a chart (SVG) or hidden from assistive technology are placed on purpose.
      if (el.closest("svg, [aria-hidden=true]")) continue;
      // A bar fixed to the window, or a popup placed by its anchor, lies over the content by design.
      let pinned = false;
      for (let a: Element | null = el; a && !pinned; a = a.parentElement) {
        const pos = getComputedStyle(a).position;
        pinned = pos === "fixed" || pos === "sticky" || pos === "absolute";
      }
      if (pinned) continue;
      const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim() !== "");
      if (own.length === 0) continue;
      const range = document.createRange();
      range.setStartBefore(own[0]);
      range.setEndAfter(own[own.length - 1]);
      const r = range.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      texts.push({ el, x: r.left, y: r.top, w: r.width, h: r.height });
      if (texts.length >= 400) break;
    }
    const out: string[] = [];
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i], b = texts[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ix > 1 && iy > 1 && ix * iy > 0.25 * Math.min(a.w * a.h, b.w * b.h)) {
          out.push(`${name(a.el)} lies over ${name(b.el)}`);
        }
      }
    }
    return out;
  }, NAME_SOURCE);
}

// --- type ---------------------------------------------------------------------------------------------------------

/** Text whose size does not follow the reader's setting: its size at 100% against its size with the root at 200%. */
export function fixedType(page: Page): Promise<string[]> {
  return page.evaluate((nameSource) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    const els = [...document.body.querySelectorAll<HTMLElement>("*")].filter((el) => {
      const cs = getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden" &&
        [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim() !== "");
    });
    // A transition on the font size would still be under way when it is read.
    const still = document.createElement("style");
    still.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
    document.head.append(still);
    const size = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
    const before = els.map(size);
    const root = document.documentElement;
    const had = root.style.getPropertyValue("font-size");
    root.style.setProperty("font-size", "200%", "important");
    const after = els.map(size);
    root.style.removeProperty("font-size");
    still.remove();
    if (had) root.style.setProperty("font-size", had);
    const fixed = new Map<string, { n: number; from: number; to: number }>();
    els.forEach((el, i) => {
      if (after[i] >= before[i] * 1.9) return;
      const key = name(el);
      const e = fixed.get(key) ?? { n: 0, from: before[i], to: after[i] };
      e.n++;
      fixed.set(key, e);
    });
    return [...fixed.entries()].slice(0, 12).map(([k, v]) =>
      `${k} is ${v.from} px and grows only to ${v.to} px when the text is set to 200%`
    );
  }, NAME_SOURCE);
}

// --- input modes --------------------------------------------------------------------------------------------------

/** Targets smaller than `min` CSS px in either direction, wherever they are: the size for a finger (44). */
export function targetsBelow(page: Page, min: number): Promise<string[]> {
  return page.evaluate(({ nameSource, sel, min }) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    const out: string[] = [];
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || el.closest("[inert]")) continue;
      const box = (el.closest("label") ?? el).getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      // A link inside a sentence is exempt (the inline exception of SC 2.5.8).
      if (
        el.tagName === "A" && cs.display === "inline" && el.parentElement &&
        [...el.parentElement.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim() !== "")
      ) continue;
      if (box.width < min || box.height < min) {
        out.push(`${name(el)} is ${Math.round(box.width)}×${Math.round(box.height)} CSS px`);
      }
    }
    return out;
  }, { nameSource: NAME_SOURCE, sel: TARGETS, min });
}

// --- viewport -----------------------------------------------------------------------------------------------------

/** Fixed or sticky elements that touch an edge of the window: the bars a notch or a home indicator can cover. */
export function edgeBars(page: Page): Promise<string[]> {
  return page.evaluate((nameSource) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    const out: string[] = [];
    for (const el of document.body.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || cs.display === "none" || cs.visibility === "hidden") continue;
      const edges = [
        r.top <= 1 ? "top" : "",
        r.bottom >= innerHeight - 1 ? "bottom" : "",
        r.left <= 1 && r.width < innerWidth ? "left" : "",
        r.right >= innerWidth - 1 && r.width < innerWidth ? "right" : "",
      ]
        .filter(Boolean);
      if (edges.length) out.push(`${name(el)} (${edges.join(", ")})`);
    }
    return out;
  }, NAME_SOURCE);
}

/** The window as a virtual keyboard leaves it (about 45% of the height): a focused field must stay in view and uncovered. */
export async function keyboardCovers(page: Page): Promise<string[]> {
  const full = page.viewportSize()!;
  await page.setViewportSize({ width: full.width, height: Math.round(full.height * 0.45) });
  const out = await page.evaluate(async (nameSource) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    const found: string[] = [];
    const sel =
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])" +
      ":not([type=range]):not([type=color]):not([type=file]), textarea, select, [contenteditable=true]";
    for (const el of [...document.querySelectorAll<HTMLElement>(sel)].slice(0, 20)) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.closest("[inert]")) continue;
      // Behind a modal dialog the page is inert: only the dialog's own fields can take the focus.
      const modal = document.querySelector("dialog[open]");
      if (modal && modal.matches(":modal") && !modal.contains(el)) continue;
      el.focus();
      await new Promise((ok) => setTimeout(ok, 60));
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
      const y = r.top + Math.min(r.height / 2, 12);
      if (y < 0 || y > innerHeight - 1) {
        found.push(`${name(el)} is out of view while it has the focus and the keyboard is up`);
        continue;
      }
      const hit = document.elementFromPoint(x, y);
      const label = hit?.closest("label");
      if (hit && hit !== el && !el.contains(hit) && !(label && (label as HTMLLabelElement).control === el)) {
        found.push(`${name(el)} is under ${name(hit)} while it has the focus and the keyboard is up`);
      }
    }
    return found;
  }, NAME_SOURCE);
  await page.setViewportSize(full);
  return out;
}

// --- navigation ---------------------------------------------------------------------------------------------------

/** The widths from which a window is Material 3's expanded class: the top bar shows every destination. */
const EXPANDED = 840;

/** The navigation landmarks and tab rows of the page, at the window's width. */
export function navProblems(page: Page): Promise<string[]> {
  return page.evaluate(({ nameSource, expanded }) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    const label = (b: Element) => (b.getAttribute("aria-label") ?? b.textContent ?? "").replace(/\s+/g, " ").trim();
    const scrolls = (el: Element) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const o = getComputedStyle(a).overflowX;
        if ((o === "auto" || o === "scroll") && a.scrollWidth > a.clientWidth) return true;
      }
      return false;
    };
    const bars = new Set<Element>(
      document.querySelectorAll("nav, [role=navigation], header [role=tablist], [role=banner] [role=tablist]"),
    );
    for (const bar of bars) {
      const shown = (e: Element) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
      if (!shown(bar) && ![...bar.querySelectorAll("a, [role=tab]")].some(shown)) continue;
      const here = name(bar);
      const buttons = [...bar.querySelectorAll("button, [role=button]")];
      const entries = [...bar.querySelectorAll("button, [role=button], a, [role=link], [role=tab]")];
      const catchAll = entries.filter((b) => /^(more|others?|overflow|…|⋯|\.{3}|more options)$/i.test(label(b)));
      // On a phone, the bottom bar of rule 28 holds at most five destinations and a More that opens the rest in a
      // sheet; anywhere else, and on a wide window, a More is a hidden catch-all.
      const box = bar.getBoundingClientRect();
      const bottomBar = vw < expanded && box.bottom >= innerHeight - 2 && box.top >= innerHeight * 0.75;
      for (const b of catchAll) {
        const opens = b.hasAttribute("aria-haspopup") || b.hasAttribute("aria-controls") ||
          b.hasAttribute("aria-expanded");
        if (bottomBar && opens) continue;
        out.push(`${here} keeps destinations behind ${name(b)}: show every primary destination`);
      }
      const folds = buttons.filter((b) =>
        /^(menu|navigation|open menu|main menu|☰|≡)$/i.test(label(b)) &&
        (b.hasAttribute("aria-expanded") || b.hasAttribute("aria-haspopup") || b.hasAttribute("aria-controls"))
      );
      const dests = [...bar.querySelectorAll("a[href], [role=tab], [role=link]")];
      const hidden = dests.filter((d) => d.getClientRects().length === 0);
      const visible = dests.filter((d) => d.getClientRects().length > 0);
      if (vw >= expanded) {
        for (const f of folds) {
          out.push(`${here} folds into ${name(f)} in a window of an expanded width: show every destination`);
        }
        if (hidden.length > 0 && folds.length === 0) {
          out.push(`${here} hides ${hidden.length} of ${dests.length} destinations in a window of an expanded width`);
        }
      } else if (hidden.length > 0 && folds.length === 0 && catchAll.length === 0) {
        out.push(`${here} hides ${hidden.length} of ${dests.length} destinations and has no menu button for them`);
      }
      for (const d of visible) {
        const r = d.getBoundingClientRect();
        if ((r.left < -1 || r.right > vw + 1) && !scrolls(d)) {
          out.push(`${name(d)} of ${here} lies outside the window and the bar does not scroll`);
        }
      }
    }
    return out;
  }, { nameSource: NAME_SOURCE, expanded: EXPANDED });
}

// --- media --------------------------------------------------------------------------------------------------------

/** Images and frames that reserve no box or are far larger than shown, and long lists that render all of their items. */
export function mediaProblems(page: Page): Promise<string[]> {
  return page.evaluate((nameSource) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    const out: string[] = [];
    for (
      const el of document.querySelectorAll<HTMLImageElement | HTMLVideoElement | HTMLIFrameElement>(
        "img, video, iframe",
      )
    ) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.display === "none" || r.width === 0) continue;
      const sized = el.hasAttribute("width") && el.hasAttribute("height");
      if (!sized && cs.aspectRatio === "auto") {
        out.push(
          `${
            name(el)
          } reserves no box (no width and height attributes, no aspect-ratio): the page shifts when it loads`,
        );
      }
      if (el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0) {
        const svg = /\.svg(\?|$)/i.test(el.currentSrc) || el.currentSrc.startsWith("data:image/svg");
        const needed = r.width * devicePixelRatio;
        if (!svg && !el.srcset && !el.closest("picture") && el.naturalWidth > needed * 1.5 + 8) {
          out.push(
            `${name(el)} is ${el.naturalWidth} px wide and shown ${
              Math.round(r.width)
            } px wide: give it srcset and sizes`,
          );
        }
      }
    }
    for (
      const list of document.querySelectorAll(
        "ul, ol, tbody, [role=list], [role=listbox], [role=grid], [role=rowgroup]",
      )
    ) {
      const items = [...list.children];
      if (items.length < 50) continue;
      const auto = (e: Element) => getComputedStyle(e).contentVisibility === "auto";
      if (!auto(list) && !items.slice(0, 5).every(auto)) {
        out.push(
          `${
            name(list)
          } holds ${items.length} items and none skips its rendering off screen: set content-visibility: auto`,
        );
      }
    }
    return out;
  }, NAME_SOURCE);
}

// --- preferences --------------------------------------------------------------------------------------------------

/** In forced colours (Windows high contrast) a control with no border, outline or underline has no edge. */
export function forcedColorsProblems(page: Page): Promise<string[]> {
  return page.evaluate((nameSource) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    const out: string[] = [];
    const matches = matchMedia("(forced-colors: active)").matches;
    if (!matches) return ["forced colours are not in effect, so the page cannot be checked in them"];
    const seen = new Set<string>();
    const sel =
      "button, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, [role=button], [role=tab], [role=switch]";
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.getClientRects().length === 0) continue;
      const border = ["Top", "Right", "Bottom", "Left"].some((s) =>
        (cs as unknown as Record<string, string>)[`border${s}Style`] !== "none" &&
        parseFloat((cs as unknown as Record<string, string>)[`border${s}Width`]) > 0
      );
      const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
      if (!border && !outline) {
        const k = name(el);
        if (!seen.has(k)) out.push(`${k} has no border in forced colours: it shows no edge, add a transparent border`);
        seen.add(k);
      }
    }
    const off = [...document.body.querySelectorAll("*")].filter((e) =>
      getComputedStyle(e).getPropertyValue("forced-color-adjust") === "none" && (e.textContent ?? "").trim() !== ""
    );
    for (const e of off.slice(0, 5)) {
      out.push(`${name(e)} turns forced colours off (forced-color-adjust: none) around text`);
    }
    return out;
  }, NAME_SOURCE);
}

/** With more contrast asked for, text must reach 7:1 (4.5:1 for large text, SC 1.4.6). */
export function moreContrastProblems(page: Page): Promise<string[]> {
  return page.evaluate((nameSource) => {
    const name = new Function(`return ${nameSource}`)() as (el: Element) => string;
    if (!matchMedia("(prefers-contrast: more)").matches) return ["more contrast is not in effect in the browser"];
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const cache = new Map<string, number[]>();
    const rgba = (c: string): number[] => {
      const hit = cache.get(c);
      if (hit) return hit;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      const v = [d[0], d[1], d[2], d[3] / 255];
      cache.set(c, v);
      return v;
    };
    const over = (top: number[], below: number[]) => {
      const a = top[3] + below[3] * (1 - top[3]);
      return a === 0
        ? [0, 0, 0, 0]
        : [0, 1, 2].map((i) => (top[i] * top[3] + below[i] * below[3] * (1 - top[3])) / a).concat(a);
    };
    const lum = (c: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const pairs = new Map<string, { n: number; ratio: number; ex: string; need: number }>();
    for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.getClientRects().length === 0) continue;
      if (!([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim() !== ""))) continue;
      if ((el as HTMLButtonElement).disabled || el.closest("[disabled], [aria-disabled=true]")) continue;
      let bg = [0, 0, 0, 0];
      let unknown = false;
      let opacity = 1;
      for (let a: Element | null = el; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        opacity *= parseFloat(s.opacity);
        if (s.backgroundImage !== "none") {
          unknown = true;
          break;
        }
        bg = over(bg, rgba(s.backgroundColor));
        if (bg[3] >= 0.999) break;
      }
      if (unknown || opacity < 0.1) continue;
      const base = over(bg, [255, 255, 255, 1]);
      const fg0 = rgba(cs.color);
      const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * opacity], base);
      const ratio = (Math.max(lum(fg), lum(base)) + 0.05) / (Math.min(lum(fg), lum(base)) + 0.05);
      const px = parseFloat(cs.fontSize);
      const large = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight) >= 700);
      const need = large ? 4.5 : 7;
      if (ratio < need) {
        const key = `${cs.color} on rgb(${base.slice(0, 3).map(Math.round).join(", ")})|${need}`;
        const e = pairs.get(key) ?? { n: 0, ratio, ex: name(el), need };
        e.n++;
        pairs.set(key, e);
      }
    }
    return [...pairs.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([k, v]) =>
      `text ${k.split("|")[0]} is ${v.ratio.toFixed(1)}:1 on ${v.n} element${
        v.n > 1 ? "s" : ""
      } (${v.ex}), under the ${v.need}:1 more contrast asks for`
    );
  }, NAME_SOURCE);
}

// --- stylesheets --------------------------------------------------------------------------------------------------

/** One style rule of the page's stylesheets, with the conditions around it. */
export interface CssRule {
  selector: string;
  css: string;
  /** The media queries around it, outermost first. */
  media: string[];
  /** Whether a container query is around it. */
  container: boolean;
}

export interface CssDump {
  rules: CssRule[];
  viewportMeta: string | null;
  /** Every media query text found, whatever it holds. */
  allMedia: string[];
}

/** Reads the page's stylesheets as the browser holds them: the built CSS of a bundle as well as a source's. */
export function dumpCss(page: Page): Promise<CssDump> {
  return page.evaluate(() => {
    const rules: { selector: string; css: string; media: string[]; container: boolean }[] = [];
    const allMedia: string[] = [];
    const walk = (list: CSSRuleList, media: string[], container: boolean) => {
      for (const r of Array.from(list)) {
        const any = r as unknown as {
          cssRules?: CSSRuleList;
          conditionText?: string;
          media?: MediaList;
          styleSheet?: CSSStyleSheet;
        };
        if (r.constructor.name === "CSSImportRule" && any.styleSheet) {
          try {
            walk(any.styleSheet.cssRules, media, container);
          } catch { /* cross-origin */ }
          continue;
        }
        if ("selectorText" in r) {
          rules.push({ selector: (r as CSSStyleRule).selectorText, css: r.cssText, media, container });
        }
        if (any.cssRules) {
          const name = r.constructor.name;
          let m = media;
          let c = container;
          if (name === "CSSMediaRule") {
            const text = any.media ? any.media.mediaText : "";
            allMedia.push(text);
            m = [...media, text];
          }
          if (name === "CSSContainerRule") c = true;
          walk(any.cssRules, m, c);
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules, [], false);
      } catch { /* cross-origin */ }
    }
    return {
      rules,
      allMedia,
      viewportMeta: document.querySelector("meta[name=viewport]")?.getAttribute("content") ?? null,
    };
  });
}

export interface Problem {
  check: "fluid" | "type-scale" | "input-modes" | "viewport" | "preferences";
  message: string;
}

/** A selector's subject, the last compound before any pseudo-element: what the rule styles. */
const subjects = (selector: string) =>
  selector.split(/,(?![^(]*\))/).map((s) =>
    s.trim().replace(/::?[\w-]+(\([^)]*\))?$/, (m) => m.startsWith("::") ? "" : m)
  )
    .map((s) => s.split(/\s*[>+~]\s*|\s+/).filter(Boolean).pop() ?? "");

/** The page frame: what a viewport media query may restyle. */
const FRAME = /^(?:html|body|main|header|footer|nav|aside|:root|#app|#root|\*)(?![\w-])|^\[data-(?:frame|slot)/;
const VIEWPORT_QUERY = /\b(?:min-|max-)?(?:width|height)\b|\bdevice-/;
const PHYSICAL = new RegExp(
  "(?:^|[{;\\s])((?:margin|padding)-(?:left|right)|border-(?:left|right)(?:-(?:width|style|color))?|left|right|" +
    "text-align|float|clear)\\s*:\\s*([^;}]+)",
  "g",
);
const LOGICAL: Record<string, string> = {
  "margin-left": "margin-inline-start",
  "margin-right": "margin-inline-end",
  "padding-left": "padding-inline-start",
  "padding-right": "padding-inline-end",
  "border-left": "border-inline-start",
  "border-right": "border-inline-end",
  left: "inset-inline-start",
  right: "inset-inline-end",
  "text-align": "text-align: start or end",
  float: "float: inline-start or inline-end",
  clear: "clear: inline-start or inline-end",
};

const some = <T>(xs: T[], n = 3) => xs.slice(0, n).join(", ") + (xs.length > n ? ` and ${xs.length - n} more` : "");

/** What the page's stylesheets say against the rules on fluid layout, type, input modes, viewport and preferences. */
export function cssProblems(dump: CssDump, hasEdgeBars: boolean): Problem[] {
  const out: Problem[] = [];
  const viewportMedia = new Map<string, string[]>();
  const physical = new Map<string, { n: number; ex: string }>();
  const fixedType = new Map<string, string[]>();
  const vh: string[] = [];
  const vw: string[] = [];
  const hover: string[] = [];
  let backdrop = false;
  let safeArea = false;
  for (const r of dump.rules) {
    const subs = subjects(r.selector);
    // A viewport media query restyles the page frame only.
    const queries = r.media.filter((m) => VIEWPORT_QUERY.test(m));
    if (queries.length && !subs.every((s) => FRAME.test(s))) {
      const q = queries[queries.length - 1];
      const list = viewportMedia.get(q) ?? [];
      list.push(subs.find((s) => !FRAME.test(s)) ?? r.selector);
      viewportMedia.set(q, list);
    }
    for (const m of r.css.matchAll(PHYSICAL)) {
      const prop = m[1];
      const value = m[2].trim();
      if ((prop === "text-align" || prop === "float" || prop === "clear") && !/^(left|right)\b/.test(value)) continue;
      const e = physical.get(prop) ?? { n: 0, ex: r.selector };
      e.n++;
      physical.set(prop, e);
    }
    for (const m of r.css.matchAll(/(?:^|[{;\s])font-size\s*:\s*([^;}]+)/g)) {
      const v = m[1].trim();
      if (/var\(/.test(v) || /^0(px)?$/.test(v)) continue;
      const root = subs.some((s) => /^(html|:root|body)(?![\w-])/.test(s));
      const px = /^[\d.]+px$/.test(v) || (/px|v[hw]|vmin|vmax/.test(v) && !/rem|em\b|%/.test(v));
      if (px) {
        const list = fixedType.get(root ? "root" : "other") ?? [];
        list.push(`${r.selector} (${v})`);
        fixedType.set(root ? "root" : "other", list);
      }
    }
    if (/(?:^|[{;\s])(?:min-|max-)?(?:height|block-size)\s*:[^;}]*\d(?:vh)\b/.test(r.css)) vh.push(r.selector);
    if (/(?:^|[{;\s])(?:min-|max-)?(?:width|inline-size)\s*:[^;}]*\b100vw\b/.test(r.css)) vw.push(r.selector);
    if (
      /:hover/.test(r.selector) && !r.media.some((m) => /hover:\s*hover/.test(m)) &&
      /(?:^|[{;\s])(?:display\s*:\s*(?!none)|visibility\s*:\s*visible|opacity\s*:\s*(?:1|0?\.[5-9])|(?:max-)?height\s*:\s*[1-9])/
        .test(r.css) &&
      !/^(?:a|button)(?::|$)/.test(r.selector.trim())
    ) hover.push(r.selector);
    if (/backdrop-filter/.test(r.css)) backdrop = true;
    if (/env\(\s*safe-area-inset/.test(r.css)) safeArea = true;
  }
  for (const [q, subs] of viewportMedia) {
    out.push({
      check: "fluid",
      message: `@media ${q} restyles components (${
        some([...new Set(subs)])
      }), not the page frame: use a container query or an intrinsic layout, and keep viewport media queries for the frame`,
    });
  }
  for (const [prop, e] of physical) {
    out.push({
      check: "fluid",
      message: `${prop} is physical, in ${e.n} rule${e.n > 1 ? "s" : ""} (${e.ex}): use ${LOGICAL[prop]}`,
    });
  }
  if (fixedType.has("root")) {
    out.push({
      check: "type-scale",
      message: `${
        some(fixedType.get("root")!)
      } sets the root's size in pixels, which overrides the reader's text size: leave it, or use a percentage`,
    });
  }
  if (fixedType.has("other")) {
    out.push({
      check: "type-scale",
      message: `${fixedType.get("other")!.length} rules set a font size that does not grow with the reader's setting (${
        some(fixedType.get("other")!)
      }): use a rem token, or clamp() with rem bounds`,
    });
  }
  if (vh.length) {
    out.push({
      check: "viewport",
      message: `vh in a height (${
        some([...new Set(vh)])
      }): on a phone 100vh is taller than the visible window, use dvh, or svh for a fixed layout`,
    });
  }
  if (vw.length) {
    out.push({
      check: "viewport",
      message: `100vw as a width (${some([...new Set(vw)])}) is wider than the page when a scrollbar shows: use 100%`,
    });
  }
  const meta = dump.viewportMeta;
  if (meta === null) {
    out.push({ check: "viewport", message: "no <meta name=viewport>: a phone lays the page out at 980 CSS px wide" });
  } else {
    if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*(?:[01](?:\.\d+)?|[2-4](?:\.\d+)?)\b/.test(meta)) {
      out.push({
        check: "viewport",
        message:
          `the viewport meta (${meta}) stops the reader from zooming (SC 1.4.4): remove user-scalable and maximum-scale`,
      });
    }
    if (hasEdgeBars && !/viewport-fit\s*=\s*cover/.test(meta)) {
      out.push({
        check: "viewport",
        message:
          "fixed bars at the window's edge but no viewport-fit=cover in the viewport meta: the safe-area insets stay zero",
      });
    }
  }
  if (hasEdgeBars && !safeArea) {
    out.push({
      check: "viewport",
      message:
        "fixed bars at the window's edge and no env(safe-area-inset-*) anywhere: a notch or a home indicator can cover them",
    });
  }
  if (hover.length) {
    out.push({
      check: "input-modes",
      message: `${
        some([...new Set(hover)])
      } shows something only on :hover, which a finger cannot do: show it always on a coarse pointer, or put the hover rule in @media (hover: hover)`,
    });
  }
  if (backdrop && !dump.allMedia.some((m) => /prefers-reduced-transparency/.test(m))) {
    out.push({
      check: "preferences",
      message:
        "backdrop-filter is used and nothing answers @media (prefers-reduced-transparency: reduce): make the surface opaque there",
    });
  }
  return out;
}

// --- the mobile profile -------------------------------------------------------------------------------------------

export interface Profile {
  lcp: number;
  cls: number;
  tbt: number;
  jsKB: number;
  totalKB: number;
}

const gzipSize = async (bytes: Uint8Array): Promise<number> => {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
  return (await new Response(stream).arrayBuffer()).byteLength;
};

/** Loads the page as a mid-range phone does (a 4x slower processor, a slow 4G network) and measures it. */
export async function mobileProfile(browser: Browser, url: string): Promise<Profile> {
  const context = await browser.newContext({ ...PHONE.options, reducedMotion: "no-preference" });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: MOBILE_PROFILE.cpuSlowdown });
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: MOBILE_PROFILE.latencyMs,
    downloadThroughput: MOBILE_PROFILE.downKbps * 1024 / 8,
    uploadThroughput: MOBILE_PROFILE.upKbps * 1024 / 8,
  });
  await page.addInitScript(() => {
    const w = globalThis as unknown as Record<string, number>;
    w.__lcp = 0;
    w.__cls = 0;
    w.__tbt = 0;
    const watch = (type: string, f: (e: PerformanceEntry & Record<string, number>) => void) => {
      try {
        new PerformanceObserver((l) => l.getEntries().forEach((e) => f(e as PerformanceEntry & Record<string, number>)))
          .observe({ type, buffered: true });
      } catch { /* not supported */ }
    };
    watch("largest-contentful-paint", (e) => (w.__lcp = e.startTime));
    watch("layout-shift", (e) => {
      if (!(e as unknown as { hadRecentInput: boolean }).hadRecentInput) w.__cls += e.value;
    });
    watch("longtask", (e) => (w.__tbt += Math.max(0, e.duration - 50)));
  });
  const sizes: Promise<{ js: boolean; bytes: number }>[] = [];
  page.on("response", (r) => {
    sizes.push((async () => {
      try {
        const type = r.headers()["content-type"] ?? "";
        return { js: /javascript|ecmascript/.test(type), bytes: await gzipSize(await r.body()) };
      } catch {
        return { js: false, bytes: 0 };
      }
    })());
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const w = globalThis as unknown as Record<string, number>;
    return { lcp: w.__lcp, cls: w.__cls, tbt: w.__tbt };
  });
  const got = await Promise.all(sizes);
  await context.close();
  return {
    ...m,
    jsKB: got.filter((s) => s.js).reduce((a, s) => a + s.bytes, 0) / 1024,
    totalKB: got.reduce((a, s) => a + s.bytes, 0) / 1024,
  };
}

/** What a profile exceeds of the budget. */
export function budgetProblems(p: Profile, budget: Budget = BUDGET): { check: "media" | "budget"; message: string }[] {
  const out: { check: "media" | "budget"; message: string }[] = [];
  const over = (n: number, max: number) => n > max;
  if (over(p.cls, budget.cls)) {
    out.push({
      check: "media",
      message: `the page shifts as it loads: layout shift ${p.cls.toFixed(2)}, over ${budget.cls}`,
    });
  }
  if (over(p.lcp, budget.lcp)) {
    out.push({
      check: "budget",
      message: `the largest content shows after ${Math.round(p.lcp)} ms on a mid-range phone, over ${budget.lcp} ms`,
    });
  }
  if (over(p.tbt, budget.tbt)) {
    out.push({
      check: "budget",
      message: `the main thread is blocked for ${Math.round(p.tbt)} ms on a mid-range phone, over ${budget.tbt} ms`,
    });
  }
  if (over(p.jsKB, budget.jsKB)) {
    out.push({ check: "budget", message: `${Math.round(p.jsKB)} kB of JavaScript (gzip), over ${budget.jsKB} kB` });
  }
  if (over(p.totalKB, budget.totalKB)) {
    out.push({ check: "budget", message: `${Math.round(p.totalKB)} kB received (gzip), over ${budget.totalKB} kB` });
  }
  return out;
}
