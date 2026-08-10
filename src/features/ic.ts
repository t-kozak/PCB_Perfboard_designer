import {Canvas} from "../state/Canvas";
import {State} from "../state/State";
import {IDot} from "../interfaces/dot.interface";
import {ShortcutRegistry} from "./shortcut-keys";
import {Utils} from "../utils/utils";


export class Ic{
  static IC_CONTAINER: Ic[] = [];

  public id = Math.random() * 100;
  public isCustom?: boolean = false;
  topLeftDot: IDot | null = null;

  constructor(
    public widthPin: number, 
    public heightPin: number, 
    public pinDescription: Record<number, string>,
    public name: string,
    isCustom: boolean = false
  ) {
    this.isCustom = isCustom;
  }

  static add(ic: Ic, saveToStorage: boolean = false){
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
      }>;
      for (const data of customIcs) {
        if (!Ic.IC_CONTAINER.some(ic => String(ic.id) === String(data.id))) {
          const newIc = new Ic(data.widthPin, data.heightPin, data.pinDescription || {}, data.name, true);
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

  drawBody(){
    if (!this.topLeftDot) return;
    Canvas.ctx.beginPath();
    const isSelected = this === State.selectedPlacedIc;
    
    Canvas.ctx.fillStyle = isSelected ? "rgba(30,58,138,0.9)" : "rgba(17,24,39,0.85)";
    Canvas.ctx.strokeStyle = isSelected ? "#38bdf8" : "#475569";
    Canvas.ctx.lineWidth = isSelected ? 3 : 2;

    const w = 50 * (this.widthPin - 1);
    const h = 50 * (this.heightPin - 1);
    Canvas.ctx.rect(this.topLeftDot.x, this.topLeftDot.y, w, h);
    Canvas.ctx.stroke();
    Canvas.ctx.fill();

    if (isSelected) {
      // Draw selection corner handles
      Canvas.ctx.fillStyle = "#38bdf8";
      Canvas.ctx.fillRect(this.topLeftDot.x - 4, this.topLeftDot.y - 4, 8, 8);
      Canvas.ctx.fillRect(this.topLeftDot.x + w - 4, this.topLeftDot.y - 4, 8, 8);
      Canvas.ctx.fillRect(this.topLeftDot.x - 4, this.topLeftDot.y + h - 4, 8, 8);
      Canvas.ctx.fillRect(this.topLeftDot.x + w - 4, this.topLeftDot.y + h - 4, 8, 8);
    }
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

  clone(): Ic {
    const copy = new Ic(this.widthPin, this.heightPin, { ...this.pinDescription }, this.name, this.isCustom);
    return copy;
  }

  getPinPositionOnIC(dot: IDot) {
    if (this.topLeftDot == null){
      return false;
    }
    const isOnLeftSide = dot.x == this.topLeftDot.x && dot.y >= this.topLeftDot.y && dot.y <= this.topLeftDot.y + ((this.heightPin-1)*50 ) ;
    const isOnRightSide = dot.x == this.topLeftDot.x + 50 * (this.widthPin-1) && dot.y >= this.topLeftDot.y && dot.y <= this.topLeftDot.y + ((this.heightPin-1)*50 ) ;
    if (!( isOnLeftSide || isOnRightSide)){
      return null;
    }

      const relativeY = dot.y - this.topLeftDot.y;
      const pinNumber = Math.floor(relativeY / 50) + 1;

      if (pinNumber > 0 && pinNumber <= this.heightPin) {
        if (isOnRightSide){
          const pinNbr = (this.heightPin * 2 - pinNumber + 1)
          return { pin: pinNbr, info: this.pinDescription[pinNbr]};
        }
        return { pin: pinNumber, info: this.pinDescription[pinNumber]};
      }
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
    const tmp = this.widthPin;
    this.widthPin = this.heightPin;
    this.heightPin = tmp;
  }
}

// Predefined IC components
Ic.add(new Ic(4, 4, {1: "GND", 2: "TRIG", 3: "OUT", 4: "RESET", 5: "CTRL", 6: "THRESH", 7: "DISCH", 8: "VCC"}, "NE555 Timer"));
Ic.add(new Ic(4, 7, {1: "1A", 2: "1B", 3: "1Y", 4: "2A", 5: "2B", 6: "2Y", 7: "GND", 14: "VCC"}, "DIP-14 Logic"));
Ic.add(new Ic(4, 8, {1: "EN", 2: "1D", 3: "1Q", 4: "2D", 5: "2Q", 8: "GND", 16: "VCC"}, "DIP-16 Logic"));
Ic.add(new Ic(4, 14, {1: "RESET", 2: "RX", 3: "TX", 7: "VCC", 8: "GND", 22: "GND", 20: "AVCC"}, "ATmega328P"));

// Load custom ICs from localStorage on load
Ic.loadCustomIcsFromLocalStorage();

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

(window as any).selectIc = selectIc;
(window as any).deleteCustomIc = deleteCustomIc;
