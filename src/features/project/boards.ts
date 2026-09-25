import {State} from "../../state/State";
import {Canvas} from "../../state/Canvas";
import {IDot} from "../../interfaces/dot.interface";
import {IConnection} from "../../interfaces/connection.interface";
import {INet} from "../../interfaces/net.interface";
import {IChange} from "../../interfaces/change.interface";
import type {Ic} from "../ic";
import type {AxisMode} from "../grid-labels";
import {finishLoad, loadBoardText} from "./load-project";
import {getSaveNetlist} from "./save-project";
import {createDotGrid, readGridInputs, syncGridInputs} from "./resize-grid";
import {parseNetlist} from "../../kicad/netlist";
import {isProjectFile, parseProjectFile, writeProjectFile} from "../../kicad/project-file";

/**
 * A project is a list of boards; exactly one is open, and it *is* `State`
 * (dots, components, connections, undo history…) — every other feature keeps
 * working on the open board without knowing boards exist.
 *
 * A board that has been open this session keeps its live state when you
 * switch away (`live`), so coming back is lossless and keeps its undo
 * history. `text` is the board as a KiCad netlist — what autosave and the
 * project file store, and how a board not yet opened this session (after a
 * reload or an import) is loaded.
 */

interface BoardState {
  dots: IDot[];
  connections: IConnection[];
  placedIcs: Ic[];
  nets: INet[];
  colLabelMode: AxisMode;
  rowLabelMode: AxisMode;
  rowLabelsBottomUp: boolean;
  routingMode: typeof State.routingMode;
  changes: IChange[];
  changeIndex: number;
  width: number;
  height: number;
}

interface BoardSlot {
  name: string;
  text: string;
  live?: BoardState;
}

let boards: BoardSlot[] = [{name: "Board 1", text: ""}];
let active = 0;

/** Fired on `window` whenever the board list or the open board changes. */
export const BOARDS_CHANGED = "boards-changed";

function notify() {
  window.dispatchEvent(new Event(BOARDS_CHANGED));
}

export function boardNames(): string[] {
  return boards.map(b => b.name);
}

export function activeBoardIndex(): number {
  return active;
}

export function activeBoardName(): string {
  return boards[active].name;
}

/** The first "Board N" not already taken. */
export function nextBoardName(): string {
  const taken = new Set(boardNames());
  let n = boards.length + 1;
  while (taken.has(`Board ${n}`)) n++;
  return `Board ${n}`;
}

function captureBoard(): BoardState {
  return {
    dots: State.dots,
    connections: State.connections,
    placedIcs: State.placedIcs,
    nets: State.nets,
    colLabelMode: State.colLabelMode,
    rowLabelMode: State.rowLabelMode,
    rowLabelsBottomUp: State.rowLabelsBottomUp,
    routingMode: State.routingMode,
    changes: State.changes,
    changeIndex: State.changeIndex,
    width: Canvas.boardWidth,
    height: Canvas.boardHeight,
  };
}

function restoreBoard(b: BoardState) {
  State.dots = b.dots;
  State.connections = b.connections;
  State.placedIcs = b.placedIcs;
  State.nets = b.nets;
  State.colLabelMode = b.colLabelMode;
  State.rowLabelMode = b.rowLabelMode;
  State.rowLabelsBottomUp = b.rowLabelsBottomUp;
  State.routingMode = b.routingMode;
  State.changes = b.changes;
  State.changeIndex = b.changeIndex;
  State.lines = [];
  Canvas.setBoardSize(b.width, b.height);
  syncGridInputs(new Set(b.dots.map(d => d.x)).size, new Set(b.dots.map(d => d.y)).size);
  finishLoad();
}

/** Parks the open board in its slot (live state + netlist text) before another takes over `State`. */
function stashActive() {
  const slot = boards[active];
  slot.live = captureBoard();
  slot.text = getSaveNetlist(undefined, slot.name);
}

/** Opens a slot's board into `State`: its live state if it has one, else its saved text. */
function openSlot(slot: BoardSlot): string[] {
  if (slot.live) {
    restoreBoard(slot.live);
    return [];
  }
  if (!slot.text) {
    clearBoard();
    return [];
  }
  return loadBoardText(slot.text);
}

/** Replaces `State` with an empty board, sized from the Grid Configuration inputs. */
export function clearBoard() {
  State.lines = [];
  State.connections = [];
  State.placedIcs = [];
  State.nets = [];
  State.changes = [];
  State.changeIndex = -1;
  State.routingMode = 'orthogonal';
  const size = readGridInputs() ?? {cols: 10, rows: 10};
  createDotGrid(size.cols, size.rows);
  finishLoad();
}

