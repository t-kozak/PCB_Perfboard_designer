import { State } from "../state/State";
import { findShorts, labelConflicts, physicalTerminalShorts } from "../nets/derive";

// Sidebar "Nets" panel (solder side): the derived net list plus any shorts.
// Nets are recomputed automatically on every connection/component mutation and
// before every solder-side repaint — there is no manual "rebuild" any more.
// The derive helpers stay pure; this file is the DOM half.

function renderNetInfo(): void {
  const el = document.getElementById("netInfo");
  if (!el) return;

  const shorts = new Set<string>([
    ...findShorts(State.lines),
    ...labelConflicts(State.connections, State.placedIcs),
    ...physicalTerminalShorts(State.connections, State.placedIcs),
  ]);

  if (State.nets.length === 0) {
    el.innerHTML =
      `<div style="font-size:0.75rem;color:var(--text-muted);">No nets yet — connect some pins.</div>`;
    return;
  }

  const rows = [...State.nets]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(n => {
      return `<div style="display:flex;align-items:center;gap:6px;font-size:0.75rem;padding:2px 0;">
        <span style="width:10px;height:10px;border-radius:2px;flex:0 0 auto;background:${n.color || "#888"};"></span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${n.name}</span>
      </div>`;
    })
    .join("");

  el.innerHTML =
    `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">${State.nets.length} net(s)</div>` +
    rows +
    (shorts.size
      ? `<div style="margin-top:6px;color:#f87171;font-weight:700;font-size:0.75rem;">⚠ ${shorts.size} shorted pad(s)</div>`
      : "");
}

// Connection / component mutations and project loads dispatch this so the panel stays current.
window.addEventListener("nets-changed", renderNetInfo);

renderNetInfo();
