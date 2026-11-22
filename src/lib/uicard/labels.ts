// A road's labels as the UI card's runtime fires them: a label's action is the machine's input method, its arguments
// the method's, read from mCRL2's text. Plain functions, no DOM.

/** An argument of a label as the machine's input method takes it: true, false, numbers, ids (`commit(0)` is 0), names. */
export function argOf(a: string): unknown {
  const t = a.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  const id = /^[a-z][A-Za-z0-9_]*\((-?\d+)\)$/.exec(t);
  if (id) return Number(id[1]);
  return t;
}

/** A label's action and arguments, split at the top level. */
export function parseLabel(label: string): { action: string; args: string[] } {
  const open = label.indexOf("(");
  if (open < 0) return { action: label.trim(), args: [] };
  const body = label.slice(open + 1, label.lastIndexOf(")"));
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      args.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (body.trim() !== "") args.push(body.slice(start).trim());
  return { action: label.slice(0, open).trim(), args };
}
