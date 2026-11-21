// layout-in-css (rules/ui-layout-in-css.md): where things go and how big they are is CSS's, and no script computes a
// position or a size. The check reads every component and every script module of the widget set and the app's
// components (.svelte, .svelte.ts, .ts, .js; tests left out) and refuses
//
//   - a script that writes a layout property of an element's style (`el.style.left = …`, `el.style.height = …`,
//     `el.style.setProperty("width", …)`, `el.style.cssText = …`, `Object.assign(el.style, …)`), whatever the value;
//   - a measured size used for layout: a value read from getBoundingClientRect(), getClientRects(), an element's
//     offset*, client* or scroll* sizes, the window's inner* or outer* sizes, a ResizeObserver entry's boxes, or a
//     `bind:clientWidth`-like binding, which reaches, through the variables it is assigned to, a `style:` directive of
//     a layout property or of a custom property, a `style="…"` attribute, or the width, height or viewBox of an
//     `<svg>` (a drawing is fitted to its box with viewBox and preserveAspectRatio, not with a computed zoom).
//
// What stays allowed: a drawing's own coordinates inside an SVG (the attributes of its shapes, whatever they are computed
// from), the reading of a pointer's travel during a drag (a value computed in a pointer, mouse, touch or drag event
// handler, or in a callback of a drag's travel such as Draggable's `ontravel`, is the pointer's, not a measurement; a
// style written there is reported as a note), scrolling (scrollIntoView, scrollTo, scrollTop), and every measurement
// whose value never reaches the layout.
//
// The flow is followed by name, through assignments, declarations, destructuring, arithmetic, Math's functions and
// $derived, but not through other calls: a function's result is not taken to be measured because its arguments were.
// Components are parsed with Svelte's compiler, and so are script modules, wrapped in a <script lang="ts">.

import { parse } from "svelte/compiler";
import { type Finding, lineOf } from "./finding.ts";

export const LAYOUT_CHECK = "layout-in-css";

// deno-lint-ignore no-explicit-any
type Node = any;

/** CSS properties that place or size a box, in their CSS spelling. */
const LAYOUT_CSS = new Set([
  "left",
  "top",
  "right",
  "bottom",
  "inset",
  "inset-inline",
  "inset-block",
  "inset-inline-start",
  "inset-inline-end",
  "inset-block-start",
  "inset-block-end",
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "inline-size",
  "block-size",
  "min-inline-size",
  "max-inline-size",
  "min-block-size",
  "max-block-size",
  "margin",
  "margin-left",
  "margin-right",
  "margin-top",
  "margin-bottom",
  "margin-inline",
  "margin-block",
  "margin-inline-start",
  "margin-inline-end",
  "margin-block-start",
  "margin-block-end",
  "padding",
  "padding-left",
  "padding-right",
  "padding-top",
  "padding-bottom",
  "padding-inline",
  "padding-block",
  "transform",
  "translate",
  "flex-basis",
  "grid-template-columns",
  "grid-template-rows",
  "font-size",
]);
const camel = (css: string) => css.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
/** The same properties as an element's style names them in script (style.minWidth). */
const LAYOUT_JS = new Set([...LAYOUT_CSS].map(camel));

