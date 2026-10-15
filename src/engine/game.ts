/**
 * The game itself. One mutable state, a handful of commands that change it, and `tick`, which lets
 * time pass. Everything that happens that the screen may want to show comes back as an event.
 *
 * Mutating in place keeps a game that updates sixty times a second cheap; the state is plain JSON,
 * so it saves, loads and clones (structuredClone) like any object, and the random numbers come from
 * one seeded generator stored in the state, so the same play always has the same outcome.
 */

import { t } from "../i18n/index.js";
import { ACHIEVEMENTS, ACHIEVEMENT_BONUS } from "./achievements.js";
import { MAX_SPECIES, SPECIES, type Species, evolutionsOf, isSpecial, species } from "./dex.js";
import { PERKS, buyPerk, perksCost } from "./perks.js";
import { PLACES, PLACES_PER_REGION, REGIONS, REGION_COUNT, ROUTE_COUNT, type Place, bossSpecies, killsToUnlock, place, poolOf } from "./regions.js";
import { Rng } from "./rng.js";
import {
  BALLS, BALL_POWER, BALL_PRICE, BOSS_TIME, TUNING, bossHp, type BallId, CLICK_ATTACK_SHARE, CRIT_BASE, CRIT_CAP, CRIT_MULT, EGG_PRICE, EGG_STEPS, INCUBATOR_PRICES, MAX_EGG_SLOTS,
  MAX_LEVEL, MAX_PARTY, MAX_PLACE, OFFLINE_EFFICIENCY, OFFLINE_MAX_SECONDS, PARTY_DPS_FACTOR, PITY_STEP, SHINY_ODDS, SLOT_PRICES, UPGRADES, attackOf, killCoins, routeHp,
  speciesHpFactor, upgradeCost, upgradeDef, wildLevel, xpNeed, xpPerKill, type EggTier,
} from "./rules.js";
import { bestEffectiveness } from "./typechart.js";

export interface DexEntry {
  seen: boolean;
  caught: boolean;
  shiny: boolean;
  level: number;
  xp: number;
  candy: number;
  /** Failed throws at this species since the last catch. */
  pity: number;
}

export interface Wild {
  sp: number;
  hp: number;
  maxHp: number;
  level: number;
  shiny: boolean;
  boss: boolean;
  /** Seconds left before a boss escapes (0 for ordinary creatures). */
  timer: number;
}

export interface Egg {
  tier: EggTier;
  steps: number;
  need: number;
  /** Which region's legends a legendary egg holds. */
  region: number;
}

export interface Stats {
  clicks: number;
  crits: number;
  kills: number;
  caught: number;
  shinies: number;
  legendary: number;
  evolved: number;
  hatched: number;
  bosses: number;
  masterCatches: number;
  playSeconds: number;
}

export interface Settings {
  /** Which ball to throw: 0 to 3, or 4 for "choose for me". */
  ball: number;
  autoAdvance: boolean;
  autoEvolve: boolean;
}

export interface State {
  v: 1;
  rng: number;
  coins: number;
  /** Coins earned this run, and in all runs. */
  runCoins: number;
  lifetimeCoins: number;
  balls: number[];
  /** Eggs owned and not yet in an incubator, by tier. */
  bag: number[];
  eggs: Egg[];
  dex: Record<number, DexEntry>;
  /** Species in the party, the leader first. */
  party: number[];
  place: number;
  /** The furthest place open this run. */
  maxPlace: number;
  /** The furthest place ever reached, across runs. */
  bestPlace: number;
  /** Kills at each of the five regions' places this run, and in the Tower in all. */
  kills: number[];
  towerKills: number;
  wild: Wild | null;
  upgrades: Record<string, number>;
  /** The champions beaten, ever, by region: the first win of each gives a legendary egg. */
  champions: boolean[];
  /** The regions whose legendary egg is waiting in the bag, in the order they were won. */
  legendRegions: number[];
  /** How many times the trainer has retired. */
  rank: number;
  /** Marks to spend, and all the marks ever paid (what the multiplier is built on). */
  marks: number;
  marksTotal: number;
  perks: string[];
  achievements: string[];
  stats: Stats;
  settings: Settings;
  /** When the game was last saved, for offline progress (ms since 1970; 0 if never). */
  savedAt: number;
}

