import { describe, expect, it } from "vitest";

import { buyUpgrade, upgradeLevel, upgradePlan, upgradePrice } from "../src/engine/game.js";
import { UPGRADES, upgradeCost } from "../src/engine/rules.js";
import { fresh } from "./helpers.js";

describe("buying levels of an upgrade", () => {
  it("one at a time by default, as before", () => {
    const s = fresh(1);
    s.coins = 1e6;
    const price = upgradePrice(s, "click")!;
    expect(buyUpgrade(s, "click").ok).toBe(true);
    expect(upgradeLevel(s, "click")).toBe(1);
    expect(s.coins).toBe(1e6 - price);
  });

  it("a number of levels costs exactly the sum of their prices, all or nothing", () => {
    const s = fresh(2);
    s.coins = 1e12;
    const def = UPGRADES.find((u) => u.id === "click")!;
    let expected = 0;
    for (let level = 0; level < 10; level++) expected += upgradeCost(def, level);
    expect(upgradePlan(s, "click", 10)).toEqual({ n: 10, cost: expected });
    expect(buyUpgrade(s, "click", 10).ok).toBe(true);
    expect(upgradeLevel(s, "click")).toBe(10);
    expect(s.coins).toBe(1e12 - expected);
    s.coins = expected / 100; // not enough for ten more
    const before = { ...s.upgrades };
    expect(buyUpgrade(s, "click", 10).ok).toBe(false);
    expect(s.upgrades).toEqual(before);
  });

  it("max buys as many as the coins allow, and never more", () => {
    const s = fresh(3);
    s.coins = 50_000;
    const plan = upgradePlan(s, "crit", "max");
    expect(plan.n).toBeGreaterThan(1);
    expect(plan.cost).toBeLessThanOrEqual(50_000);
    const after = upgradePlan({ ...s, upgrades: { ...s.upgrades, crit: plan.n } }, "crit", 1);
    expect(plan.cost + after.cost).toBeGreaterThan(50_000); // one more would not have fit
    expect(buyUpgrade(s, "crit", "max").ok).toBe(true);
    expect(upgradeLevel(s, "crit")).toBe(plan.n);
    expect(s.coins).toBe(50_000 - plan.cost);
  });

  it("max with no coins for even one level buys nothing and shows the price of the next", () => {
    const s = fresh(4);
    s.coins = 0;
    const plan = upgradePlan(s, "click", "max");
    expect(plan).toEqual({ n: 1, cost: upgradePrice(s, "click") });
    expect(buyUpgrade(s, "click", "max").ok).toBe(false);
    expect(upgradeLevel(s, "click")).toBe(0);
  });

  it("stops at the top level, even when asked for more", () => {
    const s = fresh(5);
    s.coins = 1e300;
    const def = UPGRADES.find((u) => u.id === "crit")!;
    expect(def.max).toBeLessThan(100);
    expect(buyUpgrade(s, "crit", 100).ok).toBe(true); // 45 levels is all there is
    expect(upgradeLevel(s, "crit")).toBe(def.max);
    expect(upgradePlan(s, "crit", 10).n).toBe(0);
    expect(buyUpgrade(s, "crit", 10).ok).toBe(false);
  });

  it("party slots and incubators are bought one by one in order, whatever the amount", () => {
    const s = fresh(6);
    s.coins = 1e15;
    expect(buyUpgrade(s, "slots", "max").ok).toBe(true);
    expect(upgradeLevel(s, "slots")).toBe(5);
    expect(buyUpgrade(s, "incubator", 100).ok).toBe(true);
    expect(upgradeLevel(s, "incubator")).toBe(3);
  });
});
