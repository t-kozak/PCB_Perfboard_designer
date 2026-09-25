/**
 * Netlist → board plan. Pure — no DOM, `State` or `Canvas`; the impure half
 * (building `Ic`s and connections from the plan) is features/project/load-project.ts.
 *
 * A netlist only has to say *what* is connected; everything else is filled in:
 *
 * - **Part**: `Perfboard:<id>` footprint (or a `Perfboard` property) → catalog
 *   part; parametric ids `dip-N`, `sip-N`, `pin-header-RxC` are synthesized;
 *   otherwise a KiCad symbol / footprint / value guess (Device:R → resistor,
 *   Conn_01x04 → 1x4 header, NE555P → NE555…); failing all that, a generic
 *   DIP/SIP of the right pin count, with a warning.
 * - **Pins**: a node's `pinfunction` (or a non-numeric `pin`) that names
 *   exactly one pin of the part wins over the pin number — KiCad's Device:D /
 *   LED number the cathode 1, ours number the anode 1.
 * - **Properties**: `value` → the kind's value field (resistance,
 *   capacitance…); a property whose name matches a field key or label → that
 *   field; anything else → the component's note.
 * - **Position**: `perfboard:at`, else auto-placed (shelf packing, largest
 *   parts first) below whatever is already placed.
 * - **Connections**: nets only record *which* legs are joined, so each net
 *   becomes the shortest set of pin-to-pin connections linking all of its legs
 *   (Prim's MST, Manhattan distance between pads). Each connection carries its
 *   net's index into `nets`, which holds the file's net name unless it is an
 *   auto-generated one (see `givenNetName`).
 */
import type {CatalogPart} from "../catalog/parts";
import {fieldsForKind, valueFieldForKind} from "../features/component-props";
import {dotForPin, IcGeometry, pinCountOf} from "../features/ic-geometry";
import {Netlist, NetlistComponent, PerfboardBlock, PROP_AT, PROP_NOTE, PROP_PINS} from "./netlist";

export type Rotation = 0 | 90 | 180 | 270;

/** How far (in holes) a part's drawn body overhangs its pin footprint on each side, unrotated. */
export interface Extent {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PlannedComponent {
  /** Reference as written in the netlist — the key nets use. */
  ref: string;
  /** Designator to show; undefined for a bridge's auto `BRn` ref (bridges are unlabelled). */
  label?: string;
  /** The part, unrotated, with any per-component pin names applied. */
  part: CatalogPart;
  rotation: Rotation;
  /** Hole index of the top-left pad, in the rotated shape. */
  col: number;
  row: number;
  config: Record<string, string>;
  note?: string;
}

export interface PlannedTerminal {
  ref: string;
  pin: number;
}

export interface ProjectPlan {
  board: NonNullable<PerfboardBlock["board"]>;
  pads: PerfboardBlock["pads"];
  customParts: CatalogPart[];
  components: PlannedComponent[];
  /** One entry per netlist net that produced connections; `name` unset = let the app derive one. */
  nets: {name?: string}[];
  /** `net` indexes `nets`. */
  connections: {a: PlannedTerminal; b: PlannedTerminal; net: number}[];
  warnings: string[];
}

export interface PlanOptions {
  extentOf?: (part: CatalogPart) => Extent;
}

const PITCH = 50;
const MIN_BOARD = 10;
/** Empty holes kept around auto-placed parts, so wires have room to route. */
const GAP = 2;

/** Uppercase alphanumerics only — for loose name matching. */
const norm = (s: string | undefined): string => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const PIN_ALIASES: Record<string, string> = {ANODE: "A", CATHODE: "K", GATE: "G", DRAIN: "D", SOURCE: "S"};

/** A pin name reduced for comparison: KiCad overbars (`~{RESET}`) and our `~RESET` both → "RESET". */
function pinKey(name: string): string {
  const k = name.toUpperCase().replace(/~\{([^}]*)\}/g, "$1").replace(/[~\s]/g, "");
  return PIN_ALIASES[k] ?? k;
}

