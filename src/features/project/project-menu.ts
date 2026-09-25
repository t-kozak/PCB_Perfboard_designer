import {Utils} from "../../utils/utils";
import {activeBoardName, importText, projectHasWork, serializeProject} from "./boards";
import {downloadText, getSaveNetlist} from "./save-project";
import {downloadAsImage} from "./save-image";
import {isProjectFile} from "../../kicad/project-file";

// The Project sidebar section: the Export menu (board → PNG, board → KiCad
// netlist, whole project) and Import (button or drag-and-drop a file anywhere
// on the page). The board list lives in boards-ui.ts.

const exportBtn = Utils.getSafeHtmlElement<HTMLButtonElement>('exportBtn');
const exportMenu = Utils.getSafeHtmlElement<HTMLDivElement>('exportMenu');
const importBtn = Utils.getSafeHtmlElement<HTMLButtonElement>('importBtn');
const importInput = Utils.getSafeHtmlElement<HTMLInputElement>('importInput');

// --- Export ----------------------------------------------------------------

/** A board/project name as a file name. */
function fileStem(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_") || "perfboard";
}

const exporters: Record<string, () => void> = {
  image: () => downloadAsImage(`${fileStem(activeBoardName())}.png`),
  kicad: () => downloadText(getSaveNetlist(new Date().toISOString(), activeBoardName()), `${fileStem(activeBoardName())}.net`),
  project: () => downloadText(serializeProject(new Date().toISOString()), "perfboard_project.perfboard"),
};

function setMenuOpen(open: boolean) {
  exportMenu.hidden = !open;
  exportBtn.setAttribute('aria-expanded', String(open));
  if (open) exportMenu.querySelector<HTMLButtonElement>('button')?.focus();
}

exportBtn.addEventListener('click', e => {
  e.stopPropagation();
  setMenuOpen(!!exportMenu.hidden);
});

exportMenu.addEventListener('click', e => {
  const item = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-export]');
  if (!item) return;
  setMenuOpen(false);
  exporters[item.dataset.export!]?.();
});

document.addEventListener('click', e => {
  if (!exportMenu.hidden && !exportMenu.contains(e.target as Node)) setMenuOpen(false);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !exportMenu.hidden) {
    setMenuOpen(false);
    exportBtn.focus();
  }
});

// --- Import ----------------------------------------------------------------

/** Alerts (and logs) the warnings a board/project load produced. */
export function reportWarnings(warnings: string[], what: string) {
  if (!warnings.length) return;
  const shown = warnings.slice(0, 20);
  if (warnings.length > shown.length) shown.push(`…and ${warnings.length - shown.length} more (see the console).`);
  console.warn(`${what} loaded with warnings:\n` + warnings.join("\n"));
  alert(`${what} loaded with ${warnings.length} warning(s):\n\n${shown.join("\n")}`);
}

function importFile(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? "");
    if (isProjectFile(text) && projectHasWork()
      && !confirm(`Open the project ${file.name}? It replaces every board you have open now (export first to keep them).`)) return;
    try {
      reportWarnings(importText(text, file.name), file.name);
    } catch (err) {
      console.error(err);
      alert(`Could not import ${file.name}: ${err instanceof Error ? err.message : err}`);
    }
  };
  reader.readAsText(file);
}

importBtn.addEventListener('click', () => importInput.click());

importInput.addEventListener('change', () => {
  const file = importInput.files?.[0];
  if (file) importFile(file);
  // Let the same file be picked again (e.g. after editing it).
  importInput.value = "";
});

// Dropping a file anywhere on the page imports it (instead of the browser opening it).
const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
window.addEventListener('dragover', e => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'copy';
  document.body.classList.add('file-drag');
});
window.addEventListener('dragleave', e => {
  if (!e.relatedTarget) document.body.classList.remove('file-drag');
});
window.addEventListener('drop', e => {
  document.body.classList.remove('file-drag');
  if (!hasFiles(e)) return;
  e.preventDefault();
  const file = e.dataTransfer!.files[0];
  if (file) importFile(file);
});