/** Members whose value is a measured size or place. */
const MEASURES = new Set([
  "offsetWidth",
  "offsetHeight",
  "offsetLeft",
  "offsetTop",
  "clientWidth",
  "clientHeight",
  "clientLeft",
  "clientTop",
  "scrollWidth",
  "scrollHeight",
  "innerWidth",
  "innerHeight",
  "outerWidth",
  "outerHeight",
  "contentRect",
  "contentBoxSize",
  "borderBoxSize",
  "devicePixelContentBoxSize",
  "visualViewport",
]);
const MEASURE_CALLS = new Set(["getBoundingClientRect", "getClientRects"]);
/** Svelte's bindings that measure. */
const MEASURE_BINDINGS = new Set([
  "clientWidth",
  "clientHeight",
  "offsetWidth",
  "offsetHeight",
  "contentRect",
  "contentBoxSize",
  "borderBoxSize",
  "devicePixelContentBoxSize",
  "innerWidth",
  "innerHeight",
  "outerWidth",
  "outerHeight",
]);
/** What a pointer's handler reads: its travel, which is no measurement. */
const POINTER_READS = new Set(["clientX", "clientY", "pageX", "pageY", "screenX", "screenY", "movementX", "movementY"]);
const POINTER_TYPES = new Set(["PointerEvent", "MouseEvent", "TouchEvent", "DragEvent", "WheelEvent"]);
/** Props through which a drag reports its travel (Draggable, Pannable). */
const TRAVEL_PROPS = new Set(["ontravel", "onslide", "onpan", "onpinch"]);
const POINTER_EVENT = /^on(pointer|mouse|touch|drag|drop|wheel)/;
/** Calls whose result is computed from their arguments: the measurement flows through them. */
const PASS_THROUGH = new Set(["$derived", "Number", "String", "parseFloat", "parseInt"]);

const isFunction = (n: Node) =>
  n?.type === "ArrowFunctionExpression" || n?.type === "FunctionExpression" || n?.type === "FunctionDeclaration";

const memberName = (n: Node): string | null =>
  n?.type === "MemberExpression"
    ? (n.computed ? (n.property?.type === "Literal" ? String(n.property.value) : null) : n.property?.name ?? null)
    : null;

/** The identifier a member chain starts from: `a` for a.b.c, a[0].b. */
function rootName(n: Node): string | null {
  while (n?.type === "MemberExpression" || n?.type === "TSNonNullExpression" || n?.type === "ChainExpression") {
    n = n.type === "MemberExpression" ? n.object : n.expression;
  }
  return n?.type === "Identifier" ? n.name : null;
}

/** Every name a pattern binds: a, { a, b: c }, [a, ...b]. */
function patternNames(p: Node, out: string[] = []): string[] {
  if (!p) return out;
  switch (p.type) {
    case "Identifier":
      out.push(p.name);
      break;
    case "ObjectPattern":
      for (const prop of p.properties) patternNames(prop.type === "RestElement" ? prop.argument : prop.value, out);
      break;
    case "ArrayPattern":
      for (const e of p.elements) patternNames(e, out);
      break;
    case "RestElement":
      patternNames(p.argument, out);
      break;
    case "AssignmentPattern":
      patternNames(p.left, out);
      break;
    default: {
      const r = rootName(p);
      if (r) out.push(r);
    }
  }
  return out;
}

/** Walks a tree, calling `visit` with each node and the functions around it, innermost last. */
function walk(n: Node, visit: (n: Node, fns: Node[]) => void, fns: Node[] = []): void {
  if (!n || typeof n !== "object") return;
  if (Array.isArray(n)) {
    for (const c of n) walk(c, visit, fns);
    return;
  }
  if (typeof n.type === "string") visit(n, fns);
  const inner = isFunction(n) ? [...fns, n] : fns;
  for (const [k, v] of Object.entries(n)) {
    if (k === "parent" || k === "loc" || k === "name_loc" || k === "metadata") continue;
    if (v && typeof v === "object") walk(v, visit, inner);
  }
}

interface Source {
  scripts: Node[];
  fragment: Node | null;
  /** Characters added before the source to parse it, and the text parsed. */
  shift: number;
  text: string;
}

function parsed(file: string, source: string): Source | string {
  const svelte = file.endsWith(".svelte");
  const prefix = '<script lang="ts">\n';
  const text = svelte ? source : `${prefix}${source.replaceAll("</script", "<\\/script")}\n</script>`;
  try {
    const ast = parse(text, { modern: true, filename: file });
    return {
      scripts: [ast.instance?.content, ast.module?.content].filter(Boolean),
      fragment: svelte ? ast.fragment : null,
      shift: svelte ? 0 : prefix.length,
      text,
    };
  } catch (e) {
    return (e as Error).message.split("\n")[0]!;
  }
}

