import { describe, expect, it } from "vitest";

import { BUFFS, BUFF_IDS, buffMult, buffValue, itemKey, parseItemKey, tierDef } from "../src/engine/items.js";
import { boosterPrice, buyBooster, clickDamage, coinMult, craft, dps, giveItem, itemCount, offline, shinyOdds, tick, useItem, xpMult, catchMult } from "../src/engine/game.js";
import { parseState, serializeState } from "../src/engine/save.js";
import { SHINY_ODDS } from "../src/engine/rules.js";
import { fresh, own } from "./helpers.js";

describe("the boosters", () => {
  it("are seven kinds in three tiers, each stronger and longer than the last", () => {
    expect(BUFFS).toHaveLength(7);
    for (const b of BUFFS) {
      const [a, m, z] = b.tiers;
      expect(a.value).toBeLessThan(m.value);
      expect(m.value).toBeLessThan(z.value);
      expect(a.seconds).toBeLessThan(m.seconds);
      expect(m.seconds).toBeLessThan(z.seconds);
      expect(new Set(b.tiers.map((t) => t.name)).size).toBe(3);
    }
    expect(new Set(BUFFS.flatMap((b) => b.tiers.map((t) => t.name))).size).toBe(21);
  });

  it("are named in the bag by kind and tier, and only valid names are read back", () => {
    for (const id of BUFF_IDS) for (const tier of [1, 2, 3] as const) expect(parseItemKey(itemKey(id, tier))).toEqual({ id, tier });
    expect(parseItemKey("shiny4")).toBeNull();
    expect(parseItemKey("nothing1")).toBeNull();
    expect(parseItemKey("")).toBeNull();
  });

  it("do nothing until used, and then multiply what they say", () => {
    const s = fresh(1);
    own(s, 25, 20);
    const base = { shiny: shinyOdds(s), coins: coinMult(s), xp: xpMult(s), catch: catchMult(s), dps: dps(s), click: clickDamage(s) };
    expect(base.shiny).toBe(SHINY_ODDS);
    giveItem(s, "shiny", 2);
    giveItem(s, "coins", 1);
    giveItem(s, "xp", 3);
    giveItem(s, "catch", 1);
    giveItem(s, "power", 2);
    expect(shinyOdds(s)).toBe(base.shiny);
    for (const [id, tier] of [["shiny", 2], ["coins", 1], ["xp", 3], ["catch", 1], ["power", 2]] as const) expect(useItem(s, id, tier).ok).toBe(true);
    expect(shinyOdds(s)).toBeCloseTo(base.shiny * 3, 12);
    expect(coinMult(s)).toBeCloseTo(base.coins * 1.5, 9);
    expect(xpMult(s)).toBeCloseTo(base.xp * 3, 9);
    expect(catchMult(s)).toBeCloseTo(base.catch * 1.3, 9);
    expect(dps(s)).toBeCloseTo(base.dps * 2, 6);
    expect(clickDamage(s)).toBeCloseTo(base.click * 2, 6);
  });

  it("run only while you play, and end with a message", () => {
    const s = fresh(2);
    giveItem(s, "coins", 1);
    useItem(s, "coins", 1);
    const seconds = tierDef("coins", 1).seconds;
    expect(s.buffs).toEqual([{ id: "coins", tier: 1, left: seconds }]);
    tick(s, 10);
    expect(s.buffs[0]!.left).toBeCloseTo(seconds - 10, 9);
    let ended = false;
    for (let i = 0; i < seconds * 4 + 8 && !ended; i++) ended = tick(s, 0.25).some((e) => e.t === "buffEnded" && e.id === "coins" && e.tier === 1);
    expect(ended).toBe(true);
    expect(s.buffs).toEqual([]);
    expect(buffMult(s.buffs, "coins")).toBe(1);
  });

  it("neither work nor run out while you are away", () => {
    const s = fresh(3);
    giveItem(s, "coins", 3);
    useItem(s, "coins", 3);
    const left = s.buffs[0]!.left;
    offline(s, 3600);
    expect(s.buffs).toEqual([{ id: "coins", tier: 3, left }]);
  });

  it("add their time at the same tier, are replaced by a higher one, and are refused when lower", () => {
    const s = fresh(4);
    giveItem(s, "xp", 1, 2);
    giveItem(s, "xp", 2, 2);
    giveItem(s, "xp", 3);
    useItem(s, "xp", 2);
    expect(useItem(s, "xp", 1)).toMatchObject({ ok: false });
    expect(itemCount(s, "xp", 1)).toBe(2);
    useItem(s, "xp", 2);
    expect(itemCount(s, "xp", 2)).toBe(0);
    expect(s.items).toEqual({ xp1: 2, xp3: 1 });
    expect(s.buffs[0]!.tier).toBe(2);
    expect(s.buffs[0]!.left).toBeGreaterThan(tierDef("xp", 2).seconds);
    expect(s.buffs[0]!.left).toBeLessThanOrEqual(tierDef("xp", 2).seconds * 4);
  });

  it("a higher tier replaces the working one", () => {
    const s = fresh(5);
    giveItem(s, "warm", 1);
    giveItem(s, "warm", 3);
    useItem(s, "warm", 1);
    useItem(s, "warm", 3);
    expect(s.buffs).toEqual([{ id: "warm", tier: 3, left: tierDef("warm", 3).seconds }]);
    expect(buffValue(s.buffs, "warm")).toBe(5);
  });

  it("cannot be used when you have none", () => {
    const s = fresh(6);
    expect(useItem(s, "shiny", 1).ok).toBe(false);
    expect(s.buffs).toEqual([]);
  });

  it("three of a tier combine into one of the next, and the last tier does not combine", () => {
    const s = fresh(7);
    giveItem(s, "lure", 1, 7);
    expect(craft(s, "lure", 1).ok).toBe(true);
    expect(craft(s, "lure", 1).ok).toBe(true);
    expect(craft(s, "lure", 1).ok).toBe(false);
    expect(itemCount(s, "lure", 1)).toBe(1);
    expect(itemCount(s, "lure", 2)).toBe(2);
    giveItem(s, "lure", 3, 5);
    expect(craft(s, "lure", 3).ok).toBe(false);
    expect(itemCount(s, "lure", 3)).toBe(5);
  });

  it("the shop sells the first tier for coins", () => {
    const s = fresh(8);
    s.coins = 0;
    expect(buyBooster(s, "shiny").ok).toBe(false);
    s.coins = boosterPrice(s, "shiny") * 2;
    expect(buyBooster(s, "shiny").ok).toBe(true);
    expect(itemCount(s, "shiny", 1)).toBe(1);
    expect(s.coins).toBe(boosterPrice(s, "shiny"));
  });

  it("are kept in a save, and a save from before them loads with none", () => {
    const s = fresh(9);
    giveItem(s, "power", 2, 4);
    giveItem(s, "catch", 1);
    useItem(s, "catch", 1);
    s.cooldowns = { throw: 33 };
    const back = parseState(serializeState(s))!;
    expect(back).toEqual(s);
    const old = JSON.parse(serializeState(s));
    delete old.items;
    delete old.buffs;
    delete old.cooldowns;
    delete old.settings.helpers;
    delete old.stats.roamers;
    delete old.stats.games;
    const loaded = parseState(JSON.stringify(old))!;
    expect(loaded).not.toBeNull();
    expect(loaded.items).toEqual({});
    expect(loaded.buffs).toEqual([]);
    expect(loaded.stats.games).toBe(0);
  });

  it("refuses impossible boosters in a save", () => {
    const s = fresh(10);
    const raw = JSON.parse(serializeState(s));
    const bad = (change: (r: Record<string, any>) => void) => {
      const c = JSON.parse(JSON.stringify(raw));
      change(c);
      return parseState(JSON.stringify(c)) === null;
    };
    expect(bad((r) => (r.items = { shiny9: 1 }))).toBe(true);
    expect(bad((r) => (r.items = { shiny1: -1 }))).toBe(true);
    expect(bad((r) => (r.items = { shiny1: 1.5 }))).toBe(true);
    expect(bad((r) => (r.buffs = [{ id: "shiny", tier: 4, left: 5 }]))).toBe(true);
    expect(bad((r) => (r.buffs = [{ id: "shiny", tier: 1, left: 5 }, { id: "shiny", tier: 2, left: 5 }]))).toBe(true);
    expect(bad((r) => (r.buffs = [{ id: "nothing", tier: 1, left: 5 }]))).toBe(true);
    expect(bad((r) => (r.cooldowns = { chess: 5 }))).toBe(true);
    expect(bad((r) => (r.settings.helpers = { robot: true }))).toBe(true);
  });
});
