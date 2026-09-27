import {Canvas} from "../../state/Canvas";
import {ShortcutRegistry} from "../shortcut-keys";
import {renderBoardSides} from "./board-render";

/** Board-unit gap between the two panels and the caption strip above each. */
const PANEL_GAP = 40;
const CAPTION_H = 44;
const MARGIN = 16;
const SURROUND = "#0f172a";

export function downloadAsImage(fileName = 'canvas.png'){
  // Export at 100% zoom so the PNG is the true board size (still at device
  // resolution), regardless of the current view zoom.
  const sides = renderBoardSides();
  const scale = sides.scale;
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

  const drawSide = (image: HTMLCanvasElement, topY: number, caption: string) => {
    octx.fillStyle = '#e5e7eb';
    octx.font = 'bold 22px Inter, Arial, sans-serif';
    octx.textAlign = 'left';
    octx.textBaseline = 'middle';
    octx.fillText(caption, MARGIN, topY + CAPTION_H / 2);
    octx.drawImage(image, MARGIN, topY + CAPTION_H, boardW, boardH);
  };

  drawSide(sides.component, MARGIN, 'Component side');
  drawSide(sides.solder, MARGIN + CAPTION_H + boardH + PANEL_GAP, 'Solder side');

  const link = document.createElement('a');
  link.download = fileName;
  link.href = out.toDataURL();
  link.click();
}

ShortcutRegistry.add({key: "p", description: "download as image", event: () => downloadAsImage()})
