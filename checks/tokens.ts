// Validates design tokens against the W3C Design Tokens Community Group format (DTCG, stable version
// 2025.10): the group and token structure, names, types (own or inherited from a group), aliases, and each
// type's value. The files are parsed as JSON and walked as data; nothing here reads them as text.

import type { Finding } from "./finding.ts";

const CHECK = "tokens";
const TYPES = new Set([
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "duration",
  "cubicBezier",
  "number",
  "strokeStyle",
  "border",
  "transition",
  "shadow",
  "gradient",
  "typography",
]);
const GROUP_KEYS = new Set(["$type", "$description", "$extensions", "$deprecated", "$extends", "$root"]);
const TOKEN_KEYS = new Set(["$value", "$type", "$description", "$extensions", "$deprecated"]);
const COLOR_SPACES = new Set([
  "srgb",
  "srgb-linear",
  "hsl",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "display-p3",
  "a98-rgb",
  "prophoto-rgb",
  "rec2020",
  "xyz-d65",
  "xyz-d50",
]);
const FONT_WEIGHTS = new Set([
  "thin",
  "hairline",
  "extra-light",
  "ultra-light",
  "light",
  "normal",
  "regular",
  "book",
  "medium",
  "semi-bold",
  "demi-bold",
  "bold",
  "extra-bold",
  "ultra-bold",
  "black",
  "heavy",
  "extra-black",
  "ultra-black",
]);
const STROKES = new Set(["solid", "dashed", "dotted", "double", "groove", "ridge", "outset", "inset"]);

/** A token as read: its path, type and raw value, and the file it is in. */
export interface Token {
  path: string;
  type: string | undefined;
  value: unknown;
  file: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ALIAS = /^\{([^{}]+)\}$/;
const aliasOf = (v: unknown): string | null => typeof v === "string" ? ALIAS.exec(v)?.[1] ?? null : null;

/** The tokens of a set of files, merged into one tree, with what is wrong in their structure. */
export function collect(files: { file: string; json: unknown }[]): { tokens: Map<string, Token>; findings: Finding[] } {
  const tokens = new Map<string, Token>();
  const findings: Finding[] = [];
  const bad = (file: string, message: string) => findings.push({ check: CHECK, level: "problem", file, message });

  const walk = (node: unknown, path: string[], inherited: string | undefined, file: string) => {
    if (!isObj(node)) return bad(file, `${path.join(".") || "(root)"}: a group or token must be an object`);
    const here = path.join(".") || "(root)";
    if ("$value" in node) {
      for (const k of Object.keys(node)) {
        if (!TOKEN_KEYS.has(k)) bad(file, `${here}: a token has no member "${k}"`);
      }
      const type = node["$type"] ?? inherited;
      if (node["$type"] !== undefined && !TYPES.has(String(node["$type"]))) {
        bad(file, `${here}: unknown $type "${node["$type"]}"`);
      }
      if (node["$description"] !== undefined && typeof node["$description"] !== "string") {
        bad(file, `${here}: $description must be a string`);
      }
      if (tokens.has(here)) bad(file, `${here}: defined twice (also in ${tokens.get(here)!.file})`);
      tokens.set(here, { path: here, type: type as string | undefined, value: node["$value"], file });
      return;
    }
    let type = inherited;
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("$")) {
        if (!GROUP_KEYS.has(k)) bad(file, `${here}: a group has no member "${k}"`);
        if (k === "$type") {
          if (!TYPES.has(String(v))) bad(file, `${here}: unknown $type "${v}"`);
          else type = v as string;
        }
        if (k === "$description" && typeof v !== "string") bad(file, `${here}: $description must be a string`);
        continue;
      }
      if (/[{}.]/.test(k)) bad(file, `${[...path, k].join(".")}: a name must not contain "{", "}" or "."`);
      walk(v, [...path, k], type, file);
    }
  };
  for (const { file, json } of files) walk(json, [], undefined, file);
  return { tokens, findings };
}

/** Follows aliases to the token they end at; null, with a finding, on a missing target or a cycle. */
function resolve(tokens: Map<string, Token>, start: Token, findings: Finding[]): Token | null {
  const seen = [start.path];
  let t = start;
  for (let target = aliasOf(t.value); target !== null; target = aliasOf(t.value)) {
    const next = tokens.get(target);
    if (!next) {
      findings.push({
        check: CHECK,
        level: "problem",
        file: start.file,
        message: `${start.path}: refers to {${target}}, which is not a token`,
      });
      return null;
    }
    if (seen.includes(next.path)) {
      findings.push({
        check: CHECK,
        level: "problem",
        file: start.file,
        message: `${start.path}: aliases form a cycle: ${[...seen, next.path].join(" → ")}`,
      });
      return null;
    }
    seen.push(next.path);
    t = next;
  }
  return t;
}