export type GameEvent =
  | { t: "kill"; sp: number; coins: number; boss: boolean }
  | { t: "caught"; sp: number; shiny: boolean; fresh: boolean; ball: BallId }
  | { t: "escaped"; sp: number; ball: BallId }
  | { t: "fled"; sp: number }
  | { t: "candy"; sp: number; amount: number }
  | { t: "levelUp"; sp: number; level: number }
  | { t: "canEvolve"; sp: number }
  | { t: "evolved"; from: number; to: number }
  | { t: "hatched"; sp: number; shiny: boolean; fresh: boolean }
  | { t: "unlocked"; place: number }
  | { t: "bossFailed"; place: number }
  | { t: "champion"; region: number }
  | { t: "egg"; tier: EggTier }
  | { t: "achievement"; id: string };

// ---- a new game ------------------------------------------------------------------------------

const emptyEntry = (): DexEntry => ({ seen: false, caught: false, shiny: false, level: 1, xp: 0, candy: 0, pity: 0 });

export function newGame(seed: number): State {
  return {
    v: 1,
    rng: seed >>> 0,
    coins: 0,
    runCoins: 0,
    lifetimeCoins: 0,
    balls: [20, 0, 0, 0],
    bag: [0, 0, 0, 0],
    eggs: [],
    dex: {},
    party: [],
    place: 0,
    maxPlace: 0,
    bestPlace: 0,
    kills: Array<number>(ROUTE_COUNT).fill(0),
    towerKills: 0,
    wild: null,
    upgrades: {},
    champions: Array<boolean>(REGION_COUNT).fill(false),
    legendRegions: [],
    rank: 0,
    marks: 0,
    marksTotal: 0,
    perks: [],
    achievements: [],
    stats: { clicks: 0, crits: 0, kills: 0, caught: 0, shinies: 0, legendary: 0, evolved: 0, hatched: 0, bosses: 0, masterCatches: 0, playSeconds: 0 },
    settings: { ball: 4, autoAdvance: true, autoEvolve: false },
    savedAt: 0,
  };
}

export const STARTERS = REGIONS.flatMap((r) => r.starters);

/** Take a first partner. Only possible at the very start; it is level 5 and goes to the front. */
export function chooseStarter(s: State, id: number): boolean {
  if (s.party.length > 0 || !REGIONS[0]!.starters.includes(id)) return false;
  entry(s, id).seen = true;
  catchSpecies(s, id, false, []);
  const e = s.dex[id]!;
  e.level = 5;
  s.party = [id];
  return true;
}

export const entry = (s: State, id: number): DexEntry => (s.dex[id] ??= emptyEntry());
export const caught = (s: State, id: number): boolean => s.dex[id]?.caught === true;

// ---- bonuses ---------------------------------------------------------------------------------

const has = (s: State, id: string): boolean => s.perks.includes(id);
export const upgradeLevel = (s: State, id: string): number => s.upgrades[id] ?? 0;

/** Everything that multiplies every coin and every hit: the marks earned by retiring, the Pokédex and achievements. */
export const globalMult = (s: State): number => (1 + 0.03 * s.marksTotal) * (1 + 0.004 * s.stats.caught + 0.02 * s.stats.shinies) * (1 + ACHIEVEMENT_BONUS * s.achievements.length);

export const coinMult = (s: State): number => (1 + 0.08 * upgradeLevel(s, "coins")) * (has(s, "jackpot") ? 1.5 : 1) * globalMult(s);
export const xpMult = (s: State): number => 1 + 0.1 * upgradeLevel(s, "xp");
export const catchMult = (s: State): number => (1 + 0.04 * upgradeLevel(s, "catch")) * (has(s, "scent") ? 1.2 : 1);
export const shinyOdds = (s: State): number => SHINY_ODDS * (1 + 0.35 * upgradeLevel(s, "shiny") + (has(s, "hunter") ? 0.5 : 0));
export const partySlots = (s: State): number => Math.min(MAX_PARTY, 1 + upgradeLevel(s, "slots"));
export const eggSlots = (s: State): number => Math.min(MAX_EGG_SLOTS, 1 + upgradeLevel(s, "incubator"));
export const autoClickRate = (s: State): number => 0.5 * upgradeLevel(s, "auto");
export const critChance = (s: State): number => Math.min(CRIT_CAP, CRIT_BASE + 0.01 * upgradeLevel(s, "crit") + (has(s, "eye") ? 0.1 : 0));
const critMult = (s: State): number => (has(s, "alpha") ? 6 : CRIT_MULT);

