import { describe, it, expect } from "vitest";
import { CATALOG_PARTS, CatalogPart } from "../catalog/parts";
import { Netlist, NetlistComponent, parseNetlist, PROP_AT, PROP_EDGE, PROP_GROUP, PROP_NOTE, PROP_PINS } from "./netlist";
import { Extent, givenNetName, parametricPart, planProject, PlannedComponent, ProjectPlan } from "./project";

type NodeSpec = [ref: string, pin: string, pinfunction?: string];

function comp(ref: string, footprint: string, value = "", extra: Partial<NetlistComponent> = {}): NetlistComponent {
  return { ref, value, footprint, properties: {}, ...extra };
}

function netlist(components: NetlistComponent[], nets: Record<string, NodeSpec[]> = {}, extra: Partial<Netlist> = {}): Netlist {
  return {
    components,
    nets: Object.entries(nets).map(([name, nodes]) => ({
      name,
      nodes: nodes.map(([ref, pin, pinfunction]) => ({ ref, pin, pinfunction })),
    })),
    libparts: new Map(),
    ...extra,
  };
}

const plan = (n: Netlist, parts: CatalogPart[] = CATALOG_PARTS, extentOf?: (p: CatalogPart) => Extent) =>
  planProject(n, parts, { extentOf });

const byRef = (p: ProjectPlan): Record<string, PlannedComponent> =>
  Object.fromEntries(p.components.map(c => [c.ref, c]));

/** The single component of a one-part netlist. */
const only = (c: NetlistComponent, nets: Record<string, NodeSpec[]> = {}, extra: Partial<Netlist> = {}) => {
  const p = plan(netlist([c], nets, extra));
  return { c: p.components[0], warnings: p.warnings, plan: p };
};

/** Connections as sorted "R1.2-U1.1" strings, for order-independent comparison. */
const links = (p: ProjectPlan) =>
  p.connections.map(({ a, b }) => [`${a.ref}.${a.pin}`, `${b.ref}.${b.pin}`].sort().join("-")).sort();

describe("project: parametric parts", () => {
  it.each([
    ["dip-8", { kind: "chip", widthPin: 4, heightPin: 4, name: "DIP-8" }],
    ["dip-40", { kind: "chip", widthPin: 7, heightPin: 20 }],
    ["DIP-14", { id: "dip-14", widthPin: 4, heightPin: 7 }],
    ["sip-3", { kind: "chip", widthPin: 3, heightPin: 1, name: "SIP-3" }],
    ["pin-header-2x5", { kind: "pin-header", widthPin: 5, heightPin: 2, name: "Pin Header 2x5" }],
  ])("%s", (id, expected) => {
    expect(parametricPart(id)).toMatchObject(expected);
  });

  it.each(["dip-7", "dip-2", "sip-0", "pin-header-0x3", "dip-", "resistor"])("rejects %s", id => {
    expect(parametricPart(id)).toBeNull();
  });
});

