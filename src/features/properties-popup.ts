import {State} from "../state/State";
import {Canvas} from "../state/Canvas";
import {Utils} from "../utils/utils";
import {redrawCanvas} from "./draw-canvas";
import {fieldsFor, PropField} from "./component-props";
import {updateNoteToggleButton} from "./description";
import {rebuildNets} from "../nets/rebuild";
import type {Ic} from "./ic";

// Component properties, two views of the same data: double-click a placed
// component for an editable popup (label, the kind's config fields from
// component-props.ts, pin names, notes), hover one for a read-only card. Component side
// only. Edits are not undo-tracked (undo covers connections/components only).

const editor = Utils.getSafeHtmlElement<HTMLDivElement>("propsEditor");
const hoverCard = Utils.getSafeHtmlElement<HTMLDivElement>("propsHoverCard");

/** The component the editor popup is open for, if any. */
let editing: Ic | undefined;

const esc = Utils.escapeHtml;

function headerHtml(ic: Ic): string {
  return `<div class="props-header"><span class="props-type">${ic.icon} ${esc(ic.name)}</span>`
    + `<span class="props-category">${esc(ic.category)}</span></div>`;
}

function fieldInput(field: PropField, value: string): string {
  const name = `cfg-${field.key}`;
  if (!field.options) {
    return `<input type="text" name="${name}" value="${esc(value)}" placeholder="${esc(field.placeholder ?? "")}" autocomplete="off" spellcheck="false">`;
  }
  // Keep a value that isn't one of the options (e.g. from an older save) selectable.
  const options = value && !field.options.includes(value) ? [...field.options, value] : field.options;
  return `<select name="${name}"><option value="">—</option>`
    + options.map(o => `<option${o === value ? " selected" : ""}>${esc(o)}</option>`).join("")
    + `</select>`;
}

/** Pin counts up to this open the pin-name section by default; a big chip keeps it folded. */
const PINS_OPEN_MAX = 8;

/**
 * One input per pin, holding the instance's name for it. The part's default
 * name is the placeholder: a field left empty falls back to it on apply.
 */
function pinsHtml(ic: Ic): string {
  if (ic.isBridge) return "";
  const defaults = ic.defaultPinDescription;
  const rows = Array.from({length: ic.pinCount}, (_, i) => {
    const pin = i + 1;
    const fallback = defaults[pin] ?? "";
    const own = ic.pinDescription[pin] ?? "";
    const value = own === fallback ? "" : own;
    return `<label class="props-pin"><span>${pin}</span>`
      + `<input type="text" name="pin-${pin}" value="${esc(value)}" placeholder="${esc(fallback)}" autocomplete="off" spellcheck="false"></label>`;
  }).join("");
  const open = ic.kind === "pin-header" || ic.pinCount <= PINS_OPEN_MAX || ic.hasCustomPinLabels;
  return `<details class="props-pins"${open ? " open" : ""}><summary>Pin names</summary>`
    + `<div class="props-pins-grid">${rows}</div></details>`;
}

/** The named pins as a compact `1 VCC · 2 GND` list for the hover card, or "" when none are named. */
function pinSummary(ic: Ic): string {
  const named = Array.from({length: ic.pinCount}, (_, i) => i + 1)
    .filter(pin => ic.pinDescription[pin])
    .map(pin => `<span class="props-pin-tag"><b>${pin}</b> ${esc(ic.pinDescription[pin])}</span>`);
  return named.join(" ");
}

/** Clamp a fixed-position popup into the viewport, anchored just off the given client point. */
function placeNear(el: HTMLElement, clientX: number, clientY: number) {
  const margin = 8;
  const offset = 14;
  const {width, height} = el.getBoundingClientRect();
  let left = clientX + offset;
  let top = clientY + offset;
  if (left + width > window.innerWidth - margin) left = clientX - offset - width;
  if (top + height > window.innerHeight - margin) top = window.innerHeight - margin - height;
  el.style.left = `${Math.max(margin, left)}px`;
  el.style.top = `${Math.max(margin, top)}px`;
}

function labelTaken(ic: Ic, label: string): boolean {
  return !!label && State.placedIcs.some(other => other !== ic && other.label === label);
}

export function openPropertiesEditor(ic: Ic, clientX: number, clientY: number) {
  hideHoverCard();
  editing = ic;
  const fields = fieldsFor(ic);
  editor.innerHTML = `${headerHtml(ic)}
    <form class="props-form">
      <label class="props-row"><span>Label</span>
        <input type="text" name="label" value="${esc(ic.label ?? "")}" placeholder="e.g. R1" autocomplete="off" spellcheck="false"></label>
      <div class="props-warning" hidden>Another component already uses this label.</div>
      ${fields.map(f => `<label class="props-row"><span>${esc(f.label)}</span>${fieldInput(f, ic.config[f.key] ?? "")}</label>`).join("")}
      ${pinsHtml(ic)}
      <label class="props-row props-row-notes"><span>Notes</span>
        <textarea name="notes" rows="3" placeholder="Longer free-form info">${esc(ic.description ?? "")}</textarea></label>
    </form>`;
  editor.hidden = false;
  placeNear(editor, clientX, clientY);

  const form = editor.querySelector("form")!;
  const labelInput = form.elements.namedItem("label") as HTMLInputElement;
  const warning = editor.querySelector<HTMLElement>(".props-warning")!;
  const checkLabel = () => { warning.hidden = !labelTaken(ic, labelInput.value.trim()); };
  checkLabel();
  // Every edit is saved as you type (debounced); there is nothing to confirm.
  form.addEventListener("input", () => {
    checkLabel();
    scheduleApply();
  });
  labelInput.focus();
  labelInput.select();
}

