import { describe, expect, it } from "vitest";

import { isSpecial, species } from "../src/engine/dex.js";
import { PLACES, PLACES_PER_REGION, REGIONS, REGION_COUNT, ROUTE_COUNT, bossSpecies, killsToUnlock, meetsIn, place, poolOf } from "../src/engine/regions.js";
import { BOSS_TIME, EASE_PLACES, TUNING, bossHp, killCoins, routeHp, speciesHpFactor, wildLevel } from "../src/engine/rules.js";

describe("the world", () => {
  it("has five regions of twelve places, then a Tower", () => {
    expect(REGIONS).toHaveLength(REGION_COUNT);
    expect(PLACES).toHaveLength(PLACES_PER_REGION);
    expect(ROUTE_COUNT).toBe(60);
    for (let i = 0; i < ROUTE_COUNT; i++) {
      const p = place(i);
      expect(p.region).toBe(Math.floor(i / 12));
      expect(p.slot).toBe(i % 12);
      expect(p.tower).toBe(false);
    }
    const tower = place(ROUTE_COUNT + 4);
    expect([tower.tower, tower.region, tower.slot, tower.name]).toEqual([true, 5, 5, "Tower"]);
  });

  it("gives each region its own generation, starters, legends and two bosses that exist", () => {
    REGIONS.forEach((r, i) => {
      expect(r.id).toBe(i);
      expect(r.gen).toBe(i + 1);
      for (const st of r.starters) expect(species(st).gen).toBe(r.gen);
      for (const l of r.legends) {
        expect(isSpecial(species(l)), species(l).name).toBe(true);
        expect(species(l).gen).toBe(r.gen);
      }
      expect(species(r.gym).gen).toBe(r.gen);
      expect(species(r.champion).stage).toBeGreaterThanOrEqual(2);
      expect(bossSpecies(place(i * 12 + 5))).toBe(r.gym);
      expect(bossSpecies(place(i * 12 + 11))).toBe(r.champion);
    });
  });

  it("picks the Tower's bosses the same way every time", () => {
    for (let f = 10; f < 200; f += 10) {
      const p = place(ROUTE_COUNT + f - 1);
      expect(p.kind).toBe("gym");
      expect(bossSpecies(p)).toBe(bossSpecies(place(ROUTE_COUNT + f - 1)));
      expect(bossSpecies(p)).toBeGreaterThanOrEqual(1);
      expect(bossSpecies(p)).toBeLessThanOrEqual(649);
    }
  });

  it("asks for kills at ordinary places and a single win over a boss", () => {
    expect(killsToUnlock(place(0))).toBe(TUNING.killsToOpen);
    expect(killsToUnlock(place(5))).toBe(1);
    expect(killsToUnlock(place(11))).toBe(1);
    expect(killsToUnlock(place(ROUTE_COUNT))).toBe(TUNING.killsToOpen);
  });
});

describe("who lives where", () => {
  it("fills every place with creatures of its region or older, in its stage limit", () => {
    for (let i = 0; i < ROUTE_COUNT; i++) {
      const p = place(i);
      if (p.kind !== "wild") continue;
      const pool = poolOf(p);
      expect(pool.length, `place ${i}`).toBeGreaterThan(8);
      const stageLimit = p.slot < 3 ? 1 : p.slot < 7 ? 2 : 3;
      for (const e of pool) {
        const s = species(e.id);
        expect(s.gen, `${s.name} at ${i}`).toBeLessThanOrEqual(REGIONS[p.region]!.gen);
        expect(s.stage).toBeLessThanOrEqual(stageLimit);
        expect(isSpecial(s)).toBe(false);
        expect(e.rate).toBe(s.catchRate);
        if (s.baby) expect(p.slot).toBeLessThan(4);
      }
    }
  });

  it("favours the creatures of the place's types, and the region's own", () => {
    const cave = place(2); // Kanto cave: rock, ground, fighting
    const pool = poolOf(cave);
    const geodude = pool.find((e) => e.id === 74)!;
    const rattata = pool.find((e) => e.id === 19)!;
    expect(geodude.boost).toBe(4);
    expect(rattata.boost).toBe(1);
    const johtoCave = poolOf(place(12 + 2));
    expect(johtoCave.find((e) => e.id === 74)!.boost).toBe(1); // a Kanto rock creature in Johto's cave: themed but old
    expect(johtoCave.find((e) => e.id === 19)!.boost).toBe(0.25);
    expect(johtoCave.find((e) => e.id === 207) ?? johtoCave.find((e) => species(e.id).gen === 2)).toBeDefined();
  });

  it("lets the whole roster into the Tower, legendary ones rarely", () => {
    const pool = poolOf(place(ROUTE_COUNT + 3));
    expect(pool.length).toBeGreaterThan(550);
    const legend = pool.find((e) => e.id === 150)!;
    expect(legend.rate).toBe(3);
    expect(poolOf(place(ROUTE_COUNT + 80))).toBe(pool);
    expect(meetsIn(place(0)).every((s) => s.gen === 1)).toBe(true);
  });
});

describe("the numbers of the wild", () => {
  it("grows in health at every step, and bosses are walls", () => {
    for (let i = 1; i < 100; i++) expect(routeHp(i)).toBeGreaterThan(routeHp(i - 1));
    expect(routeHp(30) / routeHp(29)).toBeCloseTo(TUNING.hpGrowth);
    // the first places are eased in, to a tenth or so of what the curve alone says
    expect(routeHp(0)).toBeLessThan(TUNING.hpBase * 0.2);
    expect(routeHp(EASE_PLACES)).toBeCloseTo(TUNING.hpBase * TUNING.hpGrowth ** EASE_PLACES);
    expect(bossHp("champion")).toBeGreaterThan(bossHp("gym"));
    expect(bossHp("gym")).toBeGreaterThan(1);
    expect(BOSS_TIME.champion).toBeGreaterThan(BOSS_TIME.gym);
  });

  it("makes sturdy species sturdier, within a narrow range", () => {
    expect(speciesHpFactor(species(129))).toBeLessThan(speciesHpFactor(species(150)));
    for (const s of [129, 150, 25, 3]) {
      expect(speciesHpFactor(species(s))).toBeGreaterThan(0.79);
      expect(speciesHpFactor(species(s))).toBeLessThan(1.6);
    }
  });

  it("pays a share of the health in coins, and labels levels up to 100", () => {
    expect(killCoins(100)).toBe(Math.ceil(100 * TUNING.coinShare));
    expect(wildLevel(0)).toBeGreaterThanOrEqual(2);
    expect(wildLevel(59)).toBeLessThanOrEqual(100);
    expect(wildLevel(10_000)).toBe(100);
    expect(wildLevel(30)).toBeGreaterThan(wildLevel(3));
  });
});
