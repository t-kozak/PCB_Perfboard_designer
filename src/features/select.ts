import {State} from "../state/State";
import {redrawCanvas} from "./draw-canvas";
import {Canvas} from "../state/Canvas";
import {ShortcutRegistry} from "./shortcut-keys";
import {ILine} from "../interfaces/line.interface";
import {addNote} from "./description";
import {panBy} from "./viewport";
import {recordChange} from "./project/undo-redo";
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

    // Eraser Tool Mode
    if (State.activeToolMode === 'eraser') {
      const placedIcIndex = solder ? -1 : State.placedIcs.findIndex(ic => ic.containsPoint(x, y));
      if (placedIcIndex > -1) {
        State.placedIcs.splice(placedIcIndex, 1);
        State.selectedPlacedIc = undefined;
        redrawCanvas();
        return;
      }
      handleEraserClick(e);
      return;
    }

    // Note Tool Mode
    if (State.activeToolMode === 'note') {
      const hitIc = solder ? undefined : State.placedIcs.find(ic => ic.containsPoint(x, y));
      if (hitIc) {
        addNote(hitIc);
      } else if (State.hoverDot) {
        addNote(State.hoverDot);
      }
      return;
    }

    // Placing a new IC from catalog template
    if (!solder && State.selectedIc && State.hoverDot) {
      const newInstance = State.selectedIc.clone();
      newInstance.updatePosition(State.hoverDot.x, State.hoverDot.y);
      State.placedIcs.push(newInstance);
      State.selectedPlacedIc = newInstance;
      State.selectedIc = undefined;
      redrawCanvas();
      return;
    }

    // Check hit on an existing placed IC on canvas (Enable Drag & Drop)
    const hitPlacedIc = solder ? undefined : State.placedIcs.find(ic => ic.containsPoint(x, y));
    if (hitPlacedIc) {
      State.selectedPlacedIc = hitPlacedIc;
      State.isDraggingIc = true;
      State.selectedDot = undefined;
      State.selectedLine = undefined;
      redrawCanvas();
      return;
    }

    // Deselect placed IC if clicking on empty space
    if (State.selectedPlacedIc) {
      State.selectedPlacedIc = undefined;
      redrawCanvas();
      // Fall through to normal dot/line selection
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
  selectLine(e);
  if (!State.selectedLine && State.hoverDot) {
    State.selectedDot = State.hoverDot;
    redrawCanvas();
  }

  // Right-click on a component body (away from its pins) targets the component.
  if (!Canvas.solderSide && !State.selectedLine && !State.selectedDot) {
    const hitIc = State.placedIcs.find(ic => ic.containsPoint(x, y));
    if (hitIc) {
      State.selectedPlacedIc = hitIc;
      redrawCanvas();
    }
  }

  // "Unlock & re-route net" only makes sense for a wire on a locked net.
  const unlockBtn = document.getElementById('ctxUnlockNetBtn');
  if (unlockBtn) {
    const net = State.selectedLine?.netId
      ? State.nets.find(n => n.id === State.selectedLine!.netId)
      : undefined;
    unlockBtn.style.display = net?.locked ? 'block' : 'none';
  }

  if (State.selectedLine || State.selectedDot || State.selectedPlacedIc) {
    showContextMenu(e.clientX, e.clientY);
  } else {
    hideContextMenu();
  }
});

function handleEraserClick(event: MouseEvent) {
  // If clicking on line or near line, remove line
  selectLine(event);
  if (State.selectedLine) {
    const index = State.lines.indexOf(State.selectedLine);
    if (index > -1) {
      recordChange({ removed: [State.selectedLine] });
      State.lines.splice(index, 1);
      State.selectedLine = undefined;
      redrawCanvas();
      window.dispatchEvent(new Event('nets-changed'));
      return;
    }
  }
  // If clicking dot, reset dot color and description
  if (State.hoverDot) {
    let changed = false;
    if (State.hoverDot.color && State.hoverDot.color !== "#a4a0a0") {
      State.hoverDot.color = "#a4a0a0";
      changed = true;
    }
    if (State.hoverDot.description) {
      State.hoverDot.description = undefined;
      changed = true;
    }
    if (changed) {
      redrawCanvas();
    }
  }
}

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
});

function addNewLineIfNeeded(){
    if (State.activeToolMode !== 'wire') {
      return;
    }
    if (!State.hoverDot){
      return;
    }
    if(State.selectedDot && State.selectedDot != State.hoverDot){
      const newLine: ILine = {
        start: State.selectedDot, 
        end: State.hoverDot, 
        color: State.activeWireColor || "#3b82f6",
        width: State.selectedWireWidth || 4
      };
      State.lines.push(newLine);
      recordChange({ added: [newLine] });

      // Reset selection
      State.selectedDot = undefined;
      State.selectedLine = newLine;
      redrawCanvas();
      window.dispatchEvent(new Event('nets-changed'));
    }
}

function selectDot(){
  if (!State.hoverDot){
    return;
  }
  State.selectedDot = State.hoverDot;
  State.selectedLine = undefined;
  redrawCanvas();
}

export function selectLine(event: MouseEvent) {
  if (State.hoverDot) {
    return;
  }

  const {x, y} = Canvas.screenToBoard(event.clientX, event.clientY);

  for (let i = 0; i < State.lines.length; i++) {
    const line = State.lines[i];

    const dx1 = line.start.x - x;
    const dy1 = line.start.y - y;
    const dx2 = line.end.x - x;
    const dy2 = line.end.y - y;

    const d1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    const d = Math.sqrt(
      Math.pow(line.end.x - line.start.x, 2) + Math.pow(line.end.y - line.start.y, 2)
    );

    if (Math.abs(d - (d1 + d2)) < State.lineSelectTolerance) {
      State.selectedLine = line;
      State.selectedDot = undefined;
      redrawCanvas();
      return;
    }
  }

  State.selectedDot = undefined;
  State.selectedLine = undefined;
  redrawCanvas();
}

function setSelection(event) {
  addNewLineIfNeeded();
  selectDot();
  selectLine(event);
}

ShortcutRegistry.add({key: "Escape", description: "Unselect dot or line", event: ()=>{
  State.selectedDot = undefined;
  State.selectedLine = undefined;
  State.selectedIc = undefined;
  State.selectedPlacedIc = undefined;
  State.isDraggingIc = false;
  hideContextMenu();
  redrawCanvas();
}});
