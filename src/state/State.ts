import {IDot} from "../interfaces/dot.interface";
import {ILine} from "../interfaces/line.interface";
import {IChange} from "../interfaces/change.interface";
import {INet} from "../interfaces/net.interface";
import {Ic} from "../features/ic";

export class State {

  static dotRadius = 5
  static dotSpace = 50
  static dots: IDot[] = [];
  static selectedDot?: IDot;
  static hoverDot?: IDot

  static lines: ILine[] = [];
  static selectedLine?: ILine;
  static hoverLine?: ILine;

  /** Logical net layer, derived from `lines` and persisted. See src/nets/. */
  static nets: INet[] = [];
  /** When true, wires are drawn in their net's colour instead of their own. */
  static showNetColors = false;

  static changes: IChange[] = []
  static changeIndex = -1;

  static selectedIc?: Ic;
  static placedIcs: Ic[] = [];
  static selectedPlacedIc?: Ic;
  static hoverIc?: Ic;
  static isDraggingIc = false;

  static activeToolMode: 'select' | 'wire' | 'eraser' | 'note' | 'ic' = 'select';
  static selectedWireWidth = 4;
  static activeWireColor = "#3b82f6";


  static extraSelectionRatio = 4;
  static dotSelectionRadius = State.dotRadius * State.extraSelectionRatio;

  static lineSelectTolerance = 5;

  static canvasBackgroundColor = "#046307"
}
