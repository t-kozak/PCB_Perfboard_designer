# CLAUDE.md

## What this is

**PCB Perfboard Designer** — a browser-based CAD tool for laying out electronic circuits
on a virtual perfboard grid. Users place ICs, connect their pins on the component
("schematic") side, then flip to the solder side to get physical, routed wires, colour
pads, add notes, and export the design as a PNG or a JSON project file.

Pure front-end app. No backend, no tests. Deployed to GitHub Pages
(`https://maurerkrisztian.github.io/PCB_Perfboard_designer/`).

## Tech stack

- **TypeScript** (v6.0, `strict`), compiled/bundled by **Vite 8**
- Rendering: a single **HTML5 `<canvas>`** drawn imperatively (no framework)
- Styling is 100% hand-written CSS with CSS variables (`src/style.css`). There is no
  CSS framework and no PostCSS pipeline — a small reset at the top of `style.css`
  replaces what Tailwind's preflight used to provide.
- **No runtime dependencies.** Colour input is the native `<input type=color>` plus a
  hand-rolled 2D spectrum canvas.
- Persistence: `localStorage` + browser File download/upload (no server)

## Package manager

**pnpm** (pinned via `packageManager` in `package.json` + `.npmrc`
`manage-package-manager-versions=true`). Use `pnpm`, not `npm`. `.nvmrc` pins Node.
Corepack is unbundled from Node 25+, so install it separately (`npm i -g corepack`)
or just use a global `pnpm` — the `manage-package-manager-versions` flag makes pnpm
self-align to the pinned version.

## Commands

```bash
pnpm start           # vite dev server — http://localhost:3000 (see vite.config.ts)
pnpm build           # production build to dist/
pnpm serve           # vite preview of dist/
pnpm lint            # eslint src (flat config: eslint.config.js)
pnpm typecheck       # tsc --noEmit (build itself does NOT typecheck — esbuild only)
pnpm test            # vitest run — ONLY src/routing/, src/nets/derive.test.ts, src/features/ic-geometry.test.ts (vitest.config.ts). Do not widen.
pnpm format          # prettier --write .
pnpm deploy          # build + gh-pages -d dist
```

Node ≥ 20.19 (see `engines` / `.nvmrc`).

## Layout / where things are