/**
 * The name a netlist gives a net, or undefined when it is only a generated
 * placeholder: KiCad's `Net-(R1-Pad2)` / `unconnected-(U1-Pad5)`, or the app's
 * own `N$3`. KiCad's hierarchical `/` prefix is dropped ("/SIG" → "SIG").
 */
export function givenNetName(raw: string): string | undefined {
  const name = raw.trim().replace(/^\//, "");
  if (!name || /^(Net-\(|unconnected-\()/i.test(name) || /^N\$\d+$/.test(name)) return undefined;
  return name;
}

const byRef = (a: string, b: string) => a.localeCompare(b, undefined, {numeric: true});

function geometry(part: CatalogPart, rotation: Rotation, col: number, row: number): IcGeometry {
  const swapped = rotation === 90 || rotation === 270;
  return {
    topLeftDot: {x: col * PITCH, y: row * PITCH},
    widthPin: swapped ? part.heightPin : part.widthPin,
    heightPin: swapped ? part.widthPin : part.heightPin,
    rotationAngle: rotation,
    kind: part.kind,
  };
}

export function pinCountOfPart(part: CatalogPart): number {
  return pinCountOf({...part, rotationAngle: 0});
}

/** Parts described by their id alone: `dip-N`, `sip-N`, `pin-header-RxC` (R rows x C columns). */
export function parametricPart(id: string): CatalogPart | null {
  let m = /^dip-(\d+)$/i.exec(id);
  if (m && Number(m[1]) >= 4 && Number(m[1]) % 2 === 0) {
    const n = Number(m[1]);
    // 0.3" body up to 28 pins, 0.6" above — the usual DIP widths.
    return {id: `dip-${n}`, name: `DIP-${n}`, category: "Generic", kind: "chip", widthPin: n <= 28 ? 4 : 7, heightPin: n / 2, pinDescription: {}};
  }
  m = /^sip-(\d+)$/i.exec(id);
  if (m && Number(m[1]) >= 1) {
    const n = Number(m[1]);
    return {id: `sip-${n}`, name: `SIP-${n}`, category: "Generic", kind: "chip", widthPin: n, heightPin: 1, pinDescription: {}};
  }
  m = /^pin-header-(\d+)x(\d+)$/i.exec(id);
  if (m && Number(m[1]) >= 1 && Number(m[2]) >= 1) {
    const rows = Number(m[1]);
    const cols = Number(m[2]);
    return {id: `pin-header-${rows}x${cols}`, name: `Pin Header ${rows}x${cols}`, category: "Connector", kind: "pin-header", widthPin: cols, heightPin: rows, pinDescription: {}};
  }
  return null;
}

// ─── part resolution ──────────────────────────────────────────────────────

interface Resolved {
  part: CatalogPart;
  config: Record<string, string>;
  /** Set when the part was guessed rather than named — surfaced as a warning. */
  guessed?: string;
}

/** Catalog id from a KiCad symbol name (`libsource part`), e.g. "R_Small" → "resistor". */
function idFromSymbol(sym: string): string | undefined {
  const s = sym.toUpperCase();
  if (/^R(_|$)/.test(s)) return "resistor";
  if (/^(CP|C_POLARIZED)(_|$)/.test(s)) return "cap-electrolytic";
  if (/^C(_|$)/.test(s)) return "cap-ceramic";
  if (/^LED/.test(s)) return "led";
  if (/^D(_|$)/.test(s)) return "diode";
  if (/POLYFUSE|^FUSE/.test(s)) return "polyfuse";
  if (/^Q_[NP]MOS/.test(s)) return "mosfet-standing";
  if (/^SW_PUSH/.test(s)) return "push-button";
  const conn = /^CONN_0([12])X(\d+)/.exec(s);
  // Conn_02xNN_Odd_Even numbers pins across the two columns first — our
  // row-major pin header does exactly that when it is 2 columns wide.
  if (conn) return conn[1] === "1" ? `pin-header-1x${Number(conn[2])}` : `pin-header-${Number(conn[2])}x2`;
  return undefined;
}

/** Catalog id from a KiCad footprint ("Resistor_THT:R_Axial…", "Package_DIP:DIP-8_W7.62mm"…). */
function idFromFootprint(footprint: string): string | undefined {
  const [lib, name = ""] = footprint.toUpperCase().split(":");
  if (lib.startsWith("RESISTOR")) return "resistor";
  if (lib.startsWith("CAPACITOR")) return name.startsWith("CP_") ? "cap-electrolytic" : "cap-ceramic";
  if (lib.startsWith("LED")) return "led";
  if (lib.startsWith("DIODE")) return "diode";
  if (lib.startsWith("BUTTON_SWITCH") && name.startsWith("SW_PUSH")) return "push-button";
  const dip = /^DIP-(\d+)/.exec(name);
  if (dip) return `dip-${dip[1]}`;
  const header = /^PINHEADER_(\d+)X(\d+)/.exec(name);
  if (header) return header[1] === "1" ? `pin-header-1x${Number(header[2])}` : `pin-header-${Number(header[2])}x${Number(header[1])}`;
  return undefined;
}

/** Longest catalog part whose id/name the text equals or starts with (NE555P → ne555). */
function idFromName(texts: string[], parts: CatalogPart[]): string | undefined {
  let best: {id: string; len: number} | undefined;
  for (const p of parts) {
    for (const key of [norm(p.id), norm(p.name)]) {
      if (key.length < 3) continue;
      for (const t of texts.map(norm)) {
        const hit = t === key || (key.length >= 4 && t.startsWith(key));
        if (hit && (!best || key.length > best.len)) best = {id: p.id, len: key.length};
      }
    }
  }
  return best?.id;
}

function footprintId(footprint: string): string | undefined {
  const i = footprint.indexOf(":");
  if (i < 0) return footprint || undefined;
  return footprint.slice(0, i).toLowerCase() === "perfboard" ? footprint.slice(i + 1) : undefined;
}

function explicitId(comp: NetlistComponent): string | undefined {
  for (const [name, value] of Object.entries(comp.properties)) {
    if (/^perfboard(:part)?$/i.test(name) && value) return value;
  }
  return footprintId(comp.footprint);
}

function ledVariant(comp: NetlistComponent): {id: string; guessed?: string} {
  const hay = [comp.value, comp.part, comp.footprint, ...Object.values(comp.properties)].join(" ");
  // Letters-only boundaries: "_" is a word character, so \b misses "LED_D5.0mm_Blue".
  const colour = /(?:^|[^a-z])(red|green|blue)(?:[^a-z]|$)/i.exec(hay)?.[1]?.toLowerCase();
  return colour ? {id: `led-${colour}`} : {id: "led-red", guessed: "LED colour not given — placed a red LED"};
}

/** Every pin a netlist mentions for `ref`, plus the symbol's own pin list — for sizing a generic part. */
function pinsSeen(comp: NetlistComponent, netlist: Netlist): {num: string; name?: string}[] {
  const seen = new Map<string, string | undefined>();
  for (const p of netlist.libparts.get(`${comp.lib ?? ""}:${comp.part ?? ""}`) ?? []) {
    seen.set(p.num, p.name && p.name !== "~" ? p.name : undefined);
  }
  for (const net of netlist.nets) {
    for (const node of net.nodes) {
      if (node.ref === comp.ref && !seen.get(node.pin)) seen.set(node.pin, node.pinfunction);
    }
  }
  return [...seen].map(([num, name]) => ({num, name}));
}

/** A generic DIP (or SIP for ≤ 3 pins) big enough for every pin the netlist uses, pin names filled in. */
function genericPart(comp: NetlistComponent, netlist: Netlist): CatalogPart {
  const pins = pinsSeen(comp, netlist);
  const numeric = pins.every(p => /^\d+$/.test(p.num));
  const pinDescription: Record<number, string> = {};
  let count: number;
  if (numeric) {
    count = Math.max(1, ...pins.map(p => Number(p.num)));
    for (const p of pins) if (p.name) pinDescription[Number(p.num)] = p.name;
  } else {
    // Named pins only (A/K, B/C/E…): number them in order, keep the names so
    // the nodes still find them.
    count = Math.max(1, pins.length);
    pins.forEach((p, i) => (pinDescription[i + 1] = p.name ?? p.num));
  }
  const part = count <= 3 ? parametricPart(`sip-${count}`)! : parametricPart(`dip-${count + (count % 2)}`)!;
  // Keeps the parametric name ("DIP-8"): the netlist value lands in the part number field.
  return {...part, pinDescription};
}

function resolvePart(comp: NetlistComponent, netlist: Netlist, parts: Map<string, CatalogPart>): Resolved {
  const config: Record<string, string> = {};
  const lookup = (id: string) => parts.get(id.toLowerCase()) ?? parametricPart(id) ?? undefined;
  const warnings: string[] = [];

  const explicit = explicitId(comp);
  if (explicit) {
    const part = lookup(explicit);
    if (part) return {part, config};
    warnings.push(`unknown part "${explicit}"`);
  }

  const sym = comp.part ?? "";
  // A named catalog part (NE555P → ne555) beats a generic package guess (DIP-8).
  let id = idFromSymbol(sym) ?? idFromName([comp.value, sym], [...parts.values()]) ?? idFromFootprint(comp.footprint);
  let ledGuess: string | undefined;
  if (id === "led") {
    const led = ledVariant(comp);
    id = led.id;
    ledGuess = led.guessed;
  }
  const S = sym.toUpperCase();
  if (id === "mosfet-standing") {
    if (/TO-220/i.test(comp.footprint)) id = "mosfet-flat";
    config.channel = S.startsWith("Q_PMOS") ? "P-channel" : "N-channel";
  }
  if (id === "diode") {
    const type = /ZENER/.test(S) ? "Zener" : /SCHOTTKY/.test(S) ? "Schottky" : /TVS/.test(S) ? "TVS" : undefined;
    if (type) config.diodeType = type;
  }
  const part = id ? lookup(id) : undefined;
  const guessed = ledGuess ?? `guessed "${id}" from ${sym || comp.footprint || comp.value}`;
  if (part) return {part, config, guessed: [...warnings, guessed].join("; ")};

  const generic = genericPart(comp, netlist);
  return {part: generic, config, guessed: [...warnings, `not in the parts library — placed as a generic ${generic.id.toUpperCase()}`].join("; ")};
}

// ─── pins, properties ─────────────────────────────────────────────────────

/** Netlist pin → our pin number: a uniquely-matching pin name first, then the number itself. */
function mapPin(pin: string, pinfunction: string | undefined, part: CatalogPart): number | null {
  const count = pinCountOfPart(part);
  const byName = new Map<string, number[]>();
  for (const [n, label] of Object.entries(part.pinDescription)) {
    if (!label) continue;
    const k = pinKey(label);
    byName.set(k, [...(byName.get(k) ?? []), Number(n)]);
  }
  for (const name of [pinfunction, /^\d+$/.test(pin) ? undefined : pin]) {
    const hits = name ? byName.get(pinKey(name)) : undefined;
    if (hits?.length === 1 && hits[0] <= count) return hits[0];
  }
  const n = Number(pin);
  return /^\d+$/.test(pin) && n >= 1 && n <= count ? n : null;
}

/** Netlist properties KiCad itself owns (or this app reads separately) — never treated as part properties. */
function isReservedProperty(name: string): boolean {
  const n = name.toLowerCase();
  return n.startsWith("ki_") || n.startsWith("perfboard")
    || ["reference", "value", "footprint", "datasheet", "description", "sheetname", "sheetfile", "dnp",
      "exclude from bom", "exclude from board", "exclude_from_bom", "exclude_from_board"].includes(n);
}

function applyProperties(comp: NetlistComponent, part: CatalogPart, config: Record<string, string>): string | undefined {
  const fields = fieldsForKind(part.kind);
  const notes: string[] = [];
  const note = comp.properties[PROP_NOTE];
  if (note) notes.push(note);

  // `value` → the kind's value field, unless it's just the part's name or a
  // generic symbol's ("R", "LED", "Conn_01x04") — but a symbol named after the
  // part number (LM358 / LM358) keeps it.
  const value = comp.value.trim();
  const symbolName = comp.part && idFromSymbol(comp.part) ? comp.part : undefined;
  const generic = !value || value === "~" || [part.id, part.name, symbolName].some(n => norm(n) === norm(value));
  const valueField = valueFieldForKind(part.kind);
  if (!generic) {
    if (valueField) config[valueField.key] = value;
    else if (!part.kind.startsWith("led-")) notes.push(`Value: ${value}`);
  }

  for (const [name, raw] of Object.entries(comp.properties)) {
    const v = raw.trim();
    if (!v || isReservedProperty(name)) continue;
    const field = fields.find(f => norm(f.key) === norm(name) || norm(f.label) === norm(name));
    if (!field) {
      notes.push(`${name}: ${v}`);
      continue;
    }
    const option = field.options ? field.options.find(o => norm(o) === norm(v)) : v;
    if (option) config[field.key] = option;
    else notes.push(`${field.label}: ${v}`);
  }
  return notes.length ? notes.join("\n") : undefined;
}

function parseAt(s: string | undefined): {col: number; row: number; rotation: Rotation} | null {
  if (!s) return null;
  const [col, row, rot = 0] = s.trim().split(/\s+/).map(Number);
  if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0) return null;
  const rotation = ([0, 90, 180, 270] as const).find(r => r === rot) ?? 0;
  return {col, row, rotation};
}

// ─── layout, connections ──────────────────────────────────────────────────

function footprintSize(c: PlannedComponent): {w: number; h: number} {
  const g = geometry(c.part, c.rotation, c.col, c.row);
  return {w: g.widthPin, h: g.heightPin};
}

/** Shelf-packs `items` (largest first) into rows starting at `top`; returns the bottom-right hole used. */
function autoPlace(items: PlannedComponent[], top: number, minWidth: number, extentOf: (p: CatalogPart) => Extent): {right: number; bottom: number} {
  const boxes = items.map(c => {
    const e = extentOf(c.part);
    return {c, e, w: e.left + c.part.widthPin + e.right, h: e.top + c.part.heightPin + e.bottom};
  });
  boxes.sort((a, b) => b.w * b.h - a.w * a.h || byRef(a.c.ref, b.c.ref));

  const area = boxes.reduce((s, b) => s + (b.w + GAP) * (b.h + GAP), 0);
  // Roughly 3:2 landscape, never narrower than the widest part or the board already is.
  const width = Math.max(minWidth - 1, ...boxes.map(b => b.w + 1), Math.ceil(Math.sqrt(area * 1.5)));

  let x = 1;
  let y = top;
  let shelf = 0;
  let right = 0;
  for (const b of boxes) {
    if (x > 1 && x + b.w > width) {
      x = 1;
      y += shelf + GAP;
      shelf = 0;
    }
    b.c.col = x + b.e.left;
    b.c.row = y + b.e.top;
    b.c.rotation = 0;
    x += b.w + GAP;
    shelf = Math.max(shelf, b.h);
    right = Math.max(right, x - GAP);
  }
  return {right, bottom: boxes.length ? y + shelf : top};
}

/** Prim's MST over the legs of one net (Manhattan distance between pads). */
function spanningTree(points: {t: PlannedTerminal; x: number; y: number}[]): [number, number][] {
  const n = points.length;
  const inTree = new Array<boolean>(n).fill(false);
  const dist = new Array<number>(n).fill(Infinity);
  const from = new Array<number>(n).fill(-1);
  const edges: [number, number][] = [];
  dist[0] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || dist[i] < dist[u])) u = i;
    inTree[u] = true;
    if (from[u] >= 0) edges.push([from[u], u]);
    for (let v = 0; v < n; v++) {
      const d = Math.abs(points[u].x - points[v].x) + Math.abs(points[u].y - points[v].y);
      if (!inTree[v] && d < dist[v]) {
        dist[v] = d;
        from[v] = u;
      }
    }
  }
  return edges;
}

