// Deprecated: the platform port is now the platform bridge (bridge.ts). This module keeps the old names working
// for one release, so that a project importing port.ts still builds; it will be removed after that.

import { type Bridge, BridgeError, localBridge, tauriBridge, webBridge } from "./bridge.ts";

export * from "./bridge.ts";

/** @deprecated Use `Bridge` from bridge.ts. */
export type Port = Bridge;

/** @deprecated Use `BridgeError` from bridge.ts. */
export const PortError = BridgeError;
/** @deprecated Use `BridgeError` from bridge.ts. */
export type PortError = BridgeError;

/** @deprecated Use `localBridge` from bridge.ts. */
export const localPort = localBridge;

/** @deprecated Use `webBridge` from bridge.ts. */
export const webPort = webBridge;

/** @deprecated Use `tauriBridge` from bridge.ts. */
export const tauriPort = tauriBridge;
