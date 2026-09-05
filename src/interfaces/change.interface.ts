import {ILine} from "./line.interface";
import type {IConnection} from "./connection.interface";
import type {Ic} from "../features/ic";

/**
 * One undoable step. Holds every wire / connection / component the step
 * added and/or removed, so a batch operation (a routing pass, or deleting a
 * component and cascading its connections) reverses in a single Ctrl+Z.
 * Wires are matched back by endpoint coordinate (they have no id, and loaded
 * projects re-hydrate endpoint copies); connections and components are
 * matched by `id`.
 */
export interface IChange {
  added?: ILine[];
  removed?: ILine[];
  connectionsAdded?: IConnection[];
  connectionsRemoved?: IConnection[];
  componentsAdded?: Ic[];
  componentsRemoved?: Ic[];
}
