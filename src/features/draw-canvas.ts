import {resetCanvas} from "./reset-canvas";
import {State} from "../state/State";
import {Canvas} from "../state/Canvas";
import {IDot} from "../interfaces/dot.interface";
import {ILine} from "../interfaces/line.interface";
import {netAtLine, dotKey, findShorts, labelConflicts} from "../nets/derive";

function netColor(netId: string | undefined): string | undefined {
  if (!netId) return undefined;
  return State.nets.find(n => n.id === netId)?.color;
}

function drawDot(dot: IDot, onHoverNet: boolean, isShort: boolean){
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
  } else if (onHoverNet) {
    // Part of the net currently under the cursor.
    Canvas.ctx.beginPath();
    Canvas.ctx.arc(dot.x, dot.y, State.dotRadius + 3, 0, Math.PI * 2);
    Canvas.ctx.strokeStyle = "#38bdf8";
    Canvas.ctx.lineWidth = 2;
    Canvas.ctx.stroke();
  }

  if (isShort) {
    // A pad wired into two nets — a short circuit (autorouting.md §3).
    Canvas.ctx.beginPath();
    Canvas.ctx.arc(dot.x, dot.y, State.dotRadius + 6, 0, Math.PI * 2);
    Canvas.ctx.strokeStyle = "#ef4444";
    Canvas.ctx.lineWidth = 2.5;
    Canvas.ctx.stroke();
  }

  if (dot.description) {
    Canvas.ctx.font = "10px Inter, Arial";
    Canvas.ctx.textAlign = "center";
    Canvas.ctx.fillStyle = dot.color || "#38bdf8";
    if (dot === State.hoverDot) {
      Canvas.fillText(dot.description, dot.x, dot.y + State.dotRadius + 12);
    } else {
      Canvas.fillText(dot.description.substring(0, 5), dot.x, dot.y + State.dotRadius + 12);
    }
  }
}

function drawLine(line: ILine, onHoverNet: boolean){
  const baseWidth = line.width || 4;
  // Net colours are a solder-side (physical) concern only.
  const stroke = (Canvas.solderSide && State.showNetColors && netColor(line.netId))
    || line.color || "#777676";

  // Net highlight — everything electrically joined to the hovered wire.
  if (onHoverNet && line !== State.selectedLine && line !== State.hoverLine) {
    Canvas.ctx.beginPath();
    Canvas.ctx.moveTo(line.start.x, line.start.y);
    Canvas.ctx.lineTo(line.end.x, line.end.y);
    Canvas.ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
    Canvas.ctx.lineWidth = baseWidth + 5;
    Canvas.ctx.lineCap = "round";
    Canvas.ctx.stroke();
  }

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
  Canvas.ctx.strokeStyle = stroke;
  Canvas.ctx.lineWidth = baseWidth;
  Canvas.ctx.lineCap = "round";
  Canvas.ctx.stroke();
}

function drawIcPlacementPreview() {
  if (Canvas.solderSide || !State.selectedIc || !State.hoverDot) return;
  const targetDot = State.hoverDot;
  const spanW = 50 * (State.selectedIc.widthPin - 1);
  const spanH = 50 * (State.selectedIc.heightPin - 1);
  // Leaded parts have a zero-height/width pin span — give the preview a body.
  const w = spanW || 30;
  const h = spanH || 30;
  const originX = targetDot.x - (spanW ? 0 : w / 2);
  const originY = targetDot.y - (spanH ? 0 : h / 2);

  Canvas.ctx.save();
  Canvas.ctx.beginPath();
  Canvas.ctx.fillStyle = "rgba(6, 182, 212, 0.25)";
  Canvas.ctx.strokeStyle = "#38bdf8";
  Canvas.ctx.lineWidth = 2;
  Canvas.ctx.setLineDash([6, 4]);

  Canvas.ctx.rect(originX, originY, w, h);
  Canvas.ctx.stroke();
  Canvas.ctx.fill();

  // Placement preview label
  Canvas.ctx.setLineDash([]);
  Canvas.ctx.fillStyle = "#ffffff";
  Canvas.ctx.font = "bold 11px Inter, Arial";
  Canvas.ctx.textAlign = "center";
  Canvas.fillText(`➕ Place ${State.selectedIc.name}`, originX + (w / 2), originY + (h / 2) + 4);

  Canvas.ctx.restore();
}

/**
 * Which wires the current face shows.
 *  - Component side ("logical connections"): only the hand-drawn wires.
 *  - Solder side ("physical wiring"): the router's `generated` wires, plus the
 *    hand-drawn wires of any net that has not been routed yet.
 */
function wireVisible(line: ILine, routedNetIds: Set<string>): boolean {
  if (!Canvas.solderSide) return !line.generated;
  if (line.generated) return true;
  return !(line.netId && routedNetIds.has(line.netId));
}

export function redrawCanvas() {
  resetCanvas();

  const solder = Canvas.solderSide;

  // Net highlight + short reporting are solder-side (physical) only.
  const highlight = solder && State.hoverLine ? netAtLine(State.hoverLine, State.lines) : null;
  const shortPads = solder
    ? new Set<string>([...findShorts(State.lines), ...labelConflicts(State.lines, State.placedIcs)])
    : new Set<string>();

  const routedNetIds = new Set<string>();
  for (const line of State.lines) {
    if (line.generated && line.netId) routedNetIds.add(line.netId);
  }

  // 1. IC bodies — component side only.
  if (!solder) {
    for (const ic of State.placedIcs) ic.drawBody();
  }
  // 2. Grid dots. On the component side, hide the ones a chip body conceals;
  //    on the solder side every hole is exposed.
  for (let i = 0; i < State.dots.length; i++) {
    const dot = State.dots[i];
    if (!solder && State.placedIcs.some((ic) => ic.hidesDot(dot))) continue;
    const key = dotKey(dot);
    drawDot(dot, highlight?.pads.has(key) ?? false, shortPads.has(key));
  }
  // 3. Wires — filtered by which face we are on.
  for (let i = 0; i < State.lines.length; i++) {
    const line = State.lines[i];
    if (!wireVisible(line, routedNetIds)) continue;
    drawLine(line, highlight?.lines.has(line) ?? false);
  }
  // 4. IC text badges — component side only.
  if (!solder) {
    for (const ic of State.placedIcs) ic.drawLabel();
  }
  drawIcPlacementPreview();
}
