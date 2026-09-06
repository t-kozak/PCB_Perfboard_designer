/**
 * Logical layer — a set of pins that are electrically one node. Derived from
 * `State.connections` (union-find over terminals) on demand; not persisted.
 * See docs/logical-connections.md.
 */
export interface INet {
  id: string;
  /** "GND", "VCC", or an auto-assigned "N$3". */
  name: string;
  /**
   * A derived palette colour, used only for the net's swatch in the Nets /
   * Connections sidebar panels. It is NOT a wire colour — wire appearance
   * lives on `IConnection.color` — and it is not persisted or user-editable.
   */
  color?: string;
}
