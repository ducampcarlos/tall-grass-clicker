import { type State, chooseStarter, newGame, spawn } from "../src/engine/game.js";

/** A game with Charmander (4) as the partner, at the first place with a creature waiting. */
export function fresh(seed = 1, starter = 4): State {
  const s = newGame(seed);
  chooseStarter(s, starter);
  spawn(s);
  return s;
}

/** Make a creature the wild one in front of the party, at full health. */
export function setWild(s: State, sp: number, options: { hp?: number; shiny?: boolean; boss?: boolean; timer?: number } = {}): void {
  const hp = options.hp ?? 100;
  s.wild = { sp, hp, maxHp: hp, level: 5, shiny: options.shiny ?? false, boss: options.boss ?? false, timer: options.timer ?? 0 };
}

/** Own a creature at a level, as if it had been caught. */
export function own(s: State, sp: number, level = 1, shiny = false): void {
  const e = (s.dex[sp] ??= { seen: true, caught: false, shiny: false, level: 1, xp: 0, candy: 0, pity: 0 });
  if (!e.caught) s.stats.caught++;
  e.seen = true;
  e.caught = true;
  e.level = level;
  if (shiny && !e.shiny) {
    e.shiny = true;
    s.stats.shinies++;
  }
}
