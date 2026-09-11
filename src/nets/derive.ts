/**
 * Net derivation — the logical layer of docs/logical-connections.md, kept
 * pure. "Which pins are electrically one node" is a union-find over the
 * connection list, keyed on `"icId#pin"` terminal keys. Nothing here touches
 * the DOM, `State`, or the canvas; `Ic` is imported for its pin geometry and
 * pulled in `type`-only so there is no runtime dependency.
 */
import type { ILine } from "../interfaces/line.interface";
import type { IDot } from "../interfaces/dot.interface";
import type { INet } from "../interfaces/net.interface";
import type { IConnection, ITerminal } from "../interfaces/connection.interface";
import { terminalKey } from "../interfaces/connection.interface";
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

/** Connected components of terminals (as `"icId#pin"` keys) over the connection list. */
export function components(connections: IConnection[]): string[][] {
  const uf = new UnionFind();
  const terms = new Set<string>();
  for (const c of connections) {
    const a = terminalKey(c.a);
    const b = terminalKey(c.b);
    terms.add(a);
    terms.add(b);
    uf.union(a, b);
  }
  const byRoot = new Map<string, string[]>();
  for (const t of terms) {
    const r = uf.find(t);
    const arr = byRoot.get(r);
    if (arr) arr.push(t);
    else byRoot.set(r, [t]);
  }
  return [...byRoot.values()];
}

/**
 * Sidebar net swatches (solder-side Nets panel). Front-loaded for maximum
 * mutual contrast: the first ~12 are vivid, well-separated hues so small
 * designs read cleanly. Entries further down reuse hue families at lighter /
 * shifted tints — any prefix stays distinguishable, and even late neighbours
 * differ in hue, lightness or saturation. GND / VCC are named nets and get
 * their own fixed colours below, outside this cycle.
 */
const NET_PALETTE = [
  "#3cb44b", "#4363d8", "#f58231", "#e6194b", "#42d4f4",
  "#f032e6", "#ffe119", "#911eb4", "#469990", "#f4a6c0",
  "#bfef45", "#9a6324", "#8b0000", "#808000", "#1f3fff",
  "#00b8a0", "#dc7dff", "#7dffb0", "#ff9d5c", "#7a4fd8",
  "#ff6d6d", "#6dff9e", "#6d9eff", "#ffb26d", "#c46dff",
  "#3ad0b0", "#ff6dcf", "#d4ff6d", "#6dd4ff", "#ffc73d",
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

/**
 * Maps a `"icId#pin"` terminal key to its pin label. A terminal *is* a pin
 * now, so this is a direct `pinDescription[pin]` read — no coordinate
 * guessing (unlike the old wire-based `pinResolver`).
 */
export function terminalResolver(placedIcs: Ic[]): (key: string) => string | null {
  const byId = new Map(placedIcs.map(ic => [ic.id, ic] as const));
  return (key) => {
    const hashIndex = key.lastIndexOf("#");
    const ic = byId.get(key.slice(0, hashIndex));
    if (!ic) return null;
    return ic.pinDescription[Number(key.slice(hashIndex + 1))] ?? null;
  };
}

/** Board coordinate of a terminal's pad, or null if its component isn't placed / the pin is out of range. */
export function resolveTerminal(t: ITerminal, placedIcs: Ic[]): { x: number; y: number } | null {
  const ic = placedIcs.find(i => i.id === t.icId);
  return ic ? ic.pinDot(t.pin) : null;
}

/** The terminal (if any) that `dot` resolves to on some placed component — pad -> terminal. */
export function terminalAtDot(dot: IDot, placedIcs: Ic[]): ITerminal | undefined {
  for (const ic of placedIcs) {
    const p = ic.getPinPositionOnIC(dot);
    if (p) return { icId: ic.id, pin: p.pin };
  }
  return undefined;
}

export interface DeriveResult {
  nets: INet[];
  /** connection -> netId, to be applied onto `IConnection.netId` by the (impure) caller. */
  connectionNet: Map<IConnection, string>;
}

/**
 * Group the connection list into nets. Identity and name are carried over from
 * `existing` for any net that still has a terminal in common, so a rebuild
 * keeps net names stable. Colour is a derived palette swatch for the sidebar
 * only (never a wire colour — that lives on `IConnection.color`).
 */
export function deriveNets(connections: IConnection[], placedIcs: Ic[], existing: INet[] = []): DeriveResult {
  const resolve = terminalResolver(placedIcs);
  const nets: INet[] = [];
  const connectionNet = new Map<IConnection, string>();

  const existingById = new Map(existing.map(n => [n.id, n] as [string, INet]));
  const priorByTerm = new Map<string, INet>();
  for (const c of connections) {
    const prior = c.netId ? existingById.get(c.netId) : undefined;
    if (prior) {
      priorByTerm.set(terminalKey(c.a), prior);
      priorByTerm.set(terminalKey(c.b), prior);
    }
  }

  let anon = 1;
  for (const comp of components(connections)) {
    const compSet = new Set(comp);
    const strongNames = new Set<string>();
    for (const tk of comp) {
      const name = nameFromLabel(resolve(tk));
      if (name) strongNames.add(name);
    }

    const prior = comp.map(t => priorByTerm.get(t)).find(Boolean);
    const id = prior?.id ?? crypto.randomUUID();
    // A node tying two canonical names together is a short — name it for the
    // conflict even if it was previously a clean, hand-named net.
    const derivedName = strongNames.size > 1
      ? [...strongNames].sort().join("/")
      : (prior?.name
        ?? (strongNames.size === 1 ? [...strongNames][0] : undefined)
        ?? `N$${anon++}`);

    let color = colorFor(nets.length);
    // GND / VCC get fixed, high-contrast colours against the green board.
    if (derivedName === "GND") color = "#cbd5e1";
    else if (derivedName === "VCC") color = "#ef4444";

    nets.push({ id, name: derivedName, color });

    for (const c of connections) {
      if (compSet.has(terminalKey(c.a)) || compSet.has(terminalKey(c.b))) connectionNet.set(c, id);
    }
  }

  return { nets, connectionNet };
}

/**
 * Every connection and terminal on the same electrical node as `terminal`,
 * found by flooding the connection list directly. Independent of any netId
 * assignment, so hover highlight works even on a freshly loaded project.
 */
export function netAtTerminal(terminal: ITerminal, connections: IConnection[]): { connections: Set<IConnection>; terminals: Set<string> } {
  const terms = new Set<string>([terminalKey(terminal)]);
  const inNet = new Set<IConnection>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of connections) {
      if (inNet.has(c)) continue;
      const a = terminalKey(c.a);
      const b = terminalKey(c.b);
      if (terms.has(a) || terms.has(b)) {
        inNet.add(c);
        terms.add(a);
        terms.add(b);
        grew = true;
      }
    }
  }
  return { connections: inNet, terminals: terms };
}

/** Sibling of `netAtTerminal` for component-side hover highlight starting from a hovered connection. */
export function netAtConnection(connection: IConnection, connections: IConnection[]) {
  return netAtTerminal(connection.a, connections);
}

/** Wires of a given net, plus the pads they touch — solder-side hover highlight. */
export function wiresOfNet(netId: string, lines: ILine[]): { lines: Set<ILine>; pads: Set<string> } {
  const inNet = new Set<ILine>();
  const pads = new Set<string>();
  for (const l of lines) {
    if (l.netId !== netId) continue;
    inNet.add(l);
    pads.add(dotKey(l.start));
    pads.add(dotKey(l.end));
  }
  return { lines: inNet, pads };
}
