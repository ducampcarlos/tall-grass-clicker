/** The type chart: how well an attack of one type hits a Pokémon of another. 18 types, in the order of the data (normal = 0 ... fairy = 17). */

import { TYPE_NAMES } from "./dex.generated.js";

export type TypeId = number;
const index = (name: (typeof TYPE_NAMES)[number]): TypeId => TYPE_NAMES.indexOf(name);

// attacker -> [super effective against, not very effective against, immune]
const CHART: Record<(typeof TYPE_NAMES)[number], [string[], string[], string[]]> = {
  normal: [[], ["rock", "steel"], ["ghost"]],
  fighting: [["normal", "rock", "steel", "ice", "dark"], ["flying", "poison", "bug", "psychic", "fairy"], ["ghost"]],
  flying: [["fighting", "bug", "grass"], ["rock", "steel", "electric"], []],
  poison: [["grass", "fairy"], ["poison", "ground", "rock", "ghost"], ["steel"]],
  ground: [["poison", "rock", "steel", "fire", "electric"], ["bug", "grass"], ["flying"]],
  rock: [["flying", "bug", "fire", "ice"], ["fighting", "ground", "steel"], []],
  bug: [["grass", "psychic", "dark"], ["fighting", "flying", "poison", "ghost", "steel", "fire", "fairy"], []],
  ghost: [["ghost", "psychic"], ["dark"], ["normal"]],
  steel: [["rock", "ice", "fairy"], ["steel", "fire", "water", "electric"], []],
  fire: [["bug", "steel", "grass", "ice"], ["rock", "fire", "water", "dragon"], []],
  water: [["ground", "rock", "fire"], ["water", "grass", "dragon"], []],
  grass: [["ground", "rock", "water"], ["flying", "poison", "bug", "steel", "fire", "grass", "dragon"], []],
  electric: [["flying", "water"], ["grass", "electric", "dragon"], ["ground"]],
  psychic: [["fighting", "poison"], ["steel", "psychic"], ["dark"]],
  ice: [["flying", "ground", "grass", "dragon"], ["steel", "fire", "water", "ice"], []],
  dragon: [["dragon"], ["steel"], ["fairy"]],
  dark: [["ghost", "psychic"], ["fighting", "dark", "fairy"], []],
  fairy: [["fighting", "dragon", "dark"], ["poison", "steel", "fire"], []],
};

/** In the games an immune target takes nothing; a clicker should never deal exactly zero, so it takes a quarter. */
export const IMMUNE = 0.25;

const TABLE: number[][] = TYPE_NAMES.map(() => TYPE_NAMES.map(() => 1));
for (const [name, [strong, weak, immune]] of Object.entries(CHART)) {
  const a = index(name as (typeof TYPE_NAMES)[number]);
  for (const d of strong) TABLE[a]![index(d as (typeof TYPE_NAMES)[number])] = 2;
  for (const d of weak) TABLE[a]![index(d as (typeof TYPE_NAMES)[number])] = 0.5;
  for (const d of immune) TABLE[a]![index(d as (typeof TYPE_NAMES)[number])] = IMMUNE;
}

/** One attacking type against a target of one or two types: 0.25 to 4. */
export function effectiveness(attack: TypeId, defend: readonly TypeId[]): number {
  let m = 1;
  for (const d of defend) m *= TABLE[attack]![d]!;
  return m;
}

/** A Pokémon attacks with its best type. */
export function bestEffectiveness(attack: readonly TypeId[], defend: readonly TypeId[]): number {
  let best = 0;
  for (const a of attack) best = Math.max(best, effectiveness(a, defend));
  return best;
}
