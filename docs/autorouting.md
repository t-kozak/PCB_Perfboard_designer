# Autorouting — design spec

**Status:** M0–M5 all implemented, then reworked. The board routes itself, but
the router contract and the solder side changed twice: first
[`logical-connections.md`](logical-connections.md) made connections the source
of truth, then its §11 made the solder side **stateless** — one wire per
connection, re-derived every paint, global orthogonal/direct switch, no MST, no
per-net locking. The router is now `RouteEdge[] → ILine[]` (see
`logical-connections.md` §11); `tidy.ts` / `mst()` are gone. §3's cost model
and the A* machinery in `route.ts` are unchanged.
**Scope:** Split "what is connected" from "where the wire runs", so the board can route itself.
**New runtime dependencies:** none at runtime. **Dev:** Vitest, scoped to
`src/routing/` only (`pnpm test`). **Actual total:** ~1100 LOC across six milestones.

> **Superseded in part by [`logical-connections.md`](logical-connections.md)
> (implemented).** That spec reverses §1's decision below — connections
> (pin-to-pin, not wire-to-wire) are now the source of truth, and nets derive
> from connections, not from `State.lines`. §4 M3 (net derivation from wires)
> is superseded by that spec's M9; §4 M4 (MST tidy) and per-net locking are
> superseded by its §11 (stateless solder side, one wire per connection). §3's
> cost model and `route.ts`'s A* are unchanged, but the router's contract is
> now `RouteEdge[] → ILine[]`, not `RouteNet[] → ILine[]`.

A rendered version of this spec exists as an artifact; this file is the canonical
copy. If you are a future session picking this up, read §1 and §4 first — the
milestones are in strict dependency order and M0/M1 are gates.

---

## 1. The problem

`ILine` (`src/interfaces/line.interface.ts`) currently means two unrelated things
at once:

1. *"these two pads are electrically connected"* (logical), and
2. *"there is a physical wire drawn here"* (physical).

Auto-routing **is** the function `logical → physical`, so it cannot exist until
those are separate concepts. Every other decision below follows from how the
split is made.

### The decision: wires stay the source of truth

> **Reversed by `logical-connections.md`.** Option A below was adopted after
> all, once the solder-side view (M2) made the "second surface" cheap instead
> of a second app. See that spec's §1.

Two ways to split it were considered.

**Option A — netlist is truth.** Add a schematic mode: a net editor, a net list
panel, a second drawing tool. Wires become pure output. Matches the two-step
mental model literally, but it is a second app inside the app, and every wire
drawn to date becomes a second-class citizen needing migration. **Rejected.**

**Option B — wires are truth, nets are derived.** Keep drawing wires exactly as
today. Union-find over `State.lines` groups connected pads into nets. "Route"
then rewrites the wires of any net that has not been hand-locked. No new mode,
no new tool, and old projects load unchanged as manually-locked nets.
**This spec.**

The two-step workflow ("lay out logically, then invert and route") survives by
convention rather than by mode: in step one you drag sloppy direct pin-to-pin
wires, you press Route, and they become tidy orthogonal paths. What gets
maintained forever is one pure module plus two optional fields on an existing
interface.

---

## 2. The model

Two added fields, one added collection. **The renderer never learns that routing
exists** — `redrawCanvas()` needs no change, because the router emits plain
`ILine`s.

```ts
// Physical layer — unchanged shape, two new optional fields.
interface ILine {
  start: IDot; end: IDot; color?: string; width?: number;
  netId?: string;      // which net this wire realises
  generated?: boolean; // router owns it — safe to discard and redo
}

// Logical layer — new, persisted, seeded from existing wires.
interface INet {
  id: string;
  name: string;      // "GND", "VCC", "N$3"
  color?: string;
  locked?: boolean;  // hand-edited — the router must not touch it
}

// The whole router surface. Pure: no DOM, no State, no canvas.
function route(
  nets: INet[], pads: IDot[], locked: ILine[], opts: RouteOpts
): { lines: ILine[]; failed: string[] }
```

That purity is the entire maintainability argument: the algorithm can be
rewritten later and nothing else in the app notices. Enforce it by convention —
nothing under `src/routing/` may import the DOM, `State`, or `Canvas`.

---

## 3. Perfboard is not a PCB

Components sit on the top face; wires run on the solder side. **Components are
therefore not obstacles.** Insulated hookup wire crosses other wire freely. The
board is essentially an open grid with three hard constraints — which is
why obstacle avoidance, the whole game in real PCB routing, barely features
here.

