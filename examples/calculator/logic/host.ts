// Where the app runs, the plain part: its states, its events and the label said for people. No Svelte here;
// host.svelte.ts holds the machine.

export type HostPhase = "IDLE" | "ASKING" | "KNOWN" | "UNKNOWN";

/** The answer of the port's describe command, the same on every platform. */
export type HostInfo = { platform: string; shell: string };

export interface HostPort {
  describe(): void;
}

export interface HostView {
  readonly phase: HostPhase;
  /** Where the app runs, said for people: "Web page", "macOS app". Empty until known. */
  readonly label: string;
}

export type HostEvent = { type: "ask" } | { type: "described"; info: HostInfo } | { type: "failed" };

const SYSTEMS: Record<string, string> = {
  macos: "macOS",
  ios: "iOS",
  windows: "Windows",
  linux: "Linux",
  android: "Android",
};

/** The label for a description: "macOS app" for the Tauri shell, "Web page" for a browser. */
export function labelFor(info: HostInfo): string {
  if (info.shell === "tauri") return `${SYSTEMS[info.platform] ?? info.platform} app`;
  return "Web page";
}
