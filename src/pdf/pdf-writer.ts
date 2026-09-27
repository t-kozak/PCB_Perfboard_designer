/**
 * A minimal PDF 1.4 writer — just enough for the board report: pages of any
 * size, the built-in Helvetica / Helvetica-Bold fonts, filled/stroked
 * rectangles and lines, and lossless RGB images (FlateDecode, compressed by the
 * caller). **Pure**: no DOM, no State. Coordinates are PDF points (1/72 in)
 * with the origin at the page's *top-left* and y growing down — the writer
 * flips them into PDF's bottom-up space.
 *
 * Text uses the standard fonts' WinAnsi encoding, so only Latin-1 plus a few
 * typographic characters survive; anything else goes through `toWinAnsi()`
 * (Ω → "Ohm", unknown → "?"). Text width is measured by the caller-supplied
 * `measure` (Arial metrics match Helvetica's), keeping this module DOM-free.
 */

export type Rgb = [number, number, number];

export interface PdfImage {
  /** Pixel size of the image data. */
  width: number;
  height: number;
  /** zlib-compressed (FlateDecode) 8-bit RGB rows, `width * height * 3` bytes before compression. */
  data: Uint8Array;
}

export type FontStyle = "regular" | "bold";

/** Measures `text` set in Helvetica at `size` pt; returns its width in pt. */
export type MeasureText = (text: string, size: number, style: FontStyle) => number;

/** A4 in points. */
export const A4 = {width: 595.28, height: 841.89};

const FONT_RES: Record<FontStyle, string> = {regular: "F1", bold: "F2"};

/** Code points WinAnsiEncoding places in 0x80–0x9F. */
const WIN_ANSI_EXTRA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88,
  "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93,
  "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
  "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

/** Readable stand-ins for characters the standard fonts cannot show. */
const SUBSTITUTE: Record<string, string> = {
  "\u2126": "Ohm", "\u03a9": "Ohm", "\u03bc": "\u00b5", "≤": "<=", "≥": ">=", "≈": "~",
  "→": "->", "←": "<-", "↔": "<->", "−": "-", "\t": " ", "\r": " ", "\n": " ",
};

/** `text` with the characters the standard fonts lack spelled out (Ω → "Ohm") — what is actually printed. */
export function printable(text: string): string {
  let out = "";
  for (const ch of text) out += SUBSTITUTE[ch] ?? ch;
  return out;
}

/**
 * `text` as a string of WinAnsi byte values (each char code 0–255): Latin-1
 * passes through, the 0x80–0x9F typographic set is remapped, a few symbols
 * are spelled out and anything else becomes "?".
 */
export function toWinAnsi(text: string): string {
  let out = "";
  for (const ch of printable(text)) {
    const code = ch.codePointAt(0)!;
    if (WIN_ANSI_EXTRA[ch] !== undefined) out += String.fromCharCode(WIN_ANSI_EXTRA[ch]);
    else if ((code >= 0x20 && code < 0x7f) || (code >= 0xa0 && code <= 0xff)) out += ch;
    else out += "?";
  }
  return out;
}

