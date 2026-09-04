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
    Utils.getSafeHtmlElement("shortcuts").innerHTML = "<b>Shortcuts:</b> <br>" + this.shortcuts.map(s=> `key: <b>${s.ctrl ? "ctrl + ":""} ${s.key} </b> - ${s.description}`).join("<br>")
  }
}