describe("project: part resolution", () => {
  it("takes the part from a Perfboard:<id> footprint, case-insensitively, without a warning", () => {
    const { c, warnings } = only(comp("U1", "Perfboard:NE555", "NE555"));
    expect(c.part.id).toBe("ne555");
    expect(warnings).toEqual([]);
  });

  it("accepts a bare catalog id as the footprint", () => {
    expect(only(comp("R1", "resistor", "1k")).c.part.id).toBe("resistor");
  });

  it("prefers a Perfboard property over a KiCad footprint", () => {
    const { c, warnings } = only(comp("U1", "Package_DIP:DIP-8_W7.62mm", "", { properties: { Perfboard: "ne555" } }));
    expect(c.part.id).toBe("ne555");
    expect(warnings).toEqual([]);
  });

  it("synthesizes parametric footprints", () => {
    expect(only(comp("U1", "Perfboard:dip-28")).c.part).toMatchObject({ id: "dip-28", heightPin: 14 });
    expect(only(comp("J1", "Perfboard:pin-header-3x4")).c.part).toMatchObject({ kind: "pin-header", widthPin: 4, heightPin: 3 });
  });

  it("warns on an unknown Perfboard id and falls back to guessing", () => {
    const { c, warnings } = only(comp("R1", "Perfboard:resistr", "10k", { lib: "Device", part: "R" }));
    expect(c.part.id).toBe("resistor");
    expect(warnings[0]).toMatch(/R1: unknown part "resistr"; guessed "resistor"/);
  });

  it.each([
    ["R", "", "resistor"],
    ["R_Small", "", "resistor"],
    ["C", "", "cap-ceramic"],
    ["C_Small", "", "cap-ceramic"],
    ["CP", "", "cap-electrolytic"],
    ["C_Polarized", "", "cap-electrolytic"],
    ["D", "", "diode"],
    ["D_Schottky", "", "diode"],
    ["Polyfuse", "", "polyfuse"],
    ["Fuse", "", "polyfuse"],
    ["Q_NMOS_GDS", "", "mosfet-standing"],
    ["Q_NMOS_GDS", "Package_TO_SOT_THT:TO-220-3_Vertical", "mosfet-flat"],
    ["SW_Push", "", "push-button"],
    ["Conn_01x06_Pin", "", "pin-header-1x6"],
    ["Conn_02x03_Odd_Even", "", "pin-header-3x2"],
  ])("guesses symbol %s (footprint %j) → %s, with a warning", (sym, footprint, id) => {
    const { c, warnings } = only(comp("X1", footprint, "", { lib: "Device", part: sym }));
    expect(c.part.id).toBe(id);
    expect(warnings).toEqual([expect.stringMatching(new RegExp(`X1: guessed "${id}"`))]);
  });

  it.each([
    ["Resistor_THT:R_Axial_DIN0207", "resistor"],
    ["Capacitor_THT:C_Disc_D5.0mm", "cap-ceramic"],
    ["Capacitor_THT:CP_Radial_D5.0mm", "cap-electrolytic"],
    ["Diode_THT:D_DO-35", "diode"],
    ["Button_Switch_THT:SW_PUSH_6mm", "push-button"],
    ["Package_DIP:DIP-16_W7.62mm", "dip-16"],
    ["Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical", "pin-header-1x3"],
    ["Connector_PinHeader_2.54mm:PinHeader_2x04_P2.54mm_Vertical", "pin-header-4x2"],
  ])("guesses footprint %s → %s", (footprint, id) => {
    expect(only(comp("X1", footprint)).c.part.id).toBe(id);
  });

  it("picks the LED variant from its colour anywhere in the component", () => {
    expect(only(comp("D1", "", "Green", { part: "LED" })).c.part.id).toBe("led-green");
    expect(only(comp("D1", "LED_THT:LED_D5.0mm_Blue")).c.part.id).toBe("led-blue");
    expect(only(comp("D1", "", "LED", { part: "LED", properties: { Colour: "red" } })).c.part.id).toBe("led-red");
  });

  it("defaults a colourless LED to red and says so", () => {
    const { c, warnings } = only(comp("D1", "", "LED", { part: "LED" }));
    expect(c.part.id).toBe("led-red");
    expect(warnings[0]).toMatch(/D1: LED colour not given/);
  });

  it("fills in MOSFET channel and diode type from the symbol", () => {
    expect(only(comp("Q1", "", "", { part: "Q_PMOS_GSD" })).c.config.channel).toBe("P-channel");
    expect(only(comp("Q1", "", "", { part: "Q_NMOS_GDS" })).c.config.channel).toBe("N-channel");
    expect(only(comp("D1", "", "", { part: "D_Zener" })).c.config.diodeType).toBe("Zener");
    expect(only(comp("D1", "", "", { part: "D_TVS" })).c.config.diodeType).toBe("TVS");
    expect(only(comp("D1", "", "", { part: "D" })).c.config.diodeType).toBeUndefined();
  });

  it("matches a catalog part by name, before a generic package guess", () => {
    expect(only(comp("U1", "Package_DIP:DIP-8_W7.62mm", "NE555P", { part: "NE555P" })).c.part.id).toBe("ne555");
    expect(only(comp("U1", "Package_DIP:DIP-28_W7.62mm", "ATmega328P-PU")).c.part.id).toBe("atmega328p");
    expect(only(comp("U1", "", "CD4013BE")).c.part.id).toBe("cd4013be");
  });

  it("does not name-match on short prefixes", () => {
    // "A49" is a prefix of "A4988" the wrong way round, and too short to count.
    expect(only(comp("U1", "", "A49")).c.part.id).not.toBe("a4988");
  });

  it("resolves a custom part carried in the file's perfboard block", () => {
    const custom: CatalogPart = { id: "custom-xyz", name: "Widget", category: "Other", kind: "chip", widthPin: 4, heightPin: 2, pinDescription: { 1: "IN" } };
    const { c, warnings } = only(comp("U1", "Perfboard:custom-xyz"), {}, { perfboard: { pads: [], customParts: [custom] } });
    expect(c.part).toEqual(custom);
    expect(warnings).toEqual([]);
  });

  it("falls back to a generic DIP sized to the highest pin number the netlist uses", () => {
    const { c, warnings } = only(comp("U1", "Foo:Bar", "LM358"), { OUT: [["U1", "1", "OUT"], ["U1", "7"]] });
    expect(c.part).toMatchObject({ id: "dip-8", name: "DIP-8", pinDescription: { 1: "OUT" } });
    expect(c.config.partNumber).toBe("LM358");
    expect(warnings[0]).toMatch(/U1: not in the parts library — placed as a generic DIP-8/);
  });

  it("rounds an odd pin count up to an even DIP, and uses a SIP for up to 3 pins", () => {
    expect(only(comp("U1", "Foo:Bar"), { N: [["U1", "5"]] }).c.part.id).toBe("dip-6");
    expect(only(comp("U1", "Foo:Bar"), { N: [["U1", "3"]] }).c.part.id).toBe("sip-3");
    expect(only(comp("U1", "Foo:Bar")).c.part.id).toBe("sip-1");
  });

  it("names generic pins from the libparts section, skipping KiCad's ~ placeholder", () => {
    const n = netlist([comp("U1", "Foo:Bar", "", { lib: "X", part: "Y" })], {}, {
      libparts: new Map([["X:Y", [{ num: "1", name: "IN" }, { num: "2", name: "~" }, { num: "4", name: "VCC" }]]]),
    });
    expect(plan(n).components[0].part).toMatchObject({ id: "dip-4", pinDescription: { 1: "IN", 4: "VCC" } });
  });

  it("numbers a generic part with named-only pins in order and keeps the names", () => {
    const p = plan(netlist(
      [comp("Q1", "Foo:TO-92"), comp("R1", "Perfboard:resistor")],
      { B: [["Q1", "B"], ["R1", "1"]], E: [["Q1", "E"], ["R1", "2"]] },
    ));
    expect(byRef(p).Q1.part).toMatchObject({ id: "sip-2", pinDescription: { 1: "B", 2: "E" } });
    expect(links(p)).toEqual(["Q1.1-R1.1", "Q1.2-R1.2"]);
  });
});

