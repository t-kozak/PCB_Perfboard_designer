import { describe, it, expect } from "vitest";
import { Netlist, parseNetlist, PROP_AT, writeNetlist } from "./netlist";

/** Trimmed-down KiCad 8 export: fields, properties, libsource, libparts, pinfunction. */
const KICAD_EXPORT = `(export (version "E")
  (design (source "demo.kicad_sch") (date "2026-01-01") (tool "Eeschema 8.0.0"))
  (components
    (comp (ref "R1")
      (value "10k")
      (footprint "Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal")
      (fields (field (name "Footprint") "Resistor_THT:R_Axial") (field (name "Tolerance") "1%"))
      (libsource (lib "Device") (part "R") (description "Resistor"))
      (property (name "Sheetname") (value "Root"))
      (sheetpath (names "/") (tstamps "/"))
      (tstamps "0f1e")))
  (libparts
    (libpart (lib "Device") (part "R")
      (pins (pin (num "1") (name "~") (type "passive")) (pin (num "2") (name "~") (type "passive")))))
  (nets
    (net (code "1") (name "GND") (class "Default")
      (node (ref "R1") (pin "1") (pintype "passive"))
      (node (ref "U1") (pin "1") (pinfunction "GND") (pintype "power_in")))))`;

describe("netlist: parse a KiCad export", () => {
  const n = parseNetlist(KICAD_EXPORT);

  it("reads components with fields, properties and libsource", () => {
    expect(n.components).toEqual([{
      ref: "R1",
      value: "10k",
      footprint: "Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal",
      lib: "Device",
      part: "R",
      properties: { Footprint: "Resistor_THT:R_Axial", Tolerance: "1%", Sheetname: "Root" },
    }]);
  });

  it("reads nets and nodes, keeping pinfunction when present", () => {
    expect(n.nets).toEqual([{
      name: "GND",
      nodes: [
        { ref: "R1", pin: "1", pinfunction: undefined },
        { ref: "U1", pin: "1", pinfunction: "GND" },
      ],
    }]);
  });

  it("indexes libpart pins by lib:part", () => {
    expect(n.libparts.get("Device:R")).toEqual([{ num: "1", name: "~" }, { num: "2", name: "~" }]);
  });

  it("has no perfboard block", () => {
    expect(n.perfboard).toBeUndefined();
  });
});

describe("netlist: placement hints", () => {
  const n = parseNetlist(`(export (version "E")
    (components
      (comp (ref "R1") (value "1k") (footprint "Perfboard:resistor") (sheetpath (names "/Channels/CH1/") (tstamps "/a/b/")))
      (comp (ref "R2") (value "1k") (footprint "Perfboard:resistor") (sheetpath (names "/") (tstamps "/"))))
    (nets)
    (perfboard (floorplan (row "PWR" "LOGIC") (row "CH1") (row))))`);

  it("reads a component's sheet path, without the outer slashes; none on the root sheet", () => {
    expect(n.components.map(c => c.sheet)).toEqual(["Channels/CH1", undefined]);
  });

  it("reads the floorplan rows, dropping empty ones", () => {
    expect(n.perfboard?.floorplan).toEqual([["PWR", "LOGIC"], ["CH1"]]);
  });
});

describe("netlist: rejects what it can't read", () => {
  it("an XML netlist, with a hint", () => {
    expect(() => parseNetlist(`<?xml version="1.0"?><export/>`)).toThrow(/XML netlist/);
  });

  it("an S-expression that isn't an (export …)", () => {
    expect(() => parseNetlist(`(kicad_pcb (version 1))`)).toThrow(/Not a KiCad netlist/);
  });

  it("broken syntax", () => {
    expect(() => parseNetlist(`(export (components`)).toThrow();
  });

  it("but not an export with no sections", () => {
    expect(parseNetlist(`(export (version "E"))`)).toMatchObject({ components: [], nets: [] });
  });
});

describe("netlist: write → parse round trip", () => {
  const full: Netlist = {
    components: [
      { ref: "U1", value: "NE555", footprint: "Perfboard:ne555", properties: { [PROP_AT]: "1 1 90", partNumber: "x" } },
      { ref: "BR1", value: "Bridge", footprint: "Perfboard:bridge", lib: "Device", part: "Jumper", properties: {} },
    ],
    nets: [{ name: "GND", nodes: [{ ref: "U1", pin: "1", pinfunction: "GND" }, { ref: "BR1", pin: "1" }] }],
    libparts: new Map(),
    perfboard: {
      board: { cols: 24, rows: 18, colLabels: "letter", rowLabels: "number", rowsBottomUp: true, routing: "direct" },
      pads: [{ col: 0, row: 3, color: "#ff0000" }],
      customParts: [{
        id: "custom-1", name: "My \"Thing\"", category: "Other", kind: "chip", widthPin: 4, heightPin: 3,
        pinDescription: { 1: "VCC", 6: "" },
        imageSrc: "data:image/svg+xml;utf8,%3Csvg%3E", imageScaleX: 1.5, imageScaleY: 2, imageOffsetX: -3, imageOffsetY: 0,
      }],
    },
  };

  it("keeps components, nets and every perfboard field", () => {
    const back = parseNetlist(writeNetlist(full));
    expect(back.components).toEqual(full.components);
    expect(back.nets).toEqual([{ name: "GND", nodes: [{ ref: "U1", pin: "1", pinfunction: "GND" }, { ref: "BR1", pin: "1", pinfunction: undefined }] }]);
    expect(back.perfboard).toEqual(full.perfboard);
  });

  it("numbers nets from 1 and writes the date only when given", () => {
    const text = writeNetlist(full);
    expect(text).toMatch(/\(net \(code "1"\) \(name "GND"\)/);
    expect(text).not.toMatch(/\(date/);
    expect(writeNetlist(full, { date: "2026-09-25" })).toMatch(/\(date "2026-09-25"\)/);
  });

  it("is deterministic — the same board serializes to identical text (autosave relies on it)", () => {
    expect(writeNetlist(full)).toBe(writeNetlist(full));
  });

  it("drops a board block with missing axis labels / routing rather than inventing them", () => {
    const back = parseNetlist(writeNetlist({ ...full, perfboard: { board: { cols: 5, rows: 6 }, pads: [], customParts: [] } }));
    expect(back.perfboard).toEqual({ board: { cols: 5, rows: 6, colLabels: undefined, rowLabels: undefined, rowsBottomUp: false, routing: undefined }, pads: [], customParts: [] });
  });

  it("ignores malformed perfboard entries instead of failing the load", () => {
    const back = parseNetlist(`(export (perfboard (version 1)
      (board (size 0 5))
      (pads (pad x 1 "#fff") (pad 1 2 "#abc"))
      (custom_parts (custom_part (id "no-size")) (custom_part (id "ok") (size 1 1)))))`);
    expect(back.perfboard?.board).toBeUndefined();
    expect(back.perfboard?.pads).toEqual([{ col: 1, row: 2, color: "#abc" }]);
    expect(back.perfboard?.customParts.map(p => p.id)).toEqual(["ok"]);
    expect(back.perfboard?.customParts[0]).toMatchObject({ name: "ok", category: "Other", kind: "chip" });
  });
});