export function attackOfEntry(id: number, e: DexEntry): number {
  return attackOf(species(id), e.level, e.shiny);
}

/** How well a creature's types hit the wild one in front of the party (1 when nothing is there). */
const typeFactor = (id: number, wild: Wild | null): number => (wild ? bestEffectiveness(species(id).types, species(wild.sp).types) : 1);

/** What the party deals each second to the creature in front of it. */
export function dps(s: State, wild: Wild | null = s.wild): number {
  let sum = 0;
  for (const id of s.party) {
    const e = s.dex[id];
    if (e) sum += attackOfEntry(id, e) * typeFactor(id, wild);
  }
  return sum * PARTY_DPS_FACTOR * (1 + TUNING.upgradePower * upgradeLevel(s, "train")) * (has(s, "rhythm") ? 1.25 : 1) * globalMult(s);
}

/** What one click deals (before a critical hit), led by the first of the party. */
export function clickDamage(s: State, wild: Wild | null = s.wild): number {
  const lead = s.party[0];
  const e = lead ? s.dex[lead] : undefined;
  const attack = lead && e ? attackOfEntry(lead, e) * typeFactor(lead, wild) : 0;
  return (1 + CLICK_ATTACK_SHARE * attack) * (1 + TUNING.upgradePower * upgradeLevel(s, "click")) * (has(s, "claws") ? 1.25 : 1) * globalMult(s);
}

// ---- the wild --------------------------------------------------------------------------------

const bossKind = (p: Place): "gym" | "champion" | "tower" => (p.tower ? "tower" : p.kind === "champion" ? "champion" : "gym");

function pickWild(s: State, rng: Rng, p: Place): number {
  if (p.kind !== "wild") return bossSpecies(p);
  const pool = poolOf(p);
  // the lure bends the odds toward the rare: weight = rate^(1 - 0.02 per level), the common ones lose less than the rare ones gain
  const exponent = 1 - 0.02 * upgradeLevel(s, "lure");
  let total = 0;
  const weights = pool.map((e) => {
    const w = e.rate ** exponent * e.boost;
    total += w;
    return w;
  });
  let roll = rng.next() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return pool[i]!.id;
  }
  return pool[pool.length - 1]!.id;
}

/** Bring the next creature. */
export function spawn(s: State): Wild {
  const p = place(s.place);
  const rng = new Rng(s.rng);
  const sp = pickWild(s, rng, p);
  const spec = species(sp);
  const boss = p.kind !== "wild";
  const shiny = rng.next() < shinyOdds(s);
  s.rng = rng.state;
  const maxHp = routeHp(p.index) * speciesHpFactor(spec) * (boss ? bossHp(bossKind(p)) : 1);
  const wild: Wild = { sp, hp: maxHp, maxHp, level: wildLevel(p.index), shiny, boss, timer: boss ? BOSS_TIME[bossKind(p)] : 0 };
  s.wild = wild;
  entry(s, sp).seen = true;
  return wild;
}

export function goTo(s: State, index: number): boolean {
  if (index < 0 || index > s.maxPlace || index > MAX_PLACE) return false;
  if (index !== s.place || !s.wild) {
    s.place = index;
    spawn(s);
  }
  return true;
}

/** Kills still needed here before the next place opens (0 once it is open). */
export function killsLeft(s: State, index = s.place): number {
  const p = place(index);
  if (index < s.maxPlace) return 0;
  const done = p.tower ? s.towerKills : (s.kills[index] ?? 0);
  return Math.max(0, killsToUnlock(p) - done);
}

// ---- catching --------------------------------------------------------------------------------

export function catchChance(s: State, id: number, ball: BallId, shiny = false): number {
  const e = s.dex[id];
  const base = species(id).catchRate / 255;
  const chance = base * BALL_POWER[ball] * catchMult(s) * (1 + PITY_STEP * (e?.pity ?? 0)) * (shiny ? 1.5 : 1);
  return Math.min(1, chance);
}

