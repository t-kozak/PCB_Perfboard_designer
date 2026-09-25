# PCB Perfboard Designer — parts library

PCB Perfboard Designer saves and loads projects as **KiCad netlists** (S-expression
`.net` files). To design a circuit for it, write a netlist that uses only the parts
below, and open it with **Project → Load Project**. Components are placed on the board
automatically, and the solder-side wires are generated from the nets.

## Writing the netlist

```lisp
(export (version "E")
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
  ))
```

Rules:

1. **One `comp` per physical part.** `ref` is a unique designator (R1, C2, U1…; the
   prefix for each part is listed below). `footprint` must be `Perfboard:<id>`, using an
   id from this library, exactly as written.
2. **`value`** fills the part's value property: resistance for a resistor, capacitance for a
   capacitor, part number for a chip or diode (marked "**the value**" below). For a part
   without one, write its name.
3. **Other properties** go in `(property (name "<key>") (value "<text>"))`, using the keys
   listed for the part. A property with fixed options accepts only those options. Anything
   else is kept as a note on the component; `(property (name "perfboard:note") (value "…"))`
   is the note itself.
4. **One `net` per electrical node**, listing every pin on it as
   `(node (ref "<ref>") (pin "<number>"))`. Pin numbers are **this library's** numbers
   (they don't always match KiCad's symbols; for diodes and LEDs pin 1 is the **anode**
   here). `(pinfunction "<pin name>")` is optional; when it names exactly one pin of
   the part, that pin is used, whatever the number says.
5. A pin belongs to at most one net. A net with a single pin is ignored. `code` just
   numbers the nets; `name` is free (GND, VCC, …).
6. Don't add positions or wires. Layout and routing happen in the app.
7. To join wires where there's no component leg (a junction, test point or off-board wire),
   place a `bridge` and connect its pin 1.
8. **Parts not in the library:** use a generic footprint and put the real part number in
   `value`:
   - `Perfboard:dip-N`: a DIP chip with N pins (N even, ≥ 4), pins 1…N/2 down the left
     side and N/2+1…N up the right, like a real DIP.
   - `Perfboard:sip-N`: a single row of N pins (modules, breakout boards).
   - `Perfboard:pin-header-RxC`: a pin header with R rows × C columns, numbered row by
     row, left to right.

   Name their pins with `(property (name "perfboard:pins") (value "1:VCC 2:GND 3:OUT"))`.

## Parts

| id | name | category | pins | value property |
| :--- | :--- | :--- | ---: | :--- |
| `bridge` | Bridge | Junction | 1 | — |
| `resistor` | Resistor | Passive | 2 | `resistance` |
| `polyfuse` | Polyfuse | Passive | 2 | `holdCurrent` |
| `cap-ceramic` | Ceramic Capacitor | Passive | 2 | `capacitance` |
| `cap-electrolytic` | Electrolytic Capacitor | Passive | 2 | `capacitance` |
| `diode` | Diode | Passive | 2 | `partNumber` |
| `led-red` | LED (Red) | Passive | 2 | — |
| `led-green` | LED (Green) | Passive | 2 | — |
| `led-blue` | LED (Blue) | Passive | 2 | — |
| `mosfet-standing` | MOSFET (Standing) | Transistor | 3 | `partNumber` |
| `mosfet-flat` | MOSFET (Flat) | Transistor | 3 | `partNumber` |
| `pin-header-1x1` | Pin Header 1x1 | Connector | 1 | — |
| `pin-header-1x2` | Pin Header 1x2 | Connector | 2 | — |
| `pin-header-1x3` | Pin Header 1x3 | Connector | 3 | — |
| `pin-header-1x4` | Pin Header 1x4 | Connector | 4 | — |
| `pin-header-2x2` | Pin Header 2x2 | Connector | 4 | — |
| `pin-header-2x3` | Pin Header 2x3 | Connector | 6 | — |
| `push-button` | Push Button | Switch | 4 | `partNumber` |
| `xiao-esp32c6` | XIAO seeed ESP32-C6 | Microcontroller | 14 | `partNumber` |
| `nau7802` | NAU7802 | ADC | 6 | `partNumber` |
| `a4988` | A4988 | Motor Driver | 16 | `partNumber` |
| `mp1584` | MP1584 | Buck converter | 14 | `partNumber` |
| `ne555` | NE555 Timer | Timer IC | 8 | `partNumber` |
| `dip14-logic` | DIP-14 Logic | Logic IC | 14 | `partNumber` |
| `cd4013be` | CD4013BE | Flip-Flop | 14 | `partNumber` |
| `dip16-logic` | DIP-16 Logic | Logic IC | 16 | `partNumber` |
| `atmega328p` | ATmega328P | Microcontroller | 28 | `partNumber` |

