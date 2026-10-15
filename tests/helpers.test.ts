import { describe, expect, it } from "vitest";

import { HELPERS, HELPER_IDS, helperOn, helperProgress, helperUnlocked, setHelper, tickHelpers } from "../src/engine/helpers.js";
import { eggSlots, giveItem, partySlots, tick, upgradeLevel, useItem, type GameEvent } from "../src/engine/game.js";
import { tierDef } from "../src/engine/items.js";
import { parseState, serializeState } from "../src/engine/save.js";
import { fresh, own } from "./helpers.js";

/** Run the helpers for a while, as the game does after every tick. */
const run = (s: ReturnType<typeof fresh>, seconds: number, events: GameEvent[] = []) => {
  const out: GameEvent[] = [];
  for (let t = 0; t < seconds; t += 0.25) out.push(...tickHelpers(s, 0.25, events));
  return out;
};

describe("the helpers", () => {
  it("each have something to earn, a name and a goal that says what to do", () => {
    expect(HELPERS.map((h) => h.id)).toEqual([...HELPER_IDS]);
    for (const h of HELPERS) {
      expect(h.goal).toContain("{n}");
      expect(h.need).toBeGreaterThan(0);
      expect(h.text.length).toBeGreaterThan(10);
    }
  });

  it("are closed at the start, open when their goal is met, and start on", () => {
    const s = fresh(1);
    expect(HELPER_IDS.filter((id) => helperUnlocked(s, id))).toEqual([]);
    expect(helperProgress(s, "coach")).toEqual({ have: 1, need: 100 }); // the first partner
    s.stats.caught = 120;
    const events = run(s, 2);
    expect(events).toEqual([{ t: "helperUnlocked", id: "coach" }]);
    expect(helperUnlocked(s, "coach")).toBe(true);
    expect(helperOn(s, "coach")).toBe(true);
    expect(helperProgress(s, "coach")).toEqual({ have: 100, need: 100 });
    // and says so once
    expect(run(s, 5)).toEqual([]);
  });

  it("stay off when switched off, and cannot be switched while closed", () => {
    const s = fresh(2);
    expect(setHelper(s, "hatchery", true)).toBe(false);
    s.stats.hatched = 10;
    run(s, 2);
    expect(setHelper(s, "hatchery", false)).toBe(true);
    s.bag = [2, 0, 0, 0];
    run(s, 10);
    expect(s.eggs).toHaveLength(0);
    expect(run(s, 5)).toEqual([]); // not unlocked again
  });

  it("the hatchery fills empty incubators with the best eggs first", () => {
    const s = fresh(3);
    s.stats.hatched = 10;
    s.upgrades.incubator = 3;
    s.bag = [2, 1, 1, 0];
    run(s, 3);
    expect(s.eggs.map((e) => e.tier)).toEqual([2, 1, 0, 0]);
    expect(s.eggs.length).toBe(eggSlots(s));
    expect(s.bag).toEqual([0, 0, 0, 0]);
  });

  it("the ball stocker keeps the bag stocked but never spends more than a quarter of the coins", () => {
    const s = fresh(4);
    s.stats.kills = 1000;
    s.balls = [0, 0, 0, 0];
    s.coins = 1e9;
    run(s, 8);
    expect(s.balls[0]).toBe(30);
    expect(s.balls[1]).toBe(10);
    const poor = fresh(5);
    poor.stats.kills = 1000;
    poor.balls = [0, 0, 0, 0];
    poor.coins = 100;
    const before = poor.coins;
    run(poor, 5); // one round of its chores
    expect(before - poor.coins).toBeGreaterThan(0);
    expect(before - poor.coins).toBeLessThanOrEqual(25);
  });

  it("the shopkeeper buys the cheapest upgrade while it costs less than half the coins", () => {
    const s = fresh(6);
    s.stats.kills = 3000;
    s.coins = 1e6;
    run(s, 8);
    const levels = Object.values(s.upgrades).reduce((a, b) => a + b, 0);
    expect(levels).toBeGreaterThan(5);
    expect(s.coins).toBeGreaterThan(0);
    expect(s.coins).toBeGreaterThan(1e6 * 0.05); // it stops before it empties the purse
    expect(upgradeLevel(s, "click")).toBeGreaterThan(0);
    const broke = fresh(7);
    broke.stats.kills = 3000;
    broke.coins = 1;
    run(broke, 6);
    expect(broke.upgrades).toEqual({});
  });

  it("the coach puts the strongest creatures in the party", () => {
    const s = fresh(8);
    s.stats.caught = 100;
    s.upgrades.slots = 2;
    own(s, 150, 80);
    own(s, 6, 80);
    own(s, 9, 80);
    own(s, 10, 1);
    run(s, 12);
    expect(s.party).toHaveLength(partySlots(s));
    expect(s.party).not.toContain(10);
    expect(s.party.every((id) => s.dex[id]?.caught)).toBe(true);
    expect(new Set(s.party).size).toBe(s.party.length);
  });

  it("the candy sorter spends candy on the party, ten at a time", () => {
    const s = fresh(9);
    s.stats.caught = 150;
    s.dex[4]!.candy = 37;
    const level = s.dex[4]!.level;
    run(s, 6);
    expect(s.dex[4]!.candy).toBe(7);
    expect(s.dex[4]!.level).toBeGreaterThan(level);
  });

  it("the booster belt uses another of the same kind when one runs out", () => {
    const s = fresh(10);
    s.stats.games = 8;
    run(s, 2);
    giveItem(s, "coins", 1, 2);
    useItem(s, "coins", 1);
    const events: GameEvent[] = [];
    for (let i = 0; i < 4 * (tierDef("coins", 1).seconds + 5) && !events.some((e) => e.t === "buffEnded"); i++) events.push(...tick(s, 0.25));
    tickHelpers(s, 0.25, events);
    expect(s.buffs).toHaveLength(1);
    expect(s.buffs[0]!.tier).toBe(1);
    expect(s.items.coins1).toBeUndefined();
  });

  it("are kept in a save", () => {
    const s = fresh(11);
    s.stats.caught = 200;
    s.stats.hatched = 12;
    run(s, 3);
    setHelper(s, "sorter", false);
    const back = parseState(serializeState(s))!;
    expect(back.settings.helpers).toEqual(s.settings.helpers);
    expect(back.settings.helpers.sorter).toBe(false);
  });
});
