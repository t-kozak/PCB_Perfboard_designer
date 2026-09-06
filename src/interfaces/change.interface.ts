import type {IConnection} from "./connection.interface";
import type {Ic} from "../features/ic";

/**
 * One undoable step. Holds every connection / component the step added and/or
 * removed, so a batch operation (deleting a component and cascading its
 * connections) reverses in a single Ctrl+Z. Both are matched back by `id`.
 * Wires are not tracked — they are stateless router output
 * (docs/logical-connections.md §11).
 */
export interface IChange {
  connectionsAdded?: IConnection[];
  connectionsRemoved?: IConnection[];
  componentsAdded?: Ic[];
  componentsRemoved?: Ic[];
}
