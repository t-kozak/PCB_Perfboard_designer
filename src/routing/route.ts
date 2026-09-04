/**
 * M5 — orthogonal router. Each MST edge is pathed with A* over the pad lattice,
 * shortest edge first, no rip-up-and-retry.
 *
 * Graph edges are *straight runs*, not unit steps: from a pad you jump to any
 * pad in its row or column at cost `length + turn penalty`, so a route is a
 * handful of long segments instead of forty tiny ones — which matters because
 * every segment is a rendered line and part of an undo entry.
 *
 * The one hard constraint (autorouting.md §3): two nets never share a pad. A
 * route may *pass over* a foreign pad (small cost) but never stop or turn on
 * one, and once a net has claimed a pad, later nets treat it as foreign — so an
 * impossible net is reported by name, never silently dropped.
 */
import type { IDot } from "../interfaces/dot.interface";
import type { ILine } from "../interfaces/line.interface";
import { RouteNet, RouteOpts, RouteResult, DEFAULT_OPTS, key, manhattan, wire } from "./types";
import { mst } from "./tidy";
import { astar } from "./astar";

type Axis = "h" | "v" | "none";
interface Node {
  pad: IDot;
  axis: Axis;
}
interface Seg {
  a: IDot;
  b: IDot;
}

export function route(
  nets: RouteNet[],
  allPads: IDot[],
  obstacles: ILine[] = [],
  opts: RouteOpts = {},
): RouteResult {
  const o = { ...DEFAULT_OPTS, ...opts };

  // --- pad lattice --------------------------------------------------------
  const colPads = new Map<number, IDot[]>();
  const rowPads = new Map<number, IDot[]>();
  for (const p of allPads) {
    push(colPads, p.x, p);
    push(rowPads, p.y, p);
  }
  for (const arr of colPads.values()) arr.sort((a, b) => a.y - b.y);
  for (const arr of rowPads.values()) arr.sort((a, b) => a.x - b.x);

  // --- pad ownership (the hard constraint) -------------------------------
  const owner = new Map<string, string>();
  for (const net of nets) {
    for (const p of net.pads) if (!owner.has(key(p))) owner.set(key(p), net.id);
  }

  const segments: Seg[] = obstacles
    .filter(l => l.start && l.end)
    .map(l => ({ a: l.start, b: l.end }));

  // --- every MST edge, globally shortest first --------------------------
  const edges: Array<{ net: RouteNet; a: IDot; b: IDot; d: number }> = [];
  for (const net of nets) {
    if (net.locked || net.pads.length < 2) continue;
    for (const [a, b] of mst(net.pads)) edges.push({ net, a, b, d: manhattan(a, b) });
  }
  edges.sort((e1, e2) => e1.d - e2.d);

  const lines: ILine[] = [];
  const failed = new Set<string>();
  const emitted = new Set<string>();

  for (const { net, a, b } of edges) {
    const path = routeEdge(net, a, b);
    if (!path) {
      failed.add(net.name);
      continue;
    }
    for (const seg of toSegments(path)) {
      const sig = segKey(seg.a, seg.b);
      if (emitted.has(sig)) continue;
      emitted.add(sig);
      lines.push(wire(seg.a, seg.b, net.id, net.color ?? o.wireColor, o.wireWidth));
      segments.push(seg);
    }
    // Claim every pad this net's path touched so no later net shorts onto it.
    for (const p of path) if (!owner.has(key(p))) owner.set(key(p), net.id);
  }

  return { lines, failed: [...failed] };

  // --- edge routing ----------------------------------------------------
  function routeEdge(net: RouteNet, from: IDot, to: IDot): IDot[] | null {
    const goalKey = key(to);
    const result = astar<Node>(
      { pad: from, axis: "none" },
      n => key(n.pad) === goalKey,
      {
        key: n => `${key(n.pad)}|${n.axis}`,
        heuristic: n => manhattan(n.pad, to),
        neighbors: n => neighborsOf(net, n, goalKey),
      },
    );
    return result ? result.map(n => n.pad) : null;
  }

  function neighborsOf(net: RouteNet, n: Node, goalKey: string): Array<{ node: Node; cost: number }> {
    const here = n.pad;
    const out: Array<{ node: Node; cost: number }> = [];
    const collinear = [...(colPads.get(here.x) ?? []), ...(rowPads.get(here.y) ?? [])];

    for (const q of collinear) {
      if (q === here) continue;
      const qk = key(q);
      const own = owner.get(qk);
      // May only stop/turn on an empty pad or one already on this net.
      if (own !== undefined && own !== net.id && qk !== goalKey) continue;

      const axis: Axis = q.x === here.x ? "v" : "h";
      const turn = n.axis !== "none" && n.axis !== axis ? o.turnPenalty : 0;
      const cost =
        manhattan(here, q) +
        turn +
        foreignBetween(net, here, q) * o.foreignPadPenalty +
        crossingCount(here, q) * o.crossingPenalty;
      out.push({ node: { pad: q, axis }, cost });
    }
    return out;
  }

  function foreignBetween(net: RouteNet, p: IDot, q: IDot): number {
    let count = 0;
    if (p.x === q.x) {
      const lo = Math.min(p.y, q.y);
      const hi = Math.max(p.y, q.y);
      for (const r of colPads.get(p.x) ?? []) {
        if (r.y <= lo || r.y >= hi) continue;
        const own = owner.get(key(r));
        if (own !== undefined && own !== net.id) count++;
      }
    } else {
      const lo = Math.min(p.x, q.x);
      const hi = Math.max(p.x, q.x);
      for (const r of rowPads.get(p.y) ?? []) {
        if (r.x <= lo || r.x >= hi) continue;
        const own = owner.get(key(r));
        if (own !== undefined && own !== net.id) count++;
      }
    }
    return count;
  }

  function crossingCount(p: IDot, q: IDot): number {
    let count = 0;
    for (const s of segments) if (perpendicularCross(p, q, s.a, s.b)) count++;
    return count;
  }
}

