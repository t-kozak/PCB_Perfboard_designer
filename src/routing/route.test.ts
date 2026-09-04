import { describe, it, expect } from "vitest";
import { route } from "./route";
import { manhattan, key } from "./types";
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

describe("route", () => {
  it("connects two pads in a row with a single straight segment", () => {
    const pads = lattice(5, 5);
    const res = route(
      [{ id: "n", name: "N", pads: [at(pads, 0, 0), at(pads, 200, 0)] }],
      pads,
    );
    expect(res.failed).toEqual([]);
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0]).toMatchObject({ generated: true, netId: "n" });
    expect(segLen(res.lines[0])).toBe(200);
  });

  it("routes an orthogonal L for a diagonal pair (few long segments, Manhattan length)", () => {
    const pads = lattice(5, 5);
    const res = route(
      [{ id: "n", name: "N", pads: [at(pads, 0, 0), at(pads, 150, 100)] }],
      pads,
    );
    expect(res.failed).toEqual([]);
    expect(res.lines.every(isAxisAligned)).toBe(true);
    expect(res.lines.length).toBeLessThanOrEqual(2);
    expect(res.lines.reduce((s, l) => s + segLen(l), 0)).toBe(250);
  });

  it("routes several nets with no shorts and leaves locked nets alone", () => {
    const pads = lattice(8, 6);
    const res = route(
      [
        { id: "gnd", name: "GND", pads: [at(pads, 0, 0), at(pads, 0, 250), at(pads, 350, 250)] },
        { id: "vcc", name: "VCC", pads: [at(pads, 50, 0), at(pads, 350, 0)] },
        { id: "sig", name: "SIG", pads: [at(pads, 100, 50), at(pads, 300, 200)] },
        { id: "lk", name: "LOCKED", locked: true, pads: [at(pads, 0, 50), at(pads, 50, 50)] },
      ],
      pads,
    );
    expect(res.failed).toEqual([]);
    expect(shortedPads(res.lines)).toEqual([]);
    expect(res.lines.some(l => l.netId === "lk")).toBe(false);
    expect(res.lines.every(isAxisAligned)).toBe(true);
  });

  it("reports an unroutable net by name instead of dropping the connection", () => {
    // A(0,0)→B(100,100); every pad A could turn on is owned by another net.
    const pads = [dot(0, 0), dot(100, 100), dot(0, 100), dot(100, 0), dot(0, 50), dot(50, 0)];
    const res = route(
      [
        { id: "sig", name: "SIG1", pads: [dot(0, 0), dot(100, 100)] },
        { id: "b1", name: "B1", pads: [dot(0, 100), dot(0, 50)] },
        { id: "b2", name: "B2", pads: [dot(100, 0), dot(50, 0)] },
      ],
      pads,
    );
    expect(res.failed).toContain("SIG1");
    expect(res.lines.some(l => l.netId === "sig")).toBe(false);
    // the blocker nets still routed
    expect(res.lines.some(l => l.netId === "b1")).toBe(true);
  });

  it("is stable — re-routing its own output reproduces the same wires", () => {
    const pads = lattice(6, 6);
    const nets = [
      { id: "a", name: "A", pads: [at(pads, 0, 0), at(pads, 250, 0), at(pads, 250, 250)] },
      { id: "b", name: "B", pads: [at(pads, 0, 100), at(pads, 100, 250)] },
    ];
    const first = route(nets, pads);
    const sig = (ls: ILine[]) =>
      ls.map(l => `${l.netId}:${[key(l.start), key(l.end)].sort().join("-")}`).sort();
    // feed emitted endpoints back as each net's pad set
    const padsByNet = new Map<string, Map<string, IDot>>();
    for (const l of first.lines) {
      const m = padsByNet.get(l.netId!) ?? padsByNet.set(l.netId!, new Map()).get(l.netId!)!;
      for (const d of [l.start, l.end]) m.set(key(d), at(pads, d.x, d.y));
    }
    const nets2 = nets.map(n => ({ ...n, pads: [...padsByNet.get(n.id)!.values()] }));
    const second = route(nets2, pads);
    expect(sig(second.lines)).toEqual(sig(first.lines));
  });
});
