import {State} from "../state/State";
import {redrawCanvas} from "./draw-canvas";
import {recordChange} from "./project/undo-redo";
import {rebuildNets} from "../nets/rebuild";
import {terminalKey, makeConnection, sameConnection} from "../interfaces/connection.interface";
import type {ITerminal} from "../interfaces/connection.interface";
import type {Ic} from "./ic";

/**
 * Connecting (component side) — there is no Connect tool to switch on: a press
 * on a component pin, routed here by select.ts, arms it (`State.pendingTerminal`)
 * and a press on a second pin completes the connection. See
 * docs/logical-connections.md §3. Pins are the only targets: a bare hole does
 * nothing, you place a bridge there first if you want a connection target that
 * isn't a part pin.
 *
 * Returns true when the press armed `hit` as the start of a new connection
 * (select.ts then lets it turn into a drag of that part), false when it
 * finished or cancelled one.
 */
export function clickPin(hit: ITerminal): boolean {
  let armed = false;
  if (!State.pendingTerminal) {
    State.pendingTerminal = hit;
    armed = true;
  } else if (terminalKey(State.pendingTerminal) === terminalKey(hit)) {
    State.pendingTerminal = undefined; // clicking the same pin cancels it
  } else {
    const conn = makeConnection(State.pendingTerminal, hit, {
      width: State.selectedWireWidth,
    });
    State.pendingTerminal = undefined;
    if (conn && !State.connections.some(c => sameConnection(c, conn.a, conn.b))) {
      State.connections.push(conn);
      recordChange({ connectionsAdded: [conn] });
      rebuildNets();
      State.selectedConnection = conn;
      window.dispatchEvent(new Event('nets-changed'));
    }
  }
  redrawCanvas();
  return armed;
}

/**
 * Delete placed component(s) and cascade-delete every connection referencing
 * them, as one undo entry (docs/logical-connections.md §2 rule 4).
 */
export function deletePlacedIcCascade(target: Ic | Ic[]): void {
  const ics = (Array.isArray(target) ? target : [target]).filter(ic => State.placedIcs.includes(ic));
  if (!ics.length) return;
  const ids = new Set(ics.map(ic => ic.id));
  const removedConnections = State.connections.filter(c => ids.has(c.a.icId) || ids.has(c.b.icId));
  State.connections = State.connections.filter(c => !removedConnections.includes(c));
  State.placedIcs = State.placedIcs.filter(ic => !ics.includes(ic));
  if (State.selectedPlacedIc && ics.includes(State.selectedPlacedIc)) State.selectedPlacedIc = undefined;
  State.selectedPlacedIcs = State.selectedPlacedIcs.filter(ic => !ics.includes(ic));
  recordChange({ componentsRemoved: ics, connectionsRemoved: removedConnections });
  rebuildNets();
  redrawCanvas();
  window.dispatchEvent(new Event('nets-changed'));
}
