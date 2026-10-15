import { describe, expect, it } from "vitest";

import { type GameEvent, catchChance, startEncounter, throwAt, throwChance, tick } from "../src/engine/game.js";
import { GAMES, GAMES_OPEN_AT, GAME_IDS, awardGame, canPlay, gamesOpen, memoryStars, quizStars, restLeft, throwQuality, whackStars } from "../src/engine/minigames.js";
import { parseState, serializeState } from "../src/engine/save.js";
import { poolOf, place } from "../src/engine/regions.js";
import { fresh } from "./helpers.js";

describe("scoring the mini-games", () => {
  it("a throw is better the smaller the ring, and a miss is a miss", () => {
    expect(throwQuality(1)).toBe(1);
    expect(throwQuality(0.8)).toBe(1);
    expect(throwQuality(0.7)).toBe(2);
    expect(throwQuality(0.5)).toBe(2);
    expect(throwQuality(0.4)).toBe(3);
    expect(throwQuality(0.15)).toBe(3);
    expect(throwQuality(0.5, false)).toBe(0);
    expect(throwQuality(1.2)).toBe(0);
    expect(throwQuality(0)).toBe(0);
    expect(throwQuality(Number.NaN)).toBe(0);
  });

  it("turns tries, answers and points into stars, never more for a worse result", () => {
    const check = (fn: (n: number) => number, from: number, to: number, better: "high" | "low") => {
      let last = better === "high" ? -1 : 4;
      for (let n = from; n <= to; n++) {
        const v = fn(n);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(3);
        if (better === "high") expect(v).toBeGreaterThanOrEqual(last);
        else expect(v).toBeLessThanOrEqual(last);
        last = v;
      }
    };
    check(memoryStars, 8, 40, "low");
    check(quizStars, 0, 8, "high");
    check(whackStars, -10, 60, "high");
    expect([memoryStars(8), memoryStars(10), memoryStars(11), memoryStars(14), memoryStars(15), memoryStars(20), memoryStars(21)]).toEqual([3, 3, 2, 2, 1, 1, 0]);
    expect([quizStars(8), quizStars(7), quizStars(6), quizStars(5), quizStars(3), quizStars(2)]).toEqual([3, 3, 2, 2, 1, 0]);
    expect([whackStars(22), whackStars(21), whackStars(14), whackStars(7), whackStars(6)]).toEqual([3, 2, 2, 1, 0]);
  });
});

describe("what the mini-games pay", () => {
  it("opens the games after a few kills, and each game rests after it is played", () => {
    const s = fresh(1);
    expect(gamesOpen(s)).toBe(false);
    expect(canPlay(s, "memory")).toBe(false);
    s.stats.kills = GAMES_OPEN_AT;
    expect(canPlay(s, "memory")).toBe(true);
    awardGame(s, "memory", 2);
    expect(canPlay(s, "memory")).toBe(false);
    expect(restLeft(s, "memory")).toBe(GAMES.find((g) => g.id === "memory")!.rest);
    expect(canPlay(s, "quiz")).toBe(true);
    // the rest runs down while you play, and only then
    for (let i = 0; i < 4 * 200; i++) tick(s, 0.25);
    expect(canPlay(s, "memory")).toBe(true);
  });

  it("pays more for more stars, in coins and in boosters", () => {
    const worth: number[] = [];
    const items: number[] = [];
    for (const stars of [0, 1, 2, 3] as const) {
      const s = fresh(2);
      s.stats.kills = 100;
      const coins = s.coins;
      const prize = awardGame(s, "quiz", stars);
      worth.push(s.coins - coins);
      items.push(prize.items.reduce((a, i) => a + i.n, 0));
      expect(s.coins - coins).toBe(prize.coins);
      expect(Object.values(s.items).reduce((a, b) => a + b, 0)).toBe(items[items.length - 1]);
      expect(s.stats.games).toBe(1);
    }
    expect(worth[0]).toBeLessThan(worth[1]!);
    expect(worth[1]).toBeLessThan(worth[2]!);
    expect(worth[2]).toBeLessThan(worth[3]!);
    expect(items).toEqual([0, 1, 2, 2]);
  });

  it("a failed game still rests, but for a third of the time", () => {
    const s = fresh(3);
    awardGame(s, "whack", 0);
    expect(restLeft(s, "whack")).toBe(Math.ceil(GAMES.find((g) => g.id === "whack")!.rest / 3));
  });

  it("three stars can pay a booster of the third tier, and never more than the third", () => {
    let top = 0;
    for (let seed = 1; seed < 300; seed++) {
      const s = fresh(seed);
      const prize = awardGame(s, "throw", 3);
      for (const i of prize.items) top = Math.max(top, i.tier);
    }
    expect(top).toBe(3);
  });

  it("is the same for the same game, and survives a save", () => {
    const a = fresh(7);
    const b = fresh(7);
    expect(awardGame(a, "memory", 3)).toEqual(awardGame(b, "memory", 3));
    expect(parseState(serializeState(a))).toEqual(a);
  });

  it("lists every game once, with a name, a picture and a rest", () => {
    expect(GAMES.map((g) => g.id)).toEqual([...GAME_IDS]);
    for (const g of GAMES) {
      expect(g.name.length).toBeGreaterThan(3);
      expect(g.icon).toMatch(/^[a-z-]+$/);
      expect(g.rest).toBeGreaterThan(60);
    }
  });
});

