import { describe, expect, it } from "vitest";

import {
  STARTERS, buyBall, buyEgg, buyUpgrade, canRetire, caught, catchChance, chooseBall, chooseStarter, click, clickDamage, dps, entry, evolutionTargets, evolve, forgetPerks, globalMult, goTo,
  incubate, killsLeft, learnPerk, marksFor, marksForPlace, newGame, offline, retire, setParty, bestParty, spawn, tick, unit, upgradePrice, useCandy, ballPrice, eggPrice, partySlots, eggSlots,
  coinMult, critChance, shinyOdds, checkAchievements, upgradeLevel, type GameEvent,
} from "../src/engine/game.js";
import { species } from "../src/engine/dex.js";
import { REGIONS, ROUTE_COUNT, place } from "../src/engine/regions.js";
import { EGG_STEPS, MAX_LEVEL, SLOT_PRICES, UPGRADES, xpNeed, routeHp, killCoins } from "../src/engine/rules.js";
import { fresh, own, setWild } from "./helpers.js";

const kinds = (events: GameEvent[]) => events.map((e) => e.t);

describe("starting", () => {
  it("begins empty, and takes one of the three Kanto starters, once, at level 5", () => {
    const s = newGame(1);
    expect(s.party).toEqual([]);
    expect(chooseStarter(s, 25)).toBe(false); // Pikachu is not on offer
    expect(chooseStarter(s, 152)).toBe(false); // nor a starter of another region
    expect(chooseStarter(s, 7)).toBe(true);
    expect(s.party).toEqual([7]);
    expect(caught(s, 7)).toBe(true);
    expect(s.dex[7]!.level).toBe(5);
    expect(s.stats.caught).toBe(1);
    expect(chooseStarter(s, 1)).toBe(false); // only once
    expect(STARTERS).toHaveLength(15);
  });
});

describe("clicking and fighting", () => {
  it("a click hurts the creature in front, and counts", () => {
    const s = fresh();
    setWild(s, 19, { hp: 1e9 });
    const before = s.wild!.hp;
    const r = click(s);
    expect(r.damage).toBeGreaterThan(0);
    expect(s.wild!.hp).toBeCloseTo(before - r.damage);
    expect(s.stats.clicks).toBe(1);
  });

  it("hits harder with Strong Fists, a better leader and the right type", () => {
    const s = fresh();
    setWild(s, 19, { hp: 1e12 }); // Rattata: normal
    const base = clickDamage(s);
    s.upgrades.click = 10;
    expect(clickDamage(s)).toBeGreaterThan(base * 1.4);
    s.upgrades.click = 0;
    own(s, 6, 50);
    s.party = [6];
    expect(clickDamage(s)).toBeGreaterThan(base * 5);
    // fire hits a grass creature twice as hard as a normal one, and a water creature half
    setWild(s, 1, { hp: 1e12 });
    const vsGrass = clickDamage(s);
    setWild(s, 7, { hp: 1e12 });
    const vsWater = clickDamage(s);
    expect(vsGrass / vsWater).toBeGreaterThan(1.8);
  });

  it("the party fights on its own, and more creatures fight harder", () => {
    const s = fresh();
    setWild(s, 19);
    const one = dps(s);
    expect(one).toBeGreaterThan(0);
    own(s, 6, 30);
    s.upgrades.slots = 1;
    s.party = [4, 6];
    expect(dps(s)).toBeGreaterThan(one * 2);
    s.upgrades.train = 20;
    const trained = dps(s);
    s.upgrades.train = 0;
    expect(trained).toBeGreaterThan(dps(s) * 1.9);
  });

  it("defeating a creature pays coins, experience and counts a kill", () => {
    const s = fresh();
    setWild(s, 19, { hp: 1 });
    const xp = s.dex[4]!.xp;
    const events = tick(s, 1);
    expect(kinds(events)).toContain("kill");
    expect(s.coins).toBeGreaterThan(0);
    expect(s.stats.kills).toBeGreaterThan(0);
    expect(s.runCoins).toBe(s.coins);
    expect(s.dex[4]!.xp !== xp || s.dex[4]!.level > 5).toBe(true);
    expect(s.wild).not.toBeNull(); // the next one is already there
  });

  it("a very strong party defeats several creatures in one tick, without losing the leftover", () => {
    const s = fresh();
    own(s, 150, 100);
    s.party = [150];
    s.upgrades.train = 200;
    setWild(s, 19, { hp: 10 });
    const events = tick(s, 5);
    expect(events.filter((e) => e.t === "kill").length).toBeGreaterThanOrEqual(3);
    expect(events.filter((e) => e.t === "kill").length).toBeLessThanOrEqual(60);
  });

  it("opens the next place after enough kills, and walks on by itself if asked to", () => {
    const s = fresh();
    expect(killsLeft(s)).toBeGreaterThan(5);
    const need = killsLeft(s);
    s.upgrades.train = 100;
    for (let i = 0; i < need; i++) {
      setWild(s, 19, { hp: 1 });
      tick(s, 1);
    }
    expect(s.maxPlace).toBe(1);
    expect(s.place).toBe(1);

    const t = fresh();
    t.settings.autoAdvance = false;
    for (let i = 0; i < need; i++) {
      setWild(t, 19, { hp: 1 });
      tick(t, 1);
    }
    expect(t.maxPlace).toBe(1);
    expect(t.place).toBe(0);
    expect(goTo(t, 1)).toBe(true);
    expect(t.place).toBe(1);
    expect(goTo(t, 2)).toBe(false); // not open yet
    expect(goTo(t, -1)).toBe(false);
  });

  it("keeps the next place's wild creatures to the places' own kind", () => {
    const s = fresh(3);
    s.place = 0;
    for (let i = 0; i < 200; i++) {
      spawn(s);
      const sp = species(s.wild!.sp);
      expect(sp.stage).toBe(1);
      expect(sp.gen).toBe(1);
      expect(sp.legendary || sp.mythical).toBe(false);
    }
  });
});

