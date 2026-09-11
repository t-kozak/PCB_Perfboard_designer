/**
 * Orthogonal router. Each connection's a→b edge is pathed with A* over the pad
 * lattice, shortest edge first.
 *
 * Graph edges are *straight runs*, not unit steps: from a pad you jump to any
 * pad in its row or column at cost `length + turn penalty`, so a route is a
 * handful of long segments instead of forty tiny ones — which matters because
 * every segment is a rendered line.
 *
 * Three hard constraints (autorouting.md §3):
 *
 * 1. **Two *nets* never share a pad.** A route may *pass over* a foreign bare
 *    hole (small cost) but never stop or turn on one, and once a net has
 *    claimed a pad, other nets treat it as foreign. Edges of the *same* net
 *    freely share pads (a daisy chain A–B, B–C meets at B).
 * 2. **A *channel* carries at most one wire.** A channel is the gap between two
 *    adjacent pads in a row or column — the atomic piece of board a wire can
 *    occupy. Wires may *cross* (they meet at a pad, using perpendicular
 *    channels: the whole point of a perfboard), but two wires may never run
 *    along the same stretch of the same row or column, which would draw one on
 *    top of the other and hide it. This one applies across *all* wires, same
 *    net included — two physical wires are two physical wires.
 * 3. **A solder joint is never crossed.** A hole with a component pin in it
 *    (`RouteBoard.soldered`) stops a run dead: the wire may *end* there if the
 *    joint belongs to its own net — that is how a daisy chain reaches a pin —
 *    but it may not run across it, and it may not land on some other
 *    component's pin at all.
 *
 * An edge that cannot be routed under both rules is reported by id, never
 * silently dropped. Because the constraints are hard, order matters: the whole
 * board is re-routed a couple of times with the previous round's failures moved
 * to the front, and the best attempt wins.
 */
import type { IDot } from "../interfaces/dot.interface";
import type { ILine } from "../interfaces/line.interface";
import {
  RouteBoard,
  RouteEdge,
  RouteOpts,
  RouteResult,
  DEFAULT_OPTS,
  key,
  manhattan,
  wire,
} from "./types";
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

/** How many times the board is re-routed, prioritising the failures each time. */
const MAX_ATTEMPTS = 3;

export function route(
  edges: RouteEdge[],
  allPads: IDot[],
  board: RouteBoard = {},
  opts: RouteOpts = {},
): RouteResult {
  const o = { ...DEFAULT_OPTS, ...opts };

  let best = attempt(edges, allPads, board, o, []);
  let priority: string[] = [];
  for (let i = 1; i < MAX_ATTEMPTS && best.failed.length > 0; i++) {
    // Retry with the losers first — a hard constraint makes ordering matter,
    // and an edge that lost the race for a channel often fits when it goes
    // first. Deterministic: same input, same rounds, same output.
    const next = best.failed;
    if (next.join(",") === priority.join(",")) break;
    priority = next;
    const res = attempt(edges, allPads, board, o, priority);
    if (res.failed.length < best.failed.length) best = res;
  }
  return best;
}

