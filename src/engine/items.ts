/**
 * Boosters: items that make something better for a while. Each comes in three tiers; a tier lasts
 * longer and is stronger. They are earned in the mini-games, found, bought (the first tier) and
 * combined (three of one tier make one of the next). Time only runs while you are playing.
 */

export type BuffId = "shiny" | "coins" | "xp" | "catch" | "power" | "lure" | "warm";
export type Tier = 1 | 2 | 3;

export interface TierDef {
  name: string;
  /** What the booster does: a multiplier (shiny, coins, xp, catch, power, warm) or levels of Sweet Lure (lure). */
  value: number;
  /** How long it lasts, in seconds of play. */
  seconds: number;
  /** The picture of the item. */
  icon: string;
}

export interface BuffDef {
  id: BuffId;
  /** What it is called as a group. */
  label: string;
  /** What it does, with {value} where the strength goes. */
  text: string;
  tiers: readonly [TierDef, TierDef, TierDef];
}

const T = (name: string, icon: string, value: number, seconds: number): TierDef => ({ name, icon, value, seconds });

export const BUFFS: readonly BuffDef[] = [
  { id: "shiny", label: "Shiny boost", text: "Shiny creatures are {value} times as common.", tiers: [T("Stardust", "stardust", 2, 300), T("Star Piece", "star-piece", 3, 600), T("Comet Shard", "comet-shard", 5, 900)] },
  { id: "coins", label: "Coin boost", text: "Every coin you earn is worth {value} times as much.", tiers: [T("Nugget", "nugget", 1.5, 300), T("Big Nugget", "big-nugget", 2, 600), T("Relic Gold", "relic-gold", 3, 900)] },
  { id: "xp", label: "Experience boost", text: "Your party earns {value} times the experience.", tiers: [T("Tiny Mushroom", "tiny-mushroom", 1.5, 300), T("Big Mushroom", "big-mushroom", 2, 600), T("Balm Mushroom", "balm-mushroom", 3, 900)] },
  { id: "catch", label: "Catch boost", text: "Balls are {value} times as likely to catch.", tiers: [T("Oran Berry", "oran-berry", 1.3, 300), T("Sitrus Berry", "sitrus-berry", 1.6, 600), T("Lum Berry", "lum-berry", 2, 900)] },
  { id: "power", label: "Power boost", text: "Clicks and party hit {value} times as hard.", tiers: [T("X Attack", "x-attack", 1.5, 300), T("X Sp. Atk", "x-sp-atk", 2, 600), T("Dire Hit", "dire-hit", 3, 900)] },
  { id: "lure", label: "Rare boost", text: "Rare creatures show up more often, as if the Sweet Lure were {value} levels higher.", tiers: [T("Bright Powder", "bright-powder", 6, 300), T("Silver Powder", "silver-powder", 12, 600), T("Zoom Lens", "zoom-lens", 20, 900)] },
  { id: "warm", label: "Egg warmer", text: "Eggs hatch {value} times as fast.", tiers: [T("Charcoal", "charcoal", 2, 300), T("Heat Rock", "heat-rock", 3, 600), T("Flame Orb", "flame-orb", 5, 900)] },
];

export const BUFF_IDS: readonly BuffId[] = BUFFS.map((b) => b.id);
const BY_ID = new Map(BUFFS.map((b) => [b.id, b] as const));

export const buffDef = (id: BuffId): BuffDef => BY_ID.get(id)!;
export const tierDef = (id: BuffId, tier: Tier): TierDef => buffDef(id).tiers[tier - 1]!;
export const isBuffId = (v: unknown): v is BuffId => typeof v === "string" && BY_ID.has(v as BuffId);
export const isTier = (v: unknown): v is Tier => v === 1 || v === 2 || v === 3;

/** An item in the bag is named by its booster and tier: "shiny2". */
export const itemKey = (id: BuffId, tier: Tier): string => `${id}${tier}`;
export function parseItemKey(key: string): { id: BuffId; tier: Tier } | null {
  const tier = Number(key.slice(-1));
  const id = key.slice(0, -1);
  return isBuffId(id) && isTier(tier) ? { id, tier } : null;
}

/** A booster that is working: its tier and the seconds of play it has left. */
export interface Buff {
  id: BuffId;
  tier: Tier;
  left: number;
}

/** The strength of a working booster, or null when there is none. */
export function buffValue(buffs: readonly Buff[], id: BuffId): number | null {
  const b = buffs.find((x) => x.id === id);
  return b ? tierDef(id, b.tier).value : null;
}

/** A multiplier from a booster: its strength when it works, 1 when it does not. */
export const buffMult = (buffs: readonly Buff[], id: BuffId): number => buffValue(buffs, id) ?? 1;

/** What the booster costs in the shop, in units of a kill's coins at the furthest place (first tier only). */
export const BOOSTER_PRICE: Record<BuffId, number> = { shiny: 220, coins: 150, xp: 90, catch: 90, power: 120, lure: 110, warm: 80 };