describe("catching", () => {
  it("throws a ball at a new species and catches it with the chance the numbers say", () => {
    const s = fresh(5);
    const known = (sp: number) => caught(s, sp);
    s.balls = [1000, 0, 0, 0];
    let attempts = 0;
    let successes = 0;
    for (let i = 0; i < 400; i++) {
      s.dex[16] = { seen: true, caught: false, shiny: false, level: 1, xp: 0, candy: 0, pity: 0 }; // Pidgey, catch rate 255
      s.stats.caught = 1;
      setWild(s, 16, { hp: 1 });
      const before = s.balls[0]!;
      tick(s, 1);
      attempts += before - s.balls[0]!;
      if (known(16)) successes++;
    }
    expect(attempts).toBeGreaterThan(300);
    expect(successes / attempts).toBeGreaterThan(0.9); // rate 255 of 255
  });

  it("calculates chances: rare is hard, better balls and Capture Tech help, failures build pity", () => {
    const s = fresh();
    const rare = 144; // Articuno, rate 3
    expect(catchChance(s, rare, "ball")).toBeCloseTo(3 / 255);
    expect(catchChance(s, rare, "great")).toBeGreaterThan(catchChance(s, rare, "ball"));
    expect(catchChance(s, rare, "ultra")).toBeGreaterThan(catchChance(s, rare, "great"));
    expect(catchChance(s, rare, "master")).toBe(1);
    s.upgrades.catch = 25;
    expect(catchChance(s, rare, "ball")).toBeCloseTo((3 / 255) * 2);
    entry(s, rare).pity = 20;
    expect(catchChance(s, rare, "ball")).toBeCloseTo((3 / 255) * 2 * 2);
    expect(catchChance(s, 129, "ball")).toBe(1); // Magikarp
    expect(catchChance(s, rare, "ball", true)).toBeGreaterThan(catchChance(s, rare, "ball", false));
  });

  it("a failed throw is spent and builds pity; with no balls the creature just leaves", () => {
    const s = fresh(2);
    s.balls = [3, 0, 0, 0];
    let failed = 0;
    for (let i = 0; i < 3; i++) {
      s.dex[144] = { seen: true, caught: false, shiny: false, level: 1, xp: 0, candy: 0, pity: s.dex[144]?.pity ?? 0 };
      setWild(s, 144, { hp: 1 });
      const events = tick(s, 1);
      failed += events.filter((e) => e.t === "escaped").length;
    }
    expect(failed).toBe(3);
    expect(s.balls[0]).toBe(0);
    expect(s.dex[144]!.pity).toBe(3);
    setWild(s, 144, { hp: 1 });
    expect(kinds(tick(s, 1))).toContain("fled");
    expect(caught(s, 144)).toBe(false);
  });

  it("chooses a ball: the one asked for, or, left to the game, the weakest that is good enough", () => {
    const s = fresh();
    s.balls = [5, 5, 5, 1];
    s.settings.ball = 4;
    expect(chooseBall(s, 129)).toBe("ball"); // an easy catch needs nothing special
    expect(chooseBall(s, 149)).toBe("ultra"); // a hard one (Dragonite) gets the best regular ball, not the Master Ball
    expect(chooseBall(s, 144)).toBe("master"); // a legendary one is what it is kept for
    s.settings.ball = 1;
    expect(chooseBall(s, 129)).toBe("great");
    s.balls[1] = 0;
    expect(chooseBall(s, 129)).toBeNull(); // the one asked for is out
    s.balls = [0, 0, 0, 0];
    s.settings.ball = 4;
    expect(chooseBall(s, 129)).toBeNull();
  });

  it("turns a creature already caught into candy, and a shiny one into a shiny catch", () => {
    const s = fresh();
    own(s, 19, 1);
    setWild(s, 19, { hp: 1 });
    expect(kinds(tick(s, 1))).toContain("candy");
    expect(s.dex[19]!.candy).toBe(1);
    expect(s.balls[0]).toBe(20); // no ball for what you know
    setWild(s, 19, { hp: 1, shiny: true });
    const events = tick(s, 1);
    expect(events.some((e) => e.t === "caught" && e.shiny)).toBe(true);
    expect(s.dex[19]!.shiny).toBe(true);
    expect(s.stats.shinies).toBe(1);
    setWild(s, 19, { hp: 1, shiny: true });
    tick(s, 1);
    expect(s.dex[19]!.candy).toBe(11); // a second shiny is ten candies
  });

  it("makes shiny ones rare, and rarer to find without the charm", () => {
    const s = fresh();
    expect(shinyOdds(s)).toBeCloseTo(1 / 4096);
    s.upgrades.shiny = 8;
    expect(shinyOdds(s)).toBeCloseTo((1 / 4096) * 3.8);
    s.perks = ["scent", "hunter"];
    s.marksTotal = 10;
    expect(shinyOdds(s)).toBeGreaterThan((1 / 4096) * 4);
    const t = fresh(9);
    let shiny = 0;
    for (let i = 0; i < 20_000; i++) if (spawn(t).shiny) shiny++;
    expect(shiny).toBeGreaterThan(0);
    expect(shiny).toBeLessThan(25);
  });
});

