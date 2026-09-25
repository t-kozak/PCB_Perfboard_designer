/**
 * Connectivity-aware auto-placement for netlist imports. Pure — no DOM,
 * `State` or `Canvas`.
 *
 * Works in three levels, so a netlist only has to say *which parts belong
 * together* (never coordinates):
 *
 * 1. **Groups.** A part's `group` (from `perfboard:group` or its KiCad sheet
 *    path) seeds its group. Parts without one join the group they share the
 *    most *signal* legs with (greedy growth); parts tied in only by power
 *    rails (a decoupling cap) join the group whose chips share those rails,
 *    spread evenly. With no groups given at all, every part with at least
 *    `ANCHOR_PINS` pins seeds its own group.
 * 2. **Inside a group.** The biggest part goes down first; then, most-connected
 *    first, each part takes the spot and rotation that puts its pins closest
 *    to the pins they join, with a slight pull towards a compact block.
 *    Two re-insertion passes then let early parts move to where the later
 *    ones ended up.
 * 3. **Groups as blocks.** Rows from the `floorplan` hint if there is one,
 *    then the rest greedily, each where it adds the least wire (half-perimeter
 *    of each shared net) to what is already down, aiming for a ~3:2 board.
 *
 * Power rails (a net named like GND / VCC / +12V, or joining a large share of
 * the board) are weighted down throughout: they touch everything, so they
 * would otherwise pull every part into one clump. `edge` hints push a part to
 * that side of its group, and its group to that side of the board.
 */
import type {CatalogPart} from "../catalog/parts";
import {dotForPin, pinCountOf} from "../features/ic-geometry";
import {powerNetName} from "../nets/derive";
import type {Extent, Rotation} from "./project";

export type Edge = "left" | "right" | "top" | "bottom";
export const EDGES: readonly Edge[] = ["left", "right", "top", "bottom"];

export interface PlaceItem {
  ref: string;
  part: CatalogPart;
  /** Artwork overhang of the unrotated part, in holes. */
  extent: Extent;
  group?: string;
  edge?: Edge;
}

export interface PlaceNet {
  name: string;
  legs: {ref: string; pin: number}[];
}

export interface PlaceOptions {
  /** Rows of group names, top to bottom; a group matches by full path or last path segment. */
  floorplan?: string[][];
  /** Hole row of the layout's top edge (artwork included); the left edge is always hole 1. */
  top?: number;
}

export interface Placed {
  col: number;
  row: number;
  rotation: Rotation;
  /** Group the part ended up in ("" for parts joined to nothing). */
  group: string;
}

export interface PlaceResult {
  at: Map<string, Placed>;
  /** One past the last hole used, right and bottom (artwork included). */
  right: number;
  bottom: number;
  warnings: string[];
}

const PITCH = 50;
/** Free holes kept between parts of one group, and between groups. */
const GAP_IN = 1;
const GAP_OUT = 2;
/** Parts with this many pins seed their own group when the netlist gives none. */
const ANCHOR_PINS = 6;
/** Weight of a rail leg next to a signal leg (1) — inside a group, and between groups. */
const RAIL_IN = 0.25;
const RAIL_OUT = 0.1;
/** Cost per hole of block growth, and per hole a part/group sits off its `edge`. */
const COMPACT_IN = 0.5;
const COMPACT_OUT = 1;
const EDGE_PULL = 4;
/** Extra cost for a pin pair that can't be joined by one straight run. */
const BEND = 0.1;
const REINSERT_PASSES = 2;

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Point {
  x: number;
  y: number;
}

/** One orientation of a part: pin offsets and body rect, relative to its top-left pad. */
interface Shape {
  rotation: Rotation;
  body: Rect;
  pins: Map<number, Point>;
}

interface Leg {
  pin: number;
  net: number;
}

interface Cell {
  ref: string;
  shape: Shape;
  x: number;
  y: number;
}

interface Block {
  name: string;
  cells: Cell[];
  w: number;
  h: number;
  edge?: Edge;
  /** Net → pin positions inside the block. */
  ports: Map<number, Point[]>;
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, {numeric: true});

/** Extent of a part turned `rotation` degrees clockwise (what was left ends up on top). */
function rotateExtent(e: Extent, rotation: Rotation): Extent {
  if (rotation === 90) return {left: e.bottom, top: e.left, right: e.top, bottom: e.right};
  if (rotation === 180) return {left: e.right, top: e.bottom, right: e.left, bottom: e.top};
  if (rotation === 270) return {left: e.top, top: e.right, right: e.bottom, bottom: e.left};
  return e;
}

