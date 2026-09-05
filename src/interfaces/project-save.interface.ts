import {ILine} from "./line.interface";
import {IDot} from "./dot.interface";
import {INet} from "./net.interface";
import {IConnection} from "./connection.interface";
import {Ic} from "../features/ic";
import type {AxisMode} from "../features/grid-labels";

export interface IProjectSave {
  /**
   * Save-format version. Absent / < 2 = v1 (float component ids). < 3 has no
   * `connections` — hand-drawn wires are the source of truth and get
   * migrated to connections on load (docs/logical-connections.md §6).
   */
  version?: number;
  /** The logical layer — source of truth from v3 on. Absent on v1/v2 files. */
  connections?: IConnection[];
  /** Generated wires — a cache, safe to discard and re-derive by flipping the board. */
  lines: ILine[];
  dots: IDot[];
  ICs: Ic[];
  placedIcs?: any[];
  nets?: INet[];
  canvas: {width: number, height: number};
  /**
   * Row/column label notation (features/grid-labels.ts). Absent on files saved
   * before axis labelling existed — those default to all-numeric.
   */
  grid?: {colLabelMode: AxisMode, rowLabelMode: AxisMode, rowLabelsBottomUp?: boolean};
}