describe("levels, candy and evolution", () => {
  it("levels up with experience, and tells when an evolution is possible", () => {
    const s = fresh();
    own(s, 4, 15);
    s.dex[4]!.xp = xpNeed(15) - 1;
    setWild(s, 19, { hp: 1 });
    const events = tick(s, 1);
    expect(s.dex[4]!.level).toBeGreaterThanOrEqual(16);
    expect(events.some((e) => e.t === "levelUp" && e.sp === 4)).toBe(true);
    expect(events.some((e) => e.t === "canEvolve" && e.sp === 4)).toBe(true);
    expect(evolutionTargets(s, 4)).toEqual([5]);
  });

  it("never passes level 100", () => {
    const s = fresh();
    own(s, 4, MAX_LEVEL);
    s.dex[4]!.xp = 5;
    setWild(s, 19, { hp: 1 });
    tick(s, 1);
    expect(s.dex[4]!.level).toBe(MAX_LEVEL);
    expect(s.dex[4]!.xp).toBeLessThanOrEqual(5);
  });

  it("turns ten candies into a level", () => {
    const s = fresh();
    own(s, 4, 10);
    s.dex[4]!.candy = 25;
    expect(useCandy(s, 4, 26)).toBe(false);
    expect(useCandy(s, 4, 10)).toBe(true);
    expect(s.dex[4]!.level).toBe(11);
    expect(s.dex[4]!.candy).toBe(15);
    expect(useCandy(s, 19, 1)).toBe(false); // not caught
    expect(useCandy(s, 4, 0)).toBe(false);
  });

  it("evolves at the right level, keeps the old one, and gives a new Pokédex entry", () => {
    const s = fresh();
    expect(evolve(s, 4, 5)).toBe(false); // level 5: too soon
    own(s, 4, 16, true);
    const caughtBefore = s.stats.caught;
    const events: GameEvent[] = [];
    expect(evolve(s, 4, 5, events)).toBe(true);
    expect(caught(s, 5)).toBe(true);
    expect(s.dex[5]!.level).toBe(16);
    expect(s.dex[5]!.shiny).toBe(true); // a shiny stays shiny
    expect(s.dex[4]!.caught).toBe(true);
    expect(s.party).toEqual([5]);
    expect(s.stats.caught).toBe(caughtBefore + 1);
    expect(s.stats.evolved).toBe(1);
    expect(events).toEqual([{ t: "evolved", from: 4, to: 5 }]);
    expect(evolve(s, 4, 6)).toBe(false); // not a direct evolution
    expect(evolve(s, 19, 20)).toBe(false);
  });

  it("evolves by itself when asked, only if there is one way to go", () => {
    const s = fresh();
    s.settings.autoEvolve = true;
    own(s, 4, 16);
    tick(s, 0.1);
    expect(s.party).toEqual([5]);
    const e = fresh();
    e.settings.autoEvolve = true;
    own(e, 133, 40); // Eevee has seven ways
    e.party = [133];
    tick(e, 0.1);
    expect(e.party).toEqual([133]);
    expect(evolutionTargets(e, 133).length).toBeGreaterThan(3);
  });
});