### `bridge` — Bridge

- Category: Junction · Designator: none needed (use BR1, BR2…)
- Footprint: 1 x 1 holes; 1 pin — a single hole
- Pins: 1
- Properties: none
- Value: the part name ("Bridge")

### `resistor` — Resistor

- Category: Passive · Designator: R1, R2…
- Footprint: 4 x 1 holes; 2 leads, one at each end
- Pins: 1 · 2
- Properties:
  - `resistance` — **the value** (goes in `value`) — Resistance: e.g. 10kΩ
  - `tolerance` — Tolerance: one of `0.1%`, `1%`, `2%`, `5%`, `10%`
  - `power` — Power: e.g. 0.25W

### `polyfuse` — Polyfuse

- Category: Passive · Designator: F1, F2…
- Footprint: 4 x 1 holes; 2 leads, one at each end
- Pins: 1 · 2
- Properties:
  - `holdCurrent` — **the value** (goes in `value`) — Hold current: e.g. 500mA
  - `tripCurrent` — Trip current: e.g. 1A
  - `voltage` — Max voltage: e.g. 16V

### `cap-ceramic` — Ceramic Capacitor

- Category: Passive · Designator: C1, C2…
- Footprint: 2 x 1 holes; 2 leads, one at each end
- Pins: 1 · 2
- Properties:
  - `capacitance` — **the value** (goes in `value`) — Capacitance: e.g. 100nF
  - `voltage` — Voltage: e.g. 50V
  - `dielectric` — Dielectric: one of `C0G/NP0`, `X7R`, `X5R`, `Y5V`

### `cap-electrolytic` — Electrolytic Capacitor

- Category: Passive · Designator: C1, C2…
- Footprint: 2 x 1 holes; 2 leads, one at each end
- Pins: 1 `+` · 2 `-`
- Properties:
  - `capacitance` — **the value** (goes in `value`) — Capacitance: e.g. 100µF
  - `voltage` — Voltage: e.g. 25V

### `diode` — Diode

- Category: Passive · Designator: D1, D2…
- Footprint: 3 x 1 holes; 2 leads, one at each end
- Pins: 1 `A` · 2 `K`
- Properties:
  - `diodeType` — Type: one of `Rectifier`, `Signal`, `Schottky`, `Zener`, `TVS`
  - `partNumber` — **the value** (goes in `value`) — Part number: e.g. 1N4007
  - `zenerVoltage` — Zener voltage: e.g. 5.1V

### `led-red` — LED (Red)

- Category: Passive · Designator: D1, D2…
- Footprint: 2 x 1 holes; 2 leads, one at each end
- Pins: 1 `A` · 2 `K`
- Properties:
  - `size` — Size: one of `3mm`, `5mm`, `10mm`
  - `forwardVoltage` — Forward voltage: e.g. 2.0V
  - `current` — Current: e.g. 20mA
- Value: the part name ("LED (Red)")

### `led-green` — LED (Green)

- Category: Passive · Designator: D1, D2…
- Footprint: 2 x 1 holes; 2 leads, one at each end
- Pins: 1 `A` · 2 `K`
- Properties:
  - `size` — Size: one of `3mm`, `5mm`, `10mm`
  - `forwardVoltage` — Forward voltage: e.g. 2.0V
  - `current` — Current: e.g. 20mA
- Value: the part name ("LED (Green)")

### `led-blue` — LED (Blue)

- Category: Passive · Designator: D1, D2…
- Footprint: 2 x 1 holes; 2 leads, one at each end
- Pins: 1 `A` · 2 `K`
- Properties:
  - `size` — Size: one of `3mm`, `5mm`, `10mm`
  - `forwardVoltage` — Forward voltage: e.g. 2.0V
  - `current` — Current: e.g. 20mA
- Value: the part name ("LED (Blue)")

