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
import {invalidateWireCache} from "../wire-cache";
import {syncRoutingModeButtons} from "../routing";
import {syncGridInputs} from "./resize-grid";
import {updateSidebarVisibility} from "../sidebar-mode";
import {assignMissingDesignators} from "../component-props";
import {availableParts, icFromPart} from "../ic-catalog";
import {parseNetlist} from "../../kicad/netlist";
import {Extent, planProject, ProjectPlan} from "../../kicad/project";
import type {CatalogPart} from "../../catalog/parts";
import {createDotGrid} from "./resize-grid";

/**
 * Loads one board from file / localStorage text into `State`: a KiCad netlist (the current
 * format — see src/kicad/netlist.ts), or a legacy JSON save (v1–v5). Returns
 * the warnings from reading a netlist (guessed parts, unmapped pins…); throws
 * on unreadable input without touching the board.
 */
export function loadBoardText(text: string): string[] {
  if (text.trimStart().startsWith("{")) {
    loadProject(JSON.parse(text) as IProjectSave);
    return [];
  }
  return loadNetlistProject(text);
}

/** Overhang of a part's drawn body past its pin footprint, in whole holes — so auto-placement leaves room for artwork. */
function extentOf(part: CatalogPart): Extent {
  const ic = icFromPart(part);
  ic.topLeftDot = {x: 0, y: 0};
  const r = ic.bodyRect();
  const pitch = State.dotSpace;
  const spanW = (part.widthPin - 1) * pitch;
  const spanH = (part.heightPin - 1) * pitch;
  // Up to half a pitch of overhang still sits between holes.
  const holes = (px: number) => Math.max(0, Math.ceil((px - pitch / 2) / pitch));
  return {left: holes(-r.x), top: holes(-r.y), right: holes(r.x + r.w - spanW), bottom: holes(r.y + r.h - spanH)};
}

function loadNetlistProject(text: string): string[] {
  const netlist = parseNetlist(text);

  // Custom parts carried by the file join the sidebar catalog (not localStorage), as legacy saves did.
  for (const part of netlist.perfboard?.customParts ?? []) {
    if (!Ic.IC_CONTAINER.some(ic => ic.partId === part.id)) Ic.IC_CONTAINER.push(icFromPart(part, true));
  }
  Ic.showICs();

  const plan = planProject(netlist, availableParts(), {extentOf});
  applyPlan(plan);
  return plan.warnings;
}

/** Replaces the board with a netlist plan: grid, pads, components, connections. */
function applyPlan(plan: ProjectPlan) {
  const {board} = plan;
  if (board.colLabels) State.colLabelMode = board.colLabels;
  if (board.rowLabels) State.rowLabelMode = board.rowLabels;
  if (board.rowsBottomUp !== undefined) State.rowLabelsBottomUp = board.rowsBottomUp;
  State.routingMode = board.routing === "direct" ? "direct" : "orthogonal";
  createDotGrid(board.cols, board.rows);
  syncGridInputs(board.cols, board.rows);

  const origin = State.gridGutter + State.dotSpace / 2;
  const dotAt = new Map<string, IDot>();
  for (const d of State.dots) dotAt.set(`${(d.x - origin) / State.dotSpace},${(d.y - origin) / State.dotSpace}`, d);
  for (const pad of plan.pads) {
    const dot = dotAt.get(`${pad.col},${pad.row}`);
    if (dot) dot.color = pad.color;
  }

  const icByRef = new Map<string, Ic>();
  State.placedIcs = [];
  for (const c of plan.components) {
    const ic = icFromPart(c.part, c.part.id.startsWith("custom-"));
    for (let r = 0; r < c.rotation; r += 90) ic.rotate();
    ic.topLeftDot = dotAt.get(`${c.col},${c.row}`) ?? null;
    ic.label = c.label;
    ic.config = {...c.config};
    ic.description = c.note;
    State.placedIcs.push(ic);
    icByRef.set(c.ref, ic);
  }
  assignMissingDesignators(State.placedIcs);

  // A named file net becomes a given-name INet its connections point at, so
  // rebuildNets() keeps the name; an unnamed one is left for it to derive.
  const netIds = plan.nets.map(n => (n.name ? crypto.randomUUID() : undefined));
  State.nets = plan.nets.flatMap((n, i) => (n.name ? [{id: netIds[i]!, name: n.name}] : []));
  State.connections = [];
  for (const {a, b, net} of plan.connections) {
    const ta: ITerminal = {icId: icByRef.get(a.ref)!.id, pin: a.pin};
    const tb: ITerminal = {icId: icByRef.get(b.ref)!.id, pin: b.pin};
    const conn = makeConnection(ta, tb);
    if (conn && !State.connections.some(c => sameConnection(c, conn.a, conn.b))) {
      conn.netId = netIds[net];
      State.connections.push(conn);
    }
  }

  State.lines = [];
  State.changes = [];
  State.changeIndex = -1;
  finishLoad();
}

/** Selection reset + derived-state rebuild after the board in `State` is swapped out (both loaders, board switching). */
export function finishLoad() {
  State.selectedPlacedIc = undefined;
  State.selectedPlacedIcs = [];
  State.selectedDot = undefined;
  State.selectedConnection = undefined;
  State.hoverConnection = undefined;
  State.hoverIc = undefined;
  State.hoverDot = undefined;
  State.selectedIc = undefined;
  State.pendingTerminal = undefined;

  // Nets are fully derived — rebuild from the connection list.
  rebuildNets();
  invalidateWireCache();
  syncRoutingModeButtons();

  window.dispatchEvent(new Event('nets-changed'));
  updateSidebarVisibility();
  redrawCanvas();
}

