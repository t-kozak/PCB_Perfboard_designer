export class Utils {
  static getSafeHtmlElement<T extends HTMLElement = HTMLHtmlElement>(id: string): T {
    const element = document.getElementById(id);
    if (element == null){
      throw new Error(`Element: ${id} not found.`)
    }

    return element as T
  }

  /** Escapes text for safe insertion into innerHTML (used for user-supplied strings like custom component names/categories). */
  static escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * `color` darkened, if needed, to stay visible on white paper: a light
   * colour (GND's near-white, yellow, pastel greens) is scaled towards black
   * until its luminance is at most 0.45; darker colours pass unchanged.
   */
  static printInk(color: string): string {
    const hex = Utils.normalizeColor(color, "");
    if (!hex) return color;
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    if (lum <= 0.45) return hex;
    const k = 0.45 / lum;
    return '#' + rgb.map(c => Math.round(c * k).toString(16).padStart(2, '0')).join('');
  }

  static normalizeColor(color?: string, fallback = "#000000"): string {
    if (!color) return fallback;
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return color;
    }
    if (/^#[0-9A-Fa-f]{3}$/.test(color)) {
      return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
    }
    return fallback;
  }
}

