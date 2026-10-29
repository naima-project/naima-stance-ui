// The stance's rules are data: one Markdown file per rule in rules/, which this module reads for the plugin.
//
// A rule file starts with front matter between two lines `---`, then the rule's text, then a section `## Why` with
// its reason. The front matter is a strict subset of YAML, read line by line: one field per line, `name: value`, or
// `name:` followed by `  - value` lines for a list; a value is plain text, a double-quoted JSON string or a
// single-quoted YAML one. A plain value YAML would read differently (one holding ": " or " #", ending in ":", or
// starting with a quote or an indicator character) is refused, so every file is also valid YAML with the same
// meaning. Its fields:
//
//   name         the rule's name, the same as the file's
//   title        the rule in one line
//   audience     agents, people or everyone
//   strength     must or should
//   ack          optional: the phrase an agent gives back to acknowledge it
//   enforcedBy   optional: the Naima check that holds it
//   verifiedBy   the check that verifies it, or "agent" for a convention an agent verifies by review
//
// In the text and the reason, the lines of a paragraph are joined with spaces, and paragraphs are kept apart by a
// blank line.
//
// Plain JavaScript with only the runtime's own modules, like the plugin.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FIELDS = ["name", "title", "audience", "strength", "ack", "enforcedBy", "verifiedBy"];
const REQUIRED = ["name", "title", "audience", "strength", "verifiedBy"];
const AUDIENCES = ["agents", "people", "everyone"];
const STRENGTHS = ["must", "should"];
const INDICATORS = "-?:,[]{}#&*!|>%@`\"'";

/** One value: a quoted string, or plain text that YAML reads as the same text. */
function scalar(raw, where) {
  const v = raw.trim();
  if (v.startsWith('"')) {
    try {
      const s = JSON.parse(v);
      if (typeof s === "string") return s;
    } catch {
      // refused below
    }
    throw new Error(`${where}: ${v} is not a double-quoted string`);
  }
  if (v.startsWith("'")) {
    if (v.length < 2 || !v.endsWith("'")) throw new Error(`${where}: ${v} is not a single-quoted string`);
    const inner = v.slice(1, -1);
    if (inner.split("''").some((part) => part.includes("'"))) {
      throw new Error(`${where}: a quote inside a single-quoted string is written twice`);
    }
    return inner.split("''").join("'");
  }
  if (!v) throw new Error(`${where}: the value is empty`);
  if (v.includes(": ") || v.includes(" #") || v.endsWith(":") || INDICATORS.includes(v[0])) {
    throw new Error(`${where}: quote it — ${JSON.stringify(v)} is not plain text YAML reads the same way`);
  }
  return v;
}

const isName = (s) => s.length > 0 && [...s].every((c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z"));

/** The front matter of `text` as fields, and the text after it. */
export function parseFrontMatter(text) {
  const lines = text.split("\r\n").join("\n").split("\n");
  if (lines[0] !== "---") throw new Error("no front matter: the file starts with a line ---");
  const end = lines.indexOf("---", 1);
  if (end === -1) throw new Error("the front matter is not closed by a line ---");
  const fields = new Map();
  let list = null;
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    const where = `line ${i + 1}`;
    if (!line.trim()) continue;
    if (line.startsWith("  - ")) {
      if (!list) throw new Error(`${where}: a list entry belongs under a field that has no value on its own line`);
      list.push(scalar(line.slice(4), where));
      continue;
    }
    const colon = line.indexOf(":");
    const name = colon > 0 ? line.slice(0, colon) : "";
    if (!isName(name)) throw new Error(`${where}: expected "name: value", "name:" or "  - value"`);
    if (fields.has(name)) throw new Error(`${where}: ${name} is given twice`);
    const rest = line.slice(colon + 1);
    if (!rest.trim()) {
      list = [];
      fields.set(name, list);
    } else {
      if (!rest.startsWith(" ")) throw new Error(`${where}: a space follows the colon`);
      list = null;
      fields.set(name, scalar(rest, where));
    }
  }
  return { fields, body: lines.slice(end + 1).join("\n") };
}

/** Paragraphs as one line each, kept apart by a blank line. */
const paragraphs = (lines) =>
  lines.join("\n").split("\n\n").map((p) => p.split("\n").map((l) => l.trim()).filter(Boolean).join(" ")).filter(
    Boolean,
  ).join("\n\n");

/** The rule a file holds, as the rules point takes it; an error saying why when it is not one. */
export function parseRule(file, text) {
  const { fields, body } = parseFrontMatter(text);
  for (const key of fields.keys()) {
    if (!FIELDS.includes(key)) throw new Error(`${file}: ${key} is not a field of a rule: ${FIELDS.join(", ")}`);
  }
  for (const key of REQUIRED) if (!fields.has(key)) throw new Error(`${file}: ${key} is missing`);
  for (const [key, value] of fields) {
    if (typeof value !== "string") throw new Error(`${file}: ${key} is one value, not a list`);
  }
  const rule = Object.fromEntries(fields);
  if (!AUDIENCES.includes(rule.audience)) throw new Error(`${file}: audience is one of ${AUDIENCES.join(", ")}`);
  if (!STRENGTHS.includes(rule.strength)) throw new Error(`${file}: strength is one of ${STRENGTHS.join(", ")}`);
  const lines = body.split("\n");
  const at = lines.findIndex((l) => l.trim() === "## Why");
  if (at === -1) throw new Error(`${file}: no section "## Why" with the rule's reason`);
  if (lines.slice(at + 1).some((l) => l.startsWith("#"))) throw new Error(`${file}: "## Why" is the last section`);
  rule.text = paragraphs(lines.slice(0, at));
  rule.why = paragraphs(lines.slice(at + 1));
  if (!rule.text) throw new Error(`${file}: the rule has no text before "## Why"`);
  if (!rule.why) throw new Error(`${file}: "## Why" is empty`);
  return rule;
}

/** Every rule in `dir`, one per .md file, in the order of their names. */
export function readRules(dir) {
  return readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => {
    const rule = parseRule(f, readFileSync(join(dir, f), "utf8"));
    if (`${rule.name}.md` !== f) throw new Error(`${f}: its name is ${rule.name}: the file is named after the rule`);
    return rule;
  });
}
