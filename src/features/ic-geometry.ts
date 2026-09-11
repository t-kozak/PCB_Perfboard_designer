/**
 * Pure pin ↔ pad geometry for a placed component, extracted out of `Ic` so it
 * can be unit-tested without importing `Canvas` / `State` (see
 * docs/logical-connections.md §7). `Ic` methods are thin wrappers around
 * these functions.
 */

export interface IcGeometry {
  topLeftDot: { x: number; y: number } | null;
  widthPin: number;
  heightPin: number;
  rotationAngle: number;
  kind: string;
}

/** Kinds with their own fixed 2-terminal pin model (see Ic.LEADED_KINDS) — never single-row. */
const LEADED_KINDS = ["resistor", "cap-ceramic", "cap-electrolytic", "led-red", "led-green", "led-blue"];

/** Kinds laid out as a full rectangular pin grid (see isGridLayout) rather than the two-sided DIP perimeter. */
const GRID_KINDS = ["pin-header"];

/**
 * True for a component whose every hole in the widthPin x heightPin footprint
 * is a pin (e.g. a 2x3 Dupont-style pin header), rather than only the two
 * long edges (the DIP assumption `pinAtDot`/`dotForPin` fall back to below).
 * A single-row header (widthPin or heightPin === 1) is handled by
 * `isRowLayout` instead — this only applies once both dimensions exceed 1.
 */
export function isGridLayout(geo: Pick<IcGeometry, "kind" | "widthPin" | "heightPin">): boolean {
  return GRID_KINDS.includes(geo.kind) && geo.widthPin > 1 && geo.heightPin > 1;
}

/**
 * True for a component with no second side to its pin package — widthPin or
 * heightPin is 1 (a SIP-style header / single-row breakout board, e.g. a
 * 6-pin module modeled as 6x1) rather than the default two-sided DIP layout.
 * Leaded parts and bridges also have a "1" dimension but keep their own fixed
 * pin count/positions, so they're excluded here. Rotation-safe: `Ic.rotate()`
 * swaps widthPin/heightPin together with rotationAngle, so whichever of the
 * two is 1 always identifies the row's short axis, regardless of orientation.
 */
export function isRowLayout(geo: Pick<IcGeometry, "kind" | "widthPin" | "heightPin">): boolean {
  return geo.kind !== "bridge" && !LEADED_KINDS.includes(geo.kind) && (geo.widthPin === 1 || geo.heightPin === 1);
}

/**
 * Total number of pins on a component, in its current rotation. Pin count is
 * rotation-invariant, but which field holds "pins per side" is not: at 0°/180°
 * it's `heightPin` (a vertical part), at 90°/270° it's `widthPin` (horizontal)
 * — the same split `pinAtDot` / `dotForPin` read from, since `Ic.rotate()`
 * swaps `widthPin`/`heightPin` together with `rotationAngle`. A single-row
 * layout (see `isRowLayout`) has one pin per hole along its long axis instead
 * of the doubled DIP count.
 */
export function pinCountOf(geo: Pick<IcGeometry, "kind" | "widthPin" | "heightPin" | "rotationAngle">): number {
  if (geo.kind === "bridge") return 1;
  if (isGridLayout(geo)) return geo.widthPin * geo.heightPin;
  if (isRowLayout(geo)) return Math.max(geo.widthPin, geo.heightPin);
  const perSide = geo.rotationAngle === 90 || geo.rotationAngle === 270 ? geo.widthPin : geo.heightPin;
  return perSide * 2;
}

/**
 * DIP-perimeter pin geometry as a **true rigid rotation** of the 0° layout
 * (`Ic.rotate()` turns the part 90° *clockwise* per step, following the
 * orientation notch: top → right → bottom → left).
 *
 * At 0° a chip is a `w0 x h0` box of holes with pins only on the two vertical
 * edges (columns `0` and `w0-1`), `h0` pins per edge: pin 1 top-left, counting
 * down the left edge to pin `h0`, across to bottom-right, up the right edge to
 * pin `2*h0`. So pin 1 travels top-left → top-right → bottom-right → bottom-left
 * through the four rotations, matching the notch and the pin-1 marker drawn in
 * `Ic.drawBody`.
 *
 * `Ic.rotate()` swaps `widthPin`/`heightPin` on every 90° step, so `dipDims0`
 * recovers the un-rotated `(w0, h0)`; `dipRotateCell` maps a 0°-frame grid cell
 * to the current frame and `dipUnrotateCell` inverts it.
 */
function dipDims0(geo: Pick<IcGeometry, "widthPin" | "heightPin" | "rotationAngle">): { w0: number; h0: number } {
  const swapped = geo.rotationAngle === 90 || geo.rotationAngle === 270;
  return swapped ? { w0: geo.heightPin, h0: geo.widthPin } : { w0: geo.widthPin, h0: geo.heightPin };
}

