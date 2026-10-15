/**
 * A bot that plays like a sensible, not obsessive, person: it clicks a few times a second, spends
 * its coins on the cheapest useful upgrade, keeps balls in stock, fields its strongest creatures,
 * evolves what it can and tries a boss when it looks beatable. It exists to tune the game and to
 * stress the engine (npm run balance), not to be optimal.
 */

import {
  type State, bestParty, buyBall, buyEgg, buyUpgrade, caught, chooseStarter, click, dps, clickDamage, evolutionTargets, evolve, goTo, incubate, newGame,
  retire, canRetire, marksFor, tick, upgradePrice, useCandy, partySlots, eggPrice, ballPrice, unit, learnPerk, upgradeLevel,
} from "../engine/game.js";
import { PERKS } from "../engine/perks.js";
import { SPECIES, evolutionsOf, species } from "../engine/dex.js";
import { bossSpecies, place } from "../engine/regions.js";
import { BOSS_TIME, bossHp, routeHp, speciesHpFactor } from "../engine/rules.js";

export interface BotOptions {
  /** Clicks per second (0 is a pure idle game). */
  cps: number;
  /** Retire when this many marks would be paid (Infinity never retires). */
  retireAt: number;
  seed: number;
  /** Stop after this many simulated seconds. */
  horizon: number;
}

export const defaultBot: BotOptions = { cps: 3, retireAt: Infinity, seed: 1, horizon: 3600 * 10 };

const STEP = 0.5;
const UPGRADE_ORDER = ["click", "train", "coins", "xp", "catch", "crit", "auto", "lure", "shiny"] as const;

function shop(s: State): void {
  // keep the party slots and incubators coming: they unlock real power
  for (const id of ["slots", "incubator"] as const) {
    const price = upgradePrice(s, id);
    if (price !== null && s.coins >= price * 1.1) buyUpgrade(s, id);
  }
  // balls for the creatures not caught yet
  const stock = s.balls[0]! + s.balls[1]! * 2 + s.balls[2]! * 3;
  if (stock < 15) {
    const n = Math.min(40, Math.floor((s.coins * 0.4) / ballPrice(s, "ball")));
    if (n > 0) buyBall(s, "ball", n);
  }
  if (s.settings.ball === 4 && s.balls[1]! < 10 && s.coins > ballPrice(s, "great") * 25) buyBall(s, "great", 10);
  // eggs when there is room to hatch them
  if (s.eggs.length < partySlots(s) + 1) {
    for (const tier of [2, 1, 0] as const) {
      if (s.coins > eggPrice(s, tier) * 3) {
        if (buyEgg(s, tier).ok) break;
      }
    }
  }
  for (const tier of [3, 2, 1, 0] as const) while (incubate(s, tier).ok);
  // upgrades: the cheapest that is not absurd next to the rest
  for (let guard = 0; guard < 20; guard++) {
    let best: string | null = null;
    let bestPrice = Infinity;
    for (const id of UPGRADE_ORDER) {
      const price = upgradePrice(s, id);
      if (price !== null && price < bestPrice) {
        best = id;
        bestPrice = price;
      }
    }
    if (best === null || s.coins < bestPrice) break;
    // keep a reserve for balls so the Pokédex does not stall
    if (s.coins - bestPrice < unit(s) * 2 && s.balls[0]! < 5) break;
    buyUpgrade(s, best);
  }
}

function manage(s: State): void {
  s.party = bestParty(s);
  for (const id of [...s.party]) {
    for (const to of evolutionTargets(s, id)) {
      if (evolve(s, id, to)) break;
    }
  }
  // candy into the party first
  for (const id of s.party) {
    const e = s.dex[id];
    if (e && e.candy >= 10) useCandy(s, id, Math.floor(e.candy / 10) * 10 > 0 ? e.candy : 0);
  }
  // evolving can leave a better team behind
  s.party = bestParty(s);
}

/** Would a try at the boss waiting at the furthest place be worth it? Compares what the bot can deal in the time allowed with its health. */
function bossLooksBeatable(s: State, cps: number): boolean {
  const p = place(s.maxPlace);
  const kind = p.tower ? "tower" : p.kind === "champion" ? "champion" : "gym";
  const hp = routeHp(p.index) * speciesHpFactor(species(bossSpecies(p))) * bossHp(kind);
  const rate = dps(s) + clickDamage(s) * cps * 1.4;
  return rate * BOSS_TIME[kind] * 1.05 >= hp;
}

export interface Milestone {
  place: number;
  seconds: number;
  caught: number;
  coins: number;
  party: string;
}

export interface BotRun {
  state: State;
  milestones: Milestone[];
  retires: Array<{ seconds: number; marks: number; place: number }>;
}

/** The marks the bot spends: it goes down the branches in order. */
const PERK_ORDER = ["claws", "rhythm", "eye", "alpha", "pocket", "shopper", "bargain", "jackpot", "scent", "hunter", "warm", "seeker"];

export function playBot(options: Partial<BotOptions> = {}): BotRun {
  const o = { ...defaultBot, ...options };
  const s = newGame(o.seed);
  chooseStarter(s, 4);
  const milestones: Milestone[] = [];
  const retires: BotRun["retires"] = [];
  let clickCarry = 0;
  let nextShop = 0;
  let reached = 0;
  let retryAt = 0;
  let bestSoFar = 0;
  for (let t = 0; t < o.horizon; t += STEP) {
    clickCarry += o.cps * STEP;
    while (clickCarry >= 1) {
      click(s);
      clickCarry--;
    }
    const events = tick(s, STEP);
    for (const e of events) if (e.t === "bossFailed") retryAt = t + 25;
    if (t >= nextShop) {
      nextShop = t + 2;
      shop(s);
      manage(s);
      // a boss the bot is not ready for: farm until it looks beatable, then try
      if (s.place < s.maxPlace && t >= retryAt && place(s.maxPlace).kind !== "wild" && bossLooksBeatable(s, o.cps)) goTo(s, s.maxPlace);
    }
    if (s.maxPlace > reached) {
      reached = s.maxPlace;
      if (reached % 6 === 0) milestones.push({ place: reached, seconds: t, caught: s.stats.caught, coins: s.coins, party: s.party.map((id) => SPECIES[id - 1]!.name).join("/") });
    }
    bestSoFar = Math.max(bestSoFar, s.maxPlace);
    if (canRetire(s) && marksFor(s) >= o.retireAt) {
      retires.push({ seconds: t, marks: marksFor(s), place: s.maxPlace });
      retire(s);
      reached = 0;
      for (const id of PERK_ORDER) if (PERKS.some((p) => p.id === id)) learnPerk(s, id);
      s.party = bestParty(s);
    }
  }
  void caught;
  void evolutionsOf;
  void upgradeLevel;
  return { state: s, milestones, retires };
}