| Path | Purpose |
| :--- | :--- |
| `index.html` | Entire DOM: header, left tool sidebar, canvas viewport, right shortcut panel, context menu, IC editor modal. All element IDs referenced from TS live here. |
| `src/index.ts` | Entry point. Bootstraps the grid, wires up all DOM controls that don't have their own feature file: IC editor modal, tool-mode selector, wire-gauge selector (sets the selected connection's `width`), context-menu items, custom-colour palette + 2D spectrum picker, grid presets, zoom / fullscreen / sidebar toggle, selection-status badge, and the solder-side toggle (a pure view flip — wires are re-derived on paint). |
| `src/style.css` | All styling (dark "engineering" theme, CSS variables, glassmorphic panels). Imported by `index.ts`. |
| `src/state/State.ts` | Global mutable app state — a class of `static` fields. Single source of truth: dots, **connections (the logical layer, carrying wire `width`; wire *colour* is always the net colour, not stored)**, ICs, current selection, active tool mode, `routingMode` (`'orthogonal'`/`'direct'`), `activePadColor` + `selectedWireWidth` (Styling panel brush — pad colour only), undo stack, grid constants (`dotSpace = 50`, `dotRadius = 5`). `State.lines` is a *transient* solder-side render cache — recomputed from connections every paint, never saved, never in undo. |
| `src/state/Canvas.ts` | Grabs the `<canvas id="myCanvas">` element and its 2D context as statics. |
| `src/features/draw-canvas.ts` | `redrawCanvas()` — the render loop. Component side: IC bodies → dots → **connections** (dashed rubber bands) → IC labels → placement preview. Solder side: dots (a pad a connection terminates on is tinted its net's colour) → wires. Called after every state mutation. |
| `src/features/reset-canvas.ts` | `resetCanvas()` — paints the green board background. |
| `src/features/hover.ts` | Canvas `mousemove`: hit-tests dots/lines/**connections** under cursor (`State.hoverDot`/`hoverLine`/`hoverConnection`), drives IC drag, updates the description readout. Also the `m` (move pad) shortcut. |
| `src/features/select.ts` | Canvas `mousedown` / `contextmenu`: the core interaction router. Middle-mouse board panning, IC placement & drag, dot/connection selection. On the solder side `selectWireConnection()` hit-tests the derived wire cache and selects the *connection* under the wire (there is no hand-drawn wire creation any more). Context menu show/hide, `Escape` deselect. The Connect tool's own pin-click handling lives in `connect.ts`; this file just yields to it (`activeToolMode === 'connect' && !solderSide` → early return). |
| `src/features/connect.ts` | The Connect tool (component side): click a pin to arm it (`State.pendingTerminal`), click a second pin to create an `IConnection` (deduped, undo-tracked). Also `deletePlacedIcCascade()` — deletes a placed component and cascades its connections as one undo entry, used by `Delete` and the right-click context menu. |
| `src/features/line.ts` | Connection/component deletion (`deleteLine()`) + the `Delete` shortcut; the `c` shortcut (recolour the selected pad — wires have no editable colour). |
| `src/features/wire-cache.ts` | The stateless solder side. `refreshWireCache()` recomputes `State.lines` from `State.connections` (one `RouteEdge` per connection, resolved to pads) whenever a full input signature — routing mode + the derived net list (id → colour, since a wire is drawn in its net's colour) + every connection's `width` + both terminals' pad keys + every solder joint on the board — changes, so it can never be silently stale. `solderedPads()` collects every placed component's pin holes (wired or not) and hands them to the router as `RouteBoard.soldered`. `invalidateWireCache()` forces the next recompute. Must NOT import `draw-canvas` (it imports this). |
| `src/features/dot.ts` | Pad colour change via the hidden `#colorPicker`. |
| `src/features/description.ts` | Add/remove a text note on a pad (`prompt()`-based), `d` / `D` shortcuts. |
| `src/features/ic.ts` | `Ic` class ("Components" in the UI): catalog container (`Ic.IC_CONTAINER`), placement, body/notch/pin-label drawing, 4-way rotation, custom-IC localStorage persistence. `getPinPositionOnIC()` (pad → pin) and `pinDot()` (pin → pad) delegate to the pure `ic-geometry.ts`. Body rendering is pluggable: `imageSrc` draws as artwork, otherwise `kind` selects vector art — `"chip"` (default DIP package), the "leaded" 2-terminal kinds `"resistor"` / `"cap-ceramic"` / `"cap-electrolytic"`, or `"bridge"` (a 1-pin junction — a small ring, no package, `hidesDot()` false; what you place to connect to a bare hole, see `docs/logical-connections.md`). `isLeaded` / `isBridge` / `pinCount` / `icon` getters key off `kind`. The actual built-in part list lives in `ic-catalog.ts`. Exposes `selectIc` / `deleteCustomIc` / `rotateSelectedIc` on `window` (called from inline `onclick` in generated HTML). `r` shortcut. |
| `src/features/ic-catalog.ts` | The built-in component catalog — `loadDefaultIcs()`, one `Ic.add(new Ic(...))` line per part (bridge, NE555, DIP-14/16, ATmega328P, XIAO ESP32-C6, NAU7802, resistor/cap/electrolytic). This is the file to edit to add a new built-in part; it's the only place that constructs catalog `Ic` instances. Called once at startup (from `ic.ts`) and again on project reset (`reset-project.ts`) to restore the catalog alongside any custom ICs from localStorage. |
| `src/features/ic-geometry.ts` | **Pure** pin ↔ pad geometry extracted out of `Ic` so it's unit-testable without `Canvas`/`State`: `pinAtDot()` / `dotForPin()` (inverse of each other, one per rotation) and `pinCountOf()`. `isRowLayout()` detects a single-row/SIP-style part (`widthPin` or `heightPin` === 1, excluding leaded parts and the bridge) and gives it one pin per hole along its long axis instead of the doubled two-sided DIP count — see the NAU7802 in `ic-catalog.ts`. The only consumer besides `Ic` is `ic-geometry.test.ts` (the pinDot ↔ getPinPositionOnIC round trip). |
| `src/features/grid-labels.ts` | Row/column axis labelling. **Pure** half: `toLetters`/`fromLetters` (bijective base-26, A..ZZ), `parseAxisSize` (a Grid Configuration input is digits *or* letters — whichever you type sets that axis's `AxisMode`), `formatAxisSize`, `axisLabel` (plus the module-private `rowLabel`, which applies `State.rowLabelsBottomUp`). Impure half: `drawGridLabels()` (painted by `redrawCanvas()` straight after the background, into the `State.gridGutter` margin, positions derived from the pads actually present) and `dotCoordinateLabel()` ("B4", used by the hover readout and the selection badge). Tick positions are memoised on `State.dots` identity. |
| `src/features/shortcut-keys.ts` | `ShortcutRegistry` — features call `ShortcutRegistry.add({key, ctrl?, event, description})`; keydown listener dispatches (to every matching entry — a key may be registered more than once), ignores INPUT/TEXTAREA targets, renders the list into `#shortcuts`. |
| `src/features/nets-ui.ts` | The "Nets" sidebar panel (solder side only; DOM half of the net layer): the derived net list (name + swatch). No rebuild button (automatic), no colour toggle, no short/DRC reporting. Re-renders on the `nets-changed` window event. |
| `src/features/connections-ui.ts` | The "Connections" sidebar panel (component side only): count, list grouped by net, click-to-select, per-connection delete. Mirrors `nets-ui.ts`. |
| `src/nets/` | Logical net layer. `derive.ts` — **pure**, no DOM/State/Canvas: union-find over `State.connections` keyed on `"icId#pin"` terminal keys, power-pin naming read directly off `pinDescription` (no short/DRC detection — connecting pads is always intentional, so it produced only false positives), `netAtTerminal` / `netAtConnection` flood for component-side hover highlight, `wiresOfNet()` for the solder-side equivalent, `resolveTerminal()` / `terminalAtDot()` (terminal ↔ pad). `INet` is `{id, name, color?}` — `color` is derived from the palette (`colorFor`, GND/VCC special-cased) and is **the** wire colour: the sidebar swatch and the solder-side wire are the same value, recomputed every paint, never stored on a connection. `rebuild.ts` — impure wrapper that writes `State.nets` and stamps `IConnection.netId`. Also `derive.test.ts` (Vitest). |
| `src/routing/` | **Pure** `logical → physical` router — may import ONLY interface types + other routing modules, never DOM/State/Canvas. Contract: `RouteEdge[] → ILine[]`, **one wire per connection** (no MST). `types.ts` (`RouteEdge`/`RouteBoard`/`RouteOpts`/`RouteResult`, `DEFAULT_OPTS`, `wire()`), `astar.ts` (generic A* + binary heap), `route.ts` (`route()` — orthogonal A* over straight-run pad graph; three hard constraints: pad ownership keyed by `netId` so same-net edges share pads; *channel exclusivity* — the gap between two adjacent pads carries at most one wire, so wires may cross but never run on top of each other; and *solder joints are never crossed* — a hole with a component pin in it (`RouteBoard.soldered`) stops a run dead, and only that net's own wire may end there; `failed[]` holds unroutable `connId`s, re-tried priority-first for up to 3 passes), `direct.ts` (`directWires()` — one straight segment per edge). Has its own `*.test.ts` (Vitest). |
| `src/features/routing.ts` | The routing-mode toggle only: `setRoutingMode()` + the `#routingModeSelector` buttons + `syncRoutingModeButtons()`. All the marshalling lives in `wire-cache.ts`. |
| `src/features/project/` | Save/load/reset: `save-project.ts` (`getSaveJson()` + JSON file download, `version: 5` — `connections` (`width` only) + `routingMode` + the `grid` block; no `lines`/`nets`), `load-project.ts` (`loadProject()` + file input; a v1/v2 file migrates each hand-drawn wire to one `IConnection` carrying that wire's `width`, a bridge per bare-hole endpoint; any `color` on a pre-v5 connection is ignored — wire colour is always the net colour), `autosave.ts` (debounced localStorage `save` write from `redrawCanvas()`), `load-from-local-storage.ts` (auto-restore on `DOMContentLoaded`, then `armAutosave()`), `reset-project.ts`, `resize-grid.ts`, `undo-redo.ts` (batch history over **connections + components** only — `IChange`, `recordChange()`, matched by `id`; wires are not tracked), `save-image.ts` (`p` shortcut). |
| `src/interfaces/` | `IDot`, `ILine` (transient wire segment: `+ netId?` / `connId?`), `IConnection` / `ITerminal` (`connection.interface.ts` — the logical layer + `width?` (no `color` — wire colour is the net colour), plus `terminalKey`/`makeConnection`/`sameConnection`/`isSelfLoop`), `INet` (`{id, name, color?}`), `IChange` (undo entry — connections/components added/removed), `IProjectSave` (`version: 5`). |
| `src/utils/utils.ts` | `Utils.getSafeHtmlElement()` (throwing `getElementById`), `Utils.normalizeColor()`. |
| `src/utils/serialization.ts` | Thin `JSON.stringify` / `Object.assign` helpers used for IC rehydration on load. |
| `assets/favicon.png` | Vite `publicDir` — static assets served from here. |
| `screenshot.png` | Used in README only. |
| `docs/logical-connections.md` | Design spec for the connections-are-truth model (implemented) — read this for the full rationale behind the component/solder-side split. |

## How it fits together

1. `index.ts` imports every feature module for its side effects (each module attaches its
   own DOM listeners / shortcuts at import time), then builds the initial grid and does
   the first `redrawCanvas()`.
2. All interaction mutates `State.*` directly, then calls `redrawCanvas()`.
3. There is no diffing — the whole canvas is repainted on every mouse move.
4. Coordinates: pads sit on a fixed 50px pitch; a dot's canvas `x`/`y` doubles as its
   identity (equality checks compare coordinates, and `ILine.start`/`end` hold dot
   references).
5. **Connections are truth; the solder side is stateless** (`docs/logical-connections.md`
   §11). The component side is the schematic view: you connect pin-to-pin with the
   Connect tool, and a connection is anchored to `{icId, pin}` (plus its own
   `width`), not to board geometry — drag a component and everything wired to it
   follows. The solder side holds no wire state: every paint, `refreshWireCache()`
   re-derives `State.lines` from the connections (one wire per connection — straight in
   `direct` mode, an orthogonal polyline in `orthogonal` mode). Selecting/deleting a
   "wire" really acts on its connection. Bare-hole endpoints need a one-pin "Bridge"
   component so every connection terminal is a component pin.

## Conventions / gotchas

- **Grid axes carry their own label notation.** `State.colLabelMode` / `State.rowLabelMode`
  are `"number"` or `"letter"`; the W/H inputs are free text and the notation you type
  picks the mode (`"J"` and `"10"` both mean ten columns; letters cap at `ZZ` = 702).
  A preset button spells out a whole board — `data-w` / `data-h` hold the literal
  notation ("X", "19") and `data-bottom-up` the row direction — so its caption is
  exactly what you get; `applyGridPreset()` writes them into the inputs and re-reads
  them. The four leading presets are real perfboards (X×18, T×14, 28×F, X×10, all
  numbered bottom-up); the plain numeric ones follow. The "Number rows
  bottom-to-top" checkbox (`State.rowLabelsBottomUp`) flips which label lands on which
  row, matching boards silkscreened from the bottom edge up; it moves no pads, so it
  redraws immediately instead of waiting for Resize. The board reserves
  `State.gridGutter` (26 units) of top/left margin for the labels, so pads now start at
  `gutter + dotSpace/2`, not `dotSpace/2` — nothing else assumes the old origin, since
  every consumer works off actual dot coordinates. Saves carry a `grid` block; a file
  without one is treated as all-numeric and `addLabelGutter()` in `load-project.ts`
  slides its whole layout (pads, wire endpoints, component anchors) into the new gutter.
- **State is global static-class fields**, not instances. Import `State` and read/write.
- ICs generated into the sidebar use inline `onclick="selectIc('id')"`, so those
  functions are deliberately assigned to `window`.
- The Vite build (`esbuild`) does **not** typecheck. Run `pnpm typecheck` for that.
- `tsconfig.json` uses `moduleResolution: "bundler"` (required for modern TS to resolve
  Vite's type exports). `src/vite-env.d.ts` (`/// <reference types="vite/client" />`)
  is what lets TS 6's stricter side-effect-import check accept `import "./style.css"`.
- **TypeScript is pinned to the 6.x line (`^6.0.3`), not 7.x.** TS 7.0 is the native
  (Go) compiler rewrite; `tsc` and `vite build` work fine with it, but
  `typescript-eslint` hard-errors ("does not support TS 7.0") because its type-aware
  linting binds to the old compiler API. TS 6.0 is the JS-based release with the same
  language features — it's the current target the linter supports. Move to 7.x once
  typescript-eslint ships native support (via its `tsgolint` companion).
- Dev server port is **3000** (`vite.config.ts`), not Vite's default 5173.
- The built-in IC catalog lives in `loadDefaultIcs()` in `src/features/ic-catalog.ts`; it
  runs at startup and again on project reset (so Reset no longer empties the IC menu).
- Undo/redo tracks connection add/remove and component add/remove (cascade
  delete) — not wires (stateless), colours, notes, or grid resize. Entries are
  batched (`IChange = {connectionsAdded?, connectionsRemoved?, componentsAdded?,
  componentsRemoved?}`), matched by `id`, so deleting a component + its
  connections is one Ctrl+Z. `recordChange({...})` is the single push site.
- Placed-component ids are `crypto.randomUUID()` strings (secure-context only —
  fine on localhost + GitHub Pages), including bridges. Save files are
  `version: 5` (`connections` + `routingMode`, no `lines`/`nets`). A file < v3
  migrates hand-drawn wires to connections (carrying `width`); any `color` on a
  pre-v5 connection is ignored — a wire is always drawn in its net's colour; a
  missing version is treated as v1 (regenerates component ids).
- The net layer (`src/nets/`) is derived from connections on demand and also run
  automatically on every connection/component mutation and before every
  solder-side paint. A freshly-created connection has no `netId` until the next
  rebuild, though hover-highlight works without one.
- **The solder side is stateless.** `wire-cache.ts` recomputes `State.lines`
  from the connection list (one `RouteEdge` per connection) whenever a full
  input signature changes (`routingMode` + the derived net list id→colour +
  every connection's `width` + both terminals' pad keys + every component pin
  hole) — so moving/deleting a component or recolouring a net never leaves a
  stale wire. Routing is per-connection, not per-net:
  `route()` (orthogonal A*) or `directWires()` (straight). Three hard rules:
  pad ownership is keyed by `netId` so same-net connections may share pads;
  **channel exclusivity** — no two wires (same net included) may occupy the gap
  between the same two adjacent pads, so a wire is never hidden under another
  and crossings stay legal; and **solder joints are never crossed** — a hole
  with a component pin in it walls off a run, and only that net's own wire may
  end on it (so an unwired pin blocks outright). Only orthogonal mode obeys
  them; `direct` draws straight pin-to-pin lines by design. Unroutable connections are listed by their
  terminal labels in `#routeStatus`, never dropped. The only routing control is
  the global `#routingModeSelector` (orthogonal / direct), solder side only.
- `no-unused-vars` is enforced by both `noUnusedLocals/Parameters` (tsconfig) and
  eslint — the pure routing modules must not leave dangling params.
- Solder-side view (`Canvas.solderSide`) mirrors X in the single canvas
  transform; text goes through `Canvas.fillText()` to stay upright. `save-image`
  exports whatever side is showing. The two faces are the logical/physical
  split: **component side** = components + connections (dashed rubber bands, in
  their net's colour) + the Components/Connections catalogs, no wires;
  **solder side** = components hidden & inert, the derived per-connection wires
  (`State.lines`), hover-highlight, the Nets panel. The sidebar
  sections toggle via `[hidden]` on `#netsPanelWrap` / `#componentsPanelWrap` /
  `#connectionsPanelWrap` (the "Wire Thickness" control stays visible on both
  faces — it edits the selected connection's `width`; there is no wire-colour
  control, a wire is **always** drawn in its net's colour). There is no wire
  tool — the Connect tool (`activeToolMode === 'connect'`, component side only)
  creates connections.
- No CI. `lint` + `typecheck` + `format` + `test` are the checks; `lint` still
  emits 6 `any`-related warnings (0 errors) — `no-explicit-any` is deliberately
  set to `warn` in `eslint.config.js`. Tests (Vitest) exist ONLY for
  `src/routing/`, `src/nets/derive.test.ts`, and
  `src/features/ic-geometry.test.ts` (pure, DOM-free modules) — the rest of the
  app is browser-coupled by design; don't add tests elsewhere.
- Source has never been run through Prettier; `pnpm format:check` currently flags most
  files. Run a one-time `pnpm format` when convenient (separate commit).

## Attribution

End commit messages with:
`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
