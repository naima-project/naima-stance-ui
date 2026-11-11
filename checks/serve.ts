// The file server the browser checks open the app's pages from: the project's root over HTTP on the loopback address,
// answering as a real server does, with the text files compressed (gzip) when the browser asks for it
// (Accept-Encoding). The mobile profile's largest-paint time is measured over a slow network, so what the server
// sends is what its time counts; the size budget counts the same files compressed with gzip, and the two then describe
// one transfer (a page served raw would be timed over about three times the bytes the budget counts).

import { serveDir } from "@std/http/file-server";

/** The types of the files worth compressing: text, not images or fonts, which are compressed already. */
const COMPRESSED = /^(text\/|application\/(javascript|json|manifest\+json|xml)|image\/svg\+xml)/;

/** The answer to `req`: the file of `root` it names, gzip-compressed when its type is text and the browser accepts gzip. */
export async function serveFiles(req: Request, root: string): Promise<Response> {
  const answer = await serveDir(req, { fsRoot: root, quiet: true });
  const type = answer.headers.get("content-type") ?? "";
  const accepts = /\bgzip\b/.test(req.headers.get("accept-encoding") ?? "");
  if (
    !accepts || answer.status !== 200 || !answer.body || !COMPRESSED.test(type) ||
    answer.headers.has("content-encoding")
  ) return answer;
  const headers = new Headers(answer.headers);
  headers.set("content-encoding", "gzip");
  headers.append("vary", "Accept-Encoding");
  headers.delete("content-length");
  return new Response(req.method === "HEAD" ? null : answer.body.pipeThrough(new CompressionStream("gzip")), {
    status: 200,
    headers,
  });
}
