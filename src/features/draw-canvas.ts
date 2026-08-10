import {resetCanvas} from "./reset-canvas";
import {State} from "../state/State";
import {Canvas} from "../state/Canvas";
import {Ic} from "./ic";
import {IDot} from "../interfaces/dot.interface";
import {ILine} from "../interfaces/line.interface";

function drawDot(dot: IDot){
  Canvas.ctx.beginPath();
  Canvas.ctx.arc(dot.x, dot.y, State.dotRadius, 0, Math.PI*2);
  Canvas.ctx.fillStyle = dot.color || "#a4a0a0";
  Canvas.ctx.fill();

  if (dot === State.selectedDot) {
    // Outer glowing selection ring
    Canvas.ctx.beginPath();
    Canvas.ctx.arc(dot.x, dot.y, State.dotRadius + 4, 0, Math.PI * 2);
    Canvas.ctx.strokeStyle = "#38bdf8";
    Canvas.ctx.lineWidth = 3;
    Canvas.ctx.stroke();

    // Inner ring marker
    Canvas.ctx.beginPath();
    Canvas.ctx.arc(dot.x, dot.y, State.dotRadius + 1, 0, Math.PI * 2);
    Canvas.ctx.strokeStyle = "#ffffff";
    Canvas.ctx.lineWidth = 1.5;
    Canvas.ctx.stroke();
  } else if (dot === State.hoverDot) {
    Canvas.ctx.beginPath();
    Canvas.ctx.arc(dot.x, dot.y, State.dotRadius + 3, 0, Math.PI * 2);
    Canvas.ctx.strokeStyle = "#94a3b8";
    Canvas.ctx.lineWidth = 2;
    Canvas.ctx.stroke();
  }

  for (const ic of State.placedIcs) {
    const pin = ic.getPinPositionOnIC(dot);
    if (pin) {
      Canvas.ctx.fillStyle = "#f472b6";
      Canvas.ctx.font = "bold 9px Inter, Arial";
      Canvas.ctx.fillText(((pin.pin + " " + (pin.info || "")) || "n").substring(0, 6), dot.x, dot.y + State.dotRadius + 11);
      Canvas.ctx.fill();
    }
  }

  if (dot.description) {
    Canvas.ctx.font = "10px Inter, Arial";
    Canvas.ctx.textAlign = "center";
    Canvas.ctx.fillStyle = dot.color || "#38bdf8";
    if (dot === State.hoverDot) {
      Canvas.ctx.fillText(dot.description, dot.x, dot.y + State.dotRadius + 12);
    } else {
      Canvas.ctx.fillText(dot.description.substring(0, 5), dot.x, dot.y + State.dotRadius + 12);
    }
  }
}

function drawLine(line: ILine){
  const baseWidth = line.width || 4;

  // Selected line glowing highlight & terminal node handles
  if (line === State.selectedLine) {
    // Outer selection glow aura
    Canvas.ctx.beginPath();
    Canvas.ctx.moveTo(line.start.x, line.start.y);
    Canvas.ctx.lineTo(line.end.x, line.end.y);
    Canvas.ctx.strokeStyle = "#38bdf8";
    Canvas.ctx.lineWidth = baseWidth + 6;
    Canvas.ctx.lineCap = "round";
    Canvas.ctx.stroke();

    // Terminal node end rings
    Canvas.ctx.beginPath();
    Canvas.ctx.arc(line.start.x, line.start.y, baseWidth + 3, 0, Math.PI * 2);
    Canvas.ctx.arc(line.end.x, line.end.y, baseWidth + 3, 0, Math.PI * 2);
    Canvas.ctx.fillStyle = "#38bdf8";
    Canvas.ctx.fill();
  } else if (line === State.hoverLine) {
    Canvas.ctx.beginPath();
    Canvas.ctx.moveTo(line.start.x, line.start.y);
    Canvas.ctx.lineTo(line.end.x, line.end.y);
    Canvas.ctx.strokeStyle = "#94a3b8";
    Canvas.ctx.lineWidth = baseWidth + 3;
    Canvas.ctx.lineCap = "round";
    Canvas.ctx.stroke();
  }

  // Main trace line
  Canvas.ctx.beginPath();
  Canvas.ctx.moveTo(line.start.x, line.start.y);
  Canvas.ctx.lineTo(line.end.x, line.end.y);
  Canvas.ctx.strokeStyle = line.color || "#777676";
  Canvas.ctx.lineWidth = baseWidth;
  Canvas.ctx.lineCap = "round";
  Canvas.ctx.stroke();
}

function drawIcPlacementPreview() {
  if (!State.selectedIc || !State.hoverDot) return;
  const targetDot = State.hoverDot;
  const w = 50 * (State.selectedIc.widthPin - 1);
  const h = 50 * (State.selectedIc.heightPin - 1);

  Canvas.ctx.save();
  Canvas.ctx.beginPath();
  Canvas.ctx.fillStyle = "rgba(6, 182, 212, 0.25)";
  Canvas.ctx.strokeStyle = "#38bdf8";
  Canvas.ctx.lineWidth = 2;
  Canvas.ctx.setLineDash([6, 4]);

  Canvas.ctx.rect(targetDot.x, targetDot.y, w, h);
  Canvas.ctx.stroke();
  Canvas.ctx.fill();

  // Placement preview label
  Canvas.ctx.setLineDash([]);
  Canvas.ctx.fillStyle = "#ffffff";
  Canvas.ctx.font = "bold 11px Inter, Arial";
  Canvas.ctx.textAlign = "center";
  Canvas.ctx.fillText(`➕ Place ${State.selectedIc.name}`, targetDot.x + (w / 2), targetDot.y + (h / 2) + 4);

  Canvas.ctx.restore();
}

export function redrawCanvas() {
  resetCanvas();
  // 1. Draw IC chip bodies
  for (const ic of State.placedIcs) {
    ic.drawBody();
  }
  // 2. Draw grid dots
  for (let i = 0; i < State.dots.length; i++) {
    drawDot(State.dots[i]);
  }
  // 3. Draw wires
  for (let i = 0; i < State.lines.length; i++) {
    drawLine(State.lines[i]);
  }
  // 4. Draw IC text badges on top of everything
  for (const ic of State.placedIcs) {
    ic.drawLabel();
  }
  drawIcPlacementPreview();
}