describe("project: pin mapping", () => {
  const diodeNet = (node: NodeSpec) => plan(netlist(
    [comp("D1", "Perfboard:diode"), comp("R1", "Perfboard:resistor")],
    { N: [node, ["R1", "1"]] },
  ));

  it("uses the pin number when there is no pin name", () => {
    expect(links(diodeNet(["D1", "1"]))).toEqual(["D1.1-R1.1"]);
  });

  it("lets a unique pin name win over the number (KiCad's D numbers the cathode 1)", () => {
    expect(links(diodeNet(["D1", "1", "K"]))).toEqual(["D1.2-R1.1"]);
  });

  it("understands spelled-out aliases", () => {
    expect(links(diodeNet(["D1", "2", "Anode"]))).toEqual(["D1.1-R1.1"]);
    expect(links(diodeNet(["D1", "1", "CATHODE"]))).toEqual(["D1.2-R1.1"]);
  });

  it("accepts a pin name in place of the number", () => {
    expect(links(diodeNet(["D1", "K"]))).toEqual(["D1.2-R1.1"]);
  });

  it("matches KiCad overbar syntax ~{…} to the catalog's ~ prefix", () => {
    const p = plan(netlist(
      [comp("U1", "Perfboard:a4988"), comp("R1", "Perfboard:resistor")],
      { EN: [["U1", "99", "~{ENABLE}"], ["R1", "1"]] },
    ));
    expect(links(p)).toEqual(["R1.1-U1.1"]);
  });

  it("falls back to the number when a name is ambiguous (ATmega328P has two GND pins)", () => {
    const p = plan(netlist(
      [comp("U1", "Perfboard:atmega328p"), comp("R1", "Perfboard:resistor")],
      { G: [["U1", "22", "GND"], ["R1", "1"]] },
    ));
    expect(links(p)).toEqual(["R1.1-U1.22"]);
  });

  it("drops (and reports) a pin the part doesn't have, or a ref that doesn't exist", () => {
    const p = plan(netlist(
      [comp("R1", "Perfboard:resistor"), comp("R2", "Perfboard:resistor")],
      { N: [["R1", "3"], ["R2", "1"], ["R3", "1"], ["R2", "X", "NOPE"]] },
    ));
    expect(p.connections).toEqual([]);
    expect(p.warnings).toEqual([
      "Net N: R1 has no pin 3 — leg dropped.",
      "Net N: unknown component R3 — leg dropped.",
      "Net N: R2 has no pin X (NOPE) — leg dropped.",
    ]);
  });
});

