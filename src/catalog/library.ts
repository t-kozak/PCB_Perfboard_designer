/**
 * The parts library handed to an LLM (or a person) writing a netlist for this
 * app: how to write the file, then every part with its id, pins and typed
 * properties. Pure — rendered in-app by the "Parts Library" button (built-ins
 * + the user's custom parts) and into docs/parts-library.md by
 * `pnpm parts-library` (built-ins only).
 */
import type {CatalogPart} from "./parts";
import {designatorPrefixForKind, fieldsForKind} from "../features/component-props";
import {pinCountOf} from "../features/ic-geometry";

// A complete, electrically sensible circuit — an LLM will copy its shape.
const EXAMPLE = `(export (version "E")
  (components
    (comp (ref "J1") (value "Pin Header 1x2") (footprint "Perfboard:pin-header-1x2")
      (property (name "function") (value "5V power in")))
    (comp (ref "R1") (value "330") (footprint "Perfboard:resistor")
      (property (name "power") (value "0.25W")))
    (comp (ref "D1") (value "LED (Red)") (footprint "Perfboard:led-red"))
    (comp (ref "C1") (value "100nF") (footprint "Perfboard:cap-ceramic")
      (property (name "dielectric") (value "X7R"))
      (property (name "perfboard:note") (value "Decoupling, keep close to J1")))
  )
  (nets
    (net (code "1") (name "VCC")
      (node (ref "J1") (pin "1"))
      (node (ref "R1") (pin "1"))
      (node (ref "C1") (pin "1")))
    (net (code "2") (name "LED_A")
      (node (ref "R1") (pin "2"))
      (node (ref "D1") (pin "1") (pinfunction "A")))
    (net (code "3") (name "GND")
      (node (ref "D1") (pin "2") (pinfunction "K"))
      (node (ref "C1") (pin "2"))
      (node (ref "J1") (pin "2")))
  ))`;

/** How the pins of a part sit on the board, in words — the numbers alone don't say. */
function pinLayout(p: CatalogPart): string {
  const n = pinCountOf({...p, rotationAngle: 0});
  if (p.kind === "bridge") return "1 pin — a single hole";
  if (p.kind === "pin-header") return `${p.heightPin} x ${p.widthPin} grid, numbered row by row, left to right`;
  if (p.kind === "button") return "4 legs, one in each corner: 1 top-left, 2 bottom-left, 3 bottom-right, 4 top-right";
  if (n === 2) return "2 leads, one at each end";
  if (p.widthPin === 1 || p.heightPin === 1) return `${n} pins in a single row`;
  return `DIP layout — pins 1–${n / 2} down the left side, ${n / 2 + 1}–${n} up the right side`;
}

function partSection(p: CatalogPart): string {
  const count = pinCountOf({...p, rotationAngle: 0});
  const pins = Array.from({length: count}, (_, i) => {
    const label = p.pinDescription[i + 1];
    return label ? `${i + 1} \`${label}\`` : `${i + 1}`;
  }).join(" · ");
  const fields = fieldsForKind(p.kind);
  const prefix = designatorPrefixForKind(p.kind);

  const lines = [
    `### \`${p.id}\` — ${p.name}`,
    "",
    `- Category: ${p.category}${prefix ? ` · Designator: ${prefix}1, ${prefix}2…` : " · Designator: none needed (use BR1, BR2…)"}`,
    `- Footprint: ${p.widthPin} x ${p.heightPin} holes; ${pinLayout(p)}`,
    `- Pins: ${pins}`,
  ];
  if (fields.length) {
    lines.push("- Properties:");
    for (const f of fields) {
      const how = f.options ? `one of ${f.options.map(o => `\`${o}\``).join(", ")}` : (f.placeholder ?? "free text");
      lines.push(`  - \`${f.key}\`${f.value ? " — **the value** (goes in `value`)" : ""} — ${f.label}: ${how}`);
    }
  } else {
    lines.push("- Properties: none");
  }
  if (!fields.some(f => f.value)) lines.push(`- Value: the part name ("${p.name}")`);
  return lines.join("\n");
}

