// No raw colours or sizes in a component: every colour, length and duration is a design token, read as
// var(--token). The component is parsed with Svelte's own compiler (its <style>, its style="" attributes,
// its style: directives and the SVG paint attributes), and each CSS value with postcss-value-parser.

import { parse } from "svelte/compiler";
import valueParser from "postcss-value-parser";
import { type Finding, lineOf } from "./finding.ts";

const CHECK = "no-raw-literals";

const COLOR_FUNCTIONS = new Set([
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
  "color-mix",
  "light-dark",
]);
/** Units of absolute or font-relative length, and of time: these belong in tokens. Percentages, fr, viewport
 * units and angles describe layout, not the design, and stay allowed. */
const TOKEN_UNITS = new Set([
  "px",
  "rem",
  "em",
  "pt",
  "pc",
  "cm",
  "mm",
  "in",
  "q",
  "ex",
  "ch",
  "cap",
  "ic",
  "lh",
  "rlh",
  "ms",
  "s",
]);
// The CSS named colours (CSS Color 4), except transparent and currentColor, which are not a design choice.
const NAMED_COLORS = new Set(
  ("aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood " +
    "cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray " +
    "darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
    "darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue " +
    "firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew " +
    "hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
    "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray " +
    "lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue " +
    "mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred " +
    "midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
    "palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple " +
    "rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue " +
    "slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white " +
    "whitesmoke yellow yellowgreen").split(" "),
);
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const PAINT_ATTRIBUTES = new Set(["fill", "stroke", "stop-color", "flood-color", "lighting-color", "color"]);
/** What an expression in a style attribute is replaced by before parsing: never a token, never a literal. */
const HOLE = "stance-expression-hole";

// deno-lint-ignore no-explicit-any
type Node = any;

/** What is wrong with one CSS value: raw literals, and var() of a custom property that is no token. */
function valueFindings(value: string, known: (name: string) => boolean): string[] {
  const out: string[] = [];
  const visit = (nodes: valueParser.Node[]) => {
    for (const n of nodes) {
      if (n.type === "function") {
        const name = n.value.toLowerCase();
        if (COLOR_FUNCTIONS.has(name)) {
          out.push(`colour literal ${valueParser.stringify(n)}: use a color token`);
          continue;
        }
        if (name === "var") {
          const prop = n.nodes.find((x) => x.type === "word")?.value ?? "";
          if (!prop.includes(HOLE) && !known(prop)) out.push(`var(${prop}) is not a token of the mood board`);
          visit(n.nodes.slice(1));
          continue;
        }
        visit(n.nodes);
      } else if (n.type === "word") {
        if (n.value.includes(HOLE)) continue;
        if (HEX.test(n.value)) out.push(`colour literal ${n.value}: use a color token`);
        else if (NAMED_COLORS.has(n.value.toLowerCase())) out.push(`colour literal ${n.value}: use a color token`);
        else {
          const u = valueParser.unit(n.value);
          if (u && u.unit && TOKEN_UNITS.has(u.unit.toLowerCase()) && Number(u.number) !== 0) {
            out.push(`${u.unit === "ms" || u.unit === "s" ? "duration" : "size"} literal ${n.value}: use a token`);
          }
        }
      }
    }
  };
  visit(valueParser(value).nodes);
  return out;
}

/** The declarations of a CSS block, parsed by Svelte's CSS parser. */
function declarationsOf(css: Node): Node[] {
  const out: Node[] = [];
  const walk = (n: Node) => {
    if (!n || typeof n !== "object") return;
    if (n.type === "Declaration") out.push(n);
    for (const child of n.children ?? []) walk(child);
    if (n.block) walk(n.block);
  };
  walk(css);
  return out;
}

/** Text with each expression replaced by a hole, from an attribute's value. */
function textOf(value: Node): string | null {
  if (value === true) return null;
  const parts = Array.isArray(value) ? value : [value];
  return parts.map((p: Node) => p.type === "Text" ? p.data : HOLE).join("");
}

/** Every raw colour, size or duration in a component, and every var() of something that is not a token. */
export function checkLiterals(file: string, source: string, tokens: ReadonlySet<string>): Finding[] {
  const findings: Finding[] = [];
  let ast: Node;
  try {
    ast = parse(source, { modern: true, filename: file });
  } catch (e) {
    return [{ check: CHECK, level: "problem", file, message: `does not parse: ${(e as Error).message}` }];
  }
  const local = new Set<string>();
  const decls: { property: string; value: string; start: number }[] = [];
  if (ast.css) {
    for (const d of declarationsOf(ast.css)) decls.push({ property: d.property, value: d.value, start: d.start });
  }
  const inline = (text: string, start: number) => {
    try {
      const sheet = parse(`<style>x{${text}}</style>`, { modern: true }).css;
      for (const d of declarationsOf(sheet)) decls.push({ property: d.property, value: d.value, start });
    } catch {
      findings.push({
        check: CHECK,
        level: "note",
        file,
        line: lineOf(source, start),
        message: "a style attribute that does not parse",
      });
    }
  };
  const walk = (n: Node) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === "Attribute" && n.name === "style") {
      const text = textOf(n.value);
      if (text !== null) inline(text, n.start);
    } else if (n.type === "StyleDirective") {
      const text = textOf(n.value);
      if (text !== null) decls.push({ property: n.name, value: text, start: n.start });
    } else if (n.type === "Attribute" && PAINT_ATTRIBUTES.has(n.name)) {
      const text = textOf(n.value);
      if (text !== null) decls.push({ property: n.name, value: text, start: n.start });
    }
    for (const [k, v] of Object.entries(n)) if (k !== "parent" && v && typeof v === "object") walk(v);
  };
  walk(ast.fragment);
  for (const d of decls) if (d.property.startsWith("--")) local.add(d.property);
  const known = (name: string) => tokens.has(name) || local.has(name);
  for (const d of decls) {
    for (const message of valueFindings(d.value, known)) {
      findings.push({
        check: CHECK,
        level: "problem",
        file,
        line: lineOf(source, d.start),
        message: `${d.property}: ${message}`,
      });
    }
  }
  return findings;
}
