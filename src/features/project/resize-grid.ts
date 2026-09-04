import {State} from "../../state/State";
import {redrawCanvas} from "../draw-canvas";
import {Utils} from "../../utils/utils";
import {Canvas} from "../../state/Canvas";

export const widthInput = Utils.getSafeHtmlElement<HTMLInputElement>('dotMatrixWidth')
export const heightInput = Utils.getSafeHtmlElement<HTMLInputElement>('dotMatrixHeight')
const resizeBtn = Utils.getSafeHtmlElement<HTMLButtonElement>('resizeGridBtn')
resizeBtn.addEventListener('click', function() {
  const width = parseInt(widthInput.value);
  const height = parseInt(heightInput.value);
  // Recreate the dot grid
  createDotGrid(width, height);

  // Clear all lines and redraw the canvas
  State.lines = [];
  State.nets = [];
  redrawCanvas();
  window.dispatchEvent(new Event('nets-changed'));
});

export function createDotGrid(horizontalDotNumbers: number, verticalDotNumbers: number) {
  Canvas.setBoardSize(horizontalDotNumbers * State.dotSpace, verticalDotNumbers * State.dotSpace);

  State.dots = [];
  for(let x =  State.dotSpace / 2; x < Canvas.boardWidth; x +=  State.dotSpace){
    for(let y =  State.dotSpace / 2; y < Canvas.boardHeight; y +=  State.dotSpace){
      State.dots.push({x: x, y: y, description: null, color: "#a4a0a0"});
    }
  }
}
