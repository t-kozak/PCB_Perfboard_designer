import {State} from "../state/State";
import {IDot} from "../interfaces/dot.interface";
import {Ic} from "./ic";

/**
 * Dragging placed components. The pad nearest the cursor at grab time is the
 * anchor; each move shifts every dragged component by the same whole-pitch
 * offset from where it started, so a Shift+click group keeps its shape (and a
 * single part no longer jumps its top-left corner to the cursor). A move that
 * would push any member off the board is ignored — the group stops at the edge.
 */
let dragged: {ic: Ic; start: IDot}[] = [];
let anchor: IDot | undefined;
let padAt = new Map<string, IDot>();

const key = (x: number, y: number) => `${x},${y}`;

function nearestDot(x: number, y: number): IDot | undefined {
  let best: IDot | undefined;
  let bestD = Infinity;
  for (const dot of State.dots) {
    const d = (dot.x - x) ** 2 + (dot.y - y) ** 2;
    if (d < bestD) { bestD = d; best = dot; }
  }
  return best;
}

export function startIcDragAt(ics: Ic[], x: number, y: number): void {
  dragged = ics.filter(ic => ic.topLeftDot).map(ic => ({ic, start: ic.topLeftDot!}));
  anchor = nearestDot(x, y);
  padAt = new Map(State.dots.map(d => [key(d.x, d.y), d]));
  State.isDraggingIc = dragged.length > 0 && !!anchor;
}

export function dragIcsTo(x: number, y: number): void {
  const target = nearestDot(x, y);
  if (!anchor || !target) return;
  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;
  const moved = dragged.map(({start}) => padAt.get(key(start.x + dx, start.y + dy)));
  if (moved.some(d => !d)) return;
  dragged.forEach(({ic}, i) => { ic.topLeftDot = moved[i]!; });
}
