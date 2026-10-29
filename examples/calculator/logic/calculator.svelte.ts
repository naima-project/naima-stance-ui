// The calculator: the generated control machine and the registers, composed. The control decides what
// every key does and when; its outputs carry the data steps to the registers, and the registers' verdict
// on a calculation goes back to the control as its input c_ok or c_fault. Nothing here is UI: components
// read `view` and call `press`.
import { Control } from "./generated/typescript/control/control.svelte.ts";
import type { Op, Phase } from "./generated/typescript/control/control.svelte.ts";
import * as R from "./registers.ts";
import { type Key, keyFor, keyId } from "./keys.ts";

export type { Key, Op, Phase };

export interface CalculatorView {
  readonly phase: Phase;
  /** The operator waiting for its second operand, for the key that shows it. */
  readonly pending: Op;
  /** The main line: the number typed, the running value or the result, or what went wrong. */
  readonly display: string;
  /** The line above it: "12 +" while the second operand is awaited, "12 + 7 =" after a result. */
  readonly expression: string;
  readonly fault: R.Fault | null;
}

const FAULT_TEXT: Record<R.Fault, string> = { "divide-by-zero": "Can’t divide by zero", "too-large": "Too large" };

export class Calculator {
  readonly view: CalculatorView;
  readonly #control: Control;
  #registers: R.Registers = $state.raw(R.empty);

  constructor(config: { digits?: number } = {}) {
    // The port: the control's outputs, carried out on the registers. A calculation's verdict is an input.
    this.#control = new Control({ limit: config.digits ?? R.DIGITS }, {
      enter: (digit, fresh) => (this.#registers = R.enter(this.#registers, digit, fresh)),
      dot: (fresh) => (this.#registers = R.dot(this.#registers, fresh)),
      drop: () => (this.#registers = R.drop(this.#registers)),
      flip: () => (this.#registers = R.flip(this.#registers)),
      reset: () => (this.#registers = R.reset()),
      apply: (op) => {
        this.#registers = R.apply(this.#registers, op);
        if (this.#registers.fault) this.#control.fault();
        else this.#control.ok();
      },
    });
    const control = this.#control.view;
    const registers = () => this.#registers;
    this.view = {
      get phase() {
        return control.phase;
      },
      get pending() {
        return control.phase === "AFTER_OP" || control.phase === "SECOND" ? control.op : "NONE";
      },
      get fault() {
        return registers().fault;
      },
      get display() {
        const r = registers();
        if (r.fault) return FAULT_TEXT[r.fault];
        if (control.phase === "FIRST" || control.phase === "SECOND") return R.formatTyped(r.typed, r.negative);
        return r.value ? R.format(r.value) : "0";
      },
      get expression() {
        const r = registers();
        if ((control.phase === "AFTER_OP" || control.phase === "SECOND") && control.op !== "NONE" && r.value) {
          return `${R.format(r.value)} ${R.SYMBOL[control.op]}`;
        }
        if (control.phase === "DONE" && r.last && r.last.op !== "NONE") {
          return `${R.format(r.last.left)} ${R.SYMBOL[r.last.op]} ${R.format(r.last.right)} =`;
        }
        return "";
      },
    };
  }

  /** Presses the key a keyboard key stands for (KeyboardEvent.key); returns its id, or null for another key. */
  keyboard(name: string): string | null {
    const key = keyFor(name);
    if (key === null) return null;
    this.press(key);
    return keyId(key);
  }

  /** Presses a key. Every key is taken: one that cannot act now changes nothing, as on a pocket calculator. */
  press(key: Key): void {
    const c = this.#control;
    switch (key.type) {
      case "digit":
        c.digit(key.digit);
        break;
      case "operator":
        c.operator(key.op);
        break;
      case "point":
        c.point();
        break;
      case "equals":
        c.equals();
        break;
      case "clear":
        c.clear();
        break;
      case "back":
        c.back();
        break;
      case "negate":
        c.negate();
        break;
    }
  }
}
