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
  { kind: "resistor", widthPin: 3, heightPin: 1 },
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
    expect(isRowLayout({ kind: "resistor", widthPin: 3, heightPin: 1 })).toBe(false);
    expect(isRowLayout({ kind: "cap-ceramic", widthPin: 2, heightPin: 1 })).toBe(false);
    expect(isRowLayout({ kind: "bridge", widthPin: 1, heightPin: 1 })).toBe(false);
    const resistor: IcGeometry = { topLeftDot, widthPin: 3, heightPin: 1, rotationAngle: 0, kind: "resistor" };
    expect(pinCountOf(resistor)).toBe(2);
  });
});
