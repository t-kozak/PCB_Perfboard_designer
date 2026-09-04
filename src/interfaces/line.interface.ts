import {IDot} from "./dot.interface";

export interface ILine {
  start: IDot,
  end: IDot,
  color?: string;
  width?: number;
  /** Which net (logical node) this wire realises. Assigned by net derivation. */
  netId?: string;
  /** The router owns this wire — safe to discard and redraw. */
  generated?: boolean;
}
