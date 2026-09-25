/**
 * The project file format: a KiCad S-expression netlist (`.net`, format "E").
 * Pure — no DOM.
 *
 * Everything KiCad has a slot for goes in its usual place: a component is a
 * `comp` with `ref` (designator), `value`, `footprint` (`Perfboard:<part-id>`,
 * see src/catalog/parts.ts) and one `property` per typed property; wiring is
 * the `nets` section. What KiCad has no slot for rides along in a way KiCad
 * ignores:
 *
 * - per-component: `perfboard:at` ("col row rotation" of the top-left pad),
 *   `perfboard:note`, `perfboard:pins` (pin names, when they differ from the
 *   part's), and the auto-placement hints `perfboard:group` / `perfboard:edge`,
 *   as ordinary properties;
 * - board-level: a top-level `(perfboard …)` block — grid size and axis
 *   labels, routing mode, pad colours, custom part definitions, and a
 *   `floorplan` hint for auto-placement (read, never written).
 *
 * A component's KiCad sheet path (`sheetpath (names "/CH1/")`) is its
 * placement group unless `perfboard:group` says otherwise.
 *
 * A netlist without any of that (hand-written, from an LLM, or exported by
 * KiCad) is still a complete project: see src/kicad/project.ts for how the
 * gaps are filled on load. Which pin-pair each connection joined is not
 * stored — only nets are — so a load rebuilds each net's connections.
 */
import type {CatalogPart} from "../catalog/parts";
import {atoms, child, children, head, parseSExpr, SExpr, text, writeSExpr} from "./sexpr";

export interface NetlistNode {
  ref: string;
  pin: string;
  /** KiCad's pin name (e.g. "GND", "K") — used to map pins when numbers disagree. */
  pinfunction?: string;
}

export interface NetlistNet {
  name: string;
  nodes: NetlistNode[];
}

export interface NetlistComponent {
  ref: string;
  value: string;
  footprint: string;
  /** `libsource` symbol, e.g. lib "Device", part "R". */
  lib?: string;
  part?: string;
  /** `fields` + `property` entries, name → value, in file order. */
  properties: Record<string, string>;
  /** KiCad hierarchical sheet, "/" separated, without the outer slashes ("CH1", "Power/Input"); unset on the root sheet. */
  sheet?: string;
}

export type AxisLabels = "number" | "letter";

export interface PerfboardBlock {
  board?: {
    cols: number;
    rows: number;
    colLabels?: AxisLabels;
    rowLabels?: AxisLabels;
    rowsBottomUp?: boolean;
    routing?: "orthogonal" | "direct";
  };
  /** Pads whose colour differs from the default, by hole index. */
  pads: {col: number; row: number; color: string}[];
  customParts: CatalogPart[];
  /** Rows of placement group names, top to bottom (auto-placement hint). */
  floorplan?: string[][];
}

export interface Netlist {
  components: NetlistComponent[];
  nets: NetlistNet[];
  /** `"lib:part"` → pins, from the `libparts` section (KiCad exports; never written here). */
  libparts: Map<string, {num: string; name: string}[]>;
  perfboard?: PerfboardBlock;
  /** `design (source …)` when it isn't the tool's own placeholder — the board name, or KiCad's schematic path. */
  title?: string;
}

/** Written as the design `source` when a board has no name of its own. */
const TOOL_NAME = "PCB Perfboard Designer";

/** Property names the app itself reads/writes on a `comp`. */
export const PROP_AT = "perfboard:at";
export const PROP_NOTE = "perfboard:note";
export const PROP_PINS = "perfboard:pins";
export const PROP_GROUP = "perfboard:group";
export const PROP_EDGE = "perfboard:edge";

const num = (s: string | undefined): number | undefined => {
  const n = Number(s);
  return s !== undefined && Number.isFinite(n) ? n : undefined;
};

