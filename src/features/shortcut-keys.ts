import {Utils} from "../utils/utils";

window.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
    return;
  }

  // On Mac keyboards the primary delete key reports as "Backspace"; treat it as
  // "Delete" so the delete shortcut fires regardless of which key is pressed.
  const eventKey = event.key === 'Backspace' ? 'Delete' : event.key;

  for (const shortcut of ShortcutRegistry.shortcuts) {
    if (event.ctrlKey !== !!shortcut.ctrl) continue;
    // Single-character keys match case-sensitively so `d` and `D` stay
    // distinct; named keys (Delete, Escape, …) stay case-insensitive.
    const match = shortcut.key.length === 1
      ? eventKey === shortcut.key
      : eventKey.toLowerCase() === shortcut.key.toLowerCase();
    if (match) {
      shortcut.event(event);
    }
  }
});

export interface IShortcut {
  key: string, ctrl?: boolean, event: (e: KeyboardEvent)=>void, description?: string
}
export class ShortcutRegistry {
  static shortcuts:  IShortcut[] = [];
  static add(shortcut: IShortcut){
    if (this.shortcuts.find((s)=>shortcut.key == s.key ) !== undefined){
      console.warn(`Shortcut key: ${shortcut.key} already exists`)
    }
    this.shortcuts.push(shortcut)
    this.show()
  }

  static show(){
    Utils.getSafeHtmlElement("shortcuts").innerHTML = this.shortcuts.map(s=> `<kbd>${s.ctrl ? "ctrl + ":""}${s.key}</kbd> ${s.description}`).join("<br>")
  }
}

// The shortcut list lives in a popover opened from the keyboard button above the canvas.
const shortcutsBtn = Utils.getSafeHtmlElement<HTMLButtonElement>("shortcutsBtn");
const shortcutsPopover = Utils.getSafeHtmlElement<HTMLElement>("shortcutsPopover");

function setShortcutsOpen(open: boolean) {
  shortcutsPopover.hidden = !open;
  shortcutsBtn.setAttribute("aria-expanded", String(open));
}

shortcutsBtn.addEventListener("click", () => setShortcutsOpen(!!shortcutsPopover.hidden));
window.addEventListener("click", (e) => {
  const t = e.target as Node;
  if (!shortcutsPopover.contains(t) && !shortcutsBtn.contains(t)) setShortcutsOpen(false);
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setShortcutsOpen(false);
});
