import {State} from "../../state/State";
import {Utils} from "../../utils/utils";
import {Ic} from "../ic";
import {availableParts, partOf} from "../ic-catalog";
import {components} from "../../nets/derive";
import {terminalKey} from "../../interfaces/connection.interface";
import type {CatalogPart} from "../../catalog/parts";
import {BoardSnapshot, SnapshotComponent, snapshotToNetlist} from "../../kicad/export";
import {writeNetlist} from "../../kicad/netlist";
import {parametricPart} from "../../kicad/project";

/** Pad colour a fresh grid is created with (resize-grid.ts) — only other colours are saved. */
const DEFAULT_PAD_COLOR = "#a4a0a0";

const saveBtn = Utils.getSafeHtmlElement<HTMLButtonElement>('saveProjectBtn');
saveBtn.addEventListener('click', function() {
  const text = getSaveNetlist(new Date().toISOString());
  const url = URL.createObjectURL(new Blob([text], {type: "text/plain"}));
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", url);
  downloadAnchorNode.setAttribute("download", "perfboard_project.net");
  document.body.appendChild(downloadAnchorNode); // required for firefox
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
  URL.revokeObjectURL(url);
});

/** Hole index of a board coordinate (pads start at the label gutter + half a pitch). */
function holeIndex(v: number): number {
  return Math.round((v - State.gridGutter - State.dotSpace / 2) / State.dotSpace);
}

/** The board as plain data, for `snapshotToNetlist`. */
function snapshot(): BoardSnapshot {
  const known = new Map(availableParts().map(p => [p.id, p]));
  // Custom parts travel with the save (like they always have); built-ins always
  // come from the current catalog on load.
  const customParts = new Map<string, CatalogPart>();
  for (const ic of Ic.IC_CONTAINER) {
    if (ic.isCustom) customParts.set(partOf(ic).id, partOf(ic));
  }

  const placed: SnapshotComponent[] = [];
  for (const ic of State.placedIcs) {
    if (!ic.topLeftDot) continue;
    let part = ic.partId ? known.get(ic.partId) ?? parametricPart(ic.partId) : null;
    if (!part) {
      // No catalog entry any more (deleted custom part, or a pre-catalog-id
      // save): the component's own shape becomes a custom part in the file.
      part = partOf(ic);
      customParts.set(part.id, part);
    }
    placed.push({
      id: ic.id,
      label: ic.label,
      part,
      name: ic.name,
      pinDescription: ic.pinDescription,
      col: holeIndex(ic.topLeftDot.x),
      row: holeIndex(ic.topLeftDot.y),
      rotation: ic.rotationAngle,
      config: ic.config,
      note: ic.description,
    });
  }

  // Only given names are saved; a derived GND / N$3 is written as an unnamed
  // (KiCad `Net-(…)`) net and derived again on load.
  const netNameById = new Map(State.nets.filter(n => !n.auto).map(n => [n.id, n.name]));
  const netOfTerminal = new Map<string, string | undefined>();
  for (const c of State.connections) {
    netOfTerminal.set(terminalKey(c.a), c.netId);
    netOfTerminal.set(terminalKey(c.b), c.netId);
  }
  const nets = components(State.connections).map(keys => {
    const netId = keys.map(k => netOfTerminal.get(k)).find(Boolean);
    return {
      name: netId ? netNameById.get(netId) : undefined,
      legs: keys.map(k => {
        const hash = k.lastIndexOf("#");
        return {id: k.slice(0, hash), pin: Number(k.slice(hash + 1))};
      }),
    };
  });

  return {
    board: {
      cols: new Set(State.dots.map(d => d.x)).size,
      rows: new Set(State.dots.map(d => d.y)).size,
      colLabels: State.colLabelMode,
      rowLabels: State.rowLabelMode,
      rowsBottomUp: State.rowLabelsBottomUp,
      routing: State.routingMode,
    },
    pads: State.dots.flatMap(d => d.color && d.color.toLowerCase() !== DEFAULT_PAD_COLOR
      ? [{col: holeIndex(d.x), row: holeIndex(d.y), color: d.color}]
      : []),
    customParts: [...customParts.values()],
    components: placed,
    nets,
  };
}

/**
 * The whole project as a KiCad netlist (see src/kicad/netlist.ts). `date` is
 * left out of autosaves so an unchanged board serializes to identical text.
 */
export function getSaveNetlist(date?: string): string {
  return writeNetlist(snapshotToNetlist(snapshot()), {date});
}
