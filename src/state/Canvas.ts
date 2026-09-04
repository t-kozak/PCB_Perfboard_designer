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
  /**
   * Solder-side view: the board is mirrored on X so the on-screen layout matches
   * the copper face you see when you physically flip the board over. The app has
   * exactly one transform point (applyResolution / screenToBoard), so this is a
   * sign flip in two places plus a per-string counter-flip for text.
   */
  static solderSide = false;

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
    if (Canvas.solderSide) {
      // Mirror X: x axis flips, board origin moves to the right edge.
      Canvas.ctx.setTransform(-scale, 0, 0, scale, Canvas.boardWidth * scale, 0);
    } else {
      Canvas.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }
  }

  static setBoardSize(width: number, height: number): void {
    Canvas.boardWidth = width;
    Canvas.boardHeight = height;
    Canvas.applyResolution();
  }

  static setSolderSide(on: boolean): void {
    Canvas.solderSide = on;
    Canvas.applyResolution();
  }

  /**
   * Draw text upright even under the mirrored solder-side transform. Flips the
   * context back around the text anchor and swaps left/right alignment so the
   * string still hangs off the correct edge.
   */
  static fillText(text: string, x: number, y: number): void {
    const ctx = Canvas.ctx;
    if (!Canvas.solderSide) {
      ctx.fillText(text, x, y);
      return;
    }
    const align = ctx.textAlign;
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    if (align === "left") ctx.textAlign = "right";
    else if (align === "right") ctx.textAlign = "left";
    ctx.fillText(text, 0, y);
    ctx.restore();
  }

  static setZoom(zoom: number): void {
    Canvas.zoom = zoom;
    Canvas.applyResolution();
  }

  /** Map a viewport (clientX/clientY) coordinate to board units. */
  static screenToBoard(clientX: number, clientY: number): {x: number; y: number} {
    const rect = Canvas.c.getBoundingClientRect();
    let x = (clientX - rect.left) * (Canvas.boardWidth / rect.width);
    const y = (clientY - rect.top) * (Canvas.boardHeight / rect.height);
    if (Canvas.solderSide) x = Canvas.boardWidth - x;
    return { x, y };
  }
}
