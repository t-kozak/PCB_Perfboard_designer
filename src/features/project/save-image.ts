import {Canvas} from "../../state/Canvas";
import {Utils} from "../../utils/utils";
import {ShortcutRegistry} from "../shortcut-keys";
import {redrawCanvas} from "../draw-canvas";

Utils.getSafeHtmlElement<HTMLButtonElement>('downloadBtn').addEventListener('click', function() {
 downloadAsImage()
});

export function downloadAsImage(){
  // Export at 100% zoom so the PNG is the true board size (still at device
  // resolution via the render transform), regardless of the current view zoom.
  const viewZoom = Canvas.zoom;
  Canvas.setZoom(1);
  redrawCanvas();

  const link = document.createElement('a');
  link.download = 'canvas.png';
  link.href = Canvas.c.toDataURL()
  link.click();

  Canvas.setZoom(viewZoom);
  redrawCanvas();
}

ShortcutRegistry.add({key: "p", description: "download as image", event: downloadAsImage})
