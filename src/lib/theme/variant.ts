// A design-time preview of a variant: the page is built once, in the "variants" mode, and each frame of the
// comparison page (scripts/variants.ts) opens it with ?tokens=<variant>&theme=<light|dark>. The variant's
// token CSS is loaded after the built-in one and, defining the same custom properties with the same
// selectors, replaces it. Only the variants build loads this: a released app never switches mood board.
import type { ThemeChoice } from "./theme.svelte.ts";

export interface Variant {
  /** The variant's name: its token CSS is `<base><tokens>.css`. */
  tokens?: string;
  /** The theme the frame shows, whatever the system prefers. */
  theme?: Exclude<ThemeChoice, "system">;
}

/** Reads the variant from a query string. A name is letters, digits, "-" and "_" only, so no URL gets in. */
export function variantFromQuery(search: string): Variant {
  const q = new URLSearchParams(search);
  const v: Variant = {};
  const tokens = q.get("tokens");
  if (tokens && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(tokens)) v.tokens = tokens;
  const theme = q.get("theme");
  if (theme === "light" || theme === "dark") v.theme = theme;
  return v;
}

/** Adds the variant's stylesheet to the page and waits for it, so that the first paint shows the variant. */
export function loadVariant(v: Variant, doc: Document = document, base = "../tokens/"): Promise<void> {
  if (!v.tokens) return Promise.resolve();
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = `${base}${v.tokens}.css`;
  const done = new Promise<void>((resolve) => {
    link.onload = () => resolve();
    // A missing variant shows the built-in tokens rather than nothing; the comparison page names the variant.
    link.onerror = () => resolve();
  });
  doc.head.append(link);
  return done;
}

/**
 * The theme a frame of a comparison names in its URL's hash, `#theme=light` or `#theme=dark`. A screen variant
 * built for `variants.ts --builds` reads it at start-up and shows that theme: on a page opened from file://,
 * Safari lets no script reach into a frame, so the frame has to read its theme itself.
 */
export function themeFromHash(hash: string): Variant["theme"] {
  const theme = new URLSearchParams(hash.replace(/^#/, "")).get("theme");
  return theme === "light" || theme === "dark" ? theme : undefined;
}
