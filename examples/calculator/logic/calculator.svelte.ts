// The calculator: the generated control machine and the registers, composed. The control decides what
// every key does and when; its outputs carry the data steps to the registers, and the registers' verdict
// on a calculation goes back to the control as its input c_ok or c_fault. Nothing here is UI: components
// read `view` and call `press`.
import { Control } from "./generated/typescript/control/control.svelte.ts";
import type { Op, Phase } from "./generated/typescript/control/control.svelte.ts";
import * as R from "./registers.ts";
import { type Key, keyFor, keyId } from "./keys.ts";
import * as V from "./view.ts";
import type { CalculatorView } from "./view.ts";

export type { CalculatorView, Key, Op, Phase };

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
      reset: () => (this.#registers = R.reset(this.#registers)),
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
        return V.pending(control.phase, control.op);
      },
      get fault() {
        return registers().fault;
      },
      get display() {
        return V.display(control.phase, registers());
      },
      get expression() {
        return V.expression(control.phase, control.op, registers());
      },
      get entry() {
        return registers().entries;
      },
      get spoken() {
        return V.spoken(control.phase, control.op, registers());
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