function readComponent(c: SExpr[]): NetlistComponent {
  const properties: Record<string, string> = {};
  for (const f of children(child(c, "fields") ?? [], "field")) {
    const name = text(f, "name");
    const value = f.slice(1).find((x): x is string => typeof x === "string");
    if (name) properties[name] = value ?? "";
  }
  for (const p of children(c, "property")) {
    const name = text(p, "name");
    if (name) properties[name] = text(p, "value") ?? "";
  }
  const libsource = child(c, "libsource");
  const sheetpath = child(c, "sheetpath");
  const sheet = (sheetpath ? text(sheetpath, "names") : undefined)?.replace(/^\/+|\/+$/g, "");
  return {
    ref: text(c, "ref") ?? "",
    value: text(c, "value") ?? "",
    footprint: text(c, "footprint") ?? "",
    lib: libsource ? text(libsource, "lib") : undefined,
    part: libsource ? text(libsource, "part") : undefined,
    properties,
    sheet: sheet || undefined,
  };
}

function readCustomPart(p: SExpr[]): CatalogPart | null {
  const id = text(p, "id");
  const [w, h] = atoms(child(p, "size")).map(Number);
  if (!id || !w || !h) return null;
  const pinDescription: Record<number, string> = {};
  for (const pin of children(child(p, "pins") ?? [], "pin")) {
    const [n, label] = atoms(pin);
    if (num(n) !== undefined) pinDescription[Number(n)] = label ?? "";
  }
  const image = child(p, "image");
  const [scaleX, scaleY] = atoms(image ? child(image, "scale") : undefined).map(Number);
  const [offsetX, offsetY] = atoms(image ? child(image, "offset") : undefined).map(Number);
  return {
    id,
    name: text(p, "name") ?? id,
    category: text(p, "category") ?? "Other",
    kind: text(p, "kind") ?? "chip",
    widthPin: w,
    heightPin: h,
    pinDescription,
    imageSrc: image ? text(image, "src") : undefined,
    imageScaleX: scaleX,
    imageScaleY: scaleY,
    imageOffsetX: offsetX,
    imageOffsetY: offsetY,
  };
}

function readPerfboard(p: SExpr[]): PerfboardBlock {
  const block: PerfboardBlock = {pads: [], customParts: []};
  const board = child(p, "board");
  const [cols, rows] = atoms(board ? child(board, "size") : undefined).map(Number);
  if (board && cols > 0 && rows > 0) {
    const labels = (s?: string): AxisLabels | undefined => (s === "letter" || s === "number" ? s : undefined);
    const routing = text(board, "routing");
    block.board = {
      cols,
      rows,
      colLabels: labels(text(board, "col_labels")),
      rowLabels: labels(text(board, "row_labels")),
      rowsBottomUp: text(board, "rows_bottom_up") === "yes",
      routing: routing === "direct" || routing === "orthogonal" ? routing : undefined,
    };
  }
  for (const pad of children(child(p, "pads") ?? [], "pad")) {
    const [col, row, color] = atoms(pad);
    if (num(col) !== undefined && num(row) !== undefined && color) {
      block.pads.push({col: Number(col), row: Number(row), color});
    }
  }
  for (const cp of children(child(p, "custom_parts") ?? [], "custom_part")) {
    const part = readCustomPart(cp);
    if (part) block.customParts.push(part);
  }
  const floorplan = children(child(p, "floorplan") ?? [], "row").map(row => atoms(row)).filter(row => row.length);
  if (floorplan.length) block.floorplan = floorplan;
  return block;
}