/** Every distinct orientation of a part (a bridge or a SIP has fewer than four). */
function shapesOf(part: CatalogPart, extent: Extent): Shape[] {
  const shapes: Shape[] = [];
  const seen = new Set<string>();
  for (const rotation of [0, 90, 180, 270] as const) {
    const swapped = rotation === 90 || rotation === 270;
    const w = swapped ? part.heightPin : part.widthPin;
    const h = swapped ? part.widthPin : part.heightPin;
    const geo = {topLeftDot: {x: 0, y: 0}, widthPin: w, heightPin: h, rotationAngle: rotation, kind: part.kind};
    const pins = new Map<number, Point>();
    for (let pin = 1; pin <= pinCountOf(geo); pin++) {
      const d = dotForPin(geo, pin);
      if (d) pins.set(pin, {x: d.x / PITCH, y: d.y / PITCH});
    }
    const e = rotateExtent(extent, rotation);
    const body = {x1: -e.left, y1: -e.top, x2: w - 1 + e.right, y2: h - 1 + e.bottom};
    const key = JSON.stringify([body, [...pins]]);
    if (seen.has(key)) continue;
    seen.add(key);
    shapes.push({rotation, body, pins});
  }
  return shapes;
}

const moved = (r: Rect, x: number, y: number): Rect => ({x1: r.x1 + x, y1: r.y1 + y, x2: r.x2 + x, y2: r.y2 + y});
const cellRect = (c: Cell): Rect => moved(c.shape.body, c.x, c.y);

/** True when `r` keeps at least `gap` free holes from every rect in `others`. */
function fits(r: Rect, others: Rect[], gap: number): boolean {
  return others.every(o => r.x1 > o.x2 + gap || r.x2 < o.x1 - gap || r.y1 > o.y2 + gap || r.y2 < o.y1 - gap);
}

function union(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  return {
    x1: Math.min(...rects.map(r => r.x1)),
    y1: Math.min(...rects.map(r => r.y1)),
    x2: Math.max(...rects.map(r => r.x2)),
    y2: Math.max(...rects.map(r => r.y2)),
  };
}

const grow = (a: Rect, b: Rect): Rect => ({x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2)});

/** Size of a bounding box, favouring `aspect` (width : height): growing the short side is nearly free. */
function sizeCost(r: Rect, aspect: number): number {
  const w = r.x2 - r.x1 + 1;
  const h = r.y2 - r.y1 + 1;
  return Math.max(w, aspect * h) + 0.25 * (w + h);
}

/** Holes `r` sits in from the `edge` side of `box`. */
function edgeCost(r: Rect, box: Rect, edge: Edge | undefined): number {
  if (edge === "left") return r.x1 - box.x1;
  if (edge === "right") return box.x2 - r.x2;
  if (edge === "top") return r.y1 - box.y1;
  if (edge === "bottom") return box.y2 - r.y2;
  return 0;
}

// ─── nets ─────────────────────────────────────────────────────────────────

interface NetInfo {
  refs: string[];
  rail: boolean;
}

/** Rails: named like one (GND, VCC, +12V…), or so widely shared that they tie everything together. */
function netInfo(nets: PlaceNet[], partCount: number): NetInfo[] {
  const fanout = Math.max(8, Math.ceil(partCount * 0.15));
  return nets.map(n => {
    const refs = [...new Set(n.legs.map(l => l.ref))];
    return {refs, rail: powerNetName(n.name) !== null || n.legs.length >= fanout};
  });
}

// ─── level 1: groups ──────────────────────────────────────────────────────