describe("project: value and properties", () => {
  it("puts the value into the kind's value field", () => {
    expect(only(comp("R1", "Perfboard:resistor", "4k7")).c.config).toEqual({ resistance: "4k7" });
    expect(only(comp("C1", "Perfboard:cap-electrolytic", "100uF")).c.config).toEqual({ capacitance: "100uF" });
    expect(only(comp("F1", "Perfboard:polyfuse", "500mA")).c.config).toEqual({ holdCurrent: "500mA" });
    expect(only(comp("U1", "Perfboard:ne555", "NE555P")).c.config).toEqual({ partNumber: "NE555P" });
  });

  it("ignores a value that is only the part's name or a generic symbol name", () => {
    expect(only(comp("R1", "Perfboard:resistor", "Resistor")).c.config).toEqual({});
    expect(only(comp("R1", "", "R", { part: "R" })).c.config).toEqual({});
    expect(only(comp("J1", "Perfboard:pin-header-1x2", "pin-header-1x2")).c.note).toBeUndefined();
    expect(only(comp("R1", "Perfboard:resistor", "~")).c.config).toEqual({});
  });

  it("keeps a part-number value even when the symbol has the same name", () => {
    expect(only(comp("U1", "Package_DIP:DIP-8_W7.62mm", "LM358", { part: "LM358" })).c.config.partNumber).toBe("LM358");
  });

  it("notes the value of a kind without a value field — except an LED's colour", () => {
    expect(only(comp("J1", "Perfboard:pin-header-1x2", "Power")).c.note).toBe("Value: Power");
    expect(only(comp("D1", "Perfboard:led-green", "Green")).c.note).toBeUndefined();
  });

  it("maps properties by field key or label, case-insensitively", () => {
    const { c } = only(comp("R1", "Perfboard:resistor", "10k", { properties: { tolerance: "1%", POWER: "0.25W" } }));
    expect(c.config).toEqual({ resistance: "10k", tolerance: "1%", power: "0.25W" });
    expect(only(comp("C1", "Perfboard:cap-ceramic", "", { properties: { "Max voltage": "x", Voltage: "50V" } })).c.config.voltage).toBe("50V");
  });

  it("normalizes drop-down options and notes a value that isn't one", () => {
    expect(only(comp("C1", "Perfboard:cap-ceramic", "", { properties: { dielectric: "x7r" } })).c.config.dielectric).toBe("X7R");
    const bad = only(comp("C1", "Perfboard:cap-ceramic", "", { properties: { dielectric: "Z9Z" } })).c;
    expect(bad.config.dielectric).toBeUndefined();
    expect(bad.note).toBe("Dielectric: Z9Z");
  });

  it("notes unknown properties and skips KiCad's own and empty ones", () => {
    const { c } = only(comp("R1", "Perfboard:resistor", "", {
      properties: {
        Footprint: "x", Datasheet: "~", Description: "d", Sheetname: "Root", Sheetfile: "a.kicad_sch",
        ki_keywords: "r", "Exclude from BOM": "", DNP: "", Supplier: "Mouser", Empty: "  ",
        [PROP_NOTE]: "Keep short",
      },
    }));
    expect(c.config).toEqual({});
    expect(c.note).toBe("Keep short\nSupplier: Mouser");
  });

  it("overrides pin names with perfboard:pins", () => {
    const { c } = only(comp("U1", "Perfboard:dip-4", "", { properties: { [PROP_PINS]: "1:IN 4:VCC" } }));
    expect(c.part.pinDescription).toEqual({ 1: "IN", 4: "VCC" });
  });
});