/** `text` (already WinAnsi) as a PDF literal string. */
function pdfString(text: string): string {
  return `(${text.replace(/[\\()]/g, m => `\\${m}`)})`;
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();
const rgb = ([r, g, b]: Rgb) => `${num(r / 255)} ${num(g / 255)} ${num(b / 255)}`;

export class PdfPage {
  /** Content-stream operators (each char code 0–255). */
  readonly ops: string[] = [];
  /** Images drawn on this page, by resource name. */
  readonly images = new Map<string, number>();

  constructor(readonly width: number, readonly height: number, private readonly doc: PdfDocument) {}

  private y(top: number) {
    return this.height - top;
  }

  /** Fills (and/or strokes) a rectangle whose top-left corner is (x, y). */
  rect(x: number, y: number, w: number, h: number, opts: {fill?: Rgb; stroke?: Rgb; lineWidth?: number}): void {
    const parts: string[] = [];
    if (opts.fill) parts.push(`${rgb(opts.fill)} rg`);
    if (opts.stroke) parts.push(`${rgb(opts.stroke)} RG ${num(opts.lineWidth ?? 0.5)} w`);
    parts.push(`${num(x)} ${num(this.y(y + h))} ${num(w)} ${num(h)} re`);
    parts.push(opts.fill && opts.stroke ? "B" : opts.fill ? "f" : "S");
    this.ops.push(parts.join(" "));
  }

  line(x1: number, y1: number, x2: number, y2: number, color: Rgb, width = 0.5): void {
    this.ops.push(`${rgb(color)} RG ${num(width)} w ${num(x1)} ${num(this.y(y1))} m ${num(x2)} ${num(this.y(y2))} l S`);
  }

  /** Draws `text` with its baseline at `y`. */
  text(text: string, x: number, y: number, size: number, opts: {style?: FontStyle; color?: Rgb} = {}): void {
    const font = FONT_RES[opts.style ?? "regular"];
    this.ops.push(`BT ${rgb(opts.color ?? [0, 0, 0])} rg /${font} ${num(size)} Tf ${num(x)} ${num(this.y(y))} Td ${pdfString(toWinAnsi(text))} Tj ET`);
  }

  /**
   * Draws image `id` (from `PdfDocument.addImage`) into the box with top-left
   * (x, y) and size w × h. With `rotate`, the image is turned 90° clockwise to
   * fill the box (its top edge lands on the box's right side), so the box is
   * then image-height wide and image-width tall.
   */
  image(id: number, x: number, y: number, w: number, h: number, rotate = false): void {
    const name = `Im${id}`;
    this.images.set(name, id);
    const matrix = rotate
      ? `0 ${num(-h)} ${num(w)} 0 ${num(x)} ${num(this.y(y))}`
      : `${num(w)} 0 0 ${num(h)} ${num(x)} ${num(this.y(y + h))}`;
    this.ops.push(`q ${matrix} cm /${name} Do Q`);
  }

  /** Text width in points, via the document's measure function. */
  measure(text: string, size: number, style: FontStyle = "regular"): number {
    return this.doc.measure(printable(text), size, style);
  }
}

export class PdfDocument {
  readonly pages: PdfPage[] = [];
  private readonly imageList: PdfImage[] = [];

  constructor(readonly measure: MeasureText, readonly title = "") {}

  addPage(width = A4.width, height = A4.height): PdfPage {
    const page = new PdfPage(width, height, this);
    this.pages.push(page);
    return page;
  }

  /** Registers an image; returns the id `PdfPage.image()` takes. */
  addImage(img: PdfImage): number {
    this.imageList.push(img);
    return this.imageList.length - 1;
  }

  /** Serialises the document. */
  toBytes(): Uint8Array {
    // Object numbers: 1 catalog, 2 pages, 3 info, 4/5 fonts, then images, then (page, content) pairs.
    const imageObj = (i: number) => 6 + i;
    const firstPageObj = 6 + this.imageList.length;
    const pageObj = (i: number) => firstPageObj + i * 2;

    const chunks: Uint8Array[] = [];
    const offsets: number[] = [];
    let length = 0;
    const push = (bytes: Uint8Array) => {
      chunks.push(bytes);
      length += bytes.length;
    };
    const pushText = (s: string) => push(latin1(s));
    const object = (n: number, body: string, stream?: Uint8Array) => {
      offsets[n] = length;
      pushText(`${n} 0 obj\n${body}\n`);
      if (stream) {
        pushText("stream\n");
        push(stream);
        pushText("\nendstream\n");
      }
      pushText("endobj\n");
    };

    pushText("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
    object(1, "<< /Type /Catalog /Pages 2 0 R >>");
    const kids = this.pages.map((_, i) => `${pageObj(i)} 0 R`).join(" ");
    object(2, `<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>`);
    object(3, `<< /Title ${pdfString(toWinAnsi(this.title))} /Producer (PCB Perfboard Designer) >>`);
    object(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    object(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    this.imageList.forEach((img, i) => object(
      imageObj(i),
      `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${img.data.length} >>`,
      img.data,
    ));
    this.pages.forEach((page, i) => {
      const xobjects = [...page.images].map(([name, id]) => `/${name} ${imageObj(id)} 0 R`).join(" ");
      object(pageObj(i),
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] ` +
        `/Resources << /Font << /F1 4 0 R /F2 5 0 R >>${xobjects ? ` /XObject << ${xobjects} >>` : ""} >> ` +
        `/Contents ${pageObj(i) + 1} 0 R >>`);
      const content = latin1(page.ops.join("\n"));
      object(pageObj(i) + 1, `<< /Length ${content.length} >>`, content);
    });

    const xrefAt = length;
    const count = firstPageObj + this.pages.length * 2;
    let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (let n = 1; n < count; n++) xref += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
    pushText(xref + `trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

    const out = new Uint8Array(length);
    let at = 0;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
}

/** A string of char codes 0–255 as bytes. */
function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Splits `text` into lines no wider than `maxWidth` (breaking at spaces, or
 * mid-word when a single word is too long). Explicit newlines are kept.
 */
export function wrapText(text: string, maxWidth: number, size: number, style: FontStyle, measureText: MeasureText): string[] {
  const measure: MeasureText = (t, sz, st) => measureText(printable(t), sz, st);
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/ +/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, size, style) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A word wider than the column is broken character by character.
      let rest = word;
      while (measure(rest, size, style) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && measure(rest.slice(0, cut), size, style) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}