/** The ball to throw: the one chosen, or, left to the game, the weakest that has a good chance (else the best there is). */
export function chooseBall(s: State, id: number, shiny = false): BallId | null {
  // the Master Ball is for the legendary ones; everything else gets the regular balls
  const special = isSpecial(species(id));
  const have = BALLS.filter((b, i) => (s.balls[i] ?? 0) > 0 && (b !== "master" || special || s.settings.ball === 3));
  if (have.length === 0) return null;
  if (s.settings.ball < BALLS.length) {
    const wanted = BALLS[s.settings.ball]!;
    return have.includes(wanted) ? wanted : null;
  }
  for (const b of have) if (catchChance(s, id, b, shiny) >= 0.5) return b;
  return have[have.length - 1]!;
}

/** Make a creature caught (a new entry, a shiny one, or candy for a duplicate). Returns whether it is a new species. */
function catchSpecies(s: State, id: number, shiny: boolean, events: GameEvent[], ball: BallId = "ball"): boolean {
  const e = entry(s, id);
  const fresh = !e.caught;
  e.seen = true;
  if (fresh) {
    e.caught = true;
    e.level = 1;
    e.xp = 0;
    e.pity = 0;
    s.stats.caught++;
    if (isSpecial(species(id))) s.stats.legendary++;
  }
  if (shiny && !e.shiny) {
    e.shiny = true;
    s.stats.shinies++;
  }
  if (ball === "master") s.stats.masterCatches++;
  events.push({ t: "caught", sp: id, shiny, fresh, ball });
  return fresh;
}

function candyFor(s: State, id: number, shiny: boolean, events: GameEvent[]): void {
  const e = entry(s, id);
  const amount = shiny ? 10 : 1;
  e.candy += amount;
  events.push({ t: "candy", sp: id, amount });
}

function resolveWild(s: State, w: Wild, events: GameEvent[], rng: Rng): void {
  const e = entry(s, w.sp);
  if (e.caught) {
    // known species: no ball needed, it turns into candy; a shiny one is a catch outright
    if (w.shiny && !e.shiny) catchSpecies(s, w.sp, true, events);
    else candyFor(s, w.sp, w.shiny, events);
    return;
  }
  const ball = chooseBall(s, w.sp, w.shiny);
  if (!ball) {
    events.push({ t: "fled", sp: w.sp });
    return;
  }
  s.balls[BALLS.indexOf(ball)]!--;
  if (rng.next() < catchChance(s, w.sp, ball, w.shiny)) catchSpecies(s, w.sp, w.shiny, events, ball);
  else {
    e.pity++;
    events.push({ t: "escaped", sp: w.sp, ball });
  }
}

// ---- levels and evolution --------------------------------------------------------------------

function gainXp(s: State, id: number, amount: number, events: GameEvent[]): void {
  const e = s.dex[id];
  if (!e || !e.caught || e.level >= MAX_LEVEL) return;
  e.xp += amount;
  const before = e.level;
  while (e.level < MAX_LEVEL && e.xp >= xpNeed(e.level)) {
    e.xp -= xpNeed(e.level);
    e.level++;
  }
  if (e.level >= MAX_LEVEL) e.xp = 0;
  if (e.level !== before) {
    events.push({ t: "levelUp", sp: id, level: e.level });
    if (evolutionTargets(s, id).length > 0 && evolutionTargets(s, id).every((to) => species(to).evoLevel > before)) events.push({ t: "canEvolve", sp: id });
  }
}

/** Turn candy into experience for one species: ten candies make a level. */
export function useCandy(s: State, id: number, count: number, events: GameEvent[] = []): boolean {
  const e = s.dex[id];
  if (!e || !e.caught || e.level >= MAX_LEVEL || count < 1 || e.candy < count) return false;
  e.candy -= count;
  gainXp(s, id, (xpNeed(e.level) / 10) * count, events);
  return true;
}

/** The species this one could evolve into right now. */
export function evolutionTargets(s: State, id: number): number[] {
  const e = s.dex[id];
  if (!e?.caught) return [];
  return evolutionsOf(id).filter((to) => e.level >= species(to).evoLevel);
}

