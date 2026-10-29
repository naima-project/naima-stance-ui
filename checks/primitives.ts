// Two things only one widget of the set may do, so that the accessibility rules about them can be checked.
//
// no-raw-drag   Pointer dragging is handled only by Draggable, which always offers the same moves as buttons and
//               arrow keys (WCAG 2.2 SC 2.5.7). Anywhere else, a handler of a pointer, mouse or touch move, of an
//               HTML5 drag event, or a `draggable` attribute is refused: in the markup (`onpointermove`,
//               `on:dragstart`, `draggable="true"`) and in the scripts (`addEventListener("touchmove", …)`,
//               `el.ondragstart = …`, `el.draggable = true`, `setPointerCapture`).
// auth-only     A password or a one-time code is asked for only by Auth, the sign-in form that meets accessible
//               authentication (SC 3.3.8). Anywhere else, an element or a component given `type="password"`, or an
//               `autocomplete` of current-password, new-password or one-time-code, is refused, whether the value is
//               written as text or as a string in an expression (`type={shown ? "text" : "password"}`), and so is a
//               script that sets one.
//
// Components are parsed with Svelte's compiler and the whole tree, markup and scripts, is walked. A value the
// compiler cannot see, such as a spread of props or an attribute computed from a variable, is not judged.

import { parse } from "svelte/compiler";
import { type Finding, lineOf } from "./finding.ts";

// deno-lint-ignore no-explicit-any
type Node = any;

export const DRAG_PRIMITIVE = "Draggable.svelte";
export const AUTH_COMPONENT = "Auth.svelte";

const MOVES = ["pointermove", "mousemove", "touchmove"];
const DRAGS = ["dragstart", "drag", "dragend", "dragenter", "dragover", "dragleave", "drop"];
const DRAG_EVENTS = new Set([...MOVES, ...DRAGS]);
const SECRETS = new Set(["current-password", "new-password", "one-time-code"]);

/** Every string literal and static text inside an attribute's value. */
function strings(value: Node): string[] {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === "Text") out.push(String(n.data));
    else if (n.type === "Literal" && typeof n.value === "string") out.push(n.value);
    else if (n.type === "TemplateLiteral") { for (const q of n.quasis) out.push(String(q.value.cooked ?? "")); }
    for (const [k, v] of Object.entries(n)) if (k !== "parent" && v && typeof v === "object") walk(v);
  };
  if (value !== true) walk(value);
  return out;
}

const literal = (n: Node): string | null => (n?.type === "Literal" && typeof n.value === "string" ? n.value : null);
const propName = (n: Node): string | null =>
  n?.type === "MemberExpression" ? (n.computed ? literal(n.property) : n.property?.name ?? null) : null;

/** What a node does that only one of the primitives may do, if anything. */
function seen(n: Node): { drag?: string; auth?: string } | null {
  switch (n.type) {
    case "Attribute": {
      const name = String(n.name).toLowerCase();
      if (name.startsWith("on") && DRAG_EVENTS.has(name.slice(2))) return { drag: `handles ${name.slice(2)}` };
      if (name === "draggable" && (n.value === true || strings(n.value).some((s) => s.trim() !== "false"))) {
        return { drag: "is draggable (HTML5 drag and drop)" };
      }
      if (name === "type" && strings(n.value).some((s) => s.trim().toLowerCase() === "password")) {
        return { auth: 'asks for a password (type="password")' };
      }
      if (name === "autocomplete") {
        const hit = strings(n.value).flatMap((s) => s.toLowerCase().split(/\s+/)).find((t) => SECRETS.has(t));
        if (hit) return { auth: `asks for a secret (autocomplete="${hit}")` };
      }
      return null;
    }
    case "OnDirective":
      return DRAG_EVENTS.has(n.name) ? { drag: `handles ${n.name}` } : null;
    case "CallExpression": {
      const method = propName(n.callee);
      if (method === "addEventListener" && DRAG_EVENTS.has(literal(n.arguments[0]) ?? "")) {
        return { drag: `listens to ${literal(n.arguments[0])}` };
      }
      if (method === "setPointerCapture") return { drag: "captures the pointer" };
      if (method === "setAttribute") {
        const [attr, value] = [literal(n.arguments[0])?.toLowerCase(), literal(n.arguments[1])?.toLowerCase()];
        if (attr === "draggable" && value !== "false") return { drag: "makes an element draggable" };
        if (attr === "type" && value === "password") return { auth: "makes a password field" };
        if (attr === "autocomplete" && value?.split(/\s+/).some((t) => SECRETS.has(t))) {
          return { auth: "makes a field for a secret" };
        }
      }
      return null;
    }
    case "AssignmentExpression": {
      const prop = propName(n.left)?.toLowerCase();
      if (!prop) return null;
      if (prop.startsWith("on") && DRAG_EVENTS.has(prop.slice(2))) return { drag: `handles ${prop.slice(2)}` };
      if (prop === "draggable" && !(n.right?.type === "Literal" && n.right.value === false)) {
        return { drag: "makes an element draggable" };
      }
      if (prop === "type" && literal(n.right)?.toLowerCase() === "password") return { auth: "makes a password field" };
      if (prop === "autocomplete" && literal(n.right)?.toLowerCase().split(/\s+/).some((t) => SECRETS.has(t))) {
        return { auth: "makes a field for a secret" };
      }
      return null;
    }
  }
  return null;
}

/**
 * The findings of no-raw-drag and auth-only in one component. `primitive` says which of the two the file is allowed
 * to be: the widget set's Draggable may drag, its Auth may ask for secrets.
 */
export function checkPrimitives(
  file: string,
  source: string,
  primitive: { drag: boolean; auth: boolean },
): { drag: Finding[]; auth: Finding[] } {
  const out = { drag: [] as Finding[], auth: [] as Finding[] };
  let ast: Node;
  try {
    ast = parse(source, { modern: true, filename: file });
  } catch (e) {
    const f = (check: string): Finding => ({
      check,
      level: "problem",
      file,
      message: `does not parse: ${(e as Error).message}`,
    });
    return { drag: [f("no-raw-drag")], auth: [f("auth-only")] };
  }
  const walk = (n: Node) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n.type === "string") {
      const hit = seen(n);
      if (hit?.drag && !primitive.drag) {
        out.drag.push({
          check: "no-raw-drag",
          level: "problem",
          file,
          line: lineOf(source, n.start),
          message:
            `${hit.drag}: drag only through the widget set's Draggable, which also offers every move without dragging (WCAG 2.2 SC 2.5.7)`,
        });
      }
      if (hit?.auth && !primitive.auth) {
        out.auth.push({
          check: "auth-only",
          level: "problem",
          file,
          line: lineOf(source, n.start),
          message:
            `${hit.auth}: ask for a password or a one-time code only through the widget set's Auth, which meets accessible authentication (WCAG 2.2 SC 3.3.8)`,
        });
      }
    }
    for (const [k, v] of Object.entries(n)) if (k !== "parent" && v && typeof v === "object") walk(v);
  };
  walk(ast.fragment);
  walk(ast.instance?.content);
  walk(ast.module?.content);
  return out;
}
