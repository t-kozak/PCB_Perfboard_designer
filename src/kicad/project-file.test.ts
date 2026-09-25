import {describe, expect, it} from "vitest";
import {isProjectFile, parseProjectFile, writeProjectFile} from "./project-file";
import {parseNetlist, writeNetlist} from "./netlist";

const netlistA = `(export (version "E")
  (design (source "Main"))
  (components
    (comp (ref "R1") (value "10k") (footprint "Perfboard:resistor")))
  (nets
    (net (code "1") (name "GND") (node (ref "R1") (pin "1")))))
`;
const netlistB = `(export (version "E") (components) (nets))\n`;

describe("project file", () => {
  it("round-trips boards, names and the active board", () => {
    const text = writeProjectFile({boards: [{name: "Main", netlist: netlistA}, {name: "Power \"PSU\"", netlist: netlistB}], active: 1});
    expect(isProjectFile(text)).toBe(true);
    const p = parseProjectFile(text);
    expect(p.active).toBe(1);
    expect(p.boards.map(b => b.name)).toEqual(["Main", "Power \"PSU\""]);
    const a = parseNetlist(p.boards[0].netlist);
    expect(a.title).toBe("Main");
    expect(a.components.map(c => c.ref)).toEqual(["R1"]);
    expect(a.nets[0].name).toBe("GND");
    expect(parseNetlist(p.boards[1].netlist).components).toEqual([]);
  });

  it("tells a project file from a netlist or JSON", () => {
    expect(isProjectFile("  (perfboard_project (version \"1\"))")).toBe(true);
    expect(isProjectFile(netlistA)).toBe(false);
    expect(isProjectFile("{\"version\": 5}")).toBe(false);
    expect(isProjectFile("(perfboard_projects)")).toBe(false);
  });

  it("falls back to board 0 when active is out of range, and names unnamed boards", () => {
    const p = parseProjectFile(`(perfboard_project (active "7") (board ${netlistB}))`);
    expect(p.active).toBe(0);
    expect(p.boards[0].name).toBe("Board 1");
  });

  it("rejects files without boards, boards without a netlist, and newer versions", () => {
    expect(() => parseProjectFile("(perfboard_project (version \"1\"))")).toThrow(/no boards/);
    expect(() => parseProjectFile("(perfboard_project (board (name \"x\")))")).toThrow(/no netlist/);
    expect(() => parseProjectFile(`(perfboard_project (version "2") (board ${netlistB}))`)).toThrow(/version 2/);
    expect(() => parseProjectFile(netlistA)).toThrow(/Not a project file/);
  });
});

describe("netlist title", () => {
  it("writes the board name as the design source and reads it back", () => {
    const text = writeNetlist({components: [], nets: [], libparts: new Map()}, {title: "Relay board"});
    expect(text).toContain('(source "Relay board")');
    expect(parseNetlist(text).title).toBe("Relay board");
  });

  it("ignores the tool's own placeholder source", () => {
    expect(parseNetlist(writeNetlist({components: [], nets: [], libparts: new Map()})).title).toBeUndefined();
  });
});