export function evolve(s: State, from: number, to: number, events: GameEvent[] = []): boolean {
  if (!evolutionTargets(s, from).includes(to)) return false;
  const a = s.dex[from]!;
  const fresh = !caught(s, to);
  const b = entry(s, to);
  if (fresh) {
    b.caught = true;
    s.stats.caught++;
    if (isSpecial(species(to))) s.stats.legendary++;
  }
  b.seen = true;
  b.level = Math.max(fresh ? 1 : b.level, a.level);
  if (a.shiny && !b.shiny) {
    b.shiny = true;
    s.stats.shinies++;
  }
  s.stats.evolved++;
  const slot = s.party.indexOf(from);
  if (slot >= 0 && !s.party.includes(to)) s.party[slot] = to;
  events.push({ t: "evolved", from, to });
  return true;
}

// ---- the party -------------------------------------------------------------------------------

/** Put a creature in a slot (or leave it empty with null). */
export function setParty(s: State, slot: number, id: number | null): boolean {
  if (slot < 0 || slot >= partySlots(s)) return false;
  if (id === null) {
    if (s.party.length <= 1 && s.party[slot] !== undefined) return false; // never an empty party
    if (slot < s.party.length) s.party.splice(slot, 1);
    return true;
  }
  if (!caught(s, id)) return false;
  const was = s.party.indexOf(id);
  if (was >= 0) {
    if (was === slot) return true;
    // swap places
    const other = s.party[slot];
    s.party[was] = other ?? s.party[was]!;
    if (other === undefined) {
      s.party.splice(was, 1);
      s.party.push(id);
      return true;
    }
    s.party[slot] = id;
    return true;
  }
  if (slot < s.party.length) s.party[slot] = id;
  else s.party.push(id);
  return true;
}

/** The strongest team the player can field right now against the creature in front of them. */
export function bestParty(s: State): number[] {
  const ranked = SPECIES.filter((sp) => caught(s, sp.id))
    .map((sp) => ({ id: sp.id, power: attackOfEntry(sp.id, s.dex[sp.id]!) * typeFactor(sp.id, s.wild) }))
    .sort((a, b) => b.power - a.power || a.id - b.id);
  return ranked.slice(0, partySlots(s)).map((r) => r.id);
}

// ---- defeating things ------------------------------------------------------------------------

function addSteps(s: State, steps: number, events: GameEvent[], rng: Rng): void {
  if (s.eggs.length === 0) return;
  const gain = steps * (has(s, "warm") ? 1.4 : 1);
  for (let i = s.eggs.length - 1; i >= 0; i--) {
    const egg = s.eggs[i]!;
    egg.steps += gain;
    if (egg.steps >= egg.need) {
      s.eggs.splice(i, 1);
      hatch(s, egg, events, rng);
    }
  }
}

/** The furthest region walked, 0 to 4 (the Tower counts as the last). */
export const highestRegion = (s: State): number => Math.min(REGION_COUNT - 1, Math.floor(Math.min(s.maxPlace, ROUTE_COUNT - 1) / PLACES_PER_REGION));

function eggPool(s: State, tier: EggTier, rng: Rng, region: number): Species {
  if (tier === 3) return species(rng.pick(REGIONS[Math.min(region, REGION_COUNT - 1)]!.legends));
  const gen = s.maxPlace >= ROUTE_COUNT ? 5 : highestRegion(s) + 1;
  if (tier === 2 && has(s, "seeker") && rng.next() < 0.2) {
    const specials = SPECIES.filter((sp) => isSpecial(sp) && sp.gen <= gen);
    if (specials.length > 0) return rng.pick(specials);
  }
  const options = SPECIES.filter((sp) => {
    if (isSpecial(sp) || sp.gen > gen) return false;
    if (tier === 0) return sp.stage === 1;
    if (tier === 1) return sp.stage <= 2;
    return sp.bst >= 450;
  });
  const weights = options.map((sp) => (tier === 0 ? sp.catchRate : 270 - sp.catchRate));
  let roll = rng.next() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return options[i]!;
  }
  return options[options.length - 1]!;
}

