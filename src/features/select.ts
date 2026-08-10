import {State} from "../state/State";
import {redrawCanvas} from "./draw-canvas";
import {Canvas} from "../state/Canvas";
import {ShortcutRegistry} from "./shortcut-keys";
import {ILine} from "../interfaces/line.interface";
Canvas.c.addEventListener('mousedown', function(e) {
  if (e.button === 0) {
    hideContextMenu();
    const rect = Canvas.c.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Eraser Tool Mode
    if (State.activeToolMode === 'eraser') {
      const placedIcIndex = State.placedIcs.findIndex(ic => ic.containsPoint(x, y));
      if (placedIcIndex > -1) {
        State.placedIcs.splice(placedIcIndex, 1);
        State.selectedPlacedIc = undefined;
        redrawCanvas();
        return;
      }
      handleEraserClick(e);
      return;
    }

    // Placing a new IC from catalog template
    if (State.selectedIc && State.hoverDot) {
      const newInstance = State.selectedIc.clone();
      newInstance.updatePosition(State.hoverDot.x, State.hoverDot.y);
      State.placedIcs.push(newInstance);
      State.selectedPlacedIc = newInstance;
      State.selectedIc = undefined;
      redrawCanvas();
      return;
    }

    // Check hit on an existing placed IC on canvas (Enable Drag & Drop)
    const hitPlacedIc = State.placedIcs.find(ic => ic.containsPoint(x, y));
    if (hitPlacedIc) {
      State.selectedPlacedIc = hitPlacedIc;
      State.isDraggingIc = true;
      State.selectedDot = undefined;
      State.selectedLine = undefined;
      redrawCanvas();
      return;
    }

    // Relocate an already selected IC to target pad
    if (State.selectedPlacedIc && State.hoverDot) {
      State.selectedPlacedIc.updatePosition(State.hoverDot.x, State.hoverDot.y);
      State.selectedPlacedIc = undefined;
      redrawCanvas();
      return;
    } else {
      State.selectedPlacedIc = undefined;
    }

    setSelection(e);
  }
});

window.addEventListener('mouseup', () => {
  State.isDraggingIc = false;
});

// Right click context menu handler
Canvas.c.addEventListener('contextmenu', function(e) {
  e.preventDefault();
  selectLine(e);
  if (!State.selectedLine && State.hoverDot) {
    State.selectedDot = State.hoverDot;
    redrawCanvas();
  }

  if (State.selectedLine || State.selectedDot) {
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
      State.changes.splice(State.changeIndex + 1);
      State.changes.push({type: 'remove', line: State.selectedLine});
      State.changeIndex++;
      State.lines.splice(index, 1);
      State.selectedLine = undefined;
      redrawCanvas();
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
      State.changes.splice(State.changeIndex + 1);
      State.changes.push({type: 'add', line: newLine});
      State.changeIndex++;

      // Reset selection
      State.selectedDot = undefined;
      State.selectedLine = newLine;
      redrawCanvas();
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

export function selectLine(event) {
  if (State.hoverDot) {
    return;
  }

  const rect = Canvas.c.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

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
  hideContextMenu();
}});
