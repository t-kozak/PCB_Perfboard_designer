import {State} from "../state/State";
import {redrawCanvas} from "./draw-canvas";
import {Utils} from "../utils/utils";
import {ShortcutRegistry} from "./shortcut-keys";
import {changeSelectedDotColor} from "./dot";


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
    redrawCanvas();
  }
}

function addColorToSelectedLine(){
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
      redrawCanvas();
    }
  };
  colorPicker.click();
}

export function deleteLine(){
  if (State.selectedPlacedIc) {
    const index = State.placedIcs.indexOf(State.selectedPlacedIc);
    if (index > -1) {
      State.placedIcs.splice(index, 1);
      State.selectedPlacedIc = undefined;
      redrawCanvas();
      return;
    }
  }
  if(State.selectedLine) {
    const index = State.lines.indexOf(State.selectedLine);
    if(index > -1){
      // Store change
      State.changes.splice(State.changeIndex + 1);
      State.changes.push({type: 'remove', line: State.selectedLine});
      State.changeIndex++;
      // Remove line
      State.lines.splice(index, 1);
      State.selectedLine = undefined;
      redrawCanvas();
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

