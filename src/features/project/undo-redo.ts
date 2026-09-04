import {State} from "../../state/State";
import {redrawCanvas} from "../draw-canvas";
import {Utils} from "../../utils/utils";
import {ShortcutRegistry} from "../shortcut-keys";
import {ILine} from "../../interfaces/line.interface";

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

/**
 * Append one undoable step and drop any redo entries past it. Pass every wire
 * the operation added and/or removed so it undoes as a unit.
 */
export function recordChange(change: { added?: ILine[]; removed?: ILine[] }): void {
  const added = change.added ?? [];
  const removed = change.removed ?? [];
  if (added.length === 0 && removed.length === 0) return;
  State.changes.splice(State.changeIndex + 1);
  State.changes.push({ added: [...added], removed: [...removed] });
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
  State.changeIndex--;
  State.selectedLine = undefined;
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
  State.selectedLine = undefined;
  redrawCanvas();
  window.dispatchEvent(new Event('nets-changed'));
}

ShortcutRegistry.add({key: "z", ctrl: true, description: "Undo last change.", event: undo});
ShortcutRegistry.add({key: "y", ctrl: true, description: "Redo last undo.", event: redo});
