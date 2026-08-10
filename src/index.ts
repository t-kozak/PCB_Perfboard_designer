import "./style.css";
import "./features/project/save-image";
import "./features/project/save-progress";
import "./features/project/save-project";
import "./features/select";
import "./features/project/load-project";
import "./features/hover";
import "./features/description";
import "./features/line";
import "./features/project/undo-redo";
import "./features/project/load-from-local-storage";
import "./features/shortcut-keys";
import "./features/dot";
import "./features/project/reset-project";
import {resetCanvas} from "./features/reset-canvas";
import {createDotGrid, heightInput, widthInput} from "./features/project/resize-grid";
import {redrawCanvas} from "./features/draw-canvas";
import {State} from "./state/State";
import {changeSelectedDotColor, setDotColor} from "./features/dot";
import {setLineColor, deleteLine} from "./features/line";
import {addDescriptionToDot} from "./features/description";
import {hideContextMenu} from "./features/select";
import {Ic} from "./features/ic";

createDotGrid(parseInt(widthInput.value || "10"), parseInt(heightInput.value || "10"));
resetCanvas();
redrawCanvas();

// IC Editor Modal Handlers
const modal = document.getElementById('icEditorModal');
const openModalBtn = document.getElementById('createCustomIcTrigger');
const closeModalBtn = document.getElementById('closeIcModalBtn');
const cancelModalBtn = document.getElementById('cancelCustomIcBtn');
const saveIcBtn = document.getElementById('saveCustomIcBtn');
const heightInputEl = document.getElementById('icHeightInput') as HTMLInputElement;
const pinLabelsContainer = document.getElementById('icPinLabelsContainer');
const totalPinsCount = document.getElementById('totalPinsCount');

function renderPinInputs() {
  if (!pinLabelsContainer || !heightInputEl) return;
  const h = parseInt(heightInputEl.value || "4");
  const totalPins = h * 2;
  if (totalPinsCount) totalPinsCount.innerText = String(totalPins);
  let html = '';
  for (let i = 1; i <= totalPins; i++) {
    html += `
      <div class="pin-input-item">
        <span>Pin ${i}:</span>
        <input type="text" id="pinInput_${i}" placeholder="Label ${i}">
      </div>
    `;
  }
  pinLabelsContainer.innerHTML = html;
}

openModalBtn?.addEventListener('click', () => {
  renderPinInputs();
  if (modal) modal.style.display = 'flex';
});

closeModalBtn?.addEventListener('click', () => {
  if (modal) modal.style.display = 'none';
});

cancelModalBtn?.addEventListener('click', () => {
  if (modal) modal.style.display = 'none';
});

heightInputEl?.addEventListener('input', renderPinInputs);

saveIcBtn?.addEventListener('click', () => {
  const nameInput = document.getElementById('icNameInput') as HTMLInputElement;
  const widthInputEl = document.getElementById('icWidthInput') as HTMLInputElement;

  const name = nameInput?.value.trim() || 'Custom IC';
  const width = parseInt(widthInputEl?.value || '4');
  const height = parseInt(heightInputEl?.value || '4');
  const totalPins = height * 2;

  const pinDescriptions: Record<number, string> = {};
  for (let i = 1; i <= totalPins; i++) {
    const input = document.getElementById(`pinInput_${i}`) as HTMLInputElement;
    if (input && input.value.trim()) {
      pinDescriptions[i] = input.value.trim();
    }
  }

  const customIc = new Ic(width, height, pinDescriptions, name, true);
  Ic.add(customIc, true);

  if (modal) modal.style.display = 'none';
});

// Tool Mode Selector Listener
document.querySelectorAll('#toolModeSelector .tool-mode-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('#toolModeSelector .tool-mode-btn').forEach(b => b.classList.remove('active-mode'));
    const target = e.currentTarget as HTMLElement;
    target.classList.add('active-mode');
    const mode = target.getAttribute('data-mode') as 'wire' | 'eraser' | 'note' | 'ic';
    if (mode) {
      State.activeToolMode = mode;
      updateSelectionStatus();
    }
  });
});

// Wire Gauge Selector Listener
document.querySelectorAll('#wireGaugeSelector .gauge-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('#wireGaugeSelector .gauge-btn').forEach(b => b.classList.remove('active-mode'));
    const target = e.currentTarget as HTMLElement;
    target.classList.add('active-mode');
    const widthStr = target.getAttribute('data-width');
    if (widthStr) {
      State.selectedWireWidth = parseInt(widthStr);
      if (State.selectedLine) {
        State.selectedLine.width = State.selectedWireWidth;
        redrawCanvas();
      }
    }
  });
});

