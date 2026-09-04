/**
 * M4 — MST tidy. For each non-locked net, the minimum spanning tree over its
 * pads by Manhattan distance (Prim's), emitted as direct pin-to-pin wires.
 * ~60% of routing's value for ~10% of the code: name five pads GND, get the
 * four shortest wires joining them.
 */
import type { IDot } from "../interfaces/dot.interface";
import type { ILine } from "../interfaces/line.interface";
import { RouteNet, RouteOpts, RouteResult, DEFAULT_OPTS, key, manhattan, wire } from "./types";

/**
 * Minimum spanning tree over `pads` by Manhattan distance. Output depends only
 * on the pad *set*, not its order (pads are sorted first, ties broken by
 * coordinate key), so re-running tidy over its own output is a no-op.
 */
export function mst(pads: IDot[]): Array<[IDot, IDot]> {
  const nodes = [...pads].sort((a, b) => a.x - b.x || a.y - b.y);
  if (nodes.length < 2) return [];

  const inTree = new Set<number>([0]);
  const edges: Array<[IDot, IDot]> = [];

  while (inTree.size < nodes.length) {
    let best: { i: number; j: number; d: number } | null = null;
    for (const i of inTree) {
      for (let j = 0; j < nodes.length; j++) {
        if (inTree.has(j)) continue;
        const d = manhattan(nodes[i], nodes[j]);
        if (
          !best ||
          d < best.d ||
          (d === best.d && key(nodes[j]) < key(nodes[best.j]))
        ) {
          best = { i, j, d };
        }
      }
    }
    if (!best) break;
    edges.push([nodes[best.i], nodes[best.j]]);
    inTree.add(best.j);
  }
  return edges;
}

export function tidy(nets: RouteNet[], opts: RouteOpts = {}): RouteResult {
  const o = { ...DEFAULT_OPTS, ...opts };
  const lines: ILine[] = [];

  for (const net of nets) {
    if (net.locked || net.pads.length < 2) continue;
    for (const [a, b] of mst(net.pads)) {
      lines.push(wire(a, b, net.id, net.color ?? o.wireColor, o.wireWidth));
    }
  }
  return { lines, failed: [] };
}
