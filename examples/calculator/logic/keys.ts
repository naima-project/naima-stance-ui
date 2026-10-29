// The calculator's keys: what each one is called, and which key of a keyboard presses it. Data only;
// what a key does is the control's decision.
export type Key =
  | { readonly type: "digit"; readonly digit: number }
  | { readonly type: "operator"; readonly op: "ADD" | "SUB" | "MUL" | "DIV" }
  | { readonly type: "point" | "equals" | "clear" | "back" | "negate" };

const OPS = { "+": "ADD", "-": "SUB", "*": "MUL", "x": "MUL", "/": "DIV" } as const;

/** The calculator key a keyboard key presses (KeyboardEvent.key), or null for any other key. */
export function keyFor(key: string): Key | null {
  if (/^[0-9]$/.test(key)) return { type: "digit", digit: Number(key) };
  if (key in OPS) return { type: "operator", op: OPS[key as keyof typeof OPS] };
  if (key === "." || key === ",") return { type: "point" };
  if (key === "=" || key === "Enter") return { type: "equals" };
  if (key === "Escape" || key === "Delete" || key === "c" || key === "C") return { type: "clear" };
  if (key === "Backspace") return { type: "back" };
  if (key === "_" || key === "F9") return { type: "negate" };
  return null;
}

/** A stable name for a key, to match the key on screen with the keyboard key that pressed it. */
export function keyId(k: Key): string {
  return k.type === "digit" ? `d${k.digit}` : k.type === "operator" ? k.op : k.type;
}
