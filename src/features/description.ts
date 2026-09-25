import {State} from "../state/State";
import {redrawCanvas} from "./draw-canvas";
import {Utils} from "../utils/utils";
import {ShortcutRegistry} from "./shortcut-keys";
import {Ic} from "./ic";

// Notes belong to placed components only. To label a bare hole, place a bridge
// there and annotate that.

// View option: labels/notes are hover-only unless this is toggled on (view
// preference, so it's neither saved with the project nor tracked by undo).
const labelsToggleBtn = Utils.getSafeHtmlElement<HTMLButtonElement>('toggleLabelsBtn');
labelsToggleBtn.addEventListener('click', function() {
  State.showAllLabels = !State.showAllLabels;
  labelsToggleBtn.setAttribute('aria-pressed', String(State.showAllLabels));
  labelsToggleBtn.classList.toggle('btn-accent', State.showAllLabels);
  labelsToggleBtn.classList.toggle('btn', !State.showAllLabels);
  redrawCanvas();
});

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

// Double-click opens the full properties popup (notes included) — see
// properties-popup.ts.

ShortcutRegistry.add({key: "d", event: () => addNote(), description: "Add note to component."})
ShortcutRegistry.add({key: "D", event: () => removeNote(), description: "Remove note from component."})
