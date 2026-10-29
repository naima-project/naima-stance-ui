// The calculator example's logic, without Svelte: the generated control's step function, driven as
// calculator.svelte.ts drives it (its outputs carried out on the registers, a calculation's verdict
// sent back as c_ok or c_fault), and the registers' arithmetic and formatting.
import { assertEquals } from "@std/assert";
import * as C from "../examples/calculator/logic/generated/typescript/control/control.ts";
import * as R from "../examples/calculator/logic/registers.ts";
import { type Key, keyFor } from "../examples/calculator/logic/keys.ts";
import * as V from "../examples/calculator/logic/view.ts";

/** Presses keys on a fresh calculator and returns what the display shows, its lines read as the view reads them. */
function run(
  keys: string,
): { phase: C.Phase; display: string; expression: string; spoken: string; entry: number } {
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
      else if (a.type === "reset") regs = R.reset(regs);
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
  const display = regs.fault ? regs.fault : V.display(phase, regs);
  return {
    phase,
    display,
    expression: V.expression(phase, st.op, regs),
    spoken: V.spoken(phase, st.op, regs),
    entry: regs.entries,
  };
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

Deno.test("a new operand is always visible: 3 + 3 shows the expression and marks the second 3", () => {
  const before = run("3 +");
  assertEquals([before.display, before.expression, before.spoken], ["3", "3 +", "3 +"]);
  const after = run("3 + 3");
  assertEquals([after.phase, after.display, after.expression, after.spoken], ["SECOND", "3", "3 +", "3 + 3"]);
  // The second 3 leaves the main line as it was, so the entry counter is what marks it.
  assertEquals(after.entry, before.entry + 1);
  assertEquals(run("3 + 3 =").spoken, "3 + 3 = 6");
  // An entry is counted across a clear and a fault too, so the next one is marked as well.
  assertEquals(run("5 Escape 5").entry, 2);
  assertEquals(run("1 / 0 = 1").entry, 3);
  // A key past the digit limit enters nothing, and is not marked.
  assertEquals(run("1 2 3 4 5 6 7 8 9 0 1 2 3").entry, 12);
});
