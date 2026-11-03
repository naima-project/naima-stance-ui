// The platform bridge: how the app's machines reach whatever lies outside the page. It is the only part of an
// app that differs by platform. The machines never see which one they run on: their outputs call `call`,
// and an answer comes back as one of their inputs.
//
//   web, pure client   localBridge(handlers): the handlers run in the page, no server at all
//   web, with backend  webBridge(url): POST <url>/<command> with the arguments as JSON, the answer as JSON;
//                      the stance's server (platform/server.ts, on Deno) speaks exactly this
//   Tauri 2            tauriBridge(): invoke(command, arguments), answered by the shell's Rust commands
//
// connect() picks one: Tauri when the page runs inside a Tauri webview, else the server when one is named,
// else the local handlers.
//
// Until this release it was called the platform port; port.ts keeps the old names, deprecated, for one more release.

import { invoke } from "@tauri-apps/api/core";

/** Arguments and answers cross the bridge as JSON. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface Bridge {
  /** Which implementation this is, for logs and for the app to say where it runs. */
  readonly kind: "local" | "web" | "tauri";
  /** Runs a command outside the page and resolves with its answer; rejects when the command fails. */
  call<T extends Json = Json>(command: string, args?: { [key: string]: Json }): Promise<T>;
}

/** A command answered in the page: the pure client app's whole backend, and the fallback of every platform. */
export type Handlers = { [command: string]: (args: { [key: string]: Json }) => Json | Promise<Json> };

export class BridgeError extends Error {
  constructor(readonly command: string, message: string) {
    super(`${command}: ${message}`);
  }
}

/** The pure client bridge: every command is answered in the page, by `handlers`. */
export function localBridge(handlers: Handlers): Bridge {
  return {
    kind: "local",
    async call<T extends Json>(command: string, args: { [key: string]: Json } = {}) {
      const h = handlers[command];
      if (!h) throw new BridgeError(command, "no such command");
      return (await h(args)) as T;
    },
  };
}

/** The web bridge: each command is a POST to the server, `<base>/<command>`, with JSON in and out. */
export function webBridge(base: string, fetcher: typeof fetch = fetch): Bridge {
  const root = base.replace(/\/+$/, "");
  return {
    kind: "web",
    async call<T extends Json>(command: string, args: { [key: string]: Json } = {}) {
      const res = await fetcher(`${root}/${encodeURIComponent(command)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      });
      const body = await res.json().catch(() => null) as { ok?: Json; error?: string } | null;
      if (!res.ok || body === null || !("ok" in body)) {
        throw new BridgeError(command, body?.error ?? `the server answered ${res.status}`);
      }
      return body.ok as T;
    },
  };
}

/** The Tauri bridge: each command is a Rust command of the shell, reached with invoke. */
export function tauriBridge(): Bridge {
  return {
    kind: "tauri",
    async call<T extends Json>(command: string, args: { [key: string]: Json } = {}) {
      try {
        return await invoke<T>(command, args);
      } catch (e) {
        throw new BridgeError(command, typeof e === "string" ? e : String(e));
      }
    },
  };
}

/** True inside a Tauri 2 webview, which defines its internals on the window before the page runs. */
export const inTauri = (): boolean => typeof globalThis === "object" && "__TAURI_INTERNALS__" in globalThis;

/** The bridge for where the page runs: Tauri inside a Tauri webview, else the server if named, else local. */
export function connect(options: { handlers?: Handlers; server?: string } = {}): Bridge {
  if (inTauri()) return tauriBridge();
  if (options.server) return webBridge(options.server);
  return localBridge(options.handlers ?? {});
}