| Situation | Rule | Cost | Why |
| :--- | :--- | :--- | :--- |
| Two nets on one pad | **Forbidden** | ∞ | A short circuit. |
| Two wires along one channel | **Forbidden** | ∞ | One gets drawn on top of the other and vanishes. |
| Wire crosses another wire | Allowed | small | Insulated wire. Tidiness preference, not a violation. |
| Wire passes over a foreign bare hole | Allowed | small | Legal, but fiddly to solder around later. |
| Wire crosses a solder joint | **Forbidden** | ∞ | A lead is already in that hole; wire cannot lie flat across it. |
| Wire passes under a component | Free | 0 | Opposite face of the board entirely. |
| Long straight run along a row/column | Preferred | length | How people actually build: few wires, each cut once. |
| Direction change | Allowed | + turn penalty | Suppresses staircase paths; keeps segment count low. |

A **channel** is the gap between two adjacent pads in a row or column — the
atomic piece of board a wire can occupy. Two wires may meet at a pad and cross
(perpendicular channels: the whole point of a perfboard) but may never share a
stretch of the same row or column, because the second is then painted over the
first and disappears. Unlike the pad rule, this one binds *all* wires, same net
included: two physical wires are two physical wires. It is enforced in
`neighborsOf()` by walking outward pad by pad and *stopping* at an occupied
channel, so a straight run can never hop over a stretch another wire owns.
Because the constraint is hard, ordering matters — the board is re-routed up to
three times with the previous round's failures moved to the front, and the
attempt with the fewest failures wins.

A **solder joint** is a hole with a component pin in it — `RouteBoard.soldered`,
which `wire-cache.ts` fills from every placed component's pins, wired or not. It
stops a run dead: a wire may *end* on one if the joint belongs to its own net
(that is how a daisy chain reaches a pin), but it may never run across one, and
it may not land on another component's pin at all — so an unwired pin is a plain
wall. This is what keeps wire off the pin rows of a DIP instead of laying it
across fourteen solder blobs, and it is why routing around a densely populated
IC now sometimes reports a failure rather than drawing something unbuildable.
`direct` mode ignores all of this by design.

### Two findings from reading the current code

**Placed-component ids are weak.** `Ic.id = Math.random() * 100`
(`src/features/ic.ts:12`) is a collidable float shared between catalog templates
and placed clones, and `deserializePlacedIc` coerces it back with
`Number(data.id)` (`src/features/project/load-project.ts:47`). Nets reference
pins as `{icId, pin}`, so this must be solid before anything else lands.

**Save/load severs endpoint identity.** `getSaveJson()`
(`src/features/project/save-project.ts:39`) writes `State.lines` out whole, so
each line's `start`/`end` are serialised inline and `JSON.stringify` duplicates
the dot objects. After
`loadProject()`, a line's endpoints are *different objects* from the matching
entries in `State.dots`. Net derivation must key on `x,y` coordinates, never
object identity — and the existing undo path, which compares endpoints with `==`
(`src/features/project/undo-redo.ts:14`), is already quietly affected on loaded
projects.

---

## 4. Milestones

Strict dependency order. Each is useful shipped alone, so work can stop after
any of them. **M0 and M1 are gates** — they must precede the router, because
retrofitting either afterwards means reopening it.

### M0 — Stable identity & versioned saves  ·  *gate*  ·  ~80 LOC  ·  ✅ done

Implemented: `Ic.id` is `crypto.randomUUID()`; `IProjectSave.version = 2` with a
v1→regenerate-ids migration; `loadProject()` re-hydrates every wire endpoint to
the canonical `State.dots` entry by `"x,y"`.


Touches: `src/features/ic.ts`, `project/save-project.ts`,
`project/load-project.ts`, `interfaces/project-save.interface.ts`

- Replace `Math.random() * 100` with `crypto.randomUUID()`; `id` becomes
  `string`. Drop the `Number(data.id)` coercion on load.
- Add `version: 2` to `IProjectSave`. A missing version means v1 — migrate by
  regenerating component ids.
- On load, rehydrate every line endpoint to the canonical `State.dots` entry by
  coordinate, fixing the severed-identity issue in §3.

**Done when:** save, reload, then undo — the correct wire disappears. Every
placed component carries a unique string id that survives a round-trip.

### M1 — Batch undo entries  ·  *gate*  ·  ~60 LOC  ·  ✅ done

Implemented: `IChange` is `{ type, lines: ILine[] }`; `recordChange()` in
`undo-redo.ts` is the single push site; lines matched by coordinate pair.


Touches: `interfaces/change.interface.ts`, `project/undo-redo.ts`,
`features/select.ts`, `features/line.ts`

- `IChange` becomes `{ type: 'add' | 'remove'; lines: ILine[] }`.
- Update the undo/redo loops and the three push sites — wire creation in
  `select.ts` (~line 194), the two delete paths in `line.ts`.
