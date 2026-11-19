// What offers a transition to a person, read from its machine's comments: the tag @affordance on the method (or on its
// class, for every method of the class that has none of its own). The registry carries it, and the check `affordances`
// holds every transition a person takes to having one that a person can see or find.
//
//   @affordance button: the Add button
//   @affordance key: the key N; discover: the shortcut shown beside the Add button
//   @affordance the thread of a line on the river; rest: a faint thread; hover: it lifts and names its line;
//               touch: tap it; discover: the line's name at the thread's end
//   @affordance none: the app calls it when the data arrives
//
// The first part names the element. When it begins with a kind of the widget set (`button: the Add button`), the
// widget gives the cues at rest, on hover or focus and on touch, and only the element is said; any cue may still be
// said, and replaces the widget's. An element of the app's own (a mark in a drawing, a thread on a chart) says each cue
// itself. `discover` says how a person finds an action whose cue is invisible at rest. `none` says why no person takes
// the transition (the app calls it, or only an agent does), and a component that calls it from an event handler is
// refused by the check.

/** How a person finds and takes a transition: the element that offers it and its cues. */
export interface Affordance {
  /** A kind of the widget set (button, link, ...) whose cues the set gives, or `custom`. */
  kind: string;
  /** The element that offers it, in the words a person would use. */
  element: string;
  /** The cue at rest, before any pointer or focus is on it. */
  rest?: string;
  /** The cue on hover and on keyboard focus. */
  hover?: string;
  /** The cue and the gesture on a touch screen. */
  touch?: string;
  /** How a person finds it, for a cue that is invisible at rest. */
  discover?: string;
}

/** A transition no person takes: why (the app calls it, only an agent does). */
export interface NoAffordance {
  none: string;
}

/** The kinds of element the widget set offers, and the cues each gives by itself. */
export const KINDS: Readonly<Record<string, Readonly<Pick<Affordance, "rest" | "hover" | "touch" | "discover">>>> = {
  button: {
    rest: "a button with its label or icon",
    hover: "the button's hover and focus state",
    touch: "a finger-size target, tapped",
  },
  link: {
    rest: "text in the link colour",
    hover: "the link's hover and focus state",
    touch: "a finger-size target, tapped",
  },
  tab: {
    rest: "a tab with its name, the chosen one marked",
    hover: "the tab's hover and focus state",
    touch: "tapped",
  },
  field: { rest: "a field with its label", hover: "the field's focus ring", touch: "tapped, the keyboard opens" },
  choice: {
    rest: "a choice (a switch, a box, a segment) with its label, its state shown",
    hover: "the choice's hover and focus state",
    touch: "a finger-size target, tapped",
  },
  menu: {
    rest: "an entry of a menu that a visible button opens",
    hover: "the entry's hover and focus state",
    touch: "tapped",
    discover: "the button that opens the menu",
  },
  row: {
    rest: "a row of a list, its title shown",
    hover: "the row's hover and focus state",
    touch: "the whole row is the target, tapped",
  },
  key: {
    rest: "nothing: a key on the keyboard",
    hover: "nothing",
    touch: "none: the same action has a visible control",
  },
  drag: {
    rest: "a handle or a surface that can be moved",
    hover: "the move cursor and the focus state",
    touch: "dragged with a finger; the same moves by buttons and keys",
  },
  address: {
    rest: "the browser's address, Back and Forward",
    hover: "the browser's own",
    touch: "the browser's own",
  },
};

const CUES = new Set(["element", "rest", "hover", "focus", "touch", "discover"]);

/** A cue that shows nothing at rest. */
export const invisible = (cue: string | undefined): boolean =>
  !cue || /^(none|nothing|invisible|hidden)\b/i.test(cue.trim());

/** The text of an @affordance tag as an affordance, `none` with its reason, or an error saying what is wrong with it. */
export function parseAffordance(text: string): Affordance | NoAffordance | { error: string } {
  // A cue begins after a semicolon, or on a line of its own; a line that goes on with the same cue is joined.
  const parts = text.replace(/\n\s*(?=(?:rest|hover|focus|touch|discover):)/gi, ";").split(";").map((p) =>
    p.replace(/\s+/g, " ").trim()
  ).filter(Boolean);
  if (!parts.length) return { error: "@affordance says nothing: name the element that offers it, or none: why" };
  const head = /^([a-z]+):\s*(.*)$/i.exec(parts[0]!);
  const first = head?.[1]?.toLowerCase();
  if (first === "none") {
    return head![2] ? { none: head![2]! } : { error: "@affordance none: say why no person takes it" };
  }
  const known = !!first && Object.hasOwn(KINDS, first);
  if (head && !known && !CUES.has(first!)) {
    return { error: `@affordance ${first}: not a kind of the widget set (${Object.keys(KINDS).join(", ")})` };
  }
  const kind = known ? first! : "custom";
  const out: Affordance = { kind, element: known || first === "element" ? head![2]! : parts[0]! };
  const said: Partial<Record<"rest" | "hover" | "touch" | "discover", string>> = {};
  for (const p of parts.slice(1)) {
    const m = /^([a-z]+):\s*(.+)$/i.exec(p);
    const key = m?.[1]?.toLowerCase();
    if (!m || !key || !CUES.has(key) || key === "element") {
      return { error: `@affordance: "${p}" is not a cue (rest, hover, touch, discover)` };
    }
    said[key === "focus" ? "hover" : key as "rest" | "hover" | "touch" | "discover"] = m[2]!;
  }
  const preset = known ? KINDS[kind]! : {};
  for (const cue of ["rest", "hover", "touch", "discover"] as const) {
    const v = said[cue] ?? preset[cue];
    if (v) out[cue] = v;
  }
  if (!out.element) return { error: "@affordance: name the element that offers it" };
  return out;
}

/** What is missing from an affordance for a person to see or find the action, one line each. */
export function affordanceGaps(a: Affordance): string[] {
  const gaps: string[] = [];
  for (const cue of ["rest", "hover", "touch"] as const) {
    if (!a[cue]) {
      gaps.push(`says no cue ${cue === "rest" ? "at rest" : cue === "hover" ? "on hover or focus" : "on touch"}`);
    }
  }
  if (a.rest && invisible(a.rest) && !a.discover) {
    gaps.push("shows nothing at rest and says nothing of how a person discovers it (discover: ...)");
  }
  return gaps;
}
