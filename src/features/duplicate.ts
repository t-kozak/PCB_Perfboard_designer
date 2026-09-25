import {State} from "../state/State";
import {Canvas} from "../state/Canvas";
import {redrawCanvas} from "./draw-canvas";
import {ShortcutRegistry} from "./shortcut-keys";
import {startIcDragAt} from "./ic-drag";
import {assignDesignator} from "./component-props";
import {recordChange} from "./project/undo-redo";
import {rebuildNets} from "../nets/rebuild";
import {IConnection, makeConnection} from "../interfaces/connection.interface";
import type {Ic} from "./ic";

/**
 * Duplicate (`d`, component side): copies the selected component(s), plus
 * every connection running between two of them, and hands the copies to the
 * cursor as if they had been grabbed — they follow the mouse (the same
 * whole-pitch group move as ic-drag.ts) until the next click on the board
 * drops them. Escape, Delete, or a click anywhere off the board throws them
 * away.
 *
 * Copies keep kind, rotation, properties and notes, but get a fresh id and the
 * next free reference designator, exactly like a part placed from the catalog.
 * While placing, the copies already live in `State.placedIcs` (so they draw,
 * rubber bands included) and are listed in `State.placingDuplicates`; the
 * undo entry is only recorded once they are dropped.
 */
let pendingConnections: IConnection[] = [];

/** Last cursor position over the board, in board coordinates — the grab point for a new placement. */
let cursor: {x: number; y: number} | undefined;
Canvas.c.addEventListener('mousemove', (e) => { cursor = Canvas.screenToBoard(e.clientX, e.clientY); });

function selectedComponents(): Ic[] {
  if (State.selectedPlacedIcs.length) return [...State.selectedPlacedIcs];
  return State.selectedPlacedIc ? [State.selectedPlacedIc] : [];
}

function copyOf(src: Ic): Ic {
  const copy = src.clone(); // clone() takes the current (rotated) widthPin/heightPin
  copy.rotationAngle = src.rotationAngle;
  copy.config = {...src.config};
  copy.description = src.description;
  copy.topLeftDot = src.topLeftDot;
  return copy;
}

export function duplicateSelection(): void {
  if (Canvas.solderSide || State.placingDuplicates.length) return;
  const sources = selectedComponents().filter(ic => ic.topLeftDot);
  if (!sources.length) return;

  const idMap = new Map<string, string>();
  const copies = sources.map(src => {
    const copy = copyOf(src);
    idMap.set(src.id, copy.id);
    State.placedIcs.push(copy);
    assignDesignator(copy, State.placedIcs); // after the push, so each copy sees the ones before it
    return copy;
  });

  pendingConnections = State.connections
    .filter(c => idMap.has(c.a.icId) && idMap.has(c.b.icId))
    .map(c => makeConnection(
      {icId: idMap.get(c.a.icId)!, pin: c.a.pin},
      {icId: idMap.get(c.b.icId)!, pin: c.b.pin},
      {label: c.label, width: c.width},
    ))
    .filter((c): c is IConnection => !!c);
  State.connections.push(...pendingConnections);

  State.placingDuplicates = copies;
  State.selectedPlacedIc = copies[copies.length - 1];
  State.selectedPlacedIcs = copies.length > 1 ? copies : [];
  State.selectedConnection = undefined;
  State.selectedDot = undefined;

  // Grab them at the cursor: the copies start on top of their originals and
  // move by however far the mouse goes from here.
  const grab = cursor ?? sources[0].topLeftDot!;
  startIcDragAt(copies, grab.x, grab.y);
  Canvas.c.style.cursor = 'move';
  rebuildNets();
  window.dispatchEvent(new Event('nets-changed'));
  redrawCanvas();
}

function endPlacement(): void {
  State.placingDuplicates = [];
  pendingConnections = [];
  State.isDraggingIc = false;
  Canvas.c.style.cursor = 'crosshair';
}

/** Drops the floating copies where they are, as one undo step. */
function commitPlacement(): void {
  // Anything deleted mid-placement is no longer ours to record.
  const components = State.placingDuplicates.filter(ic => State.placedIcs.includes(ic));
  const connections = pendingConnections.filter(c => State.connections.includes(c));
  endPlacement();
  recordChange({componentsAdded: components, connectionsAdded: connections});
  redrawCanvas();
}

/** Throws the floating copies (and their connections) away. */
export function cancelDuplicatePlacement(): void {
  if (!State.placingDuplicates.length) return;
  const copies = State.placingDuplicates;
  const connections = pendingConnections;
  State.placedIcs = State.placedIcs.filter(ic => !copies.includes(ic));
  State.connections = State.connections.filter(c => !connections.includes(c));
  if (State.selectedPlacedIc && copies.includes(State.selectedPlacedIc)) State.selectedPlacedIc = undefined;
  State.selectedPlacedIcs = State.selectedPlacedIcs.filter(ic => !copies.includes(ic));
  endPlacement();
  rebuildNets();
  window.dispatchEvent(new Event('nets-changed'));
  redrawCanvas();
}

// Capture phase on window, so a placement click is consumed before select.ts /
// connect.ts see it (it must not also select or start dragging what's under it).
window.addEventListener('mousedown', (e) => {
  if (!State.placingDuplicates.length) return;
  const target = e.target as Node;
  const onCanvas = Canvas.c === target || Canvas.c.contains(target);
  if (!onCanvas) {
    // Sidebar, board switcher, side flip… — never leave copies floating.
    cancelDuplicatePlacement();
    return;
  }
  if (e.button !== 0) return; // middle-button panning keeps working
  e.stopPropagation();
  commitPlacement();
}, true);

ShortcutRegistry.add({key: "d", event: duplicateSelection, description: "Duplicate selected component(s), then click to place."});
