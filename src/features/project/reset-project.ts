import {Utils} from "../../utils/utils";
import {State} from "../../state/State";
import {createDotGrid, readGridInputs} from "./resize-grid";
import {resetCanvas} from "../reset-canvas";
import {redrawCanvas} from "../draw-canvas";
import {loadDefaultIcs} from "../ic";

Utils.getSafeHtmlElement<HTMLButtonElement>('resetBtn').addEventListener('click', function() {
  State.lines = [];
  State.connections = [];
  State.dots = [];
  State.placedIcs = [];
  State.nets = [];
  State.changes = [];
  State.changeIndex = -1;
  State.selectedDot = undefined;
  State.selectedLine = undefined;
  State.selectedConnection = undefined;
  State.hoverConnection = undefined;
  State.pendingTerminal = undefined;
  State.selectedIc = undefined;
  State.selectedPlacedIc = undefined;
  loadDefaultIcs(); // restore the built-in IC catalog
  localStorage.removeItem('save');
  const size = readGridInputs() ?? {cols: 10, rows: 10};
  createDotGrid(size.cols, size.rows);
  resetCanvas()
  redrawCanvas()
  window.dispatchEvent(new Event('nets-changed'));
});
