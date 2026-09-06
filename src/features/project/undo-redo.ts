import {State} from "../../state/State";
import {redrawCanvas} from "../draw-canvas";
import {Utils} from "../../utils/utils";
import {ShortcutRegistry} from "../shortcut-keys";
import {IConnection} from "../../interfaces/connection.interface";
import {invalidateWireCache} from "../wire-cache";
import type {Ic} from "../ic";

function removeConnectionMatching(target: IConnection): void {
  const i = State.connections.findIndex(c => c.id === target.id);
  if (i > -1) State.connections.splice(i, 1);
}

function removeComponentMatching(target: Ic): void {
  const i = State.placedIcs.findIndex(ic => ic.id === target.id);
  if (i > -1) State.placedIcs.splice(i, 1);
}

/**
 * Append one undoable step and drop any redo entries past it. Pass every
 * connection / component the operation added and/or removed so it undoes as a
 * unit (e.g. deleting a component cascades its connections). Wires are not
 * tracked — they are stateless router output (docs/logical-connections.md §11).
 */
export function recordChange(change: {
  connectionsAdded?: IConnection[]; connectionsRemoved?: IConnection[];
  componentsAdded?: Ic[]; componentsRemoved?: Ic[];
}): void {
  const connectionsAdded = change.connectionsAdded ?? [];
  const connectionsRemoved = change.connectionsRemoved ?? [];
  const componentsAdded = change.componentsAdded ?? [];
  const componentsRemoved = change.componentsRemoved ?? [];
  if (
    connectionsAdded.length === 0 && connectionsRemoved.length === 0
    && componentsAdded.length === 0 && componentsRemoved.length === 0
  ) return;
  State.changes.splice(State.changeIndex + 1);
  State.changes.push({
    connectionsAdded: [...connectionsAdded], connectionsRemoved: [...connectionsRemoved],
    componentsAdded: [...componentsAdded], componentsRemoved: [...componentsRemoved],
  });
  State.changeIndex++;
}

Utils.getSafeHtmlElement<HTMLButtonElement>('backBtn').addEventListener('click', function() {
  undo();
});

export function undo(){
  if (State.changeIndex < 0) return;
  const change = State.changes[State.changeIndex];
  (change.connectionsAdded ?? []).forEach(removeConnectionMatching);
  (change.connectionsRemoved ?? []).forEach(c => State.connections.push(c));
  (change.componentsAdded ?? []).forEach(removeComponentMatching);
  (change.componentsRemoved ?? []).forEach(ic => State.placedIcs.push(ic));
  State.changeIndex--;
  State.selectedConnection = undefined;
  invalidateWireCache();
  redrawCanvas();
  window.dispatchEvent(new Event('nets-changed'));
}

// Forward button
Utils.getSafeHtmlElement<HTMLButtonElement>('forwardBtn').addEventListener('click', function() {
  redo();
});

export function redo(){
  if (State.changeIndex >= State.changes.length - 1) return;
  State.changeIndex++;
  const change = State.changes[State.changeIndex];
  if (!change) return;
  (change.connectionsRemoved ?? []).forEach(removeConnectionMatching);
  (change.connectionsAdded ?? []).forEach(c => State.connections.push(c));
  (change.componentsRemoved ?? []).forEach(removeComponentMatching);
  (change.componentsAdded ?? []).forEach(ic => State.placedIcs.push(ic));
  State.selectedConnection = undefined;
  invalidateWireCache();
  redrawCanvas();
  window.dispatchEvent(new Event('nets-changed'));
}

ShortcutRegistry.add({key: "z", ctrl: true, description: "Undo last change.", event: undo});
ShortcutRegistry.add({key: "y", ctrl: true, description: "Redo last undo.", event: redo});
