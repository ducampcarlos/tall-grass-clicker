/**
 * Helpers: chores the game takes over once you have done enough of them yourself. Each one opens
 * with progress (so something is always being worked toward), starts on when it opens, and can be
 * switched off in the Trainer tab. They only work while you play, like boosters.
 */

import { MAX_LEVEL, UPGRADES } from "./rules.js";
import {
  type GameEvent, type State, bestParty, buyBall, buyUpgrade, ballPrice, canRetire, eggSlots, incubate, itemCount, marksFor, partySlots, retire, setParty, upgradePrice, useCandy, useItem,
} from "./game.js";

export type HelperId = "stocker" | "shopkeeper" | "hatchery" | "coach" | "sorter" | "net" | "belt" | "veteran";

export interface HelperDef {
  id: HelperId;
  name: string;
  text: string;
  /** What you do to open it, with {n} for the goal. */
  goal: string;
  need: number;
  read: (s: State) => number;
  /** Starts switched off when it opens (for the one that does something big). */
  startsOff?: boolean;
}

export const HELPERS: readonly HelperDef[] = [
  { id: "stocker", name: "Ball Stocker", text: "Keeps 30 Capture Balls and 10 Great Balls in the bag, when that costs less than a quarter of your coins.", goal: "Defeat {n} creatures", need: 1000, read: (s) => s.stats.kills },
  { id: "hatchery", name: "Hatchery", text: "Puts the eggs in your bag into empty incubators, the best ones first.", goal: "Hatch {n} eggs", need: 10, read: (s) => s.stats.hatched },
  { id: "coach", name: "Coach", text: "Keeps your strongest creatures in the party.", goal: "Catch {n} different creatures", need: 100, read: (s) => s.stats.caught },
  { id: "shopkeeper", name: "Shopkeeper", text: "Buys the cheapest upgrade for you, when it costs less than half your coins.", goal: "Defeat {n} creatures", need: 3000, read: (s) => s.stats.kills },
  { id: "sorter", name: "Candy Sorter", text: "Feeds your party the candy it has, ten at a time.", goal: "Catch {n} different creatures", need: 150, read: (s) => s.stats.caught },
  { id: "net", name: "Collector's Net", text: "Gathers the passing creatures for you.", goal: "Tap {n} passing creatures", need: 10, read: (s) => s.stats.roamers },
  { id: "veteran", name: "Veteran", text: "Retires for you when you keep failing at the same boss and retiring pays at least a fifth more Marks than you hold. Off until you switch it on.", goal: "Retire {n} times", need: 3, read: (s) => s.rank, startsOff: true },
  { id: "belt", name: "Booster Belt", text: "Uses another booster of the same kind when one runs out.", goal: "Play {n} mini-games", need: 8, read: (s) => s.stats.games },
];

export const HELPER_IDS: readonly HelperId[] = HELPERS.map((h) => h.id);
export const isHelperId = (v: unknown): v is HelperId => typeof v === "string" && (HELPER_IDS as readonly string[]).includes(v);
export const helperDef = (id: HelperId): HelperDef => HELPERS.find((h) => h.id === id)!;

export const helperUnlocked = (s: State, id: HelperId): boolean => s.settings.helpers[id] !== undefined;
export const helperOn = (s: State, id: HelperId): boolean => s.settings.helpers[id] === true;
export const helperProgress = (s: State, id: HelperId): { have: number; need: number } => {
  const h = helperDef(id);
  return { have: Math.min(h.need, Math.floor(h.read(s))), need: h.need };
};

export function setHelper(s: State, id: HelperId, on: boolean): boolean {
  if (!helperUnlocked(s, id)) return false;
  s.settings.helpers[id] = on;
  return true;
}

const clocks = new WeakMap<State, Record<string, number>>();
const fails = new WeakMap<State, { place: number; count: number }>();

/** Run the helpers for `dt` seconds of play: open the ones that have been earned and do their chores. `events` are the tick's, to see which boosters ran out. */
export function tickHelpers(s: State, dt: number, events: GameEvent[]): GameEvent[] {
  const out: GameEvent[] = [];
  const clock = clocks.get(s) ?? clocks.set(s, {}).get(s)!;
  const due = (name: string, every: number): boolean => {
    clock[name] = (clock[name] ?? 0) + dt;
    if (clock[name]! < every) return false;
    clock[name] = 0;
    return true;
  };

  if (due("unlock", 1)) {
    for (const h of HELPERS) {
      if (s.settings.helpers[h.id] === undefined && h.read(s) >= h.need) {
        s.settings.helpers[h.id] = !h.startsOff;
        out.push({ t: "helperUnlocked", id: h.id });
      }
    }
  }

  // the veteran: three failures in a row at one boss, and retiring worth it
  for (const e of events) {
    if (e.t !== "bossFailed") continue;
    const f = fails.get(s) ?? { place: -1, count: 0 };
    f.count = f.place === e.place ? f.count + 1 : 1;
    f.place = e.place;
    fails.set(s, f);
    if (helperOn(s, "veteran") && f.count >= 3 && canRetire(s) && marksFor(s) >= Math.max(1, Math.ceil(s.marksTotal * 0.2))) {
      const paid = marksFor(s);
      if (retire(s).ok) {
        out.push({ t: "autoRetired", paid });
        fails.delete(s);
      }
    }
  }
  if (helperOn(s, "belt")) {
    for (const e of events) {
      if (e.t === "buffEnded" && itemCount(s, e.id, e.tier) > 0) useItem(s, e.id, e.tier);
    }
  }
  if (helperOn(s, "hatchery") && due("hatchery", 2)) {
    while (s.eggs.length < eggSlots(s)) {
      const tier = [3, 2, 1, 0].find((k) => (s.bag[k] ?? 0) > 0) as 0 | 1 | 2 | 3 | undefined;
      if (tier === undefined || !incubate(s, tier).ok) break;
    }
  }
  if (helperOn(s, "stocker") && due("stocker", 3)) {
    for (const [ball, index, target] of [["ball", 0, 30], ["great", 1, 10]] as const) {
      const need = target - (s.balls[index] ?? 0);
      if (need <= 0) continue;
      const price = ballPrice(s, ball);
      const n = Math.min(need, Math.floor((s.coins * 0.25) / price));
      if (n > 0) buyBall(s, ball, n);
    }
  }
  if (helperOn(s, "shopkeeper") && due("shopkeeper", 2)) {
    for (let i = 0; i < 5; i++) {
      let best: { id: string; price: number } | null = null;
      for (const id of ["slots", "incubator", ...UPGRADES.map((u) => u.id)]) {
        const price = upgradePrice(s, id);
        if (price !== null && (best === null || price < best.price)) best = { id, price };
      }
      if (!best || best.price > s.coins * 0.5 || !buyUpgrade(s, best.id).ok) break;
    }
  }
  if (helperOn(s, "coach") && due("coach", 10)) {
    const best = bestParty(s);
    const same = best.length === s.party.length && best.every((id) => s.party.includes(id));
    if (!same) {
      const kept = s.party.filter((id) => best.includes(id));
      s.party = kept.length > 0 ? kept : [];
      for (const id of best) if (!s.party.includes(id) && s.party.length < partySlots(s)) setParty(s, s.party.length, id);
    }
  }
  if (helperOn(s, "sorter") && due("sorter", 5)) {
    for (const id of s.party) {
      const e = s.dex[id];
      if (e && e.candy >= 10 && e.level < MAX_LEVEL) useCandy(s, id, Math.floor(e.candy / 10) * 10, out);
    }
  }
  return out;
}
