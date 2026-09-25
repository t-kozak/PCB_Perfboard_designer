import {State} from "../state/State";
import {redrawCanvas} from "./draw-canvas";
import {Canvas} from "../state/Canvas";
import {ShortcutRegistry} from "./shortcut-keys";
import {resolveTerminal} from "../nets/derive";
import {refreshWireCache} from "./wire-cache";
import {dragIcsTo} from "./ic-drag";

Canvas.c.addEventListener('mousemove', function(e) {
  const {x, y} = Canvas.screenToBoard(e.clientX, e.clientY);

  // Check if mouse is within a dot
  State.hoverDot = undefined;
  for(let i = 0; i < State.dots.length; i++) {
    const dot = State.dots[i];
    const dx = x - dot.x;
    const dy = y - dot.y;
    if(dx * dx + dy * dy < State.dotSelectionRadius * State.dotSelectionRadius){
      State.hoverDot = dot;
      break;
    }
  }

  // The connection under the cursor. On the solder side, wires are the only
  // thing drawn — hit-test the (freshly derived) wire cache and map the segment
  // back to its connection. On the component side, hit-test the rubber bands.
  State.hoverConnection = undefined;
  if (Canvas.solderSide) {
    refreshWireCache();
    for (let i = 0; i < State.lines.length; i++) {
      const line = State.lines[i];
      const d1 = Math.hypot(line.start.x - x, line.start.y - y);
      const d2 = Math.hypot(line.end.x - x, line.end.y - y);
      const d = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
      if (Math.abs(d - (d1 + d2)) < State.lineSelectTolerance) {
        State.hoverConnection = State.connections.find(c => c.id === line.connId);
        break;
      }
    }
  } else {
    for (let i = 0; i < State.connections.length; i++) {
      const conn = State.connections[i];
      const a = resolveTerminal(conn.a, State.placedIcs);
      const b = resolveTerminal(conn.b, State.placedIcs);
      if (!a || !b) continue;
      // A band beats the component body it crosses (select.ts), so use a true
      // perpendicular distance — the ellipse test above widens to ~30px mid-span
      // on a long band and would swallow body clicks. Right on an end pin the
      // pin (component drag / Connect tool) wins.
      const nearPin = Math.min(Math.hypot(a.x - x, a.y - y), Math.hypot(b.x - x, b.y - y)) < State.dotRadius * 2;
      if (!nearPin && distanceToSegment(x, y, a, b) < State.lineSelectTolerance + 1) {
        State.hoverConnection = conn;
        break;
      }
    }
  }

  // Check if mouse is over a placed component body. Components are hidden and
  // inert on the solder side — you are working on wires there.
  State.hoverIc = Canvas.solderSide
    ? undefined
    : State.placedIcs.find(ic => ic.containsPoint(x, y));

  if (!Canvas.solderSide && (State.isDraggingIc || State.placingDuplicates.length)) {
    dragIcsTo(x, y);
  }

  redrawCanvas();
});


ShortcutRegistry.add({key: "m", description: "Move the point. select a point, then move the mouse pointer to another point, then press 'm'", event: ()=>{
    if (!State.hoverDot || !State.selectedDot){
      return;
    }

    State.dots =  State.dots.map((d)=>{
     if (d.x == State?.hoverDot?.x && d.y == State.hoverDot?.y){
       return { ...State.selectedDot, x: d.x, y: d.y};
     }
      if (d.x == State?.selectedDot?.x && d.y == State.selectedDot?.y){
        return { color: undefined, x: d.x, y: d.y};
      }
     return d
    });
    State.selectedDot = undefined
  }})

function distanceToSegment(x: number, y: number, a: {x: number; y: number}, b: {x: number; y: number}): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
}
