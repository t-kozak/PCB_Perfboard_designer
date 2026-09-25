import {Canvas} from "../state/Canvas";

/** Fill for a hole that has a component leg/pin in it (bridges, leaded legs, chip and header pins). */
export const SOLDERED_FILL = "rgba(251, 146, 60, 0.85)";

/**
 * Solid amber disc marking a hole that has a component leg/pin in it, so it
 * reads at a glance against the bare grey holes. Draws in whatever frame the
 * context is currently in.
 */
export function drawSolderedMarker(x: number, y: number, r: number, isSelected: boolean) {
  const ctx = Canvas.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = SOLDERED_FILL;
  ctx.fill();
  ctx.lineWidth = isSelected ? 3 : 2;
  ctx.strokeStyle = isSelected ? "#38bdf8" : "#c2410c";
  ctx.stroke();
  ctx.restore();
}
