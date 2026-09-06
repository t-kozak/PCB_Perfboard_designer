import {IDot} from "./dot.interface";

/**
 * A rendered solder-side wire segment. Under the stateless-solder-side model
 * (docs/logical-connections.md §11) an `ILine` is never authored or persisted —
 * it is transient router output, recomputed from `State.connections` on every
 * repaint. One connection produces one wire (a straight segment in "direct"
 * mode, an orthogonal polyline of several segments in "orthogonal" mode).
 */
export interface ILine {
  start: IDot,
  end: IDot,
  color?: string;
  width?: number;
  /** Which net (logical node) this wire realises. Assigned by the router. */
  netId?: string;
  /** Which connection this segment belongs to — for hit-testing / hover / select. */
  connId?: string;
}
