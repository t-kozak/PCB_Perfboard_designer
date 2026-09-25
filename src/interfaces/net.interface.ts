/**
 * Logical layer — a set of pins that are electrically one node. Derived from
 * `State.connections` (union-find over terminals) on demand; not persisted.
 * See docs/logical-connections.md.
 */
export interface INet {
  id: string;
  /** A name given by the project file ("+12V", "CLK1"), or a derived "GND" / "VCC" / "N$3". */
  name: string;
  /**
   * The name was derived (power pins or `N$n`), not given — it is re-derived
   * on every rebuild and saved as an unnamed net. Unset for a given name, which
   * sticks to the net across rebuilds.
   */
  auto?: true;
  /**
   * A derived palette colour, used only for the net's swatch in the Nets /
   * Connections sidebar panels. It is NOT a wire colour — wire appearance
   * lives on `IConnection.color` — and it is not persisted or user-editable.
   */
  color?: string;
}