/** One full routing pass. `priority` connIds are routed before everything else. */
function attempt(
  edges: RouteEdge[],
  allPads: IDot[],
  board: RouteBoard,
  o: Required<RouteOpts>,
  priority: string[],
): RouteResult {
  // --- pad lattice --------------------------------------------------------
  // Edge endpoints join the lattice even if they aren't in `allPads`, so a
  // terminal off the board grid still has a row and a column to travel.
  const padByKey = new Map<string, IDot>();
  const adopt = (p: IDot): void => {
    if (!padByKey.has(key(p))) padByKey.set(key(p), p);
  };
  for (const p of allPads) adopt(p);
  for (const e of edges) {
    adopt(e.a);
    adopt(e.b);
  }
  const canon = (p: IDot): IDot => padByKey.get(key(p)) ?? p;

  const colPads = new Map<number, IDot[]>();
  const rowPads = new Map<number, IDot[]>();
  for (const p of padByKey.values()) {
    push(colPads, p.x, p);
    push(rowPads, p.y, p);
  }
  for (const arr of colPads.values()) arr.sort((a, b) => a.y - b.y);
  for (const arr of rowPads.values()) arr.sort((a, b) => a.x - b.x);
  const colIndex = indexPads(colPads);
  const rowIndex = indexPads(rowPads);

  // --- pad ownership (hard constraint 1), keyed by net --------------------
  const owner = new Map<string, string>();
  for (const e of edges) {
    for (const p of [e.a, e.b]) if (!owner.has(key(p))) owner.set(key(p), e.netId);
  }

  // --- channel occupancy (hard constraint 2) ------------------------------
  const usedChannels = new Set<string>();

  // --- solder joints (hard constraint 3) ----------------------------------
  const soldered = new Set((board.soldered ?? []).map(key));

  // --- crossing index: fixed coordinate → the spans of wire sitting on it --
  const vSpans = new Map<number, Array<[number, number]>>(); // x → [yLo, yHi]
  const hSpans = new Map<number, Array<[number, number]>>(); // y → [xLo, xHi]

  for (const l of board.obstacles ?? []) {
    if (!l.start || !l.end) continue;
    claim(canon(l.start), canon(l.end));
  }

  // --- one edge per connection, priority first then globally shortest -----
  const rank = new Map(priority.map((id, i) => [id, i]));
  const ordered = edges
    .filter(e => key(e.a) !== key(e.b))
    .map(e => ({ ...e, a: canon(e.a), b: canon(e.b) }))
    .sort(
      (e1, e2) =>
        (rank.get(e1.connId) ?? Infinity) - (rank.get(e2.connId) ?? Infinity) ||
        manhattan(e1.a, e1.b) - manhattan(e2.a, e2.b) ||
        (e1.connId < e2.connId ? -1 : 1),
    );

  const lines: ILine[] = [];
  const failed: string[] = [];

  for (const e of ordered) {
    const path = routeEdge(e);
    if (!path) {
      failed.push(e.connId);
      continue;
    }
    for (const seg of toSegments(path)) {
      lines.push(wire(seg.a, seg.b, e.connId, e.netId, e.color, e.width));
      claim(seg.a, seg.b);
    }
    // Claim every pad this path stopped on so other nets don't short onto it.
    for (const p of path) if (!owner.has(key(p))) owner.set(key(p), e.netId);
  }

  return { lines, failed };

  // --- edge routing -------------------------------------------------------
  function routeEdge(e: RouteEdge): IDot[] | null {
    const goalKey = key(e.b);
    const result = astar<Node>({ pad: e.a, axis: "none" }, n => key(n.pad) === goalKey, {
      key: n => `${key(n.pad)}|${n.axis}`,
      heuristic: n => manhattan(n.pad, e.b),
      neighbors: n => neighborsOf(e.netId, n, goalKey),
    });
    return result ? result.map(n => n.pad) : null;
  }

  /**
   * Straight runs leaving `n.pad`, walked outward pad by pad in all four
   * directions. Walking (rather than scanning the whole row) is what makes the
   * channel rule enforceable: an occupied channel *stops* the walk, so a run
   * can never hop over a stretch another wire already owns.
   */
  function neighborsOf(netId: string, n: Node, goalKey: string): Array<{ node: Node; cost: number }> {
    const here = n.pad;
    const hk = key(here);
    const out: Array<{ node: Node; cost: number }> = [];

    const col = colPads.get(here.x);
    const ci = colIndex.get(hk);
    if (col && ci !== undefined) {
      walk(col, ci, 1, "v");
      walk(col, ci, -1, "v");
    }
    const row = rowPads.get(here.y);
    const ri = rowIndex.get(hk);
    if (row && ri !== undefined) {
      walk(row, ri, 1, "h");
      walk(row, ri, -1, "h");
    }
    return out;

    function walk(arr: IDot[], from: number, step: number, axis: Axis): void {
      const turn = n.axis !== "none" && n.axis !== axis ? o.turnPenalty : 0;
      let foreign = 0;
      let crossings = 0;
      for (let i = from + step; i >= 0 && i < arr.length; i += step) {
        const prev = arr[i - step];
        // The channel rule: an occupied gap is a wall, not a toll.
        if (usedChannels.has(channelKey(prev, arr[i]))) return;
        // `prev` is now strictly inside the run, so foreign wire through it
        // is a crossing — cheap, but worth steering around.
        if (prev !== here) crossings += crossingsAt(prev, axis);

        const q = arr[i];
        const qk = key(q);
        const own = owner.get(qk);
        const mine = own === netId || qk === goalKey;
        const hop = {
          node: { pad: q, axis },
          cost:
            manhattan(here, q) +
            turn +
            foreign * o.foreignPadPenalty +
            crossings * o.crossingPenalty,
        };

        if (soldered.has(qk)) {
          // A solder joint is a wall with a door: this net's own wire may end
          // on it, anything else stops here — and nothing runs across it.
          if (mine) out.push(hop);
          return;
        }
        if (own !== undefined && !mine) {
          // Foreign bare hole: legal to pass over, never to stop or turn on.
          foreign++;
          continue;
        }
        out.push(hop);
      }
    }
  }

  /** Foreign wire crossing pad `p` perpendicular to a run travelling `axis`. */
  function crossingsAt(p: IDot, axis: Axis): number {
    const spans = axis === "h" ? vSpans.get(p.x) : hSpans.get(p.y);
    if (!spans) return 0;
    const v = axis === "h" ? p.y : p.x;
    let count = 0;
    for (const [lo, hi] of spans) if (v > lo && v < hi) count++;
    return count;
  }

  /** Mark a placed segment: every channel it covers, plus its crossing span. */
  function claim(a: IDot, b: IDot): void {
    if (a.x === b.x && a.y !== b.y) {
      pushSpan(vSpans, a.x, a.y, b.y);
      occupy(colPads.get(a.x), colIndex, a, b);
    } else if (a.y === b.y && a.x !== b.x) {
      pushSpan(hSpans, a.y, a.x, b.x);
      occupy(rowPads.get(a.y), rowIndex, a, b);
    }
  }

  function occupy(
    arr: IDot[] | undefined,
    index: Map<string, number>,
    a: IDot,
    b: IDot,
  ): void {
    const i = index.get(key(a));
    const j = index.get(key(b));
    if (!arr || i === undefined || j === undefined) return;
    for (let k = Math.min(i, j); k < Math.max(i, j); k++) {
      usedChannels.add(channelKey(arr[k], arr[k + 1]));
    }
  }
}

function push(map: Map<number, IDot[]>, k: number, v: IDot): void {
  const arr = map.get(k);
  if (arr) arr.push(v);
  else map.set(k, [v]);
}

function pushSpan(map: Map<number, Array<[number, number]>>, k: number, a: number, b: number): void {
  const span: [number, number] = [Math.min(a, b), Math.max(a, b)];
  const arr = map.get(k);
  if (arr) arr.push(span);
  else map.set(k, [span]);
}

/** `key(pad) → its index` within each sorted row/column, for the walk. */
function indexPads(map: Map<number, IDot[]>): Map<string, number> {
  const index = new Map<string, number>();
  for (const arr of map.values()) arr.forEach((p, i) => index.set(key(p), i));
  return index;
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

/** Identity of the gap between two adjacent pads — the unit a wire occupies. */
const channelKey = (a: IDot, b: IDot): string => [key(a), key(b)].sort().join("-");
