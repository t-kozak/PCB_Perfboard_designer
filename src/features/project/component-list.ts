import {State} from "../../state/State";
import {fieldsFor} from "../component-props";
import {dotCoordinateLabel} from "../grid-labels";

/** One placed component as a row of the exported component list. */
export interface ComponentRow {
  ref: string;
  name: string;
  /** "Label: value" pairs, in the kind's field order; unknown config keys follow. */
  properties: [string, string][];
  /** Hole of pin 1 ("B4"), if on the board. */
  location: string;
  notes: string;
}

/** One line of the bill of materials: identical parts (same name and properties) counted together. */
export interface BomRow {
  quantity: number;
  name: string;
  properties: [string, string][];
  /** Designators per board, in board order; boards without this part are left out. */
  refs: {board: string; refs: string[]}[];
}

const byRef = (a: string, b: string) => a.localeCompare(b, undefined, {numeric: true});

/**
 * Every placed component of the open board except bridges (bare junctions,
 * not parts), sorted by reference designator (R2 before R10).
 */
export function componentRows(): ComponentRow[] {
  return State.placedIcs
    .filter(ic => !ic.isBridge)
    .map(ic => {
      const fields = fieldsFor(ic);
      const properties: [string, string][] = [];
      for (const f of fields) {
        const v = ic.config[f.key]?.trim();
        if (v) properties.push([f.label, v]);
      }
      for (const [key, v] of Object.entries(ic.config)) {
        if (v?.trim() && !fields.some(f => f.key === key)) properties.push([key, v.trim()]);
      }
      const pin1 = ic.pinDot(1);
      return {
        ref: ic.label ?? "",
        name: ic.name,
        properties,
        location: (pin1 && dotCoordinateLabel(pin1)) ?? "",
        notes: ic.description?.trim() ?? "",
      };
    })
    .sort((a, b) => byRef(a.ref, b.ref) || a.name.localeCompare(b.name));
}

/**
 * The bill of materials over several boards: components with the same name
 * and properties become one row, sorted by name, then properties. Pure.
 */
export function billOfMaterials(boards: {name: string; rows: ComponentRow[]}[]): BomRow[] {
  const groups = new Map<string, BomRow>();
  for (const board of boards) {
    for (const row of board.rows) {
      const key = JSON.stringify([row.name, row.properties]);
      let group = groups.get(key);
      if (!group) {
        group = {quantity: 0, name: row.name, properties: row.properties, refs: []};
        groups.set(key, group);
      }
      group.quantity++;
      let onBoard = group.refs.find(r => r.board === board.name);
      if (!onBoard) group.refs.push(onBoard = {board: board.name, refs: []});
      if (row.ref) onBoard.refs.push(row.ref);
    }
  }
  const propText = (r: BomRow) => r.properties.map(([k, v]) => `${k}: ${v}`).join("\n");
  const rows = [...groups.values()];
  for (const r of rows) for (const b of r.refs) b.refs.sort(byRef);
  return rows.sort((a, b) => a.name.localeCompare(b.name) || byRef(propText(a), propText(b)));
}
