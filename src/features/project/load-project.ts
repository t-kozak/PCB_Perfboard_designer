import {Utils} from "../../utils/utils";
import {State} from "../../state/State";
import {redrawCanvas} from "../draw-canvas";
import {Canvas} from "../../state/Canvas";
import {IProjectSave} from "../../interfaces/project-save.interface";
import {Ic} from "../ic";
import {unserialize} from "../../utils/serialization";
import {IDot} from "../../interfaces/dot.interface";
import {ILine} from "../../interfaces/line.interface";
import {IConnection, ITerminal, isSelfLoop, makeConnection, sameConnection} from "../../interfaces/connection.interface";
import {rebuildNets} from "../../nets/rebuild";
import {syncGridInputs} from "./resize-grid";

const loadInput = Utils.getSafeHtmlElement<HTMLButtonElement>('loadProjectBtn');
const loadTrigger = Utils.getSafeHtmlElement<HTMLButtonElement>('loadProjectTrigger');

loadTrigger.addEventListener('click', function() {
  loadInput.click();
});

loadInput.addEventListener('change', function(e) {
  const file = (e.target as HTMLInputElement).files?.[0];

  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const contents = String(e.target?.result ?? "");
    const data = JSON.parse(contents) as IProjectSave;

    // Load the state of the canvas from the uploaded file
    loadProject(data)

    // Redraw the canvas
    redrawCanvas();
  };
  reader.readAsText(file);
});

export function deserializePlacedIc(data: any, migrateIds = false): Ic | null {
  if (!data || data.widthPin == null || data.heightPin == null) return null;
  const ic = new Ic(
    Number(data.widthPin),
    Number(data.heightPin),
    data.pinDescription || {},
    String(data.name || 'Component'),
    Boolean(data.isCustom),
    String(data.kind || 'chip'),
    data.imageSrc || undefined
  );
  // v1 files carry collidable float ids; regenerate rather than trust them.
  if (data.id && !migrateIds) {
    ic.id = String(data.id);
  }
  ic.rotationAngle = Number(data.rotationAngle || 0);
  if (data.description) {
    ic.description = String(data.description);
  }
  if (data.topLeftDotX !== null && data.topLeftDotY !== null) {
    const targetDot = State.dots.find(d => d.x === data.topLeftDotX && d.y === data.topLeftDotY);
    if (targetDot) {
      ic.topLeftDot = targetDot;
    } else {
      ic.updatePosition(data.topLeftDotX, data.topLeftDotY);
    }
  }
  return ic;
}

/**
 * v1/v2 migration (docs/logical-connections.md §6): every hand-drawn wire
 * becomes one connection. An endpoint not already on a component pin gets a
 * bridge placed there (once per pad), so every terminal ends up a pin.
 */
function migrateLinesToConnections(lines: ILine[], placedIcs: Ic[]): IConnection[] {
  const bridgeByPad = new Map<string, Ic>();

  function terminalFor(dot: IDot): ITerminal {
    for (const ic of placedIcs) {
      const p = ic.getPinPositionOnIC(dot);
      if (p) return { icId: ic.id, pin: p.pin };
    }
    const padKey = `${dot.x},${dot.y}`;
    let bridge = bridgeByPad.get(padKey);
    if (!bridge) {
      bridge = new Ic(1, 1, { 1: "" }, "Bridge", false, "bridge");
      bridge.topLeftDot = dot;
      placedIcs.push(bridge);
      bridgeByPad.set(padKey, bridge);
    }
    return { icId: bridge.id, pin: 1 };
  }

  const connections: IConnection[] = [];
  for (const line of lines) {
    if (line.generated) continue;
    const a = terminalFor(line.start);
    const b = terminalFor(line.end);
    if (isSelfLoop(a, b)) {
      console.warn("Dropped a wire whose endpoints migrated to the same pin", line);
      continue;
    }
    const conn = makeConnection(a, b);
    if (conn && !connections.some(c => sameConnection(c, conn.a, conn.b))) {
      connections.push(conn);
    }
  }
  return connections;
}

/**
 * Boards saved before the label gutter existed start their pads at the bare
 * half-pitch, leaving no room for the row/column labels. Grow the board by the
 * shortfall and slide every pad into the gutter, in place: wires hold dot
 * references and components hold a `topLeftDot`, so a uniform shift moves the
 * whole layout together. Runs before wire rehydration, which matches on the
 * shifted coordinates.
 */
