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

/**
 * Total number of pins on a component, in its current rotation. Pin count is
 * rotation-invariant, but which field holds "pins per side" is not: at 0°/180°
 * it's `heightPin` (a vertical part), at 90°/270° it's `widthPin` (horizontal)
 * — the same split `pinAtDot` / `dotForPin` read from, since `Ic.rotate()`
 * swaps `widthPin`/`heightPin` together with `rotationAngle`.
 */
export function pinCountOf(geo: Pick<IcGeometry, "kind" | "widthPin" | "heightPin" | "rotationAngle">): number {
  if (geo.kind === "bridge") return 1;
  const perSide = geo.rotationAngle === 90 || geo.rotationAngle === 270 ? geo.widthPin : geo.heightPin;
  return perSide * 2;
}

/** pad -> pin. The inverse of `dotForPin`. Null when the dot is not one of this component's pins. */
export function pinAtDot(geo: IcGeometry, dot: { x: number; y: number }): number | null {
  const { topLeftDot, widthPin, heightPin, rotationAngle } = geo;
  if (!topLeftDot) return null;

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
