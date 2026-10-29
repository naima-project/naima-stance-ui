// What the calculator shows, read from the control's phase and operator and from the registers. Plain
// TypeScript with no Svelte: calculator.svelte.ts reads its view through it, and the tests read it the same way.
import type { Op, Phase } from "./generated/typescript/control/control.ts";
import * as R from "./registers.ts";

export interface CalculatorView {
  readonly phase: Phase;
  /** The operator waiting for its second operand, for the key that shows it. */
  readonly pending: Op;
  /** The main line: the number typed, the running value or the result, or what went wrong. */
  readonly display: string;
  /** The quieter line above it: "12 +" while the second operand is awaited or typed, "12 + 7 =" after a result. */
  readonly expression: string;
  /**
   * Counts every key entered into an operand (a digit or the point), so the display marks each entry, even one
   * that leaves the number as it was: the 3 of 3 + 3 shows 3 where 3 already stood.
   */
  readonly entry: number;
  /** What a screen reader announces: the expression with the operand being typed, "3 + 3", or the result. */
  readonly spoken: string;
  readonly fault: R.Fault | null;
}

const FAULT_TEXT: Record<R.Fault, string> = { "divide-by-zero": "Can’t divide by zero", "too-large": "Too large" };

export function pending(phase: Phase, op: Op): Op {
  return phase === "AFTER_OP" || phase === "SECOND" ? op : "NONE";
}

export function display(phase: Phase, r: R.Registers): string {
  if (r.fault) return FAULT_TEXT[r.fault];
  if (phase === "FIRST" || phase === "SECOND") return R.formatTyped(r.typed, r.negative);
  return r.value ? R.format(r.value) : "0";
}

export function expression(phase: Phase, op: Op, r: R.Registers): string {
  if ((phase === "AFTER_OP" || phase === "SECOND") && op !== "NONE" && r.value) {
    return `${R.format(r.value)} ${R.SYMBOL[op]}`;
  }
  if (phase === "DONE" && r.last && r.last.op !== "NONE") {
    return `${R.format(r.last.left)} ${R.SYMBOL[r.last.op]} ${R.format(r.last.right)} =`;
  }
  return "";
}

/** After an operator only the expression is new ("3 +"); otherwise the expression and the main line. */
export function spoken(phase: Phase, op: Op, r: R.Registers): string {
  const e = expression(phase, op, r);
  if (phase === "AFTER_OP" && e) return e;
  return e ? `${e} ${display(phase, r)}` : display(phase, r);
}
