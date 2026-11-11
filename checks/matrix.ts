// The testing matrix: the one place that says in which windows, with which pointer, in which theme and at which text
// size the browser checks open a page. Every browser check takes its cells from here, so that a window size or an input
// mode is added once and every check meets it (rule 25, the testing matrix).
//
// The widths are Material 3's window size classes and the devices behind them: 320 (the narrowest phone, and WCAG's
// reflow width, SC 1.4.10), 375 (a phone), 768 (a tablet in portrait), 1024 (a tablet in landscape or a small laptop),
// 1280 (a laptop) and 1920 (a wide desktop). A pointer is a mouse (fine, hovering) or a finger (coarse, no hover). The
// text is the browser's default, or at 200% (SC 1.4.4).

export interface Size {
  /** The window's width in CSS px, which names the cell. */
  width: number;
  height: number;
  /** Material 3's window size class of the width. */
  sizeClass: "compact" | "medium" | "expanded" | "large" | "extra-large";
}

export const SIZES: readonly Size[] = [
  { width: 320, height: 640, sizeClass: "compact" },
  { width: 375, height: 812, sizeClass: "compact" },
  { width: 768, height: 1024, sizeClass: "medium" },
  { width: 1024, height: 768, sizeClass: "expanded" },
  { width: 1280, height: 800, sizeClass: "large" },
  { width: 1920, height: 1080, sizeClass: "extra-large" },
];

export const POINTERS = ["mouse", "touch"] as const;
export type Pointer = typeof POINTERS[number];
export const SCHEMES = ["light", "dark"] as const;
export type Scheme = typeof SCHEMES[number];
/** The text size as a percentage of the browser's default: 100, and 200 for SC 1.4.4. */
export const TEXT_SIZES = [100, 200] as const;
export type TextSize = typeof TEXT_SIZES[number];

/** A window up to this wide is a phone or a tablet, so its touch cell is a mobile device. A wider one with a touch screen
 *  is a laptop or a monitor that has one: touch events and a coarse pointer, but a desktop browser. */
const MOBILE_UP_TO = 1024;

export interface Cell {
  /** The cell's name as a problem says it: "light, 375 touch" or "dark, 1280 mouse, text 200%". */
  name: string;
  size: Size;
  pointer: Pointer;
  scheme: Scheme;
  text: TextSize;
  /** What to open the browser context with. */
  options: {
    viewport: { width: number; height: number };
    colorScheme: Scheme;
    reducedMotion: "no-preference";
    hasTouch: boolean;
    isMobile: boolean;
    deviceScaleFactor: number;
  };
}

function cell(size: Size, pointer: Pointer, scheme: Scheme, text: TextSize, height = size.height): Cell {
  const touch = pointer === "touch";
  const name = `${scheme}, ${size.width} ${pointer}${text === 100 ? "" : `, text ${text}%`}`;
  return {
    name,
    size,
    pointer,
    scheme,
    text,
    options: {
      viewport: { width: size.width, height },
      colorScheme: scheme,
      reducedMotion: "no-preference",
      hasTouch: touch,
      isMobile: touch && size.width <= MOBILE_UP_TO,
      deviceScaleFactor: touch ? 2 : 1,
    },
  };
}

/** Every combination of width, pointer, theme and text size: the full matrix, 48 cells. */
export function cells(): Cell[] {
  return SIZES.flatMap((s) => POINTERS.flatMap((p) => SCHEMES.flatMap((c) => TEXT_SIZES.map((t) => cell(s, p, c, t)))));
}

/** The cells a check that does not depend on the theme or the text size runs in: each width with each pointer. */
export function frames(): Cell[] {
  return cells().filter((c) => c.scheme === "light" && c.text === 100);
}

/** The two cells that stand for the rest where a check is slow or does not change with the width: a phone with a finger
 *  and a laptop with a mouse. */
export function anchors(): Cell[] {
  return frames().filter((c) =>
    (c.size.width === 375 && c.pointer === "touch") || (c.size.width === 1280 && c.pointer === "mouse")
  );
}

/** The cells a slow, layout-bound check (axe-core) runs in: every width with a mouse, and the phone with a finger, in both
 *  themes. A finger changes what a page lays out only on a phone or a tablet, which the phone stands for. */
export function slowCells(): Cell[] {
  return cells().filter((c) => c.text === 100 && (c.pointer === "mouse" || c.size.width === 375));
}

/** The phone cell the mobile profile uses: a mid-range phone, 375 wide with a finger. */
export const PHONE: Cell = anchors().find((c) => c.size.width === 375)!;

/** The laptop cell: 1280 wide with a mouse. */
export const DESKTOP: Cell = anchors().find((c) => c.size.width === 1280)!;

/** The narrowest window, WCAG's reflow width: 320 wide with a mouse. */
export const NARROWEST: Cell = frames().find((c) => c.size.width === 320 && c.pointer === "mouse")!;

/** A phone held sideways (SC 1.3.4): the window is 812 by 375 with a finger. */
export const LANDSCAPE: Cell = cell({ width: 812, height: 375, sizeClass: "medium" }, "touch", "light", 100);
LANDSCAPE.name = "light, 812×375 landscape touch";

/** A window at 400% zoom (SC 1.4.10): 1280 by 1024 CSS px at 400% is 320 by 256 CSS px. */
export const ZOOM_400: Cell = cell({ width: 320, height: 256, sizeClass: "compact" }, "mouse", "light", 100);
ZOOM_400.name = "light, 400% zoom (320×256)";

/** The text spacing of SC 1.4.12: what a reader may set, and a page must bear without loss. */
export const TEXT_SPACING_CSS = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-block-end: 2em !important; }
`;

/** What a page must not exceed on a mid-range phone: a 4x slower processor and a slow 4G network, the profile
 *  Lighthouse measures with. A project may set its own in stance-ui.json (check.budget). */
export interface Budget {
  /** Largest contentful paint, ms. */
  lcp: number;
  /** Cumulative layout shift. */
  cls: number;
  /** Total blocking time, ms: the time the page's main thread is blocked beyond 50 ms at a stretch. */
  tbt: number;
  /** JavaScript received, in kilobytes compressed with gzip. */
  jsKB: number;
  /** Everything received, in kilobytes compressed with gzip. */
  totalKB: number;
}

export const BUDGET: Budget = { lcp: 2500, cls: 0.1, tbt: 300, jsKB: 170, totalKB: 1024 };
export const MOBILE_PROFILE = { cpuSlowdown: 4, latencyMs: 150, downKbps: 1600, upKbps: 750 } as const;

/** The profiles of rule 28 (phone and desktop are equals): a laptop with a mouse that hovers, two phones (375 and 390
 *  wide) and a tablet (820 wide), each with a finger and no hover. The action-parity check runs each screen in all four. */
const PHONE_390: Cell = cell({ width: 390, height: 844, sizeClass: "compact" }, "touch", "light", 100);
const TABLET_820: Cell = cell({ width: 820, height: 1180, sizeClass: "medium" }, "touch", "light", 100);
export const PHONES: readonly Cell[] = [PHONE, PHONE_390];
export const EQUALS_PROFILES: readonly Cell[] = [DESKTOP, PHONE, PHONE_390, TABLET_820];
