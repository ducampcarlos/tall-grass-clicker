/**
 * The numbers of the game in one place: how hard the wild hit, what they give, what upgrades cost.
 * Everything is tuned with the bot in src/sim (npm run balance), not by feel.
 */

import { ROUTE_COUNT } from "./regions.js";
import { type Species, basePower } from "./dex.js";

export const MAX_LEVEL = 100;
export const MAX_PARTY = 6;
export const MAX_EGG_SLOTS = 4;

import { TUNING } from "./tuning.js";
export { TUNING };

// ---- the wild --------------------------------------------------------------------------------

/** Health of an ordinary wild creature at a place: it climbs by a fixed share at every step of the walk. */
export const routeHp = (index: number): number => TUNING.hpBase * TUNING.hpGrowth ** index * easeIn(index);

/** The first ten places are eased in, so the very first creature falls in a few clicks and the game starts at once. */
export const EASE_PLACES = 10;
const easeIn = (index: number): number => (index >= EASE_PLACES ? 1 : 0.12 + (0.88 * index) / EASE_PLACES);

/** Bosses are a wall: a gym leader and a champion have this many times the health of the place. */
export const bossHp = (kind: "gym" | "champion" | "tower"): number => TUNING.bossHp[kind];
/** Seconds to beat a boss before it escapes. */
export const BOSS_TIME = { gym: 40, champion: 60, tower: 45 } as const;

/** Sturdier species have more health than frail ones, 0.8x to 1.5x. */
export const speciesHpFactor = (s: Species): number => 0.8 + s.bst / 1000;

/** The level shown on a wild creature. It is a label: strength lives in the health. */
export const wildLevel = (index: number): number => Math.min(100, Math.max(2, Math.round(2 + index * 1.4)));

export const killCoins = (hp: number): number => Math.ceil(hp * TUNING.coinShare);
export const xpPerKill = (index: number): number => 3 * 1.13 ** index;
/** Experience from a level to the next. */
export const xpNeed = (level: number): number => Math.ceil(10 * 1.1 ** level);

/** What a creature hits for each second at a level. Shiny ones are a half stronger. */
export const attackOf = (s: Species, level: number, shiny: boolean): number => basePower(s) * (1 + 0.08 * (level - 1)) * (shiny ? 1.5 : 1);

/** The share of the party's attack that lands every second on its own (clicks come on top). */
export const PARTY_DPS_FACTOR = 0.25;
/** A click hits for this share of the leader's attack, plus one. */
export const CLICK_ATTACK_SHARE = 0.6;
export const CRIT_BASE = 0.05;
export const CRIT_MULT = 4;
export const CRIT_CAP = 0.5;

// ---- catching --------------------------------------------------------------------------------

export const BALLS = ["ball", "great", "ultra", "master"] as const;
export type BallId = (typeof BALLS)[number];
export const BALL_NAMES: Record<BallId, string> = { ball: "Capture Ball", great: "Great Ball", ultra: "Ultra Ball", master: "Master Ball" };
/** How much each ball multiplies the catch chance. */
export const BALL_POWER: Record<BallId, number> = { ball: 1, great: 1.6, ultra: 2.6, master: 1000 };
/** The price of a ball in the cost of kills at the furthest place reached (the master ball is not for sale). */
export const BALL_PRICE: Record<Exclude<BallId, "master">, number> = { ball: 0.4, great: 2, ultra: 9 };
/** Each failed throw at a species makes the next a little likelier. */
export const PITY_STEP = 0.05;

export const SHINY_ODDS = 1 / 4096;

// ---- eggs ------------------------------------------------------------------------------------

export const EGG_TIERS = ["basic", "rare", "epic", "legendary"] as const;
export type EggTier = 0 | 1 | 2 | 3;
export const EGG_NAMES = ["Basic Egg", "Rare Egg", "Epic Egg", "Legendary Egg"] as const;
/** Steps to hatch: a click is a step, a kill is four. */
export const EGG_STEPS = [120, 400, 1200, 2400] as const;
/** The price in kills' worth of coins at the furthest place reached (the legendary egg is only ever a gift). */
export const EGG_PRICE = [30, 150, 750] as const;

// ---- upgrades --------------------------------------------------------------------------------

export interface UpgradeDef {
  id: string;
  name: string;
  text: string;
  /** Cost of the first level; each level costs `growth` times the one before. */
  base: number;
  growth: number;
  max: number;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: "click", name: "Strong Fists", text: "+10% click damage per level.", base: 20, growth: 1.25, max: 250 },
  { id: "train", name: "Training Gear", text: "+10% damage from your party per level.", base: 60, growth: 1.27, max: 250 },
  { id: "crit", name: "Critical Eye", text: "+1% chance of a critical click per level.", base: 150, growth: 1.5, max: 45 },
  { id: "auto", name: "Helper Fingers", text: "+0.5 automatic clicks per second per level.", base: 250, growth: 1.4, max: 60 },
  { id: "coins", name: "Gold Charm", text: "+8% coins per level.", base: 400, growth: 1.55, max: 80 },
  { id: "catch", name: "Capture Tech", text: "+4% chance to catch per level.", base: 300, growth: 1.5, max: 60 },
  { id: "lure", name: "Sweet Lure", text: "Rare creatures show up more often.", base: 500, growth: 1.7, max: 30 },
  { id: "shiny", name: "Shiny Charm", text: "Shiny creatures are more common: 1 in 4096 improves toward 1 in 1100.", base: 5000, growth: 2.4, max: 8 },
  { id: "xp", name: "Exp Share", text: "+10% experience per level.", base: 200, growth: 1.45, max: 60 },
];

/** Party slots and incubators are bought once each, at a price that does not climb with the places. */
export const SLOT_PRICES = [500, 8_000, 120_000, 2_000_000, 30_000_000] as const;
export const INCUBATOR_PRICES = [3_000, 60_000, 1_200_000] as const;

export const upgradeDef = (id: string): UpgradeDef | undefined => UPGRADES.find((u) => u.id === id);
export const upgradeCost = (def: UpgradeDef, level: number): number => Math.ceil(def.base * def.growth ** level);

// ---- the world's bounds ----------------------------------------------------------------------

/** Tower floors have no end, but the numbers do: past this the game stops asking for more. */
export const MAX_PLACE = ROUTE_COUNT + 2000;

export const OFFLINE_MAX_SECONDS = 8 * 3600;
export const OFFLINE_EFFICIENCY = 0.5;
