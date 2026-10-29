// The calculator example's logic, without Svelte: the generated control's step function, driven as
// calculator.svelte.ts drives it (its outputs carried out on the registers, a calculation's verdict
// sent back as c_ok or c_fault), and the registers' arithmetic and formatting.
import { assertEquals } from "@std/assert";
import * as C from "../examples/calculator/logic/generated/typescript/control/control.ts";
import * as R from "../examples/calculator/logic/registers.ts";
import { type Key, keyFor } from "../examples/calculator/logic/keys.ts";

/** Presses keys on a fresh calculator and returns what the display shows. */
function run(keys: string): { phase: C.Phase; display: string } {
  let regs = R.empty;
  let st = C.initial({ limit: 12 }).state;
  const send = (ev: C.Event) => {
    const r = C.step(st, ev);
    if (r === null) return;
    st = r.state;
    for (const a of r.actions) {
      if (a.type === "enter") regs = R.enter(regs, a.digit, a.fresh);
      else if (a.type === "dot") regs = R.dot(regs, a.fresh);
      else if (a.type === "drop") regs = R.drop(regs);
      else if (a.type === "flip") regs = R.flip(regs);
      else if (a.type === "reset") regs = R.reset();
      else if (a.type === "apply") {
        regs = R.apply(regs, a.op);
        send({ type: regs.fault ? "fault" : "ok" });
      }
    }
  };
  for (const name of keys.split(" ")) {
    const k = keyFor(name) as Key;
    if (k.type === "digit") send({ type: "digit", digit: k.digit });
    else if (k.type === "operator") send({ type: "operator", op: k.op });
    else send({ type: k.type } as C.Event);
  }
  const phase = st.phase;
  const display = regs.fault
    ? regs.fault
    : phase === "FIRST" || phase === "SECOND"
    ? R.formatTyped(regs.typed, regs.negative)
    : regs.value
    ? R.format(regs.value)
    : "0";
  return { phase, display };
}

Deno.test("the four operations, chained left to right", () => {
  assertEquals(run("1 2 + 3 0 =").display, "42");
  assertEquals(run("7 - 1 0 =").display, "−3");
  assertEquals(run("2 * 3 + 4 =").display, "10");
  assertEquals(run("9 / 4 =").display, "2.25");
});

Deno.test("results stay exact until shown: one third times three is one", () => {
  assertEquals(run("1 / 3 =").display, "0.33333333333");
  assertEquals(run("1 / 3 * 3 =").display, "1");
});

Deno.test("division by zero and numbers too large end in a fault, cleared by the next number", () => {
  assertEquals(run("5 / 0 =").display, "divide-by-zero");
  assertEquals(run("9 9 9 9 9 9 9 9 9 9 9 9 * 1 0 =").display, "too-large");
  assertEquals(run("5 / 0 = 4").display, "4");
  assertEquals(run("5 / 0 = +").phase, "FAULT");
});

Deno.test("keys that cannot act now change nothing", () => {
  assertEquals(run("1 . 5 . 2").display, "1.52");
  assertEquals(run("4 + =").display, "4");
  assertEquals(run("0 0 0 7").display, "7");
  assertEquals(run("1 2 3 Backspace").display, "12");
});

Deno.test("an operand holds at most twelve digits", () => {
  assertEquals(run("1 2 3 4 5 6 7 8 9 0 1 2 3 4").display, "123,456,789,012");
});

Deno.test("sign change, after a result too", () => {
  assertEquals(run("5 _ + 2 =").display, "−3");
  assertEquals(run("6 * 7 = _").display, "−42");
});