export function parseNetlist(source: string): Netlist {
  const trimmed = source.trimStart();
  if (trimmed.startsWith("<")) {
    throw new Error("This is an XML netlist. Export the netlist from KiCad in the default (S-expression) format.");
  }
  const root = parseSExpr(source);
  if (head(root) !== "export") {
    throw new Error("Not a KiCad netlist — expected the file to start with (export …).");
  }

  const libparts = new Map<string, {num: string; name: string}[]>();
  for (const lp of children(child(root, "libparts") ?? [], "libpart")) {
    const pins = children(child(lp, "pins") ?? [], "pin").map(p => ({num: text(p, "num") ?? "", name: text(p, "name") ?? ""}));
    libparts.set(`${text(lp, "lib") ?? ""}:${text(lp, "part") ?? ""}`, pins);
  }

  const nets: NetlistNet[] = children(child(root, "nets") ?? [], "net").map(n => ({
    name: text(n, "name") ?? "",
    nodes: children(n, "node").map(node => ({
      ref: text(node, "ref") ?? "",
      pin: text(node, "pin") ?? "",
      pinfunction: text(node, "pinfunction") || undefined,
    })),
  }));

  const perfboard = child(root, "perfboard");
  const designSource = text(child(root, "design") ?? [], "source");
  return {
    title: designSource && designSource !== TOOL_NAME ? designSource : undefined,
    components: children(child(root, "components") ?? [], "comp").map(readComponent),
    nets,
    libparts,
    perfboard: perfboard ? readPerfboard(perfboard) : undefined,
  };
}

function customPartExpr(p: CatalogPart): SExpr {
  const expr: SExpr[] = [
    "custom_part",
    ["id", p.id],
    ["name", p.name],
    ["category", p.category],
    ["kind", p.kind],
    ["size", String(p.widthPin), String(p.heightPin)],
    ["pins", ...Object.entries(p.pinDescription).map(([n, label]) => ["pin", n, label])],
  ];
  if (p.imageSrc) {
    expr.push([
      "image",
      ["src", p.imageSrc],
      ["scale", String(p.imageScaleX ?? 1), String(p.imageScaleY ?? 1)],
      ["offset", String(p.imageOffsetX ?? 0), String(p.imageOffsetY ?? 0)],
    ]);
  }
  return expr;
}

export function writeNetlist(n: Netlist, opts: {date?: string; title?: string} = {}): string {
  const design: SExpr[] = ["design", ["source", opts.title || n.title || TOOL_NAME], ["tool", TOOL_NAME]];
  if (opts.date) design.push(["date", opts.date]);

  const components: SExpr[] = ["components", ...n.components.map(c => {
    const comp: SExpr[] = ["comp", ["ref", c.ref], ["value", c.value], ["footprint", c.footprint]];
    if (c.lib || c.part) comp.push(["libsource", ["lib", c.lib ?? ""], ["part", c.part ?? ""]]);
    for (const [name, value] of Object.entries(c.properties)) {
      comp.push(["property", ["name", name], ["value", value]]);
    }
    return comp;
  })];

  const nets: SExpr[] = ["nets", ...n.nets.map((net, i) => [
    "net",
    ["code", String(i + 1)],
    ["name", net.name],
    ...net.nodes.map(node => {
      const expr: SExpr[] = ["node", ["ref", node.ref], ["pin", node.pin]];
      if (node.pinfunction) expr.push(["pinfunction", node.pinfunction]);
      return expr;
    }),
  ])];

  const root: SExpr[] = ["export", ["version", "E"], design, components, nets];

  if (n.perfboard) {
    const p = n.perfboard;
    const block: SExpr[] = ["perfboard", ["version", "1"]];
    if (p.board) {
      const board: SExpr[] = ["board", ["size", String(p.board.cols), String(p.board.rows)]];
      if (p.board.colLabels) board.push(["col_labels", p.board.colLabels]);
      if (p.board.rowLabels) board.push(["row_labels", p.board.rowLabels]);
      board.push(["rows_bottom_up", p.board.rowsBottomUp ? "yes" : "no"]);
      if (p.board.routing) board.push(["routing", p.board.routing]);
      block.push(board);
    }
    if (p.pads.length) block.push(["pads", ...p.pads.map(pad => ["pad", String(pad.col), String(pad.row), pad.color])]);
    if (p.customParts.length) block.push(["custom_parts", ...p.customParts.map(customPartExpr)]);
    root.push(block);
  }

  return writeSExpr(root) + "\n";
}
