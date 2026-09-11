/**
 * Routing — the pure `logical → physical` layer of docs/autorouting.md.
 *
 * NOTHING in `src/routing/` may import the DOM, `State`, or `Canvas`, ever
 * (only interface types and other routing modules). That isolation is the whole
 * maintainability argument: the algorithm can be rewritten and nothing else in
 * the app notices, and the directory stays unit-testable in a node environment.
 *
 * Contract (docs/logical-connections.md §11): one `RouteEdge` per connection in,
 * one wire out (a straight segment in "direct" mode, an orthogonal polyline of
 * several `ILine` segments in "orthogonal" mode). The router never learns that
 * nets or connections exist beyond the `netId` it uses to keep same-net edges
 * from treating each other's pads as foreign.
 */
import type { IDot } from "../interfaces/dot.interface";
import type { ILine } from "../interfaces/line.interface";

/** One connection handed to the router: the two pads to join, plus its identity. */
export interface RouteEdge {
  /** `IConnection.id` — stamped onto every emitted segment. */
  connId: string;
  /** The net this connection belongs to. Same-net edges may share pads. */
  netId: string;
  a: IDot;
  b: IDot;
  /** Colour / width to stamp on emitted wires. */
  color: string;
  width: number;
}

/**
 * Board facts beyond the pad lattice that constrain where wire may run.
 * Geometry, not cost — everything here is a hard rule.
 */
export interface RouteBoard {
  /**
   * Holes with a component pin soldered into them. A wire may *end* on one of
   * its own net's solder joints, but never run across one.
   */
  soldered?: IDot[];
  /** Wire already on the board that a route must neither overlap nor ignore. */
  obstacles?: ILine[];
}

export interface RouteOpts {
  /** Extra cost charged once per direction change; suppresses staircase paths. */
  turnPenalty?: number;
  /** Cost added when a run crosses an existing foreign wire. */
  crossingPenalty?: number;
  /** Cost added per foreign pad a run passes over. */
  foreignPadPenalty?: number;
}

export interface RouteResult {
  /** Fresh wires, each tagged with its `connId` + `netId`. */
  lines: ILine[];
  /** `connId`s of connections that could not be routed. Never silently dropped. */
  failed: string[];
}

export const DEFAULT_OPTS: Required<RouteOpts> = {
  turnPenalty: 60,
  crossingPenalty: 25,
  foreignPadPenalty: 15,
};

export const key = (d: { x: number; y: number }): string => `${d.x},${d.y}`;

export const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** A wire segment between two pads, carrying its connection + net id. */
export function wire(a: IDot, b: IDot, connId: string, netId: string, color: string, width: number): ILine {
  return { start: a, end: b, color, width, netId, connId };
}
