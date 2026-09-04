import { State } from "../state/State";
import { deriveNets } from "./derive";

/**
 * "Rebuild nets from wires": re-derive the logical net layer from the current
 * wire list and stamp each wire with its netId. Existing nets are passed back in
 * so names / colours / locks carry forward. Impure (writes `State`); the derive
 * step it delegates to is pure.
 */
export function rebuildNets(): void {
  const { nets, lineNet } = deriveNets(State.lines, State.placedIcs, State.nets);
  State.nets = nets;
  for (const line of State.lines) {
    const id = lineNet.get(line);
    line.netId = id ?? undefined;
  }
}
