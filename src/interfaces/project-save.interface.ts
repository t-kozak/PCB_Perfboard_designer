import {ILine} from "./line.interface";
import {IDot} from "./dot.interface";
import {INet} from "./net.interface";
import {Ic} from "../features/ic";

export interface IProjectSave {
  /** Save-format version. Absent / < 2 means a v1 file (float component ids). */
  version?: number;
  lines: ILine[];
  dots: IDot[];
  ICs: Ic[];
  placedIcs?: any[];
  nets?: INet[];
  canvas: {width: number, height: number};
}