describe("the party", () => {
  it("has as many places as were bought, and only caught creatures in it", () => {
    const s = fresh();
    own(s, 25, 5);
    own(s, 6, 5);
    expect(partySlots(s)).toBe(1);
    expect(setParty(s, 1, 25)).toBe(false); // no second slot yet
    expect(setParty(s, 0, 19)).toBe(false); // not caught
    s.upgrades.slots = 2;
    expect(setParty(s, 1, 25)).toBe(true);
    expect(setParty(s, 2, 6)).toBe(true);
    expect(s.party).toEqual([4, 25, 6]);
    expect(setParty(s, 0, 6)).toBe(true); // swap with where it was
    expect(s.party).toEqual([6, 25, 4]);
    expect(setParty(s, 5, 4)).toBe(false);
  });

  it("never leaves the party empty, and removes from the end", () => {
    const s = fresh();
    s.upgrades.slots = 2;
    own(s, 25, 5);
    setParty(s, 1, 25);
    expect(setParty(s, 1, null)).toBe(true);
    expect(s.party).toEqual([4]);
    expect(setParty(s, 0, null)).toBe(false);
  });

  it("picks the strongest team for the creature in front", () => {
    const s = fresh();
    s.upgrades.slots = 2;
    own(s, 6, 40);
    own(s, 9, 40); // Blastoise
    own(s, 3, 40); // Venusaur
    setWild(s, 74, { hp: 100 }); // Geodude: rock/ground, weak to water and grass
    const best = bestParty(s);
    expect(best).toHaveLength(3);
    expect(best.slice(0, 2).sort()).toEqual([3, 9]);
  });
});