- Match lines by coordinate pair rather than object reference, consistent with M0.

A routing pass adds forty wires as one user action. Without this the router is
simply not undoable — and adding batch undo later means touching the router
itself.

**Done when:** one `Ctrl+Z` reverses an entire multi-wire operation, and
single-wire undo behaves exactly as before.

### M2 — Solder-side view  ·  *ships alone*  ·  ~90 LOC  ·  ✅ done

Implemented: `Canvas.solderSide` flips the X scale in `applyResolution()` /
`screenToBoard()`; `Canvas.fillText()` counter-flips each string; amber board
border + `SOLDER SIDE` badge + status-bar toggle.

**Extended — the two faces carry different layers.** The mirror also became the
logical/physical split from the user's mental model:

| | Component side (default) | Solder side |
| :-- | :-- | :-- |
| Shows | components + **hand-drawn wires only** (`!generated`) | **no components**; the router's `generated` wires (or a net's hand-drawn wires until it is routed) |
| Net colours / hover-net highlight / short rings | off | on |
| Sidebar | "Components" catalog | "Nets" panel (rebuild / tidy / route) |
| Component hit-testing (`hover.ts`, `select.ts`, `ic.ts` rotate) | normal | inert |

`draw-canvas.ts` gained `wireVisible()` + a `routedNetIds` set;
`#netsPanelWrap` / `#componentsPanelWrap` are toggled with `[hidden]` from the
solder-side handler in `src/index.ts`.


Touches: `src/state/Canvas.ts`, `features/draw-canvas.ts`, `features/ic.ts`,
`index.html`

Mirror the board so that when you physically flip it, the on-screen layout
matches the copper side you are soldering.

- Negate the X scale in `Canvas.applyResolution()` and correspondingly in
  `screenToBoard()` — the app has exactly one transform point, which is what
  makes this cheap.
- Counter-transform text so labels read forward: `drawPinLabels()`,
  `drawLabel()`, `drawNote()`, and pad descriptions in `drawDot()`.
- Make the state unmistakable — a tinted board edge plus a persistent
  `SOLDER SIDE` badge. A mirrored view you have forgotten you are in is how
  boards get built backwards.

No data model change, and the highest value-per-line item here. It also
motivates the routing model: wires belong on this face, components on the other.

**Done when:** toggling the view and flipping the physical board put every pad
in the same place, with all text still legible.

### M3 — The net layer  ·  *ships alone*  ·  ~150 LOC  ·  ✅ done · superseded by `logical-connections.md` M9

> Nets now derive from `State.connections` (union-find on `"icId#pin"` terminal
> keys), not from `State.lines`. The description below is the pre-M9 shape,
> kept for history.

Implemented: `ILine.netId`/`generated`, `State.nets: INet[]`, pure
`src/nets/derive.ts` (union-find keyed on `"x,y"`, power-pin naming, short
detection, `netAtLine` flood) + impure `src/nets/rebuild.ts`. "Nets" sidebar
panel: Rebuild from Wires, Color by Net, net list + short count. Hovering a wire
lights its whole net; shorted pads get a red ring. Nets persist in the save and
auto-seed on load of a pre-net-layer project. Pin lookup uses
`Ic.getPinPositionOnIC` (richer than the `getPinNumber` the draft named).


Touches: `interfaces/line.interface.ts`, `src/state/State.ts`,
`src/nets/derive.ts` (new), `features/hover.ts`, `features/draw-canvas.ts`

- Add `netId` and `generated` to `ILine`; add `State.nets: INet[]`.
- Derive nets by union-find over lines, keyed on `"x,y"` strings. Resolve pins
  through the existing `Ic.getPinNumber(dot)` (`src/features/ic.ts:685`).
- Seed once from existing wires — a "Rebuild nets from wires" action — then
  persist. Old saves migrate for free.

This pays off before any routing exists: hover a wire and the whole net lights
up, nets take distinct colours, and a pad found in two nets can be flagged as a
short.

**Done when:** hovering any wire highlights every pad and wire on its net, and a
deliberate two-net pad is reported.

### M4 — MST tidy  ·  *ships alone*  ·  ~120 LOC  ·  ✅ done

