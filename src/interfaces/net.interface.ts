/**
 * Logical layer — a set of pads that are electrically one node. Derived from
 * the physical wire list (union-find over `State.lines`) and then persisted, so
 * hand-tuned names / colours / locks survive a reload. See docs/autorouting.md.
 */
export interface INet {
  id: string;
  /** "GND", "VCC", or an auto-assigned "N$3". */
  name: string;
  color?: string;
  /** Hand-edited — a future router must not rewrite this net's wires. */
  locked?: boolean;
  /**
   * Sorted, joined pad keys (`"x,y"`) of this net's terminals as of its last
   * routing pass. Compared against the net's current signature to decide
   * whether flipping to the solder side needs to re-route it (see
   * docs/logical-connections.md §3).
   */
  routedSignature?: string;
}
