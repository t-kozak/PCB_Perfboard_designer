import {State} from "../state/State";
import {redrawCanvas} from "./draw-canvas";
import {recordChange} from "./project/undo-redo";
import {rebuildNets} from "../nets/rebuild";
import type {IConnection, ITerminal} from "../interfaces/connection.interface";

// The "Connections" sidebar panel (component side only) — mirrors the Nets
// panel: count, list grouped by net, click-to-select, per-connection delete.
// See docs/logical-connections.md M8.

function terminalLabel(t: ITerminal): string {
  const ic = State.placedIcs.find(i => i.id === t.icId);
  return ic ? `${ic.name} · pin ${t.pin}` : `? · pin ${t.pin}`;
}

function deleteConnection(conn: IConnection): void {
  const idx = State.connections.indexOf(conn);
  if (idx === -1) return;
  State.connections.splice(idx, 1);
  recordChange({ connectionsRemoved: [conn] });
  if (State.selectedConnection === conn) State.selectedConnection = undefined;
  rebuildNets();
  redrawCanvas();
  window.dispatchEvent(new Event('nets-changed'));
}

function renderConnectionsInfo(): void {
  const el = document.getElementById("connectionsInfo");
  if (!el) return;

  if (State.connections.length === 0) {
    el.innerHTML = `<div style="font-size:0.75rem;color:var(--text-muted);">No connections yet — use the Connect tool on two pins.</div>`;
    return;
  }

  const byNet = new Map<string, IConnection[]>();
  for (const c of State.connections) {
    const key = c.netId ?? "unassigned";
    (byNet.get(key) ?? byNet.set(key, []).get(key)!).push(c);
  }

  const rows = [...byNet.entries()].map(([netId, conns]) => {
    const net = State.nets.find(n => n.id === netId);
    const header = `<div style="font-size:0.72rem;font-weight:700;color:${net?.color || "var(--text-muted)"};margin-top:6px;">${net?.name ?? "Unassigned"}</div>`;
    const items = conns.map(c => `
      <div class="connection-row" data-id="${c.id}" style="display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:0.72rem;padding:2px 0;cursor:pointer;${c === State.selectedConnection ? "color:#38bdf8;" : ""}">
        <span>${terminalLabel(c.a)} ↔ ${terminalLabel(c.b)}</span>
        <span class="connection-delete" data-id="${c.id}" title="Delete connection" style="color:#f87171;cursor:pointer;">✕</span>
      </div>`).join("");
    return header + items;
  }).join("");

  el.innerHTML =
    `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">${State.connections.length} connection(s)</div>` +
    rows;

  el.querySelectorAll<HTMLElement>(".connection-row").forEach(row => {
    row.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).classList.contains("connection-delete")) return;
      const id = row.getAttribute("data-id");
      State.selectedConnection = State.connections.find(c => c.id === id);
      redrawCanvas();
      renderConnectionsInfo();
    });
  });
  el.querySelectorAll<HTMLElement>(".connection-delete").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      const conn = State.connections.find(c => c.id === id);
      if (conn) deleteConnection(conn);
    });
  });
}

// Connection mutations, net rebuilds, and project loads all dispatch this.
window.addEventListener("nets-changed", renderConnectionsInfo);

renderConnectionsInfo();
