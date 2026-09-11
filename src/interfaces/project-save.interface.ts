import {ILine} from "./line.interface";
import {IDot} from "./dot.interface";
import {INet} from "./net.interface";
import {IConnection} from "./connection.interface";
import {Ic} from "../features/ic";
import type {AxisMode} from "../features/grid-labels";

export interface IProjectSave {
  /**
   * Save-format version. Absent / < 2 = v1 (float component ids). < 3 has no
   * `connections` — hand-drawn wires are the source of truth and get migrated
   * to connections on load (docs/logical-connections.md §6). v4 makes the
   * solder side stateless: no `lines`/`nets` are written, and `routingMode` is
   * persisted (§11). v5 drops per-connection wire colour — a wire is always
   * drawn in its net's colour — so only `width` remains on a connection; any
   * `color` on an older file is ignored on load.
   */
  version?: number;
  /** The logical layer — source of truth from v3 on. Absent on v1/v2 files. */
  connections?: IConnection[];
  /** Legacy: hand-drawn / generated wires. Written up to v3, ignored on load from v4. */
  lines?: ILine[];
  dots: IDot[];
  ICs: Ic[];
  placedIcs?: any[];
  /** Legacy: persisted net layer (v3 and earlier). Ignored on load — nets are fully derived. */
  nets?: INet[];
  /** Global solder-side routing style. Absent on < v4 files → "orthogonal". */
  routingMode?: "orthogonal" | "direct";
  canvas: {width: number, height: number};
  /**
   * Row/column label notation (features/grid-labels.ts). Absent on files saved
   * before axis labelling existed — those default to all-numeric.
   */
  grid?: {colLabelMode: AxisMode, rowLabelMode: AxisMode, rowLabelsBottomUp?: boolean};
}
