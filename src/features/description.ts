import {State} from "../state/State";
import {redrawCanvas} from "./draw-canvas";
import {Utils} from "../utils/utils";
import {ShortcutRegistry} from "./shortcut-keys";
import {Ic} from "./ic";
import {IDot} from "../interfaces/dot.interface";

/** Anything that can carry a free-text note: a board pad or a placed component. */
type NoteTarget = IDot | Ic;

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

/**
 * Resolve the thing a note action should apply to. Explicit selections win over
 * whatever is merely under the cursor; a placed component wins over a pad so a
 * pin dot beneath a chip doesn't shadow the chip.
 */
function resolveNoteTarget(explicit?: NoteTarget): NoteTarget | undefined {
  return explicit
    || State.selectedPlacedIc
    || State.selectedDot
    || State.hoverIc
    || State.hoverDot;
}

export function addNote(target?: NoteTarget){
  const t = resolveNoteTarget(target);
  if(!t){
    alert("Click a pad or component first to add a note.");
    return;
  }
  const subject = t instanceof Ic ? `component "${t.name}"` : "this pad";
  const current = t.description || "";
  const description = prompt(`Enter a note / annotation for ${subject}:`, current);
  if (description !== null) {
    t.description = description.trim() ? description.trim() : undefined;
    State.selectedDot = undefined;
    redrawCanvas();
    updateNoteToggleButton();
  }
}

export function removeNote(target?: NoteTarget){
  const t = resolveNoteTarget(target);
  if(!t){
    alert("Select a pad or component first by clicking on it.");
    return;
  }
  t.description = undefined;
  redrawCanvas();
  updateNoteToggleButton();
}

// Kept for existing call sites that only ever mean a pad.
export const addDescriptionToDot = addNote;

ShortcutRegistry.add({key: "d", event: () => addNote(), description: "Add note (pad or component)."})
ShortcutRegistry.add({key: "D", event: () => removeNote(), description: "Remove note (pad or component)."})