const APPLY_DEBOUNCE_MS = 250;
let applyTimer: number | undefined;

function scheduleApply() {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(applyForm, APPLY_DEBOUNCE_MS) as unknown as number;
}

/** Write the form back onto the component being edited. */
function applyForm() {
  clearTimeout(applyTimer);
  applyTimer = undefined;
  const ic = editing;
  const form = editor.querySelector("form");
  if (!ic || !form) return;
  const data = new FormData(form);
  const text = (name: string) => String(data.get(name) ?? "").trim();
  ic.label = text("label") || undefined;
  for (const field of fieldsFor(ic)) {
    const value = text(`cfg-${field.key}`);
    if (value) ic.config[field.key] = value;
    else delete ic.config[field.key];
  }
  if (!ic.isBridge) {
    // An empty field means "the part's default name".
    const defaults = ic.defaultPinDescription;
    const pins: Record<number, string> = {};
    for (let pin = 1; pin <= ic.pinCount; pin++) {
      const name = text(`pin-${pin}`) || defaults[pin];
      if (name) pins[pin] = name;
    }
    ic.pinDescription = pins;
  }
  ic.description = text("notes") || undefined;
  // Connection lists name terminals by designator, and a power pin name
  // (GND / VCC) names its net.
  rebuildNets();
  window.dispatchEvent(new Event("nets-changed"));
  updateNoteToggleButton();
  redrawCanvas();
}

/** Close the editor, flushing any edit still waiting on the debounce. */
export function closePropertiesEditor() {
  if (!editing) return;
  if (applyTimer !== undefined) applyForm();
  editing = undefined;
  editor.hidden = true;
  editor.innerHTML = "";
}

function hoverCardHtml(ic: Ic): string {
  const value = (v: string | undefined) => v ? esc(v) : `<span class="props-empty">—</span>`;
  const rows = [
    ["Label", value(ic.label)],
    ...fieldsFor(ic).map(f => [esc(f.label), value(ic.config[f.key])]),
  ];
  const pins = ic.isBridge ? "" : pinSummary(ic);
  if (pins) rows.push(["Pins", pins]);
  return headerHtml(ic)
    + `<dl class="props-list">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`
    + (ic.description ? `<div class="props-notes">${esc(ic.description)}</div>` : "");
}

let hoverCardFor: Ic | undefined;

function hideHoverCard() {
  hoverCard.hidden = true;
  hoverCardFor = undefined;
}

function updateHoverCard(e: MouseEvent) {
  const idle = !Canvas.solderSide && !editing && !State.isDraggingIc && !State.selectedIc && e.buttons === 0;
  const {x, y} = Canvas.screenToBoard(e.clientX, e.clientY);
  const ic = idle ? State.placedIcs.find(p => p.containsPoint(x, y)) : undefined;
  if (!ic) {
    hideHoverCard();
    return;
  }
  if (ic !== hoverCardFor) {
    hoverCard.innerHTML = hoverCardHtml(ic);
    hoverCard.hidden = false;
    hoverCardFor = ic;
  }
  placeNear(hoverCard, e.clientX, e.clientY);
}

Canvas.c.addEventListener("mousemove", updateHoverCard);
Canvas.c.addEventListener("mouseleave", hideHoverCard);
Canvas.c.addEventListener("mousedown", hideHoverCard);

// Components are hidden on the solder side; armed
// placement owns clicks on the component side. Hit-tested directly so a stale
// selection never opens the popup for something that isn't under the cursor.
Canvas.c.addEventListener("dblclick", (e) => {
  if (Canvas.solderSide || State.selectedIc) return;
  const {x, y} = Canvas.screenToBoard(e.clientX, e.clientY);
  const target = State.placedIcs.find(ic => ic.containsPoint(x, y));
  if (!target) return;
  // The popup edits one component: double-clicking breaks up a Shift+click
  // group and leaves just the double-clicked part selected.
  State.selectedPlacedIcs = [];
  State.selectedPlacedIc = target;
  redrawCanvas();
  openPropertiesEditor(target, e.clientX, e.clientY);
});

// A click anywhere outside the popup closes it (as do Escape and Enter).
window.addEventListener("mousedown", (e) => {
  if (editing && !editor.contains(e.target as Node)) closePropertiesEditor();
}, true);

// Keep typing in the popup away from the global shortcuts (r, Delete, d…).
editor.addEventListener("keydown", (e) => {
  e.stopPropagation();
  const inNotes = (e.target as HTMLElement).tagName === "TEXTAREA";
  if (e.key === "Escape" || (e.key === "Enter" && !inNotes)) {
    e.preventDefault();
    closePropertiesEditor();
  }
});
