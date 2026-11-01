import {Canvas} from "../../state/Canvas";
import {State} from "../../state/State";
import {A4, type FontStyle, type PdfImage, PdfDocument, type PdfPage, type Rgb, wrapText} from "../../pdf/pdf-writer";
import {renderBoardSides} from "./board-render";
import {billOfMaterials, type BomRow, type ComponentRow, componentRows} from "./component-list";
import {mapBoards} from "./boards";

// Project → PDF: for every board, one portrait page with both faces at 300%
// life size and, below them, a table of its components and their properties
// (spilling onto further pages only if long); then one bill of materials over
// the whole project.
// Built with the dependency-free writer in src/pdf/.

const MARGIN = 40;
const INK: Rgb = [17, 24, 39];
const MUTED: Rgb = [100, 116, 139];
const RULE: Rgb = [203, 213, 225];
const HEADER_FILL: Rgb = [30, 41, 59];
const ZEBRA: Rgb = [241, 245, 249];

/**
 * Print size: boards are drawn at 300% of life size. One pad pitch
 * (`State.dotSpace` board units) is 2.54 mm on a real perfboard.
 */
const PRINT_ZOOM = 3;
const PT_PER_UNIT = (2.54 / 25.4) * 72 * PRINT_ZOOM / State.dotSpace;
/** Snapshot device pixels per board unit — ≈ 330 dpi at the print size above. */
const SNAPSHOT_SCALE = 2;
/** Cap per face, to keep memory and file size sane on huge boards. */
const MAX_PIXELS = 16_000_000;

