# Changelog

## Unreleased

### The platform port is now the platform bridge

The interface through which the app's machines reach whatever lies outside the page was called a port, after the
ports-and-adapters pattern, and read as a network port. It is now called a bridge everywhere in the stance.

- `src/lib/platform/port.ts` is now `src/lib/platform/bridge.ts`: `Port` is `Bridge`, `PortError` is `BridgeError`,
  `localPort`, `webPort` and `tauriPort` are `localBridge`, `webBridge` and `tauriBridge`. `connect()` keeps its name.
- `platform/server.ts`: `portHandler` and `servePort` are `bridgeHandler` and `serveBridge`, `PortServerOptions` is
  `BridgeServerOptions`, and the commands' default prefix is `/bridge/` instead of `/port/`.
- The Tauri shell's commands moved from `src/port.rs` to `src/bridge.rs`; the commands keep their names. The shell's
  ready line is now `bridge: <command> -> ...`.
- `adopt` copies `bridge.ts` (with `port.ts`) to `<to>/platform/`, and the server, with `--server`, to
  `server/bridge-server.ts`. A project adopted earlier keeps its `src-tauri/src/port.rs` and `server/port-server.ts`,
  which adopt names as no longer in the stance.
- The network sense of port is unchanged: a listening port number is still `port`.

Deprecated, for one release, then removed: `port.ts` remains and re-exports `bridge.ts` together with the old names
`Port`, `PortError`, `localPort`, `webPort` and `tauriPort`; `platform/server.ts` still exports `portHandler`,
`servePort` and `PortServerOptions`, and, when no prefix is given, answers at `/port/` as well as at `/bridge/`. The
platforms check accepts a shell's old `port: <command>` ready line too.
