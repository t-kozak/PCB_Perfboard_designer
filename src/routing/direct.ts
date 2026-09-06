/**
 * "Direct" routing mode — the trivial alternative to the orthogonal A* router
 * (docs/logical-connections.md §11). Every connection becomes one straight
 * pad-to-pad wire, run on whatever diagonal it lands on. No lattice, no
 * obstacle awareness, nothing can fail.
 */
import type { RouteEdge, RouteResult } from "./types";
import { key, wire } from "./types";

export function directWires(edges: RouteEdge[]): RouteResult {
  const lines = edges
    .filter(e => key(e.a) !== key(e.b))
    .map(e => wire(e.a, e.b, e.connId, e.netId, e.color, e.width));
  return { lines, failed: [] };
}
