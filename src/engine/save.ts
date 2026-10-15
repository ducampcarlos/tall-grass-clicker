/**
 * Saving and loading. A save is plain JSON that comes back from untrusted storage or from a file the
 * player picked, so loading checks every field: a damaged or hand-edited save is refused rather than
 * crashing the game or smuggling in impossible numbers.
 */

import { ACHIEVEMENTS } from "./achievements.js";
import { MAX_SPECIES, hasSpecies } from "./dex.js";
import { type DexEntry, type Egg, type Settings, type State, type Stats, type Wild, partySlots, recount } from "./game.js";
import { isHelperId } from "./helpers.js";
import { type Buff, isBuffId, isTier, parseItemKey } from "./items.js";
import { isGameId } from "./minigames.js";
import { PERKS, perksCost, validPerks } from "./perks.js";
import { REGION_COUNT, ROUTE_COUNT } from "./regions.js";
import { EGG_STEPS, MAX_LEVEL, MAX_PARTY, MAX_PLACE, UPGRADES, type EggTier } from "./rules.js";

export const SAVE_VERSION = 1;

export function serializeState(s: State): string {
  return JSON.stringify(s);
}

const BIG = 1e300;
const isNum = (v: unknown, min = 0, max = BIG): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const isInt = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const intList = (v: unknown, length: number, max: number): number[] | null => (Array.isArray(v) && v.length === length && v.every((n) => isInt(n, 0, max)) ? (v as number[]) : null);

const UPGRADE_MAX = new Map<string, number>([...UPGRADES.map((u) => [u.id, u.max] as const), ["slots", MAX_PARTY - 1], ["incubator", 3]]);

function parseDex(raw: unknown): Record<number, DexEntry> | null {
  if (!isObj(raw)) return null;
  const dex: Record<number, DexEntry> = {};
  for (const [key, value] of Object.entries(raw)) {
    const id = Number(key);
    if (!hasSpecies(id) || !isObj(value)) return null;
    const { seen, caught, shiny, level, xp, candy, pity } = value;
    if (typeof seen !== "boolean" || typeof caught !== "boolean" || typeof shiny !== "boolean") return null;
    if (!isInt(level, 1, MAX_LEVEL) || !isNum(xp) || !isInt(candy, 0, 1e12) || !isInt(pity, 0, 1e9)) return null;
    if (shiny && !caught) return null;
    dex[id] = { seen: seen || caught, caught, shiny, level, xp, candy, pity };
  }
  return dex;
}

function parseWild(raw: unknown): Wild | null | undefined {
  if (raw === null) return null;
  if (!isObj(raw)) return undefined;
  const { sp, hp, maxHp, level, shiny, boss, timer } = raw;
  if (!hasSpecies(sp) || !isNum(hp, 0) || !isNum(maxHp, 1e-9) || hp > maxHp * 1.0000001 || !isInt(level, 1, MAX_LEVEL)) return undefined;
  if (typeof shiny !== "boolean" || typeof boss !== "boolean" || !isNum(timer, -1e6, 1e6)) return undefined;
  return { sp, hp, maxHp, level, shiny, boss, timer };
}