/** Opens another board. If its saved text can't be read, the current board stays open and this throws. */
export function switchBoard(index: number): string[] {
  if (index === active || !boards[index]) return [];
  stashActive();
  const previous = active;
  try {
    const warnings = openSlot(boards[index]);
    active = index;
    return warnings;
  } catch (e) {
    openSlot(boards[previous]);
    throw e;
  } finally {
    notify();
  }
}

/** Adds an empty board and opens it. */
export function addBoard(name: string) {
  stashActive();
  boards.push({name, text: ""});
  active = boards.length - 1;
  clearBoard();
  notify();
}

/** Renames a board. A blank name is ignored. */
export function renameBoard(index: number, name: string) {
  const slot = boards[index];
  name = name.trim();
  if (!slot || !name || name === slot.name) return;
  slot.name = name;
  notify();
}

/**
 * Removes a board. The last board can't be removed. Removing the open board
 * opens its neighbour first (the next one, else the previous); if that board's
 * saved text can't be read this throws and nothing is removed.
 */
export function removeBoard(index: number): string[] {
  if (boards.length <= 1 || !boards[index]) return [];
  let warnings: string[] = [];
  if (index === active) {
    const next = index + 1 < boards.length ? index + 1 : index - 1;
    stashActive(); // so a failed open can put this board back
    try {
      warnings = openSlot(boards[next]);
    } catch (e) {
      openSlot(boards[index]);
      throw e;
    }
    active = next;
  }
  boards.splice(index, 1);
  if (active > index) active--;
  notify();
  return warnings;
}

/** Discards every board and starts over with one empty board. */
export function newProject() {
  boards = [{name: "Board 1", text: ""}];
  active = 0;
  clearBoard();
  notify();
}

/**
 * Whether replacing the project would throw away any work: false only for a
 * lone board with no parts and no connections (a fresh project).
 */
export function projectHasWork(): boolean {
  return boards.length > 1 || State.placedIcs.length > 0 || State.connections.length > 0;
}

/** Board name from a netlist's design source (a KiCad schematic path is cut to its file name) or the file name. */
function boardNameFor(text: string, fileName: string): string {
  let title: string | undefined;
  if (!text.trimStart().startsWith("{")) {
    try {
      title = parseNetlist(text).title;
    } catch {
      // loadBoardText reports the real error.
    }
  }
  const stem = (s: string) => s.split(/[\\/]/).pop()!.replace(/\.(kicad_sch|sch|net|json|perfboard)$/i, "").trim();
  return (title && stem(title)) || stem(fileName) || nextBoardName();
}

/**
 * Imports a file: a project file replaces the whole project; a single board
 * (KiCad netlist or legacy JSON save) is added as a new board — or takes the
 * place of the lone empty board a fresh project starts with. Throws, leaving
 * the project as it was, if the file can't be read.
 */
export function importText(text: string, fileName: string): string[] {
  if (isProjectFile(text)) return loadProjectFile(text);

  const name = boardNameFor(text, fileName);
  if (!projectHasWork()) {
    const warnings = loadBoardText(text);
    boards[active] = {name, text: ""};
    notify();
    return warnings;
  }

  stashActive();
  const previous = active;
  try {
    const warnings = loadBoardText(text);
    boards.push({name, text: ""});
    active = boards.length - 1;
    return warnings;
  } catch (e) {
    openSlot(boards[previous]);
    throw e;
  } finally {
    notify();
  }
}

/** Replaces the whole project with a project file's boards, opening its active one. */
export function loadProjectFile(text: string): string[] {
  const file = parseProjectFile(text);
  const opened = file.boards[file.active];
  const warnings = loadBoardText(opened.netlist);
  boards = file.boards.map(b => ({name: b.name, text: b.netlist}));
  active = file.active;
  notify();
  return warnings.map(w => `${opened.name}: ${w}`);
}

/**
 * The whole project as a project file: the open board taken fresh from
 * `State`, every other one from its slot (a board only loses the open spot
 * through `stashActive()`, which fills in its text).
 */
export function serializeProject(date?: string): string {
  return writeProjectFile({
    boards: boards.map((b, i) => ({name: b.name, netlist: i === active ? getSaveNetlist(date, b.name) : b.text})),
    active,
  });
}

/** Puts a restored single board (a pre-multi-board autosave) into the project as its only board. */
export function adoptLoadedBoard(name = "Board 1") {
  boards = [{name, text: ""}];
  active = 0;
  notify();
}
