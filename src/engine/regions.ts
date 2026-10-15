/**
 * The world: five regions of twelve places, then an endless tower. Each region walks its own
 * generation of creatures; each place leans on a few types, so it matters who you bring.
 */

import { SPECIES, type Species, isSpecial, species } from "./dex.js";
import { TUNING } from "./tuning.js";

export const REGION_COUNT = 5;
export const PLACES_PER_REGION = 12;
/** Places in the five regions; everything after is the Tower. */
export const ROUTE_COUNT = REGION_COUNT * PLACES_PER_REGION;

export interface Region {
  id: number;
  name: string;
  gen: number;
  /** Who guards the gym (place 6) and who is the champion (place 12). */
  gym: number;
  champion: number;
  /** The legendary creatures that hatch from the Legendary Egg this region's champion gives. */
  legends: readonly number[];
  /** The three starters on offer. */
  starters: readonly [number, number, number];
}

export const REGIONS: readonly Region[] = [
  { id: 0, name: "Kanto", gen: 1, gym: 95, champion: 6, legends: [144, 145, 146, 150, 151], starters: [1, 4, 7] },
  { id: 1, name: "Johto", gen: 2, gym: 208, champion: 248, legends: [243, 244, 245, 249, 250, 251], starters: [152, 155, 158] },
  { id: 2, name: "Hoenn", gen: 3, gym: 306, champion: 376, legends: [377, 378, 379, 380, 381, 382, 383, 384, 385, 386], starters: [252, 255, 258] },
  { id: 3, name: "Sinnoh", gen: 4, gym: 409, champion: 445, legends: [480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493], starters: [387, 390, 393] },
  { id: 4, name: "Unova", gen: 5, gym: 530, champion: 635, legends: [638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649], starters: [495, 498, 501] },
];

export type PlaceKind = "wild" | "gym" | "champion";

export interface PlaceTemplate {
  /** Shown as text: one of these (translated). */
  name: string;
  kind: PlaceKind;
  /** The types that live here, by type id (see typechart.ts). */
  types: readonly number[];
}

// type ids: normal 0, fighting 1, flying 2, poison 3, ground 4, rock 5, bug 6, ghost 7, steel 8, fire 9, water 10, grass 11, electric 12, psychic 13, ice 14, dragon 15, dark 16, fairy 17
export const PLACES: readonly PlaceTemplate[] = [
  { name: "Meadow", kind: "wild", types: [0, 11, 2] },
  { name: "Forest", kind: "wild", types: [6, 11, 3] },
  { name: "Cave", kind: "wild", types: [5, 4, 1] },
  { name: "Lake", kind: "wild", types: [10, 14, 0] },
  { name: "Hills", kind: "wild", types: [1, 5, 0] },
  { name: "Gym", kind: "gym", types: [] },
  { name: "Swamp", kind: "wild", types: [3, 10, 4] },
  { name: "Desert", kind: "wild", types: [4, 9, 5] },
  { name: "Haunted Tower", kind: "wild", types: [7, 13, 16] },
  { name: "Power Plant", kind: "wild", types: [12, 8, 9] },
  { name: "Victory Road", kind: "wild", types: [15, 1, 14, 8] },
  { name: "Champion", kind: "champion", types: [] },
];

export interface Place {
  /** Position in the whole walk: 0 to 59, then 60 and up for the Tower. */
  index: number;
  region: number;
  slot: number;
  name: string;
  kind: PlaceKind;
  types: readonly number[];
  tower: boolean;
}

export function place(index: number): Place {
  if (index >= ROUTE_COUNT) {
    const floor = index - ROUTE_COUNT + 1;
    return { index, region: REGION_COUNT, slot: floor, name: "Tower", kind: floor % 10 === 0 ? "gym" : "wild", types: [], tower: true };
  }
  const region = Math.floor(index / PLACES_PER_REGION);
  const slot = index % PLACES_PER_REGION;
  const t = PLACES[slot]!;
  return { index, region, slot, name: t.name, kind: t.kind, types: t.types, tower: false };
}

/** Kills needed before the next place opens. A boss has to fall once. */
export const killsToUnlock = (p: Place): number => (p.kind === "wild" ? TUNING.killsToOpen : 1);

/** Who stands on the boss's place. */
export function bossSpecies(p: Place): number {
  if (p.tower) return 1 + ((p.index * 7919) % 649); // a different one every tenth floor, the same each time
  const r = REGIONS[p.region]!;
  return p.kind === "gym" ? r.gym : r.champion;
}

// ---- who lives where -------------------------------------------------------------------------

export interface PoolEntry {
  id: number;
  /** Catch rate (how common), the part the lure bends. */
  rate: number;
  /** 4 for a creature of the place's types, 1 for any other, a quarter for those from older regions. */
  boost: number;
}

const maxStage = (slot: number): number => (slot < 3 ? 1 : slot < 7 ? 2 : 3);

function buildPool(p: Place): PoolEntry[] {
  const pool: PoolEntry[] = [];
  if (p.tower) {
    for (const s of SPECIES) if (!s.baby) pool.push({ id: s.id, rate: isSpecial(s) ? 3 : s.catchRate, boost: s.stage >= 2 ? 2 : 1 });
    return pool;
  }
  const gen = REGIONS[p.region]!.gen;
  for (const s of SPECIES) {
    if (isSpecial(s) || s.gen > gen) continue;
    if (s.stage > maxStage(p.slot)) continue;
    if (s.baby && p.slot >= 4) continue;
    // the region's own creatures, and the older ones at a quarter
    const own = s.gen === gen;
    const themed = p.types.length === 0 || s.types.some((t) => p.types.includes(t));
    pool.push({ id: s.id, rate: s.catchRate, boost: (themed ? 4 : 1) * (own ? 1 : 0.25) });
  }
  return pool;
}

const POOLS = new Map<number, PoolEntry[]>();
export function poolOf(p: Place): readonly PoolEntry[] {
  // the Tower is one pool, whichever floor
  const key = p.tower ? ROUTE_COUNT : p.index;
  let pool = POOLS.get(key);
  if (!pool) POOLS.set(key, (pool = buildPool(p)));
  return pool;
}

/** Which species can be met in the grass of a place at all (for the Pokédex hints). */
export const meetsIn = (p: Place): readonly Species[] => poolOf(p).map((e) => species(e.id));
