import {State} from "../state/State";
import {redrawCanvas} from "./draw-canvas";
import {Utils} from "../utils/utils";
import {ShortcutRegistry} from "./shortcut-keys";
import {changeSelectedDotColor} from "./dot";
import {recordChange} from "./project/undo-redo";
import {rebuildNets} from "../nets/rebuild";
import {invalidateWireCache} from "./wire-cache";
import {deletePlacedIcCascade} from "./connect";


Utils.getSafeHtmlElement<HTMLButtonElement>('changeLineColorBtn').addEventListener('click', function() {
  changeSelectedLineColor()
});

// Delete line
Utils.getSafeHtmlElement<HTMLButtonElement>('deleteLineBtn').addEventListener('click', function() {
 deleteLine();
});

/** Set the selected connection's wire colour (works on either face). */
export function setLineColor(color: string){
  if (!State.selectedConnection) return;
  State.selectedConnection.color = color;
  invalidateWireCache();
  redrawCanvas();
}

/**
 * "Line Color" restyles the selected connection's wire — colour is a
 * per-connection property now (docs/logical-connections.md §11), so this is the
 * same action on the component side (recolours the rubber band) and the solder
 * side (recolours the physical wire).
 */
export function changeSelectedLineColor(){
  const conn = State.selectedConnection;
  if (!conn) return;
  const colorPicker = Utils.getSafeHtmlElement<HTMLInputElement>('colorPicker');
  colorPicker.value = Utils.normalizeColor(conn.color, "#3b82f6");
  colorPicker.oninput = colorPicker.onchange = function() {
    conn.color = colorPicker.value;
    State.activeWireColor = colorPicker.value;
    const badge = document.getElementById('activeColorBadge');
    if (badge) badge.style.background = colorPicker.value;
    invalidateWireCache();
    redrawCanvas();
  };
  colorPicker.click();
}

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
ShortcutRegistry.add({key: "c", event: () => {
    changeSelectedLineColor()
    changeSelectedDotColor()
  }, description: "Change dot/connection color."})
