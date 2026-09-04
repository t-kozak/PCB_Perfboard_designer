import {Canvas} from "../state/Canvas";
import {State} from "../state/State";

export function resetCanvas(){
  // Coordinates are in board units — the render transform maps them to device pixels.
  Canvas.ctx.fillStyle = State.canvasBackgroundColor
  Canvas.ctx.clearRect(0, 0, Canvas.boardWidth, Canvas.boardHeight);
  Canvas.ctx.fillRect(0, 0, Canvas.boardWidth, Canvas.boardHeight);
}
