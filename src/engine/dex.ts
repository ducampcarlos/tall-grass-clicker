/** The creatures: the generated table of Gen 1-5 turned into something to work with. */

import { DEX_ROWS, TYPE_NAMES } from "./dex.generated.js";

export const MAX_SPECIES = 649;
export { TYPE_NAMES };

export interface Species {
  id: number;
  name: string;
  /** One or two type ids (see typechart.ts). */
  types: readonly number[];
  /** Base stat total: the strength of the species in the games, 180 to 720. */
  bst: number;
  catchRate: number;
  gen: number;
  /** The species it evolves from, or 0. */
  from: number;
  /** The level it evolves at (0 when it does not evolve from anything). */
  evoLevel: number;
  legendary: boolean;
  mythical: boolean;
  baby: boolean;
  /** 1 for a first form, 2 and 3 for evolutions. */
  stage: number;
}

export const SPECIES: readonly Species[] = DEX_ROWS.map(([id, name, t1, t2, bst, catchRate, gen, from, evoLevel, flags, stage]) => ({
  id,
  name,
  types: t2 >= 0 ? [t1, t2] : [t1],
  bst,
  catchRate,
  gen,
  from,
  evoLevel,
  legendary: (flags & 1) !== 0,
  mythical: (flags & 2) !== 0,
  baby: (flags & 4) !== 0,
  stage,
}));

export const species = (id: number): Species => {
  const found = SPECIES[id - 1];
  if (!found) throw new Error(`Unknown species ${id}`);
  return found;
};
export const hasSpecies = (id: unknown): id is number => typeof id === "number" && Number.isInteger(id) && id >= 1 && id <= MAX_SPECIES;

/** The species that evolve directly from this one (Eevee has several). */
const CHILDREN = new Map<number, number[]>();
for (const s of SPECIES) if (s.from) (CHILDREN.get(s.from) ?? CHILDREN.set(s.from, []).get(s.from)!).push(s.id);
export const evolutionsOf = (id: number): readonly number[] => CHILDREN.get(id) ?? [];

/** The first form of a family. */
export function rootOf(id: number): number {
  let s = species(id);
  while (s.from) s = species(s.from);
  return s.id;
}

/** Legendary and mythical species never walk the grass: they come out of eggs and bosses. */
export const isSpecial = (s: Species): boolean => s.legendary || s.mythical;

export const isStarterLine = (id: number): boolean => [1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501].includes(rootOf(id));

/** What a creature hits for at level 1 before anything else: stronger species hit much harder than weak ones. */
export const basePower = (s: Species): number => (s.bst / 100) ** 1.6;

export const typeName = (type: number): string => TYPE_NAMES[type] ?? "normal";
