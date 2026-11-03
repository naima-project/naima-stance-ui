// The platform bridge: how the app's machines reach whatever lies outside the page. It is the only part of an
// app that differs by platform. The machines never see which one they run on: their outputs call `call`,
// and an answer comes back as one of their inputs. What the backend pushes on its own, such as "the data
// changed", comes through `listen` on a named feed, and each event is again one of a machine's inputs.
//
//   web, pure client   localBridge(handlers, feeds): the handlers and the feeds run in the page, no server at all
//   web, with backend  webBridge(url): POST <url>/<command> with the arguments as JSON, the answer as JSON;
//                      a feed is GET <url>/<feed>, a stream of server-sent events, one JSON event each;
//                      the stance's server (platform/server.ts, on Deno) speaks exactly this
//   Tauri 2            tauriBridge(): invoke(command, arguments), answered by the shell's Rust commands;
//                      a feed is the Tauri event of the same name, which the shell emits
//
// connect() picks one: Tauri when the page runs inside a Tauri webview, else the server when one is named,
// else the local handlers.
//
// Until this release it was called the platform port; port.ts keeps the old names, deprecated, for one more release.

import { invoke } from "@tauri-apps/api/core";
import { listen as listenTauri } from "@tauri-apps/api/event";

/** Arguments and answers cross the bridge as JSON. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface Bridge {
  /** Which implementation this is, for logs and for the app to say where it runs. */
  readonly kind: "local" | "web" | "tauri";
  /** Runs a command outside the page and resolves with its answer; rejects when the command fails. */
  call<T extends Json = Json>(command: string, args?: { [key: string]: Json }): Promise<T>;
  /** Hears each event the backend pushes on `feed` until the function it returns is called. */
  listen<T extends Json = Json>(feed: string, on: (event: T) => void): () => void;
}

/** A command answered in the page: the pure client app's whole backend, and the fallback of every platform. */
export type Handlers = { [command: string]: (args: { [key: string]: Json }) => Json | Promise<Json> };

/** A feed produced in the page: it starts emitting when listened to, and stops when the function it returns is called. */
export type Feeds = { [feed: string]: (emit: (event: Json) => void) => () => void };

export class BridgeError extends Error {
  constructor(readonly command: string, message: string) {
    super(`${command}: ${message}`);
  }
}

/** The pure client bridge: every command is answered in the page, by `handlers`, and every feed made there, by `feeds`. */
export function localBridge(handlers: Handlers, feeds: Feeds = {}): Bridge {
  return {
    kind: "local",
    async call<T extends Json>(command: string, args: { [key: string]: Json } = {}) {
      const h = handlers[command];
      if (!h) throw new BridgeError(command, "no such command");
      return (await h(args)) as T;
    },
    listen<T extends Json>(feed: string, on: (event: T) => void) {
      const f = feeds[feed];
      if (!f) throw new BridgeError(feed, "no such feed");
      return f((event) => on(event as T));
    },
  };
}

/** How webBridge opens a feed's stream, handing on each event's data: with the browser's EventSource, or a stand-in. */
export type FeedSource = (url: string, data: (text: string) => void) => { close(): void };

const eventSource: FeedSource = (url, data) => {
  const events = new EventSource(url);
  events.onmessage = (e) => data(e.data);
  return events;
};

/**
 * The web bridge: each command is a POST to the server, `<base>/<command>`, with JSON in and out; each feed a stream of
 * server-sent events from `<base>/<feed>`, which the browser reconnects by itself when the connection drops.
 */
export function webBridge(
  base: string,
  fetcher: typeof fetch = fetch,
  source: FeedSource = eventSource,
): Bridge {
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
    listen<T extends Json>(feed: string, on: (event: T) => void) {
      const events = source(`${root}/${encodeURIComponent(feed)}`, (text) => on(JSON.parse(text) as T));
      return () => events.close();
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
    listen<T extends Json>(feed: string, on: (event: T) => void) {
      const stop = listenTauri<T>(feed, (e) => on(e.payload));
      return () => void stop.then((unlisten) => unlisten());
    },
  };
}

/** True inside a Tauri 2 webview, which defines its internals on the window before the page runs. */
export const inTauri = (): boolean => typeof globalThis === "object" && "__TAURI_INTERNALS__" in globalThis;

/** The bridge for where the page runs: Tauri inside a Tauri webview, else the server if named, else local. */
export function connect(options: { handlers?: Handlers; feeds?: Feeds; server?: string } = {}): Bridge {
  if (inTauri()) return tauriBridge();
  if (options.server) return webBridge(options.server);
  return localBridge(options.handlers ?? {}, options.feeds ?? {});
}