Implemented: `src/routing/types.ts` (`RouteNet`/`RouteOpts`/`RouteResult`,
`DEFAULT_OPTS`), `src/routing/tidy.ts` (`mst()` Prim's + `tidy()`),
`src/routing/tidy.test.ts`. Wired through `src/features/routing.ts`
("Tidy (MST)" button). `pnpm test` runs Vitest, `vitest.config.ts` globs
`src/routing/**/*.test.ts` and nothing else.

A tidy/route pass is **non-destructive**: it replaces only its own
non-locked `generated` wires and leaves every hand-drawn wire alone (matching
"Replace only non-locked `generated` lines" above). Terminals come from the
net's *logical* wires, so re-running never accretes a previous pass's turn pads.
One batch-undo entry per pass (`recordChange({removed, added})`).

Touches: `src/routing/tidy.ts` (new), `src/routing/tidy.test.ts` (new),
`src/routing/types.ts` (new), `src/features/routing.ts` (new), `index.html`,
`vitest.config.ts` (new), `package.json`

- Minimum spanning tree over each net's nodes by Manhattan distance (Prim's),
  emitting direct pin-to-pin lines.
- Replace only non-locked `generated` lines; leave everything else untouched.
- Establish `src/routing/` as a pure directory — no import of DOM, `State`, or
  canvas, ever.

Roughly sixty percent of the value for ten percent of the code: declare five
pads are GND, get the four shortest wires joining them. This is also the one
place a test suite earns its keep — a pure function with obvious invariants — so
bring in Vitest for `src/routing/` alone. (The project otherwise has no tests;
do not expand the suite beyond this directory.)

**Done when:** tidying a five-pad net produces exactly four wires of minimum
total length, and re-running it changes nothing.

### M5 — Orthogonal router & locking  ·  ~400 LOC  ·  ✅ done

Implemented: `src/routing/astar.ts` (generic A* + binary heap),
`src/routing/route.ts` (`route()` — per-net MST, each edge A*-pathed over the
"straight run" pad graph, `state = (pad, arrivalAxis)`, cost = length + turn +
foreign-pad + crossing; shortest edge first; a routed net claims its pads so
later nets can't short onto them; unroutable nets returned in `failed`),
`src/routing/route.test.ts`. Locking: `lockNetOf()` in `features/routing.ts` is
called from wire colour / width edits (`features/line.ts`, `src/index.ts`);
`#ctxUnlockNetBtn` context-menu item (shown only for a locked net's wire) runs
`unlockAndReroute()`. "Route (Orthogonal)" button in the Nets panel.

Touches: `src/routing/route.ts` (new), `src/routing/astar.ts` (new),
`src/routing/route.test.ts` (new), `features/select.ts`, `features/line.ts`,
`features/routing.ts`, `src/index.ts`, `index.html`

- Path each MST edge with A* over the pad grid, shortest edge first. No
  rip-up-and-retry.
- **Graph edges are straight runs, not unit steps**: a pad connects to any pad
  in its row or column, at cost `length + turn penalty`. This yields a few long
  segments instead of forty tiny ones — which matters, because every segment is
  a rendered line and part of an undo entry.
- Apply the cost table from §3. Report unroutable nets by name; never silently
  drop a connection.
- **Locking:** editing any wire on a net sets `net.locked`, and a context-menu
  item offers "Unlock & re-route this net". That is the entire manual
  fine-tuning feature — generated wires are ordinary wires, editable with the
  tools that already exist.

Performance is a non-issue: a 30 × 20 board is 600 nodes and A* returns
instantly. Resist anything more elaborate.

**Done when:** a NE555 blinker routes end to end with no shorts; hand-editing
one net and re-routing leaves that net untouched; an impossible net is named in
the UI rather than dropped.

---

## 5. Explicit non-goals

Scope creep here is what would make the feature expensive to own. These are
declined on purpose — a future session should not add them without the owner
asking.

| Not building | Why |
| :--- | :--- |
| Auto-placement | The genuinely NP-hard part, and the one a hobbyist least wants — you have opinions about where your chips go. |
| Multi-layer & vias | Wrong tool. Perfboard has two faces and no copper to speak of. |
| Real DRC | The one useful check — a pad in two nets — falls out of M3 for free. Everything past that is a rabbit hole. |
| KiCad / EAGLE import | Tempting, and an endless format-parsing commitment for a tool with no backend. |
| Rip-up and retry | Report the failure and let the user move a component. Far less code, more predictable output. |

### Worth knowing now — stripboard

Veroboard would change the physical model outright: tracks arrive
pre-connected, so routing becomes *deciding where to cut* rather than where to
run wire. The net layer from M3 survives that change intact; the M5 router does
not. Nothing needs building for it today, but it is the reason to name things
"nets" rather than "wires" in the logical layer.

---

## 6. Open question

This spec reads *"invert the board"* as the mirror-for-soldering view specified
in M2. If the intent was instead two distinct screens — a schematic mode and a
layout mode — that is Option A from §1, and the milestone sequence changes
materially from M3 onward. **Settle this before M0 begins.**
