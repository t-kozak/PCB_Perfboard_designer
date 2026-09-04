import {Canvas} from "../state/Canvas";
import {State} from "../state/State";
import {IDot} from "../interfaces/dot.interface";
import {ShortcutRegistry} from "./shortcut-keys";
import {Utils} from "../utils/utils";
import {redrawCanvas} from "./draw-canvas";


export class Ic{
  static IC_CONTAINER: Ic[] = [];

  public id = Math.random() * 100;
  public isCustom?: boolean = false;
  public rotationAngle = 0; // 0, 90, 180, 270
  topLeftDot: IDot | null = null;

  /** Free-text annotation attached to this placed component (not to catalog templates). */
  public description?: string;

  /**
   * Cache of decoded component artwork, keyed by source URL / data URI.
   * A freshly created image redraws the canvas once it finishes loading.
   */
  private static imageCache = new Map<string, HTMLImageElement>();

  constructor(
    public widthPin: number,
    public heightPin: number,
    public pinDescription: Record<number, string>,
    public name: string,
    isCustom = false,
    /**
     * Visual family of the component. "chip" (default) draws the black DIP
     * package below. Future kinds (e.g. "resistor") can add their own vector
     * art in drawPackage(). Ignored when imageSrc is set.
     */
    public kind: string = "chip",
    /**
     * Optional artwork (raster image or SVG, as a URL or data URI) drawn as
     * the component body instead of the default package. Built-in ICs leave
     * this unset and fall back to the chip rectangle.
     */
    public imageSrc?: string,
  ) {
    this.isCustom = isCustom;
  }

  private static getImage(src: string): HTMLImageElement | null {
    const cached = Ic.imageCache.get(src);
    if (cached) {
      return cached.complete && cached.naturalWidth > 0 ? cached : null;
    }
    const img = new Image();
    img.onload = () => redrawCanvas();
    img.onerror = () => console.error("Failed to load component artwork", src);
    img.src = src;
    Ic.imageCache.set(src, img);
    return null;
  }

  static add(ic: Ic, saveToStorage = false){
    this.IC_CONTAINER.push(ic);
    if (saveToStorage) {
      this.saveCustomIcsToLocalStorage();
    }
    this.showICs();
  }

  static showICs(){
    Utils.getSafeHtmlElement("ic-items").innerHTML = Ic.IC_CONTAINER.map((item)=>{
      const deleteBtn = item.isCustom 
        ? `<span onclick="event.stopPropagation(); deleteCustomIc('${item.id}')" title="Delete custom component" style="margin-left:6px;cursor:pointer;color:#f87171;font-weight:bold;">✕</span>` 
        : '';
      return `<button class="btn btn-accent" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick='selectIc("${item.id}")'>📦 ${item.name}${deleteBtn}</button>`;
    }).join(" ");
  }

  static saveCustomIcsToLocalStorage() {
    try {
      const customIcs = Ic.IC_CONTAINER.filter(ic => ic.isCustom).map(ic => ({
        id: ic.id,
        name: ic.name,
        widthPin: ic.widthPin,
        heightPin: ic.heightPin,
        pinDescription: ic.pinDescription,
        kind: ic.kind,
        imageSrc: ic.imageSrc,
        isCustom: true
      }));
      localStorage.setItem('custom_ics', JSON.stringify(customIcs));
    } catch (e) {
      console.error("Failed to save custom ICs to localStorage", e);
    }
  }

  static loadCustomIcsFromLocalStorage() {
    try {
      const stored = localStorage.getItem('custom_ics');
      if (!stored) return;
      const customIcs = JSON.parse(stored) as Array<{
        id: number;
        name: string;
        widthPin: number;
        heightPin: number;
        pinDescription: Record<number, string>;
        kind?: string;
        imageSrc?: string;
      }>;
      for (const data of customIcs) {
        if (!Ic.IC_CONTAINER.some(ic => String(ic.id) === String(data.id))) {
          const newIc = new Ic(data.widthPin, data.heightPin, data.pinDescription || {}, data.name, true, data.kind || "chip", data.imageSrc);
          newIc.id = data.id;
          Ic.IC_CONTAINER.push(newIc);
        }
      }
      this.showICs();
    } catch (e) {
      console.error("Failed to load custom ICs from localStorage", e);
    }
  }

