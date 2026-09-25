import {State} from "../state/State";
import {redrawCanvas} from "./draw-canvas";
import {Utils} from "../utils/utils";
import {ShortcutRegistry} from "./shortcut-keys";
import {Ic} from "./ic";
import {Canvas} from "../state/Canvas";

// Notes belong to placed components only. To label a bare hole, place a bridge
// there and annotate that.

// Add/Remove Note toggle — label and action follow whether the current
// selection (or hover) already carries a note.
const noteToggleBtn = Utils.getSafeHtmlElement<HTMLButtonElement>('noteToggleBtn');
noteToggleBtn.addEventListener('click', function() {
  if (resolveNoteTarget()?.description) {
    removeNote();
  } else {
    addNote();
  }
  updateNoteToggleButton();
});

export function updateNoteToggleButton() {
  const hasNote = !!resolveNoteTarget()?.description;
  noteToggleBtn.textContent = hasNote ? '✕ Remove Note' : '📝 Add Note';
  noteToggleBtn.classList.toggle('btn-danger', hasNote);
}

/** The component a note action applies to: an explicit selection wins over mere hover. */
function resolveNoteTarget(explicit?: Ic): Ic | undefined {
  return explicit || State.selectedPlacedIc || State.hoverIc;
}

export function addNote(target?: Ic){
  const t = resolveNoteTarget(target);
  if(!t){
    alert("Click a component first to add a note.");
    return;
  }
  const description = prompt(`Enter a note / annotation for component "${t.name}":`, t.description || "");
  if (description !== null) {
    t.description = description.trim() ? description.trim() : undefined;
    redrawCanvas();
    updateNoteToggleButton();
  }
}

export function removeNote(target?: Ic){
  const t = resolveNoteTarget(target);
  if(!t){
    alert("Select a component first by clicking on it.");
    return;
  }
  t.description = undefined;
  redrawCanvas();
  updateNoteToggleButton();
}

// Double-click a component to edit its note. Hit-tested directly rather than
// via resolveNoteTarget(), which would fall back to a stale selection and open
// the prompt for something that isn't under the cursor.
Canvas.c.addEventListener('dblclick', (e) => {
  // Components are hidden on the solder side; the Connect tool and armed
  // placement own clicks on the component side.
  if (Canvas.solderSide || State.activeToolMode === 'connect' || State.selectedIc) return;
  const {x, y} = Canvas.screenToBoard(e.clientX, e.clientY);
  const target = State.placedIcs.find(ic => ic.containsPoint(x, y));
  if (target) {
    addNote(target);
  }
});

ShortcutRegistry.add({key: "d", event: () => addNote(), description: "Add note to component."})
ShortcutRegistry.add({key: "D", event: () => removeNote(), description: "Remove note from component."})
