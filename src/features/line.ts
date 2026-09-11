import {State} from "../state/State";
import {redrawCanvas} from "./draw-canvas";
import {Utils} from "../utils/utils";
import {ShortcutRegistry} from "./shortcut-keys";
import {changeSelectedDotColor} from "./dot";
import {recordChange} from "./project/undo-redo";
import {rebuildNets} from "../nets/rebuild";
import {invalidateWireCache} from "./wire-cache";
import {deletePlacedIcCascade} from "./connect";


// Delete line
Utils.getSafeHtmlElement<HTMLButtonElement>('deleteLineBtn').addEventListener('click', function() {
 deleteLine();
});

// Wire colour is not user-editable: a wire is always drawn in its net's colour
// (see src/nets/derive.ts `colorFor` + the Nets panel). The "Line Color" control
// is gone; the Styling & Colors panel now only recolours pads.

export function deleteLine(){
  if (State.selectedConnection) {
    const index = State.connections.indexOf(State.selectedConnection);
    if (index > -1) {
      recordChange({ connectionsRemoved: [State.selectedConnection] });
      State.connections.splice(index, 1);
      State.selectedConnection = undefined;
      rebuildNets();
      invalidateWireCache();
      redrawCanvas();
      window.dispatchEvent(new Event('nets-changed'));
      return;
    }
  }
  if (State.selectedPlacedIc) {
    deletePlacedIcCascade(State.selectedPlacedIc);
    return;
  }
  if (State.selectedDot) {
    State.selectedDot.color = "#a4a0a0";
    State.selectedDot.description = undefined;
    State.selectedDot = undefined;
    redrawCanvas();
  }
}

ShortcutRegistry.add({key: "Delete", event: deleteLine, description: "Delete selected connection / component / pad note."})
ShortcutRegistry.add({key: "c", event: changeSelectedDotColor, description: "Change selected pad colour."})
