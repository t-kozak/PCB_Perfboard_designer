import {loadBoardText} from "./load-project";
import {AUTOSAVE_KEY, armAutosave, LEGACY_AUTOSAVE_KEY} from "./autosave";
import {adoptLoadedBoard, loadProjectFile} from "./boards";

// Restores the autosaved project on startup: the multi-board project file, or
// — from before boards — a single-board netlist / legacy JSON save, which
// becomes the project's only board.
window.addEventListener('DOMContentLoaded', () => {
  try {
    const project = localStorage.getItem(AUTOSAVE_KEY);
    const single = localStorage.getItem(LEGACY_AUTOSAVE_KEY);
    let warnings: string[] = [];
    if (project !== null) {
      warnings = loadProjectFile(project);
    } else if (single !== null) {
      warnings = loadBoardText(single);
      adoptLoadedBoard();
    }
    if (warnings.length) console.warn("Autosave restored with warnings:\n" + warnings.join("\n"));
  } catch (e) {
    console.error("Can't load the autosaved project from local storage.", e);
  }
  // Everything now in place (blank board or restored project) — start autosaving.
  armAutosave();
});
