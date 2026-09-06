import { describe, it, expect } from "vitest";
import { route } from "./route";
import { directWires } from "./direct";
import { manhattan, key } from "./types";
import type { RouteEdge } from "./types";
import type { IDot } from "../interfaces/dot.interface";
import type { ILine } from "../interfaces/line.interface";

const dot = (x: number, y: number): IDot => ({ x, y });

/** A rectangular pad lattice, `cols` × `rows` at 50-unit pitch. */
function lattice(cols: number, rows: number): IDot[] {
  const pads: IDot[] = [];
  for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) pads.push(dot(x * 50, y * 50));
  return pads;
}
const at = (pads: IDot[], x: number, y: number): IDot =>
  pads.find(p => p.x === x && p.y === y)!;

const segLen = (l: ILine): number => manhattan(l.start, l.end);
const isAxisAligned = (l: ILine): boolean => l.start.x === l.end.x || l.start.y === l.end.y;

/** One connection edge to route. `netId` defaults to `connId` (its own net). */
function edge(connId: string, a: IDot, b: IDot, netId = connId): RouteEdge {
  return { connId, netId, a, b, color: "#fff", width: 4 };
}

/** Pads carrying wires from more than one net — i.e. shorts. */
function shortedPads(lines: ILine[]): string[] {
  const byPad = new Map<string, Set<string>>();
  for (const l of lines) {
    for (const d of [l.start, l.end]) {
      const s = byPad.get(key(d)) ?? byPad.set(key(d), new Set()).get(key(d))!;
      if (l.netId) s.add(l.netId);
    }
  }
  return [...byPad.entries()].filter(([, s]) => s.size > 1).map(([k]) => k);
}

/**
 * Pairs of wires that run along the same stretch of a row or column — the
 * thing the channel rule forbids. Reported as `"connA|connB"`.
 */
function overlaps(lines: ILine[]): string[] {
  const horizontal = (l: ILine): boolean => l.start.y === l.end.y;
  const span = (l: ILine, axis: "x" | "y"): [number, number] => [
    Math.min(l.start[axis], l.end[axis]),
    Math.max(l.start[axis], l.end[axis]),
  ];
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      if (horizontal(a) !== horizontal(b)) continue;
      const along = horizontal(a) ? "x" : "y";
      const across = horizontal(a) ? "y" : "x";
      if (a.start[across] !== b.start[across]) continue;
      const [aLo, aHi] = span(a, along);
      const [bLo, bHi] = span(b, along);
      // Touching end-to-end is fine; sharing any length is not.
      if (Math.min(aHi, bHi) > Math.max(aLo, bLo)) out.push(`${a.connId}|${b.connId}`);
    }
  }
  return out;
}