function push(map: Map<number, IDot[]>, k: number, v: IDot): void {
  const arr = map.get(k);
  if (arr) arr.push(v);
  else map.set(k, [v]);
}

const direction = (a: IDot, b: IDot): Axis => (a.x === b.x ? "v" : "h");

/** Collapse an A* pad path into its straight segments. */
function toSegments(path: IDot[]): Seg[] {
  if (path.length < 2) return [];
  const segs: Seg[] = [];
  let anchor = path[0];
  for (let i = 1; i < path.length; i++) {
    const cur = path[i];
    const sameAsNext =
      i + 1 < path.length && direction(path[i - 1], cur) === direction(cur, path[i + 1]);
    if (!sameAsNext) {
      segs.push({ a: anchor, b: cur });
      anchor = cur;
    }
  }
  return segs;
}

const segKey = (a: IDot, b: IDot): string =>
  [key(a), key(b)].sort().join("-");

/** True when an axis-aligned h-segment and v-segment cross strictly interior. */
function perpendicularCross(a: IDot, b: IDot, c: IDot, d: IDot): boolean {
  const abHorizontal = a.y === b.y;
  const cdHorizontal = c.y === d.y;
  if (abHorizontal === cdHorizontal) return false;
  const [h1, h2, v1, v2] = abHorizontal ? [a, b, c, d] : [c, d, a, b];
  const hy = h1.y;
  const vx = v1.x;
  const hxLo = Math.min(h1.x, h2.x);
  const hxHi = Math.max(h1.x, h2.x);
  const vyLo = Math.min(v1.y, v2.y);
  const vyHi = Math.max(v1.y, v2.y);
  return vx > hxLo && vx < hxHi && hy > vyLo && hy < vyHi;
}
