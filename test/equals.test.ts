// Rule 28, phone and desktop are equals: each of its five checks refuses the page that breaks it, and passes the page
// that keeps it.
import { assert } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { runChecks } from "../checks/run.ts";
import { EQUALS_CHECKS } from "../checks/equals.ts";

const root = fromFileUrl(new URL("./fixtures/equals", import.meta.url));

Deno.test("each check of phone-and-desktop parity refuses the page that breaks it and passes the one that keeps it", async () => {
  const fs = (await runChecks(root, [...EQUALS_CHECKS])).filter((f) => f.level === "problem");
  const dump = JSON.stringify(fs, null, 1);
  const good = fs.filter((f) => f.file === "pages/good.html");
  assert(good.length === 0, `the good page passes:\n${JSON.stringify(good, null, 1)}`);
  const has = (check: string, text: string) =>
    assert(
      fs.some((f) => f.check === check && f.file === "pages/bad.html" && f.message.includes(text)),
      `${check}: ${text}\n${dump}`,
    );
  has("action-parity", "a.desktopOnly is reached on light, 1280 mouse");
  has("action-parity", "but not on light, 375 touch");
  has("hover-only", '.row:hover .actions shows span "Delete" only on hover');
  has("hover-only", "on hover only: a tap does not show it");
  has("keyboard-viewport", "outside the");
  has("keyboard-viewport", "has no enterkeyhint");
  has("phone-layout", "is not a bar at the bottom of the window");
  has("phone-layout", "as a popover by the control");
  has("phone-layout", "show its rows as cards");
  has("phone-layout", "put it in the bottom third");
  has("desktop-keys", 'div "Clickable box" takes a click but not the keyboard');
  has("desktop-keys", "Escape does not close");
  has("desktop-keys", "pressing ? opens no Keyboard shortcuts sheet");
});
