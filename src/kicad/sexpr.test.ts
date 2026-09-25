import { describe, it, expect } from "vitest";
import { atoms, child, children, head, parseSExpr, text, writeSExpr } from "./sexpr";

describe("sexpr: parse", () => {
  it("reads nested lists, bare and quoted atoms alike", () => {
    expect(parseSExpr(`(comp (ref "R1") (value 10k) (pin 1))`)).toEqual([
      "comp", ["ref", "R1"], ["value", "10k"], ["pin", "1"],
    ]);
  });

  it("unescapes quotes, backslashes and newlines in strings", () => {
    expect(parseSExpr(`(note "say \\"hi\\"\\nC:\\\\x")`)).toEqual(["note", 'say "hi"\nC:\\x']);
  });

  it("keeps parentheses and spaces inside quoted strings", () => {
    expect(parseSExpr(`(name "Net-(R1-Pad2) x")`)).toEqual(["name", "Net-(R1-Pad2) x"]);
  });

  it("accepts an empty string and an empty list", () => {
    expect(parseSExpr(`(a "" ())`)).toEqual(["a", "", []]);
  });

  it("tolerates any whitespace between tokens", () => {
    expect(parseSExpr(`\n\t( a\n  ( b  c )\r\n)\n`)).toEqual(["a", ["b", "c"]]);
  });

  it.each([
    ["(a (b)", /Unbalanced/],
    ["(a))", /Trailing/],
    [`(a "open)`, /Unterminated/],
    ["", /Unexpected end/],
    [")", /Unexpected "\)"/],
  ])("rejects malformed input %j", (src, message) => {
    expect(() => parseSExpr(src)).toThrow(message);
  });
});

describe("sexpr: accessors", () => {
  const e = parseSExpr(`(comp (ref R1) (property (name a) (value 1)) (property (name b) (value 2)) (at 3 4 90))`);

  it("head / child / children / text / atoms", () => {
    expect(head(e)).toBe("comp");
    expect(head("atom")).toBeUndefined();
    expect(text(e, "ref")).toBe("R1");
    expect(text(e, "missing")).toBeUndefined();
    expect(children(e, "property").map(p => text(p, "name"))).toEqual(["a", "b"]);
    expect(atoms(child(e, "at"))).toEqual(["3", "4", "90"]);
    expect(atoms(undefined)).toEqual([]);
  });
});

describe("sexpr: write", () => {
  it("leaves list heads bare and quotes every other atom, KiCad-style", () => {
    expect(writeSExpr(["node", ["ref", "R1"], ["pin", "2"]])).toBe(`(node (ref "R1") (pin "2"))`);
  });

  it("escapes what the reader unescapes", () => {
    const tricky = ["note", 'a "q" \\ b\nc'];
    expect(parseSExpr(writeSExpr(tricky))).toEqual(tricky);
  });

  it("breaks nested lists onto indented lines", () => {
    const out = writeSExpr(["comp", ["ref", "R1"], ["property", ["name", "a"], ["value", "1"]]]);
    expect(out).toBe(`(comp (ref "R1")\n  (property (name "a") (value "1")))`);
  });

  it("wraps a long run of leaf lists instead of one endless line", () => {
    const pads = ["pads", ...Array.from({ length: 40 }, (_, i) => ["pad", String(i), "0", "#ff0000"])];
    const lines = writeSExpr(pads).split("\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(Math.max(...lines.map(l => l.length))).toBeLessThan(110);
    expect(parseSExpr(writeSExpr(pads))).toEqual(pads);
  });

  it("round-trips an arbitrary tree", () => {
    const tree = ["export", ["version", "E"], ["components", ["comp", ["ref", "U1"], ["fields", ["field", ["name", "x"], "y"]]]], ["nets"]];
    expect(parseSExpr(writeSExpr(tree))).toEqual(tree);
  });
});