function assignGroups(items: PlaceItem[], legs: Map<string, Leg[]>, info: NetInfo[]): Map<string, string> {
  const group = new Map<string, string>();
  for (const it of items) if (it.group) group.set(it.ref, it.group);
  const pins = (ref: string) => pinCountOf({...items.find(i => i.ref === ref)!.part, rotationAngle: 0});
  if (!group.size) {
    for (const it of items) if (pinCountOf({...it.part, rotationAngle: 0}) >= ANCHOR_PINS) group.set(it.ref, it.ref);
  }

  // Signal adjacency: each net links its parts with weight 1/(parts-1), so a 2-part net counts most.
  const adj = new Map<string, Map<string, number>>();
  for (const n of info) {
    if (n.rail || n.refs.length < 2) continue;
    const w = 1 / (n.refs.length - 1);
    for (const a of n.refs) {
      for (const b of n.refs) {
        if (a === b) continue;
        const m = adj.get(a) ?? new Map<string, number>();
        m.set(b, (m.get(b) ?? 0) + w);
        adj.set(a, m);
      }
    }
  }

  const refs = items.map(i => i.ref).sort(byName);
  for (;;) {
    let best: {ref: string; group: string; score: number} | undefined;
    for (const ref of refs) {
      if (group.has(ref)) continue;
      const scores = new Map<string, number>();
      for (const [other, w] of adj.get(ref) ?? []) {
        const g = group.get(other);
        if (g !== undefined) scores.set(g, (scores.get(g) ?? 0) + w);
      }
      for (const [g, score] of [...scores].sort(([a], [b]) => byName(a, b))) {
        if (!best || score > best.score) best = {ref, group: g, score};
      }
    }
    if (!best) break;
    group.set(best.ref, best.group);
  }

  // Parts reached only through rails: to the group whose chips share the most of them, spread evenly.
  if (group.size) {
    const railsOf = (ref: string) => new Set((legs.get(ref) ?? []).filter(l => info[l.net].rail).map(l => l.net));
    const attached = new Map<string, number>();
    // Scored against the groups as they stood before this pass, so one cap pulled in doesn't draw the next.
    const seeded = [...group];
    for (const ref of refs) {
      if (group.has(ref)) continue;
      const mine = railsOf(ref);
      if (!mine.size) continue;
      const scores = new Map<string, number>();
      for (const [other, g] of seeded) {
        const shared = [...railsOf(other)].filter(n => mine.has(n)).length;
        if (!shared) continue;
        scores.set(g, (scores.get(g) ?? 0) + shared * (pins(other) >= ANCHOR_PINS ? 2 : 1) / (1 + shared));
      }
      let pick: string | undefined;
      for (const [g, s] of [...scores].sort(([a], [b]) => byName(a, b))) {
        if (pick === undefined) {
          pick = g;
          continue;
        }
        const best = scores.get(pick)!;
        // Near-equal groups: the one with the fewest parts already pulled in this way.
        if (s > best + 0.5 || (Math.abs(s - best) <= 0.5 && (attached.get(g) ?? 0) < (attached.get(pick) ?? 0))) pick = g;
      }
      if (pick !== undefined) {
        group.set(ref, pick);
        attached.set(pick, (attached.get(pick) ?? 0) + 1);
      }
    }
  }
  for (const ref of refs) if (!group.has(ref)) group.set(ref, "");
  return group;
}

// ─── level 2: parts inside a group ────────────────────────────────────────

interface Member {
  item: PlaceItem;
  shapes: Shape[];
  legs: Leg[];
  pins: number;
}

