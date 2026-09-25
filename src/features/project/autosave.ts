import {serializeProject} from "./boards";
import {State} from "../../state/State";

/** localStorage key of the autosaved project file (all boards). */
export const AUTOSAVE_KEY = "project";
/** Where single-board autosaves from before multi-board projects live — read once, then dropped. */
export const LEGACY_AUTOSAVE_KEY = "save";

/**
 * Autosave: persist the whole project — every board, as the same project file
 * Export → Project downloads — to `localStorage['project']` shortly after
 * any state mutation, with no user interaction. `redrawCanvas()` runs after
 * every mutation (and on hover), so it is the single call site — we debounce
 * here and skip the write when the serialized project is byte-for-byte
 * unchanged, so idle repaints cost nothing.
 *
 * `load-from-local-storage.ts` restores this on startup.
 */

const DEBOUNCE_MS = 800;
const MAX_WAIT_MS = 5000;

let timer: number | undefined;
let firstScheduledAt = 0;
let lastSaved: string | null = null;
// Skip the write triggered by the initial load's redraw — nothing has changed yet.
let armed = false;

function flush() {
  timer = undefined;
  firstScheduledAt = 0;
  // Never persist copies still following the cursor; the drop redraws and reschedules.
  if (State.placingDuplicates.length) return;
  try {
    const text = serializeProject();
    if (text === lastSaved) return;
    localStorage.setItem(AUTOSAVE_KEY, text);
    localStorage.removeItem(LEGACY_AUTOSAVE_KEY);
    lastSaved = text;
  } catch (e) {
    console.error("Autosave failed", e);
  }
}

export function scheduleAutosave() {
  if (!armed) return;
  const now = Date.now();
  if (timer === undefined) firstScheduledAt = now;
  if (timer !== undefined) clearTimeout(timer);
  if (now - firstScheduledAt >= MAX_WAIT_MS) {
    flush();
    return;
  }
  timer = setTimeout(flush, DEBOUNCE_MS) as unknown as number;
}

/**
 * Enable autosave and seed the "already saved" baseline so a load followed by
 * a redraw doesn't immediately rewrite identical data. Call once, after the
 * initial project (blank or restored) is in place.
 */
export function armAutosave() {
  try {
    lastSaved = localStorage.getItem(AUTOSAVE_KEY);
  } catch {
    lastSaved = null;
  }
  armed = true;
}
