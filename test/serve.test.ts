import { assert, assertEquals } from "@std/assert";
import { serveFiles } from "../checks/serve.ts";

// The browser checks serve the pages as a real server does (bugs: the budget check served them uncompressed, so its
// largest-paint time counted raw bytes while its size budget counted gzip).
Deno.test("text files are served gzip-compressed when the browser accepts it, and raw otherwise", async () => {
  const root = await Deno.makeTempDir();
  const script = "console.log('x');\n".repeat(2000);
  await Deno.writeTextFile(`${root}/app.js`, script);
  await Deno.writeTextFile(`${root}/index.html`, "<p>page</p>");
  await Deno.writeFile(`${root}/pic.png`, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  const ask = (path: string, headers: Record<string, string>) =>
    serveFiles(new Request(`http://127.0.0.1/${path}`, { headers }), root);
  try {
    const packed = await ask("app.js", { "accept-encoding": "gzip, deflate, br" });
    assertEquals(packed.status, 200);
    assertEquals(packed.headers.get("content-encoding"), "gzip");
    assertEquals(packed.headers.get("content-length"), null);
    assert(/Accept-Encoding/i.test(packed.headers.get("vary") ?? ""));
    const body = await new Response(packed.body!.pipeThrough(new DecompressionStream("gzip"))).text();
    assertEquals(body, script);

    const html = await ask("index.html", { "accept-encoding": "gzip" });
    assertEquals(html.headers.get("content-encoding"), "gzip");
    await html.body?.cancel();

    const raw = await ask("app.js", {});
    assertEquals(raw.headers.get("content-encoding"), null);
    assertEquals(await raw.text(), script);

    const image = await ask("pic.png", { "accept-encoding": "gzip" });
    assertEquals(image.headers.get("content-encoding"), null);
    await image.body?.cancel();
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