export function planProject(netlist: Netlist, parts: CatalogPart[], opts: PlanOptions = {}): ProjectPlan {
  const extentOf = opts.extentOf ?? (() => ({left: 0, top: 0, right: 0, bottom: 0}));
  const warnings: string[] = [];
  const customParts = netlist.perfboard?.customParts ?? [];
  const partsById = new Map<string, CatalogPart>();
  for (const p of [...customParts, ...parts]) partsById.set(p.id.toLowerCase(), p);

  // Components.
  const components: PlannedComponent[] = [];
  const byRefMap = new Map<string, PlannedComponent>();
  const unplaced: PlannedComponent[] = [];
  for (const comp of netlist.components) {
    if (!comp.ref) {
      warnings.push("Skipped a component with no reference.");
      continue;
    }
    if (byRefMap.has(comp.ref)) {
      warnings.push(`${comp.ref}: duplicate reference — skipped the second one.`);
      continue;
    }
    const resolved = resolvePart(comp, netlist, partsById);
    if (resolved.guessed) warnings.push(`${comp.ref}: ${resolved.guessed}.`);
    let part = resolved.part;
    const pinNames = comp.properties[PROP_PINS];
    if (pinNames) {
      const pinDescription: Record<number, string> = {};
      for (const pair of pinNames.trim().split(/\s+/)) {
        const [n, label = ""] = pair.split(":");
        if (Number(n) >= 1) pinDescription[Number(n)] = label;
      }
      part = {...part, pinDescription};
    }
    const config = {...resolved.config};
    const note = applyProperties(comp, part, config);
    const at = parseAt(comp.properties[PROP_AT]);
    const planned: PlannedComponent = {
      ref: comp.ref,
      label: (part.kind === "bridge" && /^BR\d+$/.test(comp.ref)) || comp.ref.includes("?") ? undefined : comp.ref,
      part,
      rotation: at?.rotation ?? 0,
      col: at?.col ?? 0,
      row: at?.row ?? 0,
      config,
      note,
    };
    components.push(planned);
    byRefMap.set(comp.ref, planned);
    if (!at) unplaced.push(planned);
  }

  // Board: the saved size, grown to fit everything already placed, then the auto-placed shelf below it.
  const saved = netlist.perfboard?.board;
  let cols = saved?.cols ?? MIN_BOARD;
  let rows = saved?.rows ?? MIN_BOARD;
  let placedBottom = 0;
  for (const c of components) {
    if (unplaced.includes(c)) continue;
    const {w, h} = footprintSize(c);
    cols = Math.max(cols, c.col + w);
    rows = Math.max(rows, c.row + h);
    placedBottom = Math.max(placedBottom, c.row + h);
  }
  if (unplaced.length) {
    const top = placedBottom ? placedBottom + GAP : 1;
    const used = autoPlace(unplaced, top, saved ? cols : 0, extentOf);
    cols = Math.max(cols, used.right + 1, MIN_BOARD);
    rows = Math.max(rows, used.bottom + 1, MIN_BOARD);
  }

  // Connections: one spanning tree per net.
  const connections: ProjectPlan["connections"] = [];
  const nets: ProjectPlan["nets"] = [];
  for (const net of netlist.nets) {
    const seen = new Set<string>();
    const points: {t: PlannedTerminal; x: number; y: number}[] = [];
    for (const node of net.nodes) {
      const c = byRefMap.get(node.ref);
      if (!c) {
        warnings.push(`Net ${net.name || "?"}: unknown component ${node.ref} — leg dropped.`);
        continue;
      }
      const pin = mapPin(node.pin, node.pinfunction, c.part);
      if (pin === null) {
        warnings.push(`Net ${net.name || "?"}: ${node.ref} has no pin ${node.pin}${node.pinfunction ? ` (${node.pinfunction})` : ""} — leg dropped.`);
        continue;
      }
      const key = `${node.ref}#${pin}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const pos = dotForPin(geometry(c.part, c.rotation, c.col, c.row), pin);
      if (pos) points.push({t: {ref: node.ref, pin}, ...pos});
    }
    points.sort((a, b) => byRef(a.t.ref, b.t.ref) || a.t.pin - b.t.pin);
    if (points.length < 2) continue;
    const index = nets.push({name: givenNetName(net.name)}) - 1;
    for (const [i, j] of spanningTree(points)) connections.push({a: points[i].t, b: points[j].t, net: index});
  }

  return {
    board: {...saved, cols, rows},
    pads: netlist.perfboard?.pads ?? [],
    customParts,
    components,
    nets,
    connections,
    warnings,
  };
}
