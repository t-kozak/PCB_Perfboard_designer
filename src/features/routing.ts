import { State } from "../state/State";
import { redrawCanvas } from "./draw-canvas";
import { rebuildNets } from "../nets/rebuild";
import { recordChange } from "./project/undo-redo";
import { dotKey } from "../nets/derive";
import { tidy } from "../routing/tidy";
import { route } from "../routing/route";
import type { RouteNet, RouteResult } from "../routing/types";
import type { ILine } from "../interfaces/line.interface";
import type { IDot } from "../interfaces/dot.interface";

// The DOM half of the routing feature. All the algorithm lives in the pure
// `src/routing/` directory; this file only marshals `State` in and out and
// records one batch undo entry per pass.

function canonicalDot(x: number, y: number): IDot | undefined {
  return State.dots.find(d => d.x === x && d.y === y);
}

/**
 * One `RouteNet` per multi-pad net. Terminals are taken from the *logical*
 * (hand-drawn) wires only — those are the "must connect" intent. Router-
 * generated wires are ignored here so re-routing doesn't accrete the turn pads
 * of a previous pass.
 */
function collectNets(): RouteNet[] {
  rebuildNets();
  const padsByNet = new Map<string, Map<string, IDot>>();
  for (const line of State.lines) {
    if (line.generated || !line.netId) continue;
    const pads = padsByNet.get(line.netId) ?? new Map<string, IDot>();
    padsByNet.set(line.netId, pads);
    for (const end of [line.start, line.end]) {
      const canon = canonicalDot(end.x, end.y);
      if (canon) pads.set(dotKey(canon), canon);
    }
  }
  return State.nets
    .map(net => ({
      id: net.id,
      name: net.name,
      locked: net.locked,
      color: net.color,
      pads: [...(padsByNet.get(net.id)?.values() ?? [])],
    }))
    .filter(net => net.pads.length >= 2);
}

function announce(message: string): void {
  const el = document.getElementById("routeStatus");
  if (el) el.textContent = message;
}

function apply(kind: "tidy" | "route", onlyNetId?: string): void {
  let nets = collectNets();
  nets = onlyNetId
    ? nets.filter(n => n.id === onlyNetId).map(n => ({ ...n, locked: false }))
    : nets.filter(n => !n.locked);

  if (nets.length === 0) {
    announce(onlyNetId ? "That net has fewer than two pads." : "No multi-pad nets — draw some wires first.");
    return;
  }

  // Non-destructive: only this pass's own generated wires are replaced. Every
  // hand-drawn wire (the logical layer) and every other net's wire is kept.
  const routedIds = new Set(nets.map(n => n.id));
  const kept = State.lines.filter(
    l => !l.generated || !l.netId || !routedIds.has(l.netId),
  );
  const removed = State.lines.filter(l => !kept.includes(l));

  // Only orthogonal wires already on the board count as routing obstacles
  // (crossing cost); sloppy diagonal logical wires are not physical.
  const obstacles = kept.filter(l => l.start.x === l.end.x || l.start.y === l.end.y);

  const result: RouteResult = kind === "tidy"
    ? tidy(nets)
    : route(nets, State.dots, obstacles);

  State.lines = [...kept, ...result.lines];
  recordChange({ removed, added: result.lines });

  rebuildNets();
  State.selectedLine = undefined;
  redrawCanvas();
  window.dispatchEvent(new Event("nets-changed"));

  const verb = kind === "tidy" ? "Tidied" : "Routed";
  announce(
    result.failed.length
      ? `⚠ Could not route: ${result.failed.join(", ")} — move a component and retry.`
      : `${verb} ${nets.length} net(s) → ${result.lines.length} wire(s).`,
  );
}

/** Mark a wire's net hand-locked so a later routing pass won't rewrite it. */
export function lockNetOf(line: ILine | undefined | null): void {
  if (!line?.netId) return;
  const net = State.nets.find(n => n.id === line.netId);
  if (net && !net.locked) {
    net.locked = true;
    window.dispatchEvent(new Event("nets-changed"));
  }
}

/** Context-menu action: drop a net's lock and re-route just that net. */
export function unlockAndReroute(line: ILine | undefined | null): void {
  if (!line?.netId) return;
  const net = State.nets.find(n => n.id === line.netId);
  if (!net) return;
  net.locked = false;
  apply("route", net.id);
}

document.getElementById("tidyNetsBtn")?.addEventListener("click", () => apply("tidy"));
document.getElementById("routeNetsBtn")?.addEventListener("click", () => apply("route"));