  updatePosition(x: number, y: number){
    let minDistance: number | null = null;
    let minDot: IDot | null = null;
    for (const dot of State.dots) {
      const distance = this.calculateDistance(dot.x, dot.y, x, y);
      if (minDistance === null || distance < minDistance) {
        minDistance = distance;
        minDot = dot;
      }
    }
    this.topLeftDot = minDot;
  }

  private roundRectPath(x: number, y: number, w: number, h: number, r: number) {
    const ctx = Canvas.ctx;
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /**
   * Draws the default black DIP-style package: a near-black moulded body with
   * a soft top-to-bottom sheen and a light border, so it reads as a chip.
   */
  private drawChipBody(x: number, y: number, w: number, h: number, isSelected: boolean) {
    const ctx = Canvas.ctx;
    const r = Math.min(8, w / 4, h / 4);

    ctx.save();
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    if (isSelected) {
      grad.addColorStop(0, "#1e2b52");
      grad.addColorStop(1, "#0a1330");
    } else {
      grad.addColorStop(0, "#20222a");
      grad.addColorStop(1, "#050506");
    }

    ctx.beginPath();
    this.roundRectPath(x, y, w, h, r);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.strokeStyle = isSelected ? "#38bdf8" : "#4b5563";
    ctx.stroke();

    // Faint inner highlight for a chamfered-edge look
    ctx.beginPath();
    this.roundRectPath(x + 2, y + 2, w - 4, h - 4, Math.max(0, r - 2));
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.stroke();
    ctx.restore();
  }

  /** Draws component artwork (image/SVG) fitted to the body, rotated with the part. */
  private drawImageBody(img: HTMLImageElement, x: number, y: number, w: number, h: number, isSelected: boolean) {
    const ctx = Canvas.ctx;
    const rot90 = this.rotationAngle === 90 || this.rotationAngle === 270;
    // widthPin/heightPin are swapped on rotate, so undo that for the source box
    const boxW = rot90 ? h : w;
    const boxH = rot90 ? w : h;
    const pad = 4;

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((this.rotationAngle * Math.PI) / 180);
    ctx.drawImage(img, -boxW / 2 - pad, -boxH / 2 - pad, boxW + pad * 2, boxH + pad * 2);
    ctx.restore();

    if (isSelected) {
      ctx.save();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
      ctx.restore();
    }
  }

  /** Renders the component body: artwork if present, otherwise the chip package. */
  private drawPackage(x: number, y: number, w: number, h: number, isSelected: boolean) {
    const img = this.imageSrc ? Ic.getImage(this.imageSrc) : null;
    if (img) {
      this.drawImageBody(img, x, y, w, h, isSelected);
      return;
    }
    // Room for kind-specific vector art here later (e.g. this.kind === "resistor").
    this.drawChipBody(x, y, w, h, isSelected);
  }

  drawBody(){
    if (!this.topLeftDot) return;
    const isSelected = this === State.selectedPlacedIc;
    const w = 50 * (this.widthPin - 1);
    const h = 50 * (this.heightPin - 1);
    const x = this.topLeftDot.x;
    const y = this.topLeftDot.y;

    this.drawPackage(x, y, w, h, isSelected);

    // Draw Pin 1 orientation notch
    const notchRadius = 6;
    Canvas.ctx.beginPath();
    Canvas.ctx.fillStyle = "#38bdf8";
    if (this.rotationAngle === 0) {
      Canvas.ctx.arc(x + (w / 2), y, notchRadius, 0, Math.PI);
    } else if (this.rotationAngle === 90) {
      Canvas.ctx.arc(x + w, y + (h / 2), notchRadius, 0.5 * Math.PI, 1.5 * Math.PI);
    } else if (this.rotationAngle === 180) {
      Canvas.ctx.arc(x + (w / 2), y + h, notchRadius, Math.PI, 2 * Math.PI);
    } else if (this.rotationAngle === 270) {
      Canvas.ctx.arc(x, y + (h / 2), notchRadius, 1.5 * Math.PI, 0.5 * Math.PI);
    }
    Canvas.ctx.fill();
    Canvas.ctx.lineWidth = 1;
    Canvas.ctx.strokeStyle = isSelected ? "#38bdf8" : "#1f2937";
    Canvas.ctx.stroke();

    // Draw Pin 1 dot marker
    Canvas.ctx.beginPath();
    let p1x = x + 10;
    let p1y = y + 10;
    if (this.rotationAngle === 90) {
      p1x = x + w - 10;
      p1y = y + 10;
    } else if (this.rotationAngle === 180) {
      p1x = x + w - 10;
      p1y = y + h - 10;
    } else if (this.rotationAngle === 270) {
      p1x = x + 10;
      p1y = y + h - 10;
    }
    Canvas.ctx.arc(p1x, p1y, 3, 0, Math.PI * 2);
    Canvas.ctx.fillStyle = "#38bdf8";
    Canvas.ctx.fill();

    if (isSelected) {
      // Draw selection corner handles
      Canvas.ctx.fillStyle = "#38bdf8";
      Canvas.ctx.fillRect(x - 4, y - 4, 8, 8);
      Canvas.ctx.fillRect(x + w - 4, y - 4, 8, 8);
      Canvas.ctx.fillRect(x - 4, y + h - 4, 8, 8);
      Canvas.ctx.fillRect(x + w - 4, y + h - 4, 8, 8);
    }
  }

  /**
   * Pixel offset that pulls the first/last edge-pin label off the IC's
   * perpendicular border line so it stays readable. Positive nudges the
   * top pin down / left pin right; negative nudges the bottom / right one.
   */
  private edgePinLabelNudge(i: number, pinsPerSide: number): number {
    if (i === 0) return 9;
    if (i === pinsPerSide - 1) return -9;
    return 0;
  }

  drawPinLabels() {
    if (!this.topLeftDot) return;
    Canvas.ctx.save();
    Canvas.ctx.font = "600 9px monospace, sans-serif";
    Canvas.ctx.fillStyle = "#cbd5e1";

    if (this.rotationAngle === 0) {
      // 0°: Vertical (Left: 1..N, Right: 2N..N+1)
      const pinsPerSide = this.heightPin;
      const rightX = this.topLeftDot.x + 50 * (this.widthPin - 1);
      for (let i = 0; i < pinsPerSide; i++) {
        const py = this.topLeftDot.y + i * 50;
        const labelY = py + 3 + this.edgePinLabelNudge(i, pinsPerSide);
        const leftPinNum = i + 1;
        const leftDesc = this.pinDescription[leftPinNum];
        Canvas.ctx.textAlign = "left";
        Canvas.ctx.fillText(leftDesc ? `${leftPinNum}:${leftDesc}` : `${leftPinNum}`, this.topLeftDot.x + 10, labelY);

        const rightPinNum = pinsPerSide * 2 - i;
        const rightDesc = this.pinDescription[rightPinNum];
        Canvas.ctx.textAlign = "right";
        Canvas.ctx.fillText(rightDesc ? `${rightDesc}:${rightPinNum}` : `${rightPinNum}`, rightX - 10, labelY);
      }
    } else if (this.rotationAngle === 90) {
      // 90°: Top: 1..N, Bottom: 2N..N+1
      const pinsPerSide = this.widthPin;
      const bottomY = this.topLeftDot.y + 50 * (this.heightPin - 1);
      for (let i = 0; i < pinsPerSide; i++) {
        const px = this.topLeftDot.x + i * 50 + this.edgePinLabelNudge(i, pinsPerSide);
        const topPinNum = i + 1;
        const topDesc = this.pinDescription[topPinNum];
        Canvas.ctx.textAlign = "center";
        Canvas.ctx.fillText(topDesc ? `${topPinNum}:${topDesc}` : `${topPinNum}`, px, this.topLeftDot.y + 16);

        const bottomPinNum = pinsPerSide * 2 - i;
        const bottomDesc = this.pinDescription[bottomPinNum];
        Canvas.ctx.textAlign = "center";
        Canvas.ctx.fillText(bottomDesc ? `${bottomDesc}:${bottomPinNum}` : `${bottomPinNum}`, px, bottomY - 10);
      }
    } else if (this.rotationAngle === 180) {
      // 180°: Left: 2N..N+1, Right: 1..N
      const pinsPerSide = this.heightPin;
      const rightX = this.topLeftDot.x + 50 * (this.widthPin - 1);
      for (let i = 0; i < pinsPerSide; i++) {
        const py = this.topLeftDot.y + i * 50;
        const labelY = py + 3 + this.edgePinLabelNudge(i, pinsPerSide);
        const leftPinNum = pinsPerSide * 2 - i;
        const leftDesc = this.pinDescription[leftPinNum];
        Canvas.ctx.textAlign = "left";
        Canvas.ctx.fillText(leftDesc ? `${leftPinNum}:${leftDesc}` : `${leftPinNum}`, this.topLeftDot.x + 10, labelY);

        const rightPinNum = i + 1;
        const rightDesc = this.pinDescription[rightPinNum];
        Canvas.ctx.textAlign = "right";
        Canvas.ctx.fillText(rightDesc ? `${rightDesc}:${rightPinNum}` : `${rightPinNum}`, rightX - 10, labelY);
      }
    } else if (this.rotationAngle === 270) {
      // 270°: Top: 2N..N+1, Bottom: 1..N
      const pinsPerSide = this.widthPin;
      const bottomY = this.topLeftDot.y + 50 * (this.heightPin - 1);
      for (let i = 0; i < pinsPerSide; i++) {
        const px = this.topLeftDot.x + i * 50 + this.edgePinLabelNudge(i, pinsPerSide);
        const topPinNum = pinsPerSide * 2 - i;
        const topDesc = this.pinDescription[topPinNum];
        Canvas.ctx.textAlign = "center";
        Canvas.ctx.fillText(topDesc ? `${topPinNum}:${topDesc}` : `${topPinNum}`, px, this.topLeftDot.y + 16);

        const bottomPinNum = i + 1;
        const bottomDesc = this.pinDescription[bottomPinNum];
        Canvas.ctx.textAlign = "center";
        Canvas.ctx.fillText(bottomDesc ? `${bottomDesc}:${bottomPinNum}` : `${bottomPinNum}`, px, bottomY - 10);
      }
    }

    Canvas.ctx.restore();
  }

  drawLabel(){
    if (!this.topLeftDot) return;
    const isSelected = this === State.selectedPlacedIc;
    const w = 50 * (this.widthPin - 1);
    const h = 50 * (this.heightPin - 1);
    const centerX = this.topLeftDot.x + (w / 2);
    const centerY = this.topLeftDot.y + (h / 2);

    Canvas.ctx.save();
    Canvas.ctx.font = "bold 11px Inter, Arial";
    const textWidth = Canvas.ctx.measureText(this.name).width;
    const badgeW = textWidth + 16;
    const badgeH = 20;

    // Draw background badge pill behind label
    Canvas.ctx.beginPath();
    Canvas.ctx.fillStyle = "#0f172a";
    Canvas.ctx.strokeStyle = isSelected ? "#38bdf8" : "#334155";
    Canvas.ctx.lineWidth = 1.5;
    const rectX = centerX - (badgeW / 2);
    const rectY = centerY - (badgeH / 2);
    Canvas.ctx.rect(rectX, rectY, badgeW, badgeH);
    Canvas.ctx.fill();
    Canvas.ctx.stroke();

    // Draw high-contrast text
    Canvas.ctx.fillStyle = isSelected ? "#38bdf8" : "#ffffff";
    Canvas.ctx.textAlign = "center";
    Canvas.ctx.fillText(this.name, centerX, centerY + 4);
    Canvas.ctx.restore();

    this.drawPinLabels();
    this.drawNote();
  }

  /**
   * Draws the component's annotation in a pill just below its body. Shows the
   * full text while the component is hovered, a truncated form otherwise
   * (mirrors how pad notes render in draw-canvas.ts).
   */
  drawNote() {
    if (!this.topLeftDot || !this.description) return;
    const ctx = Canvas.ctx;
    const w = 50 * (this.widthPin - 1);
    const h = 50 * (this.heightPin - 1);
    const centerX = this.topLeftDot.x + (w / 2);
    const baselineY = this.topLeftDot.y + h + 18;

    const isHover = this === State.hoverIc;
    const body = isHover || this.description.length <= 24
      ? this.description
      : `${this.description.substring(0, 24)}…`;
    const text = `📝 ${body}`;

    ctx.save();
    ctx.font = "10px Inter, Arial";
    ctx.textAlign = "center";
    const textWidth = ctx.measureText(text).width;
    const badgeW = textWidth + 14;
    const badgeH = 16;

    ctx.beginPath();
    ctx.fillStyle = "#0f172a";
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    ctx.rect(centerX - (badgeW / 2), baselineY - badgeH + 4, badgeW, badgeH);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#fbbf24";
    ctx.fillText(text, centerX, baselineY);
    ctx.restore();
  }

  draw(){
    this.drawBody();
    this.drawLabel();
  }

  containsPoint(x: number, y: number): boolean {
    if (!this.topLeftDot) return false;
    const w = 50 * (this.widthPin - 1);
    const h = 50 * (this.heightPin - 1);
    return (
      x >= this.topLeftDot.x &&
      x <= this.topLeftDot.x + w &&
      y >= this.topLeftDot.y &&
      y <= this.topLeftDot.y + h
    );
  }

  /**
   * True when the dot sits under this IC's body but is not one of its pins,
   * so the render loop can hide it (concealed by the chip package).
   */
  hidesDot(dot: IDot): boolean {
    return this.containsPoint(dot.x, dot.y) && this.getPinPositionOnIC(dot) === null;
  }

  clone(): Ic {
    const copy = new Ic(this.widthPin, this.heightPin, { ...this.pinDescription }, this.name, this.isCustom, this.kind, this.imageSrc);
    return copy;
  }

  getPinPositionOnIC(dot: IDot) {
    if (this.topLeftDot == null) {
      return null;
    }

    if (this.rotationAngle === 0) {
      // 0°: Vertical (Side A = Left: 1..N, Side B = Right: 2N..N+1)
      const isOnLeftSide = dot.x === this.topLeftDot.x && dot.y >= this.topLeftDot.y && dot.y <= this.topLeftDot.y + ((this.heightPin - 1) * 50);
      const isOnRightSide = dot.x === this.topLeftDot.x + 50 * (this.widthPin - 1) && dot.y >= this.topLeftDot.y && dot.y <= this.topLeftDot.y + ((this.heightPin - 1) * 50);
      if (!(isOnLeftSide || isOnRightSide)) return null;

      const relativeY = dot.y - this.topLeftDot.y;
      const i = Math.round(relativeY / 50);
      if (i >= 0 && i < this.heightPin) {
        const pinNbr = isOnLeftSide ? (i + 1) : (this.heightPin * 2 - i);
        return { pin: pinNbr, info: this.pinDescription[pinNbr] };
      }
    } else if (this.rotationAngle === 90) {
      // 90°: Horizontal (Side A = Top: 1..N, Side B = Bottom: 2N..N+1)
      const isOnTopSide = dot.y === this.topLeftDot.y && dot.x >= this.topLeftDot.x && dot.x <= this.topLeftDot.x + ((this.widthPin - 1) * 50);
      const isOnBottomSide = dot.y === this.topLeftDot.y + 50 * (this.heightPin - 1) && dot.x >= this.topLeftDot.x && dot.x <= this.topLeftDot.x + ((this.widthPin - 1) * 50);
      if (!(isOnTopSide || isOnBottomSide)) return null;

      const relativeX = dot.x - this.topLeftDot.x;
      const i = Math.round(relativeX / 50);
      if (i >= 0 && i < this.widthPin) {
        const pinNbr = isOnTopSide ? (i + 1) : (this.widthPin * 2 - i);
        return { pin: pinNbr, info: this.pinDescription[pinNbr] };
      }
    } else if (this.rotationAngle === 180) {
      // 180°: Vertical (Side A = Right: 1..N, Side B = Left: 2N..N+1)
      const isOnLeftSide = dot.x === this.topLeftDot.x && dot.y >= this.topLeftDot.y && dot.y <= this.topLeftDot.y + ((this.heightPin - 1) * 50);
      const isOnRightSide = dot.x === this.topLeftDot.x + 50 * (this.widthPin - 1) && dot.y >= this.topLeftDot.y && dot.y <= this.topLeftDot.y + ((this.heightPin - 1) * 50);
      if (!(isOnLeftSide || isOnRightSide)) return null;

      const relativeY = dot.y - this.topLeftDot.y;
      const i = Math.round(relativeY / 50);
      if (i >= 0 && i < this.heightPin) {
        const pinNbr = isOnRightSide ? (i + 1) : (this.heightPin * 2 - i);
        return { pin: pinNbr, info: this.pinDescription[pinNbr] };
      }
    } else if (this.rotationAngle === 270) {
      // 270°: Horizontal (Side A = Bottom: 1..N, Side B = Top: 2N..N+1)
      const isOnTopSide = dot.y === this.topLeftDot.y && dot.x >= this.topLeftDot.x && dot.x <= this.topLeftDot.x + ((this.widthPin - 1) * 50);
      const isOnBottomSide = dot.y === this.topLeftDot.y + 50 * (this.heightPin - 1) && dot.x >= this.topLeftDot.x && dot.x <= this.topLeftDot.x + ((this.widthPin - 1) * 50);
      if (!(isOnTopSide || isOnBottomSide)) return null;

      const relativeX = dot.x - this.topLeftDot.x;
      const i = Math.round(relativeX / 50);
      if (i >= 0 && i < this.widthPin) {
        const pinNbr = isOnBottomSide ? (i + 1) : (this.widthPin * 2 - i);
        return { pin: pinNbr, info: this.pinDescription[pinNbr] };
      }
    }
    return null;
  }

  getPinNumber(dot: IDot){
    if (!this.getPinPositionOnIC(dot) || !this.topLeftDot){
      return null;
    }

    const relativeY = dot.y - this.topLeftDot.y;
    const pinNumber = Math.floor(relativeY / 50) + 1;

    if (pinNumber > 0 && pinNumber <= this.widthPin) {
      return { pin: pinNumber, info: this.pinDescription[pinNumber]};
    }
  }

  calculateDistance(x1: number, y1: number, x2: number, y2: number) {
    const deltaX = x2 - x1;
    const deltaY = y2 - y1;
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  }

  rotate(){
    this.rotationAngle = ((this.rotationAngle + 90) % 360) as 0 | 90 | 180 | 270;
    const tmp = this.widthPin;
    this.widthPin = this.heightPin;
    this.heightPin = tmp;
  }
}

/**
 * Reset the IC catalog to the built-in components plus any custom ICs saved
 * in localStorage. Called once at startup and again after a project reset.
 */
export function loadDefaultIcs() {
  Ic.IC_CONTAINER = [];
  Ic.add(new Ic(4, 4, {1: "GND", 2: "TRIG", 3: "OUT", 4: "RESET", 5: "CTRL", 6: "THRESH", 7: "DISCH", 8: "VCC"}, "NE555 Timer"));
  Ic.add(new Ic(4, 7, {1: "1A", 2: "1B", 3: "1Y", 4: "2A", 5: "2B", 6: "2Y", 7: "GND", 14: "VCC"}, "DIP-14 Logic"));
  Ic.add(new Ic(4, 8, {1: "EN", 2: "1D", 3: "1Q", 4: "2D", 5: "2Q", 8: "GND", 16: "VCC"}, "DIP-16 Logic"));
  Ic.add(new Ic(4, 14, {1: "RESET", 2: "RX", 3: "TX", 7: "VCC", 8: "GND", 22: "GND", 20: "AVCC"}, "ATmega328P"));
  Ic.loadCustomIcsFromLocalStorage();
}

loadDefaultIcs();

export function deleteCustomIc(id: number | string) {
  const index = Ic.IC_CONTAINER.findIndex(ic => String(ic.id) === String(id));
  if (index > -1) {
    Ic.IC_CONTAINER.splice(index, 1);
    Ic.saveCustomIcsToLocalStorage();
    Ic.showICs();
  }
}

export function selectIc(id: number | string){
  const ic = Ic.IC_CONTAINER.find(ic => String(ic.id) === String(id));
  if (!ic){
    console.error(`Ic with id: ${id} not found`);
    return;
  }
  State.selectedIc = ic;
}

export function rotateSelectedIc() {
  if (State.selectedPlacedIc) {
    State.selectedPlacedIc.rotate();
    redrawCanvas();
    return;
  }
  if (State.selectedIc) {
    State.selectedIc.rotate();
    redrawCanvas();
    return;
  }
  if (State.hoverDot) {
    const hoveredIc = State.placedIcs.find(ic => ic.containsPoint(State.hoverDot!.x, State.hoverDot!.y));
    if (hoveredIc) {
      hoveredIc.rotate();
      State.selectedPlacedIc = hoveredIc;
      redrawCanvas();
      return;
    }
  }
}

ShortcutRegistry.add({
  key: "r",
  description: "Rotate selected component.",
  event: rotateSelectedIc
});

(window as any).selectIc = selectIc;
(window as any).deleteCustomIc = deleteCustomIc;
(window as any).rotateSelectedIc = rotateSelectedIc;