/** Why `v` is not a valid value of `type`, or null. Sub-values may be aliases, checked by `ref`. */
function valueError(type: string, v: unknown, ref: (alias: string, type: string) => string | null): string | null {
  const alias = aliasOf(v);
  if (alias !== null) return ref(alias, type);
  const sub = (t: string, x: unknown, what: string) => {
    const e = valueError(t, x, ref);
    return e ? `${what}: ${e}` : null;
  };
  switch (type) {
    case "color": {
      if (!isObj(v)) return "a color is an object with colorSpace and components";
      if (!COLOR_SPACES.has(String(v["colorSpace"]))) return `unknown colorSpace "${v["colorSpace"]}"`;
      const c = v["components"];
      if (!Array.isArray(c) || c.length !== 3 || !c.every((x) => isNum(x) || x === "none")) {
        return 'components must be three numbers (or "none")';
      }
      if (v["alpha"] !== undefined && !(isNum(v["alpha"]) && v["alpha"] >= 0 && v["alpha"] <= 1)) {
        return "alpha must be a number from 0 to 1";
      }
      if (v["hex"] !== undefined && !/^#[0-9a-fA-F]{6}$/.test(String(v["hex"]))) return "hex must be #rrggbb";
      return null;
    }
    case "dimension":
      return isObj(v) && isNum(v["value"]) && (v["unit"] === "px" || v["unit"] === "rem")
        ? null
        : 'a dimension is { value: number, unit: "px" | "rem" }';
    case "duration":
      return isObj(v) && isNum(v["value"]) && (v["unit"] === "ms" || v["unit"] === "s")
        ? null
        : 'a duration is { value: number, unit: "ms" | "s" }';
    case "number":
      return isNum(v) ? null : "a number is a JSON number";
    case "fontFamily":
      return (typeof v === "string" && v !== "") ||
          (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x !== ""))
        ? null
        : "a font family is a name or a non-empty list of names";
    case "fontWeight":
      return (isNum(v) && v >= 1 && v <= 1000) || FONT_WEIGHTS.has(String(v))
        ? null
        : "a font weight is a number from 1 to 1000 or a DTCG weight name";
    case "cubicBezier":
      return Array.isArray(v) && v.length === 4 && v.every(isNum) && v[0] >= 0 && v[0] <= 1 && v[2] >= 0 && v[2] <= 1
        ? null
        : "a cubic Bézier is four numbers, the first and third from 0 to 1";
    case "strokeStyle":
      if (typeof v === "string") return STROKES.has(v) ? null : `unknown stroke style "${v}"`;
      if (!isObj(v) || !Array.isArray(v["dashArray"])) return "a stroke style is a keyword or { dashArray, lineCap }";
      return ["round", "butt", "square"].includes(String(v["lineCap"]))
        ? null
        : "lineCap must be round, butt or square";
    case "border":
      if (!isObj(v)) return "a border is { color, width, style }";
      return sub("color", v["color"], "color") ?? sub("dimension", v["width"], "width") ??
        sub("strokeStyle", v["style"], "style");
    case "transition":
      if (!isObj(v)) return "a transition is { duration, delay, timingFunction }";
      return sub("duration", v["duration"], "duration") ?? sub("duration", v["delay"], "delay") ??
        sub("cubicBezier", v["timingFunction"], "timingFunction");
    case "shadow": {
      const list = Array.isArray(v) ? v : [v];
      for (const s of list) {
        if (!isObj(s)) return "a shadow is { color, offsetX, offsetY, blur, spread } or a list of them";
        const e = sub("color", s["color"], "color") ?? sub("dimension", s["offsetX"], "offsetX") ??
          sub("dimension", s["offsetY"], "offsetY") ?? sub("dimension", s["blur"], "blur") ??
          sub("dimension", s["spread"], "spread");
        if (e) return e;
        if (s["inset"] !== undefined && typeof s["inset"] !== "boolean") return "inset must be a boolean";
      }
      return null;
    }
    case "gradient":
      if (!Array.isArray(v) || v.length === 0) return "a gradient is a list of stops";
      for (const s of v) {
        if (!isObj(s)) return "a gradient stop is { color, position }";
        const e = sub("color", s["color"], "color") ?? sub("number", s["position"], "position");
        if (e) return e;
      }
      return null;
    case "typography":
      if (!isObj(v)) return "a typography is { fontFamily, fontSize, fontWeight, letterSpacing, lineHeight }";
      return sub("fontFamily", v["fontFamily"], "fontFamily") ?? sub("dimension", v["fontSize"], "fontSize") ??
        sub("fontWeight", v["fontWeight"], "fontWeight") ?? sub("dimension", v["letterSpacing"], "letterSpacing") ??
        sub("number", v["lineHeight"], "lineHeight");
    default:
      return `unknown type "${type}"`;
  }
}

