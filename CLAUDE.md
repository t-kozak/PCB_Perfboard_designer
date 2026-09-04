# CLAUDE.md

## What this is

**PCB Perfboard Designer** — a browser-based CAD tool for laying out electronic circuits
on a virtual perfboard grid. Users place ICs, trace wires between pads, colour pads/wires,
add notes, then export the design as a PNG or a JSON project file.

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
pnpm test            # vitest run — ONLY src/routing/**/*.test.ts (vitest.config.ts). Do not widen.
pnpm format          # prettier --write .
pnpm deploy          # build + gh-pages -d dist
```

Node ≥ 20.19 (see `engines` / `.nvmrc`).

## Layout / where things are

| Path | Purpose |
| :--- | :--- |
| `index.html` | Entire DOM: header, left tool sidebar, canvas viewport, right shortcut panel, context menu, IC editor modal. All element IDs referenced from TS live here. |
| `src/index.ts` | Entry point. Bootstraps the grid, wires up all DOM controls that don't have their own feature file: IC editor modal, tool-mode selector, wire-gauge selector, context-menu items, custom-colour palette + 2D spectrum picker, grid presets, zoom / fullscreen / sidebar toggle, selection-status badge. |
| `src/style.css` | All styling (dark "engineering" theme, CSS variables, glassmorphic panels). Imported by `index.ts`. |
| `src/state/State.ts` | Global mutable app state — a class of `static` fields. Single source of truth: dots, lines, ICs, current selection, active tool mode, wire colour/width, undo stack, grid constants (`dotSpace = 50`, `dotRadius = 5`). |
| `src/state/Canvas.ts` | Grabs the `<canvas id="myCanvas">` element and its 2D context as statics. |
| `src/features/draw-canvas.ts` | `redrawCanvas()` — the render loop. Clears, then draws IC bodies → dots → lines → IC labels → placement preview. Called after every state mutation. |
| `src/features/reset-canvas.ts` | `resetCanvas()` — paints the green board background. |
| `src/features/hover.ts` | Canvas `mousemove`: hit-tests dots/lines under cursor (`State.hoverDot`/`hoverLine`), drives IC drag, updates the description readout. Also the `m` (move pad) shortcut. |
| `src/features/select.ts` | Canvas `mousedown` / `contextmenu`: the core interaction router. Middle-mouse board panning, eraser/note tool handling, IC placement & drag, dot/line selection, wire creation (`addNewLineIfNeeded`), context menu show/hide, `Escape` deselect. |
| `src/features/line.ts` | Wire colour change, wire deletion (also handles deleting a selected IC / resetting a selected dot), `Delete` and `c` shortcuts. |
| `src/features/dot.ts` | Pad colour change via the hidden `#colorPicker`. |
| `src/features/description.ts` | Add/remove a text note on a pad (`prompt()`-based), `d` / `D` shortcuts. |
| `src/features/ic.ts` | `Ic` class ("Components" in the UI): catalog (`Ic.IC_CONTAINER`), placement geometry, body/notch/pin-label drawing, 4-way rotation, per-pin lookup by dot, custom-IC localStorage persistence. Body rendering is pluggable: `imageSrc` (raster/SVG data URI or URL) draws as artwork, otherwise `kind` selects vector art — `"chip"` (default black DIP package) or the "leaded" 2-terminal kinds `"resistor"` / `"cap-ceramic"` / `"cap-electrolytic"` (schematic-style art spanning two end pads, drawn by `drawLeadedBody`, no pin-1 notch or pin labels; `bodyRect()` gives the widened hit box; value entered as a note). `isLeaded` / `icon` getters key off `kind`. Built-in chips (NE555, DIP-14, DIP-16, ATmega328P) and the three static parts registered by the exported `loadDefaultIcs()`. Exposes `selectIc` / `deleteCustomIc` / `rotateSelectedIc` on `window` (called from inline `onclick` in generated HTML). `r` shortcut. |
| `src/features/shortcut-keys.ts` | `ShortcutRegistry` — features call `ShortcutRegistry.add({key, ctrl?, event, description})`; keydown listener dispatches, ignores INPUT/TEXTAREA targets, renders the list into `#shortcuts`. |
| `src/features/nets-ui.ts` | The "Nets" sidebar panel (DOM half of the net layer): "Rebuild from Wires" (`refreshNets()`), "Color by Net" toggle (`State.showNetColors`), net list + short count. Re-renders on the `nets-changed` window event dispatched by wire mutations / load / reset. |
| `src/nets/` | Logical net layer (see `docs/autorouting.md` M3). `derive.ts` — **pure**, no DOM/State/Canvas: union-find over `State.lines` keyed on `"x,y"`, power-pin naming (GND/VCC), `findShorts` + `labelConflicts`, `netAtLine` flood for hover highlight. `rebuild.ts` — impure wrapper that writes `State.nets` and stamps `ILine.netId`. |
| `src/routing/` | **Pure** `logical → physical` router (M4/M5) — may import ONLY interface types + other routing modules, never DOM/State/Canvas. `types.ts` (`RouteNet`/`RouteOpts`/`RouteResult`, `DEFAULT_OPTS`, geom helpers), `tidy.ts` (`mst()` Prim's + `tidy()` MST pass), `astar.ts` (generic A* + binary heap), `route.ts` (`route()` — A* over straight-run pad graph, cost table from §3, `failed[]` for unroutable nets). The **only** directory with tests (`*.test.ts`, Vitest). |
| `src/features/routing.ts` | DOM half of routing: "Tidy (MST)" / "Route (Orthogonal)" buttons, marshals `State` ↔ `RouteNet[]`, one batch-undo entry per pass, `#routeStatus` readout. `lockNetOf()` (wire edit → `net.locked`) and `unlockAndReroute()` (context-menu `#ctxUnlockNetBtn`). |
| `src/features/project/` | Save/load/reset: `save-project.ts` (`getSaveJson()` + JSON file download, writes `version: 2`), `load-project.ts` (`loadProject()` + file input; migrates v1 saves by regenerating component ids and re-hydrates wire endpoints to canonical `State.dots` by coordinate), `save-progress.ts` (localStorage `save` key), `load-from-local-storage.ts` (auto-restore on `DOMContentLoaded`), `reset-project.ts` (clear everything), `resize-grid.ts` (`createDotGrid()` + W×H inputs), `undo-redo.ts` (batch line add/remove history — `IChange.lines`, `recordChange()`, coordinate-pair matching), `save-image.ts` (`canvas.toDataURL()` PNG, `p` shortcut). |
| `src/interfaces/` | `IDot`, `ILine` (+ optional `netId` / `generated`), `INet` (net layer), `IChange` (batch undo entry — `{type, lines}`), `IProjectSave` (save-file shape, `version` + `nets`). |
| `src/utils/utils.ts` | `Utils.getSafeHtmlElement()` (throwing `getElementById`), `Utils.normalizeColor()`. |
| `src/utils/serialization.ts` | Thin `JSON.stringify` / `Object.assign` helpers used for IC rehydration on load. |
| `assets/favicon.png` | Vite `publicDir` — static assets served from here. |
| `screenshot.png` | Used in README only. |

## How it fits together

1. `index.ts` imports every feature module for its side effects (each module attaches its
   own DOM listeners / shortcuts at import time), then builds the initial grid and does
   the first `redrawCanvas()`.
2. All interaction mutates `State.*` directly, then calls `redrawCanvas()`.
3. There is no diffing — the whole canvas is repainted on every mouse move.
4. Coordinates: pads sit on a fixed 50px pitch; a dot's canvas `x`/`y` doubles as its
   identity (equality checks compare coordinates, and `ILine.start`/`end` hold dot
   references).

## Conventions / gotchas

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
- Undo/redo only tracks wire add/remove — not colours, notes, ICs, or grid resize.
  Entries are batched (`IChange = {added?, removed?}`), so one op = one Ctrl+Z even
  when it adds and removes many wires (a routing pass). Matched by endpoint
  coordinate, not identity. `recordChange({added, removed})` is the single push site.
- Placed-component ids are `crypto.randomUUID()` strings (secure-context only —
  fine on localhost + GitHub Pages). Save files are `version: 2`; a missing
  version is treated as v1 and migrated on load.
- The net layer (`src/nets/`) is derived from wires on demand ("Rebuild from
  Wires"), not maintained live — a freshly drawn wire has no `netId` until the
  next rebuild, though hover-highlight and short detection work without one.
- Routing (`src/routing/`) is **non-destructive**: it replaces only its own
  non-locked `generated` wires, leaving every hand-drawn wire (the logical layer)
  intact. Net terminals come from the logical wires. A net locks (`INet.locked`)
  when you hand-edit any of its wires' colour or width; "Unlock & re-route net"
  in the canvas context menu clears it. Locked nets and wires with no `netId` are
  never touched. Unroutable nets are reported by name in `#routeStatus`, never
  dropped. Routing UI/actions live on the solder side only.
- `no-unused-vars` is enforced by both `noUnusedLocals/Parameters` (tsconfig) and
  eslint — the pure routing modules must not leave dangling params.
- Solder-side view (`Canvas.solderSide`) mirrors X in the single canvas
  transform; text goes through `Canvas.fillText()` to stay upright. `save-image`
  exports whatever side is showing. The two faces are also the logical/physical
  split: **component side** = components + hand-drawn (`!generated`) wires + the
  Components catalog, no net visuals; **solder side** = components hidden & inert,
  the router's `generated` wires (per-net fallback to hand-drawn until routed),
  net colours / hover-highlight / short rings, the Nets panel. Face-dependent
  wire visibility is `wireVisible()` in `draw-canvas.ts`; the two sidebar
  sections toggle via `[hidden]` on `#netsPanelWrap` / `#componentsPanelWrap`.
- No CI. `lint` + `typecheck` + `format` + `test` are the checks; `lint` still
  emits 6 `any`-related warnings (0 errors) — `no-explicit-any` is deliberately
  set to `warn` in `eslint.config.js`. Tests (Vitest) exist ONLY for
  `src/routing/` — the rest of the app is browser-coupled by design; don't add
  tests elsewhere.
- Source has never been run through Prettier; `pnpm format:check` currently flags most
  files. Run a one-time `pnpm format` when convenient (separate commit).

## Attribution

End commit messages with:
`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
