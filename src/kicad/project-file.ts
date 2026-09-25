/**
 * The multi-board project file (`.perfboard`). Pure — no DOM.
 *
 * One S-expression wrapping each board's own KiCad netlist (netlist.ts)
 * verbatim, so a board can be cut out of it as a `.net` again:
 *
 *   (perfboard_project (version "1") (active "0")
 *     (board (name "Main")
 *       (export (version "E") …))
 *     (board (name "Power")
 *       (export (version "E") …)))
 *
 * `active` is the index of the board that was open when it was saved.
 */
import {atoms, child, children, head, parseSExpr, SExpr, text, writeSExpr} from "./sexpr";

const HEAD = "perfboard_project";
const VERSION = "1";

export interface ProjectBoard {
  name: string;
  /** The board as KiCad netlist text. */
  netlist: string;
}

export interface ProjectFile {
  boards: ProjectBoard[];
  /** Index into `boards` of the board to open. */
  active: number;
}

/** Whether `text` is a project file (as opposed to a single-board netlist or legacy JSON save). */
export function isProjectFile(text: string): boolean {
  return new RegExp(`^\\s*\\(\\s*${HEAD}[\\s)]`).test(text);
}

export function writeProjectFile(p: ProjectFile): string {
  const root: SExpr[] = [
    HEAD,
    ["version", VERSION],
    ["active", String(p.active)],
    ...p.boards.map((b): SExpr[] => ["board", ["name", b.name], parseSExpr(b.netlist)]),
  ];
  return writeSExpr(root) + "\n";
}

/** Throws on anything that isn't a readable project file, before any board is used. */
export function parseProjectFile(source: string): ProjectFile {
  const root = parseSExpr(source);
  if (head(root) !== HEAD) throw new Error(`Not a project file — expected it to start with (${HEAD} …).`);
  const version = atoms(child(root, "version"))[0];
  if (version && Number(version) > Number(VERSION)) {
    throw new Error(`This project file is version ${version}; this app reads up to version ${VERSION}. Update the app.`);
  }

  const boards = children(root, "board").map((b, i): ProjectBoard => {
    const netlist = child(b, "export");
    if (!netlist) throw new Error(`Board ${i + 1} of the project has no netlist.`);
    return {name: text(b, "name") || `Board ${i + 1}`, netlist: writeSExpr(netlist) + "\n"};
  });
  if (!boards.length) throw new Error("The project file has no boards.");

  const active = Number(text(root, "active") ?? 0);
  return {boards, active: Number.isInteger(active) && active >= 0 && active < boards.length ? active : 0};
}
