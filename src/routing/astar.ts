/**
 * Generic A* over an implicitly-defined graph. Pure — no app types. Used by
 * route.ts to path each MST edge across the pad lattice. A 30×20 board is ~600
 * pads, so this returns instantly; resist anything more elaborate.
 */

export interface AStarGraph<N> {
  /** Stable string identity for a node (collapses equal states). */
  key(node: N): string;
  /** Outgoing edges with their non-negative step cost. */
  neighbors(node: N): Array<{ node: N; cost: number }>;
  /** Admissible lower bound on remaining cost to a goal. */
  heuristic(node: N): number;
}

class MinHeap<T> {
  private items: T[] = [];
  constructor(private less: (a: T, b: T) => boolean) {}
  get size(): number {
    return this.items.length;
  }
  push(item: T): void {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): T | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/** Shortest path from `start` to the first node satisfying `isGoal`, or null. */
export function astar<N>(start: N, isGoal: (node: N) => boolean, graph: AStarGraph<N>): N[] | null {
  const startKey = graph.key(start);
  const gScore = new Map<string, number>([[startKey, 0]]);
  const cameFrom = new Map<string, N>();
  const open = new MinHeap<{ node: N; f: number }>((a, b) => a.f < b.f);
  open.push({ node: start, f: graph.heuristic(start) });
  const closed = new Set<string>();

  while (open.size > 0) {
    const { node } = open.pop()!;
    const nodeKey = graph.key(node);
    if (closed.has(nodeKey)) continue;
    if (isGoal(node)) return reconstruct(cameFrom, node, graph.key, startKey);
    closed.add(nodeKey);

    const g = gScore.get(nodeKey)!;
    for (const { node: next, cost } of graph.neighbors(node)) {
      const nextKey = graph.key(next);
      const tentative = g + cost;
      if (tentative < (gScore.get(nextKey) ?? Infinity)) {
        gScore.set(nextKey, tentative);
        cameFrom.set(nextKey, node);
        open.push({ node: next, f: tentative + graph.heuristic(next) });
      }
    }
  }
  return null;
}

function reconstruct<N>(
  cameFrom: Map<string, N>,
  goal: N,
  key: (n: N) => string,
  startKey: string,
): N[] {
  const path: N[] = [goal];
  let cur = goal;
  while (key(cur) !== startKey) {
    const prev = cameFrom.get(key(cur));
    if (prev === undefined) break;
    path.push(prev);
    cur = prev;
  }
  return path.reverse();
}
