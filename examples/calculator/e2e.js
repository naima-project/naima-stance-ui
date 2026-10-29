// The calculator's end-to-end script, the same on every platform: it waits until the app is ready (the
// platform port has said where it runs), presses 1 + 2 = on the keypad, and reads the display. It is one
// JavaScript expression whose value is a promise of { ok, says }, evaluated inside the page by whatever
// drives it: Playwright on the web, WebDriver through tauri-driver, or the Tauri shell itself when
// STANCE_UI_E2E holds it (see the README's "Platforms").
//
// It waits on the page's own changes (a MutationObserver), never on timers alone: a webview whose window is
// not in front may hold its timers back.
(async () => {
  const until = (what, test, ms = 15000) =>
    new Promise((resolve, reject) => {
      const now = test();
      if (now) return resolve(now);
      const observer = new MutationObserver(() => {
        const v = test();
        if (v) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(v);
        }
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true });
      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`timed out waiting for ${what}`));
      }, ms);
    });
  const display = () => document.querySelector("output .value")?.textContent?.trim() ?? "";
  const where = await until("the app to say where it runs", () => document.querySelector(".host")?.textContent?.trim());
  const press = async (name, shows) => {
    const key = document.querySelector(`button[aria-label="${name}"]`);
    if (!key) throw new Error(`no key named ${name}`);
    key.click();
    await until(`${shows} on the display after ${name}`, () => display() === shows, 3000);
  };
  await press("AC, all clear", "0");
  await press("1", "1");
  await press("Add", "1");
  await press("2", "2");
  await press("Equals", "3").catch(() => {});
  return { ok: display() === "3", says: `${where}: 1 + 2 = ${display()}` };
})();
