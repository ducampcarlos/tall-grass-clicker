/**
 * Marks: what retiring a trainer pays, spent on permanent perks in a tree of three branches.
 * A perk needs the perks it lists before it can be bought; the tree can be reset for free.
 */

import { t } from "../i18n/index.js";

export type Branch = "training" | "fortune" | "hunter";
export const BRANCHES: readonly Branch[] = ["training", "fortune", "hunter"];

export interface PerkDef {
  id: string;
  branch: Branch;
  name: string;
  text: string;
  cost: number;
  requires: readonly string[];
}

export const BRANCH_INFO: Record<Branch, { name: string; blurb: string }> = {
  training: { name: "Training", blurb: "Hit harder, hit more." },
  fortune: { name: "Fortune", blurb: "Coins and prices." },
  hunter: { name: "Hunter", blurb: "Catching, shinies and eggs." },
};

export const PERKS: readonly PerkDef[] = [
  { id: "claws", branch: "training", name: "Sharp Claws", text: "Clicks hit 25% harder.", cost: 1, requires: [] },
  { id: "rhythm", branch: "training", name: "Battle Rhythm", text: "Your party hits 25% harder.", cost: 2, requires: ["claws"] },
  { id: "eye", branch: "training", name: "Predator's Eye", text: "+10% chance of a critical click.", cost: 2, requires: ["claws"] },
  { id: "alpha", branch: "training", name: "Alpha Strike", text: "Critical clicks hit for 6 times instead of 4.", cost: 4, requires: ["rhythm", "eye"] },

  { id: "pocket", branch: "fortune", name: "Pocket Money", text: "Every run starts with 500 coins.", cost: 1, requires: [] },
  { id: "shopper", branch: "fortune", name: "Smart Shopper", text: "Upgrades cost 10% less.", cost: 2, requires: ["pocket"] },
  { id: "bargain", branch: "fortune", name: "Ball Bargain", text: "Balls and eggs cost 30% less.", cost: 2, requires: ["pocket"] },
  { id: "jackpot", branch: "fortune", name: "Jackpot", text: "Every coin you earn is worth 50% more.", cost: 4, requires: ["shopper", "bargain"] },

  { id: "scent", branch: "hunter", name: "Lucky Scent", text: "20% more chance to catch.", cost: 1, requires: [] },
  { id: "hunter", branch: "hunter", name: "Shiny Hunter", text: "Shiny creatures are 50% more common.", cost: 2, requires: ["scent"] },
  { id: "warm", branch: "hunter", name: "Warm Eggs", text: "Eggs hatch 40% faster.", cost: 2, requires: ["scent"] },
  { id: "seeker", branch: "hunter", name: "Legend Seeker", text: "Epic eggs can hatch a legendary one time in five.", cost: 4, requires: ["hunter", "warm"] },
];

const PERK_MAP = new Map(PERKS.map((p) => [p.id, p]));
export const perk = (id: string): PerkDef => {
  const found = PERK_MAP.get(id);
  if (!found) throw new Error(`Unknown perk "${id}"`);
  return found;
};
export const hasPerk = (id: string): boolean => PERK_MAP.has(id);
export const perksCost = (ids: readonly string[]): number => ids.reduce((sum, id) => sum + (PERK_MAP.get(id)?.cost ?? 0), 0);

/** Every id is known and distinct, and everything a perk needs is owned too. */
export function validPerks(ids: readonly string[]): boolean {
  if (new Set(ids).size !== ids.length) return false;
  return ids.every((id) => hasPerk(id) && perk(id).requires.every((r) => ids.includes(r)));
}

export type PerkBuy = { ok: true; perks: string[] } | { ok: false; error: string };

/** Spend marks on one more perk. `marks` is what is left to spend. */
export function buyPerk(owned: readonly string[], id: string, marks: number): PerkBuy {
  if (!hasPerk(id)) return { ok: false, error: t("No such perk.") };
  if (owned.includes(id)) return { ok: false, error: t("You already have it.") };
  const def = perk(id);
  const missing = def.requires.filter((r) => !owned.includes(r));
  if (missing.length > 0) return { ok: false, error: t("Needs {names} first.", { names: missing.map((m) => t(perk(m).name)).join(" " + t("and") + " ") }) };
  if (marks < def.cost) return { ok: false, error: t("It costs {cost} marks; you have {left}.", { cost: def.cost, left: marks }) };
  return { ok: true, perks: [...owned, id] };
}