### `mosfet-standing` — MOSFET (Standing)

- Category: Transistor · Designator: Q1, Q2…
- Footprint: 1 x 3 holes; 3 pins in a single row
- Pins: 1 `G` · 2 `D` · 3 `S`
- Properties:
  - `channel` — Channel: one of `N-channel`, `P-channel`
  - `partNumber` — **the value** (goes in `value`) — Part number: e.g. IRLZ44N

### `mosfet-flat` — MOSFET (Flat)

- Category: Transistor · Designator: Q1, Q2…
- Footprint: 1 x 3 holes; 3 pins in a single row
- Pins: 1 `G` · 2 `D` · 3 `S`
- Properties:
  - `channel` — Channel: one of `N-channel`, `P-channel`
  - `partNumber` — **the value** (goes in `value`) — Part number: e.g. IRLZ44N

### `pin-header-1x1` — Pin Header 1x1

- Category: Connector · Designator: J1, J2…
- Footprint: 1 x 1 holes; 1 x 1 grid, numbered row by row, left to right
- Pins: 1
- Properties:
  - `function` — Function: e.g. UART, I²C, power in
- Value: the part name ("Pin Header 1x1")

### `pin-header-1x2` — Pin Header 1x2

- Category: Connector · Designator: J1, J2…
- Footprint: 2 x 1 holes; 1 x 2 grid, numbered row by row, left to right
- Pins: 1 · 2
- Properties:
  - `function` — Function: e.g. UART, I²C, power in
- Value: the part name ("Pin Header 1x2")

### `pin-header-1x3` — Pin Header 1x3

- Category: Connector · Designator: J1, J2…
- Footprint: 3 x 1 holes; 1 x 3 grid, numbered row by row, left to right
- Pins: 1 · 2 · 3
- Properties:
  - `function` — Function: e.g. UART, I²C, power in
- Value: the part name ("Pin Header 1x3")

### `pin-header-1x4` — Pin Header 1x4

- Category: Connector · Designator: J1, J2…
- Footprint: 4 x 1 holes; 1 x 4 grid, numbered row by row, left to right
- Pins: 1 · 2 · 3 · 4
- Properties:
  - `function` — Function: e.g. UART, I²C, power in
- Value: the part name ("Pin Header 1x4")

### `pin-header-2x2` — Pin Header 2x2

- Category: Connector · Designator: J1, J2…
- Footprint: 2 x 2 holes; 2 x 2 grid, numbered row by row, left to right
- Pins: 1 · 2 · 3 · 4
- Properties:
  - `function` — Function: e.g. UART, I²C, power in
- Value: the part name ("Pin Header 2x2")

### `pin-header-2x3` — Pin Header 2x3

- Category: Connector · Designator: J1, J2…
- Footprint: 3 x 2 holes; 2 x 3 grid, numbered row by row, left to right
- Pins: 1 · 2 · 3 · 4 · 5 · 6
- Properties:
  - `function` — Function: e.g. UART, I²C, power in
- Value: the part name ("Pin Header 2x3")

### `push-button` — Push Button

- Category: Switch · Designator: SW1, SW2…
- Footprint: 2 x 3 holes; 4 legs, one in each corner: 1 top-left, 2 bottom-left, 3 bottom-right, 4 top-right
- Pins: 1 · 2 · 3 · 4
- Properties:
  - `partNumber` — **the value** (goes in `value`) — Part number: e.g. LM358

### `xiao-esp32c6` — XIAO seeed ESP32-C6

- Category: Microcontroller · Designator: U1, U2…
- Footprint: 7 x 7 holes; DIP layout — pins 1–7 down the left side, 8–14 up the right side
- Pins: 1 `D0` · 2 `D1` · 3 `D2` · 4 `D3` · 5 `D4` · 6 `D5` · 7 `D6` · 8 `D7` · 9 `D8` · 10 `D9` · 11 `D10` · 12 `3V3` · 13 `GND` · 14 `VBUS`
- Properties:
  - `partNumber` — **the value** (goes in `value`) — Part number: e.g. LM358

### `nau7802` — NAU7802

- Category: ADC · Designator: U1, U2…
- Footprint: 6 x 1 holes; 6 pins in a single row
- Pins: 1 `VIN` · 2 `AV` · 3 `GND` · 4 `SCL` · 5 `SDA` · 6 `DRDY`
- Properties:
  - `partNumber` — **the value** (goes in `value`) — Part number: e.g. LM358

