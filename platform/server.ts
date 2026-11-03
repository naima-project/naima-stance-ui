// The stance's web server, for an app that needs a backend: the built page as static files, and the platform
// bridge's contract over HTTP (bridge-handler.ts: commands at POST /bridge/<command>, feeds at GET /bridge/<feed>).
// It runs on Deno, like Naima and the stance's own tooling.
//
//   import { serveBridge } from "./bridge-server.ts";
//   serveBridge({ handlers: { describe: () => ({ platform: Deno.build.os }) }, static: "dist", port: 8000 });
//
// Until this release the bridge was called the platform port, and its commands lived at /port/. Without a prefix
// given, the server still answers there too, and portHandler, servePort and PortServerOptions remain as deprecated
// aliases, for one more release.

import { serveDir } from "@std/http/file-server";
import { bridgeHandler as handle, type BridgeHandlerOptions } from "./bridge-handler.ts";

export type { Feeds, Handlers, Json } from "./bridge-handler.ts";

export interface BridgeServerOptions extends Omit<BridgeHandlerOptions, "otherwise"> {
  /** The folder of the built page; without one, only the bridge is served. */
  static?: string;
}

/** @deprecated Use `BridgeServerOptions`. */
export type PortServerOptions = BridgeServerOptions;

/** The request handler: the bridge, and the built page for every other request. */
export function bridgeHandler(options: BridgeServerOptions): (req: Request) => Promise<Response> {
  const { static: fsRoot, ...bridge } = options;
  return handle(fsRoot ? { ...bridge, otherwise: (req) => serveDir(req, { fsRoot, quiet: true }) } : bridge);
}

/** Serves the page and the bridge on `port` (8000 by default) until the process ends. */
export function serveBridge(options: BridgeServerOptions & { port?: number; hostname?: string }): Deno.HttpServer {
  return Deno.serve({ port: options.port ?? 8000, hostname: options.hostname ?? "127.0.0.1" }, bridgeHandler(options));
}

/** @deprecated Use `bridgeHandler`. */
export const portHandler = bridgeHandler;

/** @deprecated Use `serveBridge`. */
export const servePort = serveBridge;
