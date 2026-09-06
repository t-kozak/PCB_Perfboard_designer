import {State} from "../state/State";
import {redrawCanvas} from "./draw-canvas";
import {Canvas} from "../state/Canvas";
import {ShortcutRegistry} from "./shortcut-keys";
import {panBy} from "./viewport";
import {updateSidebarVisibility} from "./sidebar-mode";
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
    hideContextMenu();
    const {x, y} = Canvas.screenToBoard(e.clientX, e.clientY);
    // On the solder side components are hidden and not interactive.
    const solder = Canvas.solderSide;

    // Placing a new IC from catalog template ("statefull" mode — the component
    // stays armed for repeated placement; see the window 'click' handler below
    // for how the session ends).
    if (!solder && State.selectedIc && State.hoverDot) {
      const newInstance = State.selectedIc.clone();
      newInstance.updatePosition(State.hoverDot.x, State.hoverDot.y);
      State.placedIcs.push(newInstance);
      State.selectedPlacedIc = newInstance;
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
      State.selectedPlacedIc = hitPlacedIc;
      State.isDraggingIc = true;
      State.selectedDot = undefined;
      State.selectedConnection = undefined;
      redrawCanvas();
      return;
    }

    // Deselect placed IC if clicking on empty space
    if (State.selectedPlacedIc) {
      State.selectedPlacedIc = undefined;
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

// Right click context menu handler
Canvas.c.addEventListener('contextmenu', function(e) {
  e.preventDefault();
  const {x, y} = Canvas.screenToBoard(e.clientX, e.clientY);

  if (Canvas.solderSide) {
    solderSelect(e);
    redrawCanvas();
  } else {
    State.selectedConnection = State.hoverDot ? undefined : State.hoverConnection;
    if (!State.selectedConnection && State.hoverDot) {
      State.selectedDot = State.hoverDot;
      redrawCanvas();
    }
  }

  // Right-click on a component body (away from its pins) targets the component.
  if (!Canvas.solderSide && !State.selectedDot && !State.selectedConnection) {
    const hitIc = State.placedIcs.find(ic => ic.containsPoint(x, y));
    if (hitIc) {
      State.selectedPlacedIc = hitIc;
      redrawCanvas();
    }
  }

  if (State.selectedDot || State.selectedPlacedIc || State.selectedConnection) {
    showContextMenu(e.clientX, e.clientY);
  } else {
    hideContextMenu();
  }
});

export function showContextMenu(x: number, y: number) {
  const menu = document.getElementById('contextMenu');
  if (!menu) return;
  menu.style.display = 'block';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
}

export function hideContextMenu() {
  const menu = document.getElementById('contextMenu');
  if (menu) {
    menu.style.display = 'none';
  }
}

window.addEventListener('click', (e) => {
  const menu = document.getElementById('contextMenu');
  if (menu && !menu.contains(e.target as Node)) {
    hideContextMenu();
  }

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

function selectDot(){
  if (!State.hoverDot){
    return;
  }
  State.selectedDot = State.hoverDot;
  State.selectedConnection = undefined;
  redrawCanvas();
}

/** Component-side: select whatever connection (rubber band) is currently hovered. */
function selectConnection(){
  if (State.hoverDot) {
    return;
  }
  State.selectedConnection = State.hoverConnection;
  redrawCanvas();
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

/** Solder-side click/right-click target: a wire's connection if on one, else the hovered pad. */
function solderSelect(event: MouseEvent) {
  const conn = selectWireConnection(event);
  if (conn) {
    State.selectedConnection = conn;
    State.selectedDot = undefined;
  } else if (State.hoverDot) {
    State.selectedDot = State.hoverDot;
    State.selectedConnection = undefined;
  } else {
    State.selectedConnection = undefined;
    State.selectedDot = undefined;
  }
}

function setSelection(event: MouseEvent) {
  if (Canvas.solderSide) {
    solderSelect(event);
    redrawCanvas();
  } else {
    selectDot();
    selectConnection();
  }
}

ShortcutRegistry.add({key: "Escape", description: "Unselect dot or connection", event: ()=>{
  State.selectedDot = undefined;
  State.selectedConnection = undefined;
  State.pendingTerminal = undefined;
  State.selectedIc = undefined;
  State.selectedPlacedIc = undefined;
  State.isDraggingIc = false;
  hideContextMenu();
  updateSidebarVisibility();
  redrawCanvas();
}});
