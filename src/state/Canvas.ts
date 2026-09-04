import {Utils} from "../utils/utils";

export class Canvas {
  static c = Utils.getSafeHtmlElement<HTMLCanvasElement>("myCanvas");
  static ctx = Canvas.c.getContext("2d") as CanvasRenderingContext2D;

  // --- Resolution model -----------------------------------------------------
  // All drawing and geometry code works in "board units" (the fixed 50px pad
  // pitch). The canvas backing store is sized to board units x renderScale, and
  // a matching transform is installed, so every pixel is rasterised at native
  // device resolution. `zoom` is folded into that transform (not a CSS
  // `scale()`), so zooming re-renders crisply instead of upscaling a bitmap.
  // Panning still happens as a CSS translate on #canvasZoomWrapper.

  /** Logical board size, in board units. */
  static boardWidth = 500;
  static boardHeight = 500;
  /** User zoom factor (1 = 100%). */
  static zoom = 1;

  /** Physical device pixels per CSS pixel. Read live so it tracks monitor moves. */
  static get dpr(): number {
    return window.devicePixelRatio || 1;
  }

  /** Total scale from board units to backing-store device pixels. */
  static get renderScale(): number {
    return Canvas.dpr * Canvas.zoom;
  }

  /**
   * Resize the backing store + CSS box for the current board size and zoom and
   * (re)install the board-units -> device-pixels transform. Setting width/height
   * resets all context state, so this must run before each fresh paint that
   * follows a size/zoom change. Callers redraw afterwards.
   */
  static applyResolution(): void {
    const scale = Canvas.renderScale;
    Canvas.c.width = Math.round(Canvas.boardWidth * scale);
    Canvas.c.height = Math.round(Canvas.boardHeight * scale);
    // CSS size follows zoom only — DPR must not change the layout box.
    Canvas.c.style.width = `${Canvas.boardWidth * Canvas.zoom}px`;
    Canvas.c.style.height = `${Canvas.boardHeight * Canvas.zoom}px`;
    Canvas.ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  static setBoardSize(width: number, height: number): void {
    Canvas.boardWidth = width;
    Canvas.boardHeight = height;
    Canvas.applyResolution();
  }

  static setZoom(zoom: number): void {
    Canvas.zoom = zoom;
    Canvas.applyResolution();
  }

  /** Map a viewport (clientX/clientY) coordinate to board units. */
  static screenToBoard(clientX: number, clientY: number): {x: number; y: number} {
    const rect = Canvas.c.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (Canvas.boardWidth / rect.width),
      y: (clientY - rect.top) * (Canvas.boardHeight / rect.height),
    };
  }
}
