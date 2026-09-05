import {Ic} from "./ic";

/** One row of the built-in component catalog — mirrors the `Ic` constructor's parameter list. */
interface IcCatalogEntry {
  widthPin: number;
  heightPin: number;
  /**
   * Either the plain `{pin: label}` map, or a shorthand string of
   * whitespace-separated `pin:label` pairs (e.g. `"1:GND 2:TRIG 3:OUT"`) —
   * see `parsePinDescription()`.
   */
  pinDescription: Record<number, string> | string;
  name: string;
  /** Free-text grouping surfaced by the Components sidebar's fuzzy search (e.g. "Microcontroller", "ADC", "Passive"). */
  category?: string;
  kind?: string;
  imageSrc?: string;
  imageScaleX?: number;
  imageScaleY?: number;
  imageOffsetX?: number;
  imageOffsetY?: number;
}

/** Expands the `"1:GND 2:TRIG ..."` shorthand into a `{pin: label}` map; passes a map through unchanged. */
function parsePinDescription(pins: Record<number, string> | string): Record<number, string> {
  if (typeof pins !== "string") return pins;
  const result: Record<number, string> = {};
  for (const pair of pins.trim().split(/\s+/).filter(Boolean)) {
    const [pin, label] = pair.split(":");
    result[Number(pin)] = (label ?? "").trim();
  }
  return result;
}

/**
 * The built-in component catalog. This is the array to edit when adding a new
 * part — one entry per component (see the `Ic` constructor in `ic.ts` for the
 * full parameter list: pin footprint, pin names, `kind` for vector-art parts,
 * or `imageSrc` + `imageScaleX/Y` + `imageOffsetX/Y` for artwork-backed parts
 * like breakout boards).
 */
const DEFAULT_ICS: IcCatalogEntry[] = [
  // Heads the catalog: the one-pin junction you place to connect to a bare
  // hole (a wire junction, test point, or off-board lead) — see
  // docs/logical-connections.md §2.
  {widthPin: 1, heightPin: 1, pinDescription: "1:", name: "Bridge", kind: "bridge", category: "Junction"},

  // Static 2-terminal parts. The actual value is entered by the user as a note.
  {widthPin: 3, heightPin: 1, pinDescription: "1: 2:", name: "Resistor", kind: "resistor", category: "Passive"},
  {widthPin: 2, heightPin: 1, pinDescription: "1: 2:", name: "Ceramic Capacitor", kind: "cap-ceramic", category: "Passive"},
  {widthPin: 2, heightPin: 1, pinDescription: "1:+ 2:-", name: "Electrolytic Capacitor", kind: "cap-electrolytic", category: "Passive"},

  // Dupont-style male pin headers: bare legs soldered into the perfboard to
  // take a female Dupont connector. Custom-rendered (see Ic.drawPinHeaderBody)
  // as a black base with a silver pin at every hole.
  {widthPin: 1, heightPin: 1, pinDescription: "1:", name: "Pin Header 1x1", kind: "pin-header", category: "Connector"},
  {widthPin: 2, heightPin: 1, pinDescription: "1: 2:", name: "Pin Header 1x2", kind: "pin-header", category: "Connector"},
  {widthPin: 3, heightPin: 1, pinDescription: "1: 2: 3:", name: "Pin Header 1x3", kind: "pin-header", category: "Connector"},
  {widthPin: 4, heightPin: 1, pinDescription: "1: 2: 3: 4:", name: "Pin Header 1x4", kind: "pin-header", category: "Connector"},
  {widthPin: 2, heightPin: 2, pinDescription: "1: 2: 3: 4:", name: "Pin Header 2x2", kind: "pin-header", category: "Connector"},
  {widthPin: 3, heightPin: 2, pinDescription: "1: 2: 3: 4: 5: 6:", name: "Pin Header 2x3", kind: "pin-header", category: "Connector"},

  // Seeed XIAO ESP32-C6: 7 pins per side, footprint 7 holes wide (only the
  // outer left/right columns are real pins — widthPin=7 just spaces them to
  // match the physical module width on the 0.1" grid).
  {
    widthPin: 7, heightPin: 7,
    pinDescription: "1:D0 2:D1 3:D2 4:D3 5:D4 6:D5 7:D6 8:D7 9:D8 10:D9 11:D10 12:3V3 13:GND 14:VBUS",
    name: "XIAO seeed ESP32-C6", kind: "chip", category: "Microcontroller",
    imageSrc: "components/seeed-esp32-c6.webp", imageScaleX: 1.15, imageScaleY: 1.45, imageOffsetX: 0.0, imageOffsetY: -17.0,
  },
  // NAU7802 breakout board: 6 pins in a single row (widthPin=6, heightPin=1
  // — see ic-geometry.ts's single-row layout).
  {
    widthPin: 6, heightPin: 1,
    pinDescription: "1:VIN 2:AV 3:GND 4:SCL 5:SDA 6:DRDY",
    name: "NAU7802", kind: "chip", category: "ADC",
    imageSrc: "components/nau7802.webp", imageScaleX: 1.9, imageScaleY: 58.0, imageOffsetX: 0.0, imageOffsetY: -178.0,
  },

  // A4988 stepper driver — pinout not filled in yet.
  {name: "A4988", category: "Motor Driver", widthPin: 6, heightPin: 8, pinDescription: "1:~ENABLE 2:MS1 3:MS2 4:MS3 5:RESET 6:SLEEP 7:STEP 8:DIRECTION 9:GND 10:VDD 11:1B 12:1A 13:2A 14:2B 15:GND_MOT 16:V_MOT", },
  {name: "MP1584", category:"Buck converter", widthPin:9, heightPin:7, pinDescription: "1:IN- 2: 7:IN+ 14:OUT- 8:OUT+"},

  {widthPin: 4, heightPin: 4, pinDescription: "1:GND 2:TRIG 3:OUT 4:RESET 5:CTRL 6:THRESH 7:DISCH 8:VCC", name: "NE555 Timer", category: "Timer IC"},
  {widthPin: 4, heightPin: 7, pinDescription: "1:1A 2:1B 3:1Y 4:2A 5:2B 6:2Y 7:GND 14:VCC", name: "DIP-14 Logic", category: "Logic IC"},
  {widthPin: 4, heightPin: 8, pinDescription: "1:EN 2:1D 3:1Q 4:2D 5:2Q 8:GND 16:VCC", name: "DIP-16 Logic", category: "Logic IC"},
  {widthPin: 4, heightPin: 14, pinDescription: "1:RESET 2:RX 3:TX 7:VCC 8:GND 22:GND 20:AVCC", name: "ATmega328P", category: "Microcontroller"},
];

/**
 * Re-run at startup and again after a project reset (`reset-project.ts`) to
 * restore the built-in catalog alongside any custom ICs saved in localStorage.
 */
export function loadDefaultIcs() {
  Ic.IC_CONTAINER = [];
  for (const entry of DEFAULT_ICS) {
    Ic.add(new Ic(
      entry.widthPin,
      entry.heightPin,
      parsePinDescription(entry.pinDescription),
      entry.name,
      entry.category ?? "Other",
      false,
      entry.kind ?? "chip",
      entry.imageSrc,
      entry.imageScaleX ?? 1,
      entry.imageScaleY ?? 1,
      entry.imageOffsetX ?? 0,
      entry.imageOffsetY ?? 0,
    ));
  }

  Ic.loadCustomIcsFromLocalStorage();
}
