import {State} from "../../state/State";
import {Utils} from "../../utils/utils";
import {Canvas} from "../../state/Canvas";
import {IProjectSave} from "../../interfaces/project-save.interface";
import {Ic} from "../ic";

const saveBtn = Utils.getSafeHtmlElement<HTMLButtonElement>('saveProjectBtn');
saveBtn.addEventListener('click', function() {
  // Convert the state of the canvas to a string (in JSON format)
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(getSaveJson()));

  // Create a download link and click it
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", "canvas_project.json");
  document.body.appendChild(downloadAnchorNode); // required for firefox
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
});


export function serializePlacedIc(ic: Ic) {
  return {
    id: ic.id,
    widthPin: ic.widthPin,
    heightPin: ic.heightPin,
    pinDescription: ic.pinDescription || {},
    name: ic.name,
    isCustom: !!ic.isCustom,
    kind: ic.kind || "chip",
    imageSrc: ic.imageSrc,
    rotationAngle: ic.rotationAngle || 0,
    topLeftDotX: ic.topLeftDot ? ic.topLeftDot.x : null,
    topLeftDotY: ic.topLeftDot ? ic.topLeftDot.y : null,
  };
}

export function getSaveJson(): IProjectSave {
  return {
    dots: State.dots,
    lines: State.lines,
    canvas: { width: Canvas.boardWidth, height: Canvas.boardHeight },
    ICs: Ic.IC_CONTAINER || [],
    placedIcs: State.placedIcs.map(ic => serializePlacedIc(ic))
  };
}
