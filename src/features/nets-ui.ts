import { State } from "../state/State";
import { redrawCanvas } from "./draw-canvas";
import { rebuildNets } from "../nets/rebuild";
import { findShorts, labelConflicts } from "../nets/derive";

// Sidebar "Nets" panel: rebuild the logical layer from wires, toggle net
// colouring, and surface the net list plus any shorts. The derive/rebuild
// modules stay pure; this file is the DOM half.

function renderNetInfo(): void {
  const el = document.getElementById("netInfo");
  if (!el) return;

  const shorts = new Set<string>([
    ...findShorts(State.lines),
    ...labelConflicts(State.lines, State.placedIcs),
  ]);

  if (State.nets.length === 0) {
    el.innerHTML =
      `<div style="font-size:0.75rem;color:var(--text-muted);">No nets yet — draw wires, then Rebuild.</div>`;
    return;
  }

  const rows = [...State.nets]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(n => `<div style="display:flex;align-items:center;gap:6px;font-size:0.75rem;padding:2px 0;">
        <span style="width:10px;height:10px;border-radius:2px;flex:0 0 auto;background:${n.color || "#888"};"></span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${n.name}</span>
        ${n.locked ? '<span title="hand-locked">🔒</span>' : ""}
      </div>`)
    .join("");

  el.innerHTML =
    `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">${State.nets.length} net(s)</div>` +
    rows +
    (shorts.size
      ? `<div style="margin-top:6px;color:#f87171;font-weight:700;font-size:0.75rem;">⚠ ${shorts.size} shorted pad(s) — two nets on one pad</div>`
      : "");
}

export function refreshNets(): void {
  rebuildNets();
  renderNetInfo();
  redrawCanvas();
}

document.getElementById("rebuildNetsBtn")?.addEventListener("click", refreshNets);

const colorToggle = document.getElementById("colorByNetToggle");
if (colorToggle) {
  colorToggle.addEventListener("click", () => {
    State.showNetColors = !State.showNetColors;
    colorToggle.classList.toggle("active-mode", State.showNetColors);
    redrawCanvas();
  });
}

// Wire mutations and project loads dispatch this so the panel stays current.
window.addEventListener("nets-changed", renderNetInfo);

renderNetInfo();
