import { State } from "../state/State";
import { redrawCanvas } from "./draw-canvas";
import { rebuildNets } from "../nets/rebuild";
import { dotKey, netSignature, resolveTerminal } from "../nets/derive";
import { recordChange } from "./project/undo-redo";
import { tidy } from "../routing/tidy";
import { route } from "../routing/route";
import type { RouteNet, RouteResult } from "../routing/types";
import type { ILine } from "../interfaces/line.interface";
import type { IDot } from "../interfaces/dot.interface";

// The DOM half of the routing feature. All the algorithm lives in the pure
// `src/routing/` directory; this file only marshals `State` in and out and
// records one batch undo entry per pass. See docs/logical-connections.md §3.

function canonicalDot(x: number, y: number): IDot | undefined {
  return State.dots.find(d => d.x === x && d.y === y);
}

/**
 * One `RouteNet` per multi-pad net. Terminals come from the *logical*
 * connections — every net's pads are its terminals' current pin positions,
 * resolved fresh each time so a moved/rotated component is picked up.
 */
function collectNets(): RouteNet[] {
  rebuildNets();
  const padsByNet = new Map<string, Map<string, IDot>>();
  for (const c of State.connections) {
    if (!c.netId) continue;
    const pads = padsByNet.get(c.netId) ?? new Map<string, IDot>();
    padsByNet.set(c.netId, pads);
    for (const term of [c.a, c.b]) {
      const pad = resolveTerminal(term, State.placedIcs);
      const canon = pad && canonicalDot(pad.x, pad.y);
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

/** Replace only the given nets' own generated wires, then apply the router's output. */
function runRouter(nets: RouteNet[], kind: "tidy" | "route"): RouteResult {
  const routedIds = new Set(nets.map(n => n.id));
  const kept = State.lines.filter(
    l => !l.generated || !l.netId || !routedIds.has(l.netId),
  );
  const removed = State.lines.filter(l => !kept.includes(l));

  // Only orthogonal wires already on the board count as routing obstacles
  // (crossing cost); sloppy diagonal hand-drawn wires are not physical.
  const obstacles = kept.filter(l => l.start.x === l.end.x || l.start.y === l.end.y);

  const result: RouteResult = kind === "tidy"
    ? tidy(nets)
    : route(nets, State.dots, obstacles);

  State.lines = [...kept, ...result.lines];
  recordChange({ removed, added: result.lines });
  return result;
}

/** Stamp `routedSignature` on every net that came out fully routed. */
function stampRoutedSignatures(nets: RouteNet[], result: RouteResult): void {
  for (const net of nets) {
    if (result.failed.includes(net.name)) continue;
    const stateNet = State.nets.find(n => n.id === net.id);
    if (stateNet) stateNet.routedSignature = netSignature(net.id, State.connections, State.placedIcs);
  }
}

function apply(kind: "tidy" | "route", onlyNetId?: string): void {
  let nets = collectNets();
  nets = onlyNetId
    ? nets.filter(n => n.id === onlyNetId).map(n => ({ ...n, locked: false }))
    : nets.filter(n => !n.locked);

  if (nets.length === 0) {
    announce(onlyNetId ? "That net has fewer than two pads." : "No multi-pad nets — connect some pins first.");
    return;
  }

  const result = runRouter(nets, kind);
  stampRoutedSignatures(nets, result);

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

/**
 * Flip-to-solder-side build step: rebuild nets from connections, then route
 * every net whose terminal pads have changed since its last routing pass
 * (its "signature" — see `INet.routedSignature`) and that isn't hand-locked.
 * Non-destructive and idempotent: flipping twice with no edits routes nothing.
 */
export function routeOnFlip(): void {
  const nets = collectNets();
  const stale: RouteNet[] = [];
  const staleLockedNames: string[] = [];
  let unchanged = 0;

  for (const net of nets) {
    const sig = netSignature(net.id, State.connections, State.placedIcs);
    const stateNet = State.nets.find(n => n.id === net.id);
    if (sig === stateNet?.routedSignature) {
      unchanged++;
      continue;
    }
    if (net.locked) {
      staleLockedNames.push(net.name);
      continue;
    }
    stale.push(net);
  }

  const lockedSuffix = staleLockedNames.length ? ` ${staleLockedNames.join(", ")} locked & stale.` : "";

  if (stale.length === 0) {
    announce(`Routed 0 net(s); ${unchanged} unchanged.${lockedSuffix}`);
    return;
  }

  const result = runRouter(stale, "route");
  stampRoutedSignatures(stale, result);

  redrawCanvas();
  window.dispatchEvent(new Event("nets-changed"));

  const routedCount = stale.length - result.failed.length;
  announce(
    `Routed ${routedCount} net(s); ${unchanged} unchanged.${lockedSuffix}` +
    (result.failed.length ? ` ⚠ Could not route: ${result.failed.join(", ")}.` : ""),
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

/** Drop a net's lock and re-route just that net. */
export function unlockAndRerouteNet(netId: string): void {
  const net = State.nets.find(n => n.id === netId);
  if (!net) return;
  net.locked = false;
  apply("route", net.id);
}

/** Context-menu action: drop the lock of the wire's net and re-route just that net. */
export function unlockAndReroute(line: ILine | undefined | null): void {
  if (!line?.netId) return;
  unlockAndRerouteNet(line.netId);
}

document.getElementById("tidyNetsBtn")?.addEventListener("click", () => apply("tidy"));
document.getElementById("routeNetsBtn")?.addEventListener("click", () => apply("route"));
