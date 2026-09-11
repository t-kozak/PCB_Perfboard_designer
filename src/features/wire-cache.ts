import { State } from "../state/State";
import { rebuildNets } from "../nets/rebuild";
import { dotKey, resolveTerminal } from "../nets/derive";
import { route } from "../routing/route";
import { directWires } from "../routing/direct";
import type { RouteEdge } from "../routing/types";
import type { ITerminal } from "../interfaces/connection.interface";
import type { IDot } from "../interfaces/dot.interface";

// The solder side keeps NO wire state (docs/logical-connections.md §11):
// `State.lines` is a transient cache that `refreshWireCache()` recomputes from
// the connection list whenever any input to routing changes. The pure
// algorithm lives in `src/routing/`; this module marshals `State` in and out.
// It must not import `draw-canvas` (draw-canvas imports it).

export const DEFAULT_WIRE_COLOR = "#3b82f6";
export const DEFAULT_WIRE_WIDTH = 4;

function canonicalDot(x: number, y: number): IDot | undefined {
  return State.dots.find(d => d.x === x && d.y === y);
}

/** Board pad a terminal currently resolves to, snapped to the canonical grid entry. */
function terminalDot(t: ITerminal): IDot | undefined {
  const pad = resolveTerminal(t, State.placedIcs);
  return pad ? canonicalDot(pad.x, pad.y) : undefined;
}

/**
 * A wire is always drawn in its net's colour — never a per-connection value
 * (that concept is gone). `rebuildNets()` runs just before `collectEdges()`, so
 * `State.nets` and every `IConnection.netId` are fresh here.
 */
function netColorOf(netId: string | undefined): string {
  return State.nets.find(n => n.id === netId)?.color ?? DEFAULT_WIRE_COLOR;
}

/** One `RouteEdge` per connection whose terminals both resolve to distinct pads. */
function collectEdges(): RouteEdge[] {
  const edges: RouteEdge[] = [];
  for (const c of State.connections) {
    const a = terminalDot(c.a);
    const b = terminalDot(c.b);
    if (!a || !b || (a.x === b.x && a.y === b.y)) continue;
    edges.push({
      connId: c.id,
      netId: c.netId ?? c.id,
      a,
      b,
      color: netColorOf(c.netId),
      width: c.width ?? DEFAULT_WIRE_WIDTH,
    });
  }
  return edges;
}

/**
 * Every hole with a component pin soldered into it — wire may end on one of
 * its own net's joints but never run across one (autorouting.md §3). Includes
 * pins nothing is wired to: an unconnected pin is still solder in the hole.
 */
function solderedPads(): IDot[] {
  const pads: IDot[] = [];
  const seen = new Set<string>();
  for (const ic of State.placedIcs) {
    for (let pin = 1; pin <= ic.pinCount; pin++) {
      const p = ic.pinDot(pin);
      if (!p || seen.has(dotKey(p))) continue;
      seen.add(dotKey(p));
      const pad = canonicalDot(p.x, p.y);
      if (pad) pads.push(pad);
    }
  }
  return pads;
}

/**
 * Full input signature of the router: routing mode, every solder joint on the
 * board, the derived net list (id → colour, since a wire is drawn in its net's
 * colour), plus every connection's id / net / width and both its terminals'
 * current pad keys. A component move, rotate or delete, a bridge placement, or
 * a net recolour all change a field here — so the cache can never be silently
 * stale. Solder joints are in their own right because a component nothing is
 * wired to still steers the router.
 */
function wireSignature(soldered: IDot[]): string {
  const nets = State.nets.map(n => `${n.id}=${n.color ?? ""}`).sort().join(" ");
  const parts: string[] = [
    State.routingMode,
    `pins:${soldered.map(dotKey).sort().join(" ")}`,
    `nets:${nets}`,
  ];
  for (const c of State.connections) {
    const a = terminalDot(c.a);
    const b = terminalDot(c.b);
    parts.push(
      `${c.id}:${c.netId ?? ""}:${c.width ?? ""}:${a ? dotKey(a) : "-"}:${b ? dotKey(b) : "-"}`,
    );
  }
  return parts.sort().join("|");
}

function announce(failedConnIds: string[]): void {
  const el = document.getElementById("routeStatus");
  if (!el) return;
  if (failedConnIds.length === 0) {
    el.textContent = "";
    return;
  }
  const label = (t: ITerminal) => {
    const ic = State.placedIcs.find(i => i.id === t.icId);
    return ic ? `${ic.name}·${t.pin}` : `?·${t.pin}`;
  };
  const names = failedConnIds.map(id => {
    const c = State.connections.find(x => x.id === id);
    return c ? `${label(c.a)} ↔ ${label(c.b)}` : id;
  });
  el.textContent = `⚠ Could not route: ${names.join(", ")} — move a component and retry.`;
}

let cacheSig: string | null = null;

/**
 * Recompute `State.lines` from the connection list if any routing input has
 * changed. Cheap to call on every repaint — the signature check short-circuits
 * when nothing relevant moved.
 */
export function refreshWireCache(): void {
  const soldered = solderedPads();
  const sig = wireSignature(soldered);
  if (sig === cacheSig) return;
  rebuildNets();
  const edges = collectEdges();
  const result =
    State.routingMode === "direct"
      ? directWires(edges)
      : route(edges, State.dots, { soldered });
  State.lines = result.lines;
  cacheSig = sig;
  announce(result.failed);
}

/** Force the next `refreshWireCache()` to recompute. */
export function invalidateWireCache(): void {
  cacheSig = null;
}
