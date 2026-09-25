import {State} from "../state/State";
import {redrawCanvas} from "./draw-canvas";
import {Canvas} from "../state/Canvas";
import {ShortcutRegistry} from "./shortcut-keys";
import {panBy} from "./viewport";
import {updateSidebarVisibility} from "./sidebar-mode";
import {assignDesignator} from "./component-props";
import {terminalAtDot} from "../nets/derive";
import {startIcDragAt} from "./ic-drag";
import {Ic} from "./ic";
import {cancelDuplicatePlacement} from "./duplicate";
let isPanningBoard = false;
let panLastX = 0;
let panLastY = 0;

Canvas.c.addEventListener('mousedown', function(e) {
  // Middle mouse click canvas panning
  if (e.button === 1) {
    e.preventDefault();
    isPanningBoard = true;
    panLastX = e.clientX;
    panLastY = e.clientY;
    Canvas.c.style.cursor = 'grabbing';
    return;
  }

  if (e.button === 0) {
    const {x, y} = Canvas.screenToBoard(e.clientX, e.clientY);
    // On the solder side components are hidden and not interactive.
    const solder = Canvas.solderSide;

    // Placing a new IC from catalog template ("statefull" mode — the component
    // stays armed for repeated placement; see the window 'click' handler below
    // for how the session ends).
    if (!solder && State.selectedIc && State.hoverDot) {
      const newInstance = State.selectedIc.clone();
      newInstance.updatePosition(State.hoverDot.x, State.hoverDot.y);
      assignDesignator(newInstance, State.placedIcs);
      State.placedIcs.push(newInstance);
      State.selectedPlacedIc = newInstance;
      redrawCanvas();
      return;
    }

    // Shift+click a component: toggle it in the multi-selection group (any
    // tool). A lone selected component is folded into the group first, so
    // click A, then Shift+click B selects both.
    if (!solder && e.shiftKey) {
      const hit = State.placedIcs.find(ic => ic.containsPoint(x, y));
      if (hit) {
        toggleGroupMember(hit);
        redrawCanvas();
        return;
      }
    }

    // A connection (rubber band) under the cursor wins over the component body
    // it may cross. Its hit zone stops short of its end pins (hover.ts), so
    // grabbing a component by a pin still drags it. In Connect mode a click on
    // a pin still belongs to the Connect tool.
    const onPin = !!State.hoverDot && !!terminalAtDot(State.hoverDot, State.placedIcs);
    if (!solder && State.hoverConnection && !(State.activeToolMode === 'connect' && onPin)) {
      State.selectedConnection = State.hoverConnection;
      State.selectedPlacedIc = undefined;
      State.selectedPlacedIcs = [];
      State.selectedDot = undefined;
      redrawCanvas();
      return;
    }

    // Connect tool (component side): pin-to-pin connections are handled
    // entirely by features/connect.ts, which listens on this same event.
    if (State.activeToolMode === 'connect' && !solder) {
      return;
    }

    // Check hit on an existing placed IC on canvas (Enable Drag & Drop)
    const hitPlacedIc = solder ? undefined : State.placedIcs.find(ic => ic.containsPoint(x, y));
    if (hitPlacedIc) {
      // Grabbing a member of the group drags the whole group; any other
      // component replaces the group with a single selection.
      const inGroup = State.selectedPlacedIcs.includes(hitPlacedIc);
      if (!inGroup) State.selectedPlacedIcs = [];
      State.selectedPlacedIc = hitPlacedIc;
      startIcDragAt(inGroup ? State.selectedPlacedIcs : [hitPlacedIc], x, y);
      State.selectedDot = undefined;
      State.selectedConnection = undefined;
      redrawCanvas();
      return;
    }

    // Deselect placed IC(s) if clicking on empty space
    if (State.selectedPlacedIc || State.selectedPlacedIcs.length) {
      State.selectedPlacedIc = undefined;
      State.selectedPlacedIcs = [];
      redrawCanvas();
      // Fall through to normal dot/line/connection selection
    }

    setSelection(e);
  }
});

