import {State} from "../state/State";
import {Canvas} from "../state/Canvas";
import {redrawCanvas} from "./draw-canvas";
import {Utils} from "../utils/utils";
import {ShortcutRegistry} from "./shortcut-keys";
import {changeSelectedDotColor} from "./dot";
import {recordChange} from "./project/undo-redo";
import {rebuildNets} from "../nets/rebuild";
import {lockNetOf} from "./routing";
import {deletePlacedIcCascade} from "./connect";


Utils.getSafeHtmlElement<HTMLButtonElement>('changeLineColorBtn').addEventListener('click', function() {
  addColorToSelectedLine()
});

// Delete line
Utils.getSafeHtmlElement<HTMLButtonElement>('deleteLineBtn').addEventListener('click', function() {
 deleteLine();
});

export function setLineColor(color: string){
  if (State.selectedLine){
    State.selectedLine.color = color;
    lockNetOf(State.selectedLine); // hand-editing a wire locks its net
    redrawCanvas();
  }
}

/**
 * "Line Color" restyles a solder-side wire directly, but a component-side
 * selection is a *connection* — colour is per-net there, so it restyles the
 * connection's whole net instead (docs/logical-connections.md M11).
 */
function addColorToSelectedLine(){
  if (!Canvas.solderSide && State.selectedConnection) {
    const net = State.nets.find(n => n.id === State.selectedConnection!.netId);
    if (!net) return;
    const colorPicker = Utils.getSafeHtmlElement<HTMLInputElement>('colorPicker');
    colorPicker.value = Utils.normalizeColor(net.color, "#3b82f6");
    colorPicker.oninput = colorPicker.onchange = function() {
      net.color = colorPicker.value;
      redrawCanvas();
    };
    colorPicker.click();
    return;
  }
  if (!State.selectedLine) {
    return;
  }
  const colorPicker = Utils.getSafeHtmlElement<HTMLInputElement>('colorPicker');
  colorPicker.value = Utils.normalizeColor(State.selectedLine.color, "#777676");
  colorPicker.oninput = colorPicker.onchange = function() {
    State.activeWireColor = colorPicker.value;
    const badge = document.getElementById('activeColorBadge');
    if (badge) badge.style.background = colorPicker.value;
    if(State.selectedLine){
      State.selectedLine.color = colorPicker.value;
      lockNetOf(State.selectedLine);
      redrawCanvas();
    }
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
      redrawCanvas();
      window.dispatchEvent(new Event('nets-changed'));
      return;
    }
  }
  if (State.selectedPlacedIc) {
    deletePlacedIcCascade(State.selectedPlacedIc);
    return;
  }
  if(State.selectedLine) {
    const index = State.lines.indexOf(State.selectedLine);
    if(index > -1){
      recordChange({ removed: [State.selectedLine] });
      State.lines.splice(index, 1);
      State.selectedLine = undefined;
      redrawCanvas();
      window.dispatchEvent(new Event('nets-changed'));
      return;
    }
  }
  if (State.selectedDot) {
    State.selectedDot.color = "#a4a0a0";
    State.selectedDot.description = undefined;
    State.selectedDot = undefined;
    redrawCanvas();
  }
}

ShortcutRegistry.add({key: "Delete", event: deleteLine, description: "Delete selected wire / component / pad note."})
ShortcutRegistry.add({key: "c", event: () => {
    addColorToSelectedLine()
    changeSelectedDotColor()
  }, description: "Change dot/line color."})