describe("route (orthogonal)", () => {
  it("connects two pads in a row with a single straight segment", () => {
    const pads = lattice(5, 5);
    const res = route([edge("n", at(pads, 0, 0), at(pads, 200, 0))], pads);
    expect(res.failed).toEqual([]);
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0]).toMatchObject({ connId: "n", netId: "n" });
    expect(segLen(res.lines[0])).toBe(200);
  });

  it("routes an orthogonal L for a diagonal pair (few long segments, Manhattan length)", () => {
    const pads = lattice(5, 5);
    const res = route([edge("n", at(pads, 0, 0), at(pads, 150, 100))], pads);
    expect(res.failed).toEqual([]);
    expect(res.lines.every(isAxisAligned)).toBe(true);
    expect(res.lines.length).toBeLessThanOrEqual(2);
    expect(res.lines.reduce((s, l) => s + segLen(l), 0)).toBe(250);
  });

  it("routes several nets with no shorts", () => {
    const pads = lattice(8, 6);
    const res = route(
      [
        // GND: two connections, one net — they may share pad (0,250).
        edge("g1", at(pads, 0, 0), at(pads, 0, 250), "gnd"),
        edge("g2", at(pads, 0, 250), at(pads, 350, 250), "gnd"),
        edge("vcc", at(pads, 50, 0), at(pads, 350, 0)),
        edge("sig", at(pads, 100, 50), at(pads, 300, 200)),
      ],
      pads,
    );
    expect(res.failed).toEqual([]);
    expect(shortedPads(res.lines)).toEqual([]);
    expect(overlaps(res.lines)).toEqual([]);
    expect(res.lines.every(isAxisAligned)).toBe(true);
  });

  it("lets two connections on the same net meet at a shared pad", () => {
    const pads = lattice(6, 6);
    const res = route(
      [
        edge("a", at(pads, 0, 0), at(pads, 200, 0), "net"),
        edge("b", at(pads, 200, 0), at(pads, 200, 200), "net"),
      ],
      pads,
    );
    expect(res.failed).toEqual([]);
    expect(res.lines.some(l => l.connId === "a")).toBe(true);
    expect(res.lines.some(l => l.connId === "b")).toBe(true);
  });

  it("never lets two wires share a channel — the later one steps aside", () => {
    // The reported bug: "short" already owns row 0 from x=100 to x=300, so
    // "long" may no longer be drawn straight over the top of it, hiding it.
    // It drops into the spare row, runs alongside, and comes back up.
    const pads = lattice(9, 2);
    const res = route(
      [
        edge("long", at(pads, 0, 0), at(pads, 400, 0)),
        edge("short", at(pads, 100, 0), at(pads, 300, 0)),
      ],
      pads,
    );
    expect(res.failed).toEqual([]);
    expect(overlaps(res.lines)).toEqual([]);
    expect(res.lines.filter(l => l.connId === "long")).toHaveLength(3);
  });

  it("applies the channel rule to the same net too — two wires are two wires", () => {
    const pads = lattice(9, 9);
    const res = route(
      [
        edge("far", at(pads, 0, 0), at(pads, 400, 0), "net"),
        edge("near", at(pads, 0, 0), at(pads, 200, 0), "net"),
      ],
      pads,
    );
    expect(res.failed).toEqual([]);
    expect(overlaps(res.lines)).toEqual([]);
  });

  it("still lets wires cross each other at a pad", () => {
    const pads = lattice(6, 6);
    const res = route(
      [
        edge("h", at(pads, 0, 100), at(pads, 200, 100)),
        edge("v", at(pads, 100, 0), at(pads, 100, 200)),
      ],
      pads,
    );
    expect(res.failed).toEqual([]);
    expect(overlaps(res.lines)).toEqual([]);
    // Each is a single straight run, and they meet at (100,100).
    expect(res.lines).toHaveLength(2);
    expect(res.lines.every(l => segLen(l) === 200)).toBe(true);
  });

  it("keeps a fan of connections off each other's channels", () => {
    const pads = lattice(10, 10);
    const hub = at(pads, 200, 200);
    const res = route(
      [
        edge("n", hub, at(pads, 200, 0), "hub"),
        edge("s", hub, at(pads, 200, 400), "hub"),
        edge("e", hub, at(pads, 400, 200), "hub"),
        edge("w", hub, at(pads, 0, 200), "hub"),
      ],
      pads,
    );
    expect(res.failed).toEqual([]);
    expect(overlaps(res.lines)).toEqual([]);
  });

  it("reports an unroutable connection by id instead of dropping it", () => {
    // A(0,0)→B(100,100); every pad A could turn on is owned by another net.
    const pads = [dot(0, 0), dot(100, 100), dot(0, 100), dot(100, 0), dot(0, 50), dot(50, 0)];
    const res = route(
      [
        edge("sig", dot(0, 0), dot(100, 100)),
        edge("b1", dot(0, 100), dot(0, 50)),
        edge("b2", dot(100, 0), dot(50, 0)),
      ],
      pads,
    );
    expect(res.failed).toContain("sig");
    expect(res.lines.some(l => l.connId === "sig")).toBe(false);
    expect(res.lines.some(l => l.connId === "b1")).toBe(true);
  });

  it("is stable — re-routing reproduces the same wires", () => {
    const pads = lattice(6, 6);
    const edges = [
      edge("a", at(pads, 0, 0), at(pads, 250, 0)),
      edge("b", at(pads, 0, 100), at(pads, 100, 250)),
    ];
    const sig = (ls: ILine[]) =>
      ls.map(l => `${l.connId}:${[key(l.start), key(l.end)].sort().join("-")}`).sort();
    expect(sig(route(edges, pads).lines)).toEqual(sig(route(edges, pads).lines));
  });
});

describe("directWires", () => {
  it("emits one straight segment per connection, on whatever diagonal", () => {
    const res = directWires([
      edge("a", dot(0, 0), dot(150, 100)),
      edge("b", dot(0, 0), dot(0, 0)), // degenerate — skipped
    ]);
    expect(res.failed).toEqual([]);
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0]).toMatchObject({ connId: "a", start: { x: 0, y: 0 }, end: { x: 150, y: 100 } });
  });
});
