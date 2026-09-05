import {State} from "../../state/State";
import {redrawCanvas} from "../draw-canvas";
import {Utils} from "../../utils/utils";
import {ShortcutRegistry} from "../shortcut-keys";
import {ILine} from "../../interfaces/line.interface";
import {IConnection} from "../../interfaces/connection.interface";
import type {Ic} from "../ic";

/** Wires are equal when their endpoint coordinates match (either direction). */
function sameLine(a: ILine, b: ILine): boolean {
  const fwd = a.start.x === b.start.x && a.start.y === b.start.y
    && a.end.x === b.end.x && a.end.y === b.end.y;
  const rev = a.start.x === b.end.x && a.start.y === b.end.y
    && a.end.x === b.start.x && a.end.y === b.start.y;
  return fwd || rev;
}

function removeMatching(target: ILine): void {
  const i = State.lines.findIndex(l => sameLine(l, target));
  if (i > -1) State.lines.splice(i, 1);
}

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
 * wire / connection / component the operation added and/or removed so it
 * undoes as a unit (e.g. deleting a component cascades its connections).
 */
export function recordChange(change: {
  added?: ILine[]; removed?: ILine[];
  connectionsAdded?: IConnection[]; connectionsRemoved?: IConnection[];
  componentsAdded?: Ic[]; componentsRemoved?: Ic[];
}): void {
  const added = change.added ?? [];
  const removed = change.removed ?? [];
  const connectionsAdded = change.connectionsAdded ?? [];
  const connectionsRemoved = change.connectionsRemoved ?? [];
  const componentsAdded = change.componentsAdded ?? [];
  const componentsRemoved = change.componentsRemoved ?? [];
  if (
    added.length === 0 && removed.length === 0
    && connectionsAdded.length === 0 && connectionsRemoved.length === 0
    && componentsAdded.length === 0 && componentsRemoved.length === 0
  ) return;
  State.changes.splice(State.changeIndex + 1);
  State.changes.push({
    added: [...added], removed: [...removed],
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
  (change.added ?? []).forEach(removeMatching);
  (change.removed ?? []).forEach(l => State.lines.push(l));
  (change.connectionsAdded ?? []).forEach(removeConnectionMatching);
  (change.connectionsRemoved ?? []).forEach(c => State.connections.push(c));
  (change.componentsAdded ?? []).forEach(removeComponentMatching);
  (change.componentsRemoved ?? []).forEach(ic => State.placedIcs.push(ic));
  State.changeIndex--;
  State.selectedLine = undefined;
  State.selectedConnection = undefined;
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
  (change.removed ?? []).forEach(removeMatching);
  (change.added ?? []).forEach(l => State.lines.push(l));
  (change.connectionsRemoved ?? []).forEach(removeConnectionMatching);
  (change.connectionsAdded ?? []).forEach(c => State.connections.push(c));
  (change.componentsRemoved ?? []).forEach(removeComponentMatching);
  (change.componentsAdded ?? []).forEach(ic => State.placedIcs.push(ic));
  State.selectedLine = undefined;
  State.selectedConnection = undefined;
  redrawCanvas();
  window.dispatchEvent(new Event('nets-changed'));
}

ShortcutRegistry.add({key: "z", ctrl: true, description: "Undo last change.", event: undo});
ShortcutRegistry.add({key: "y", ctrl: true, description: "Redo last undo.", event: redo});
