import { describe, it, expect } from "vitest";
import { CATALOG_PARTS } from "../catalog/parts";
import { dotForPin } from "../features/ic-geometry";
import { Edge, PlaceItem, PlaceNet, placeComponents, Placed } from "./placement";

const NONE = { left: 0, top: 0, right: 0, bottom: 0 };

function item(ref: string, id: string, extra: Partial<PlaceItem> = {}): PlaceItem {
  const part = CATALOG_PARTS.find(p => p.id === id)!;
  return { ref, part, extent: NONE, ...extra };
}

/** `"U1.3 R1.1"` → a net joining those legs. */
const net = (name: string, legs: string): PlaceNet => ({
  name,
  legs: legs.split(" ").map(l => ({ ref: l.split(".")[0], pin: Number(l.split(".")[1]) })),
});

function pad(items: PlaceItem[], at: Map<string, Placed>, leg: string): { x: number; y: number } {
  const [ref, pin] = leg.split(".");
  const { part } = items.find(i => i.ref === ref)!;
  const p = at.get(ref)!;
  const swapped = p.rotation === 90 || p.rotation === 270;
  const geo = {
    topLeftDot: { x: p.col, y: p.row },
    widthPin: swapped ? part.heightPin : part.widthPin,
    heightPin: swapped ? part.widthPin : part.heightPin,
    rotationAngle: p.rotation,
    kind: part.kind,
  };
  // dotForPin steps 50 per hole; col/row are hole indices, so undo the pitch.
  const d = dotForPin(geo, Number(pin))!;
  return { x: p.col + (d.x - p.col) / 50, y: p.row + (d.y - p.row) / 50 };
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Body rect of a placed part (no overhang). */
function rect(items: PlaceItem[], at: Map<string, Placed>, ref: string) {
  const { part } = items.find(i => i.ref === ref)!;
  const p = at.get(ref)!;
  const swapped = p.rotation === 90 || p.rotation === 270;
  const w = swapped ? part.heightPin : part.widthPin;
  const h = swapped ? part.widthPin : part.heightPin;
  return { x1: p.col, y1: p.row, x2: p.col + w - 1, y2: p.row + h - 1 };
}

function groupBox(items: PlaceItem[], at: Map<string, Placed>, group: string) {
  const rs = items.filter(i => at.get(i.ref)!.group === group).map(i => rect(items, at, i.ref));
  return {
    x1: Math.min(...rs.map(r => r.x1)),
    y1: Math.min(...rs.map(r => r.y1)),
    x2: Math.max(...rs.map(r => r.x2)),
    y2: Math.max(...rs.map(r => r.y2)),
  };
}

const disjoint = (a: ReturnType<typeof groupBox>, b: ReturnType<typeof groupBox>) =>
  a.x2 < b.x1 || b.x2 < a.x1 || a.y2 < b.y1 || b.y2 < a.y1;

/** A 555 with a resistor on OUT (pin 3, left) and one on THRESH (pin 6, right), rails on pins 1 / 8 — `n` numbers the refs. */
function timer(n: number, group?: string) {
  const u = `U${n}`, ra = `R${2 * n - 1}`, rb = `R${2 * n}`;
  return {
    items: [item(u, "ne555", { group }), item(ra, "resistor", { group }), item(rb, "resistor", { group })],
    nets: [net(`OUT${n}`, `${u}.3 ${ra}.1`), net(`THR${n}`, `${u}.6 ${rb}.1`)],
    rails: { vcc: `${u}.8`, gnd: `${u}.1` },
  };
}

describe("placement: inside a group", () => {
  it("puts a part next to the pin it joins", () => {
    const t = timer(1);
    const { at } = placeComponents(t.items, t.nets);
    expect(dist(pad(t.items, at, "U1.3"), pad(t.items, at, "R1.1"))).toBeLessThanOrEqual(2);
    expect(dist(pad(t.items, at, "U1.6"), pad(t.items, at, "R2.1"))).toBeLessThanOrEqual(2);
  });

  it("never overlaps parts and keeps a free hole between them", () => {
    const t = timer(1);
    const { at } = placeComponents(t.items, t.nets);
    const rs = t.items.map(i => rect(t.items, at, i.ref));
    for (const a of rs) {
      for (const b of rs) {
        if (a === b) continue;
        expect(a.x2 + 1 < b.x1 || b.x2 + 1 < a.x1 || a.y2 + 1 < b.y1 || b.y2 + 1 < a.y1).toBe(true);
      }
    }
  });

  it("starts at hole 1 and the requested top row", () => {
    const t = timer(1);
    const { at, right, bottom } = placeComponents(t.items, t.nets, { top: 7 });
    const rs = t.items.map(i => rect(t.items, at, i.ref));
    expect(Math.min(...rs.map(r => r.x1))).toBe(1);
    expect(Math.min(...rs.map(r => r.y1))).toBe(7);
    expect(right).toBe(Math.max(...rs.map(r => r.x2)) + 1);
    expect(bottom).toBe(Math.max(...rs.map(r => r.y2)) + 1);
  });

  it("pushes a part with an edge hint to that side", () => {
    for (const edge of ["left", "right", "top", "bottom"] as Edge[]) {
      const t = timer(1);
      const items = [...t.items, item("J1", "pin-header-1x2", { edge })];
      const nets = [...t.nets, net("VCC", `J1.1 ${t.rails.vcc}`), net("GND", `J1.2 ${t.rails.gnd}`)];
      const { at } = placeComponents(items, nets);
      const rs = items.map(i => rect(items, at, i.ref));
      const j = rect(items, at, "J1");
      const side = { left: j.x1 === Math.min(...rs.map(r => r.x1)), right: j.x2 === Math.max(...rs.map(r => r.x2)),
        top: j.y1 === Math.min(...rs.map(r => r.y1)), bottom: j.y2 === Math.max(...rs.map(r => r.y2)) };
      expect(side[edge], edge).toBe(true);
    }
  });
});

describe("placement: groups", () => {
  it("keeps given groups in separate blocks", () => {
    const a = timer(1, "A");
    const b = timer(2, "B");
    const items = [...a.items, ...b.items];
    // Cross-wire the two so connectivity alone would mix them.
    const nets = [...a.nets, ...b.nets, net("X", "R1.2 R3.2")];
    const { at } = placeComponents(items, nets);
    expect(disjoint(groupBox(items, at, "A"), groupBox(items, at, "B"))).toBe(true);
  });

  it("with no groups given, grows one round each part with 6+ pins", () => {
    const a = timer(1);
    const b = timer(2);
    const { at } = placeComponents([...a.items, ...b.items], [...a.nets, ...b.nets]);
    expect(Object.fromEntries([...at].map(([ref, p]) => [ref, p.group]))).toEqual({
      U1: "U1", R1: "U1", R2: "U1", U2: "U2", R3: "U2", R4: "U2",
    });
  });

  it("pulls an ungrouped part into the group it is wired to", () => {
    const a = timer(1, "A");
    const b = timer(2, "B");
    const items = [...a.items, ...b.items, item("R9", "resistor")];
    const { at } = placeComponents(items, [...a.nets, ...b.nets, net("P", "R9.1 U2.5")]);
    expect(at.get("R9")!.group).toBe("B");
  });

  it("shares decoupling caps (rails only) out between the chips", () => {
    const a = timer(1);
    const b = timer(2);
    const items = [...a.items, ...b.items, item("C1", "cap-ceramic"), item("C2", "cap-ceramic")];
    const nets = [...a.nets, ...b.nets, net("VCC", "U1.8 U2.8 C1.1 C2.1"), net("GND", "U1.1 U2.1 C1.2 C2.2")];
    const { at } = placeComponents(items, nets);
    expect(new Set([at.get("C1")!.group, at.get("C2")!.group])).toEqual(new Set(["U1", "U2"]));
  });

  it("gives parts wired to nothing a group of their own", () => {
    const t = timer(1);
    const { at } = placeComponents([...t.items, item("BR1", "bridge")], t.nets);
    expect(at.get("BR1")!.group).toBe("");
  });

  it("lays out identical groups identically", () => {
    const a = timer(1, "CH1");
    const b = timer(2, "CH2");
    const items = [...a.items, ...b.items];
    const { at } = placeComponents(items, [...a.nets, ...b.nets]);
    const rel = (refs: string[]) => {
      const [u, ...rest] = refs.map(r => at.get(r)!);
      return rest.map(p => [p.col - u.col, p.row - u.row, p.rotation]);
    };
    expect(rel(["U1", "R1", "R2"])).toEqual(rel(["U2", "R3", "R4"]));
  });
});

describe("placement: floorplan", () => {
  const three = () => {
    const ts = [timer(1, "top/A"), timer(2, "B"), timer(3, "C")];
    return { items: ts.flatMap(t => t.items), nets: ts.flatMap(t => t.nets) };
  };

  it("lays groups out in rows, top to bottom and left to right", () => {
    const { items, nets } = three();
    const { at, warnings } = placeComponents(items, nets, { floorplan: [["C", "A"], ["B"]] });
    expect(warnings).toEqual([]);
    const A = groupBox(items, at, "top/A"), B = groupBox(items, at, "B"), C = groupBox(items, at, "C");
    expect(C.x2).toBeLessThan(A.x1);
    expect(Math.max(A.y2, C.y2)).toBeLessThan(B.y1);
  });

  it("warns about a name that matches no group", () => {
    const { items, nets } = three();
    const { warnings } = placeComponents(items, nets, { floorplan: [["A", "Nope"]] });
    expect(warnings).toEqual(['Floorplan: no group "Nope" — ignored.']);
  });
});

describe("placement: determinism", () => {
  it("gives the same layout every time", () => {
    const run = () => {
      const a = timer(1);
      const b = timer(2, "B");
      return [...placeComponents([...a.items, ...b.items], [...a.nets, ...b.nets]).at];
    };
    expect(run()).toEqual(run());
  });
});
