import {Utils} from "../../utils/utils";
import {State} from "../../state/State";
import {redrawCanvas} from "../draw-canvas";
import {Canvas} from "../../state/Canvas";
import {IProjectSave} from "../../interfaces/project-save.interface";
import {Ic} from "../ic";
import {unserialize} from "../../utils/serialization";

const loadInput = Utils.getSafeHtmlElement<HTMLButtonElement>('loadProjectBtn');
const loadTrigger = Utils.getSafeHtmlElement<HTMLButtonElement>('loadProjectTrigger');

loadTrigger.addEventListener('click', function() {
  loadInput.click();
});

loadInput.addEventListener('change', function(e) {
  const file = (e.target as HTMLInputElement).files?.[0];

  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const contents = String(e.target?.result ?? "");
    const data = JSON.parse(contents) as IProjectSave;

    // Load the state of the canvas from the uploaded file
    loadProject(data)

    // Redraw the canvas
    redrawCanvas();
  };
  reader.readAsText(file);
});

export function deserializePlacedIc(data: any): Ic | null {
  if (!data || data.widthPin == null || data.heightPin == null) return null;
  const ic = new Ic(
    Number(data.widthPin),
    Number(data.heightPin),
    data.pinDescription || {},
    String(data.name || 'Component'),
    Boolean(data.isCustom)
  );
  if (data.id) {
    ic.id = Number(data.id);
  }
  ic.rotationAngle = Number(data.rotationAngle || 0);
  if (data.topLeftDotX !== null && data.topLeftDotY !== null) {
    const targetDot = State.dots.find(d => d.x === data.topLeftDotX && d.y === data.topLeftDotY);
    if (targetDot) {
      ic.topLeftDot = targetDot;
    } else {
      ic.updatePosition(data.topLeftDotX, data.topLeftDotY);
    }
  }
  return ic;
}

export function loadProject(project: IProjectSave){
  Canvas.setBoardSize(project.canvas.width, project.canvas.height);
  State.dots = project.dots;
  State.lines = project.lines;
  if (project.ICs) {
    Ic.IC_CONTAINER = project.ICs.map(ic => unserialize(ic, Ic));
    Ic.showICs();
  }
  if (project.placedIcs) {
    State.placedIcs = project.placedIcs.map(data => deserializePlacedIc(data)).filter(ic => ic !== null) as Ic[];
  } else {
    State.placedIcs = [];
  }
  State.selectedPlacedIc = undefined;
  State.selectedDot = undefined;
  State.selectedLine = undefined;
  State.selectedIc = undefined;
  redrawCanvas();
}