/** Returns the state, or null if the text is not a valid save. */
export function parseState(text: string): State | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || raw.v !== SAVE_VERSION) return null;
  const r = raw;

  if (!isInt(r.rng, 0, 0xffffffff)) return null;
  if (!isNum(r.coins) || !isNum(r.runCoins) || !isNum(r.lifetimeCoins)) return null;
  const balls = intList(r.balls, 4, 1e12);
  const bag = intList(r.bag, 4, 1e9);
  if (!balls || !bag) return null;

  const dex = parseDex(r.dex);
  if (!dex) return null;

  if (!isInt(r.place, 0, MAX_PLACE) || !isInt(r.maxPlace, 0, MAX_PLACE) || !isInt(r.bestPlace, 0, MAX_PLACE)) return null;
  if (r.place > r.maxPlace || r.maxPlace > r.bestPlace) return null;
  const kills = intList(r.kills, ROUTE_COUNT, 1e12);
  if (!kills || !isInt(r.towerKills, 0, 1e12)) return null;

  const wild = parseWild(r.wild);
  if (wild === undefined) return null;

  if (!isObj(r.upgrades)) return null;
  const upgrades: Record<string, number> = {};
  for (const [id, level] of Object.entries(r.upgrades)) {
    const max = UPGRADE_MAX.get(id);
    if (max === undefined || !isInt(level, 0, max)) return null;
    if (level > 0) upgrades[id] = level;
  }

  if (!Array.isArray(r.champions) || r.champions.length !== REGION_COUNT || !r.champions.every((c) => typeof c === "boolean")) return null;
  if (!Array.isArray(r.legendRegions) || r.legendRegions.length > 50 || !r.legendRegions.every((n) => isInt(n, 0, REGION_COUNT - 1))) return null;

  if (!isInt(r.rank, 0, 1e9) || !isInt(r.marks, 0, 1e9) || !isInt(r.marksTotal, 0, 1e9)) return null;
  if (!Array.isArray(r.perks) || r.perks.length > PERKS.length || !r.perks.every((p) => typeof p === "string") || !validPerks(r.perks as string[])) return null;
  if (perksCost(r.perks as string[]) + r.marks > r.marksTotal) return null;

  const known = new Set(ACHIEVEMENTS.map((a) => a.id));
  if (!Array.isArray(r.achievements) || new Set(r.achievements).size !== r.achievements.length || !r.achievements.every((a) => typeof a === "string" && known.has(a))) return null;

  if (!Array.isArray(r.eggs) || r.eggs.length > 4) return null;
  const eggs: Egg[] = [];
  for (const e of r.eggs) {
    if (!isObj(e) || !isInt(e.tier, 0, 3) || !isNum(e.steps) || !isNum(e.need, 1) || !isInt(e.region, 0, REGION_COUNT - 1)) return null;
    if (e.need !== EGG_STEPS[e.tier as EggTier]) return null;
    eggs.push({ tier: e.tier as EggTier, steps: e.steps, need: e.need, region: e.region });
  }

  if (!isObj(r.stats)) return null;
  const statKeys: Array<keyof Stats> = ["clicks", "crits", "kills", "caught", "shinies", "legendary", "evolved", "hatched", "bosses", "masterCatches", "playSeconds"];
  const stats = {} as Stats;
  for (const k of statKeys) {
    const v = (r.stats as Record<string, unknown>)[k];
    if (!isNum(v)) return null;
    stats[k] = v;
  }
  // added later: a save from before them has none, which is zero
  for (const k of ["roamers", "games"] as const) {
    const v = (r.stats as Record<string, unknown>)[k] ?? 0;
    if (!isNum(v)) return null;
    stats[k] = v;
  }

  if (!isObj(r.settings)) return null;
  const { ball, autoAdvance, autoEvolve } = r.settings;
  if (!isInt(ball, 0, 4) || typeof autoAdvance !== "boolean" || typeof autoEvolve !== "boolean") return null;
  const helpers: Record<string, boolean> = {};
  if (r.settings.helpers !== undefined) {
    if (!isObj(r.settings.helpers)) return null;
    for (const [id, on] of Object.entries(r.settings.helpers)) {
      if (!isHelperId(id) || typeof on !== "boolean") return null;
      helpers[id] = on;
    }
  }
  const settings: Settings = { ball, autoAdvance, autoEvolve, helpers };

  // boosters in the bag and at work, and the mini-game timers: all added later, so a save from before has none
  const items: Record<string, number> = {};
  if (r.items !== undefined) {
    if (!isObj(r.items)) return null;
    for (const [key, n] of Object.entries(r.items)) {
      if (!parseItemKey(key) || !isInt(n, 0, 1e6)) return null;
      if (n > 0) items[key] = n;
    }
  }
  const buffs: Buff[] = [];
  if (r.buffs !== undefined) {
    if (!Array.isArray(r.buffs) || r.buffs.length > 7) return null;
    for (const b of r.buffs) {
      if (!isObj(b) || !isBuffId(b.id) || !isTier(b.tier) || !isNum(b.left, 0, 1e6)) return null;
      if (buffs.some((x) => x.id === b.id)) return null;
      if (b.left > 0) buffs.push({ id: b.id, tier: b.tier, left: b.left });
    }
  }
  const cooldowns: Record<string, number> = {};
  if (r.cooldowns !== undefined) {
    if (!isObj(r.cooldowns)) return null;
    for (const [id, left] of Object.entries(r.cooldowns)) {
      if (!isGameId(id) || !isNum(left, 0, 1e5)) return null;
      if (left > 0) cooldowns[id] = left;
    }
  }

  if (!isNum(r.savedAt, 0, 8.64e15)) return null;

  // the party: distinct caught species, at most as many as the slots bought
  if (!Array.isArray(r.party) || r.party.length > MAX_PARTY || new Set(r.party).size !== r.party.length) return null;
  if (!r.party.every((id) => hasSpecies(id) && dex[id]?.caught === true)) return null;

  const state: State = {
    v: 1,
    rng: r.rng,
    coins: r.coins,
    runCoins: r.runCoins,
    lifetimeCoins: r.lifetimeCoins,
    balls,
    bag,
    eggs,
    dex,
    party: r.party as number[],
    place: r.place,
    maxPlace: r.maxPlace,
    bestPlace: r.bestPlace,
    kills,
    towerKills: r.towerKills,
    wild,
    upgrades,
    champions: r.champions as boolean[],
    legendRegions: r.legendRegions as number[],
    rank: r.rank,
    marks: r.marks,
    marksTotal: r.marksTotal,
    perks: r.perks as string[],
    achievements: r.achievements as string[],
    stats,
    settings,
    items,
    buffs,
    cooldowns,
    savedAt: r.savedAt,
  };
  if (state.party.length > partySlots(state)) return null;
  recount(state); // what is kept as a running count follows what is really in the Pokédex
  return state;
}

export { MAX_SPECIES };
