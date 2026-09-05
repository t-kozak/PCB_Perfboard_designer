import {State} from "../state/State";
import {Canvas} from "../state/Canvas";

/**
 * Perfboard axis labelling. Real perfboards are silkscreened with numbers down
 * one edge and letters along the other, so a hole has a spreadsheet-style
 * coordinate ("B4", "D10"). Each axis therefore carries its own label mode, and
 * the Grid Configuration inputs accept either notation — the notation you type
 * *is* the mode, so "J" and "10" both mean ten columns.
 *
 * Pure module: `toLetters` / `fromLetters` / `parseAxisSize` / `formatAxisSize`
 * touch neither DOM nor State. The drawing half at the bottom is the only part
 * that does.
 */

export type AxisMode = "number" | "letter";

/** Largest letter run we accept — bijective base-26 "ZZ". */
export const MAX_LETTER_COUNT = 26 * 26 + 26; // 702

/**
 * Bijective base-26: 1 -> "A", 26 -> "Z", 27 -> "AA", 702 -> "ZZ". Unlike plain
 * base-26 there is no zero digit, hence the `- 1` before each division.
 */
export function toLetters(n: number): string {
  let out = "";
  let v = Math.floor(n);
  while (v > 0) {
    const rem = (v - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    v = Math.floor((v - 1) / 26);
  }
  return out;
}

/** Inverse of `toLetters`. Returns 0 for anything that isn't A..ZZ. */
export function fromLetters(s: string): number {
  if (!/^[A-Za-z]{1,2}$/.test(s)) return 0;
  let n = 0;
  for (const ch of s.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

/**
 * Read one axis input. Digits mean a numeric axis, letters a lettered one —
 * `null` if it is neither (the caller keeps the previous value and flags it).
 */
export function parseAxisSize(raw: string): {count: number; mode: AxisMode} | null {
  const text = raw.trim();
  if (/^\d+$/.test(text)) {
    const count = parseInt(text, 10);
    return count >= 1 ? {count, mode: "number"} : null;
  }
  const count = fromLetters(text);
  return count >= 1 ? {count, mode: "letter"} : null;
}

/**
 * Render a count back into an input value, in that axis's own notation. Past
 * "ZZ" letters run out, so an oversized lettered axis reports as a number
 * rather than an "AAA" the input would refuse to parse back.
 */
export function formatAxisSize(count: number, mode: AxisMode): string {
  return mode === "letter" && count <= MAX_LETTER_COUNT ? toLetters(count) : String(count);
}

/**
 * The label for the `index`-th (0-based) row or column. Columns past "ZZ" on a
 * lettered axis fall back to their number, so every pad stays labelled.
 */
export function axisLabel(index: number, mode: AxisMode): string {
  return formatAxisSize(index + 1, mode);
}

/**
 * The label for a row, honouring `State.rowLabelsBottomUp` — the row nearest
 * the bottom edge takes the first label when it is set.
 */
function rowLabel(index: number, rowCount: number): string {
  const i = State.rowLabelsBottomUp ? rowCount - 1 - index : index;
  return axisLabel(i, State.rowLabelMode);
}

// --- Drawing ---------------------------------------------------------------

/**
 * Distinct, ascending X and Y coordinates of the pad grid — the tick positions
 * the labels hang off. Memoised on the `State.dots` array identity: this runs
 * on every repaint, and repaints happen on every mouse move. Every site that
 * changes the grid assigns a fresh array, so identity is a sound cache key.
 */
let ticksCache: {dots: unknown; xs: number[]; ys: number[]} | null = null;

function gridTicks(): {xs: number[]; ys: number[]} {
  if (ticksCache && ticksCache.dots === State.dots) return ticksCache;
  const xs = [...new Set(State.dots.map(d => d.x))].sort((a, b) => a - b);
  const ys = [...new Set(State.dots.map(d => d.y))].sort((a, b) => a - b);
  ticksCache = {dots: State.dots, xs, ys};
  return ticksCache;
}


/**
 * Paint the column labels along the top edge and the row labels down the left
 * edge, in the gutter `createDotGrid()` reserves for them.
 *
 * Positions are derived from the pads actually on the board rather than from
 * the grid constants, so projects saved before the gutter existed still get
 * labels — they just sit closer to the first row (the `Math.max` clamp keeps
 * them on-board).
 *
 * On the solder side the board transform mirrors X, so the column labels move
 * to the right-hand edge along with the columns they name — which is exactly
 * what you see when you physically turn a board over. `Canvas.fillText` keeps
 * the glyphs upright.
 */
export function drawGridLabels(): void {
  if (State.dots.length === 0) return;
  const ctx = Canvas.ctx;
  const {xs, ys} = gridTicks();
  const offset = State.gridGutter + State.dotRadius;

  ctx.save();
  ctx.font = "bold 12px Inter, Arial";
  ctx.fillStyle = "rgba(226, 232, 240, 0.75)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const labelY = Math.max(ys[0] - offset, 11);
  for (let i = 0; i < xs.length; i++) {
    Canvas.fillText(axisLabel(i, State.colLabelMode), xs[i], labelY);
  }

  const labelX = Math.max(xs[0] - offset, 12);
  for (let i = 0; i < ys.length; i++) {
    Canvas.fillText(rowLabel(i, ys.length), labelX, ys[i]);
  }
  ctx.restore();
}

/**
 * Human-readable pad coordinate ("B4"), or `null` for a pad off the grid. The
 * two halves only run together unambiguously when the axes use different
 * notations; otherwise ("10" over "10") they need a separator.
 */
export function dotCoordinateLabel(dot: {x: number; y: number}): string | null {
  const {xs, ys} = gridTicks();
  const col = xs.indexOf(dot.x);
  const row = ys.indexOf(dot.y);
  if (col < 0 || row < 0) return null;
  const sep = State.colLabelMode === State.rowLabelMode ? "," : "";
  return `${axisLabel(col, State.colLabelMode)}${sep}${rowLabel(row, ys.length)}`;
}
