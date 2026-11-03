// The stance's web server, for an app that needs a backend: the built page as static files, and the platform
// bridge's contract over HTTP. It runs on Deno, like Naima and the stance's own tooling.
//
//   POST <prefix>/<command>   body: the arguments as a JSON object
//     200 {"ok": <answer>}    the command's answer
//     404 {"error": "..."}    no such command
//     400 {"error": "..."}    the body is not a JSON object
//     500 {"error": "..."}    the command threw
//   GET  anything else        a file of the static folder, index.html for a folder
//
// The handlers are the same shape as the ones the page's localBridge runs, so a command can move from the
// page to the server without the machines noticing.
//
//   import { serveBridge } from "./bridge-server.ts";
//   serveBridge({ handlers: { describe: () => ({ platform: Deno.build.os }) }, static: "dist", port: 8000 });
//
// Until this release the bridge was called the platform port, and its commands lived at /port/. Without a prefix
// given, the server still answers there too, and portHandler, servePort and PortServerOptions remain as deprecated
// aliases, for one more release.

import { serveDir } from "@std/http/file-server";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Handlers = { [command: string]: (args: { [key: string]: Json }) => Json | Promise<Json> };

export interface BridgeServerOptions {
  handlers: Handlers;
  /** The folder of the built page; without one, only the bridge is served. */
  static?: string;
  /** Where the bridge's commands live, /bridge by default; the page's webBridge is given the same. */
  prefix?: string;
}

/** @deprecated Use `BridgeServerOptions`. */
export type PortServerOptions = BridgeServerOptions;

/** The prefix the bridge's commands lived at when it was called the port; answered for one more release. */
const LEGACY_PREFIX = "/port";

const json = (status: number, body: { ok: Json } | { error: string }) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The request handler, apart from Deno.serve, so that it can be tested and mounted elsewhere. */
export function bridgeHandler(options: BridgeServerOptions): (req: Request) => Promise<Response> {
  const prefixes = options.prefix === undefined ? ["/bridge", LEGACY_PREFIX] : [options.prefix.replace(/\/+$/, "")];
  return async (req) => {
    const path = new URL(req.url).pathname;
    const prefix = prefixes.find((p) => path.startsWith(p + "/"));
    if (prefix !== undefined) {
      if (req.method !== "POST") return json(405, { error: "the bridge takes POST" });
      const command = decodeURIComponent(path.slice(prefix.length + 1));
      const handler = Object.hasOwn(options.handlers, command) ? options.handlers[command] : undefined;
      if (!handler) return json(404, { error: `no such command: ${command}` });
      let args: unknown;
      try {
        const text = await req.text();
        args = text.trim() ? JSON.parse(text) : {};
      } catch {
        return json(400, { error: "the body is not JSON" });
      }
      if (typeof args !== "object" || args === null || Array.isArray(args)) {
        return json(400, { error: "the arguments are not a JSON object" });
      }
      try {
        return json(200, { ok: await handler(args as { [key: string]: Json }) });
      } catch (e) {
        return json(500, { error: e instanceof Error ? e.message : String(e) });
      }
    }
    if (options.static) return serveDir(req, { fsRoot: options.static, quiet: true });
    return new Response("not found", { status: 404 });
  };
}

/** Serves the page and the bridge on `port` (8000 by default) until the process ends. */
export function serveBridge(options: BridgeServerOptions & { port?: number; hostname?: string }): Deno.HttpServer {
  return Deno.serve({ port: options.port ?? 8000, hostname: options.hostname ?? "127.0.0.1" }, bridgeHandler(options));
}

/** @deprecated Use `bridgeHandler`. */
export const portHandler = bridgeHandler;

/** @deprecated Use `serveBridge`. */
export const servePort = serveBridge;
