import {resetCanvas} from "./reset-canvas";
import {State} from "../state/State";
import {Canvas} from "../state/Canvas";
import {IDot} from "../interfaces/dot.interface";
import {ILine} from "../interfaces/line.interface";
import {wiresOfNet, netAtTerminal, dotKey, resolveTerminal, terminalAtDot} from "../nets/derive";
import {drawGridLabels} from "./grid-labels";
import {scheduleAutosave} from "./project/autosave";
import {refreshWireCache, DEFAULT_WIRE_COLOR} from "./wire-cache";

function netColor(netId: string | undefined): string | undefined {
  if (!netId) return undefined;
  return State.nets.find(n => n.id === netId)?.color;
}

/** The colour every pad is created with — treated as "no explicit colour" so a net tint can show through. */
const DEFAULT_PAD_COLOR = "#a4a0a0";

function drawDot(dot: IDot, onHoverNet: boolean, netFill?: string){
  // Fill precedence: a non-default pad colour the user picked wins; otherwise
  // the solder-side net-terminal tint (so you can see what's soldered where);
  // then the default bare-copper grey.
  const userColor = dot.color && dot.color !== DEFAULT_PAD_COLOR ? dot.color : undefined;
  Canvas.ctx.beginPath();
  Canvas.ctx.arc(dot.x, dot.y, State.dotRadius, 0, Math.PI*2);
  Canvas.ctx.fillStyle = userColor || netFill || DEFAULT_PAD_COLOR;
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
  // A wire's colour is its connection's colour (see wire-cache.ts).
  const stroke = line.color || "#777676";
  const isSelected = !!line.connId && line.connId === State.selectedConnection?.id;
  const isHover = !!line.connId && line.connId === State.hoverConnection?.id;

  // Net highlight — everything electrically joined to the hovered wire.
  if (onHoverNet && !isSelected && !isHover) {
    Canvas.ctx.beginPath();
    Canvas.ctx.moveTo(line.start.x, line.start.y);
    Canvas.ctx.lineTo(line.end.x, line.end.y);
    Canvas.ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
    Canvas.ctx.lineWidth = baseWidth + 5;
    Canvas.ctx.lineCap = "round";
    Canvas.ctx.stroke();
  }

  // Selected line glowing highlight & terminal node handles
  if (isSelected) {
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
  } else if (isHover) {
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

/**
 * A connection, rendered as a dashed/translucent "schematic overlay" rubber
 * band — deliberately distinct from the solid, round-capped `drawLine()`
 * stroke so it never reads as copper (docs/logical-connections.md §3).
 */
function drawRubberBand(a: {x: number; y: number}, b: {x: number; y: number}, color: string, emphasis: "none" | "hover" | "selected") {
  const ctx = Canvas.ctx;
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = emphasis === "selected" ? "#38bdf8" : emphasis === "hover" ? "#94a3b8" : color;
  ctx.lineWidth = emphasis === "none" ? 2 : 3;
  ctx.globalAlpha = emphasis === "none" ? 0.8 : 1;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
  ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawConnections(highlightTerms: Set<string> | null) {
  for (const conn of State.connections) {
    const a = resolveTerminal(conn.a, State.placedIcs);
    const b = resolveTerminal(conn.b, State.placedIcs);
    if (!a || !b) continue;
    const isSelected = conn === State.selectedConnection;
    const isHover = !isSelected && (conn === State.hoverConnection || (highlightTerms?.has(`${conn.a.icId}#${conn.a.pin}`) ?? false));
    drawRubberBand(a, b, netColor(conn.netId) || "#38bdf8", isSelected ? "selected" : isHover ? "hover" : "none");
  }

  // Pending terminal: rubber band from the armed pin to the cursor.
  if (State.pendingTerminal && State.hoverDot) {
    const from = resolveTerminal(State.pendingTerminal, State.placedIcs);
    if (from) drawRubberBand(from, State.hoverDot, "#38bdf8", "hover");
  }
}

/** True when `dot` is a pin that belongs to the given highlighted-terminal set. */
function dotInHighlightedNet(dot: IDot, terms: Set<string> | null): boolean {
  if (!terms) return false;
  const t = terminalAtDot(dot, State.placedIcs);
  return !!t && terms.has(`${t.icId}#${t.pin}`);
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

export function redrawCanvas() {
  resetCanvas();
  drawGridLabels();

  const solder = Canvas.solderSide;

  // Wires are stateless — (re)derive them from the connection list before any
  // solder-side hit-testing or drawing reads `State.lines`.
  if (solder) refreshWireCache();

  // Net highlight is solder-side (physical) only. Keyed off the connection
  // under the cursor (its wire, resolved by netId).
  const highlight = solder && State.hoverConnection?.netId
    ? wiresOfNet(State.hoverConnection.netId, State.lines)
    : null;

  // Solder-side: tint every pad a wire lands on with that wire's colour, so the
  // copper view shows at a glance which trace terminates where. A wire is always
  // drawn in its net's colour (the exact value `drawLine()` strokes with, see
  // wire-cache.ts), so a pad always matches the wire you see running into it.
  const terminalNetFill = new Map<string, string>();
  if (solder) {
    for (const conn of State.connections) {
      const tint = netColor(conn.netId) || DEFAULT_WIRE_COLOR;
      for (const t of [conn.a, conn.b]) {
        const pad = resolveTerminal(t, State.placedIcs);
        if (pad) terminalNetFill.set(dotKey(pad), tint);
      }
    }
  }

  // Component-side net highlight, from whichever pin/connection is hovered.
  const hoverTerm = !solder ? (State.hoverConnection?.a ?? (State.hoverDot && terminalAtDot(State.hoverDot, State.placedIcs))) : undefined;
  const componentHighlight = hoverTerm ? netAtTerminal(hoverTerm, State.connections) : null;

  // 1. Grid dots — every hole, drawn before any component body so a chip's
  //    package/artwork (step 2) paints over whichever ones it covers.
  for (let i = 0; i < State.dots.length; i++) {
    const dot = State.dots[i];
    const key = dotKey(dot);
    const onHoverNet = solder
      ? (highlight?.pads.has(key) ?? false)
      : dotInHighlightedNet(dot, componentHighlight?.terminals ?? null);
    drawDot(dot, onHoverNet, terminalNetFill.get(key));
  }
  // 2. IC bodies. Component side: drawn solid on top of the dots they conceal.
  //    Solder side: the same mirrored artwork, but as faint 20%-opacity ghosts
  //    so you can line copper up with the parts overhead without the packages
  //    dominating the copper view. Drawn before the wires (step 3) so traces
  //    stay fully opaque over them. Selection chrome is suppressed — components
  //    are inert on this face.
  if (!solder) {
    for (const ic of State.placedIcs) ic.drawBody();
  } else {
    const keepSelected = State.selectedPlacedIc;
    State.selectedPlacedIc = undefined;
    Canvas.ctx.save();
    Canvas.ctx.globalAlpha = 0.4;
    for (const ic of State.placedIcs) ic.drawBody();
    Canvas.ctx.restore();
    State.selectedPlacedIc = keepSelected;
  }
  // 2b. Re-draw each component's own pins on top of its body/artwork so they
  //     stay visible — only foreign holes stay obscured underneath. Leaded
  //     parts/bridges paint nothing over their pads, so they're skipped; a pin
  //     header already draws its own silver pin marker over each hole
  //     (drawPinHeaderBody), so re-punching a plain grey dot on top would just
  //     hide it again.
  if (!solder) {
    const dotByKey = new Map<string, IDot>(State.dots.map((dot) => [dotKey(dot), dot]));
    for (const ic of State.placedIcs) {
      if (ic.isLeaded || ic.isBridge || ic.kind === "pin-header") continue;
      for (let pin = 1; pin <= ic.pinCount; pin++) {
        const coord = ic.pinDot(pin);
        const dot = coord && dotByKey.get(dotKey(coord));
        if (!dot) continue;
        drawDot(dot, dotInHighlightedNet(dot, componentHighlight?.terminals ?? null));
      }
    }
  }
  // 3. Wires (solder side) or connections (component side) — mutually exclusive faces.
  if (solder) {
    for (let i = 0; i < State.lines.length; i++) {
      const line = State.lines[i];
      drawLine(line, highlight?.lines.has(line) ?? false);
    }
  } else {
    drawConnections(componentHighlight?.terminals ?? null);
  }
  // 4. IC text badges — component side only.
  if (!solder) {
    for (const ic of State.placedIcs) ic.drawLabel();
  }
  drawIcPlacementPreview();

  // Persist the project to localStorage after any mutation (debounced, no-op
  // when unchanged). See project/autosave.ts.
  scheduleAutosave();
}
