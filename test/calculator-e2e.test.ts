/// <reference lib="dom" />
// The calculator example end to end: built, served on the loopback address, and pressed in headless Chromium
// (Playwright), in full motion and with reduced motion asked for.
import { assert, assertEquals } from "@std/assert";
import { serveDir } from "@std/http/file-server";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

Deno.test("the calculator shows a new operand: 3 + 3 shows “3 +” above and marks the second 3", async () => {
  const out = await new Deno.Command(Deno.execPath(), {
    args: ["task", "example:calculator:build"],
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  }).output();
  assertEquals(out.code, 0, new TextDecoder().decode(out.stderr));

  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen: () => {} },
    (req) => serveDir(req, { fsRoot: `${root}/examples/calculator/dist`, quiet: true }),
  );
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    for (const reducedMotion of ["no-preference", "reduce"] as const) {
      const context = await browser.newContext({ reducedMotion });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server.addr.port}/index.html`);
      // Every entry cue that starts, counted by the page itself.
      await page.evaluate(() => {
        const w = globalThis as unknown as { cues: number };
        w.cues = 0;
        document.addEventListener("animationstart", (e) => {
          if (/entry/.test(e.animationName)) w.cues++;
        });
      });
      const cues = () => page.evaluate(() => (globalThis as unknown as { cues: number }).cues);
      const key = (name: string) => page.locator(`button[aria-label="${name}"]`).click();
      const expression = page.locator("output .expression");
      const value = page.locator("output .value");
      const spoken = page.locator("output .spoken");

      await key("3");
      await key("Add");
      assertEquals((await expression.textContent())?.trim(), "3 +", reducedMotion);
      assertEquals((await value.textContent())?.trim(), "3");
      const before = await cues();
      const node = await value.locator(".digits").elementHandle();

      await key("3");
      assertEquals((await expression.textContent())?.trim(), "3 +", reducedMotion);
      assertEquals((await value.textContent())?.trim(), "3");
      // The number is entered anew (a new node, so assistive technology and the cue both see the entry).
      assert(await node!.evaluate((n) => !n.isConnected), "the second 3 left the number's node in place");
      await page.waitForFunction((n) => (globalThis as unknown as { cues: number }).cues > n, before, {
        timeout: 2000,
      });
      assertEquals(await spoken.textContent(), "3 + 3");
      if (reducedMotion === "reduce") {
        const moving = await page.locator("output .digits").evaluate((n) =>
          n.getAnimations().some((a) => Number(a.effect?.getComputedTiming().duration) > 0)
        );
        assert(!moving, "the entry cue moves although reduced motion is asked for");
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await server.shutdown();
  }
});