function placeGroup(members: Member[], info: NetInfo[]): Cell[] {
  const weight = (net: number) => (info[net].rail ? RAIL_IN : 1);
  const order = [...members].sort((a, b) => b.pins - a.pins || area(b) - area(a) || byName(a.item.ref, b.item.ref));
  const cells: Cell[] = [];

  const best = (m: Member, others: Cell[]): Cell => {
    if (!others.length) return {ref: m.item.ref, shape: m.shapes[0], x: 0, y: 0};
    const targets = new Map<number, Point[]>();
    for (const c of others) {
      const mine = members.find(o => o.item.ref === c.ref)!;
      for (const l of mine.legs) {
        const p = c.shape.pins.get(l.pin);
        if (p) targets.set(l.net, [...(targets.get(l.net) ?? []), {x: c.x + p.x, y: c.y + p.y}]);
      }
    }
    const rects = others.map(cellRect);
    const box = union(rects)!;
    const base = sizeCost(box, 1);
    const reach = Math.max(...m.shapes.map(s => Math.max(s.body.x2 - s.body.x1, s.body.y2 - s.body.y1))) + GAP_IN + 1;

    let pick: Cell | undefined;
    let pickCost = Infinity;
    for (const shape of m.shapes) {
      for (let y = box.y1 - reach; y <= box.y2 + reach; y++) {
        for (let x = box.x1 - reach; x <= box.x2 + reach; x++) {
          const r = moved(shape.body, x, y);
          if (!fits(r, rects, GAP_IN)) continue;
          let cost = 0;
          for (const l of m.legs) {
            const p = shape.pins.get(l.pin);
            const ts = targets.get(l.net);
            if (!p || !ts) continue;
            let d = Infinity;
            for (const t of ts) {
              const dx = Math.abs(x + p.x - t.x);
              const dy = Math.abs(y + p.y - t.y);
              d = Math.min(d, dx + dy + (dx && dy ? BEND : 0));
            }
            cost += weight(l.net) * d;
          }
          const grown = grow(box, r);
          cost += COMPACT_IN * (sizeCost(grown, 1) - base) + EDGE_PULL * edgeCost(r, grown, m.item.edge);
          if (cost < pickCost) {
            pickCost = cost;
            pick = {ref: m.item.ref, shape, x, y};
          }
        }
      }
    }
    return pick!;
  };

  // Greedy: next is the part most tied to what's already down.
  const left = new Set(order);
  const placedNets = new Set<number>();
  while (left.size) {
    let next: Member | undefined;
    let nextScore = -1;
    for (const m of order) {
      if (!left.has(m)) continue;
      const score = m.legs.reduce((s, l) => s + (placedNets.has(l.net) ? weight(l.net) : 0), 0);
      if (score > nextScore) {
        next = m;
        nextScore = score;
      }
    }
    left.delete(next!);
    cells.push(best(next!, cells));
    for (const l of next!.legs) placedNets.add(l.net);
  }

  // Re-insertion: every part but the first, against all the others.
  for (let pass = 0; pass < REINSERT_PASSES; pass++) {
    for (let i = 1; i < cells.length; i++) {
      const m = members.find(o => o.item.ref === cells[i].ref)!;
      cells[i] = best(m, cells.filter((_, j) => j !== i));
    }
  }
  return cells;
}

const area = (m: Member) => m.item.part.widthPin * m.item.part.heightPin;

function toBlock(name: string, cells: Cell[], members: Member[]): Block {
  const box = union(cells.map(cellRect))!;
  const ports = new Map<number, Point[]>();
  const shifted = cells.map(c => ({...c, x: c.x - box.x1, y: c.y - box.y1}));
  for (const c of shifted) {
    for (const l of members.find(m => m.item.ref === c.ref)!.legs) {
      const p = c.shape.pins.get(l.pin);
      if (p) ports.set(l.net, [...(ports.get(l.net) ?? []), {x: c.x + p.x, y: c.y + p.y}]);
    }
  }
  const edge = members.map(m => m.item).sort((a, b) => byName(a.ref, b.ref)).find(i => i.edge)?.edge;
  return {name, cells: shifted, w: box.x2 - box.x1 + 1, h: box.y2 - box.y1 + 1, edge, ports};
}

// ─── level 3: groups on the board ─────────────────────────────────────────

function matchesGroup(block: string, name: string): boolean {
  const a = block.toLowerCase();
  const b = name.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  return a === b || a.split("/").pop() === b;
}

