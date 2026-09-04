import {Utils} from "../../utils/utils";
import {State} from "../../state/State";
import {createDotGrid, heightInput, widthInput} from "./resize-grid";
import {resetCanvas} from "../reset-canvas";
import {redrawCanvas} from "../draw-canvas";
import {loadDefaultIcs} from "../ic";

Utils.getSafeHtmlElement<HTMLButtonElement>('resetBtn').addEventListener('click', function() {
  State.lines = [];
  State.dots = [];
  State.placedIcs = [];
  State.changes = [];
  State.changeIndex = -1;
  State.selectedDot = undefined;
  State.selectedLine = undefined;
  State.selectedIc = undefined;
  State.selectedPlacedIc = undefined;
  loadDefaultIcs(); // restore the built-in IC catalog
  localStorage.removeItem('save');
  createDotGrid(parseInt(widthInput.value || "10"), parseInt(heightInput.value || "10"));
  resetCanvas()
  redrawCanvas()
});
