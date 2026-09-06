import {IDot} from "../interfaces/dot.interface";
import {ILine} from "../interfaces/line.interface";
import {IChange} from "../interfaces/change.interface";
import {INet} from "../interfaces/net.interface";
import {IConnection, ITerminal} from "../interfaces/connection.interface";
import {Ic} from "../features/ic";
import type {AxisMode} from "../features/grid-labels";

export class State {

  static dotRadius = 10
  static dotSpace = 50
  /**
   * Clear board margin along the top and left edges, on top of the half-pitch
   * the grid already leaves, reserved for the row/column labels.
   */
  static gridGutter = 26
  static dots: IDot[] = [];
  /** Notation the column (X) axis is labelled in — see features/grid-labels.ts. */
  static colLabelMode: AxisMode = "letter";
  /** Notation the row (Y) axis is labelled in. */
  static rowLabelMode: AxisMode = "number";
  /**
   * Count the rows from the bottom edge up instead of the top down — how a lot
   * of perfboards are actually silkscreened. Label positions don't move, only
   * which label lands on which row.
   */
  static rowLabelsBottomUp = false;
  static selectedDot?: IDot;
  static hoverDot?: IDot

  /**
   * Transient solder-side wire render cache — NOT state. Recomputed from
   * `connections` + component geometry by `refreshWireCache()` on every
   * repaint, never saved, never in undo. See docs/logical-connections.md §11.
   */
  static lines: ILine[] = [];

  /** The logical layer — pin-to-pin joints, source of truth. Component-side only. */
  static connections: IConnection[] = [];
  static selectedConnection?: IConnection;
  static hoverConnection?: IConnection;
  /** Connect tool: the first terminal clicked, awaiting a second. */
  static pendingTerminal?: ITerminal;

  /** Logical net layer, derived from `connections` on demand. See src/nets/. */
  static nets: INet[] = [];

  /** Global solder-side routing style: orthogonal (A*) or direct (straight). */
  static routingMode: 'orthogonal' | 'direct' = 'orthogonal';

  static changes: IChange[] = []
  static changeIndex = -1;

  static selectedIc?: Ic;
  static placedIcs: Ic[] = [];
  static selectedPlacedIc?: Ic;
  static hoverIc?: Ic;
  static isDraggingIc = false;

  static activeToolMode: 'select' | 'connect' | 'ic' = 'select';
  static selectedWireWidth = 4;
  static activeWireColor = "#3b82f6";


  static extraSelectionRatio = 4;
  static dotSelectionRadius = State.dotRadius * State.extraSelectionRatio;

  static lineSelectTolerance = 5;

  static canvasBackgroundColor = "#046307"
}
