import {State} from "../state/State";
import {Canvas} from "../state/Canvas";

/**
 * Sidebar panels that depend on the current interaction mode rather than
 * just the component/solder side split (already handled by the
 * *PanelWrap `hidden` toggles in the solder-side handler in index.ts).
 *
 * - Styling & Colors is dropped while placing a component or using the
 *   Connect tool — both component-side-only activities where colour
 *   picking is a distraction.
 * - Grid Configuration is solder-side-only clutter — resizing the board
 *   is a component-side concern.
 * - On the solder side the Tools section keeps only Undo/Redo — the
 *   Select/Connect tool-mode buttons and Add Note are component-side
 *   concerns there.
 */
export function updateSidebarVisibility() {
  const solder = Canvas.solderSide;
  const placingOrConnecting = !solder && (State.activeToolMode === 'connect' || !!State.selectedIc);

  document.getElementById('colorPanelWrap')?.toggleAttribute('hidden', placingOrConnecting);
  document.getElementById('gridPanelWrap')?.toggleAttribute('hidden', solder);
  document.getElementById('toolModeSelector')?.toggleAttribute('hidden', solder);
  document.getElementById('addNoteWrap')?.toggleAttribute('hidden', solder);
}
