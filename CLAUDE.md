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
| `src/index.ts` | Entry point. Bootstraps the grid, wires up all DOM controls that don't have their own feature file: IC editor modal, tool-mode selector, wire-gauge selector, context-menu items, custom-colour palette + 2D spectrum picker, grid presets, zoom / fullscreen / sidebar toggle, selection-status badge, and the solder-side toggle (which calls `routeOnFlip()`). |
| `src/style.css` | All styling (dark "engineering" theme, CSS variables, glassmorphic panels). Imported by `index.ts`. |
| `src/state/State.ts` | Global mutable app state — a class of `static` fields. Single source of truth: dots, lines (generated wires), **connections (the logical layer)**, ICs, current selection, active tool mode, wire colour/width, undo stack, grid constants (`dotSpace = 50`, `dotRadius = 5`). |
| `src/state/Canvas.ts` | Grabs the `<canvas id="myCanvas">` element and its 2D context as statics. |
| `src/features/draw-canvas.ts` | `redrawCanvas()` — the render loop. Component side: IC bodies → dots → **connections** (dashed rubber bands) → IC labels → placement preview. Solder side: dots → wires. Called after every state mutation. |
| `src/features/reset-canvas.ts` | `resetCanvas()` — paints the green board background. |
| `src/features/hover.ts` | Canvas `mousemove`: hit-tests dots/lines/**connections** under cursor (`State.hoverDot`/`hoverLine`/`hoverConnection`), drives IC drag, updates the description readout. Also the `m` (move pad) shortcut. |
| `src/features/select.ts` | Canvas `mousedown` / `contextmenu`: the core interaction router. Middle-mouse board panning, IC placement & drag, dot/line/connection selection, hand-drawn wire creation (`addNewLineIfNeeded`, **solder side only**), context menu show/hide, `Escape` deselect. The Connect tool's own pin-click handling lives in `connect.ts`; this file just yields to it (`activeToolMode === 'connect' && !solderSide` → early return). There is no eraser/note tool mode — deletion and notes are right-click (context menu) or keyboard-shortcut (`Delete`, `d`/`D`) only. |
| `src/features/connect.ts` | The Connect tool (component side): click a pin to arm it (`State.pendingTerminal`), click a second pin to create an `IConnection` (deduped, undo-tracked). Also `deletePlacedIcCascade()` — deletes a placed component and cascades its connections as one undo entry, used by `Delete` and the right-click context menu. |
| `src/features/line.ts` | Wire colour change (solder side) / **net colour change for the selected connection** (component side), wire/connection/component deletion, `Delete` and `c` shortcuts. |
| `src/features/dot.ts` | Pad colour change via the hidden `#colorPicker`. |
| `src/features/description.ts` | Add/remove a text note on a pad (`prompt()`-based), `d` / `D` shortcuts. |
| `src/features/ic.ts` | `Ic` class ("Components" in the UI): catalog (`Ic.IC_CONTAINER`), placement, body/notch/pin-label drawing, 4-way rotation, custom-IC localStorage persistence. `getPinPositionOnIC()` (pad → pin) and `pinDot()` (pin → pad) delegate to the pure `ic-geometry.ts`. Body rendering is pluggable: `imageSrc` draws as artwork, otherwise `kind` selects vector art — `"chip"` (default DIP package), the "leaded" 2-terminal kinds `"resistor"` / `"cap-ceramic"` / `"cap-electrolytic"`, or `"bridge"` (a 1-pin junction — a small ring, no package, `hidesDot()` false; what you place to connect to a bare hole, see `docs/logical-connections.md`). `isLeaded` / `isBridge` / `pinCount` / `icon` getters key off `kind`. Built-in chips, the three static leaded parts, and the bridge (registered first) come from the exported `loadDefaultIcs()`. Exposes `selectIc` / `deleteCustomIc` / `rotateSelectedIc` on `window` (called from inline `onclick` in generated HTML). `r` shortcut. |
| `src/features/ic-geometry.ts` | **Pure** pin ↔ pad geometry extracted out of `Ic` so it's unit-testable without `Canvas`/`State`: `pinAtDot()` / `dotForPin()` (inverse of each other, one per rotation) and `pinCountOf()`. The only consumer besides `Ic` is `ic-geometry.test.ts` (the pinDot ↔ getPinPositionOnIC round trip). |
| `src/features/grid-labels.ts` | Row/column axis labelling. **Pure** half: `toLetters`/`fromLetters` (bijective base-26, A..ZZ), `parseAxisSize` (a Grid Configuration input is digits *or* letters — whichever you type sets that axis's `AxisMode`), `formatAxisSize`, `axisLabel` (plus the module-private `rowLabel`, which applies `State.rowLabelsBottomUp`). Impure half: `drawGridLabels()` (painted by `redrawCanvas()` straight after the background, into the `State.gridGutter` margin, positions derived from the pads actually present) and `dotCoordinateLabel()` ("B4", used by the hover readout and the selection badge). Tick positions are memoised on `State.dots` identity. |
| `src/features/shortcut-keys.ts` | `ShortcutRegistry` — features call `ShortcutRegistry.add({key, ctrl?, event, description})`; keydown listener dispatches (to every matching entry — a key may be registered more than once), ignores INPUT/TEXTAREA targets, renders the list into `#shortcuts`. |
| `src/features/nets-ui.ts` | The "Nets" sidebar panel (solder side only; DOM half of the net layer): "Rebuild from Wires" (`refreshNets()`), "Color by Net" toggle (`State.showNetColors`), net list + short count, a ⚠ unlock-and-reroute affordance per stale-and-locked net. Re-renders on the `nets-changed` window event dispatched by connection/wire mutations / load / reset. |
| `src/features/connections-ui.ts` | The "Connections" sidebar panel (component side only): count, list grouped by net, click-to-select, per-connection delete. Mirrors `nets-ui.ts`. |
| `src/nets/` | Logical net layer (see `docs/logical-connections.md` M9). `derive.ts` — **pure**, no DOM/State/Canvas: union-find over `State.connections` keyed on `"icId#pin"` terminal keys, power-pin naming read directly off `pinDescription`, `findShorts` (physical wire pad collisions) + `labelConflicts` (a net tying two canonical names together) + `physicalTerminalShorts` (two different nets' terminals resolving to the same pad — overlapping placement), `netAtTerminal` / `netAtConnection` flood for component-side hover highlight, `netAtLine` for the solder-side equivalent, `netSignature()` (feeds `INet.routedSignature`, see M10), `resolveTerminal()` / `terminalAtDot()` (terminal ↔ pad, shared by rendering/hit-testing). `rebuild.ts` — impure wrapper that writes `State.nets` and stamps `IConnection.netId`. Also `derive.test.ts` (Vitest). |
| `src/routing/` | **Pure** `logical → physical` router (M4/M5) — may import ONLY interface types + other routing modules, never DOM/State/Canvas. Its contract (`RouteNet[] → ILine[]`) is unchanged by the connections model — it never learns that connections exist. `types.ts` (`RouteNet`/`RouteOpts`/`RouteResult`, `DEFAULT_OPTS`, geom helpers), `tidy.ts` (`mst()` Prim's + `tidy()` MST pass), `astar.ts` (generic A* + binary heap), `route.ts` (`route()` — A* over straight-run pad graph, cost table from §3, `failed[]` for unroutable nets). Has its own `*.test.ts` (Vitest). |
| `src/features/routing.ts` | DOM half of routing: `collectNets()` resolves each net's connections to pads via `pinDot()` (not from hand-drawn wires). `routeOnFlip()` — the flip-to-solder-side build step: routes only nets whose `netSignature()` differs from `INet.routedSignature` and aren't locked. "Tidy (MST)" / "Route (Orthogonal)" buttons force a full pass. One batch-undo entry per pass, `#routeStatus` readout. `lockNetOf()` (wire edit → `net.locked`), `unlockAndRerouteNet()` / `unlockAndReroute()` (context menu `#ctxUnlockNetBtn`, Nets-panel ⚠). |
| `src/features/project/` | Save/load/reset: `save-project.ts` (`getSaveJson()` + JSON file download, writes `version: 3` plus the `grid` axis-notation block), `load-project.ts` (`loadProject()` + file input; a v1/v2 file has no `connections` — every hand-drawn wire migrates to one `IConnection`, with a bridge placed for each bare-hole endpoint, see `docs/logical-connections.md` §6 — and re-hydrates wire endpoints to canonical `State.dots` by coordinate), `save-progress.ts` (localStorage `save` key), `load-from-local-storage.ts` (auto-restore on `DOMContentLoaded`), `reset-project.ts` (clear everything), `resize-grid.ts` (`createDotGrid()` + the W×H inputs, via `readGridInputs()` / `syncGridInputs()` — both accept numbers or letters), `undo-redo.ts` (batch history over wires + **connections + components** — `IChange`, `recordChange()`; wires match by endpoint coordinate, connections/components match by `id`), `save-image.ts` (`canvas.toDataURL()` PNG, `p` shortcut). |
| `src/interfaces/` | `IDot`, `ILine` (+ optional `netId` / `generated` — generated wires only, from M11 on), `IConnection` / `ITerminal` (`connection.interface.ts` — the logical layer, plus the canonical-order/dedup helpers `terminalKey`/`makeConnection`/`sameConnection`/`isSelfLoop`), `INet` (+ `routedSignature`), `IChange` (batch undo entry — wires/connections/components added/removed), `IProjectSave` (save-file shape, `version: 3` + `connections` + `nets`). |
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
5. **Connections are truth, wires are output** (`docs/logical-connections.md`). The
   component side is the schematic view: you connect pin-to-pin with the Connect tool,
   and a connection is anchored to `{icId, pin}`, not to board geometry — drag a
   component and everything wired to it follows. The solder side is the physical view:
   flipping to it rebuilds nets from connections and routes whichever are stale, turning
   the schematic into `ILine` wires. Bare-hole endpoints need a one-pin "Bridge"
   component (placed from the catalog like any other part) so every connection terminal
   is a component pin, with no exceptions.

## Conventions / gotchas

- **Grid axes carry their own label notation.** `State.colLabelMode` / `State.rowLabelMode`
  are `"number"` or `"letter"`; the W/H inputs are free text and the notation you type
  picks the mode (`"J"` and `"10"` both mean ten columns; letters cap at `ZZ` = 702).
  A preset button spells out a whole board — `data-w` / `data-h` hold the literal
  notation ("X", "19") and `data-bottom-up` the row direction — so its caption is
  exactly what you get; `applyGridPreset()` writes them into the inputs and re-reads
  them. The four leading presets are real perfboards (X×19, T×14, 28×F, X×10, all
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
- The built-in IC catalog lives in `loadDefaultIcs()` in `src/features/ic.ts`; it runs
  at startup and again on project reset (so Reset no longer empties the IC menu).
- Undo/redo tracks wire add/remove, connection add/remove, and component
  add/remove (cascade delete) — not colours, notes, or grid resize. Entries are
  batched (`IChange = {added?, removed?, connectionsAdded?, connectionsRemoved?,
  componentsAdded?, componentsRemoved?}`), so one op = one Ctrl+Z even when it
  touches many items (a routing pass, or deleting a component and its
  connections). Wires match by endpoint coordinate; connections/components match
  by `id`. `recordChange({...})` is the single push site.
- Placed-component ids are `crypto.randomUUID()` strings (secure-context only —
  fine on localhost + GitHub Pages), including bridges. Save files are
  `version: 3`; a file with no `connections` (< v3) migrates its hand-drawn
  wires to connections on load, and a missing version is treated as v1 (also
  regenerates component ids).
- The net layer (`src/nets/`) is derived from connections on demand — a
  "Rebuild from Wires"-style manual pass, but also run automatically on every
  connection/component mutation and on flip-to-solder-side. A freshly-created
  connection has no `netId` until the next rebuild, though hover-highlight and
  short detection work without one.
- Routing (`src/routing/`) is **non-destructive**: it replaces only its own
  non-locked `generated` wires, leaving every hand-drawn solder-side wire
  intact. Net terminals are resolved from connections' `pinDot()` positions, not
  from wires. A net locks (`INet.locked`) when you hand-edit one of its wires'
  colour or width; "Unlock & re-route net" (context menu, or the Nets panel's ⚠
  on a stale-and-locked net) clears it. Locked nets are never rewritten.
  Unroutable nets are reported by name in `#routeStatus`, never dropped. Routing
  UI/actions live on the solder side only; flipping to it is itself a routing
  trigger (`routeOnFlip()` — routes only nets whose `netSignature()` changed
  since their last routing pass, via `INet.routedSignature`).
- `no-unused-vars` is enforced by both `noUnusedLocals/Parameters` (tsconfig) and
  eslint — the pure routing modules must not leave dangling params.
- Solder-side view (`Canvas.solderSide`) mirrors X in the single canvas
  transform; text goes through `Canvas.fillText()` to stay upright. `save-image`
  exports whatever side is showing. The two faces are also the logical/physical
  split: **component side** = components + connections (dashed rubber bands,
  net-coloured) + the Components/Connections catalogs, no wires at all; **solder
  side** = components hidden & inert, the router's `generated` wires (per-net
  fallback to hand-drawn until routed), net colours / hover-highlight / short
  rings, the Nets panel, the Wire Thickness controls. Face-dependent wire
  visibility is `wireVisible()` in `draw-canvas.ts`; the sidebar sections toggle
  via `[hidden]` on `#netsPanelWrap` / `#componentsPanelWrap` /
  `#connectionsPanelWrap` / `#wireGaugeSectionWrap`. There is no wire tool on the
  component side — the Connect tool (`activeToolMode === 'connect'`) creates
  connections there and hand-drawn wires only on the solder side, via the same
  tool mode (gated on `Canvas.solderSide` in `select.ts`/`connect.ts`).
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