function placeBlocks(blocks: Block[], info: NetInfo[], floorplan: string[][], warnings: string[]): Map<Block, Point> {
  const weight = (net: number) => (info[net].rail ? RAIL_OUT : 1);
  const at = new Map<Block, Point>();
  const rects: Rect[] = [];
  const netBox = new Map<number, Rect>();
  const put = (b: Block, x: number, y: number) => {
    at.set(b, {x, y});
    rects.push({x1: x, y1: y, x2: x + b.w - 1, y2: y + b.h - 1});
    for (const [net, ps] of b.ports) {
      for (const p of ps) {
        const r = {x1: x + p.x, y1: y + p.y, x2: x + p.x, y2: y + p.y};
        const cur = netBox.get(net);
        netBox.set(net, cur ? grow(cur, r) : r);
      }
    }
  };

  // Floorplan rows, top to bottom.
  let y = 0;
  for (const row of floorplan) {
    let x = 0;
    let rowH = 0;
    for (const name of row) {
      const b = blocks.find(k => !at.has(k) && matchesGroup(k.name, name));
      if (!b) {
        warnings.push(`Floorplan: no group "${name}" — ignored.`);
        continue;
      }
      put(b, x, y);
      x += b.w + GAP_OUT;
      rowH = Math.max(rowH, b.h);
    }
    if (rowH) y += rowH + GAP_OUT;
  }

  // The rest: most tied to what's down first (the biggest if nothing is), where it adds the least wire.
  const size = (b: Block) => b.w * b.h;
  for (;;) {
    let next: Block | undefined;
    let nextScore = -1;
    for (const b of blocks) {
      if (at.has(b)) continue;
      let score = 0;
      for (const net of b.ports.keys()) if (netBox.has(net)) score += weight(net);
      if (score > nextScore || (score === nextScore && next && size(b) > size(next))) {
        next = b;
        nextScore = score;
      }
    }
    if (!next) break;
    if (!rects.length) {
      put(next, 0, 0);
      continue;
    }
    const box = union(rects)!;
    const base = sizeCost(box, 1.5);
    let pick: Point = {x: box.x2 + GAP_OUT + 1, y: box.y1};
    let pickCost = Infinity;
    for (let by = box.y1 - next.h - GAP_OUT; by <= box.y2 + GAP_OUT + 1; by++) {
      for (let bx = box.x1 - next.w - GAP_OUT; bx <= box.x2 + GAP_OUT + 1; bx++) {
        const r = {x1: bx, y1: by, x2: bx + next.w - 1, y2: by + next.h - 1};
        if (!fits(r, rects, GAP_OUT)) continue;
        let cost = 0;
        for (const [net, ps] of next.ports) {
          const cur = netBox.get(net);
          if (!cur) continue;
          let nb = cur;
          for (const p of ps) nb = grow(nb, {x1: bx + p.x, y1: by + p.y, x2: bx + p.x, y2: by + p.y});
          cost += weight(net) * (nb.x2 - nb.x1 + nb.y2 - nb.y1 - (cur.x2 - cur.x1 + cur.y2 - cur.y1));
        }
        const grown = grow(box, r);
        cost += COMPACT_OUT * (sizeCost(grown, 1.5) - base) + EDGE_PULL * edgeCost(r, grown, next.edge);
        if (cost < pickCost) {
          pickCost = cost;
          pick = {x: bx, y: by};
        }
      }
    }
    put(next, pick.x, pick.y);
  }
  return at;
}

// ─── entry point ──────────────────────────────────────────────────────────

export function placeComponents(items: PlaceItem[], nets: PlaceNet[], opts: PlaceOptions = {}): PlaceResult {
  const warnings: string[] = [];
  const at = new Map<string, Placed>();
  const top = opts.top ?? 1;
  if (!items.length) return {at, right: 1, bottom: top, warnings};

  const refs = new Set(items.map(i => i.ref));
  const inside = nets.map(n => ({name: n.name, legs: n.legs.filter(l => refs.has(l.ref))}));
  const info = netInfo(inside, items.length);
  const legs = new Map<string, Leg[]>();
  inside.forEach((n, net) => {
    for (const l of n.legs) legs.set(l.ref, [...(legs.get(l.ref) ?? []), {pin: l.pin, net}]);
  });

  const group = assignGroups(items, legs, info);
  const byGroup = new Map<string, Member[]>();
  for (const item of [...items].sort((a, b) => byName(a.ref, b.ref))) {
    const g = group.get(item.ref)!;
    const m: Member = {item, shapes: shapesOf(item.part, item.extent), legs: legs.get(item.ref) ?? [], pins: pinCountOf({...item.part, rotationAngle: 0})};
    byGroup.set(g, [...(byGroup.get(g) ?? []), m]);
  }

  const blocks = [...byGroup].sort(([a], [b]) => byName(a, b)).map(([name, members]) => toBlock(name, placeGroup(members, info), members));
  const offsets = placeBlocks(blocks, info, opts.floorplan ?? [], warnings);

  const cells = blocks.flatMap(b => b.cells.map(c => ({...c, x: c.x + offsets.get(b)!.x, y: c.y + offsets.get(b)!.y, group: b.name})));
  const box = union(cells.map(cellRect))!;
  const dx = 1 - box.x1;
  const dy = top - box.y1;
  for (const c of cells) at.set(c.ref, {col: c.x + dx, row: c.y + dy, rotation: c.shape.rotation, group: c.group});
  return {at, right: box.x2 + dx + 1, bottom: box.y2 + dy + 1, warnings};
}
