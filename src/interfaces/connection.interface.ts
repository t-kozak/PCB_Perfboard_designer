/**
 * The logical layer (see docs/logical-connections.md §2). A connection is
 * truth; wires (`ILine`) are output produced from it on flipping the board.
 */

/** One leg of one placed component. The atom of the logical layer. */
export interface ITerminal {
  /** `Ic.id` of a *placed* component (crypto.randomUUID, stable since M0). */
  icId: string;
  /** 1-based pin number, as produced by Ic.getPinPositionOnIC(). */
  pin: number;
}

/** "These two legs are the same electrical node." */
export interface IConnection {
  id: string;
  a: ITerminal;
  b: ITerminal;
  /** Derived by the net layer; not user-owned. */
  netId?: string;
  /** Optional user annotation shown on the component side. */
  label?: string;
}

export const terminalKey = (t: ITerminal): string => `${t.icId}#${t.pin}`;

/** `a.icId === b.icId && a.pin === b.pin` — a pin cannot connect to itself. */
export const isSelfLoop = (a: ITerminal, b: ITerminal): boolean =>
  a.icId === b.icId && a.pin === b.pin;

/** Canonical order: lower `icId#pin` first, so `{a,b}` and `{b,a}` dedup as a string compare. */
function canonicalPair(a: ITerminal, b: ITerminal): [ITerminal, ITerminal] {
  return terminalKey(a) <= terminalKey(b) ? [a, b] : [b, a];
}

/** True when `x` already connects the same two terminals as `{a, b}`, in either order. */
export function sameConnection(x: IConnection, a: ITerminal, b: ITerminal): boolean {
  const [ca, cb] = canonicalPair(a, b);
  return terminalKey(x.a) === terminalKey(ca) && terminalKey(x.b) === terminalKey(cb);
}

/** Build a canonical connection between two terminals, or null for an illegal self-loop. */
export function makeConnection(a: ITerminal, b: ITerminal, label?: string): IConnection | null {
  if (isSelfLoop(a, b)) return null;
  const [ca, cb] = canonicalPair(a, b);
  return { id: crypto.randomUUID(), a: ca, b: cb, label };
}
