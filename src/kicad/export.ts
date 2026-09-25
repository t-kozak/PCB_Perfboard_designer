/**
 * Board snapshot → project netlist (see netlist.ts for the format). Pure — the
 * snapshot is collected from `State` by features/project/save-project.ts.
 */
import type {CatalogPart} from "../catalog/parts";
import {designatorPrefixForKind, valueFieldForKind} from "../features/component-props";
import {Netlist, NetlistComponent, NetlistNet, PerfboardBlock, PROP_AT, PROP_NOTE, PROP_PINS} from "./netlist";

export interface SnapshotComponent {
  /** Unique key the nets refer to (the placed `Ic.id`). */
  id: string;
  label?: string;
  /** The part this component was made from — its footprint and baseline pin names. */
  part: CatalogPart;
  name: string;
  pinDescription: Record<number, string>;
  col: number;
  row: number;
  rotation: number;
  config: Record<string, string>;
  note?: string;
}

export interface BoardSnapshot {
  board: NonNullable<PerfboardBlock["board"]>;
  pads: PerfboardBlock["pads"];
  customParts: CatalogPart[];
  components: SnapshotComponent[];
  /** Electrical nets: each a list of `{id, pin}` legs, plus the derived net name. */
  nets: {name?: string; legs: {id: string; pin: number}[]}[];
}

/**
 * Netlist references must be unique and non-empty, but a board's labels need
 * not be: a bridge has none, and two parts may share one. Keeps every usable
 * label and numbers the rest after their kind's prefix (bridges `BRn`).
 */
function assignRefs(components: SnapshotComponent[]): Map<string, string> {
  const refs = new Map<string, string>();
  const taken = new Set<string>();
  const pending: SnapshotComponent[] = [];
  for (const c of components) {
    const label = c.label?.trim().replace(/\s+/g, "_");
    if (label && !taken.has(label)) {
      refs.set(c.id, label);
      taken.add(label);
    } else {
      pending.push(c);
    }
  }
  for (const c of pending) {
    const prefix = designatorPrefixForKind(c.part.kind) || "BR";
    let n = 1;
    while (taken.has(`${prefix}${n}`)) n++;
    refs.set(c.id, `${prefix}${n}`);
    taken.add(`${prefix}${n}`);
  }
  return refs;
}

/** The `"1:GND 2:TRIG"` shorthand of the named pins, or "" when none are named. */
function pinShorthand(pins: Record<number, string>): string {
  return Object.entries(pins)
    .filter(([, label]) => label)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([n, label]) => `${n}:${label.replace(/\s+/g, "_")}`)
    .join(" ");
}

export function snapshotToNetlist(s: BoardSnapshot): Netlist {
  const refs = assignRefs(s.components);
  const byId = new Map(s.components.map(c => [c.id, c]));

  const components: NetlistComponent[] = s.components.map(c => {
    const valueField = valueFieldForKind(c.part.kind);
    const properties: Record<string, string> = {};
    for (const [key, v] of Object.entries(c.config)) {
      if (v && key !== valueField?.key) properties[key] = v;
    }
    properties[PROP_AT] = `${c.col} ${c.row} ${c.rotation}`;
    if (c.note) properties[PROP_NOTE] = c.note;
    const pins = pinShorthand(c.pinDescription);
    if (pins !== pinShorthand(c.part.pinDescription)) properties[PROP_PINS] = pins;
    return {
      ref: refs.get(c.id)!,
      value: (valueField && c.config[valueField.key]) || c.name,
      footprint: `Perfboard:${c.part.id}`,
      properties,
    };
  });

  const nets: NetlistNet[] = s.nets
    .map(net => {
      const nodes = net.legs
        .filter(l => byId.has(l.id))
        .map(l => {
          const label = byId.get(l.id)!.pinDescription[l.pin];
          return {ref: refs.get(l.id)!, pin: String(l.pin), pinfunction: label || undefined};
        })
        .sort((a, b) => a.ref.localeCompare(b.ref, undefined, {numeric: true}) || Number(a.pin) - Number(b.pin));
      const first = nodes[0];
      return {name: net.name || (first ? `Net-(${first.ref}-Pad${first.pin})` : ""), nodes};
    })
    .filter(net => net.nodes.length > 1);

  // Derived names can repeat (two unjoined groups of GND pins); a netlist's must not.
  const used = new Set<string>();
  for (const net of nets) {
    let name = net.name;
    for (let i = 2; used.has(name); i++) name = `${net.name}_${i}`;
    net.name = name;
    used.add(name);
  }

  return {
    components,
    nets,
    libparts: new Map(),
    perfboard: {board: s.board, pads: s.pads, customParts: s.customParts},
  };
}
