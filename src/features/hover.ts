import {State} from "../state/State";
import {redrawCanvas} from "./draw-canvas";
import {Canvas} from "../state/Canvas";
import {Utils} from "../utils/utils";
import {ShortcutRegistry} from "./shortcut-keys";
import {resolveTerminal} from "../nets/derive";
import {dotCoordinateLabel} from "./grid-labels";

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

  // Check if mouse is within a line
  State.hoverLine = undefined;
  for(let i = 0; i < State.lines.length; i++) {
    const line = State.lines[i];
    const dx1 = line.start.x - x;
    const dy1 = line.start.y - y;
    const dx2 = line.end.x - x;
    const dy2 = line.end.y - y;
    const d1 = Math.sqrt(dx1*dx1 + dy1*dy1); // distance from start dot to point
    const d2 = Math.sqrt(dx2*dx2 + dy2*dy2); // distance from end dot to point
    const d = Math.sqrt(Math.pow(line.end.x-line.start.x, 2) + Math.pow(line.end.y-line.start.y, 2)); // distance from start dot to end dot
    if (Math.abs(d - (d1 + d2)) < State.lineSelectTolerance) { // increased tolerance to 10
      State.hoverLine = line;
      break;
    }
  }

  // Connections are a component-side concept — the solder side hides components.
  State.hoverConnection = undefined;
  if (!Canvas.solderSide) {
    for (let i = 0; i < State.connections.length; i++) {
      const conn = State.connections[i];
      const a = resolveTerminal(conn.a, State.placedIcs);
      const b = resolveTerminal(conn.b, State.placedIcs);
      if (!a || !b) continue;
      const d1 = Math.hypot(a.x - x, a.y - y);
      const d2 = Math.hypot(b.x - x, b.y - y);
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (Math.abs(d - (d1 + d2)) < State.lineSelectTolerance) {
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

  if (!Canvas.solderSide && State.isDraggingIc && State.selectedPlacedIc) {
    State.selectedPlacedIc.updatePosition(x, y);
  }

  redrawCanvas();

  // Readout: the hovered pad's board coordinate ("B4"), then any note on it.
  const hoverNote = State.hoverIc?.description || State.hoverDot?.description;
  const coord = State.hoverDot ? dotCoordinateLabel(State.hoverDot) : null;
  Utils.getSafeHtmlElement('dotDescription').innerText =
    [coord, hoverNote].filter(Boolean).join(' — ');
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
        return { description: undefined, color: undefined, x: d.x, y: d.y};
      }
     return d
    });
    State.selectedDot = undefined
  }})