describe("project: labels and refs", () => {
  it("uses the ref as the label", () => {
    expect(only(comp("R12", "Perfboard:resistor")).c.label).toBe("R12");
  });

  it("leaves a bridge's auto BRn ref unlabelled, but keeps a chosen one", () => {
    expect(only(comp("BR3", "Perfboard:bridge")).c.label).toBeUndefined();
    expect(only(comp("TP1", "Perfboard:bridge")).c.label).toBe("TP1");
  });

  it("leaves KiCad's unannotated R? unlabelled", () => {
    expect(only(comp("R?", "Perfboard:resistor")).c.label).toBeUndefined();
  });

  it("skips duplicate and empty refs with a warning", () => {
    const p = plan(netlist([comp("R1", "Perfboard:resistor", "1k"), comp("R1", "Perfboard:resistor", "2k"), comp("", "Perfboard:resistor")]));
    expect(p.components).toHaveLength(1);
    expect(p.components[0].config.resistance).toBe("1k");
    expect(p.warnings).toEqual(["R1: duplicate reference — skipped the second one.", "Skipped a component with no reference."]);
  });
});

/** Every hole a component's footprint (plus overhang, given unrotated) covers. */
function cells(c: PlannedComponent, e: Extent = { left: 0, top: 0, right: 0, bottom: 0 }): string[] {
  const swapped = c.rotation === 90 || c.rotation === 270;
  const w = swapped ? c.part.heightPin : c.part.widthPin;
  const h = swapped ? c.part.widthPin : c.part.heightPin;
  const extent: Extent =
    c.rotation === 90 ? { left: e.bottom, top: e.left, right: e.top, bottom: e.right }
    : c.rotation === 180 ? { left: e.right, top: e.bottom, right: e.left, bottom: e.top }
    : c.rotation === 270 ? { left: e.top, top: e.right, right: e.bottom, bottom: e.left }
    : e;
  const out: string[] = [];
  for (let x = c.col - extent.left; x < c.col + w + extent.right; x++) {
    for (let y = c.row - extent.top; y < c.row + h + extent.bottom; y++) out.push(`${x},${y}`);
  }
  return out;
}