// Context Menu Actions
document.getElementById('ctxColorBtn')?.addEventListener('click', () => {
  hideContextMenu();
  if (State.selectedLine || State.selectedDot) {
    changeSelectedDotColor();
  }
});

document.getElementById('ctxNoteBtn')?.addEventListener('click', () => {
  hideContextMenu();
  if (State.selectedDot) {
    addDescriptionToDot();
  }
});

document.getElementById('ctxDeleteBtn')?.addEventListener('click', () => {
  hideContextMenu();
  if (State.selectedLine) {
    deleteLine();
  } else if (State.selectedDot && State.selectedDot.description) {
    State.selectedDot.description = undefined;
    redrawCanvas();
  }
});

// Custom Colors Palette & LocalStorage Persistence
let customColors: string[] = [];

function saveCustomColorsToLocalStorage() {
  try {
    localStorage.setItem('custom_colors', JSON.stringify(customColors));
  } catch (e) {
    console.error("Failed to save custom colors to localStorage", e);
  }
}

function loadCustomColorsFromLocalStorage() {
  try {
    const stored = localStorage.getItem('custom_colors');
    if (stored) {
      customColors = JSON.parse(stored);
    }
  } catch (e) {
    console.error("Failed to load custom colors from localStorage", e);
  }
}

function renderSwatches() {
  const container = document.getElementById('quickSwatches');
  if (!container) return;
  const defaultColors = ["#ef4444", "#3b82f6", "#10b981", "#eab308", "#f97316", "#a855f7", "#ffffff", "#1e293b"];
  
  let html = defaultColors.map(c => 
    `<button class="color-swatch" data-color="${c}" style="background:${c};" title="${c}"></button>`
  ).join('');

  html += customColors.map(c => 
    `<button class="color-swatch" data-color="${c}" data-custom="true" style="background:${c}; position:relative; border-color:#38bdf8;" title="${c} (Right-click to delete)"></button>`
  ).join('');

  container.innerHTML = html;

  container.querySelectorAll('.color-swatch').forEach((swatch) => {
    swatch.addEventListener('click', (e) => {
      const color = (e.currentTarget as HTMLElement).getAttribute('data-color');
      if (!color) return;
      State.activeWireColor = color;
      const badge = document.getElementById('activeColorBadge');
      if (badge) {
        badge.style.background = color;
        badge.style.boxShadow = `0 0 6px ${color}`;
      }
      if (State.selectedLine) {
        setLineColor(color);
      } else if (State.selectedDot) {
        setDotColor(color);
      }
      updateSelectionStatus();
    });

    swatch.addEventListener('contextmenu', (e) => {
      const target = e.currentTarget as HTMLElement;
      if (target.getAttribute('data-custom') === 'true') {
        e.preventDefault();
        const color = target.getAttribute('data-color');
        if (color) {
          customColors = customColors.filter(c => c !== color);
          saveCustomColorsToLocalStorage();
          renderSwatches();
        }
      }
    });
  });
}

loadCustomColorsFromLocalStorage();
renderSwatches();

// Mouse-Interactive 2D Color Spectrum Selector Handlers
const spectrumCanvas = document.getElementById('colorSpectrumCanvas') as HTMLCanvasElement;
const hueBar = document.getElementById('hueBar') as HTMLInputElement;
const spectrumHandle = document.getElementById('spectrumHandle');
const hexInput = document.getElementById('hexColorInput') as HTMLInputElement;
const previewBox = document.getElementById('colorPreviewBox');
const togglePanelBtn = document.getElementById('toggleCustomColorPanelBtn');
const panel = document.getElementById('customColorPanel');

let currentHue = 195;
let isMouseDownOnSpectrum = false;

togglePanelBtn?.addEventListener('click', () => {
  if (panel) {
    const isOpen = panel.style.display === 'flex';
    panel.style.display = isOpen ? 'none' : 'flex';
    if (!isOpen) {
      setTimeout(() => {
        drawColorSpectrum();
      }, 50);
    }
  }
});

function drawColorSpectrum() {
  if (!spectrumCanvas) return;
  const ctx = spectrumCanvas.getContext('2d');
  if (!ctx) return;
  const w = spectrumCanvas.width;
  const h = spectrumCanvas.height;

  // 1. Draw base Hue color background
  ctx.fillStyle = `hsl(${currentHue}, 100%, 50%)`;
  ctx.fillRect(0, 0, w, h);

  // 2. Horizontal gradient: White to transparent
  const whiteGrad = ctx.createLinearGradient(0, 0, w, 0);
  whiteGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  whiteGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = whiteGrad;
  ctx.fillRect(0, 0, w, h);

  // 3. Vertical gradient: Transparent to Black
  const blackGrad = ctx.createLinearGradient(0, 0, 0, h);
  blackGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  blackGrad.addColorStop(1, 'rgba(0, 0, 0, 1)');
  ctx.fillStyle = blackGrad;
  ctx.fillRect(0, 0, w, h);
}

