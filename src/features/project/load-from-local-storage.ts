import {loadProjectText} from "./load-project";
import {armAutosave} from "./autosave";

// Restores the autosaved project (a netlist, or a legacy JSON save from before
// the netlist format) on startup.
window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('save');
  if (saved !== null) {
    try {
      const warnings = loadProjectText(saved);
      if (warnings.length) console.warn("Autosave restored with warnings:\n" + warnings.join("\n"));
    } catch (e) {
      console.error("Can't load the autosaved project from local storage.", e);
    }
  }
  // Everything now in place (blank board or restored project) — start autosaving.
  armAutosave();
});
