import {ILine} from "./line.interface";

/**
 * One undoable step. Holds every wire the step added and/or removed, so a batch
 * operation (a routing pass that discards a net's wires and lays down new ones)
 * reverses in a single Ctrl+Z. Lines are matched back by endpoint coordinate,
 * not object identity — consistent with loaded projects, whose endpoints are
 * re-hydrated copies.
 */
export interface IChange {
  added?: ILine[];
  removed?: ILine[];
}