function hatch(s: State, egg: Egg, events: GameEvent[], rng: Rng): void {
  const sp = eggPool(s, egg.tier, rng, egg.region);
  // eggs are lucky: twice the shiny odds
  const shiny = rng.next() < shinyOdds(s) * 2;
  const e = entry(s, sp.id);
  const fresh = !e.caught;
  s.stats.hatched++;
  if (fresh || (shiny && !e.shiny)) catchSpecies(s, sp.id, shiny, events);
  else candyFor(s, sp.id, shiny, events);
  events.push({ t: "hatched", sp: sp.id, shiny, fresh });
}

function defeat(s: State, events: GameEvent[]): void {
  const w = s.wild!;
  const p = place(s.place);
  const rng = new Rng(s.rng);
  const coins = killCoins(w.maxHp) * coinMult(s);
  s.coins += coins;
  s.runCoins += coins;
  s.lifetimeCoins += coins;
  s.stats.kills++;
  events.push({ t: "kill", sp: w.sp, coins, boss: w.boss });

  const xp = xpPerKill(p.index) * xpMult(s) * (w.boss ? 3 : 1);
  for (const id of s.party) gainXp(s, id, xp, events);

  resolveWild(s, w, events, rng);
  addSteps(s, 4, events, rng);

  if (p.tower) s.towerKills++;
  else s.kills[p.index] = (s.kills[p.index] ?? 0) + 1;

  if (w.boss) {
    s.stats.bosses++;
    if (p.kind === "champion" && !s.champions[p.region]) {
      s.champions[p.region] = true;
      s.bag[3] = (s.bag[3] ?? 0) + 1;
      s.legendRegions.push(p.region);
      events.push({ t: "champion", region: p.region });
      events.push({ t: "egg", tier: 3 });
      s.balls[3] = (s.balls[3] ?? 0) + 1;
    }
  }
  s.rng = rng.state;

  // the next place opens once enough have fallen
  if (s.place === s.maxPlace && killsLeft(s) === 0 && s.maxPlace < MAX_PLACE) {
    s.maxPlace++;
    s.bestPlace = Math.max(s.bestPlace, s.maxPlace);
    events.push({ t: "unlocked", place: s.maxPlace });
    if (s.settings.autoAdvance) s.place = s.maxPlace;
  } else if (s.settings.autoAdvance && s.place < s.maxPlace && killsLeft(s) === 0 && w.boss) {
    // a boss won again on a place already behind: carry on to where the walk was
    s.place = Math.min(s.maxPlace, s.place + 1);
  }
}

function applyDamage(s: State, amount: number, events: GameEvent[]): void {
  let left = amount;
  for (let guard = 0; guard < 60 && left > 0; guard++) {
    const w = s.wild ?? spawn(s);
    if (left < w.hp) {
      w.hp -= left;
      return;
    }
    left -= w.hp;
    defeat(s, events);
    spawn(s);
  }
}

// ---- play ------------------------------------------------------------------------------------

export interface ClickResult {
  damage: number;
  crit: boolean;
  events: GameEvent[];
}

export function click(s: State, auto = false): ClickResult {
  const events: GameEvent[] = [];
  const wild = s.wild ?? spawn(s);
  const rng = new Rng(s.rng);
  const crit = rng.next() < critChance(s);
  s.rng = rng.state;
  const damage = clickDamage(s, wild) * (crit ? critMult(s) : 1);
  if (!auto) s.stats.clicks++;
  if (crit) s.stats.crits++;
  applyDamage(s, damage, events);
  const egg = new Rng(s.rng);
  addSteps(s, 1, events, egg);
  s.rng = egg.state;
  return { damage, crit, events };
}

let achievementClock = new WeakMap<State, number>();

/** Let `dt` seconds pass. `mult` scales what the party and the helpers do (offline time is worth less). */
export function tick(s: State, dt: number, mult = 1): GameEvent[] {
  const events: GameEvent[] = [];
  s.stats.playSeconds += dt;
  if (!s.wild) spawn(s);

  // helper fingers click on their own, a fractional click carried over to the next tick
  const rate = autoClickRate(s);
  if (rate > 0) {
    const carry = (autoCarry.get(s) ?? 0) + rate * dt * mult;
    const n = Math.min(50, Math.floor(carry));
    autoCarry.set(s, carry - Math.floor(carry));
    for (let i = 0; i < n; i++) events.push(...click(s, true).events);
  }

  const damage = dps(s) * dt * mult;
  if (damage > 0) applyDamage(s, damage, events);

  const w = s.wild;
  if (w?.boss) {
    w.timer -= dt;
    if (w.timer <= 0) {
      events.push({ t: "bossFailed", place: s.place });
      s.place = Math.max(0, s.place - 1);
      spawn(s);
    }
  }

  if (s.settings.autoEvolve) {
    for (const id of [...s.party]) {
      const targets = evolutionTargets(s, id);
      if (targets.length === 1) evolve(s, id, targets[0]!, events);
    }
  }

  const clock = (achievementClock.get(s) ?? 0) + dt;
  if (clock >= 1) {
    achievementClock.set(s, 0);
    events.push(...checkAchievements(s));
  } else achievementClock.set(s, clock);
  return events;
}