export function deserializePlacedIc(data: any, migrateIds = false): Ic | null {
  if (!data || data.widthPin == null || data.heightPin == null) return null;
  const ic = new Ic(
    Number(data.widthPin),
    Number(data.heightPin),
    data.pinDescription || {},
    String(data.name || 'Component'),
    String(data.category || 'Other'),
    Boolean(data.isCustom),
    String(data.kind || 'chip'),
    data.imageSrc || undefined
  );
  // imageScale*/imageOffset* are a component-definition constant (visual fit
  // of its artwork), not per-placement data — pull the current value from the
  // catalog rather than freezing whatever it was at save time (see ic.ts).
  // Saves from before catalog ids get theirs back by (built-in) name.
  ic.partId = data.partId
    ? String(data.partId)
    : Ic.IC_CONTAINER.find(c => !c.isCustom && c.name === ic.name)?.partId;
  const catalogMatch = Ic.IC_CONTAINER.find(c => c.imageSrc && c.imageSrc === ic.imageSrc);
  if (catalogMatch) {
    ic.imageScaleX = catalogMatch.imageScaleX;
    ic.imageScaleY = catalogMatch.imageScaleY;
    ic.imageOffsetX = catalogMatch.imageOffsetX;
    ic.imageOffsetY = catalogMatch.imageOffsetY;
  }
  // v1 files carry collidable float ids; regenerate rather than trust them.
  if (data.id && !migrateIds) {
    ic.id = String(data.id);
  }
  ic.rotationAngle = Number(data.rotationAngle || 0);
  if (data.description) {
    ic.description = String(data.description);
  }
  if (data.label) {
    ic.label = String(data.label);
  }
  if (data.config && typeof data.config === "object") {
    for (const [key, value] of Object.entries(data.config)) {
      if (value) ic.config[key] = String(value);
    }
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

/** A pre-v4 saved wire — `ILine` no longer carries `generated`. */
type LegacyLine = ILine & { generated?: boolean };

/**
 * v1/v2 migration (docs/logical-connections.md §6): every hand-drawn wire
 * becomes one connection. An endpoint not already on a component pin gets a
 * bridge placed there (once per pad), so every terminal ends up a pin.
 */
function migrateLinesToConnections(lines: LegacyLine[], placedIcs: Ic[]): IConnection[] {
  const bridgeByPad = new Map<string, Ic>();

  function terminalFor(dot: IDot): ITerminal {
    for (const ic of placedIcs) {
      const p = ic.getPinPositionOnIC(dot);
      if (p) return { icId: ic.id, pin: p.pin };
    }
    const padKey = `${dot.x},${dot.y}`;
    let bridge = bridgeByPad.get(padKey);
    if (!bridge) {
      bridge = new Ic(1, 1, { 1: "" }, "Bridge", "Junction", false, "bridge");
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
    const conn = makeConnection(a, b, { width: line.width });
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

/** Loads a legacy (pre-netlist) JSON save. */
export function loadProject(project: IProjectSave){
  const legacy = !project.version || project.version < 2;
  const preConnections = !project.version || project.version < 3;

  Canvas.setBoardSize(project.canvas.width, project.canvas.height);
  // Pads no longer carry notes; drop any a older save has (label a hole with a bridge).
  State.dots = project.dots.map(({x, y, color}) => ({x, y, color}));
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

  // Wires are stateless now — nothing to rehydrate. The first solder-side
  // repaint re-derives them from the connection list (see wire-cache.ts).
  State.lines = [];
  State.routingMode = project.routingMode === "direct" ? "direct" : "orthogonal";

  // v1/v2 migration matches wires against the (gutter-shifted) canonical dots.
  const dotByCoord = new Map<string, IDot>();
  for (const d of State.dots) dotByCoord.set(`${d.x},${d.y}`, d);
  const legacyLines: LegacyLine[] = (project.lines || [])
    .map((l): LegacyLine | null => {
      const start = dotByCoord.get(`${l.start.x},${l.start.y}`);
      const end = dotByCoord.get(`${l.end.x},${l.end.y}`);
      return start && end ? { ...l, start, end } : null;
    })
    .filter((l): l is LegacyLine => l !== null);

  // Undo history does not survive a load.
  State.changes = [];
  State.changeIndex = -1;

  if (project.ICs) {
    // Merge in only the save's *custom* parts — built-ins already come from the
    // current catalog (loadDefaultIcs ran at startup), so widening a built-in is
    // never frozen at save time. Legacy saves stored the whole catalog;
    // filtering to isCustom drops those stale built-ins.
    for (const raw of project.ICs) {
      const inst = unserialize(raw, Ic);
      if (!inst.isCustom) continue;
      inst.id = legacy || inst.id == null ? crypto.randomUUID() : String(inst.id);
      inst.partId = `custom-${inst.id}`;
      if (!Ic.IC_CONTAINER.some(c => String(c.id) === String(inst.id))) {
        Ic.IC_CONTAINER.push(inst);
      }
    }
    Ic.showICs();
  }
  if (project.placedIcs) {
    State.placedIcs = project.placedIcs
      .map(data => deserializePlacedIc(data, legacy))
      .filter(ic => ic !== null) as Ic[];
  } else {
    State.placedIcs = [];
  }
  // Saves from before reference designators get R1/C1/U1… on load.
  assignMissingDesignators(State.placedIcs);

  State.nets = [];

  // v1/v2 files carry no connections — derive them from the hand-drawn wires
  // (mutates State.placedIcs with a bridge per bare-hole endpoint).
  if (preConnections) {
    State.connections = migrateLinesToConnections(legacyLines, State.placedIcs);
  } else {
    // v5 drops per-connection `color`; a wire is always drawn in its net's
    // colour. Any `color` on an older (v3/v4) file is simply left unread.
    State.connections = project.connections ?? [];
  }

  finishLoad();
}
