import { describe, it, expect } from "vitest";
import { CATALOG_PARTS, CatalogPart } from "../catalog/parts";
import { BoardSnapshot, SnapshotComponent, snapshotToNetlist } from "./export";
import { parseNetlist, PROP_AT, PROP_NOTE, PROP_PINS, writeNetlist } from "./netlist";
import { parametricPart, planProject } from "./project";

const part = (id: string): CatalogPart => CATALOG_PARTS.find(p => p.id === id) ?? parametricPart(id)!;

function sc(id: string, partId: string, extra: Partial<SnapshotComponent> = {}): SnapshotComponent {
  const p = part(partId);
  return { id, part: p, name: p.name, pinDescription: { ...p.pinDescription }, col: 0, row: 0, rotation: 0, config: {}, ...extra };
}

function snap(components: SnapshotComponent[], nets: BoardSnapshot["nets"] = []): BoardSnapshot {
  return { board: { cols: 20, rows: 20 }, pads: [], customParts: [], components, nets };
}

const refs = (s: BoardSnapshot) => snapshotToNetlist(s).components.map(c => c.ref);

describe("export: references", () => {
  it("keeps labels as refs", () => {
    expect(refs(snap([sc("a", "resistor", { label: "R5" }), sc("b", "ne555", { label: "U2" })]))).toEqual(["R5", "U2"]);
  });

  it("numbers unlabelled parts after their kind's prefix, skipping refs in use", () => {
    expect(refs(snap([
      sc("a", "resistor"), sc("b", "resistor", { label: "R1" }), sc("c", "cap-ceramic"), sc("d", "ne555"),
    ]))).toEqual(["R2", "R1", "C1", "U1"]);
  });

  it("names bridges BR1, BR2…", () => {
    expect(refs(snap([sc("a", "bridge"), sc("b", "bridge"), sc("c", "bridge", { label: "TP1" })]))).toEqual(["BR1", "BR2", "TP1"]);
  });

  it("renumbers a duplicate label and fixes spaces", () => {
    expect(refs(snap([sc("a", "resistor", { label: "R1" }), sc("b", "resistor", { label: "R1" }), sc("c", "ne555", { label: " My U " })])))
      .toEqual(["R1", "R2", "My_U"]);
  });
});

describe("export: component fields", () => {
  it("writes the value field as value and the rest of config as properties", () => {
    const [c] = snapshotToNetlist(snap([sc("a", "resistor", { config: { resistance: "10k", tolerance: "1%", power: "" } })])).components;
    expect(c).toMatchObject({ value: "10k", footprint: "Perfboard:resistor" });
    expect(c.properties).toEqual({ tolerance: "1%", [PROP_AT]: "0 0 0" });
  });

  it("falls back to the part name as value", () => {
    expect(snapshotToNetlist(snap([sc("a", "resistor")])).components[0].value).toBe("Resistor");
    expect(snapshotToNetlist(snap([sc("a", "pin-header-1x2", { config: { function: "UART" } })])).components[0])
      .toMatchObject({ value: "Pin Header 1x2", properties: { function: "UART" } });
  });

  it("stores position, rotation and note", () => {
    const [c] = snapshotToNetlist(snap([sc("a", "ne555", { col: 3, row: 7, rotation: 270, note: "hot\nside" })])).components;
    expect(c.properties).toEqual({ [PROP_AT]: "3 7 270", [PROP_NOTE]: "hot\nside" });
  });

  it("stores pin names only when they differ from the part's", () => {
    const same = snapshotToNetlist(snap([sc("a", "ne555")])).components[0];
    expect(same.properties[PROP_PINS]).toBeUndefined();
    const renamed = snapshotToNetlist(snap([sc("a", "dip-4", { pinDescription: { 1: "IN A", 4: "VCC", 2: "" } })])).components[0];
    expect(renamed.properties[PROP_PINS]).toBe("1:IN_A 4:VCC");
  });
});

describe("export: nets", () => {
  const two = [sc("r", "resistor", { label: "R1" }), sc("u", "ne555", { label: "U1" })];

  it("lists legs sorted by ref and pin, with pin names as pinfunction", () => {
    const [net] = snapshotToNetlist(snap(two, [{ name: "GND", legs: [{ id: "u", pin: 1 }, { id: "r", pin: 2 }] }])).nets;
    expect(net).toEqual({ name: "GND", nodes: [
      { ref: "R1", pin: "2", pinfunction: undefined },
      { ref: "U1", pin: "1", pinfunction: "GND" },
    ] });
  });

  it("names an unnamed net after its first leg, KiCad-style", () => {
    const [net] = snapshotToNetlist(snap(two, [{ legs: [{ id: "u", pin: 3 }, { id: "r", pin: 1 }] }])).nets;
    expect(net.name).toBe("Net-(R1-Pad1)");
  });

  it("makes repeated net names unique", () => {
    const nets = snapshotToNetlist(snap(two, [
      { name: "GND", legs: [{ id: "u", pin: 1 }, { id: "r", pin: 1 }] },
      { name: "GND", legs: [{ id: "u", pin: 2 }, { id: "r", pin: 2 }] },
      { name: "GND", legs: [{ id: "u", pin: 3 }, { id: "u", pin: 4 }] },
    ])).nets;
    expect(nets.map(n => n.name)).toEqual(["GND", "GND_2", "GND_3"]);
  });

  it("drops legs of unknown components and nets left with one leg", () => {
    const nets = snapshotToNetlist(snap(two, [
      { name: "A", legs: [{ id: "u", pin: 1 }, { id: "ghost", pin: 1 }] },
      { name: "B", legs: [{ id: "u", pin: 2 }, { id: "r", pin: 2 }, { id: "ghost", pin: 2 }] },
    ])).nets;
    expect(nets.map(n => [n.name, n.nodes.length])).toEqual([["B", 2]]);
  });
});

