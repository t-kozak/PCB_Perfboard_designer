import { State } from "../state/State";
import { redrawCanvas } from "./draw-canvas";
import { invalidateWireCache, refreshWireCache } from "./wire-cache";

// Routing is otherwise stateless (see wire-cache.ts). The only user control is
// the global orthogonal / direct switch, wired up here.

/** Switch the global routing style and rebuild the wiring. */
export function setRoutingMode(mode: "orthogonal" | "direct"): void {
  if (State.routingMode === mode) return;
  State.routingMode = mode;
  invalidateWireCache();
  refreshWireCache();
  redrawCanvas();
  window.dispatchEvent(new Event("nets-changed"));
}

document.querySelectorAll<HTMLElement>("#routingModeSelector .routing-mode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const mode = btn.getAttribute("data-mode");
    if (mode !== "orthogonal" && mode !== "direct") return;
    setRoutingMode(mode);
    syncRoutingModeButtons();
  });
});

/** Sync the routing-mode buttons to `State.routingMode` (startup / after a load). */
export function syncRoutingModeButtons(): void {
  document.querySelectorAll<HTMLElement>("#routingModeSelector .routing-mode-btn").forEach(b => {
    b.classList.toggle("active-mode", b.getAttribute("data-mode") === State.routingMode);
  });
}

syncRoutingModeButtons();