const autoCarry = new WeakMap<State, number>();

export function checkAchievements(s: State): GameEvent[] {
  const events: GameEvent[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!s.achievements.includes(a.id) && a.test(s)) {
      s.achievements.push(a.id);
      events.push({ t: "achievement", id: a.id });
    }
  }
  return events;
}

/** Catch up on time away: up to eight hours, at half the speed, in steps of at most five seconds. Returns what was earned. */
export function offline(s: State, seconds: number): { seconds: number; coins: number; kills: number } {
  const span = Math.max(0, Math.min(OFFLINE_MAX_SECONDS, seconds));
  const coins = s.coins;
  const kills = s.stats.kills;
  const step = Math.max(1, span / 600);
  const saved = s.settings.autoAdvance;
  // time away never walks into a boss: it would only be lost to the timer
  for (let t0 = 0; t0 < span; t0 += step) {
    const before = s.stats.playSeconds;
    tick(s, Math.min(step, span - t0), OFFLINE_EFFICIENCY);
    s.stats.playSeconds = before;
    if (s.wild?.boss) {
      s.place = Math.max(0, s.place - 1);
      spawn(s);
    }
  }
  s.settings.autoAdvance = saved;
  return { seconds: span, coins: s.coins - coins, kills: s.stats.kills - kills };
}

// ---- the shop --------------------------------------------------------------------------------

export type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });

/** The cost of a kill's worth of coins at the furthest place: prices of things that matter at every stage are quoted in it. */
export const unit = (s: State): number => killCoins(routeHp(Math.min(s.maxPlace, ROUTE_COUNT + 400)));

const discount = (s: State, id: "shopper" | "bargain"): number => (has(s, id) ? (id === "shopper" ? 0.9 : 0.7) : 1);

export function upgradePrice(s: State, id: string): number | null {
  if (id === "slots") {
    const n = upgradeLevel(s, "slots");
    return n < SLOT_PRICES.length ? Math.ceil(SLOT_PRICES[n]! * discount(s, "shopper")) : null;
  }
  if (id === "incubator") {
    const n = upgradeLevel(s, "incubator");
    return n < INCUBATOR_PRICES.length ? Math.ceil(INCUBATOR_PRICES[n]! * discount(s, "shopper")) : null;
  }
  const def = upgradeDef(id);
  if (!def) return null;
  const level = upgradeLevel(s, id);
  return level >= def.max ? null : Math.ceil(upgradeCost(def, level) * discount(s, "shopper"));
}

export function buyUpgrade(s: State, id: string): Result {
  const price = upgradePrice(s, id);
  if (price === null) return fail(t("That is as far as it goes."));
  if (s.coins < price) return fail(t("Not enough coins."));
  s.coins -= price;
  s.upgrades[id] = upgradeLevel(s, id) + 1;
  return ok;
}

export const ballPrice = (s: State, ball: Exclude<BallId, "master">): number => Math.max(1, Math.ceil(unit(s) * BALL_PRICE[ball] * discount(s, "bargain")));
export const eggPrice = (s: State, tier: 0 | 1 | 2): number => Math.ceil(unit(s) * EGG_PRICE[tier] * discount(s, "bargain"));

export function buyBall(s: State, ball: Exclude<BallId, "master">, count: number): Result {
  if (!Number.isInteger(count) || count < 1) return fail(t("Not enough coins."));
  const price = ballPrice(s, ball) * count;
  if (s.coins < price) return fail(t("Not enough coins."));
  s.coins -= price;
  s.balls[BALLS.indexOf(ball)] = (s.balls[BALLS.indexOf(ball)] ?? 0) + count;
  return ok;
}

