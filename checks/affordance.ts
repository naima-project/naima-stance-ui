// Affordances: every transition a person takes says what offers it and how it shows (scripts/affordance.ts), so that no
// action of the app is there and unseen. Active, like the transitions check, when stance-ui.json's check.transitions is
// set. A transition is a person's unless its @affordance says `none` and why; the check refuses
//
//   - a person's transition with no @affordance,
//   - an affordance that says no cue at rest, on hover or focus, or on touch (a kind of the widget set gives all three),
//   - a cue invisible at rest with nothing saying how a person discovers it,
//   - a transition declared `none` that a component calls from an event handler written in its markup.

import type { StanceConfig } from "./config.ts";
import type { Finding } from "./finding.ts";
import { checkTransitionCalls } from "./parity.ts";
import { affordanceGaps } from "../scripts/affordance.ts";
import { loadReading } from "../scripts/transitions.ts";

const AFFORDANCES = "affordances";

/** The affordances check on a project: every person's transition declares a visible or discoverable affordance. */
export async function checkAffordances(
  root: string,
  cfg: StanceConfig,
  components: readonly string[],
  read: (file: string) => Promise<string>,
): Promise<Finding[]> {
  const t = cfg.transitions;
  if (!t) return [];
  const machines = await loadReading(root, t.machines, t.reader);
  const findings: Finding[] = [];
  const problem = (file: string, message: string) =>
    findings.push({ check: AFFORDANCES, level: "problem", file, message });
  // What the components call from an event handler: transitions a person sets off, whatever their comment says.
  const handled = new Set<string>();
  for (const file of components) {
    checkTransitionCalls(file, await read(file), machines.entries, machines.internals, machines.machines, handled);
  }
  for (const e of machines.entries) {
    const id = `${e.machine}.${e.name}`;
    const a = e.affordance;
    if (!a) {
      problem(
        e.file,
        `${id} declares no affordance: say with @affordance the element that offers it and its cues, or none: why no person takes it`,
      );
    } else if ("none" in a) {
      if (handled.has(id)) {
        problem(e.file, `${id} says no person takes it (${a.none}), but a component calls it from an event handler`);
      }
    } else {
      for (const gap of affordanceGaps(a)) problem(e.file, `${id}: its affordance (${a.element}) ${gap}`);
    }
  }
  return findings;
}
