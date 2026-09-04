import {Canvas} from "../state/Canvas";
import {State} from "../state/State";

export function resetCanvas(){
  // Coordinates are in board units — the render transform maps them to device pixels.
  Canvas.ctx.fillStyle = State.canvasBackgroundColor
  Canvas.ctx.clearRect(0, 0, Canvas.boardWidth, Canvas.boardHeight);
  Canvas.ctx.fillRect(0, 0, Canvas.boardWidth, Canvas.boardHeight);

  // Solder-side view: amber inset border so a mirrored board is unmistakable.
  if (Canvas.solderSide) {
    Canvas.ctx.save();
    Canvas.ctx.strokeStyle = "#f59e0b";
    Canvas.ctx.lineWidth = 8;
    Canvas.ctx.strokeRect(4, 4, Canvas.boardWidth - 8, Canvas.boardHeight - 8);
    Canvas.ctx.restore();
  }
}