describe("project: placement", () => {
  const mixed = () => netlist([
    comp("U1", "Perfboard:atmega328p"), comp("U2", "Perfboard:ne555"), comp("R1", "Perfboard:resistor"),
    comp("R2", "Perfboard:resistor"), comp("C1", "Perfboard:cap-ceramic"), comp("D1", "Perfboard:led-red"),
    comp("J1", "Perfboard:pin-header-2x3"), comp("SW1", "Perfboard:push-button"), comp("BR1", "Perfboard:bridge"),
  ]);

  it("auto-places parts without overlapping, all on the board", () => {
    const p = plan(mixed());
    const seen = new Set<string>();
    for (const c of p.components) {
      for (const cell of cells(c)) {
        expect(seen.has(cell), `${c.ref} overlaps at ${cell}`).toBe(false);
        seen.add(cell);
        const [x, y] = cell.split(",").map(Number);
        expect(x >= 0 && y >= 0 && x < p.board.cols && y < p.board.rows, `${c.ref} off board at ${cell}`).toBe(true);
      }
    }
  });

  it("keeps a margin round the edge, a free hole between parts and two between groups", () => {
    const p = plan(mixed());
    for (const c of p.components) {
      expect(c.col).toBeGreaterThanOrEqual(1);
      expect(c.row).toBeGreaterThanOrEqual(1);
    }
    for (const a of p.components) {
      for (const b of p.components) {
        if (a === b) continue;
        const near = cells(a).some(ca => cells(b).some(cb => {
          const [ax, ay] = ca.split(",").map(Number);
          const [bx, by] = cb.split(",").map(Number);
          return Math.max(Math.abs(ax - bx), Math.abs(ay - by)) <= (a.group === b.group ? 1 : 2);
        }));
        expect(near, `${a.ref} too close to ${b.ref}`).toBe(false);
      }
    }
  });

  it("leaves room for artwork overhang reported by extentOf", () => {
    const extentOf = (part: CatalogPart): Extent =>
      part.id === "mosfet-flat" ? { left: 4, top: 0, right: 0, bottom: 1 } : { left: 0, top: 0, right: 0, bottom: 0 };
    const p = plan(netlist([comp("Q1", "Perfboard:mosfet-flat"), comp("Q2", "Perfboard:mosfet-flat"), comp("R1", "Perfboard:resistor")]), CATALOG_PARTS, extentOf);
    const seen = new Set<string>();
    for (const c of p.components) {
      for (const cell of cells(c, extentOf(c.part))) {
        expect(seen.has(cell), `${c.ref} artwork overlaps at ${cell}`).toBe(false);
        seen.add(cell);
      }
      expect(Math.min(...cells(c, extentOf(c.part)).map(k => Number(k.split(",")[0])))).toBeGreaterThanOrEqual(1);
    }
  });

  it("is deterministic", () => {
    expect(plan(mixed())).toEqual(plan(mixed()));
  });

  it("never makes a board smaller than 10 x 10", () => {
    expect(plan(netlist([])).board).toMatchObject({ cols: 10, rows: 10 });
    expect(plan(netlist([comp("BR1", "Perfboard:bridge")])).board).toMatchObject({ cols: 10, rows: 10 });
  });

  it("keeps saved positions and rotations", () => {
    const p = plan(netlist([comp("R1", "Perfboard:resistor", "", { properties: { [PROP_AT]: "3 4 90" } })]));
    expect(p.components[0]).toMatchObject({ col: 3, row: 4, rotation: 90 });
  });

  it.each(["", "x y", "-1 2", "1.5 2", "3"])("auto-places on an unreadable position %j", at => {
    const p = plan(netlist([comp("R1", "Perfboard:resistor", "", { properties: { [PROP_AT]: at } })]));
    expect(p.components[0]).toMatchObject({ col: 1, row: 1, rotation: 0 });
  });

  it("treats an unknown rotation as 0", () => {
    const p = plan(netlist([comp("R1", "Perfboard:resistor", "", { properties: { [PROP_AT]: "2 2 45" } })]));
    expect(p.components[0].rotation).toBe(0);
  });

  it("puts new parts below the ones already placed", () => {
    const p = plan(netlist([
      comp("U1", "Perfboard:ne555", "", { properties: { [PROP_AT]: "2 3 0" } }),
      comp("R1", "Perfboard:resistor"),
    ]));
    expect(byRef(p).R1.row).toBeGreaterThanOrEqual(3 + 4 + 2);
  });

  it("keeps the saved board size, growing it to fit a part outside", () => {
    const board = { cols: 20, rows: 12, colLabels: "letter" as const, rowLabels: "number" as const, rowsBottomUp: true, routing: "direct" as const };
    const inside = plan(netlist([comp("R1", "Perfboard:resistor", "", { properties: { [PROP_AT]: "0 0 0" } })], {}, { perfboard: { board, pads: [], customParts: [] } }));
    expect(inside.board).toEqual(board);
    const outside = plan(netlist([comp("U1", "Perfboard:ne555", "", { properties: { [PROP_AT]: "25 10 90" } })], {}, { perfboard: { board, pads: [], customParts: [] } }));
    expect(outside.board).toMatchObject({ cols: 29, rows: 14 });
  });
});

