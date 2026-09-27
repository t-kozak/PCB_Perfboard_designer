import {describe, expect, it} from "vitest";
import {PdfDocument, toWinAnsi, wrapText} from "./pdf-writer";

// Monospace stand-in: every char is half the font size wide.
const measure = (text: string, size: number) => text.length * size / 2;

describe("toWinAnsi", () => {
  it("keeps Latin-1, remaps typographic chars and spells out Ω", () => {
    expect(toWinAnsi("100µF ±5%")).toBe("100µF ±5%");
    expect(toWinAnsi("a–b")).toBe("a\x96b");
    expect(toWinAnsi("10kΩ")).toBe("10kOhm");
    expect(toWinAnsi("I²C 中")).toBe("I²C ?");
  });
});

describe("wrapText", () => {
  it("wraps at spaces and breaks over-long words", () => {
    expect(wrapText("aa bb cc", 5, 2, "regular", measure)).toEqual(["aa bb", "cc"]);
    expect(wrapText("abcdefghijkl", 10, 2, "regular", measure)).toEqual(["abcdefghij", "kl"]);
    expect(wrapText("one\ntwo", 100, 2, "regular", measure)).toEqual(["one", "two"]);
  });
});

describe("PdfDocument", () => {
  it("writes a structurally valid file with a correct xref", () => {
    const doc = new PdfDocument(measure, "Test (board)");
    const img = doc.addImage({width: 1, height: 1, data: new Uint8Array([1, 2, 3])});
    const page = doc.addPage();
    page.text("Hello (world) \\", 10, 20, 12, {style: "bold"});
    page.image(img, 0, 0, 10, 10);
    const text = new TextDecoder("latin1").decode(doc.toBytes());

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("(Hello \\(world\\) \\\\) Tj");
    expect(text).toContain("/Im0 6 0 R");

    // Every xref offset points at its "n 0 obj" header.
    const xrefAt = Number(/startxref\n(\d+)/.exec(text)![1]);
    const entries = text.slice(xrefAt).split("\n").slice(3).filter(l => / n $/.test(l));
    entries.forEach((entry, i) => {
      expect(text.startsWith(`${i + 1} 0 obj`, Number(entry.slice(0, 10)))).toBe(true);
    });
    expect(entries.length).toBe(8);
  });

  it("places a rotated image so it fills the same top-left box", () => {
    const doc = new PdfDocument(measure);
    const page = doc.addPage(100, 200);
    const img = doc.addImage({width: 1, height: 1, data: new Uint8Array()});
    page.image(img, 10, 20, 30, 40);
    page.image(img, 10, 20, 30, 40, true);
    // Unrotated: scale 30×40, origin at the box's bottom-left (y = 200 - 60).
    expect(page.ops[0]).toBe("q 30 0 0 40 10 140 cm /Im0 Do Q");
    // Rotated 90° clockwise: the image's bottom-left corner lands on the box's top-left (y = 200 - 20).
    expect(page.ops[1]).toBe("q 0 -40 30 0 10 180 cm /Im0 Do Q");
  });
});
