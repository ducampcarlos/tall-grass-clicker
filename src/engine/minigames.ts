/**
 * The mini-games: what each is, how a result turns into stars, and what the stars pay. The games
 * themselves (the rings, the cards, the questions, the moles) are drawn by the interface; what
 * they report to the engine is only a score. A game can be played again after a rest.
 */

import { BUFF_IDS, type BuffId, type Tier } from "./items.js";
import { type GameEvent, type State, giveItem, killsWorth, payCoins } from "./game.js";
import { Rng } from "./rng.js";

export type GameId = "throw" | "memory" | "quiz" | "whack";
export type Stars = 0 | 1 | 2 | 3;

export interface GameDef {
  id: GameId;
  name: string;
  text: string;
  /** Seconds of play to wait before playing it again. */
  rest: number;
  icon: string;
}

export const GAMES: readonly GameDef[] = [
  { id: "throw", name: "Capture Throw", text: "A creature from where you are stands before you. Throw when the ring is small: a good throw is a catch.", rest: 120, icon: "premier-ball" },
  { id: "memory", name: "Memory Match", text: "Find the eight pairs in as few tries as you can.", rest: 150, icon: "old-amber" },
  { id: "quiz", name: "Who's That Creature?", text: "Name eight creatures from their shadows.", rest: 150, icon: "silph-scope" },
  { id: "whack", name: "Whack-a-Mole", text: "Tap the Diglett as they pop up. Mind the Voltorb!", rest: 120, icon: "hard-stone" },
];

export const GAME_IDS: readonly GameId[] = GAMES.map((g) => g.id);
export const isGameId = (v: unknown): v is GameId => typeof v === "string" && (GAME_IDS as readonly string[]).includes(v);
export const gameDef = (id: GameId): GameDef => GAMES.find((g) => g.id === id)!;

/** The games open once you have defeated this many creatures. */
export const GAMES_OPEN_AT = 50;
export const gamesOpen = (s: State): boolean => s.stats.kills >= GAMES_OPEN_AT;

export const restLeft = (s: State, id: GameId): number => s.cooldowns[id] ?? 0;
export const canPlay = (s: State, id: GameId): boolean => gamesOpen(s) && restLeft(s, id) <= 0;

// ---- scores into stars -------------------------------------------------------------------------

/**
 * A throw's quality from the ring: `ratio` is the ring's size against its size when it starts (1 at
 * the start, down to the smallest it gets). Small is better; tapping off the creature is a miss.
 */
export function throwQuality(ratio: number, onTarget = true): 0 | 1 | 2 | 3 {
  if (!onTarget || !(ratio > 0) || ratio > 1) return 0;
  if (ratio <= 0.4) return 3;
  if (ratio <= 0.7) return 2;
  return 1;
}

/** Tries (two cards turned over) to find the eight pairs. */
export function memoryStars(tries: number): Stars {
  return tries <= 10 ? 3 : tries <= 14 ? 2 : tries <= 20 ? 1 : 0;
}

/** Right answers out of eight. */
export function quizStars(right: number): Stars {
  return right >= 7 ? 3 : right >= 5 ? 2 : right >= 3 ? 1 : 0;
}

/** Points (a Diglett is 1, a Dugtrio 3, a Voltorb takes 2 away). */
export function whackStars(points: number): Stars {
  return points >= 22 ? 3 : points >= 14 ? 2 : points >= 7 ? 1 : 0;
}

// ---- what the stars pay ------------------------------------------------------------------------

export interface Prize {
  items: Array<{ id: BuffId; tier: Tier; n: number }>;
  coins: number;
  /** Balls to the bag, by ball tier. */
  balls: Array<{ ball: 0 | 1 | 2; n: number }>;
}

/** Pay for a game played and start its rest. More stars pay more, and the better ones pay a stronger booster. */
export function awardGame(s: State, id: GameId, stars: Stars, events: GameEvent[] = []): Prize {
  void events;
  const rng = new Rng(s.rng);
  const prize: Prize = { items: [], coins: 0, balls: [] };
  const add = (buff: BuffId, tier: Tier) => {
    const found = prize.items.find((i) => i.id === buff && i.tier === tier);
    if (found) found.n++;
    else prize.items.push({ id: buff, tier, n: 1 });
  };
  const some = (): BuffId => BUFF_IDS[rng.int(BUFF_IDS.length)]!;
  if (stars === 0) prize.coins = killsWorth(s, 3);
  else if (stars === 1) {
    add(some(), 1);
    prize.coins = killsWorth(s, 10);
  } else if (stars === 2) {
    add(some(), 1);
    add(some(), rng.chance(0.25) ? 2 : 1);
    prize.coins = killsWorth(s, 25);
    prize.balls.push({ ball: 1, n: 5 });
  } else {
    add(some(), rng.chance(0.2) ? 3 : 2);
    add(some(), 1);
    prize.coins = killsWorth(s, 50);
    prize.balls.push({ ball: 2, n: 3 });
  }
  s.rng = rng.state;
  payCoins(s, prize.coins);
  for (const i of prize.items) giveItem(s, i.id, i.tier, i.n);
  for (const b of prize.balls) s.balls[b.ball] = (s.balls[b.ball] ?? 0) + b.n;
  s.stats.games++;
  const rest = gameDef(id).rest;
  s.cooldowns[id] = stars === 0 ? Math.ceil(rest / 3) : rest;
  return prize;
}
