import { describe, it, expect } from "vitest";
import {
  deriveNets,
  netAtTerminal,
  components,
} from "./derive";
import type { IConnection, ITerminal } from "../interfaces/connection.interface";
import type { Ic } from "../features/ic";

/** A minimal stand-in for a placed `Ic` — derive.ts is pure and only reads id/pinDescription/pinDot/pinCount. */
function fakeIc(id: string, pinDescription: Record<number, string>, pads: Record<number, { x: number; y: number }>): Ic {
  return {
    id,
    pinDescription,
    pinCount: Object.keys(pads).length,
    pinDot: (pin: number) => pads[pin] ?? null,
  } as unknown as Ic;
}

let nextId = 1;
function conn(a: ITerminal, b: ITerminal): IConnection {
  return { id: `c${nextId++}`, a, b };
}

describe("derive: union-find over connections", () => {
  it("three connections sharing a terminal form one net", () => {
    const ics = [fakeIc("u1", {}, { 1: { x: 0, y: 0 }, 2: { x: 50, y: 0 }, 3: { x: 100, y: 0 } })];
    const connections = [
      conn({ icId: "u1", pin: 1 }, { icId: "u1", pin: 2 }),
      conn({ icId: "u1", pin: 2 }, { icId: "u1", pin: 3 }),
    ];
    const { nets, connectionNet } = deriveNets(connections, ics);
    expect(nets).toHaveLength(1);
    expect(connectionNet.get(connections[0])).toBe(nets[0].id);
    expect(connectionNet.get(connections[1])).toBe(nets[0].id);
  });

  it("keeps disjoint components as separate nets", () => {
    const connections = [
      conn({ icId: "u1", pin: 1 }, { icId: "u1", pin: 2 }),
      conn({ icId: "u1", pin: 3 }, { icId: "u1", pin: 4 }),
    ];
    expect(components(connections)).toHaveLength(2);
  });
});

describe("derive: net naming", () => {
  it("names a net after a recognised power pin label", () => {
    const ics = [fakeIc("u1", { 1: "GND" }, { 1: { x: 0, y: 0 }, 2: { x: 50, y: 0 } })];
    const connections = [conn({ icId: "u1", pin: 1 }, { icId: "u1", pin: 2 })];
    const { nets } = deriveNets(connections, ics);
    expect(nets[0].name).toBe("GND");
    expect(nets[0].color).toBe("#cbd5e1");
  });

  it("falls back to an anonymous N$ name with no label on the net", () => {
    const ics = [fakeIc("u1", {}, { 1: { x: 0, y: 0 }, 2: { x: 50, y: 0 } })];
    const connections = [conn({ icId: "u1", pin: 1 }, { icId: "u1", pin: 2 })];
    const { nets } = deriveNets(connections, ics);
    expect(nets[0].name).toMatch(/^N\$\d+$/);
  });

  it("carries a prior net's id/name forward across a rebuild", () => {
    const ics = [fakeIc("u1", {}, { 1: { x: 0, y: 0 }, 2: { x: 50, y: 0 } })];
    const connections = [conn({ icId: "u1", pin: 1 }, { icId: "u1", pin: 2 })];
    const first = deriveNets(connections, ics);
    first.nets[0].name = "MY_NET";
    for (const c of connections) c.netId = first.connectionNet.get(c);

    const second = deriveNets(connections, ics, first.nets);
    expect(second.nets).toHaveLength(1);
    expect(second.nets[0].id).toBe(first.nets[0].id);
    expect(second.nets[0].name).toBe("MY_NET");
  });
});

describe("derive: netAtTerminal", () => {
  it("floods to every terminal reachable through connections", () => {
    const connections = [
      conn({ icId: "u1", pin: 1 }, { icId: "u1", pin: 2 }),
      conn({ icId: "u1", pin: 2 }, { icId: "u1", pin: 3 }),
      conn({ icId: "u9", pin: 1 }, { icId: "u9", pin: 2 }), // unrelated net
    ];
    const { terminals } = netAtTerminal({ icId: "u1", pin: 1 }, connections);
    expect(terminals).toEqual(new Set(["u1#1", "u1#2", "u1#3"]));
  });
});
