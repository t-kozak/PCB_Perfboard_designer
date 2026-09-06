# Logical connections — design spec

**Status:** implemented (M6–M11, then §11). Connections are the source of truth;
the solder side is a stateless view that re-derives wires from them every paint
(see §11 — it supersedes the routing-cache design in M10/M11).
**Scope:** Make the component side *fully logical* and the solder side *fully
physical*. A connection stops being "a wire between two holes" and becomes "a
joint between two component legs". Wires exist only on the solder side, and are
produced from connections when the board is flipped.
**New runtime dependencies:** none. **Estimated total:** ~900 LOC across six
milestones, plus a save-format migration.

This supersedes part of [`autorouting.md`](autorouting.md) — see §8. Read §1 and
§2 first; the milestones in §5 are in strict dependency order and M6/M7 are
gates.

---

## 1. The problem

`autorouting.md` §1 chose **"wires are truth, nets are derived"**: keep drawing
pad-to-pad wires exactly as before, union-find them into nets, and let the
router rewrite the non-locked ones. That was the cheap way to get a logical
layer without building a second app, and it worked — M2–M5 shipped on it.

What it did not do is change *what the user draws*. The component side still
runs `addNewLineIfNeeded()` ([select.ts:191](../src/features/select.ts#L191)):
click a hole, click another hole, get an `ILine` between two `IDot`s. The
result is a hybrid:

- A connection is anchored to **board geometry**, not to the parts. Drag an
  NE555 two holes to the left and every wire you drew to its pins stays behind,
  now connected to nothing. The design silently breaks and nothing reports it.
- The same object (`ILine`) means both "pin 3 must reach pin 7" and "there is a
  physical wire here". The faces papered over this by *filtering* — the
  component side hides `generated` wires, the solder side hides hand-drawn ones
  ([draw-canvas.ts:161](../src/features/draw-canvas.ts#L161)) — but both faces
  are still reading the same list.
- Net names are inferred from whatever pin label a wire endpoint happens to
  land on ([derive.ts:105](../src/nets/derive.ts#L105)). Correct only as long as
  nothing has moved.

The two-step workflow ("lay out logically, then flip and route") therefore
survives by convention only. This spec makes it structural.

### The decision: connections are truth, wires are output

| | Today | This spec |
| :--- | :--- | :--- |
| Source of truth | `State.lines` (pad-to-pad wires) | `State.connections` (pin-to-pin edges) |
| Anchored to | board coordinates | component + pin number |
| Survives a component move | ✗ | ✓ (by construction) |
| Component side draws | wires | connections (rubber bands) |
| Solder side draws | wires | wires |
| Wires are produced | on demand, "Route" button | **on flipping the board** |
| Bare-hole endpoint | implicit, unnamed | an explicit **bridge** component |

This is Option A from `autorouting.md` §1, which that spec rejected as "a second
app inside the app". Three things have changed since: the solder-side view (M2)
already gives us the second surface, the router (M4/M5) already consumes an
abstract net list, and the migration cost is now bounded — a v2 project converts
to connections mechanically (§6).

---

## 2. The model

Three new types, one new component kind, and one field that stops being
authoritative.

```ts
/** One leg of one placed component. The atom of the logical layer. */
export interface ITerminal {
  /** `Ic.id` of a *placed* component (crypto.randomUUID, stable since M0). */
  icId: string;
  /** 1-based pin number, as produced by Ic.getPinPositionOnIC(). */
  pin: number;
}

/** "These two legs are the same electrical node." */
export interface IConnection {
  id: string;
  a: ITerminal;
  b: ITerminal;
  /** Derived by the net layer; not user-owned. */
  netId?: string;
  /** Optional user annotation shown on the component side. */
  label?: string;
}
```

Rules, in full:

1. **A connection joins exactly two terminals.** Not three, not a pad.
   Multi-point nets are *emergent*: three connections sharing a terminal form
   one net, exactly as three wires do today.
2. **`a.icId === b.icId` is legal** — a component with two of its own pins
   strapped together (the user's "single component can have two pins bridged").
   `a.icId === b.icId && a.pin === b.pin` is not: a pin cannot connect to
   itself.
3. **Duplicate connections are collapsed** on creation. `{a,b}` and `{b,a}` are
   the same connection; store them canonically (lower `icId#pin` first) so
   dedup is a string compare.
4. **A terminal referencing a deleted component is invalid.** Deleting a
   component cascades to its connections, as one undo entry.
5. **Connections carry no geometry at all.** Where a connection is *drawn* is
   resolved at paint time from the component's current position and rotation.
   That is the whole answer to "connections must follow their pins".

### The bridge

```
Ic("Bridge", widthPin: 1, heightPin: 1, pinDescription: {1: ""}, kind: "bridge")
```

A one-pad component occupying a single hole, with exactly one pin. It is what
you place when you genuinely want to connect *to the board* rather than to a
part: a wire junction, a test point, an off-board lead, a deliberate solder
blob. It is drawn as a small filled ring on the pad (not a package body), it
never hides the dot underneath it (`hidesDot()` returns false, like leaded
parts — [ic.ts:617](../src/features/ic.ts#L617)), and its `bodyRect()` is a
dot-sized square centred on its pad rather than the degenerate 0×0 pin span the
generic formula would give ([ic.ts:231](../src/features/ic.ts#L231)).

The bridge exists so that **every terminal is a component pin, with no
exceptions**. Without it we would need a second terminal variant
(`{x, y}`-anchored) and we would be back to the hybrid model this spec is
removing. It is also what makes v2 migration total (§6).

Rotation is a no-op for a bridge; `pinDot(1)` is its own pad in all four
orientations.

### What happens to `ILine`

`ILine` keeps its shape and stops being user-authored on the component side.
After this change every line in `State.lines` is either:

- `generated: true` — output of a routing pass, owned by the router, and
- `generated: true, locked-net` — the same, but its net is hand-locked so the
  router leaves it alone (the existing `INet.locked` mechanism, unchanged).

Hand-drawing a wire remains possible **on the solder side only**, and does what
it does today: it locks the net. There is no wire tool on the component side.

### The pin→pad inverse

The one genuinely missing primitive. `Ic.getPinPositionOnIC(dot)`
([ic.ts:629](../src/features/ic.ts#L629)) maps *pad → pin*; the renderer now
needs *pin → pad*:

```ts
/** Board coordinate of pin `n` in the component's current position/rotation. */
pinDot(pin: number): { x: number; y: number } | null
```

It is the same four-branch rotation table read backwards, and it must agree
with `getPinPositionOnIC` exactly — a round-trip property worth a test even
though `src/features/` is otherwise untested (§7).

---

## 3. Interaction

### Component side — the Connect tool

The `wire` tool mode becomes `connect` (`State.activeToolMode`,
[State.ts](../src/state/State.ts)). Its behaviour:

| Action | Result |
| :--- | :--- |
| Click a component pin | Becomes the pending terminal; a rubber band follows the cursor. |
| Click a second pin | Creates the connection; pending clears. |
| Click the *same* pin | Cancels the pending terminal. |
| Click an empty hole | Nothing. Bare holes are not connection targets. |
| `Escape` | Cancels the pending terminal. |
| Hover any pin | Highlights every terminal already on that pin's net. |

**Pins are the only click targets in connect mode.** To connect to a bare
hole you place a bridge there first, from the Components catalog, exactly as you
place any other part — connecting is then pin-to-pin like everything else. This
keeps the tool doing one thing and keeps the model with no special cases; it
costs a click, which the controls revamp is free to buy back later.

Pads keep their colour/note annotations, which stay purely cosmetic.

### Rendering connections

Connections are drawn on the component side **above** component bodies, as thin
(2px) straight lines between resolved pin coordinates, in their net's colour,
with a small dot at each terminal. They must not read as wires — use a
dashed-or-translucent treatment distinct from the solid, round-capped
`drawLine()` stroke, because the user is looking at a *schematic overlay*, not
at copper.

While a component is being dragged, its connections re-resolve every frame and
follow it. The renderer already repaints everything on every mouse move
([draw-canvas.ts](../src/features/draw-canvas.ts)), so this costs nothing
beyond the resolve.

### Solder side — unchanged, plus the flip trigger

Flipping to the solder side is now the *build* action:

1. Rebuild nets from connections.
2. For every net that is **stale** and **not locked**, run `route()`.
3. Report in `#routeStatus`: how many nets were routed, and any that failed.

A net is stale when its **signature** differs from the one recorded at its last
routing pass. The signature is the sorted list of its terminals' current pad
keys (`"x,y"`), so it changes when a connection is added or removed, when a
component moves or rotates, and when a bridge is placed — and *only* then.
Store it as `INet.routedSignature?: string`.

A locked net that has gone stale is not rewritten. It is listed in the Nets
panel with a ⚠ and an "unlock & re-route" affordance — the existing
`unlockAndReroute()` path ([routing.ts](../src/features/routing.ts)), already
wired to the context menu.

The "Route (Orthogonal)" and "Tidy (MST)" buttons stay, as an explicit
force-reroute of everything. Flipping back to the component side does nothing;
wires simply become invisible again.

---

## 4. State, persistence, undo

### State

```ts
State.connections: IConnection[]          // new — the logical layer
State.selectedConnection?: IConnection    // new
State.hoverConnection?: IConnection       // new
State.pendingTerminal?: ITerminal         // new — connect tool, first click
State.lines: ILine[]                      // now: generated wires only
```

### Save format — version 3

```ts
interface IProjectSave {
  version: 3;
  connections: IConnection[];   // new — the source of truth
  lines: ILine[];               // generated wires, a cache; safe to discard
  nets: INet[];                 // + routedSignature
  dots: IDot[]; ICs: Ic[]; placedIcs: any[];
  canvas: { width: number; height: number };
}
```

`lines` is written for round-trip fidelity (so a loaded project draws its solder
side without an immediate re-route), but it is derived data — a project that
loads with `lines: []` is fully recoverable by flipping the board.

### Undo

`IChange` currently holds wires only
([undo-redo.ts:25](../src/features/project/undo-redo.ts#L25)). It grows a
second pair of buckets:

```ts
interface IChange {
  added?: ILine[]; removed?: ILine[];
  connectionsAdded?: IConnection[]; connectionsRemoved?: IConnection[];
  componentsAdded?: Ic[]; componentsRemoved?: Ic[];   // for cascade delete
}
```

Connections match by `id` (unlike wires, which match by coordinate pair — they
have no id). Deleting a component and its N connections is one entry.

Component **moves** remain outside undo, as today. That is now less dangerous
than it was: moving a component no longer destroys connectivity.

---

## 5. Milestones

Strict dependency order. **M6 and M7 are gates.**

### M6 — Bridge component + `pinDot()` · *gate* · ~120 LOC

Touches: `features/ic.ts`, `features/draw-canvas.ts`

- Add `pinDot(pin)` — the inverse of `getPinPositionOnIC`, for all four
  rotations. Unit-test the round trip (§7).
- Add `kind: "bridge"`: 1×1, one pin, custom `bodyRect()` (dot-sized),
  `hidesDot()` false, its own tiny ring artwork, `icon` "•", rotation inert.
- Register it first in `loadDefaultIcs()` so it heads the catalog.

**Done when:** a bridge can be placed on any hole, is selectable, draggable,
deletable, and `pinDot(getPinPositionOnIC(d).pin)` returns `d` for every pin of
every catalog part in every rotation.

### M7 — Connection model, save v3, migration · *gate* · ~250 LOC

Touches: `interfaces/` (new `connection.interface.ts`), `state/State.ts`,
`project/save-project.ts`, `project/load-project.ts`, `project/undo-redo.ts`,
`project/reset-project.ts`

- `ITerminal` / `IConnection`; `State.connections`; canonical ordering + dedup
  helper.
- `IChange` gains the connection and component buckets; `recordChange()` stays
  the single push site.
- Save writes `version: 3` with `connections`. Load migrates v1/v2 per §6.

No UI yet. Verify by loading a v2 project and inspecting `State.connections`.

**Done when:** an existing v2 project round-trips to v3 with one connection per
former hand-drawn wire, a bridge for every bare-hole endpoint, and no wire lost.

### M8 — Connect tool + connection rendering · ~300 LOC

Touches: `features/connect.ts` (new), `features/select.ts`, `features/hover.ts`,
`features/draw-canvas.ts`, `features/connections-ui.ts` (new), `index.html`,
`src/index.ts`

- Rename the `wire` tool to `connect` on the component side; implement the
  interaction table in §3.
- Draw connections (rubber-band style), the pending rubber band, hover and
  selection states; delete via `Delete`, the eraser, and the context menu.
- Delete a component → cascade its connections, one undo entry.
- "Connections" sidebar panel on the component side, mirroring the Nets panel:
  count, list grouped by net, click-to-select, per-connection delete.
- Remove `addNewLineIfNeeded()` ([select.ts:191](../src/features/select.ts#L191))
  from the component-side path entirely.

**Done when:** you can build an NE555 blinker without touching the solder side,
drag every part around, and watch every connection follow its pins.

### M9 — Nets derived from connections · ~180 LOC

Touches: `nets/derive.ts`, `nets/rebuild.ts`, `features/routing.ts`,
`features/nets-ui.ts`, `features/draw-canvas.ts`

- `deriveNets()` takes `IConnection[]` plus a terminal resolver instead of
  `ILine[]`; union-find keys become `icId#pin`, not `"x,y"`. It stays pure.
- Net naming improves for free: a terminal *is* a pin, so
  `pinDescription[pin]` is read directly instead of guessing from whatever pad
  a wire landed on. Drop `pinResolver()`'s coordinate lookup.
- `netAtLine()` gains a sibling `netAtConnection()` for component-side hover
  highlight.
- Shorts split into two checks:
  - **logical** — one net carrying two canonical names (GND *and* VCC): the
    existing `labelConflicts`, now exact.
  - **physical** — two terminals of *different* nets resolving to the same pad,
    i.e. overlapping component placement. This is new, and only detectable now
    that terminals and pads are separate concepts.
- `collectNets()` ([routing.ts:26](../src/features/routing.ts#L26)) sources pads
  from terminals rather than from hand-drawn wires.

**Done when:** the Nets panel is populated with zero wires on the board, and
hovering a connection lights its whole net on the component side.

### M10 — Route on flip · ~150 LOC

Touches: `src/index.ts` (solder-side toggle), `features/routing.ts`,
`interfaces/net.interface.ts`, `features/nets-ui.ts`

- `INet.routedSignature`; compute + compare per §3; route only stale, unlocked
  nets on flip to the solder side.
- Status readout: "Routed 4 net(s); 1 unchanged; GND locked & stale."
- Stale-but-locked nets flagged in the Nets panel with the unlock affordance.

**Done when:** flipping the board turns a freshly drawn schematic into wires,
flipping twice with no edits in between routes nothing, and moving one part
re-routes only the nets that part is on.

### M11 — Remove the hybrid · ~100 LOC

Touches: `features/select.ts`, `features/line.ts`, `features/hover.ts`,
`index.html`, `CLAUDE.md`, `docs/autorouting.md`

- Delete the component-side pad-to-pad wire path and its shortcuts.
- Wire colour/thickness controls move under the solder side; on the component
  side they restyle the selected *connection* (which is per-net, not per-wire).
- Update `CLAUDE.md`'s layout table and the `autorouting.md` header per §8.

**Done when:** there is no way to create an `ILine` from the component side.

---

## 6. Migration

v1 and v2 projects carry hand-drawn wires and no connections. On load, for each
`!generated` line, in order:

1. Resolve each endpoint pad to a terminal via
   `placedIcs.find(ic => ic.getPinPositionOnIC(dot))`.
2. If an endpoint is **not** on any component pin, **create a bridge** at that
   pad (once per pad — cache by `"x,y"`) and use its pin 1.
3. Emit one `IConnection` between the two terminals; drop duplicates.
4. Discard the hand-drawn line. Keep `generated` lines as the current wiring
   cache; they will be replaced on the next flip anyway.

Two endpoints on the same pin (a degenerate self-loop) are dropped with a
console warning. Everything else migrates without loss, which is the payoff for
insisting that every terminal be a component pin (§2).

`localStorage` autosave (`save` key,
[save-progress.ts](../src/features/project/save-progress.ts)) goes through the
same path, so a returning user's in-progress board converts silently on their
next visit. Migration is one-way; make that explicit in the README so nobody
expects a v3 file to open in an older build.

---

## 7. Testing

`vitest.config.ts` globs `src/routing/**/*.test.ts` and CLAUDE.md says not to
widen it. This change justifies exactly two narrow exceptions, both for pure
functions with obvious invariants:

- `src/nets/derive.test.ts` — union-find over connections, naming, both short
  checks. `derive.ts` is already pure and DOM-free.
- The `pinDot` ↔ `getPinPositionOnIC` round trip. `Ic` imports `Canvas` and
  `State`, so this needs the geometry extracted into a pure
  `src/features/ic-geometry.ts` first — worth doing regardless, since M6 adds
  the second consumer of that table.

Everything else stays browser-verified. Do not widen the glob further.

---

## 8. What this changes in `autorouting.md`

That document is canonical for the router and should be amended, not deleted:

- **§1's decision is reversed.** "Wires are truth, nets are derived" becomes
  "connections are truth; nets are derived from connections; wires are output".
  Option A is adopted after all, in the form the solder-side view made cheap.
- **§2's model** gains `IConnection` / `ITerminal` above `INet`. `ILine`'s
  `netId` / `generated` fields survive unchanged, and `generated` becomes true
  of every wire.
- **§4 M3** (net derivation from wires) is superseded by M9 here.
- **§3, §4 M4, §4 M5 are untouched.** The router's contract is
  `RouteNet[] → ILine[]` ([routing/types.ts](../src/routing/types.ts)); it never
  learns that connections exist. That isolation is what makes this change
  affordable, and is the strongest argument for having kept `src/routing/` pure.
- **§5's non-goals still hold** — in particular, no auto-placement.

The stripboard note in §5 gets *better*: with connections as truth, switching
the physical model to "where do I cut the track" changes only the router.

---

## 9. Non-goals

| Not building | Why |
| :--- | :--- |
| A separate schematic canvas | The component side *is* the schematic view now. A second canvas with its own coordinate space is the "app inside an app" that §1 of `autorouting.md` rightly feared. |
| Connection routing on the component side | Rubber bands are straight lines on purpose. Anything prettier invites the reader to mistake them for wires. |
| Buses / named net objects the user creates directly | Nets stay derived. A user-created net is a third source of truth. |
| Undo for component moves | Out of scope; moves are no longer destructive. |
| Backwards-compatible v3→v2 export | One-way migration only. |
| ERC beyond the two short checks in M9 | The rabbit hole `autorouting.md` §5 already declined. |

---

## 10. Open questions

1. **Should a bridge be deletable while connections reference it?** Cascade
   (delete its connections too) is consistent with other components, but a
   bridge is more "infrastructure" than "part". Recommend cascade, for one rule
   instead of two.
2. **Two components' pins in the same hole.** M9 flags it as a physical short.
   Should placement *prevent* it instead? Recommend flag-not-prevent — the
   renderer already has the ring, and prevention needs a placement validator
   that does not exist.

---

## 11. The solder side goes stateless

**Status:** implemented. Supersedes the routing-cache half of M10/M11.

M10 kept a *persistent* router output (`State.lines`) and a staleness protocol
(`INet.locked` + `INet.routedSignature`) to decide when to re-route. That was a
second model of the wiring kept loosely in sync with the connections, and it
drifted: moving or deleting a component left `State.lines` pointing at old pads,
and the lock/signature machinery still leaked bugs.

The model now:

| | M10 | §11 |
| :--- | :--- | :--- |
| `State.lines` | persisted router output, undo-tracked, hand-editable | transient render cache, recomputed every paint, never saved |
| Routing unit | net → MST over its pads → routed edges | **one connection → one wire** |
| Wire colour / width | `INet.color` + "Color by Net"; per-wire on hand edit | `IConnection.color` / `IConnection.width` only |
| Routing control | Tidy / Route buttons + per-net lock + unlock affordances | one global `routingMode`: `"orthogonal"` \| `"direct"` |
| Re-route trigger | flip + `netSignature()` vs `routedSignature`, per net | a full input signature over *all* connections; recompute when it changes |
| Hand-drawn wires | allowed on the solder side (locked the net) | none — the solder side is a pure view |

- `src/features/wire-cache.ts` owns `refreshWireCache()`: it builds one
  `RouteEdge` per connection (terminals resolved to pads, colour/width attached,
  `netId` from the net rebuild), runs `route()` or `directWires()`, and writes
  `State.lines`. Guarded by `wireSignature()` = `routingMode` + every
  connection's `id:color:width:padKeyA:padKeyB`, so any component move, rotate,
  delete or bridge placement changes the signature and forces a recompute — the
  cache can never be silently stale.
- `src/routing/` contract shrinks to `RouteEdge[] → ILine[]`. `route()` still
  does orthogonal A* over the straight-run pad lattice, but pad *ownership* is
  keyed by `netId`, so two connections on one net (a daisy chain) may share a
  pad while different nets still may not. `tidy.ts` / `mst()` are deleted.
- `INet` is `{id, name, color?}` — `color` is a derived sidebar swatch, never a
  wire colour. `INet.locked` / `routedSignature` are gone.
- Save format is **version 4**: `connections` (carrying colour/width) +
  `routingMode`, no `lines`, no `nets`. A v3 file adopts each connection's saved
  net colour onto the connection on load so boards keep their look.
- Undo no longer has wire buckets (`IChange` is connections + components only).
