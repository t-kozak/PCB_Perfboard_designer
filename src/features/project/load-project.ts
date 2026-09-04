import {Utils} from "../../utils/utils";
import {State} from "../../state/State";
import {redrawCanvas} from "../draw-canvas";
import {Canvas} from "../../state/Canvas";
import {IProjectSave} from "../../interfaces/project-save.interface";
import {Ic} from "../ic";
import {unserialize} from "../../utils/serialization";
import {IDot} from "../../interfaces/dot.interface";
import {ILine} from "../../interfaces/line.interface";
import {rebuildNets} from "../../nets/rebuild";

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

export function deserializePlacedIc(data: any, migrateIds = false): Ic | null {
  if (!data || data.widthPin == null || data.heightPin == null) return null;
  const ic = new Ic(
    Number(data.widthPin),
    Number(data.heightPin),
    data.pinDescription || {},
    String(data.name || 'Component'),
    Boolean(data.isCustom),
    String(data.kind || 'chip'),
    data.imageSrc || undefined
  );
  // v1 files carry collidable float ids; regenerate rather than trust them.
  if (data.id && !migrateIds) {
    ic.id = String(data.id);
  }
  ic.rotationAngle = Number(data.rotationAngle || 0);
  if (data.description) {
    ic.description = String(data.description);
  }
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
  const legacy = !project.version || project.version < 2;

  Canvas.setBoardSize(project.canvas.width, project.canvas.height);
  State.dots = project.dots;

  // Rehydrate every wire endpoint to the canonical State.dots entry by
  // coordinate. JSON.stringify duplicates the dot objects on save, so without
  // this a loaded line's start/end are distinct objects from State.dots and
  // coordinate is the only reliable identity (see docs/autorouting.md §3).
  const dotByCoord = new Map<string, IDot>();
  for (const d of State.dots) dotByCoord.set(`${d.x},${d.y}`, d);
  State.lines = (project.lines || [])
    .map((l): ILine | null => {
      const start = dotByCoord.get(`${l.start.x},${l.start.y}`);
      const end = dotByCoord.get(`${l.end.x},${l.end.y}`);
      return start && end ? { ...l, start, end } : null;
    })
    .filter((l): l is ILine => l !== null);

  // Undo history does not survive a load.
  State.changes = [];
  State.changeIndex = -1;

  if (project.ICs) {
    Ic.IC_CONTAINER = project.ICs.map(ic => {
      const inst = unserialize(ic, Ic);
      inst.id = legacy || inst.id == null ? crypto.randomUUID() : String(inst.id);
      return inst;
    });
    Ic.showICs();
  }
  if (project.placedIcs) {
    State.placedIcs = project.placedIcs
      .map(data => deserializePlacedIc(data, legacy))
      .filter(ic => ic !== null) as Ic[];
  } else {
    State.placedIcs = [];
  }

  State.nets = project.nets ?? [];

  State.selectedPlacedIc = undefined;
  State.selectedDot = undefined;
  State.selectedLine = undefined;
  State.selectedIc = undefined;

  // Seed nets from the wire list for pre-net-layer saves; keep any that were
  // already persisted (they carry names / colours / locks forward).
  if (State.nets.length === 0 && State.lines.length > 0) {
    rebuildNets();
  }

  window.dispatchEvent(new Event('nets-changed'));
  redrawCanvas();
}