describe("the shop", () => {
  it("sells upgrades at a price that climbs, and stops at the top", () => {
    const s = fresh();
    s.coins = 1e12;
    const first = upgradePrice(s, "click")!;
    expect(buyUpgrade(s, "click")).toEqual({ ok: true });
    expect(upgradeLevel(s, "click")).toBe(1);
    expect(upgradePrice(s, "click")!).toBeGreaterThan(first);
    expect(s.coins).toBe(1e12 - first);
    s.upgrades.click = 250;
    expect(upgradePrice(s, "click")).toBeNull();
    expect(buyUpgrade(s, "click")).toMatchObject({ ok: false });
    expect(upgradePrice(s, "nope")).toBeNull();
    const poor = fresh();
    poor.coins = 1;
    expect(buyUpgrade(poor, "click")).toMatchObject({ ok: false, error: expect.stringContaining("coins") });
    expect(poor.coins).toBe(1);
  });

  it("sells party slots and incubators in a fixed order, up to the limit", () => {
    const s = fresh();
    s.coins = 1e12;
    for (let i = 0; i < SLOT_PRICES.length; i++) expect(buyUpgrade(s, "slots")).toEqual({ ok: true });
    expect(partySlots(s)).toBe(6);
    expect(buyUpgrade(s, "slots")).toMatchObject({ ok: false });
    for (let i = 0; i < 3; i++) buyUpgrade(s, "incubator");
    expect(eggSlots(s)).toBe(4);
    expect(upgradePrice(s, "incubator")).toBeNull();
  });

  it("sells balls and eggs at prices that follow the progress", () => {
    const s = fresh();
    s.coins = 1e15;
    const cheap = ballPrice(s, "ball");
    expect(buyBall(s, "ball", 10)).toEqual({ ok: true });
    expect(s.balls[0]).toBe(30);
    expect(s.coins).toBe(1e15 - cheap * 10);
    expect(ballPrice(s, "great")).toBeGreaterThan(cheap);
    expect(buyBall(s, "great", 0)).toMatchObject({ ok: false });
    s.maxPlace = 40;
    expect(ballPrice(s, "ball")).toBeGreaterThan(cheap * 100);
    expect(eggPrice(s, 2)).toBeGreaterThan(eggPrice(s, 1));
    const poor = fresh();
    poor.coins = 0;
    expect(buyEgg(poor, 0)).toMatchObject({ ok: false });
    expect(unit(poor)).toBe(killCoins(routeHp(0)));
  });

  it("applies the discounts of the perks", () => {
    const s = fresh();
    const base = upgradePrice(s, "train")!;
    const ball = ballPrice(s, "ball");
    s.perks = ["pocket", "shopper", "bargain"];
    s.marksTotal = 10;
    expect(upgradePrice(s, "train")).toBe(Math.ceil(base * 0.9));
    expect(ballPrice(s, "ball")).toBeLessThanOrEqual(Math.ceil(ball * 0.7));
  });
});

describe("eggs", () => {
  it("go into an incubator, hatch after enough steps, and give a creature", () => {
    const s = fresh(4);
    s.coins = 1e12;
    expect(incubate(s, 0)).toMatchObject({ ok: false }); // none in the bag
    buyEgg(s, 0);
    expect(s.bag[0]).toBe(1);
    expect(incubate(s, 0)).toEqual({ ok: true });
    expect(s.eggs).toHaveLength(1);
    buyEgg(s, 0);
    expect(incubate(s, 0)).toMatchObject({ ok: false, error: expect.stringContaining("incubators") });
    const events: GameEvent[] = [];
    for (let i = 0; i < EGG_STEPS[0]; i++) events.push(...click(s).events);
    expect(events.some((e) => e.t === "hatched")).toBe(true);
    expect(s.eggs).toHaveLength(0);
    expect(s.stats.hatched).toBe(1);
  });

  it("hatches faster with kills, and Warm Eggs", () => {
    const s = fresh(4);
    s.eggs = [{ tier: 0, steps: 0, need: 100, region: 0 }];
    setWild(s, 19, { hp: 1 });
    tick(s, 1);
    expect(s.eggs[0]!.steps).toBe(4);
    s.perks = ["scent", "warm"];
    s.marksTotal = 10;
    setWild(s, 19, { hp: 1 });
    tick(s, 1);
    expect(s.eggs[0]!.steps).toBeCloseTo(4 + 4 * 1.4);
  });

  it("the first champion of a region gives a legendary egg of that region, only once", () => {
    const s = fresh(6);
    s.maxPlace = 11;
    s.bestPlace = 11;
    s.place = 11;
    s.kills[11] = 0;
    setWild(s, 6, { hp: 1, boss: true, timer: 60 });
    const events = tick(s, 1);
    expect(events.some((e) => e.t === "champion" && e.region === 0)).toBe(true);
    expect(s.bag[3]).toBe(1);
    expect(s.balls[3]).toBe(1);
    expect(s.champions[0]).toBe(true);
    expect(s.maxPlace).toBe(12);
    s.eggs = [];
    expect(incubate(s, 3)).toEqual({ ok: true });
    expect(s.eggs[0]).toMatchObject({ tier: 3, region: 0, need: EGG_STEPS[3] });
    for (let i = 0; i < 3000; i++) click(s);
    expect(s.stats.hatched).toBe(1);
    const legend = Object.keys(s.dex).map(Number).find((id) => REGIONS[0]!.legends.includes(id));
    expect(legend).toBeDefined();
    // winning again gives nothing more
    s.place = 11;
    setWild(s, 6, { hp: 1, boss: true, timer: 60 });
    tick(s, 1);
    expect(s.bag[3]).toBe(0);
  });
});