### `a4988` — A4988

- Category: Motor Driver · Designator: U1, U2…
- Footprint: 6 x 8 holes; DIP layout — pins 1–8 down the left side, 9–16 up the right side
- Pins: 1 `~ENABLE` · 2 `MS1` · 3 `MS2` · 4 `MS3` · 5 `RESET` · 6 `SLEEP` · 7 `STEP` · 8 `DIRECTION` · 9 `GND` · 10 `VDD` · 11 `1B` · 12 `1A` · 13 `2A` · 14 `2B` · 15 `GND_MOT` · 16 `V_MOT`
- Properties:
  - `partNumber` — **the value** (goes in `value`) — Part number: e.g. LM358

### `mp1584` — MP1584

- Category: Buck converter · Designator: U1, U2…
- Footprint: 9 x 7 holes; DIP layout — pins 1–7 down the left side, 8–14 up the right side
- Pins: 1 `IN-` · 2 · 3 · 4 · 5 · 6 · 7 `IN+` · 8 `OUT+` · 9 · 10 · 11 · 12 · 13 · 14 `OUT-`
- Properties:
  - `partNumber` — **the value** (goes in `value`) — Part number: e.g. LM358

### `ne555` — NE555 Timer

- Category: Timer IC · Designator: U1, U2…
- Footprint: 4 x 4 holes; DIP layout — pins 1–4 down the left side, 5–8 up the right side
- Pins: 1 `GND` · 2 `TRIG` · 3 `OUT` · 4 `RESET` · 5 `CTRL` · 6 `THRESH` · 7 `DISCH` · 8 `VCC`
- Properties:
  - `partNumber` — **the value** (goes in `value`) — Part number: e.g. LM358

### `dip14-logic` — DIP-14 Logic

- Category: Logic IC · Designator: U1, U2…
- Footprint: 4 x 7 holes; DIP layout — pins 1–7 down the left side, 8–14 up the right side
- Pins: 1 `1A` · 2 `1B` · 3 `1Y` · 4 `2A` · 5 `2B` · 6 `2Y` · 7 `GND` · 8 · 9 · 10 · 11 · 12 · 13 · 14 `VCC`
- Properties:
  - `partNumber` — **the value** (goes in `value`) — Part number: e.g. LM358

### `cd4013be` — CD4013BE

- Category: Flip-Flop · Designator: U1, U2…
- Footprint: 4 x 7 holes; DIP layout — pins 1–7 down the left side, 8–14 up the right side
- Pins: 1 `1Q` · 2 `1Q#` · 3 `1CLK` · 4 `1RESET` · 5 `1D` · 6 `1SET` · 7 `GND` · 8 `2SET` · 9 `2D` · 10 `2RESET` · 11 `2CLK` · 12 `2Q#` · 13 `2Q` · 14 `VCC`
- Properties:
  - `partNumber` — **the value** (goes in `value`) — Part number: e.g. LM358

### `dip16-logic` — DIP-16 Logic

- Category: Logic IC · Designator: U1, U2…
- Footprint: 4 x 8 holes; DIP layout — pins 1–8 down the left side, 9–16 up the right side
- Pins: 1 `EN` · 2 `1D` · 3 `1Q` · 4 `2D` · 5 `2Q` · 6 · 7 · 8 `GND` · 9 · 10 · 11 · 12 · 13 · 14 · 15 · 16 `VCC`
- Properties:
  - `partNumber` — **the value** (goes in `value`) — Part number: e.g. LM358

### `atmega328p` — ATmega328P

- Category: Microcontroller · Designator: U1, U2…
- Footprint: 4 x 14 holes; DIP layout — pins 1–14 down the left side, 15–28 up the right side
- Pins: 1 `RESET` · 2 `RX` · 3 `TX` · 4 · 5 · 6 · 7 `VCC` · 8 `GND` · 9 · 10 · 11 · 12 · 13 · 14 · 15 · 16 · 17 · 18 · 19 · 20 `AVCC` · 21 · 22 `GND` · 23 · 24 · 25 · 26 · 27 · 28
- Properties:
  - `partNumber` — **the value** (goes in `value`) — Part number: e.g. LM358
