import { Canvas } from "../state/Canvas";

// ---------------------------------------------------------------------------
// Board viewport: a single pan + zoom transform on #canvasZoomWrapper.
//
// The zoom is a CSS `transform: scale()`, which does NOT grow the element's
// layout box, so the overflow:auto container can't scroll to the scaled-out
// parts of the board. We therefore pan by translating the wrapper ourselves
// (panX / panY, in screen pixels) rather than by scrolling the container.
// Every way of moving the board — the +/- buttons, Fit, the trackpad, and the
// middle-mouse drag in select.ts — goes through this one module.
// ---------------------------------------------------------------------------

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3.0;
const PAN_MARGIN = 80; // px of board that must stay on screen at the tightest pan

let currentZoom = 1.0;
let panX = 0;
let panY = 0;

export function getZoom(): number {
  return currentZoom;
}

function getZoomTarget(): HTMLElement | null {
  return document.getElementById('canvasZoomWrapper')
    ?? (Canvas.c as HTMLElement | null);
}

// Keep the pan within a range that always leaves a chunk of the board on
// screen — otherwise the board can be lost off an edge with no way back.
function clampPan() {
  const container = document.getElementById('canvas-container');
  if (!container || !Canvas.c) return;
  const limitX = Math.max(0, (Canvas.c.width * currentZoom + container.clientWidth) / 2 - PAN_MARGIN);
  const limitY = Math.max(0, (Canvas.c.height * currentZoom + container.clientHeight) / 2 - PAN_MARGIN);
  panX = Math.max(-limitX, Math.min(limitX, panX));
  panY = Math.max(-limitY, Math.min(limitY, panY));
}

function applyTransform(animate: boolean) {
  const target = getZoomTarget();
  if (!target) return;
  target.style.transformOrigin = 'center center';
  // The CSS transition is nice for discrete button/fit steps, but during a
  // continuous pinch/pan it restarts every frame and the browser composites a
  // stale, half-faded copy of the old state — the "ghost". Kill the transition
  // for continuous updates so each frame paints cleanly.
  target.style.transition = animate ? 'transform 0.15s ease-out' : 'none';
  target.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
}

function updateZoomReadout() {
  const zoomText = `${Math.round(currentZoom * 100)}%`;
  const text1 = document.getElementById('zoomLevelText');
  const text2 = document.getElementById('fsZoomText');
  if (text1) text1.innerText = zoomText;
  if (text2) text2.innerText = zoomText;
}

export function applyZoom(zoom: number, animate = false) {
  currentZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  clampPan();
  applyTransform(animate);
  updateZoomReadout();
}

export function nudgeZoom(delta: number) {
  applyZoom(currentZoom + delta, true);
}

export function panBy(dx: number, dy: number) {
  panX += dx;
  panY += dy;
  clampPan();
  applyTransform(false);
}

export function resetPan() {
  panX = 0;
  panY = 0;
}

// --- Trackpad / wheel gestures ---------------------------------------------

// Normalise a wheel delta (line / page modes) to roughly pixel units.
function normalizeWheelDelta(delta: number, deltaMode: number): number {
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * 400;
  return delta;
}

// A pinch reports ctrlKey and sends small deltas; scale proportionally so it
// zooms gently instead of snapping in fixed steps.
function zoomByWheelDelta(rawDeltaY: number, deltaMode: number) {
  const delta = normalizeWheelDelta(rawDeltaY, deltaMode);
  // Clamp the per-event change so one fast flick can't leap across the range.
  const factor = Math.exp(-Math.max(-40, Math.min(40, delta)) * 0.01);
  applyZoom(currentZoom * factor);
}

function isOverCanvasArea(target: EventTarget | null): boolean {
  return target instanceof Node
    && !!document.getElementById('canvasViewportSection')?.contains(target);
}

// Attach the global gesture listeners. Call once at startup.
export function initViewportGestures() {
  // Capture phase so this runs before the browser's own handling. On a macOS
  // trackpad a pinch reports ctrlKey; a two-finger swipe does not.
  // - Pinch → zoom the board. Always intercepted, anywhere on the page, so the
  //   browser never zooms the whole document.
  // - Two-finger swipe over the canvas area → pan the board.
  // - Anything else (swipe over the sidebar / shortcut panel) → left alone.
  window.addEventListener('wheel', (e: WheelEvent) => {
    const pinch = e.ctrlKey;
    if (!pinch && !isOverCanvasArea(e.target)) return;
    e.preventDefault();
    if (pinch) {
      zoomByWheelDelta(e.deltaY, e.deltaMode);
    } else {
      // Content follows the fingers.
      panBy(
        -normalizeWheelDelta(e.deltaX, e.deltaMode),
        -normalizeWheelDelta(e.deltaY, e.deltaMode),
      );
    }
  }, { passive: false, capture: true });

  // Safari on macOS emits gesture* events for trackpad pinch instead of
  // ctrl+wheel. Swallow them and map the scale change onto the board zoom.
  let gestureStartZoom = 1;
  window.addEventListener('gesturestart', (e: Event) => {
    e.preventDefault();
    gestureStartZoom = currentZoom;
  }, { passive: false });
  window.addEventListener('gesturechange', (e: Event) => {
    e.preventDefault();
    const scale = (e as unknown as { scale: number }).scale || 1;
    // Dampen Safari's aggressive scale so the pinch feels gradual.
    applyZoom(gestureStartZoom * (1 + (scale - 1) * 0.4));
  }, { passive: false });
  window.addEventListener('gestureend', (e: Event) => e.preventDefault(), { passive: false });
}