describe("bosses", () => {
  it("escape when the time runs out, sending the trainer back a place", () => {
    const s = fresh();
    s.maxPlace = 5;
    s.bestPlace = 5;
    s.place = 5; // the gym
    setWild(s, 95, { hp: 1e15, boss: true, timer: 10 });
    expect(kinds(tick(s, 5))).not.toContain("bossFailed");
    const events = tick(s, 6);
    expect(events.some((e) => e.t === "bossFailed")).toBe(true);
    expect(s.place).toBe(4);
    expect(s.maxPlace).toBe(5);
    expect(s.wild?.boss).toBe(false);
  });

  it("count when beaten, and open the way with a single win", () => {
    const s = fresh();
    s.maxPlace = 5;
    s.bestPlace = 5;
    s.place = 5;
    setWild(s, 95, { hp: 1, boss: true, timer: 40 });
    tick(s, 1);
    expect(s.stats.bosses).toBe(1);
    expect(s.maxPlace).toBe(6);
  });

  it("the places have a gym on the sixth and a champion on the twelfth", () => {
    for (let r = 0; r < 5; r++) {
      expect(place(r * 12 + 5).kind).toBe("gym");
      expect(place(r * 12 + 11).kind).toBe("champion");
      expect(place(r * 12).kind).toBe("wild");
    }
    expect(place(ROUTE_COUNT).tower).toBe(true);
    expect(place(ROUTE_COUNT + 9).kind).toBe("gym");
  });
});

describe("retiring and the perks", () => {
  it("is possible only after the first champion, and pays only for progress beyond the best so far", () => {
    const s = fresh();
    expect(canRetire(s)).toBe(false);
    expect(retire(s)).toMatchObject({ ok: false });
    expect(marksFor(s)).toBe(0);
    s.maxPlace = 30;
    s.bestPlace = 30;
    const first = marksFor(s);
    expect(first).toBe(marksForPlace(30));
    expect(first).toBeGreaterThan(5);
    s.coins = 999;
    s.upgrades.click = 10;
    s.kills[3] = 7;
    own(s, 25, 40);
    expect(retire(s)).toEqual({ ok: true });
    expect([s.rank, s.marks, s.marksTotal]).toEqual([1, first, first]);
    expect([s.coins, s.maxPlace, s.place, s.upgrades.click ?? 0, s.kills[3]]).toEqual([0, 0, 0, 0, 0]);
    expect(caught(s, 25)).toBe(true); // the Pokédex stays
    expect(s.dex[25]!.level).toBe(1); // the levels do not
    expect(s.party).toHaveLength(1);
    expect(s.bestPlace).toBe(30);
    expect(s.wild).not.toBeNull();
    // back to the same place, nothing more to be paid
    s.maxPlace = 30;
    expect(marksFor(s)).toBe(0);
    // a little further pays the difference
    s.maxPlace = 40;
    expect(marksFor(s)).toBe(marksForPlace(40) - first);
  });

  it("makes everything stronger the more marks have been paid", () => {
    const s = fresh();
    const a = globalMult(s);
    const clicks = clickDamage(s);
    s.marksTotal = 50;
    expect(globalMult(s)).toBeCloseTo(a * 2.5);
    expect(clickDamage(s)).toBeCloseTo(clicks * 2.5);
    expect(coinMult(s)).toBeGreaterThan(2.4);
  });

  it("starts the next run with 500 coins with Pocket Money", () => {
    const s = fresh();
    s.maxPlace = 20;
    s.bestPlace = 20;
    s.marks = 5;
    s.marksTotal = 5;
    expect(learnPerk(s, "pocket")).toEqual({ ok: true });
    retire(s);
    expect(s.coins).toBe(500);
  });

  it("are bought with marks, in order, and can be taken back for free", () => {
    const s = fresh();
    s.marks = 3;
    s.marksTotal = 3;
    expect(learnPerk(s, "rhythm")).toMatchObject({ ok: false, error: expect.stringContaining("Sharp Claws") });
    expect(learnPerk(s, "claws")).toEqual({ ok: true });
    expect(s.marks).toBe(2);
    expect(learnPerk(s, "claws")).toMatchObject({ ok: false });
    expect(learnPerk(s, "rhythm")).toEqual({ ok: true });
    expect(s.marks).toBe(0);
    expect(learnPerk(s, "eye")).toMatchObject({ ok: false, error: expect.stringContaining("marks") });
    expect(learnPerk(s, "nope")).toMatchObject({ ok: false });
    forgetPerks(s);
    expect([s.marks, s.perks]).toEqual([3, []]);
  });

  it("changes what they say they change", () => {
    const s = fresh();
    s.marksTotal = 100;
    setWild(s, 19, { hp: 1e12 });
    const base = { click: clickDamage(s), dps: dps(s), crit: critChance(s), coins: coinMult(s) };
    s.perks = ["claws", "rhythm", "eye", "jackpot", "pocket", "shopper", "bargain", "scent"];
    expect(clickDamage(s)).toBeCloseTo(base.click * 1.25);
    expect(dps(s)).toBeCloseTo(base.dps * 1.25);
    expect(critChance(s)).toBeCloseTo(base.crit + 0.1);
    expect(coinMult(s)).toBeCloseTo(base.coins * 1.5);
  });
});

