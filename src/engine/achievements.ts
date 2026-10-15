/**
 * Achievements: rules over the state of the game, each worth a little more of everything.
 * They are checked about once a second and never taken back.
 */

import type { State } from "./game.js";
import { REGIONS, ROUTE_COUNT } from "./regions.js";

export interface AchievementDef {
  id: string;
  name: string;
  text: string;
  test: (s: State) => boolean;
}

/** Each achievement adds this much to every coin and every hit. */
export const ACHIEVEMENT_BONUS = 0.02;

const tiers = (id: string, names: readonly string[], goals: readonly number[], text: (n: string) => string, read: (s: State) => number): AchievementDef[] =>
  goals.map((goal, i) => ({ id: `${id}-${goal}`, name: names[i]!, text: text(goal.toLocaleString("en-US")), test: (s) => read(s) >= goal }));

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  ...tiers("clicks", ["First Touch", "Busy Fingers", "Click Machine", "Carpal Tunnel"], [100, 1_000, 10_000, 100_000], (n) => `Click ${n} times.`, (s) => s.stats.clicks),
  ...tiers("kills", ["Rookie Trainer", "Veteran", "Exterminator", "Legend of the Grass", "Ruler of the Wild"], [50, 500, 5_000, 50_000, 500_000], (n) => `Defeat ${n} wild creatures.`, (s) => s.stats.kills),
  ...tiers("caught", ["Collector", "Enthusiast", "Dex Hunter", "Kanto Complete", "Halfway There", "Almost Everything", "Gotta Catch Them All"], [5, 25, 75, 151, 325, 500, 649], (n) => `Catch ${n} different creatures.`, (s) => s.stats.caught),
  ...tiers("shiny", ["Something Sparkles", "Shiny Hunter", "Glitter Bomb", "Rainbow Dex"], [1, 5, 25, 100], (n) => (n === "1" ? "Own a shiny creature." : `Own ${n} shiny creatures.`), (s) => s.stats.shinies),
  ...tiers("evolved", ["It's Evolving!", "Growing Family", "Evolution Expert"], [1, 25, 100], (n) => (n === "1" ? "Evolve once." : `Evolve ${n} times.`), (s) => s.stats.evolved),
  ...tiers("hatched", ["Cracked Open", "Egg Collector", "Hatchery"], [1, 25, 100], (n) => (n === "1" ? "Hatch an egg." : `Hatch ${n} eggs.`), (s) => s.stats.hatched),
  ...tiers("legend", ["Mythical Encounter", "Legend Collector"], [1, 10], (n) => (n === "1" ? "Catch a legendary or mythical creature." : `Catch ${n} legendary or mythical creatures.`), (s) => s.stats.legendary),
  ...tiers("coins", ["Pocket Change", "Rich Trainer", "Tycoon", "Dragon's Hoard"], [1e6, 1e9, 1e12, 1e15], (n) => `Earn ${n} coins in total.`, (s) => s.lifetimeCoins),
  ...tiers("rank", ["Retired", "Seasoned Veteran", "Hall of Fame"], [1, 3, 10], (n) => (n === "1" ? "Retire once." : `Retire ${n} times.`), (s) => s.rank),
  ...tiers("tower", ["Tower Climber", "Tower Master", "Skybound"], [10, 50, 100], (n) => `Reach floor ${n} of the Tower.`, (s) => Math.max(0, s.bestPlace - ROUTE_COUNT + 1)),
  ...REGIONS.map<AchievementDef>((r) => ({ id: `champion-${r.id}`, name: `Champion of ${r.name}`, text: `Defeat the champion of ${r.name}.`, test: (s) => s.champions[r.id] === true })),
  { id: "gym", name: "Badge Collector", text: "Defeat a gym leader.", test: (s) => s.stats.bosses >= 1 },
  { id: "crit", name: "Critical Hit!", text: "Land 100 critical clicks.", test: (s) => s.stats.crits >= 100 },
  { id: "party", name: "Full Team", text: "Fill all six party slots.", test: (s) => s.party.length >= 6 },
  { id: "master", name: "Trophy Ball", text: "Catch something with a Master Ball.", test: (s) => s.stats.masterCatches >= 1 },
];

const MAP = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
export const achievement = (id: string): AchievementDef | undefined => MAP.get(id);
export const hasAchievement = (id: string): boolean => MAP.has(id);
