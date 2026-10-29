// The contrast check: every colour pair the widget set puts on screen, computed from the tokens of every
// theme of every mood board, against WCAG 2.2's minimums (SC 1.4.3 for text, 4.5:1; SC 1.4.11 for what
// identifies a control and for focus rings, 3:1), which EN 301 549 takes over as clauses 9.1.4.3 and
// 9.1.4.11. The pairs are data, in a contrast file next to the tokens.

import type { Finding } from "./finding.ts";
import type { Token } from "./tokens.ts";

const CHECK = "contrast";
export const MINIMUM = { text: 4.5, ui: 3 } as const;

export interface Pair {
  kind: keyof typeof MINIMUM;
  use: string;
  fg: string[];
  bg: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The pairs of a contrast file, or the findings that say why it is not one. */
export function readPairs(json: unknown, file: string): { pairs: Pair[]; findings: Finding[] } {
  const findings: Finding[] = [];
  const pairs: Pair[] = [];
  const list = isObj(json) ? json.pairs : undefined;
  if (!Array.isArray(list)) {
    return { pairs, findings: [{ check: CHECK, level: "problem", file, message: "pairs must be a list" }] };
  }
  list.forEach((p, i) => {
    const strings = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string");
    if (!isObj(p) || !(p.kind === "text" || p.kind === "ui") || !strings(p.fg) || !strings(p.bg)) {
      findings.push({
        check: CHECK,
        level: "problem",
        file,
        message: `pairs[${i}]: a pair is { kind: "text" | "ui", use, fg: [tokens], bg: [tokens] }`,
      });
    } else pairs.push({ kind: p.kind, use: String(p.use ?? ""), fg: p.fg as string[], bg: p.bg as string[] });
  });
  return { pairs, findings };
}

/** WCAG's relative luminance of an sRGB colour, from components from 0 to 1. */
export function luminance([r, g, b]: number[]): number {
  const lin = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG's contrast ratio of two opaque sRGB colours. */
export function ratio(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A colour token's sRGB components, following aliases, or why it has none. */
function srgb(tokens: Map<string, Token>, path: string): number[] | string {
  let t = tokens.get(path);
  const seen = new Set<string>();
  while (t && typeof t.value === "string" && /^\{[^{}]+\}$/.test(t.value) && !seen.has(t.path)) {
    seen.add(t.path);
    t = tokens.get(t.value.slice(1, -1));
  }
  if (!t) return `${path} is not a token`;
  const v = t.value as { colorSpace?: string; components?: unknown[]; alpha?: number };
  if (!isObj(v) || v.colorSpace !== "srgb" || !Array.isArray(v.components)) {
    return `${path} is not an sRGB colour, which is all the contrast check reads`;
  }
  if (v.alpha !== undefined && v.alpha < 1) return `${path} is translucent: its contrast depends on what is under it`;
  return v.components.map((c) => typeof c === "number" ? c : 0);
}

/** Every pair below its minimum in one theme of one mood board (`label`). */
export function checkContrast(label: string, tokens: Map<string, Token>, pairs: Pair[]): Finding[] {
  const findings: Finding[] = [];
  for (const p of pairs) {
    for (const fg of p.fg) {
      for (const bg of p.bg) {
        const a = srgb(tokens, fg);
        const b = srgb(tokens, bg);
        if (typeof a === "string" || typeof b === "string") {
          findings.push({
            check: CHECK,
            level: "problem",
            file: label,
            message: typeof a === "string" ? a : b as string,
          });
          continue;
        }
        const r = ratio(a, b);
        if (r < MINIMUM[p.kind]) {
          findings.push({
            check: CHECK,
            level: "problem",
            file: label,
            message: `${fg} on ${bg}: ${r.toFixed(2)}:1, below ${MINIMUM[p.kind]}:1 for ${
              p.kind === "text" ? "text" : "a control or a focus ring"
            } (${p.use})`,
          });
        }
      }
    }
  }
  return findings;
}