describe("project: placement hints", () => {
  const sheet = (ref: string, footprint: string, sheetName?: string, properties: Record<string, string> = {}) =>
    comp(ref, footprint, "", { sheet: sheetName, properties });

  it("groups by KiCad sheet, overridden by perfboard:group", () => {
    const p = plan(netlist([
      sheet("U1", "Perfboard:ne555", "Timer"),
      sheet("R1", "Perfboard:resistor", "Timer", { [PROP_GROUP]: "/Out/" }),
      sheet("R2", "Perfboard:resistor"),
    ], { OUT: [["U1", "3"], ["R2", "1"]] }));
    expect(Object.fromEntries(p.components.map(c => [c.ref, c.group]))).toEqual({ U1: "Timer", R1: "Out", R2: "Timer" });
  });

  it("warns about an unknown edge and ignores it", () => {
    const p = plan(netlist([comp("J1", "Perfboard:pin-header-1x2", "", { properties: { [PROP_EDGE]: "Middle" } })]));
    expect(p.warnings).toEqual(['J1: unknown edge "middle" — ignored.']);
  });

  it("follows the floorplan and reports names it can't find", () => {
    const p = plan(netlist(
      [sheet("R1", "Perfboard:resistor", "A"), sheet("R2", "Perfboard:resistor", "B")],
      {},
      { perfboard: { pads: [], customParts: [], floorplan: [["B"], ["A", "Z"]] } },
    ));
    expect(byRef(p).R2.row).toBeLessThan(byRef(p).R1.row);
    expect(p.warnings).toEqual(['Floorplan: no group "Z" — ignored.']);
  });
});

describe("project: connections from nets", () => {
  /** Three resistors in a row, 10 holes apart, lying flat. */
  const row = (nets: Record<string, NodeSpec[]>) => plan(netlist(
    ["R1", "R2", "R3"].map((ref, i) => comp(ref, "Perfboard:resistor", "", { properties: { [PROP_AT]: `${i * 10} 0 0` } })),
    nets,
  ));

  it("joins a two-leg net with one connection", () => {
    expect(links(row({ N: [["R1", "2"], ["R2", "1"]] }))).toEqual(["R1.2-R2.1"]);
  });

  it("joins an n-leg net with the shortest n-1 connections", () => {
    // R1.2 is next to R2.1, R2.2 next to R3.1: a chain, never the long R1–R3 jump.
    const p = row({ N: [["R3", "1"], ["R1", "2"], ["R2", "1"], ["R2", "2"]] });
    expect(links(p)).toEqual(["R1.2-R2.1", "R2.1-R2.2", "R2.2-R3.1"]);
  });

  it("measures from the rotated pads", () => {
    const p = plan(netlist([
      comp("R1", "Perfboard:resistor", "", { properties: { [PROP_AT]: "0 0 90" } }), // pins at (0,0) and (0,3)
      comp("R2", "Perfboard:resistor", "", { properties: { [PROP_AT]: "1 3 0" } }), // pin 1 at (1,3)
      comp("R3", "Perfboard:resistor", "", { properties: { [PROP_AT]: "1 0 0" } }), // pin 1 at (1,0)
    ], { N: [["R1", "2"], ["R2", "1"], ["R3", "1"]] }));
    expect(links(p)).toContain("R1.2-R2.1");
  });

  it("ignores single-leg nets and repeated legs", () => {
    expect(row({ lonely: [["R1", "1"]], dup: [["R1", "1"], ["R1", "1"]] }).connections).toEqual([]);
    expect(links(row({ N: [["R1", "2"], ["R2", "1"], ["R1", "2"]] }))).toEqual(["R1.2-R2.1"]);
  });

  it("is independent of node order", () => {
    const a = row({ N: [["R1", "2"], ["R2", "1"], ["R3", "1"]] });
    const b = row({ N: [["R3", "1"], ["R2", "1"], ["R1", "2"]] });
    expect(a.connections).toEqual(b.connections);
  });
});

