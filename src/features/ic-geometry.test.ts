import { describe, it, expect } from "vitest";
import { pinAtDot, dotForPin, pinCountOf, isRowLayout, type IcGeometry } from "./ic-geometry";

// Every shape in the built-in catalog (see loadDefaultIcs in ic-catalog.ts), by kind
// and pin footprint, so the round trip is checked against real components
// rather than arbitrary dimensions.
const SHAPES: Array<{ kind: string; widthPin: number; heightPin: number }> = [
  { kind: "bridge", widthPin: 1, heightPin: 1 },
  { kind: "chip", widthPin: 4, heightPin: 4 }, // NE555 Timer
  { kind: "chip", widthPin: 4, heightPin: 7 }, // DIP-14 Logic
  { kind: "chip", widthPin: 4, heightPin: 8 }, // DIP-16 Logic
  { kind: "chip", widthPin: 4, heightPin: 14 }, // ATmega328P
  { kind: "chip", widthPin: 6, heightPin: 1 }, // NAU7802 (single-row header)
  { kind: "resistor", widthPin: 4, heightPin: 1 },
  { kind: "cap-ceramic", widthPin: 2, heightPin: 1 },
  { kind: "cap-electrolytic", widthPin: 2, heightPin: 1 },
];
const ROTATIONS = [0, 90, 180, 270];
const topLeftDot = { x: 150, y: 250 };

describe("ic-geometry: pinDot <-> getPinPositionOnIC round trip", () => {
  for (const shape of SHAPES) {
    for (const rotationAngle of ROTATIONS) {
      it(`${shape.kind} ${shape.widthPin}x${shape.heightPin} @ ${rotationAngle}° agrees in both directions`, () => {
        // Ic.rotate() swaps widthPin/heightPin on every 90° step, so a
        // component actually reaching rotationAngle 90/270 always does so
        // with dimensions already swapped from their 0°/180° values.
        const swapped = rotationAngle === 90 || rotationAngle === 270;
        const geo: IcGeometry = {
          topLeftDot,
          rotationAngle,
          kind: shape.kind,
          widthPin: swapped ? shape.heightPin : shape.widthPin,
          heightPin: swapped ? shape.widthPin : shape.heightPin,
        };
        const total = pinCountOf(geo);
        expect(total).toBeGreaterThan(0);
        for (let pin = 1; pin <= total; pin++) {
          const dot = dotForPin(geo, pin);
          expect(dot).not.toBeNull();
          expect(pinAtDot(geo, dot!)).toBe(pin);
        }
      });
    }
  }

  // A DIP turns as a rigid body: Ic.rotate() steps 90° clockwise, so pin 1
  // travels top-left -> top-right -> bottom-right -> bottom-left, tracking the
  // orientation notch. widthPin/heightPin are swapped at 90°/270°.
  it("DIP-14 pin 1 walks the four corners clockwise through the rotations", () => {
    const base = { topLeftDot, kind: "chip" as const };
    const corner = (rotationAngle: number, swapped: boolean) =>
      dotForPin({ ...base, rotationAngle, widthPin: swapped ? 7 : 4, heightPin: swapped ? 4 : 7 }, 1);

    expect(corner(0, false)).toEqual({ x: 150, y: 250 }); // top-left
    expect(corner(90, true)).toEqual({ x: 150 + 6 * 50, y: 250 }); // top-right
    expect(corner(180, false)).toEqual({ x: 150 + 3 * 50, y: 250 + 6 * 50 }); // bottom-right
    expect(corner(270, true)).toEqual({ x: 150, y: 250 + 3 * 50 }); // bottom-left
  });

  it("DIP-14 keeps its footprint but rotates the pin numbering (0° vs 180°)", () => {
    const at0: IcGeometry = { topLeftDot, kind: "chip", rotationAngle: 0, widthPin: 4, heightPin: 7 };
    const at180: IcGeometry = { topLeftDot, kind: "chip", rotationAngle: 180, widthPin: 4, heightPin: 7 };
    // 180° is a true half-turn of 0°, not a left-right mirror: each pin lands in
    // the hole directly across the package — the one half the pin count away.
    for (let pin = 1; pin <= 14; pin++) {
      expect(dotForPin(at180, pin)).toEqual(dotForPin(at0, ((pin + 6) % 14) + 1));
    }
  });

  it("dotForPin returns null outside the component's pin range", () => {
    const geo: IcGeometry = { topLeftDot, widthPin: 4, heightPin: 4, rotationAngle: 0, kind: "chip" };
    expect(dotForPin(geo, 0)).toBeNull();
    expect(dotForPin(geo, 9)).toBeNull();
  });

  it("pinAtDot returns null for a hole that is not one of the component's pins", () => {
    const geo: IcGeometry = { topLeftDot, widthPin: 4, heightPin: 4, rotationAngle: 0, kind: "chip" };
    expect(pinAtDot(geo, { x: topLeftDot.x + 50, y: topLeftDot.y + 50 })).toBeNull();
  });

  it("both directions return null for an unplaced component", () => {
    const geo: IcGeometry = { topLeftDot: null, widthPin: 4, heightPin: 4, rotationAngle: 0, kind: "chip" };
    expect(dotForPin(geo, 1)).toBeNull();
    expect(pinAtDot(geo, { x: 0, y: 0 })).toBeNull();
  });

  it("a single-row chip (widthPin or heightPin === 1) gets one pin per hole, not the doubled DIP count", () => {
    const geo: IcGeometry = { topLeftDot, widthPin: 6, heightPin: 1, rotationAngle: 0, kind: "chip" };
    expect(isRowLayout(geo)).toBe(true);
    expect(pinCountOf(geo)).toBe(6);
    for (let pin = 1; pin <= 6; pin++) {
      expect(dotForPin(geo, pin)).toEqual({ x: topLeftDot.x + (pin - 1) * 50, y: topLeftDot.y });
    }
    expect(dotForPin(geo, 7)).toBeNull();
  });

  it("leaded parts and bridges keep their fixed pin count despite having a '1' dimension", () => {
    expect(isRowLayout({ kind: "resistor", widthPin: 4, heightPin: 1 })).toBe(false);
    expect(isRowLayout({ kind: "cap-ceramic", widthPin: 2, heightPin: 1 })).toBe(false);
    expect(isRowLayout({ kind: "bridge", widthPin: 1, heightPin: 1 })).toBe(false);
    const resistor: IcGeometry = { topLeftDot, widthPin: 4, heightPin: 1, rotationAngle: 0, kind: "resistor" };
    expect(pinCountOf(resistor)).toBe(2);
  });
});