/** 0°-frame cell `(col0, row0)` of a pin (null when out of range). */
function dipCell0(pin: number, w0: number, h0: number): { col0: number; row0: number } | null {
  if (pin >= 1 && pin <= h0) return { col0: 0, row0: pin - 1 };
  if (pin > h0 && pin <= 2 * h0) return { col0: w0 - 1, row0: 2 * h0 - pin };
  return null;
}

/** Pin number sitting at a 0°-frame cell (null when the cell carries no pin). */
function dipPinAtCell0(col0: number, row0: number, w0: number, h0: number): number | null {
  if (row0 < 0 || row0 >= h0) return null;
  if (col0 === 0) return row0 + 1;
  if (col0 === w0 - 1) return 2 * h0 - row0;
  return null;
}

/** 0°-frame cell → current-frame cell for a clockwise rotation of `rot` degrees. */
function dipRotateCell(col0: number, row0: number, w0: number, h0: number, rot: number): { col: number; row: number } {
  if (rot === 90) return { col: h0 - 1 - row0, row: col0 };
  if (rot === 180) return { col: w0 - 1 - col0, row: h0 - 1 - row0 };
  if (rot === 270) return { col: row0, row: w0 - 1 - col0 };
  return { col: col0, row: row0 };
}

/** Inverse of `dipRotateCell`: current-frame cell → 0°-frame cell. */
function dipUnrotateCell(col: number, row: number, w0: number, h0: number, rot: number): { col0: number; row0: number } {
  if (rot === 90) return { col0: row, row0: h0 - 1 - col };
  if (rot === 180) return { col0: w0 - 1 - col, row0: h0 - 1 - row };
  if (rot === 270) return { col0: w0 - 1 - row, row0: col };
  return { col0: col, row0: row };
}

/** pad -> pin. The inverse of `dotForPin`. Null when the dot is not one of this component's pins. */
export function pinAtDot(geo: IcGeometry, dot: { x: number; y: number }): number | null {
  const { topLeftDot, widthPin, heightPin, rotationAngle } = geo;
  if (!topLeftDot) return null;

  if (isGridLayout(geo)) {
    const col = Math.round((dot.x - topLeftDot.x) / 50);
    const row = Math.round((dot.y - topLeftDot.y) / 50);
    if (col < 0 || col >= widthPin || row < 0 || row >= heightPin) return null;
    return row * widthPin + col + 1;
  }

  if (isRowLayout(geo)) {
    // One pin per hole along whichever axis currently has extent (the other is 1).
    const n = Math.max(widthPin, heightPin);
    if (widthPin >= heightPin) {
      if (dot.y !== topLeftDot.y) return null;
      const i = Math.round((dot.x - topLeftDot.x) / 50);
      return i >= 0 && i < n ? i + 1 : null;
    }
    if (dot.x !== topLeftDot.x) return null;
    const i = Math.round((dot.y - topLeftDot.y) / 50);
    return i >= 0 && i < n ? i + 1 : null;
  }

  // DIP perimeter, any rotation: undo the rigid rotation back to the 0° frame,
  // then read the pin off the two-column layout.
  const { w0, h0 } = dipDims0(geo);
  const col = Math.round((dot.x - topLeftDot.x) / 50);
  const row = Math.round((dot.y - topLeftDot.y) / 50);
  if (col < 0 || col >= widthPin || row < 0 || row >= heightPin) return null;
  const { col0, row0 } = dipUnrotateCell(col, row, w0, h0, rotationAngle);
  return dipPinAtCell0(col0, row0, w0, h0);
}

/** pin -> pad. The inverse of `pinAtDot`. Null for a pin number outside the component's range. */
export function dotForPin(geo: IcGeometry, pin: number): { x: number; y: number } | null {
  const { topLeftDot, widthPin, heightPin, rotationAngle } = geo;
  if (!topLeftDot) return null;
  if (pin < 1 || pin > pinCountOf(geo)) return null;

  if (isGridLayout(geo)) {
    const idx = pin - 1;
    const col = idx % widthPin;
    const row = Math.floor(idx / widthPin);
    return { x: topLeftDot.x + col * 50, y: topLeftDot.y + row * 50 };
  }

  if (isRowLayout(geo)) {
    return widthPin >= heightPin
      ? { x: topLeftDot.x + (pin - 1) * 50, y: topLeftDot.y }
      : { x: topLeftDot.x, y: topLeftDot.y + (pin - 1) * 50 };
  }

  // DIP perimeter, any rotation: place the pin in the 0° frame, then apply the
  // rigid clockwise rotation for the current angle.
  const { w0, h0 } = dipDims0(geo);
  const cell0 = dipCell0(pin, w0, h0);
  if (!cell0) return null;
  const { col, row } = dipRotateCell(cell0.col0, cell0.row0, w0, h0, rotationAngle);
  return { x: topLeftDot.x + col * 50, y: topLeftDot.y + row * 50 };
}
