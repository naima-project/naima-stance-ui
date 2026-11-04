// Icons come from one icon set, chosen among a few predefined, published, maintained open sets in the design method's
// icons step and recorded in stance-ui.json as `check.icons`. The check refuses, in a component, an icon from anywhere
// else: an import of another icon library (or of a set's package when no set is chosen), an SVG file imported as an
// icon, an inline <svg> element or one written through {@html}, and the class names of an icon font that is not the
// chosen set's. A component that really draws something (a chart, a diagram) is listed under `check.icons.drawings`,
// and may hold inline SVG; it still may not import another icon library.

import { posix } from "node:path";
import { parse } from "svelte/compiler";
import { type Finding, lineOf } from "./finding.ts";

const CHECK = "icons";

// deno-lint-ignore no-explicit-any
type Node = any;

/** A predefined icon set: what the design method offers, and what the check lets a component use. */
export interface IconSet {
  id: string;
  name: string;
  licence: string;
  /** The style, in a few words, for the owner choosing among the sets. */
  style: string;
  /** About how many icons, counting each style or weight once per icon, as the set publishes it. */
  icons: string;
  homepage: string;
  /** The packages a Svelte component uses the set through; a trailing `*` matches a scope or a prefix. */
  packages: string[];
  /** The package of plain SVG files the design method's icons step draws its comparison pages from. */
  svgs: string;
  /** Class names of the set's icon font, if it has one. */
  classes?: RegExp;
}

export const ICON_SETS: readonly IconSet[] = [
  {
    id: "lucide",
    name: "Lucide",
    licence: "ISC",
    style: "outline, 2 px round stroke on a 24 px grid, one style",
    icons: "about 1,700",
    homepage: "https://lucide.dev",
    packages: ["@lucide/svelte", "lucide-svelte"],
    svgs: "lucide-static",
  },
  {
    id: "phosphor",
    name: "Phosphor",
    licence: "MIT",
    style: "six weights from thin to bold, plus fill and duotone",
    icons: "about 1,500, each in six weights",
    homepage: "https://phosphoricons.com",
    packages: ["phosphor-svelte"],
    svgs: "@phosphor-icons/core",
  },
  {
    id: "tabler",
    name: "Tabler Icons",
    licence: "MIT",
    style: "outline, 2 px stroke on a 24 px grid, with filled versions of some",
    icons: "about 6,000",
    homepage: "https://tabler.io/icons",
    packages: ["@tabler/icons-svelte"],
    svgs: "@tabler/icons",
  },
  {
    id: "heroicons",
    name: "Heroicons",
    licence: "MIT",
    style: "outline and solid, at 24, 20 and 16 px, by the makers of Tailwind CSS",
    icons: "about 320, each in four styles",
    homepage: "https://heroicons.com",
    packages: ["@steeze-ui/heroicons", "@steeze-ui/svelte-icon"],
    svgs: "heroicons",
  },
  {
    id: "material-symbols",
    name: "Material Symbols",
    licence: "Apache-2.0",
    style: "Google's, outlined, rounded and sharp, with variable weight and fill",
    icons: "about 3,800, each in three styles",
    homepage: "https://fonts.google.com/icons",
    packages: ["material-symbols", "@material-symbols/*"],
    svgs: "@material-symbols/svg-400",
    classes: /\bmaterial-symbols(-[a-z]+)?\b/,
  },
];

/** Other icon libraries and the generic icon loaders: never a component's icons, whichever set is chosen. */
const OTHER_PACKAGES = [
  "lucide",
  "lucide-static",
  "@phosphor-icons/*",
  "@tabler/*",
  "heroicons",
  "@heroicons/*",
  "@steeze-ui/*",
  "svelte-hero-icons",
  "@iconify/*",
  "@iconify-json/*",
  "@iconify-icons/*",
  "unplugin-icons",
  "~icons/*",
  "@fortawesome/*",
  "svelte-awesome",
  "svelte-fa",
  "@mdi/*",
  "@material-design-icons/*",
  "material-icons",
  "svelte-material-icons",
  "bootstrap-icons",
  "svelte-bootstrap-icons",
  "feather-icons",
  "svelte-feather-icons",
  "svelte-icons",
  "svelte-icons-pack",
  "@svelte-icons/*",
  "remixicon",
  "ionicons",
  "@radix-icons/*",
  "radix-icons-svelte",
  "@carbon/icons*",
  "carbon-icons-svelte",
  "@primer/octicons",
  "svelte-octicons",
  "simple-icons",
  "svelte-simple-icons",
  "boxicons",
  "@icons-pack/*",
];

/** Icon font class names of libraries that are never a predefined set. */
const OTHER_CLASSES: [RegExp, string][] = [
  [/\bmaterial-icons(-[a-z]+)?\b/, "Material Icons"],
  [/\bfa-(solid|regular|brands|light|thin|duotone)\b|\bfa[srlbdt]?\s+fa-[a-z]/, "Font Awesome"],
  [/\bbi\s+bi-[a-z]/, "Bootstrap Icons"],
  [/\bti\s+ti-[a-z]/, "the Tabler icon font"],
  [/\bph(-[a-z]+)?\s+ph-[a-z]/, "the Phosphor icon font"],
];

const matches = (spec: string, pattern: string) =>
  pattern.endsWith("*") ? spec.startsWith(pattern.slice(0, -1)) : spec === pattern || spec.startsWith(pattern + "/");