describe("project: net names", () => {
  it.each([
    ["GND", "GND"],
    ["+12V", "+12V"],
    ["/SIG", "SIG"],
    ["/sub/CLK", "sub/CLK"],
    [" VL ", "VL"],
    ["Net-(R1-Pad2)", undefined],
    ["unconnected-(U1-Pad5)", undefined],
    ["N$3", undefined],
    ["N$FOO", "N$FOO"],
    ["", undefined],
  ])("givenNetName(%j) → %j", (raw, expected) => {
    expect(givenNetName(raw)).toBe(expected);
  });

  it("tags each connection with its net, named or not", () => {
    const p = plan(netlist(
      [comp("R1", "Perfboard:resistor"), comp("R2", "Perfboard:resistor"), comp("R3", "Perfboard:resistor")],
      {
        "+12V": [["R1", "1"], ["R2", "1"], ["R3", "1"]],
        "lonely": [["R1", "2"]],
        "Net-(R2-Pad2)": [["R2", "2"], ["R3", "2"]],
      },
    ));
    expect(p.nets).toEqual([{ name: "+12V" }, { name: undefined }]);
    expect(p.connections.filter(c => c.net === 0)).toHaveLength(2);
    expect(p.connections.filter(c => c.net === 1)).toHaveLength(1);
  });

  it("drops a net whose legs were all unmappable", () => {
    const p = plan(netlist([comp("R1", "Perfboard:resistor")], { BAD: [["R1", "9"], ["R9", "1"]] }));
    expect(p.nets).toEqual([]);
    expect(p.connections).toEqual([]);
  });
});

describe("project: board pass-through", () => {
  it("returns the file's pads and custom parts untouched", () => {
    const pads = [{ col: 1, row: 2, color: "#123456" }];
    const customParts: CatalogPart[] = [{ id: "custom-a", name: "A", category: "Other", kind: "chip", widthPin: 4, heightPin: 2, pinDescription: {} }];
    const p = plan(netlist([], {}, { perfboard: { pads, customParts } }));
    expect(p.pads).toEqual(pads);
    expect(p.customParts).toEqual(customParts);
  });

  it("has no pads, custom parts or label settings without a perfboard block", () => {
    const p = plan(netlist([]));
    expect(p.pads).toEqual([]);
    expect(p.customParts).toEqual([]);
    expect(p.board).toEqual({ cols: 10, rows: 10 });
  });
});

describe("project: the parts-library example", () => {
  // Mirrors the example in src/catalog/library.ts — an LLM copies its shape.
  const EXAMPLE = `(export (version "E")
    (components
      (comp (ref "J1") (value "Pin Header 1x2") (footprint "Perfboard:pin-header-1x2")
        (property (name "function") (value "5V power in")))
      (comp (ref "R1") (value "330") (footprint "Perfboard:resistor") (property (name "power") (value "0.25W")))
      (comp (ref "D1") (value "LED (Red)") (footprint "Perfboard:led-red"))
      (comp (ref "C1") (value "100nF") (footprint "Perfboard:cap-ceramic")
        (property (name "dielectric") (value "X7R"))
        (property (name "perfboard:note") (value "Decoupling"))))
    (nets
      (net (code "1") (name "VCC") (node (ref "J1") (pin "1")) (node (ref "R1") (pin "1")) (node (ref "C1") (pin "1")))
      (net (code "2") (name "LED_A") (node (ref "R1") (pin "2")) (node (ref "D1") (pin "1") (pinfunction "A")))
      (net (code "3") (name "GND") (node (ref "D1") (pin "2") (pinfunction "K")) (node (ref "C1") (pin "2")) (node (ref "J1") (pin "2")))))`;

  it("loads without a single warning", () => {
    const p = plan(parseNetlist(EXAMPLE));
    expect(p.warnings).toEqual([]);
    const c = byRef(p);
    expect(c.R1.config).toEqual({ resistance: "330", power: "0.25W" });
    expect(c.C1.config).toEqual({ capacitance: "100nF", dielectric: "X7R" });
    expect(c.C1.note).toBe("Decoupling");
    expect(c.J1.config).toEqual({ function: "5V power in" });
    expect(c.D1.note).toBeUndefined();
    expect(p.connections).toHaveLength(2 + 1 + 2);
  });
});
