/** One thing a check found. `problem` fails the check; `note` is reported and does not. */
export interface Finding {
  check: string;
  level: "problem" | "note";
  file?: string;
  line?: number;
  message: string;
}

/** The 1-based line of a character offset. */
export function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

export const describe = (f: Finding): string =>
  `${f.level === "problem" ? "problem" : "note"} [${f.check}] ${f.file ?? ""}${f.line ? `:${f.line}` : ""}${
    f.file ? ": " : ""
  }${f.message}`;
