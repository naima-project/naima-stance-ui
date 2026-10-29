// The calculator's registers: the numbers, as exact rationals, and the arithmetic on them. Plain
// TypeScript with no Svelte and no imports: every function takes a state and returns the next one.
//
// The registers are the data half of the calculator; the control half is the generated machine of
// control.svelte.ts, whose outputs drive these functions. Numbers are kept exact (1 ÷ 3 × 3 is 1) and
// rounded only when shown, to at most `DIGITS` significant digits.

/** How many digits the display shows: the same limit the control puts on a typed operand. */
export const DIGITS = 12;

/** A rational number n / d, reduced, with d > 0. */
export interface Rat {
  readonly n: bigint;
  readonly d: bigint;
}

export type Op = "NONE" | "ADD" | "SUB" | "MUL" | "DIV";
export type Fault = "divide-by-zero" | "too-large";

/** The registers: what has been typed, the running value, and the last fault. */
export interface Registers {
  /** The operand being typed, as typed: digits and at most one point; empty before the first key. */
  readonly typed: string;
  /** Whether the operand being typed is negative. */
  readonly negative: boolean;
  /** The running value: the first operand, the total so far, or the last result. */
  readonly value: Rat | null;
  /** The last operation that ran, for the expression line: "12 + 7 =". */
  readonly last: { readonly left: Rat; readonly op: Op; readonly right: Rat } | null;
  readonly fault: Fault | null;
}

export const empty: Registers = { typed: "", negative: false, value: null, last: null, fault: null };

const ZERO: Rat = { n: 0n, d: 1n };
const abs = (x: bigint) => (x < 0n ? -x : x);
function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}
function rat(n: bigint, d: bigint): Rat {
  if (d < 0n) [n, d] = [-n, -d];
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}

/** The typed operand as a number ("" and "." are 0). */
export function parse(typed: string, negative: boolean): Rat {
  const [whole = "", frac = ""] = typed.split(".");
  const digits = (whole + frac).replace(/^0+(?=\d)/, "") || "0";
  const n = BigInt(digits) * (negative ? -1n : 1n);
  return rat(n, 10n ** BigInt(frac.length));
}

function combine(a: Rat, op: Op, b: Rat): Rat | Fault {
  switch (op) {
    case "ADD":
      return rat(a.n * b.d + b.n * a.d, a.d * b.d);
    case "SUB":
      return rat(a.n * b.d - b.n * a.d, a.d * b.d);
    case "MUL":
      return rat(a.n * b.n, a.d * b.d);
    case "DIV":
      return b.n === 0n ? "divide-by-zero" : rat(a.n * b.d, a.d * b.n);
    case "NONE":
      return b;
  }
}

/** Whether a value's whole part has more digits than the display shows. */
function tooLarge(r: Rat): boolean {
  return abs(r.n) / r.d >= 10n ** BigInt(DIGITS);
}

// ---- the outputs of the control, one function each

export function enter(s: Registers, digit: number, fresh: boolean): Registers {
  const base = fresh ? { ...s, typed: "", negative: false, fault: null, last: null } : s;
  const typed = base.typed === "0" ? String(digit) : base.typed + String(digit);
  return { ...base, typed };
}

export function dot(s: Registers, fresh: boolean): Registers {
  const base = fresh ? { ...s, typed: "", negative: false, fault: null, last: null } : s;
  return { ...base, typed: (base.typed === "" ? "0" : base.typed) + "." };
}

export function drop(s: Registers): Registers {
  const typed = s.typed.slice(0, -1);
  return { ...s, typed: typed === "0" ? "" : typed, negative: typed === "" ? false : s.negative };
}

/** Changes the sign of what is shown: the operand being typed, or the result. */
export function flip(s: Registers): Registers {
  if (s.typed !== "" || s.value === null) return { ...s, negative: !s.negative };
  return { ...s, value: { n: -s.value.n, d: s.value.d } };
}

/** Runs the pending operation on the running value and the typed operand. */
export function apply(s: Registers, op: Op): Registers {
  const right = s.typed === "" && s.value !== null && op === "NONE" ? s.value : parse(s.typed, s.negative);
  const left = s.value ?? ZERO;
  const r = op === "NONE" ? right : combine(left, op, right);
  if (typeof r === "string") return { ...empty, fault: r };
  if (tooLarge(r)) return { ...empty, fault: "too-large" };
  return { typed: "", negative: false, value: r, last: op === "NONE" ? s.last : { left, op, right }, fault: null };
}

export function reset(): Registers {
  return empty;
}

// ---- reading

/** A value as the display shows it: rounded to fit DIGITS significant digits, grouped by thousands. */
export function format(r: Rat): string {
  const negative = r.n < 0n;
  const n = abs(r.n);
  const whole = n / r.d;
  const wholeDigits = whole === 0n ? 0 : whole.toString().length;
  const places = Math.max(0, DIGITS - Math.max(wholeDigits, 1));
  const scale = 10n ** BigInt(places);
  // Round half away from zero at `places` decimals.
  const scaled = (n * scale * 2n + r.d) / (2n * r.d);
  const intPart = scaled / scale;
  let frac = (scaled % scale).toString().padStart(places, "0").replace(/0+$/, "");
  if (places === 0) frac = "";
  const body = group(intPart.toString()) + (frac ? "." + frac : "");
  return (negative && scaled !== 0n ? "−" : "") + body;
}

/** The typed operand as the display shows it, keeping a trailing point or zeros. */
export function formatTyped(typed: string, negative: boolean): string {
  const [whole = "", frac] = (typed === "" ? "0" : typed).split(".");
  const body = group(whole === "" ? "0" : whole) + (frac !== undefined ? "." + frac : "");
  return (negative ? "−" : "") + body;
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export const SYMBOL: Record<Exclude<Op, "NONE">, string> = { ADD: "+", SUB: "−", MUL: "×", DIV: "÷" };