window.addEventListener('mousemove', (e) => {
  if (isPanningBoard) {
    panBy(e.clientX - panLastX, e.clientY - panLastY);
    panLastX = e.clientX;
    panLastY = e.clientY;
  }
});

window.addEventListener('mouseup', () => {
  if (isPanningBoard) {
    isPanningBoard = false;
    Canvas.c.style.cursor = 'crosshair';
  }
  State.isDraggingIc = false;
});

// No right-click menu — double-click a component for its properties, Delete
// to remove the selection. Suppress the browser's own menu over the board.
Canvas.c.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('click', (e) => {
  // Ends a "statefull" component-placement session (armed via clicking a
  // Components catalog label — see selectIc() in ic.ts): any click that lands
  // outside both the canvas (where placement clicks land) and the catalog
  // itself (where re-arming/switching parts happens) disarms it.
  if (State.selectedIc) {
    const target = e.target as Node;
    const withinCanvas = Canvas.c === target || Canvas.c.contains(target);
    const withinCatalog = document.getElementById('componentsPanelWrap')?.contains(target) ?? false;
    if (!withinCanvas && !withinCatalog) {
      State.selectedIc = undefined;
      updateSidebarVisibility();
      redrawCanvas();
    }
  }
});

function toggleGroupMember(ic: Ic) {
  const group = State.selectedPlacedIcs.length
    ? [...State.selectedPlacedIcs]
    : (State.selectedPlacedIc ? [State.selectedPlacedIc] : []);
  const idx = group.indexOf(ic);
  if (idx === -1) group.push(ic);
  else group.splice(idx, 1);
  State.selectedPlacedIcs = group;
  // The primary selection (rotate / properties / Delete target when alone)
  // follows the last member added, or whatever is left.
  State.selectedPlacedIc = idx === -1 ? ic : group[group.length - 1];
  State.selectedConnection = undefined;
  State.selectedDot = undefined;
}

/**
 * Solder side: hit-test the derived wire cache and return the connection whose
 * wire lies precisely under the cursor (wires are stateless — selecting one
 * really means selecting its connection). Solder-side wires run along pad
 * rows/columns, so this deliberately ignores `hoverDot` — the tight on-segment
 * test is what disambiguates wire-vs-pad. Returns undefined when off every wire.
 */
function selectWireConnection(event: MouseEvent) {
  const {x, y} = Canvas.screenToBoard(event.clientX, event.clientY);
  for (let i = 0; i < State.lines.length; i++) {
    const line = State.lines[i];
    const d1 = Math.hypot(line.start.x - x, line.start.y - y);
    const d2 = Math.hypot(line.end.x - x, line.end.y - y);
    const d = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
    if (Math.abs(d - (d1 + d2)) < State.lineSelectTolerance) {
      return State.connections.find(c => c.id === line.connId);
    }
  }
  return undefined;
}

/**
 * Click on anything that isn't a component: a wire's connection (solder side)
 * or rubber band (component side) if on one, else a hole with a component pin
 * in it. Empty holes are never selectable — clicking one clears the selection.
 */
function setSelection(event: MouseEvent) {
  const conn = Canvas.solderSide ? selectWireConnection(event) : State.hoverConnection;
  const pad = State.hoverDot && terminalAtDot(State.hoverDot, State.placedIcs) ? State.hoverDot : undefined;
  State.selectedConnection = conn;
  State.selectedDot = conn ? undefined : pad;
  redrawCanvas();
}

ShortcutRegistry.add({key: "Escape", description: "Unselect dot or connection / cancel a duplicate", event: ()=>{
  cancelDuplicatePlacement();
  State.selectedDot = undefined;
  State.selectedConnection = undefined;
  State.pendingTerminal = undefined;
  State.selectedIc = undefined;
  State.selectedPlacedIc = undefined;
  State.selectedPlacedIcs = [];
  State.isDraggingIc = false;
  updateSidebarVisibility();
  redrawCanvas();
}});
