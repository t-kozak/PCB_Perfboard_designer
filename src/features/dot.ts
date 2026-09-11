import {State} from "../state/State";
import {redrawCanvas} from "./draw-canvas";
import {Utils} from "../utils/utils";

Utils.getSafeHtmlElement<HTMLButtonElement>('changeDotColorBtn').addEventListener('click', function() {
  changeSelectedDotColor()
});

export function setDotColor(color: string){
  if (State.selectedDot){
    State.selectedDot.color = color;
    redrawCanvas();
  }
}

export function changeSelectedDotColor(){
  if (!State.selectedDot){
    return;
  }
  const colorPicker = Utils.getSafeHtmlElement<HTMLInputElement>('colorPicker');
  colorPicker.value = Utils.normalizeColor(State.selectedDot.color, "#a4a0a0");
  colorPicker.oninput = colorPicker.onchange = function() {
    State.activePadColor = colorPicker.value;
    const badge = document.getElementById('activeColorBadge');
    if (badge) badge.style.background = colorPicker.value;
    if(State.selectedDot){
      State.selectedDot.color = colorPicker.value;
      redrawCanvas();
    }
  };
  colorPicker.click();
}