describe("export → write → parse → plan round trip", () => {
  const custom: CatalogPart = { id: "custom-abc", name: "Widget", category: "Other", kind: "chip", widthPin: 4, heightPin: 3, pinDescription: { 1: "IN", 6: "OUT" } };
  const board: BoardSnapshot = {
    board: { cols: 24, rows: 18, colLabels: "letter", rowLabels: "number", rowsBottomUp: true, routing: "direct" },
    pads: [{ col: 0, row: 0, color: "#ff0000" }, { col: 5, row: 9, color: "#00ff00" }],
    customParts: [custom],
    components: [
      sc("r1", "resistor", { label: "R1", col: 1, row: 1, rotation: 90, config: { resistance: "4k7", tolerance: "5%" } }),
      sc("u1", "ne555", { label: "U1", col: 6, row: 1, config: { partNumber: "NE555P" }, note: "timer" }),
      sc("u2", "dip-8", { label: "U2", col: 12, row: 1, pinDescription: { 1: "OUT", 4: "V-", 8: "V+" }, config: { partNumber: "LM358" } }),
      sc("d1", "led-green", { label: "D1", col: 1, row: 8 }),
      sc("b1", "bridge", { col: 4, row: 8 }),
      { id: "w1", label: "W1", part: custom, name: "Widget", pinDescription: custom.pinDescription, col: 8, row: 8, rotation: 180, config: {} },
    ],
    nets: [
      { name: "GND", legs: [{ id: "u1", pin: 1 }, { id: "d1", pin: 2 }, { id: "b1", pin: 1 }, { id: "u2", pin: 4 }] },
      { name: "SIG", legs: [{ id: "r1", pin: 2 }, { id: "w1", pin: 1 }] },
    ],
  };
  const text = writeNetlist(snapshotToNetlist(board), { date: "2026-09-25" });
  const back = planProject(parseNetlist(text), CATALOG_PARTS);
  const c = Object.fromEntries(back.components.map(x => [x.ref, x]));

  it("loads back without warnings", () => {
    expect(back.warnings).toEqual([]);
  });

  it("restores every component's part, position, rotation, config, note and pin names", () => {
    expect(back.components.map(x => x.ref)).toEqual(["R1", "U1", "U2", "D1", "BR1", "W1"]);
    for (const orig of board.components) {
      const ref = orig.label ?? "BR1";
      expect(c[ref], ref).toMatchObject({
        part: { id: orig.part.id, pinDescription: orig.pinDescription },
        col: orig.col, row: orig.row, rotation: orig.rotation, config: orig.config, note: orig.note,
      });
    }
    expect(c.BR1.label).toBeUndefined();
  });

  it("keeps the net names", () => {
    expect(back.nets).toEqual([{ name: "GND" }, { name: "SIG" }]);
    expect(new Set(back.connections.map(x => back.nets[x.net].name))).toEqual(new Set(["GND", "SIG"]));
  });

  it("restores the board, pads and custom parts", () => {
    expect(back.board).toEqual(board.board);
    expect(back.pads).toEqual(board.pads);
    expect(back.customParts).toEqual([custom]);
  });

  it("rebuilds each net as a spanning tree over the same legs", () => {
    const legs = (refsPins: string[]) => [...new Set(refsPins)].sort();
    const gnd = back.connections.filter(x => [x.a, x.b].some(t => t.ref === "U1"));
    expect(back.connections).toHaveLength(3 + 1);
    expect(legs(back.connections.flatMap(x => [`${x.a.ref}.${x.a.pin}`, `${x.b.ref}.${x.b.pin}`])))
      .toEqual(["BR1.1", "D1.2", "R1.2", "U1.1", "U2.4", "W1.1"]);
    expect(gnd.length).toBeGreaterThan(0);
  });

  it("is stable: saving the loaded plan again gives the same text", () => {
    const again: BoardSnapshot = {
      ...board,
      components: back.components.map(x => ({
        id: x.ref, label: x.label, part: part(x.part.id) ?? x.part, name: x.part.name, pinDescription: x.part.pinDescription,
        col: x.col, row: x.row, rotation: x.rotation, config: x.config, note: x.note,
      })).map(x => (x.id === "W1" ? { ...x, part: custom } : x)),
      nets: parseNetlist(text).nets.map(n => ({ name: n.name, legs: n.nodes.map(node => ({ id: node.ref, pin: Number(node.pin) })) })),
    };
    expect(writeNetlist(snapshotToNetlist(again), { date: "2026-09-25" })).toBe(text);
  });
});