/** The layout-in-css findings of one component or script module. */
export function checkLayout(file: string, source: string): Finding[] {
  const p = parsed(file, source);
  if (typeof p === "string") {
    return [{ check: LAYOUT_CHECK, level: "note", file, message: `not checked, it does not parse: ${p}` }];
  }
  const findings: Finding[] = [];
  const at = (n: Node) => lineOf(p.text, n.start ?? 0) - (p.shift ? 1 : 0);
  const report = (level: Finding["level"], n: Node, message: string) =>
    findings.push({ check: LAYOUT_CHECK, level, file, line: at(n), message });

  // The functions that handle a pointer: their values are its travel.
  const pointerFns = new Set<Node>();
  const handlers = new Set<string>();
  const travelAttr = (a: Node) =>
    (a.type === "Attribute" && (POINTER_EVENT.test(a.name) || TRAVEL_PROPS.has(a.name))) ||
    (a.type === "OnDirective" && POINTER_EVENT.test(`on${a.name}`));
  const all = [...p.scripts, p.fragment];
  walk(all, (n) => {
    if (isFunction(n)) {
      const typed = n.params?.some((q: Node) => {
        const t = q?.typeAnnotation?.typeAnnotation;
        return t?.type === "TSTypeReference" && POINTER_TYPES.has(t.typeName?.name);
      });
      let reads = false;
      walk(n.body, (m) => {
        if (POINTER_READS.has(memberName(m) ?? "")) reads = true;
      });
      if (typed || reads) pointerFns.add(n);
    }
    if (travelAttr(n)) {
      walk(n.value ?? n.expression, (m) => {
        if (isFunction(m)) pointerFns.add(m);
        else if (m.type === "Identifier") handlers.add(m.name);
      });
    }
    if (n.type === "Property" && TRAVEL_PROPS.has(n.key?.name) && isFunction(n.value)) pointerFns.add(n.value);
  });
  // A handler named in the markup (onpointermove={move}, ontravel={travel}) is a pointer's too.
  walk(p.scripts, (n) => {
    if (n.type === "FunctionDeclaration" && handlers.has(n.id?.name)) pointerFns.add(n);
    if (n.type === "VariableDeclarator" && handlers.has(n.id?.name) && isFunction(n.init)) pointerFns.add(n.init);
  });
  const inPointer = (fns: Node[]) => fns.some((f) => pointerFns.has(f));

  // The names that hold a measurement, each with what it measured.
  const measured = new Map<string, string>();
  /** What an expression measures, if it carries a measurement, else null. */
  const carries = (e: Node): string | null => {
    let found: string | null = null;
    const look = (n: Node): void => {
      if (found || !n || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(look);
      if (isFunction(n)) return; // a function is not its result
      if (n.type === "Identifier") {
        if (measured.has(n.name)) found = measured.get(n.name)!;
        return;
      }
      if (n.type === "MemberExpression") {
        const name = memberName(n);
        if (name && MEASURES.has(name)) {
          found = name;
          return;
        }
        look(n.object);
        if (n.computed) look(n.property);
        return;
      }
      if (n.type === "CallExpression") {
        const callee = n.callee;
        const name = memberName(callee) ?? (callee?.type === "Identifier" ? callee.name : null);
        if (name && MEASURE_CALLS.has(name)) {
          found = `${name}()`;
          return;
        }
        const root = rootName(callee);
        // $derived(x), $derived.by(() => x), Math.round(x): the result is the measurement still.
        if (root === "$derived" && memberName(callee) === "by" && isFunction(n.arguments[0])) {
          return look(n.arguments[0].body);
        }
        if (root === "Math" || (name && PASS_THROUGH.has(name)) || root === "$derived") return look(n.arguments);
        // Any other call: its result is not taken to be measured, though a method of a measurement is.
        if (callee?.type === "MemberExpression") look(callee.object);
        return;
      }
      if (n.type === "Property") {
        look(n.value);
        if (n.computed) look(n.key);
        return;
      }
      for (const [k, v] of Object.entries(n)) {
        if (k === "parent" || k === "loc" || k === "typeAnnotation" || k === "metadata") continue;
        if (v && typeof v === "object") look(v);
      }
    };
    look(e);
    return found;
  };

  // Svelte's measuring bindings, then the flow to a fixpoint.
  if (p.fragment) {
    walk(p.fragment, (n) => {
      if (n.type === "BindDirective" && MEASURE_BINDINGS.has(n.name)) {
        const r = rootName(n.expression) ?? (n.expression?.type === "Identifier" ? n.expression.name : null);
        if (r) measured.set(r, `bind:${n.name}`);
      }
    });
  }
  for (let changed = true; changed;) {
    changed = false;
    const taint = (names: string[], what: string) => {
      for (const name of names) {
        if (!measured.has(name)) {
          measured.set(name, what);
          changed = true;
        }
      }
    };
    walk(p.scripts, (n, fns) => {
      if (inPointer(fns)) return;
      if (n.type === "VariableDeclarator" && n.init) {
        const what = carries(n.init);
        if (what) taint(patternNames(n.id), what);
      } else if (n.type === "AssignmentExpression") {
        const what = carries(n.right);
        if (what) taint(patternNames(n.left), what);
      }
    });
    // A ResizeObserver's callback measures through its entries, whatever they are called.
    walk(p.scripts, (n, fns) => {
      if (inPointer(fns)) return;
      if (n.type === "NewExpression" && n.callee?.name === "ResizeObserver" && isFunction(n.arguments?.[0])) {
        const entries = patternNames(n.arguments[0].params?.[0]);
        taint(entries, "a ResizeObserver entry");
      }
    });
  }

  // The elements of a drawing: bound (bind:this) inside an <svg>, or typed or found as SVG elements. Their styles are
  // the drawing's coordinates (a group moved along the drawing), which stay the script's.
  const drawing = new Set<string>();
  const svgWalk = (n: Node, inSvg: boolean): void => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach((c) => svgWalk(c, inSvg));
    const inner = inSvg || n.type === "RegularElement" && n.name === "svg";
    if (inSvg && n.type === "BindDirective" && n.name === "this") {
      const r = rootName(n.expression);
      if (r) drawing.add(r);
    }
    for (const [k, v] of Object.entries(n)) {
      if (k === "parent" || k === "loc" || k === "name_loc" || k === "metadata") continue;
      if (v && typeof v === "object") {
        svgWalk(v, n.type === "RegularElement" ? inner && n.name !== "foreignObject" : inSvg);
      }
    }
  };
  // The attributes of the <svg> itself are its box; its children's are inside the drawing.
  walk(p.fragment, (n) => {
    if (n.type === "RegularElement" && n.name === "svg") svgWalk(n.fragment, true);
  });
  const svgText = (n: Node) =>
    !!n &&
    (p.text.slice(n.start ?? 0, n.end ?? 0).match(/\bSVG[A-Za-z]*Element\b/g) ?? []).some((t) => t !== "SVGSVGElement");
  walk(p.scripts, (n) => {
    if (n.type === "VariableDeclarator" && (svgText(n.id?.typeAnnotation) || svgText(n.init))) {
      for (const name of patternNames(n.id)) drawing.add(name);
    }
    if (n.type === "ForOfStatement" && svgText(n.right)) {
      const d = n.left?.type === "VariableDeclaration" ? n.left.declarations[0]?.id : n.left;
      for (const name of patternNames(d)) drawing.add(name);
    }
  });
  // The <svg> itself is a box of the page.
  walk(p.fragment, (n) => {
    if (n.type !== "RegularElement" || n.name !== "svg") return;
    for (const a of n.attributes ?? []) {
      if (a.type === "BindDirective" && a.name === "this") drawing.delete(rootName(a.expression) ?? "");
    }
  });
  const ofDrawing = (styleOwner: Node) => drawing.has(rootName(styleOwner) ?? "");

  // The script's writes to a style.
  walk(p.scripts, (n, fns) => {
    if (n.type === "AssignmentExpression" && n.left?.type === "MemberExpression" && ofDrawing(n.left.object)) return;
    if (n.type === "CallExpression" && n.callee?.type === "MemberExpression" && ofDrawing(n.callee.object)) return;
    const level: Finding["level"] = inPointer(fns) ? "note" : "problem";
    const tail = inPointer(fns) ? " (in a pointer's handler: allowed only to follow the drag)" : "";
    if (n.type === "AssignmentExpression" && n.left?.type === "MemberExpression") {
      const prop = memberName(n.left);
      const owner = n.left.object;
      if (memberName(owner) === "style" && prop && (LAYOUT_JS.has(prop) || LAYOUT_CSS.has(prop))) {
        report(
          level,
          n,
          `writes style.${prop} in script: place and size it with CSS (flex, grid, inset), not a script${tail}`,
        );
      } else if (memberName(owner) === "style" && prop === "cssText") {
        report(level, n, `writes style.cssText in script: lay it out with CSS, not a script${tail}`);
      }
    }
    if (n.type === "CallExpression") {
      const callee = n.callee;
      if (memberName(callee) === "setProperty" && memberName(callee.object) === "style") {
        const name = n.arguments?.[0]?.type === "Literal" ? String(n.arguments[0].value) : null;
        const what = carries(n.arguments?.[1]);
        if (name && LAYOUT_CSS.has(name)) {
          report(level, n, `sets ${name} on a style in script: place and size it with CSS, not a script${tail}`);
        } else if (name?.startsWith("--") && what) {
          report(
            level,
            n,
            `sets ${name} from a measured size (${what}): lay it out with CSS instead of measuring${tail}`,
          );
        }
      }
      if (
        rootName(callee) === "Object" && memberName(callee) === "assign" && memberName(n.arguments?.[0]) === "style"
      ) {
        report(level, n, `assigns to a style in script: lay it out with CSS, not a script${tail}`);
      }
    }
  });

  // The markup's layout fed by a measurement.
  if (p.fragment) {
    const valueCarries = (v: Node): string | null => {
      if (v === true || !v) return null;
      for (const part of Array.isArray(v) ? v : [v]) {
        if (part?.type === "ExpressionTag") {
          const what = carries(part.expression);
          if (what) return what;
        }
      }
      return null;
    };
    walk(p.fragment, (n) => {
      if (n.type === "StyleDirective" && (LAYOUT_CSS.has(n.name) || n.name.startsWith("--"))) {
        const what = n.value === true ? (measured.get(n.name) ?? null) : valueCarries(n.value);
        if (what) {
          report(
            "problem",
            n,
            `style:${n.name} is set from a measured size (${what}): lay it out with CSS instead of measuring`,
          );
        }
      }
      if (n.type === "RegularElement") {
        for (const a of n.attributes ?? []) {
          if (a.type !== "Attribute") continue;
          const what = valueCarries(a.value);
          if (!what) continue;
          if (a.name === "style") {
            report(
              "problem",
              a,
              `a style attribute is computed from a measured size (${what}): lay it out with CSS instead of measuring`,
            );
          } else if (n.name === "svg" && ["width", "height", "viewBox"].includes(a.name)) {
            report(
              "problem",
              a,
              `the <svg>'s ${a.name} is a measured size (${what}): give the drawing its own viewBox and fit it with preserveAspectRatio`,
            );
          }
        }
      }
    });
  }
  return findings;
}

/** Whether the layout check reads a file: a component or a script module, not a test. */
export const layoutFile = (path: string) =>
  /\.(svelte|ts|js)$/.test(path) && !/\.(test|spec)\.(ts|js)$/.test(path) && !path.endsWith(".d.ts");
