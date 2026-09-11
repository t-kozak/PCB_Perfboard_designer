import {Canvas} from "../../state/Canvas";
import {Utils} from "../../utils/utils";
import {ShortcutRegistry} from "../shortcut-keys";
import {redrawCanvas} from "../draw-canvas";

Utils.getSafeHtmlElement<HTMLButtonElement>('downloadBtn').addEventListener('click', function() {
 downloadAsImage()
});

/** Board-unit gap between the two panels and the caption strip above each. */
const PANEL_GAP = 40;
const CAPTION_H = 44;
const MARGIN = 16;
const SURROUND = "#0f172a";

export function downloadAsImage(){
  // Export at 100% zoom so the PNG is the true board size (still at device
  // resolution via the render transform), regardless of the current view zoom.
  const viewZoom = Canvas.zoom;
  const viewSolder = Canvas.solderSide;
  Canvas.setZoom(1);

  const scale = Canvas.renderScale;
  const boardW = Canvas.boardWidth;
  const boardH = Canvas.boardHeight;

  const outW = boardW + MARGIN * 2;
  const outH = MARGIN * 2 + CAPTION_H * 2 + boardH * 2 + PANEL_GAP;

  const out = document.createElement('canvas');
  out.width = Math.round(outW * scale);
  out.height = Math.round(outH * scale);
  const octx = out.getContext('2d') as CanvasRenderingContext2D;
  octx.scale(scale, scale);
  octx.fillStyle = SURROUND;
  octx.fillRect(0, 0, outW, outH);

  const renderSide = (solder: boolean, topY: number, caption: string) => {
    Canvas.setSolderSide(solder);
    redrawCanvas();
    octx.fillStyle = '#e5e7eb';
    octx.font = 'bold 22px Inter, Arial, sans-serif';
    octx.textAlign = 'left';
    octx.textBaseline = 'middle';
    octx.fillText(caption, MARGIN, topY + CAPTION_H / 2);
    octx.drawImage(Canvas.c, MARGIN, topY + CAPTION_H, boardW, boardH);
  };

  renderSide(false, MARGIN, 'Component side');
  renderSide(true, MARGIN + CAPTION_H + boardH + PANEL_GAP, 'Solder side');

  Canvas.setSolderSide(viewSolder);
  Canvas.setZoom(viewZoom);
  redrawCanvas();

  const link = document.createElement('a');
  link.download = 'canvas.png';
  link.href = out.toDataURL();
  link.click();
}

ShortcutRegistry.add({key: "p", description: "download as image", event: downloadAsImage})