function updatePickedColorFromMouse(clientX: number, clientY: number) {
  if (!spectrumCanvas) return;
  const rect = spectrumCanvas.getBoundingClientRect();
  let x = Math.max(0, Math.min(rect.width, clientX - rect.left));
  let y = Math.max(0, Math.min(rect.height, clientY - rect.top));

  if (spectrumHandle) {
    spectrumHandle.style.left = `${x}px`;
    spectrumHandle.style.top = `${y}px`;
  }

  // Sample exact pixel color from canvas
  const ctx = spectrumCanvas.getContext('2d');
  if (ctx) {
    const canvasX = Math.min(spectrumCanvas.width - 1, Math.max(0, Math.round((x / rect.width) * spectrumCanvas.width)));
    const canvasY = Math.min(spectrumCanvas.height - 1, Math.max(0, Math.round((y / rect.height) * spectrumCanvas.height)));
    const pixel = ctx.getImageData(canvasX, canvasY, 1, 1).data;
    const r = pixel[0];
    const g = pixel[1];
    const b = pixel[2];
    const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    
    if (hexInput) hexInput.value = hex;
    if (previewBox) previewBox.style.background = hex;
    State.activeWireColor = hex;
    const badge = document.getElementById('activeColorBadge');
    if (badge) {
      badge.style.background = hex;
      badge.style.boxShadow = `0 0 6px ${hex}`;
    }
  }
}

hueBar?.addEventListener('input', () => {
  currentHue = parseInt(hueBar.value || "0");
  drawColorSpectrum();
  if (spectrumHandle && spectrumCanvas) {
    const rect = spectrumCanvas.getBoundingClientRect();
    const handleX = parseFloat(spectrumHandle.style.left) || rect.width / 2;
    const handleY = parseFloat(spectrumHandle.style.top) || rect.height / 2;
    updatePickedColorFromMouse(rect.left + handleX, rect.top + handleY);
  }
});

spectrumCanvas?.addEventListener('mousedown', (e) => {
  isMouseDownOnSpectrum = true;
  updatePickedColorFromMouse(e.clientX, e.clientY);
});

window.addEventListener('mousemove', (e) => {
  if (isMouseDownOnSpectrum) {
    updatePickedColorFromMouse(e.clientX, e.clientY);
  }
});

window.addEventListener('mouseup', () => {
  isMouseDownOnSpectrum = false;
});

document.getElementById('addCustomColorToPaletteBtn')?.addEventListener('click', () => {
  const hex = hexInput?.value.trim();
  if (hex && /^#[0-9A-Fa-f]{6}$/.test(hex)) {
    if (!customColors.includes(hex)) {
      customColors.push(hex);
      saveCustomColorsToLocalStorage();
      renderSwatches();
    }
    State.activeWireColor = hex;
    const badge = document.getElementById('activeColorBadge');
    if (badge) badge.style.background = hex;
    if (State.selectedLine) {
      setLineColor(hex);
    } else if (State.selectedDot) {
      setDotColor(hex);
    }
  }
});

// Grid Preset Buttons listener
document.querySelectorAll('#gridPresets .preset-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const target = e.currentTarget as HTMLElement;
    const w = target.getAttribute('data-w');
    const h = target.getAttribute('data-h');
    if (w && h) {
      widthInput.value = w;
      heightInput.value = h;
      createDotGrid(parseInt(w), parseInt(h));
      resetCanvas();
      redrawCanvas();
    }
  });
});

// Dynamic selection status updater
export function updateSelectionStatus() {
  const statusEl = document.getElementById('activeSelectionStatus');
  if (!statusEl) return;
  const modeLabel = State.activeToolMode.toUpperCase();
  if (State.selectedPlacedIc) {
    statusEl.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#38bdf8;margin-right:4px;"></span> Placed IC Selected (${State.selectedPlacedIc.name}) [Click Pad to Relocate • Del to Remove]`;
  } else if (State.selectedLine) {
    statusEl.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${State.selectedLine.color || '#777676'};margin-right:4px;"></span> Line Selected (${State.selectedLine.width || 4}px) [Mode: ${modeLabel}]`;
  } else if (State.selectedDot) {
    statusEl.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${State.selectedDot.color || '#a4a0a0'};margin-right:4px;"></span> Pad Selected (${State.selectedDot.x}, ${State.selectedDot.y}) [Mode: ${modeLabel}]`;
  } else if (State.selectedIc) {
    statusEl.innerHTML = `<span>IC Ready: ${State.selectedIc.name} [Click Pad to Place]</span>`;
  } else {
    statusEl.innerHTML = `<span>Tool: ${modeLabel} Mode</span>`;
  }
}

