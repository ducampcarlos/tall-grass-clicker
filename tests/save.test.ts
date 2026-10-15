import { describe, expect, it } from "vitest";

import { buyUpgrade, click, learnPerk, newGame, spawn, tick, type State } from "../src/engine/game.js";
import { SAVE_VERSION, parseState, serializeState } from "../src/engine/save.js";
import { fresh, own } from "./helpers.js";

const played = (): State => {
  const s = fresh(21);
  s.coins = 1e9;
  s.balls = [100, 0, 0, 0];
  for (let i = 0; i < 300; i++) {
    click(s);
    tick(s, 0.5);
  }
  buyUpgrade(s, "click");
  buyUpgrade(s, "slots");
  s.marks = 3;
  s.marksTotal = 3;
  learnPerk(s, "claws");
  own(s, 25, 12, true);
  return s;
};

const tamper = (change: (r: Record<string, any>) => void): string => {
  const raw = JSON.parse(serializeState(played()));
  change(raw);
  return parseState(JSON.stringify(raw)) === null ? "refused" : "accepted";
};

describe("saving", () => {
  it("round-trips a game that has been played", () => {
    const s = played();
    const back = parseState(serializeState(s))!;
    expect(back).not.toBeNull();
    expect(back).toEqual(s);
    expect(parseState(serializeState(back))).toEqual(s);
  });

  it("round-trips a new game and one with nothing chosen yet", () => {
    const empty = newGame(3);
    expect(parseState(serializeState(empty))).toEqual(empty);
    const started = fresh(2);
    expect(parseState(serializeState(started))).toEqual(started);
  });

  it("continues exactly where it left off", () => {
    const s = played();
    const copy = parseState(serializeState(s))!;
    for (let i = 0; i < 100; i++) {
      click(s);
      tick(s, 0.25);
      click(copy);
      tick(copy, 0.25);
    }
    expect(JSON.stringify(copy)).toBe(JSON.stringify(s));
  });

  it("refuses text that is not a save", () => {
    for (const text of ["", "nope", "null", "[]", "42", '"x"', "{}", '{"v":1}', '{"v":2}']) expect(parseState(text), text).toBeNull();
    expect(SAVE_VERSION).toBe(1);
  });

  it("refuses impossible values", () => {
    expect(tamper(() => {})).toBe("accepted");
    expect(tamper((r) => (r.coins = -1))).toBe("refused");
    expect(tamper((r) => (r.coins = "9"))).toBe("refused");
    expect(tamper((r) => (r.coins = null))).toBe("refused"); // NaN and Infinity become null in JSON
    expect(tamper((r) => (r.rng = 1.5))).toBe("refused");
    expect(tamper((r) => (r.balls = [1, 2, 3]))).toBe("refused");
    expect(tamper((r) => (r.balls[0] = -4))).toBe("refused");
    expect(tamper((r) => (r.party = []))).toBe("accepted"); // a game with no party yet is a new game
    expect(tamper((r) => (r.party = [4, 4]))).toBe("refused");
    expect(tamper((r) => (r.party = [999]))).toBe("refused");
    expect(tamper((r) => (r.party = [150]))).toBe("refused"); // not caught
    expect(tamper((r) => (r.party = [4, 25, 4, 4, 4, 4, 4]))).toBe("refused");
    expect(tamper((r) => (r.place = r.maxPlace + 1))).toBe("refused");
    expect(tamper((r) => (r.maxPlace = r.bestPlace + 1))).toBe("refused");
    expect(tamper((r) => (r.place = -1))).toBe("refused");
    expect(tamper((r) => (r.kills = [1]))).toBe("refused");
    expect(tamper((r) => (r.wild.hp = r.wild.maxHp * 2))).toBe("refused");
    expect(tamper((r) => (r.wild.sp = 0))).toBe("refused");
    expect(tamper((r) => (r.wild = {}))).toBe("refused");
    expect(tamper((r) => (r.upgrades = { cheat: 5 }))).toBe("refused");
    expect(tamper((r) => (r.upgrades = { click: 9999 }))).toBe("refused");
    expect(tamper((r) => (r.upgrades = { slots: 9 }))).toBe("refused");
    expect(tamper((r) => (r.champions = [true]))).toBe("refused");
    expect(tamper((r) => (r.legendRegions = [9]))).toBe("refused");
    expect(tamper((r) => (r.perks = ["claws", "claws"]))).toBe("refused");
    expect(tamper((r) => (r.perks = ["rhythm"]))).toBe("refused"); // its requirement is missing
    expect(tamper((r) => (r.perks = ["nope"]))).toBe("refused");
    expect(tamper((r) => (r.marksTotal = 0))).toBe("refused"); // more marks owned than ever paid
    expect(tamper((r) => (r.achievements = ["nope"]))).toBe("refused");
    expect(tamper((r) => (r.achievements = ["kills-50", "kills-50"]))).toBe("refused");
    expect(tamper((r) => (r.eggs = [{ tier: 9, steps: 0, need: 120, region: 0 }]))).toBe("refused");
    expect(tamper((r) => (r.eggs = [{ tier: 0, steps: 0, need: 1, region: 0 }]))).toBe("refused");
    expect(tamper((r) => (r.eggs = Array(6).fill({ tier: 0, steps: 0, need: 120, region: 0 })))).toBe("refused");
    expect(tamper((r) => (r.stats.kills = -1))).toBe("refused");
    expect(tamper((r) => delete r.stats.clicks)).toBe("refused");
    expect(tamper((r) => (r.settings.ball = 9))).toBe("refused");
    expect(tamper((r) => (r.settings.autoAdvance = "yes"))).toBe("refused");
    expect(tamper((r) => (r.savedAt = -5))).toBe("refused");
  });

  it("refuses a Pokédex with impossible entries", () => {
    expect(tamper((r) => (r.dex["650"] = { seen: true, caught: true, shiny: false, level: 1, xp: 0, candy: 0, pity: 0 }))).toBe("refused");
    expect(tamper((r) => (r.dex["abc"] = { seen: true, caught: true, shiny: false, level: 1, xp: 0, candy: 0, pity: 0 }))).toBe("refused");
    expect(tamper((r) => (r.dex["25"].level = 101))).toBe("refused");
    expect(tamper((r) => (r.dex["25"].level = 0))).toBe("refused");
    expect(tamper((r) => (r.dex["25"].candy = -1))).toBe("refused");
    expect(tamper((r) => (r.dex["25"].caught = false))).toBe("refused"); // a shiny that was never caught
    expect(tamper((r) => (r.dex["25"] = 5))).toBe("refused");
  });

  it("recounts what it keeps as a running total, so a wrong count cannot stick", () => {
    const s = played();
    const raw = JSON.parse(serializeState(s));
    raw.stats.caught = 649;
    raw.stats.shinies = 600;
    raw.stats.legendary = 40;
    const back = parseState(JSON.stringify(raw))!;
    expect(back.stats.caught).toBe(Object.values(s.dex).filter((e) => e.caught).length);
    expect(back.stats.shinies).toBe(Object.values(s.dex).filter((e) => e.shiny).length);
    expect(back.stats.legendary).toBe(0);
  });

  it("accepts a legitimately big save: many caught, deep in the Tower, huge numbers", () => {
    const s = played();
    for (let id = 1; id <= 649; id++) own(s, id, 100, id % 7 === 0);
    s.maxPlace = 900;
    s.bestPlace = 900;
    s.place = 800;
    s.coins = 4.5e150;
    s.lifetimeCoins = 9e150;
    spawn(s);
    const back = parseState(serializeState(s));
    expect(back).not.toBeNull();
    expect(back!.stats.caught).toBe(649);
  });
});