/** The icon set a module specifier belongs to, "other" for another icon library, or null if it is not icons. */
export function iconSource(spec: string): IconSet | "other" | null {
  for (const set of ICON_SETS) if (set.packages.some((p) => matches(spec, p))) return set;
  if (OTHER_PACKAGES.some((p) => matches(spec, p))) return "other";
  return null;
}

/** Every package name the icons check owns, which the import check leaves to it. */
export const isIconPackage = (spec: string): boolean => iconSource(spec) !== null;

export interface IconRules {
  /** The chosen set, or null when none is chosen yet. */
  set: IconSet | null;
  /** True for a component listed under `drawings`: it may hold inline SVG. */
  drawing: boolean;
}

/** The icon set `check.icons` in stance-ui.json chooses, its drawings, and what is wrong with it. */
export function readIconChoice(
  icons: unknown,
): { set: IconSet | null; drawings: string[]; findings: Finding[] } {
  const findings: Finding[] = [];
  const choices = ICON_SETS.map((s) => s.id).join(", ");
  if (icons === undefined || icons === null) return { set: null, drawings: [], findings };
  const raw = typeof icons === "string" ? { set: icons } : icons as { set?: unknown; drawings?: unknown };
  const drawings = Array.isArray(raw.drawings) ? raw.drawings.filter((d): d is string => typeof d === "string") : [];
  if (raw.set === undefined || raw.set === null) return { set: null, drawings, findings };
  const set = ICON_SETS.find((s) => s.id === raw.set) ?? null;
  if (!set) {
    findings.push({
      check: CHECK,
      level: "problem",
      file: "stance-ui.json",
      message: `check.icons names ${JSON.stringify(raw.set)}, which is not one of the predefined icon sets: ${choices}`,
    });
  }
  return { set, drawings: drawings.map((d) => posix.normalize(d).replace(/\/+$/, "")), findings };
}

const SVG_TAG = /<svg[\s>]/i;

/** Whether a script node is a string that holds an <svg> element. */
const svgText = (n: Node): boolean =>
  (n.type === "Literal" && typeof n.value === "string" && SVG_TAG.test(n.value)) ||
  (n.type === "TemplateLiteral" && n.quasis.some((q: Node) => SVG_TAG.test(String(q.value.cooked ?? ""))));

const where = (set: IconSet | null) =>
  set
    ? `use an icon of ${set.name}, the set chosen in check.icons`
    : `no icon set is chosen: choose one in the design method's icons step (check.icons in stance-ui.json, one of ${
      ICON_SETS.map((s) => s.id).join(", ")
    })`;

/** Every icon in a component that does not come from the chosen set. */
export function checkIcons(file: string, source: string, rules: IconRules): Finding[] {
  let ast: Node;
  try {
    ast = parse(source, { modern: true, filename: file });
  } catch (e) {
    return [{ check: CHECK, level: "problem", file, message: `does not parse: ${(e as Error).message}` }];
  }
  const findings: Finding[] = [];
  const refuse = (at: number, what: string) =>
    findings.push({
      check: CHECK,
      level: "problem",
      file,
      line: lineOf(source, at),
      message: `${what}: ${where(rules.set)}`,
    });

  const spec = (s: string, at: number) => {
    const from = iconSource(s);
    if (from === "other") refuse(at, `imports "${s}", an icon library that is not a predefined set`);
    else if (from && from !== rules.set) {
      refuse(at, `imports "${s}", an icon of ${from.name}, which is not the chosen set`);
    } else if (!from && /\.svg($|\?)/.test(s) && !rules.drawing) refuse(at, `imports "${s}", an SVG file as an icon`);
  };
  const classes = (text: string, at: number) => {
    for (const set of ICON_SETS) {
      if (set.classes?.test(text) && set !== rules.set) {
        refuse(at, `uses the icon font of ${set.name} (class "${text}")`);
      }
    }
    for (const [re, name] of OTHER_CLASSES) if (re.test(text)) refuse(at, `uses ${name} (class "${text}")`);
  };
  const scripts = (n: Node) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(scripts);
    if (
      (n.type === "ImportDeclaration" || n.type === "ExportNamedDeclaration" || n.type === "ExportAllDeclaration") &&
      n.source
    ) spec(String(n.source.value), n.start);
    else if (n.type === "ImportExpression" && n.source?.type === "Literal") spec(String(n.source.value), n.start);
    else if (!rules.drawing && svgText(n)) refuse(n.start, "an <svg> written in a string");
    for (const [k, v] of Object.entries(n)) if (k !== "parent" && v && typeof v === "object") scripts(v);
  };
  const markup = (n: Node) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(markup);
    if (n.type === "RegularElement" && n.name === "svg" && !rules.drawing) {
      refuse(n.start, "an inline <svg> drawn by hand");
      return; // its children are the same icon
    }
    if (n.type === "HtmlTag" && !rules.drawing && SVG_TAG.test(source.slice(n.start, n.end))) {
      refuse(n.start, "an <svg> written through {@html}");
    }
    if (n.type === "Attribute" && n.name === "class" && Array.isArray(n.value)) {
      for (const part of n.value) if (part.type === "Text") classes(String(part.data).trim(), n.start);
    }
    for (const [k, v] of Object.entries(n)) if (k !== "parent" && v && typeof v === "object") markup(v);
  };
  scripts(ast.instance?.content);
  scripts(ast.module?.content);
  markup(ast.fragment);
  return findings;
}