describe("the capture throw", () => {
  it("shows a creature from where you are, and often one you do not have", () => {
    const s = fresh(1);
    const pool = poolOf(place(0)).map((e) => e.id);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const enc = startEncounter(s);
      expect(pool).toContain(enc.sp);
      expect(enc.throws).toBe(3);
      seen.add(enc.sp);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it("walks back to the last wild place when you are at a gym", () => {
    const s = fresh(2);
    s.place = 5; // the first gym
    s.maxPlace = 5;
    const pool = poolOf(place(4)).map((e) => e.id);
    for (let i = 0; i < 50; i++) expect(pool).toContain(startEncounter(s).sp);
  });

  it("a better throw is more likely to catch, a miss never is, and nothing is certain", () => {
    const s = fresh(3);
    const enc = { sp: 147, shiny: false, throws: 3 };
    const [miss, nice, great, excellent] = ([0, 1, 2, 3] as const).map((q) => throwChance(s, enc, q));
    expect(miss).toBe(0);
    expect(nice!).toBeLessThan(great!);
    expect(great!).toBeLessThan(excellent!);
    expect(excellent!).toBeLessThanOrEqual(0.97);
    expect(catchChance(s, 150, "great")).toBeLessThan(0.05); // a legendary stays hard
  });

  it("a catch is a real catch, a duplicate gives candy, and a throw uses up a throw", () => {
    let fresher = 0;
    let candied = 0;
    for (let seed = 1; seed < 80; seed++) {
      const s = fresh(seed);
      const events: GameEvent[] = [];
      const enc = { sp: 19, shiny: false, throws: 3 };
      const before = s.stats.caught;
      const r = throwAt(s, enc, 3, events);
      if (r.caught) {
        expect(s.dex[19]!.caught).toBe(true);
        expect(s.stats.caught).toBe(before + 1);
        expect(enc.throws).toBe(0);
        fresher++;
        // a second one of the same is candy
        const again = { sp: 19, shiny: false, throws: 3 };
        for (let k = 0; k < 20 && again.throws > 0; k++) {
          const c = throwAt(s, again, 3, events);
          if (c.caught) candied++;
        }
        expect(s.dex[19]!.candy).toBeGreaterThanOrEqual(candied > 0 ? 3 : 0);
        expect(s.stats.caught).toBe(before + 1);
      } else expect(enc.throws).toBe(2);
    }
    expect(fresher).toBeGreaterThan(10);
  });

  it("a miss throws a ball away and no more can be thrown after the last", () => {
    const s = fresh(5);
    const enc = { sp: 25, shiny: false, throws: 3 };
    const events: GameEvent[] = [];
    for (let i = 0; i < 3; i++) expect(throwAt(s, enc, 0, events).caught).toBe(false);
    expect(enc.throws).toBe(0);
    expect(throwAt(s, enc, 3, events).caught).toBe(false);
    expect(events).toEqual([]);
  });
});