// Update status badge on user clicks
window.addEventListener('click', () => {
  setTimeout(updateSelectionStatus, 50);
});

// Fullscreen Focus Mode & Board Zoom Management
let currentZoom = 1.0;
let isFullscreenMode = false;
let isSidebarVisible = true;

function applyZoom(zoom: number) {
  currentZoom = Math.min(3.0, Math.max(0.2, zoom));
  const wrapper = document.getElementById('canvasZoomWrapper');
  if (wrapper) {
    wrapper.style.transform = `scale(${currentZoom})`;
  } else if (Canvas.c) {
    Canvas.c.style.transformOrigin = 'center center';
    Canvas.c.style.transform = `scale(${currentZoom})`;
  }
  const zoomText = `${Math.round(currentZoom * 100)}%`;
  const text1 = document.getElementById('zoomLevelText');
  const text2 = document.getElementById('fsZoomText');
  if (text1) text1.innerText = zoomText;
  if (text2) text2.innerText = zoomText;
}

function zoomIn() {
  applyZoom(currentZoom + 0.15);
}

function zoomOut() {
  applyZoom(currentZoom - 0.15);
}

function fitToScreen() {
  const container = document.getElementById('canvas-container');
  if (!container || !Canvas.c) return;
  const rect = container.getBoundingClientRect();
  const availableWidth = rect.width - 20;
  const availableHeight = rect.height - 20;
  const canvasW = Canvas.c.width;
  const canvasH = Canvas.c.height;

  if (availableWidth <= 0 || availableHeight <= 0) return;

  const scaleX = availableWidth / canvasW;
  const scaleY = availableHeight / canvasH;
  const fitScale = Math.min(scaleX, scaleY);
  applyZoom(fitScale);
}

function toggleSidebar(show?: boolean) {
  isSidebarVisible = show !== undefined ? show : !isSidebarVisible;
  const sidebar = document.getElementById('controls');
  const btn1 = document.getElementById('toggleSidebarBtn');

  if (sidebar) {
    if (isSidebarVisible) {
      sidebar.classList.remove('sidebar-collapsed');
      if (btn1) btn1.innerText = '◀ Sidebar';
    } else {
      sidebar.classList.add('sidebar-collapsed');
      if (btn1) btn1.innerText = '▶ Sidebar';
    }
  }
  setTimeout(fitToScreen, 80);
}

function toggleFullscreenMode(enable?: boolean) {
  isFullscreenMode = enable !== undefined ? enable : !isFullscreenMode;
  const layout = document.getElementById('mainAppLayout');
  const btn1 = document.getElementById('toggleFullscreenBtn');
  const btn2 = document.getElementById('canvasFullscreenTrigger');

  if (isFullscreenMode) {
    document.body.classList.add('fullscreen-active');
    layout?.classList.add('fullscreen-mode');
    if (btn1) btn1.innerText = '⛶ Exit Fullscreen';
    if (btn2) {
      btn2.innerText = '✕ Exit Fullscreen';
      btn2.className = 'btn-danger';
    }
    setTimeout(() => {
      fitToScreen();
    }, 50);
  } else {
    document.body.classList.remove('fullscreen-active');
    layout?.classList.remove('fullscreen-mode');
    if (btn1) btn1.innerText = '⛶ Fullscreen';
    if (btn2) {
      btn2.innerText = '⛶ Fullscreen';
      btn2.className = 'btn';
    }
    applyZoom(1.0);
  }
}

// Bind Zoom, Sidebar & Fullscreen buttons
document.getElementById('zoomInBtn')?.addEventListener('click', zoomIn);
document.getElementById('zoomOutBtn')?.addEventListener('click', zoomOut);
document.getElementById('zoomFitBtn')?.addEventListener('click', fitToScreen);

document.getElementById('toggleSidebarBtn')?.addEventListener('click', () => toggleSidebar());

document.getElementById('toggleFullscreenBtn')?.addEventListener('click', () => toggleFullscreenMode());
document.getElementById('canvasFullscreenTrigger')?.addEventListener('click', () => toggleFullscreenMode());

// Mouse Wheel Zoom on canvas
Canvas.c?.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault();
  if (e.deltaY < 0) {
    zoomIn();
  } else {
    zoomOut();
  }
}, { passive: false });

window.addEventListener('resize', () => {
  if (isFullscreenMode) {
    fitToScreen();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isFullscreenMode) {
    toggleFullscreenMode(false);
  }
  if ((e.key === 'f' || e.key === 'F') && (e.target === document.body || e.target === Canvas.c)) {
    toggleFullscreenMode();
  }
});
