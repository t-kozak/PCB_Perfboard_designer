/**
 * The built-in component catalog as plain data — no DOM, no `Ic`, so the
 * project netlist reader (src/kicad/) and the LLM parts-library generator
 * (`pnpm parts-library`) can use it outside the browser. `ic-catalog.ts` turns
 * these into `Ic` templates for the Components sidebar.
 *
 * Every part carries a stable `id`. It is what a project file names in a
 * component's footprint (`Perfboard:<id>`), so once released an id must never
 * change — rename `name` freely instead.
 */

export interface CatalogPart {
  /** Stable, lowercase, kebab-case identity — `Perfboard:<id>` in a netlist. */
  id: string;
  name: string;
  /** Free-text grouping surfaced by the Components sidebar's fuzzy search (e.g. "Microcontroller", "ADC", "Passive"). */
  category: string;
  /** Visual family / pin model — see the `Ic` constructor and ic-geometry.ts. */
  kind: string;
  widthPin: number;
  heightPin: number;
  /** `{pin: label}`; a pin with no entry (or "") is unnamed. */
  pinDescription: Record<number, string>;
  imageSrc?: string;
  imageScaleX?: number;
  imageScaleY?: number;
  imageOffsetX?: number;
  imageOffsetY?: number;
}

/** One row of the catalog source below — `pinDescription` may use the `"1:GND 2:TRIG"` shorthand. */
type CatalogEntry = Omit<CatalogPart, "pinDescription" | "kind"> & {
  /**
   * Either the plain `{pin: label}` map, or a shorthand string of
   * whitespace-separated `pin:label` pairs (e.g. `"1:GND 2:TRIG 3:OUT"`) —
   * see `parsePinDescription()`.
   */
  pinDescription: Record<number, string> | string;
  kind?: string;
};

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * MOSFET body art. Both variants share the same 1-column, 3-pin (Gate/Drain/
 * Source) footprint — only the icon differs, sized well past the pin span via
 * imageScaleX/Y (see the catalog entries below). "Standing" = a TO-92-style
 * part mounted upright (black body, flat cut face), icon ~1 dot wide x 4 long,
 * running lengthwise along the pin column like the pins are just holes in it.
 * "Flat" = a TO-220-style part lying flat: legs bend out from the edge of the
 * black body and down into the board, so unlike Standing the icon runs
 * *across* the pin column (rotated 90°) — black body's outer edge sits right
 * on the pins (imageOffsetX shifts the whole icon left by half its length so
 * that edge, not the icon's center, lands at the pin column), with the grey
 * mounting tab + screw hole extending away to the left.
 */
const MOSFET_STANDING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="200" viewBox="0 0 50 200">
  <rect x="2" y="2" width="46" height="196" rx="6" fill="#111111" stroke="#3a3a3a" stroke-width="2"/>
  <rect x="27" y="2" width="21" height="196" fill="#8a8a8a"/>
</svg>`;

const MOSFET_FLAT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150" viewBox="0 0 300 150">
  <rect x="4" y="8" width="130" height="134" fill="#9a9a9a" stroke="#5a5a5a" stroke-width="3"/>
  <circle cx="69" cy="75" r="20" fill="#161616" stroke="#4a4a4a" stroke-width="3"/>
  <rect x="142" y="4" width="154" height="142" rx="8" fill="#111111" stroke="#3a3a3a" stroke-width="3"/>
</svg>`;

/** Expands the `"1:GND 2:TRIG ..."` shorthand into a `{pin: label}` map; passes a map through unchanged. */
export function parsePinDescription(pins: Record<number, string> | string): Record<number, string> {
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
 * like breakout boards). Its typed properties come from `kind` — see
 * component-props.ts.
 */
const ENTRIES: CatalogEntry[] = [
  // Heads the catalog: the one-pin junction you place to connect to a bare
  // hole (a wire junction, test point, or off-board lead) — see
  // docs/logical-connections.md §2.
  {id: "bridge", widthPin: 1, heightPin: 1, pinDescription: "1:", name: "Bridge", kind: "bridge", category: "Junction"},

  // Static 2-terminal parts. The value goes into the part's typed properties.
  {id: "resistor", widthPin: 4, heightPin: 1, pinDescription: "1: 2:", name: "Resistor", kind: "resistor", category: "Passive"},
  {id: "polyfuse", widthPin: 4, heightPin: 1, pinDescription: "1: 2:", name: "Polyfuse", kind: "polyfuse", category: "Passive"},
  {id: "cap-ceramic", widthPin: 2, heightPin: 1, pinDescription: "1: 2:", name: "Ceramic Capacitor", kind: "cap-ceramic", category: "Passive"},
  {id: "cap-electrolytic", widthPin: 2, heightPin: 1, pinDescription: "1:+ 2:-", name: "Electrolytic Capacitor", kind: "cap-electrolytic", category: "Passive"},

  // Generic axial diode (1N4007, 1N4148, Schottky, Zener...).
  // Pin 1 = anode, pin 2 = cathode (the grey-banded end).
  {id: "diode", widthPin: 3, heightPin: 1, pinDescription: "1:A 2:K", name: "Diode", kind: "diode", category: "Passive"},

  // LEDs: 2-hole 2-terminal footprint (a diode's actual lead spacing), one variant per colour.
  {id: "led-red", widthPin: 2, heightPin: 1, pinDescription: "1:A 2:K", name: "LED (Red)", kind: "led-red", category: "Passive"},
  {id: "led-green", widthPin: 2, heightPin: 1, pinDescription: "1:A 2:K", name: "LED (Green)", kind: "led-green", category: "Passive"},
  {id: "led-blue", widthPin: 2, heightPin: 1, pinDescription: "1:A 2:K", name: "LED (Blue)", kind: "led-blue", category: "Passive"},

  // MOSFETs (general category — exact part goes in the properties, like Resistor/Capacitor above).
  // Both variants are a single column of 3 pins (Gate, Drain, Source); only
  // the body art differs in size — the icon spans further than the actual
  // pin footprint (widthPin=1 keeps spanW at 0, so imageScaleX/Y do all the
  // work), same trick as the zero-width single-row breakout boards.
  {
    id: "mosfet-standing", widthPin: 1, heightPin: 3, pinDescription: "1:G 2:D 3:S", name: "MOSFET (Standing)",
    category: "Transistor", kind: "mosfet-standing",
    imageSrc: svgDataUri(MOSFET_STANDING_SVG), imageScaleX: 5, imageScaleY: 1.85,
  },
  {
    id: "mosfet-flat", widthPin: 1, heightPin: 3, pinDescription: "1:G 2:D 3:S", name: "MOSFET (Flat)",
    category: "Transistor", kind: "mosfet-flat",
    imageSrc: svgDataUri(MOSFET_FLAT_SVG), imageScaleX: 43.75, imageScaleY: 1.85, imageOffsetX: -175,
  },

  // Dupont-style male pin headers: bare legs soldered into the perfboard to
  // take a female Dupont connector. Custom-rendered (see Ic.drawPinHeaderBody)
  // as a black base with a silver pin at every hole. Ids read rows x columns;
  // any other size is available as a parametric `pin-header-RxC` (see
  // src/kicad/resolve.ts).
  {id: "pin-header-1x1", widthPin: 1, heightPin: 1, pinDescription: "1:", name: "Pin Header 1x1", kind: "pin-header", category: "Connector"},
  {id: "pin-header-1x2", widthPin: 2, heightPin: 1, pinDescription: "1: 2:", name: "Pin Header 1x2", kind: "pin-header", category: "Connector"},
  {id: "pin-header-1x3", widthPin: 3, heightPin: 1, pinDescription: "1: 2: 3:", name: "Pin Header 1x3", kind: "pin-header", category: "Connector"},
  {id: "pin-header-1x4", widthPin: 4, heightPin: 1, pinDescription: "1: 2: 3: 4:", name: "Pin Header 1x4", kind: "pin-header", category: "Connector"},
  {id: "pin-header-2x2", widthPin: 2, heightPin: 2, pinDescription: "1: 2: 3: 4:", name: "Pin Header 2x2", kind: "pin-header", category: "Connector"},
  {id: "pin-header-2x3", widthPin: 3, heightPin: 2, pinDescription: "1: 2: 3: 4: 5: 6:", name: "Pin Header 2x3", kind: "pin-header", category: "Connector"},

  // Tactile push button: 2x3-hole footprint, a leg in each of the four corners
  // (pins 1-4 run down the left side, up the right — see ic-geometry.ts's
  // corner layout). The housing is drawn as a square on the 3-hole short side,
  // with the legs sticking out past it lengthwise. Custom-rendered: see Ic.drawButtonBody.
  {id: "push-button", widthPin: 3, heightPin: 4, pinDescription: "1: 2: 3: 4:", name: "Push Button", kind: "button", category: "Switch"},

  // Seeed XIAO ESP32-C6: 7 pins per side, footprint 7 holes wide (only the
  // outer left/right columns are real pins — widthPin=7 just spaces them to
  // match the physical module width on the 0.1" grid).
  {
    id: "xiao-esp32c6", widthPin: 7, heightPin: 7,
    pinDescription: "1:D0 2:D1 3:D2 4:D3 5:D4 6:D5 7:D6 8:D7 9:D8 10:D9 11:D10 12:3V3 13:GND 14:VBUS",
    name: "XIAO seeed ESP32-C6", kind: "chip", category: "Microcontroller",
    imageSrc: "components/seeed-esp32-c6.webp", imageScaleX: 1.15, imageScaleY: 1.45, imageOffsetX: 0.0, imageOffsetY: -17.0,
  },
  // NAU7802 breakout board: 6 pins in a single row (widthPin=6, heightPin=1
  // — see ic-geometry.ts's single-row layout).
  {
    id: "nau7802", widthPin: 6, heightPin: 1,
    pinDescription: "1:VIN 2:AV 3:GND 4:SCL 5:SDA 6:DRDY",
    name: "NAU7802", kind: "chip", category: "ADC",
    imageSrc: "components/nau7802.webp", imageScaleX: 1.9, imageScaleY: 58.0, imageOffsetX: 0.0, imageOffsetY: -178.0,
  },

  // A4988 - stepper driver
  {id: "a4988", name: "A4988", category: "Motor Driver", widthPin: 6, heightPin: 8, pinDescription: "1:~ENABLE 2:MS1 3:MS2 4:MS3 5:RESET 6:SLEEP 7:STEP 8:DIRECTION 9:GND 10:VDD 11:1B 12:1A 13:2A 14:2B 15:GND_MOT 16:V_MOT"},

  // MP1584 - buck converter
  {id: "mp1584", name: "MP1584", category: "Buck converter", widthPin: 9, heightPin: 7, pinDescription: "1:IN- 2: 7:IN+ 14:OUT- 8:OUT+"},

  {id: "ne555", widthPin: 4, heightPin: 4, pinDescription: "1:GND 2:TRIG 3:OUT 4:RESET 5:CTRL 6:THRESH 7:DISCH 8:VCC", name: "NE555 Timer", category: "Timer IC"},
  {id: "dip14-logic", widthPin: 4, heightPin: 7, pinDescription: "1:1A 2:1B 3:1Y 4:2A 5:2B 6:2Y 7:GND 14:VCC", name: "DIP-14 Logic", category: "Logic IC"},
  // CD4013BE - dual D-type flip-flop, 14-pin DIP (2x7 legs). widthPin=4 is a
  // placeholder body width, same convention as the other DIP-14 parts above —
  // tune once the real chip's footprint is measured.
  {
    id: "cd4013be", widthPin: 4, heightPin: 7,
    pinDescription: "1:1Q 2:1Q# 3:1CLK 4:1RESET 5:1D 6:1SET 7:GND 8:2SET 9:2D 10:2RESET 11:2CLK 12:2Q# 13:2Q 14:VCC",
    name: "CD4013BE", category: "Flip-Flop",
  },
  {id: "dip16-logic", widthPin: 4, heightPin: 8, pinDescription: "1:EN 2:1D 3:1Q 4:2D 5:2Q 8:GND 16:VCC", name: "DIP-16 Logic", category: "Logic IC"},
  {id: "atmega328p", widthPin: 4, heightPin: 14, pinDescription: "1:RESET 2:RX 3:TX 7:VCC 8:GND 22:GND 20:AVCC", name: "ATmega328P", category: "Microcontroller"},
];

export const CATALOG_PARTS: CatalogPart[] = ENTRIES.map(entry => ({
  ...entry,
  kind: entry.kind ?? "chip",
  pinDescription: parsePinDescription(entry.pinDescription),
}));
