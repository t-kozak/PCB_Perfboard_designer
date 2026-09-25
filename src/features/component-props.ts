import type {Ic} from "./ic";

/**
 * Per-kind component properties: the reference-designator prefix (R, C, U…)
 * and the typed `config` fields (resistance, capacitance, diode type…) the
 * properties popup offers for each kind. Values are free text so "10k",
 * "4.7kΩ" and "100nF" all work as typed; `options` turns a field into a
 * drop-down. Nothing here touches the DOM or the canvas.
 */
export interface PropField {
  key: string;
  label: string;
  placeholder?: string;
  /** When set, the field is a drop-down of these values (plus an empty "—"). */
  options?: string[];
}

const PART_NUMBER: PropField = {key: "partNumber", label: "Part number", placeholder: "e.g. LM358"};

const FIELDS: Record<string, PropField[]> = {
  "resistor": [
    {key: "resistance", label: "Resistance", placeholder: "e.g. 10kΩ"},
    {key: "tolerance", label: "Tolerance", options: ["0.1%", "1%", "2%", "5%", "10%"]},
    {key: "power", label: "Power", placeholder: "e.g. 0.25W"},
  ],
  "polyfuse": [
    {key: "holdCurrent", label: "Hold current", placeholder: "e.g. 500mA"},
    {key: "tripCurrent", label: "Trip current", placeholder: "e.g. 1A"},
    {key: "voltage", label: "Max voltage", placeholder: "e.g. 16V"},
  ],
  "cap-ceramic": [
    {key: "capacitance", label: "Capacitance", placeholder: "e.g. 100nF"},
    {key: "voltage", label: "Voltage", placeholder: "e.g. 50V"},
    {key: "dielectric", label: "Dielectric", options: ["C0G/NP0", "X7R", "X5R", "Y5V"]},
  ],
  "cap-electrolytic": [
    {key: "capacitance", label: "Capacitance", placeholder: "e.g. 100µF"},
    {key: "voltage", label: "Voltage", placeholder: "e.g. 25V"},
  ],
  "diode": [
    {key: "diodeType", label: "Type", options: ["Rectifier", "Signal", "Schottky", "Zener", "TVS"]},
    {key: "partNumber", label: "Part number", placeholder: "e.g. 1N4007"},
    {key: "zenerVoltage", label: "Zener voltage", placeholder: "e.g. 5.1V"},
  ],
  "led": [
    {key: "size", label: "Size", options: ["3mm", "5mm", "10mm"]},
    {key: "forwardVoltage", label: "Forward voltage", placeholder: "e.g. 2.0V"},
    {key: "current", label: "Current", placeholder: "e.g. 20mA"},
  ],
  "mosfet": [
    {key: "channel", label: "Channel", options: ["N-channel", "P-channel"]},
    {key: "partNumber", label: "Part number", placeholder: "e.g. IRLZ44N"},
  ],
  "pin-header": [
    {key: "function", label: "Function", placeholder: "e.g. UART, I²C, power in"},
  ],
  "bridge": [],
};

/** Config fields offered for a component, keyed off its `kind` (LED / MOSFET variants share one set). */
export function fieldsFor(ic: Ic): PropField[] {
  if (ic.kind.startsWith("led-")) return FIELDS["led"];
  if (ic.kind.startsWith("mosfet-")) return FIELDS["mosfet"];
  return FIELDS[ic.kind] ?? [PART_NUMBER];
}

/** Reference-designator prefix for a kind; "" for a bridge, which gets no label by default. */
export function designatorPrefix(ic: Ic): string {
  if (ic.isBridge) return "";
  if (ic.kind === "resistor") return "R";
  if (ic.kind === "polyfuse") return "F";
  if (ic.kind.startsWith("cap-")) return "C";
  if (ic.kind === "diode" || ic.kind.startsWith("led-")) return "D";
  if (ic.kind.startsWith("mosfet-")) return "Q";
  if (ic.kind === "pin-header") return "J";
  return "U";
}

/**
 * Gives `ic` the lowest free designator for its prefix (R1, R2… — a deleted
 * R1 is handed out again). Leaves an existing label, and a bridge, alone.
 */
export function assignDesignator(ic: Ic, placed: Ic[]): void {
  const prefix = designatorPrefix(ic);
  if (ic.label || !prefix) return;
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  const used = new Set<number>();
  for (const other of placed) {
    const m = other !== ic && other.label ? pattern.exec(other.label) : null;
    if (m) used.add(Number(m[1]));
  }
  let n = 1;
  while (used.has(n)) n++;
  ic.label = `${prefix}${n}`;
}

/** Labels every unlabelled component, in board order — used for saves made before designators existed. */
export function assignMissingDesignators(placed: Ic[]): void {
  for (const ic of placed) assignDesignator(ic, placed);
}
