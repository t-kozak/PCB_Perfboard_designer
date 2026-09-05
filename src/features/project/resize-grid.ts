import {State} from "../../state/State";
import {redrawCanvas} from "../draw-canvas";
import {Utils} from "../../utils/utils";
import {Canvas} from "../../state/Canvas";
import {formatAxisSize, parseAxisSize} from "../grid-labels";

export const widthInput = Utils.getSafeHtmlElement<HTMLInputElement>('dotMatrixWidth')
export const heightInput = Utils.getSafeHtmlElement<HTMLInputElement>('dotMatrixHeight')
const resizeBtn = Utils.getSafeHtmlElement<HTMLButtonElement>('resizeGridBtn')
const bottomUpToggle = Utils.getSafeHtmlElement<HTMLInputElement>('rowLabelsBottomUp')

// Row direction is presentation only — no pad moves, so apply it on the spot
// rather than making the user hit Resize.
bottomUpToggle.addEventListener('change', function() {
  State.rowLabelsBottomUp = bottomUpToggle.checked;
  redrawCanvas();
});

/** Briefly mark an input that couldn't be parsed, instead of silently resizing. */
function flagInvalid(input: HTMLInputElement) {
  input.classList.add('input-error');
  setTimeout(() => input.classList.remove('input-error'), 1200);
}

/**
 * Read both axis inputs. Each accepts a count in either notation ("10" or "J"),
 * and the notation chosen becomes that axis's label mode. Returns `null` — and
 * flags the offending field — if either side is unreadable.
 */
export function readGridInputs(): {cols: number; rows: number} | null {
  const w = parseAxisSize(widthInput.value);
  const h = parseAxisSize(heightInput.value);
  if (!w) flagInvalid(widthInput);
  if (!h) flagInvalid(heightInput);
  if (!w || !h) return null;
  State.colLabelMode = w.mode;
  State.rowLabelMode = h.mode;
  State.rowLabelsBottomUp = bottomUpToggle.checked;
  return {cols: w.count, rows: h.count};
}

/** Write a grid size back into the inputs, each in its axis's own notation. */
export function syncGridInputs(cols: number, rows: number) {
  widthInput.value = formatAxisSize(cols, State.colLabelMode);
  heightInput.value = formatAxisSize(rows, State.rowLabelMode);
  bottomUpToggle.checked = State.rowLabelsBottomUp;
}

/**
 * Apply a preset board. A preset spells out the entire labelling scheme — the
 * count *and* the notation for each axis, plus the row direction — so the
 * button's caption is literally what you get. Writing the literals into the
 * inputs and re-reading them is what sets the axis modes.
 *
 * Like the preset buttons have always done, this rebuilds the pad grid only; it
 * does not clear wires or components the way the Resize button does.
 */
export function applyGridPreset(w: string, h: string, bottomUp: boolean) {
  widthInput.value = w;
  heightInput.value = h;
  bottomUpToggle.checked = bottomUp;
  const size = readGridInputs();
  if (!size) return;
  createDotGrid(size.cols, size.rows);
  redrawCanvas();
}

resizeBtn.addEventListener('click', function() {
  const size = readGridInputs();
  if (!size) return;
  // Recreate the dot grid
  createDotGrid(size.cols, size.rows);

  // Clear all lines and redraw the canvas
  State.lines = [];
  State.nets = [];
  redrawCanvas();
  window.dispatchEvent(new Event('nets-changed'));
});

export function createDotGrid(horizontalDotNumbers: number, verticalDotNumbers: number) {
  // The board carries an extra top/left gutter for the row & column labels; the
  // pads keep their usual half-pitch inset inside it.
  const gutter = State.gridGutter;
  Canvas.setBoardSize(
    gutter + horizontalDotNumbers * State.dotSpace,
    gutter + verticalDotNumbers * State.dotSpace,
  );

  const origin = gutter + State.dotSpace / 2;
  State.dots = [];
  for (let col = 0; col < horizontalDotNumbers; col++) {
    for (let row = 0; row < verticalDotNumbers; row++) {
      State.dots.push({
        x: origin + col * State.dotSpace,
        y: origin + row * State.dotSpace,
        description: null,
        color: "#a4a0a0",
      });
    }
  }
}
