import { describe, it, expect } from "vitest";
import { mst, tidy } from "./tidy";
import { manhattan } from "./types";
import type { IDot } from "../interfaces/dot.interface";
import type { RouteNet } from "./types";

const dot = (x: number, y: number): IDot => ({ x, y });
const total = (edges: Array<[IDot, IDot]>): number =>
  edges.reduce((s, [a, b]) => s + manhattan(a, b), 0);
const sig = (ls: { start: IDot; end: IDot }[]): string[] =>
  ls.map(l => [`${l.start.x},${l.start.y}`, `${l.end.x},${l.end.y}`].sort().join("-")).sort();

describe("mst", () => {
  it("connects five pads with exactly four minimum-length edges", () => {
    const pads = [dot(0, 0), dot(0, 50), dot(0, 100), dot(50, 100), dot(100, 100)];
    const edges = mst(pads);
    expect(edges).toHaveLength(4);
    expect(total(edges)).toBe(200); // the L-shape: 4 hops of 50
  });

  it("beats a naive star topology on total length", () => {
    const pads = [dot(0, 0), dot(0, 90), dot(0, 180), dot(0, 270)];
    const star = pads.slice(1).reduce((s, p) => s + manhattan(pads[0], p), 0);
    expect(total(mst(pads))).toBeLessThan(star);
    expect(total(mst(pads))).toBe(270);
  });

  it("is order-independent (same pad set → same tree)", () => {
    const pads = [dot(0, 0), dot(100, 0), dot(0, 100), dot(100, 100), dot(50, 50)];
    const shuffled = [pads[3], pads[0], pads[4], pads[2], pads[1]];
    const norm = (e: Array<[IDot, IDot]>) =>
      e.map(([p, q]) => [`${p.x},${p.y}`, `${q.x},${q.y}`].sort().join("-")).sort();
    expect(norm(mst(shuffled))).toEqual(norm(mst(pads)));
  });

  it("returns nothing for fewer than two pads", () => {
    expect(mst([])).toEqual([]);
    expect(mst([dot(1, 1)])).toEqual([]);
  });
});

describe("tidy", () => {
  it("emits pads-1 generated wires per net and skips locked nets", () => {
    const res = tidy([
      { id: "n1", name: "GND", pads: [dot(0, 0), dot(0, 50), dot(0, 100)] },
      { id: "n2", name: "VCC", pads: [dot(0, 0), dot(0, 50)], locked: true },
    ]);
    expect(res.lines).toHaveLength(2);
    expect(res.lines.every(l => l.generated === true && l.netId === "n1")).toBe(true);
    expect(res.failed).toEqual([]);
  });

  it("stamps the net colour when given", () => {
    const [line] = tidy([{ id: "n", name: "N", color: "#abcdef", pads: [dot(0, 0), dot(0, 50)] }]).lines;
    expect(line.color).toBe("#abcdef");
  });

  it("re-running over its own output changes nothing", () => {
    const net: RouteNet = {
      id: "n",
      name: "N",
      pads: [dot(0, 0), dot(0, 50), dot(50, 50), dot(50, 0), dot(100, 100)],
    };
    const first = tidy([net]).lines;
    const pads2 = [
      ...new Map(
        first.flatMap(l => [l.start, l.end]).map(d => [`${d.x},${d.y}`, d]),
      ).values(),
    ];
    const second = tidy([{ ...net, pads: pads2 }]).lines;
    expect(sig(second)).toEqual(sig(first));
  });
});
