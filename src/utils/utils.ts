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