/** How many balls the coins in hand would buy, at most. */
export const affordableBalls = (s: State, ball: Exclude<BallId, "master">): number => Math.floor(s.coins / ballPrice(s, ball));

export function buyEgg(s: State, tier: 0 | 1 | 2): Result {
  const price = eggPrice(s, tier);
  if (s.coins < price) return fail(t("Not enough coins."));
  s.coins -= price;
  s.bag[tier] = (s.bag[tier] ?? 0) + 1;
  return ok;
}

/** Put an egg from the bag into a free incubator. */
export function incubate(s: State, tier: EggTier): Result {
  if ((s.bag[tier] ?? 0) < 1) return fail(t("You have no such egg."));
  if (s.eggs.length >= eggSlots(s)) return fail(t("All incubators are busy."));
  s.bag[tier]!--;
  s.eggs.push({ tier, steps: 0, need: EGG_STEPS[tier], region: tier === 3 ? (s.legendRegions.shift() ?? highestRegion(s)) : 0 });
  return ok;
}

// ---- retiring --------------------------------------------------------------------------------

/** Retiring is possible once the champion of the first region has fallen this run. */
export const canRetire = (s: State): boolean => s.maxPlace >= PLACES_PER_REGION;

/** The marks that all progress up to a place has paid in total. */
export const marksForPlace = (index: number): number => Math.floor(Math.max(0, index) ** 1.3 / 6);

/**
 * What retiring would pay now: only progress beyond the furthest place ever reached is paid, so
 * starting over and getting back to the same place earns nothing; going further earns the difference.
 */
export const marksFor = (s: State): number => (canRetire(s) ? Math.max(0, marksForPlace(Math.max(s.bestPlace, s.maxPlace)) - s.marksTotal) : 0);

/** Start over, stronger: the coins, upgrades and walk are lost; the Pokédex, candy, shinies, achievements and perks stay. */
export function retire(s: State): Result {
  if (!canRetire(s)) return fail(t("Beat the first champion before you retire."));
  const paid = marksFor(s);
  s.marks += paid;
  s.marksTotal += paid;
  s.bestPlace = Math.max(s.bestPlace, s.maxPlace);
  s.rank++;
  s.coins = has(s, "pocket") ? 500 : 0;
  s.runCoins = 0;
  s.balls = [20, 0, 0, 0];
  s.bag = [0, 0, 0, 0];
  s.eggs = [];
  s.upgrades = {};
  s.place = 0;
  s.maxPlace = 0;
  s.kills = Array<number>(ROUTE_COUNT).fill(0);
  s.towerKills = 0;
  s.wild = null;
  for (const e of Object.values(s.dex)) {
    e.level = 1;
    e.xp = 0;
  }
  s.party = s.party.slice(0, 1);
  spawn(s);
  return ok;
}

// ---- perks -----------------------------------------------------------------------------------

export function learnPerk(s: State, id: string): Result {
  const r = buyPerk(s.perks, id, s.marks);
  if (!r.ok) return fail(r.error);
  s.marks -= PERKS.find((p) => p.id === id)!.cost;
  s.perks = r.perks;
  return ok;
}

/** Take every perk back and get all the marks to spend again. */
export function forgetPerks(s: State): void {
  s.marks += perksCost(s.perks);
  s.perks = [];
}

// ---- readings for the screen -----------------------------------------------------------------

export const dexCounts = (s: State): { seen: number; caught: number; shiny: number; total: number } => {
  let seen = 0;
  for (const e of Object.values(s.dex)) if (e.seen) seen++;
  return { seen, caught: s.stats.caught, shiny: s.stats.shinies, total: MAX_SPECIES };
};

/** Recount what is kept as a running total, after loading a save. */
export function recount(s: State): void {
  let c = 0;
  let sh = 0;
  let lg = 0;
  for (const [id, e] of Object.entries(s.dex)) {
    if (e.caught) {
      c++;
      if (isSpecial(species(+id))) lg++;
    }
    if (e.shiny) sh++;
  }
  s.stats.caught = c;
  s.stats.shinies = sh;
  s.stats.legendary = lg;
}

export { PLACES };
