// Where the app runs, as the platform port describes it: the web page, or the Tauri app on one of five
// operating systems. Written directly as a class, without a model: four states on one path (idle, asking,
// then known or unknown), no concurrency, nothing worth proving.
//
// Its one output, describe, is carried out by the port passed in; the answer comes back as the input
// described, or failed.

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

export class Host {
  readonly view: HostView;
  readonly #port: HostPort;
  #phase: HostPhase = $state("IDLE");
  #label: string = $state("");

  constructor(port: HostPort) {
    this.#port = port;
    const phase = () => this.#phase;
    const label = () => this.#label;
    this.view = {
      get phase() {
        return phase();
      },
      get label() {
        return label();
      },
    };
  }

  allowed(event: HostEvent): boolean {
    return event.type === "ask" ? this.#phase === "IDLE" : this.#phase === "ASKING";
  }

  ask(): void {
    if (!this.allowed({ type: "ask" })) return;
    this.#phase = "ASKING";
    this.#port.describe();
  }

  described(info: HostInfo): void {
    if (!this.allowed({ type: "described", info })) return;
    this.#phase = "KNOWN";
    this.#label = labelFor(info);
  }

  failed(): void {
    if (!this.allowed({ type: "failed" })) return;
    this.#phase = "UNKNOWN";
  }
}
