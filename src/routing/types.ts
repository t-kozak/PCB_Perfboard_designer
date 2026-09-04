/**
 * Routing — the pure `logical → physical` layer of docs/autorouting.md.
 *
 * NOTHING in `src/routing/` may import the DOM, `State`, or `Canvas`, ever
 * (only interface types and other routing modules). That isolation is the whole
 * maintainability argument: the algorithm can be rewritten and nothing else in
 * the app notices, and the directory stays unit-testable in a node environment.
 */
import type { IDot } from "../interfaces/dot.interface";
import type { ILine } from "../interfaces/line.interface";

/** One net handed to the router: the terminals to join, plus its identity. */
export interface RouteNet {
  id: string;
  name: string;
  /** Every pad the net must connect. Order is not significant. */
  pads: IDot[];
  /** Hand-locked — the router leaves it completely alone. */
  locked?: boolean;
  /** Colour to stamp on emitted wires (falls back to `opts.wireColor`). */
  color?: string;
}

export interface RouteOpts {
  /** Extra cost charged once per direction change; suppresses staircase paths. */
  turnPenalty?: number;
  /** Cost added when a run crosses an existing foreign wire. */
  crossingPenalty?: number;
  /** Cost added per foreign pad a run passes over. */
  foreignPadPenalty?: number;
  /** Default colour / width for emitted wires. */
  wireColor?: string;
  wireWidth?: number;
}

export interface RouteResult {
  /** Fresh wires for every non-locked net, tagged `generated` + `netId`. */
  lines: ILine[];
  /** Names of nets that could not be fully connected. Never silently dropped. */
  failed: string[];
}

export const DEFAULT_OPTS: Required<Omit<RouteOpts, "wireColor" | "wireWidth">> & {
  wireColor: string;
  wireWidth: number;
} = {
  turnPenalty: 60,
  crossingPenalty: 25,
  foreignPadPenalty: 15,
  wireColor: "#3b82f6",
  wireWidth: 4,
};

export const key = (d: { x: number; y: number }): string => `${d.x},${d.y}`;

export const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** A generated wire between two pads, carrying its net id. */
export function wire(a: IDot, b: IDot, netId: string, color: string, width: number): ILine {
  return { start: a, end: b, color, width, netId, generated: true };
}