/** Every finding about a token set: structure, types, aliases and values. */
export function validate(
  files: { file: string; json: unknown }[],
): { tokens: Map<string, Token>; findings: Finding[] } {
  const { tokens, findings } = collect(files);
  for (const t of tokens.values()) {
    const end = resolve(tokens, t, findings);
    if (!end) continue;
    const type = t.type ?? end.type;
    if (!type) {
      findings.push({
        check: CHECK,
        level: "problem",
        file: t.file,
        message: `${t.path}: has no $type, own or inherited`,
      });
      continue;
    }
    if (end !== t && end.type && end.type !== type) {
      findings.push({
        check: CHECK,
        level: "problem",
        file: t.file,
        message: `${t.path}: is a ${type} but refers to ${end.path}, a ${end.type}`,
      });
      continue;
    }
    const ref = (alias: string, want: string) => {
      const target = tokens.get(alias);
      if (!target) return `refers to {${alias}}, which is not a token`;
      return target.type && target.type !== want
        ? `refers to {${alias}}, a ${target.type}, where a ${want} goes`
        : null;
    };
    const e = valueError(type, end.value, ref);
    if (e) findings.push({ check: CHECK, level: "problem", file: t.file, message: `${t.path}: ${e}` });
  }
  return { tokens, findings };
}

/** The token files of a folder, *.tokens.json, parsed; a file that is not JSON is a finding. */
export async function readTokenFiles(
  dir: string,
  label = dir,
): Promise<{ files: { file: string; json: unknown }[]; findings: Finding[] }> {
  const files: { file: string; json: unknown }[] = [];
  const findings: Finding[] = [];
  const names: string[] = [];
  try {
    for await (const e of Deno.readDir(dir)) if (e.isFile && e.name.endsWith(".tokens.json")) names.push(e.name);
  } catch {
    findings.push({ check: CHECK, level: "problem", file: label, message: "no such folder of tokens" });
    return { files, findings };
  }
  if (names.length === 0) {
    findings.push({ check: CHECK, level: "problem", file: label, message: "holds no *.tokens.json file" });
  }
  for (const name of names.sort()) {
    const file = `${label}/${name}`;
    try {
      files.push({ file, json: JSON.parse(await Deno.readTextFile(`${dir}/${name}`)) });
    } catch (e) {
      findings.push({ check: CHECK, level: "problem", file, message: `not JSON: ${(e as Error).message}` });
    }
  }
  return { files, findings };
}

/** The CSS custom property a token is written as: its path, joined with dashes. */
export const cssName = (path: string): string => `--${path.split(".").join("-")}`;

/** Mood boards must be interchangeable: the same token paths, with the same types. */
export function compareMoods(moods: Map<string, Map<string, Token>>): Finding[] {
  const findings: Finding[] = [];
  const [first, ...rest] = [...moods.entries()];
  if (!first) return findings;
  for (const [name, tokens] of rest) {
    for (const [path, t] of first[1]) {
      const other = tokens.get(path);
      if (!other) {
        findings.push({
          check: CHECK,
          level: "problem",
          file: name,
          message: `${path}: defined by ${first[0]}, missing here`,
        });
      } else if (other.type !== t.type) {
        findings.push({
          check: CHECK,
          level: "problem",
          file: name,
          message: `${path}: a ${other.type} here, a ${t.type} in ${first[0]}`,
        });
      }
    }
    for (const path of tokens.keys()) {
      if (!first[1].has(path)) {
        findings.push({ check: CHECK, level: "problem", file: name, message: `${path}: not defined by ${first[0]}` });
      }
    }
  }
  return findings;
}

/** Named token files of a folder, parsed; a file that is missing or not JSON is a finding. */
export async function readNamedFiles(
  dir: string,
  label: string,
  names: string[],
): Promise<{ files: { file: string; json: unknown }[]; findings: Finding[] }> {
  const files: { file: string; json: unknown }[] = [];
  const findings: Finding[] = [];
  for (const name of names) {
    const file = `${label}/${name}`;
    try {
      files.push({ file, json: JSON.parse(await Deno.readTextFile(`${dir}/${name}`)) });
    } catch (e) {
      findings.push({
        check: CHECK,
        level: "problem",
        file,
        message: `cannot be read as JSON: ${(e as Error).message}`,
      });
    }
  }
  return { files, findings };
}