describe("time away", () => {
  it("earns coins at half speed, never more than eight hours' worth", () => {
    const s = fresh(8);
    s.upgrades.train = 40;
    const r = offline(s, 3600);
    expect(r.coins).toBeGreaterThan(0);
    expect(r.kills).toBeGreaterThan(0);
    expect(r.seconds).toBe(3600);
    const t = fresh(8);
    t.upgrades.train = 40;
    expect(offline(t, 100 * 3600).seconds).toBe(8 * 3600);
    expect(offline(fresh(), -50).seconds).toBe(0);
  });

  it("does not count as play time, and does not walk into a boss", () => {
    const s = fresh(8);
    s.upgrades.train = 100;
    const before = s.stats.playSeconds;
    offline(s, 7200);
    expect(s.stats.playSeconds).toBe(before);
    expect(s.wild?.boss).toBeFalsy();
  });
});

describe("determinism", () => {
  const play = (seed: number): string => {
    const s = fresh(seed);
    s.balls = [500, 0, 0, 0];
    for (let i = 0; i < 400; i++) {
      click(s);
      tick(s, 0.5);
      if (i % 40 === 0) buyUpgrade(s, "click");
    }
    return JSON.stringify(s);
  };

  it("plays out the same from the same seed, and differently from another", () => {
    expect(play(11)).toBe(play(11));
    expect(play(11)).not.toBe(play(12));
  });
});

describe("achievements", () => {
  it("are earned once, from what has happened", () => {
    const s = fresh();
    expect(checkAchievements(s)).toEqual([]);
    s.stats.clicks = 100;
    s.stats.kills = 60;
    const events = checkAchievements(s);
    expect(events.map((e) => (e as { id: string }).id).sort()).toEqual(["clicks-100", "kills-50"]);
    expect(checkAchievements(s)).toEqual([]);
    expect(s.achievements).toContain("kills-50");
    expect(globalMult(s)).toBeGreaterThan(1.03);
  });

  it("include the champions and the Tower", () => {
    const s = fresh();
    s.champions[2] = true;
    s.bestPlace = ROUTE_COUNT + 10;
    const ids = checkAchievements(s).map((e) => (e as { id: string }).id);
    expect(ids).toContain("champion-2");
    expect(ids).toContain("tower-10");
  });
});

void UPGRADES;
