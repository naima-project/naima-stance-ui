// The calculator's end-to-end script, the same on every platform: it waits until the app is ready (the
// platform port has said where it runs), presses 1 + 2 = on the keypad, and reads the display. It is one
// JavaScript expression whose value is a promise of { ok, says }, evaluated inside the page by whatever
// drives it: Playwright on the web, WebDriver through tauri-driver, or the Tauri shell itself when
// STANCE_UI_E2E holds it (see the README's "Platforms").
(async () => {
  const until = async (what, test, ms = 15000) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = test();
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const where = await until("the app to say where it runs", () => document.querySelector(".host")?.textContent?.trim());
  const press = (name) => {
    const key = document.querySelector(`button[aria-label="${name}"]`);
    if (!key) throw new Error(`no key named ${name}`);
    key.click();
  };
  const tick = () => new Promise((r) => setTimeout(r, 50)); // the page updates after each press, not during it
  for (const name of ["All clear", "1", "Add", "2", "Equals"]) {
    press(name);
    await tick();
  }
  const display = () => document.querySelector("output .value")?.textContent?.trim() ?? "";
  await until("the result", () => display() === "3", 3000).catch(() => {});
  return { ok: display() === "3", says: `${where}: 1 + 2 = ${display()}` };
})();
