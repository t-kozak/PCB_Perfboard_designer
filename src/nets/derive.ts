/**
 * Net derivation — the logical layer of docs/autorouting.md, kept pure.
 *
 * "Which pads are electrically one node" is a union-find over the physical wire
 * list, keyed on `"x,y"` coordinate strings (never object identity — loaded
 * projects have re-hydrated endpoint copies). Nothing here touches the DOM,
 * `State`, or the canvas; the only outside type is `Ic`, imported for its pin
 * geometry and pulled in `type`-only so there is no runtime dependency.
 */
import type { ILine } from "../interfaces/line.interface";
import type { IDot } from "../interfaces/dot.interface";
import type { INet } from "../interfaces/net.interface";
import type { Ic } from "../features/ic";

export const dotKey = (d: { x: number; y: number }): string => `${d.x},${d.y}`;

class UnionFind {
  private parent = new Map<string, string>();

  find(a: string): string {
    let root = a;
    while ((this.parent.get(root) ?? root) !== root) root = this.parent.get(root)!;
    while (a !== root) {
      const next = this.parent.get(a) ?? a;
      this.parent.set(a, root);
      a = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Connected components of pads (as `"x,y"` keys) over the wire list. */
export function components(lines: ILine[]): string[][] {
  const uf = new UnionFind();
  const pads = new Set<string>();
  for (const l of lines) {
    const a = dotKey(l.start);
    const b = dotKey(l.end);
    pads.add(a);
    pads.add(b);
    uf.union(a, b);
  }
  const byRoot = new Map<string, string[]>();
  for (const p of pads) {
    const r = uf.find(p);
    const arr = byRoot.get(r);
    if (arr) arr.push(p);
    else byRoot.set(r, [p]);
  }
  return [...byRoot.values()];
}

const NET_PALETTE = [
  "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4",
  "#eab308", "#f43f5e", "#22c55e", "#3b82f6", "#a855f7",
];

export function colorFor(index: number): string {
  return NET_PALETTE[index % NET_PALETTE.length];
}

const POWER_PATTERNS: [RegExp, string][] = [
  [/(^|[^a-z])(gnd|ground|vss|vee)([^a-z]|$)/i, "GND"],
  [/(^|[^a-z])(vcc|vdd|v\+|vbat|vin|\+5v?|\+3v3|\+3\.3v?)([^a-z]|$)/i, "VCC"],
];

/** A pin-description string reduced to a canonical net name, or null. */
export function nameFromLabel(info: string | null | undefined): string | null {
  if (!info) return null;
  for (const [re, name] of POWER_PATTERNS) if (re.test(info)) return name;
  const slug = info.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug ? slug.slice(0, 12) : null;
}

/** Maps a `"x,y"` pad key to the pin label of any placed component pin there. */
export function pinResolver(placedIcs: Ic[]): (key: string) => string | null {
  return (key) => {
    const [x, y] = key.split(",").map(Number);
    const dot = { x, y } as IDot;
    for (const ic of placedIcs) {
      const p = ic.getPinPositionOnIC(dot);
      if (p && p.info) return p.info;
    }
    return null;
  };
}

export interface DeriveResult {
  nets: INet[];
  /** wire -> netId, to be applied onto `ILine.netId` by the (impure) caller. */
  lineNet: Map<ILine, string>;
}

/**
 * Group the wire list into nets. Identity, name, colour and lock are carried
 * over from `existing` for any component that still contains a pad of a
 * previously-derived net, so a rebuild never disturbs hand-tuned nets.
 */
export function deriveNets(lines: ILine[], placedIcs: Ic[], existing: INet[] = []): DeriveResult {
  const resolve = pinResolver(placedIcs);
  const nets: INet[] = [];
  const lineNet = new Map<ILine, string>();

  const existingById = new Map(existing.map(n => [n.id, n] as [string, INet]));
  const priorByPad = new Map<string, INet>();
  for (const l of lines) {
    const prior = l.netId ? existingById.get(l.netId) : undefined;
    if (prior) {
      priorByPad.set(dotKey(l.start), prior);
      priorByPad.set(dotKey(l.end), prior);
    }
  }

  let anon = 1;
  for (const comp of components(lines)) {
    const compSet = new Set(comp);
    const strongNames = new Set<string>();
    for (const pk of comp) {
      const name = nameFromLabel(resolve(pk));
      if (name) strongNames.add(name);
    }

    const prior = comp.map(p => priorByPad.get(p)).find(Boolean);
    const id = prior?.id ?? crypto.randomUUID();
    // A node tying two canonical names together is a short — name it for the
    // conflict even if it was previously a clean, hand-named net.
    const derivedName = strongNames.size > 1
      ? [...strongNames].sort().join("/")
      : (prior?.name
        ?? (strongNames.size === 1 ? [...strongNames][0] : undefined)
        ?? `N$${anon++}`);

    let color = prior?.color ?? colorFor(nets.length);
    // GND / VCC get fixed, high-contrast colours against the green board.
    if (derivedName === "GND") color = "#cbd5e1";
    else if (derivedName === "VCC") color = "#ef4444";

    nets.push({ id, name: derivedName, color, locked: prior?.locked });

    for (const l of lines) {
      if (compSet.has(dotKey(l.start)) || compSet.has(dotKey(l.end))) lineNet.set(l, id);
    }
  }

  return { nets, lineNet };
}

/** Pads whose incident wires carry two or more distinct netIds — a wired short. */
export function findShorts(lines: ILine[]): string[] {
  const byPad = new Map<string, Set<string>>();
  for (const l of lines) {
    if (!l.netId) continue;
    for (const k of [dotKey(l.start), dotKey(l.end)]) {
      const s = byPad.get(k) ?? byPad.set(k, new Set()).get(k)!;
      s.add(l.netId);
    }
  }
  return [...byPad.entries()].filter(([, s]) => s.size > 1).map(([k]) => k);
}

/**
 * Pads on an electrical node that ties together two different canonical net
 * names (e.g. a wire from a GND pin to a VCC pin) — a short that shows up even
 * before a rebuild has assigned netIds.
 */
export function labelConflicts(lines: ILine[], placedIcs: Ic[]): string[] {
  const resolve = pinResolver(placedIcs);
  const out: string[] = [];
  for (const comp of components(lines)) {
    const names = new Set<string>();
    for (const pk of comp) {
      const name = nameFromLabel(resolve(pk));
      if (name) names.add(name);
    }
    if (names.size > 1) out.push(...comp);
  }
  return out;
}

/**
 * Every wire and pad on the same electrical node as `line`, found by flooding
 * the wire list directly. Independent of any netId assignment, so net highlight
 * works even on a freshly loaded project.
 */
export function netAtLine(line: ILine, lines: ILine[]): { lines: Set<ILine>; pads: Set<string> } {
  const pads = new Set<string>([dotKey(line.start), dotKey(line.end)]);
  const inNet = new Set<ILine>([line]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of lines) {
      if (inNet.has(l)) continue;
      const a = dotKey(l.start);
      const b = dotKey(l.end);
      if (pads.has(a) || pads.has(b)) {
        inNet.add(l);
        pads.add(a);
        pads.add(b);
        grew = true;
      }
    }
  }
  return { lines: inNet, pads };
}
