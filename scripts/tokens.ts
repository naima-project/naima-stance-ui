// Turns one mood board, a set of token files in the W3C Design Tokens (DTCG) format, into CSS custom
// properties. Style Dictionary reads the DTCG files and resolves aliases; the transforms below write each
// DTCG type as CSS, since the stable DTCG format (2025.10) gives colors, dimensions and durations as
// objects, which Style Dictionary's built-in CSS transforms do not all read.
//
//   deno task tokens [--mood white] [--out dist/tokens.css]

import StyleDictionary from "style-dictionary";
import type { TransformedToken } from "style-dictionary/types";

type Dim = { value: number; unit: string };
type Color = { colorSpace: string; components: number[]; alpha?: number; hex?: string };
type Shadow = { color: Color; offsetX: Dim; offsetY: Dim; blur: Dim; spread: Dim; inset?: boolean };

const num = (n: number) => String(Math.round(n * 10000) / 10000);
export const dim = (d: Dim): string => d.value === 0 ? "0" : `${num(d.value)}${d.unit}`;

export function color(c: Color): string {
  if (c.colorSpace !== "srgb") throw new Error(`colorSpace ${c.colorSpace} is not written as CSS yet`);
  const [r, g, b] = c.components.map((x) => Math.round(x * 255));
  const hex = c.hex ?? "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return c.alpha === undefined || c.alpha === 1 ? hex : `rgb(${r} ${g} ${b} / ${num(c.alpha)})`;
}

const fontName = (f: string) => /^[a-z-]+$/.test(f) ? f : `"${f}"`;

/** The CSS for one token's resolved value, by its DTCG type. */
export function css(type: string, v: unknown): string {
  switch (type) {
    case "color":
      return color(v as Color);
    case "dimension":
    case "duration":
      return dim(v as Dim);
    case "fontFamily":
      return Array.isArray(v) ? v.map(fontName).join(", ") : fontName(String(v));
    case "fontWeight":
    case "number":
      return String(v);
    case "cubicBezier":
      return `cubic-bezier(${(v as number[]).map(num).join(", ")})`;
    case "shadow": {
      const list = Array.isArray(v) ? v as Shadow[] : [v as Shadow];
      return list.map((s) =>
        [s.inset ? "inset" : "", dim(s.offsetX), dim(s.offsetY), dim(s.blur), dim(s.spread), color(s.color)].filter(
          Boolean,
        )
          .join(" ")
      ).join(", ");
    }
    default:
      throw new Error(`token type ${type} is not written as CSS yet`);
  }
}

StyleDictionary.registerTransform({
  name: "stance/dtcg-css",
  type: "value",
  transitive: true,
  filter: (t: TransformedToken) => t.$type !== undefined,
  transform: (t: TransformedToken) => css(t.$type as string, t.$value),
});

/** Builds the mood board's CSS custom properties and returns the file written. */
export async function buildTokens(root: string, mood: string, out: string): Promise<string> {
  const dir = `${root}/tokens/moods/${mood}`;
  try {
    await Deno.stat(dir);
  } catch {
    throw new Error(`no mood board "${mood}" in ${root}/tokens/moods`);
  }
  const sd = new StyleDictionary({
    usesDtcg: true,
    log: { verbosity: "silent", warnings: "disabled" },
    source: [`${dir}/*.tokens.json`],
    platforms: {
      css: {
        transforms: ["name/kebab", "stance/dtcg-css"],
        buildPath: out.slice(0, out.lastIndexOf("/") + 1) || "./",
        files: [{
          destination: out.slice(out.lastIndexOf("/") + 1),
          format: "css/variables",
          options: {
            outputReferences: false,
            fileHeader: () => [`mood board: ${mood}`, "generated from the DTCG tokens: do not edit"],
          },
        }],
      },
    },
  });
  await sd.buildAllPlatforms();
  return out;
}

if (import.meta.main) {
  const arg = (flag: string, fallback: string) => {
    const i = Deno.args.indexOf(flag);
    return i >= 0 && Deno.args[i + 1] ? Deno.args[i + 1] : fallback;
  };
  const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
  const written = await buildTokens(root, arg("--mood", "white"), arg("--out", "dist/tokens.css"));
  console.log(written);
}