const measureCtx = document.createElement('canvas').getContext('2d')!;
function measure(text: string, size: number, style: FontStyle): number {
  measureCtx.font = `${style === "bold" ? "bold " : ""}${size}px Helvetica, Arial, sans-serif`;
  return measureCtx.measureText(text).width;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A canvas as a FlateDecode RGB image (lossless — thin traces stay crisp). */
async function toPdfImage(canvas: HTMLCanvasElement): Promise<PdfImage> {
  const {width, height} = canvas;
  const rgba = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  const stream = new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'));
  return {width, height, data: new Uint8Array(await new Response(stream).arrayBuffer())};
}

function pageHeader(page: PdfPage, title: string, subtitle: string): number {
  page.text(title, MARGIN, MARGIN + 14, 18, {style: "bold", color: INK});
  page.text(subtitle, MARGIN, MARGIN + 32, 9, {color: MUTED});
  page.line(MARGIN, MARGIN + 42, page.width - MARGIN, MARGIN + 42, RULE);
  return MARGIN + 58;
}

/** One board as captured while it was open. */
interface BoardSnapshot {
  name: string;
  /** Board size in board units. */
  width: number;
  height: number;
  component: HTMLCanvasElement;
  solder: HTMLCanvasElement;
  rows: ComponentRow[];
  subtitle: string;
}

/** Captures the open board (called once per board via `mapBoards`). */
function snapshotBoard(name: string, date: string): BoardSnapshot {
  const width = Canvas.boardWidth;
  const height = Canvas.boardHeight;
  const sides = renderBoardSides(Math.min(SNAPSHOT_SCALE, Math.sqrt(MAX_PIXELS / (width * height))), true);
  const rows = componentRows();
  const bridges = State.placedIcs.filter(ic => ic.isBridge).length;
  const subtitle = [
    date,
    plural(rows.length, "component"),
    bridges ? plural(bridges, "bridge") : "",
    plural(State.connections.length, "connection"),
  ].filter(Boolean).join("  ·  ");
  return {name, width, height, component: sides.component, solder: sides.solder, rows, subtitle};
}

const CAPTION = 18;
const FACE_GAP = 16;

/** Where the two faces go on the page: box size (after any rotation) and arrangement. */
interface FaceLayout {
  /** One face's box on the page, in points. */
  w: number;
  h: number;
  rotate: boolean;
  sideBySide: boolean;
  /** Total footprint of both faces with their captions. */
  totalW: number;
  totalH: number;
}

/**
 * Picks the most compact arrangement of the two faces within `maxW × maxH`:
 * each face as drawn or turned 90°, the two side by side or stacked. The board
 * is printed at `PT_PER_UNIT` (300% life size) when some arrangement fits,
 * otherwise shrunk as little as needed; of the arrangements at that size the
 * one using the least page height wins, leaving the most room for the table.
 */
function layoutFaces(boardW: number, boardH: number, maxW: number, maxH: number): FaceLayout {
  const candidates: FaceLayout[] = [];
  for (const rotate of boardW === boardH ? [false] : [false, true]) {
    for (const sideBySide of [true, false]) {
      const w = (rotate ? boardH : boardW) * PT_PER_UNIT;
      const h = (rotate ? boardW : boardH) * PT_PER_UNIT;
      candidates.push({
        w, h, rotate, sideBySide,
        totalW: sideBySide ? w * 2 + FACE_GAP : w,
        totalH: sideBySide ? CAPTION + h : (CAPTION + h) * 2 + FACE_GAP,
      });
    }
  }
  // Shrink factor each arrangement needs to fit (1 = full print size). The
  // captions and gap don't shrink, hence the subtraction.
  const fitOf = (c: FaceLayout) => Math.min(1,
    (maxW - (c.sideBySide ? FACE_GAP : 0)) / (c.totalW - (c.sideBySide ? FACE_GAP : 0)),
    (maxH - (c.totalH - (c.sideBySide ? c.h : c.h * 2))) / (c.sideBySide ? c.h : c.h * 2));
  const best = candidates
    .map(c => ({c, fit: fitOf(c)}))
    .sort((a, b) => b.fit - a.fit || a.c.totalH * a.fit - b.c.totalH * b.fit)[0];
  const {c, fit} = best;
  if (fit >= 1) return c;
  const w = c.w * fit;
  const h = c.h * fit;
  return {
    ...c, w, h,
    totalW: c.sideBySide ? w * 2 + FACE_GAP : w,
    totalH: c.sideBySide ? CAPTION + h : (CAPTION + h) * 2 + FACE_GAP,
  };
}

/**
 * Starts a board's page: header, then both faces laid out by `layoutFaces()`
 * and centred horizontally. Returns the page and the y below the faces.
 */
function addBoardPage(doc: PdfDocument, board: BoardSnapshot, images: {component: number; solder: number}): {page: PdfPage; y: number} {
  const page = doc.addPage();
  const top = pageHeader(page, board.name, board.subtitle);
  const maxW = page.width - MARGIN * 2;
  const layout = layoutFaces(board.width, board.height, maxW, page.height - top - MARGIN);
  const left = MARGIN + (maxW - layout.totalW) / 2;

  const faces = [[images.component, "Component side"], [images.solder, "Solder side"]] as const;
  faces.forEach(([image, caption], i) => {
    const x = layout.sideBySide ? left + i * (layout.w + FACE_GAP) : left;
    const y = layout.sideBySide ? top : top + i * (CAPTION + layout.h + FACE_GAP);
    page.text(caption, x, y + 11, 10, {style: "bold", color: INK});
    page.image(image, x, y + CAPTION, layout.w, layout.h, layout.rotate);
  });
  return {page, y: top + layout.totalH};
}

interface Column<T> {
  title: string;
  /** Width in points; 0 takes whatever the other columns leave. */
  width: number;
  cell: (row: T) => {text: string; style?: FontStyle}[];
}

const properties = (props: [string, string][]) => props.length
  ? props.map(([label, value]) => ({text: `${label}: ${value}`}))
  : [{text: "—"}];

const COMPONENT_COLUMNS: Column<ComponentRow>[] = [
  {title: "Ref", width: 48, cell: r => [{text: r.ref || "—", style: "bold"}]},
  {title: "Component", width: 130, cell: r => [{text: r.name}]},
  {title: "Properties", width: 170, cell: r => properties(r.properties)},
  {title: "Pin 1", width: 42, cell: r => [{text: r.location || "—"}]},
  {title: "Notes", width: 0, cell: r => [{text: r.notes}]},
];

/** BoM columns; the references are prefixed with their board only when the project has several. */
function bomColumns(multiBoard: boolean): Column<BomRow>[] {
  return [
    {title: "Qty", width: 34, cell: r => [{text: String(r.quantity), style: "bold"}]},
    {title: "Component", width: 140, cell: r => [{text: r.name}]},
    {title: "Properties", width: 170, cell: r => properties(r.properties)},
    {title: "References", width: 0, cell: r => r.refs.map(b => {
      const refs = b.refs.join(", ") || "—";
      return {text: multiBoard ? `${b.board}: ${refs}` : refs};
    })},
  ];
}

/**
 * A table, continued on fresh pages (header repeated) as needed. With `start`
 * it begins under a "Components"-style `heading` on that page when the
 * heading, column header and first row fit there, else on a new page.
 */
function addTable<T>(doc: PdfDocument, columns: Column<T>[], rows: T[], opts: {
  title: string; subtitle: string; empty: string; start?: {page: PdfPage; y: number; heading: string};
}) {
  const SIZE = 9;
  const LEAD = 11.5;
  const PAD = 5;
  const HEAD_H = LEAD + PAD * 2;
  const HEADING_H = 28;
  const tableW = A4.width - MARGIN * 2;
  const fixed = columns.reduce((s, c) => s + c.width, 0);
  const widths = columns.map(c => c.width || tableW - fixed);

  const layouts = rows.map(row => {
    const cells = columns.map((c, i) => c.cell(row).flatMap(part =>
      wrapText(part.text, widths[i] - PAD * 2, SIZE, part.style ?? "regular", measure)
        .map(text => ({text, style: part.style ?? "regular"}))));
    return {cells, h: Math.max(...cells.map(lines => lines.length)) * LEAD + PAD * 2};
  });

  let page!: PdfPage;
  let y = 0;
  const columnHeader = () => {
    page.rect(MARGIN, y, tableW, HEAD_H, {fill: HEADER_FILL});
    let x = MARGIN;
    columns.forEach((c, i) => {
      page.text(c.title, x + PAD, y + PAD + SIZE, SIZE, {style: "bold", color: [255, 255, 255]});
      x += widths[i];
    });
    y += HEAD_H;
  };
  const newPage = (title: string) => {
    page = doc.addPage();
    y = pageHeader(page, title, opts.subtitle);
    columnHeader();
  };

  const firstRowH = layouts[0]?.h ?? HEAD_H;
  const start = opts.start;
  if (start && start.y + HEADING_H + HEAD_H + firstRowH <= start.page.height - MARGIN) {
    page = start.page;
    y = start.y + HEADING_H;
    page.text(start.heading, MARGIN, y - 10, 11, {style: "bold", color: INK});
    columnHeader();
  } else {
    newPage(opts.title);
  }

  if (!rows.length) {
    page.text(opts.empty, MARGIN + PAD, y + PAD + SIZE, SIZE, {color: MUTED});
    return;
  }

  layouts.forEach(({cells, h}, r) => {
    if (y + h > page.height - MARGIN) newPage(`${opts.title} (cont.)`);
    if (r % 2) page.rect(MARGIN, y, tableW, h, {fill: ZEBRA});
    let x = MARGIN;
    cells.forEach((lines, i) => {
      lines.forEach((line, l) => page.text(line.text, x + PAD, y + PAD + SIZE + l * LEAD, SIZE, {style: line.style, color: INK}));
      x += widths[i];
    });
    y += h;
    page.line(MARGIN, y, MARGIN + tableW, y, RULE);
  });
}

/** Builds the PDF report of every board in the project and downloads it. */
export async function downloadProjectPdf(title: string, fileName = 'project.pdf') {
  const date = new Date().toLocaleString();
  const boards = mapBoards(name => snapshotBoard(name, date));

  const doc = new PdfDocument((t, s, st) => measure(t, s, st), title);
  for (const board of boards) {
    const images = {
      component: doc.addImage(await toPdfImage(board.component)),
      solder: doc.addImage(await toPdfImage(board.solder)),
    };
    const start = addBoardPage(doc, board, images);
    addTable(doc, COMPONENT_COLUMNS, board.rows, {
      title: `${board.name} — components`, subtitle: board.subtitle, empty: "No components on this board.",
      start: {...start, heading: "Components"},
    });
  }

  const bom = billOfMaterials(boards);
  const total = bom.reduce((s, r) => s + r.quantity, 0);
  const bomSubtitle = [date, plural(boards.length, "board"), plural(total, "component"), plural(bom.length, "line")].join("  ·  ");
  addTable(doc, bomColumns(boards.length > 1), bom, {
    title: "Bill of materials", subtitle: bomSubtitle, empty: "No components in this project.",
  });

  const url = URL.createObjectURL(new Blob([doc.toBytes() as Uint8Array<ArrayBuffer>], {type: 'application/pdf'}));
  const link = document.createElement('a');
  link.download = fileName;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
