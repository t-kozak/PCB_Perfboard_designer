import {Canvas} from "../../state/Canvas";
import {State} from "../../state/State";
import {redrawCanvas} from "../draw-canvas";

export interface BoardSides {
  component: HTMLCanvasElement;
  solder: HTMLCanvasElement;
  /** Device pixels per board unit in both snapshots. */
  scale: number;
}

/**
 * Snapshots both faces of the open board into two offscreen canvases, at
 * `scale` device pixels per board unit (the live view's own DPR by default),
 * independent of the current zoom. Hover and selection highlights are
 * suppressed for the snapshot; the view is restored afterwards. `print`
 * renders in `Canvas.printStyle` (white board, faint holes — for paper) and
 * always with straight "direct" wires, whatever the board's own routing mode.
 */
export function renderBoardSides(scale = Canvas.dpr, print = false): BoardSides {
  const viewZoom = Canvas.zoom;
  const viewSolder = Canvas.solderSide;
  const saved = {
    hoverDot: State.hoverDot, hoverConnection: State.hoverConnection, hoverIc: State.hoverIc,
    selectedDot: State.selectedDot, selectedConnection: State.selectedConnection,
    selectedPlacedIc: State.selectedPlacedIc, selectedPlacedIcs: State.selectedPlacedIcs,
    pendingTerminal: State.pendingTerminal,
  };
  Object.assign(State, {
    hoverDot: undefined, hoverConnection: undefined, hoverIc: undefined,
    selectedDot: undefined, selectedConnection: undefined,
    selectedPlacedIc: undefined, selectedPlacedIcs: [], pendingTerminal: undefined,
  });
  const viewRouting = State.routingMode;
  if (print) State.routingMode = 'direct'; // the wire cache re-derives on the mode change
  Canvas.setZoom(scale / Canvas.dpr);
  Canvas.printStyle = print;

  const snapshot = (solder: boolean) => {
    Canvas.setSolderSide(solder);
    redrawCanvas();
    const copy = document.createElement('canvas');
    copy.width = Canvas.c.width;
    copy.height = Canvas.c.height;
    copy.getContext('2d')!.drawImage(Canvas.c, 0, 0);
    return copy;
  };

  try {
    return {component: snapshot(false), solder: snapshot(true), scale: Canvas.renderScale};
  } finally {
    Canvas.printStyle = false;
    State.routingMode = viewRouting;
    Object.assign(State, saved);
    Canvas.setSolderSide(viewSolder);
    Canvas.setZoom(viewZoom);
    redrawCanvas();
  }
}
