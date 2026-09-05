import { State } from "../state/State";
import { deriveNets } from "./derive";

/**
 * Re-derive the logical net layer from the current connection list and stamp
 * each connection with its netId. Existing nets are passed back in so names /
 * colours / locks / routed-signatures carry forward. Impure (writes `State`);
 * the derive step it delegates to is pure.
 */
export function rebuildNets(): void {
  const { nets, connectionNet } = deriveNets(State.connections, State.placedIcs, State.nets);
  State.nets = nets;
  for (const c of State.connections) {
    c.netId = connectionNet.get(c) ?? undefined;
  }
}
