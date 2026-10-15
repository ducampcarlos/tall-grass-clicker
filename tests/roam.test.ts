import { describe, expect, it } from "vitest";

import { type GameEvent, claimRoamer, coinMult } from "../src/engine/game.js";
import { killCoins, routeHp } from "../src/engine/rules.js";
import { fresh, own } from "./helpers.js";

const claim = (s: ReturnType<typeof fresh>, shiny = false) => {
  const events: GameEvent[] = [];
  const kind = claimRoamer(s, 25, shiny, events);
  const roam = events.find((e) => e.t === "roam");
  return { kind, roam: roam as Extract<GameEvent, { t: "roam" }>, events };
};

describe("the creature passing through", () => {
  it("is deterministic: the same game gives the same gift", () => {
    const a = claim(fresh(7));
    const b = claim(fresh(7));
    expect(a.roam).toEqual(b.roam);
  });

  it("always reports exactly one gift, marks the creature as seen, and moves the random numbers on", () => {
    const s = fresh(8);
    const before = s.rng;
    const { roam, events } = claim(s);
    expect(events.filter((e) => e.t === "roam")).toHaveLength(1);
    expect(roam.sp).toBe(25);
    expect(s.dex[25]?.seen).toBe(true);
    expect(s.rng).not.toBe(before);
  });

  it("gives what it says: coins are added to every total, balls and eggs to the bag, candy to the party", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 1500 && seen.size < 5; seed++) {
      const s = fresh(seed);
      own(s, 4, 10);
      s.party = [4];
      s.coins = 0;
      s.balls = [0, 0, 0, 0];
      s.bag = [0, 0, 0, 0];
      s.items = {};
      const before = { runCoins: s.runCoins, lifetime: s.lifetimeCoins, candy: s.dex[4]!.candy };
      const { roam } = claim(s);
      seen.add(roam.kind);
      if (roam.kind === "coins") {
        expect(s.coins).toBe(roam.amount);
        expect(s.runCoins - before.runCoins).toBe(roam.amount);
        expect(s.lifetimeCoins - before.lifetime).toBe(roam.amount);
      } else if (roam.kind === "balls") {
        expect(s.balls.reduce((a, b) => a + b, 0)).toBe(roam.amount);
      } else if (roam.kind === "egg") {
        expect(s.bag.reduce((a, b) => a + b, 0)).toBe(1);
        expect(roam.tier).toBeDefined();
      } else if (roam.kind === "item") {
        expect(Object.values(s.items).reduce((a, b) => a + b, 0)).toBe(1);
        expect(roam.buff).toBeDefined();
        expect(s.items[`${roam.buff}${roam.tier}`]).toBe(1);
      } else {
        expect(s.dex[4]!.candy - before.candy).toBe(roam.amount);
      }
    }
    expect([...seen].sort()).toEqual(["balls", "candy", "coins", "egg", "item"]);
  });

  it("coins come to about 25 kills' worth, and a shiny one pays four times as much", () => {
    for (let seed = 1; seed < 100; seed++) {
      const plain = claim(fresh(seed));
      if (plain.roam.kind !== "coins") continue;
      const s = fresh(seed);
      const raw = killCoins(routeHp(s.place)) * coinMult(s) * 25;
      expect(plain.roam.amount).toBe(Math.ceil(raw));
      const shiny = claim(fresh(seed), true);
      expect(shiny.roam.kind).toBe("coins");
      expect(shiny.roam.amount).toBe(Math.ceil(raw * 4));
      return;
    }
    throw new Error("no seed gave coins");
  });
});