export function partsLibraryMarkdown(parts: CatalogPart[]): string {
  const table = [
    "| id | name | category | pins | value property |",
    "| :--- | :--- | :--- | ---: | :--- |",
    ...parts.map(p => {
      const valueField = fieldsForKind(p.kind).find(f => f.value);
      return `| \`${p.id}\` | ${p.name} | ${p.category} | ${pinCountOf({...p, rotationAngle: 0})} | ${valueField ? `\`${valueField.key}\`` : "—"} |`;
    }),
  ].join("\n");

  return `# PCB Perfboard Designer — parts library

PCB Perfboard Designer saves and loads projects as **KiCad netlists** (S-expression
\`.net\` files). To design a circuit for it, write a netlist that uses only the parts
below, and open it with **Project → Import**. Components are placed on the board
automatically, and the solder-side wires are generated from the nets.

## Writing the netlist

\`\`\`lisp
${EXAMPLE}
\`\`\`

Rules:

1. **One \`comp\` per physical part.** \`ref\` is a unique designator (R1, C2, U1…; the
   prefix for each part is listed below). \`footprint\` must be \`Perfboard:<id>\`, using an
   id from this library, exactly as written.
2. **\`value\`** fills the part's value property: resistance for a resistor, capacitance for a
   capacitor, part number for a chip or diode (marked "**the value**" below). For a part
   without one, write its name.
3. **Other properties** go in \`(property (name "<key>") (value "<text>"))\`, using the keys
   listed for the part. A property with fixed options accepts only those options. Anything
   else is kept as a note on the component; \`(property (name "perfboard:note") (value "…"))\`
   is the note itself.
4. **One \`net\` per electrical node**, listing every pin on it as
   \`(node (ref "<ref>") (pin "<number>"))\`. Pin numbers are **this library's** numbers
   (they don't always match KiCad's symbols; for diodes and LEDs pin 1 is the **anode**
   here). \`(pinfunction "<pin name>")\` is optional; when it names exactly one pin of
   the part, that pin is used, whatever the number says.
5. A pin belongs to at most one net. A net with a single pin is ignored. \`code\` just
   numbers the nets; \`name\` is free (GND, VCC, …).
6. Don't add positions or wires. Layout and routing happen in the app. Instead, help the
   layout by **grouping** parts that belong together (a power input, one channel, a chip
   with its decoupling caps and pull-ups): put each group on its own KiCad sheet with
   \`(sheetpath (names "/<group>/") (tstamps "/<group>/"))\` in the \`comp\`, or add
   \`(property (name "perfboard:group") (value "<group>"))\`. Parts of a group are placed
   together, close to the pins they connect to; repeated groups (CH1, CH2…) usually come out
   identical. Optionally:
   - \`(property (name "perfboard:edge") (value "left"))\` (\`left\`, \`right\`, \`top\`,
     \`bottom\`) keeps a part, usually a connector, on that side of its group and its group
     on that side of the board;
   - a \`floorplan\` after \`nets\` arranges the groups in rows, top to bottom:
     \`(perfboard (floorplan (row "PWR" "LOGIC") (row "CH1" "CH2" "CH3" "CH4")))\`.
     Groups it doesn't name are placed where they need the least wire.
7. To join wires where there's no component leg (a junction, test point or off-board wire),
   place a \`bridge\` and connect its pin 1.
8. **Parts not in the library:** use a generic footprint and put the real part number in
   \`value\`:
   - \`Perfboard:dip-N\`: a DIP chip with N pins (N even, ≥ 4), pins 1…N/2 down the left
     side and N/2+1…N up the right, like a real DIP.
   - \`Perfboard:sip-N\`: a single row of N pins (modules, breakout boards).
   - \`Perfboard:pin-header-RxC\`: a pin header with R rows × C columns, numbered row by
     row, left to right.

   Name their pins with \`(property (name "perfboard:pins") (value "1:VCC 2:GND 3:OUT"))\`.

## Parts

${table}

${parts.map(partSection).join("\n\n")}
`;
}
