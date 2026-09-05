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
const LEADED_KINDS = ["resistor", "cap-ceramic", "cap-electrolytic"];

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
  if (isRowLayout(geo)) return Math.max(geo.widthPin, geo.heightPin);
  const perSide = geo.rotationAngle === 90 || geo.rotationAngle === 270 ? geo.widthPin : geo.heightPin;
  return perSide * 2;
}

/** pad -> pin. The inverse of `dotForPin`. Null when the dot is not one of this component's pins. */
export function pinAtDot(geo: IcGeometry, dot: { x: number; y: number }): number | null {
  const { topLeftDot, widthPin, heightPin, rotationAngle } = geo;
  if (!topLeftDot) return null;

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

  if (rotationAngle === 0) {
    // Vertical: Left = 1..N, Right = 2N..N+1 (N = heightPin)
    const isOnLeftSide = dot.x === topLeftDot.x && dot.y >= topLeftDot.y && dot.y <= topLeftDot.y + (heightPin - 1) * 50;
    const isOnRightSide = dot.x === topLeftDot.x + 50 * (widthPin - 1) && dot.y >= topLeftDot.y && dot.y <= topLeftDot.y + (heightPin - 1) * 50;
    if (!(isOnLeftSide || isOnRightSide)) return null;
    const i = Math.round((dot.y - topLeftDot.y) / 50);
    if (i >= 0 && i < heightPin) return isOnLeftSide ? i + 1 : heightPin * 2 - i;
  } else if (rotationAngle === 90) {
    // Horizontal: Top = 1..N, Bottom = 2N..N+1 (N = widthPin)
    const isOnTopSide = dot.y === topLeftDot.y && dot.x >= topLeftDot.x && dot.x <= topLeftDot.x + (widthPin - 1) * 50;
    const isOnBottomSide = dot.y === topLeftDot.y + 50 * (heightPin - 1) && dot.x >= topLeftDot.x && dot.x <= topLeftDot.x + (widthPin - 1) * 50;
    if (!(isOnTopSide || isOnBottomSide)) return null;
    const i = Math.round((dot.x - topLeftDot.x) / 50);
    if (i >= 0 && i < widthPin) return isOnTopSide ? i + 1 : widthPin * 2 - i;
  } else if (rotationAngle === 180) {
    // Vertical: Right = 1..N, Left = 2N..N+1 (N = heightPin)
    const isOnLeftSide = dot.x === topLeftDot.x && dot.y >= topLeftDot.y && dot.y <= topLeftDot.y + (heightPin - 1) * 50;
    const isOnRightSide = dot.x === topLeftDot.x + 50 * (widthPin - 1) && dot.y >= topLeftDot.y && dot.y <= topLeftDot.y + (heightPin - 1) * 50;
    if (!(isOnLeftSide || isOnRightSide)) return null;
    const i = Math.round((dot.y - topLeftDot.y) / 50);
    if (i >= 0 && i < heightPin) return isOnRightSide ? i + 1 : heightPin * 2 - i;
  } else if (rotationAngle === 270) {
    // Horizontal: Bottom = 1..N, Top = 2N..N+1 (N = widthPin)
    const isOnTopSide = dot.y === topLeftDot.y && dot.x >= topLeftDot.x && dot.x <= topLeftDot.x + (widthPin - 1) * 50;
    const isOnBottomSide = dot.y === topLeftDot.y + 50 * (heightPin - 1) && dot.x >= topLeftDot.x && dot.x <= topLeftDot.x + (widthPin - 1) * 50;
    if (!(isOnTopSide || isOnBottomSide)) return null;
    const i = Math.round((dot.x - topLeftDot.x) / 50);
    if (i >= 0 && i < widthPin) return isOnBottomSide ? i + 1 : widthPin * 2 - i;
  }
  return null;
}

/** pin -> pad. The inverse of `pinAtDot`. Null for a pin number outside the component's range. */
export function dotForPin(geo: IcGeometry, pin: number): { x: number; y: number } | null {
  const { topLeftDot, widthPin, heightPin, rotationAngle } = geo;
  if (!topLeftDot) return null;
  if (pin < 1 || pin > pinCountOf(geo)) return null;

  if (isRowLayout(geo)) {
    return widthPin >= heightPin
      ? { x: topLeftDot.x + (pin - 1) * 50, y: topLeftDot.y }
      : { x: topLeftDot.x, y: topLeftDot.y + (pin - 1) * 50 };
  }

  if (rotationAngle === 0) {
    if (pin <= heightPin) return { x: topLeftDot.x, y: topLeftDot.y + (pin - 1) * 50 };
    const i = heightPin * 2 - pin;
    return { x: topLeftDot.x + 50 * (widthPin - 1), y: topLeftDot.y + i * 50 };
  }
  if (rotationAngle === 90) {
    if (pin <= widthPin) return { x: topLeftDot.x + (pin - 1) * 50, y: topLeftDot.y };
    const i = widthPin * 2 - pin;
    return { x: topLeftDot.x + i * 50, y: topLeftDot.y + 50 * (heightPin - 1) };
  }
  if (rotationAngle === 180) {
    if (pin <= heightPin) return { x: topLeftDot.x + 50 * (widthPin - 1), y: topLeftDot.y + (pin - 1) * 50 };
    const i = heightPin * 2 - pin;
    return { x: topLeftDot.x, y: topLeftDot.y + i * 50 };
  }
  if (rotationAngle === 270) {
    if (pin <= widthPin) return { x: topLeftDot.x + (pin - 1) * 50, y: topLeftDot.y + 50 * (heightPin - 1) };
    const i = widthPin * 2 - pin;
    return { x: topLeftDot.x + i * 50, y: topLeftDot.y };
  }
  return null;
}