function addLabelGutter(project: IProjectSave, dots: IDot[]) {
  if (dots.length === 0) return;
  const wanted = State.gridGutter + State.dotSpace / 2;
  const shiftX = Math.max(0, wanted - Math.min(...dots.map(d => d.x)));
  const shiftY = Math.max(0, wanted - Math.min(...dots.map(d => d.y)));
  if (!shiftX && !shiftY) return;
  for (const d of dots) {
    d.x += shiftX;
    d.y += shiftY;
  }
  for (const line of project.lines || []) {
    line.start = {...line.start, x: line.start.x + shiftX, y: line.start.y + shiftY};
    line.end = {...line.end, x: line.end.x + shiftX, y: line.end.y + shiftY};
  }
  for (const ic of project.placedIcs || []) {
    if (ic.topLeftDotX != null) ic.topLeftDotX += shiftX;
    if (ic.topLeftDotY != null) ic.topLeftDotY += shiftY;
  }
  Canvas.setBoardSize(Canvas.boardWidth + shiftX, Canvas.boardHeight + shiftY);
}

export function loadProject(project: IProjectSave){
  const legacy = !project.version || project.version < 2;
  const preConnections = !project.version || project.version < 3;

  Canvas.setBoardSize(project.canvas.width, project.canvas.height);
  State.dots = project.dots;
  addLabelGutter(project, State.dots);

  // Axis label notation, and the Grid Configuration inputs that mirror it.
  // Files saved before axis labelling carry no `grid` block — those boards were
  // always numbered, so fall back to numeric rather than this session's modes.
  State.colLabelMode = project.grid?.colLabelMode ?? "number";
  State.rowLabelMode = project.grid?.rowLabelMode ?? "number";
  State.rowLabelsBottomUp = project.grid?.rowLabelsBottomUp ?? false;
  syncGridInputs(
    new Set(State.dots.map(d => d.x)).size,
    new Set(State.dots.map(d => d.y)).size,
  );

  // Rehydrate every wire endpoint to the canonical State.dots entry by
  // coordinate. JSON.stringify duplicates the dot objects on save, so without
  // this a loaded line's start/end are distinct objects from State.dots and
  // coordinate is the only reliable identity (see docs/autorouting.md §3).
  const dotByCoord = new Map<string, IDot>();
  for (const d of State.dots) dotByCoord.set(`${d.x},${d.y}`, d);
  State.lines = (project.lines || [])
    .map((l): ILine | null => {
      const start = dotByCoord.get(`${l.start.x},${l.start.y}`);
      const end = dotByCoord.get(`${l.end.x},${l.end.y}`);
      return start && end ? { ...l, start, end } : null;
    })
    .filter((l): l is ILine => l !== null);

  // Undo history does not survive a load.
  State.changes = [];
  State.changeIndex = -1;

  if (project.ICs) {
    Ic.IC_CONTAINER = project.ICs.map(ic => {
      const inst = unserialize(ic, Ic);
      inst.id = legacy || inst.id == null ? crypto.randomUUID() : String(inst.id);
      return inst;
    });
    Ic.showICs();
  }
  if (project.placedIcs) {
    State.placedIcs = project.placedIcs
      .map(data => deserializePlacedIc(data, legacy))
      .filter(ic => ic !== null) as Ic[];
  } else {
    State.placedIcs = [];
  }

  State.nets = project.nets ?? [];

  // v1/v2 files carry no connections — derive them from the hand-drawn wires
  // (mutates State.placedIcs with a bridge per bare-hole endpoint), and drop
  // those wires now that the connection is the source of truth.
  if (preConnections) {
    State.connections = migrateLinesToConnections(State.lines, State.placedIcs);
    State.lines = State.lines.filter(l => l.generated);
  } else {
    State.connections = project.connections ?? [];
  }

  State.selectedPlacedIc = undefined;
  State.selectedDot = undefined;
  State.selectedLine = undefined;
  State.selectedConnection = undefined;
  State.selectedIc = undefined;
  State.pendingTerminal = undefined;

  // Seed nets from the connection list for pre-net-layer saves; keep any that
  // were already persisted (they carry names / colours / locks forward).
  if (State.nets.length === 0 && State.connections.length > 0) {
    rebuildNets();
  }

  window.dispatchEvent(new Event('nets-changed'));
  redrawCanvas();
}
