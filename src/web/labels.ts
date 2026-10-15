/** Names and colours shown to the player, in one place so the translation tests can see them. */

import { t } from "../i18n/index.js";
import { BALLS, type BallId, type EggTier } from "../engine/rules.js";
import { type Place, REGIONS } from "../engine/regions.js";

export const TYPE_COLORS = ["#a8a878", "#c03028", "#a890f0", "#a040a0", "#c8a848", "#b8a038", "#a8b820", "#705898", "#8888a8", "#f08030", "#6890f0", "#78c850", "#e8c020", "#f85888", "#78c8c8", "#7038f8", "#705848", "#ee99ac"] as const;

/** The type names, translated, in the order of the data. */
export function typeLabels(): string[] {
  return [t("Normal"), t("Fighting"), t("Flying"), t("Poison"), t("Ground"), t("Rock"), t("Bug"), t("Ghost"), t("Steel"), t("Fire"), t("Water"), t("Grass"), t("Electric"), t("Psychic"), t("Ice"), t("Dragon"), t("Dark"), t("Fairy")];
}
export const typeLabel = (type: number): string => typeLabels()[type] ?? "?";

export function ballLabel(ball: BallId): string {
  return { ball: t("Capture Ball"), great: t("Great Ball"), ultra: t("Ultra Ball"), master: t("Master Ball") }[ball];
}
export const ballLabels = (): string[] => BALLS.map(ballLabel);

export function eggLabel(tier: EggTier): string {
  return [t("Basic Egg"), t("Rare Egg"), t("Epic Egg"), t("Legendary Egg")][tier]!;
}

/** The names of the twelve kinds of place, translated. */
export function placeName(name: string): string {
  const names: Record<string, string> = {
    Meadow: t("Meadow"), Forest: t("Forest"), Cave: t("Cave"), Lake: t("Lake"), Hills: t("Hills"), Gym: t("Gym"), Swamp: t("Swamp"), Desert: t("Desert"),
    "Haunted Tower": t("Haunted Tower"), "Power Plant": t("Power Plant"), "Victory Road": t("Victory Road"), Champion: t("Champion"), Tower: t("Tower"),
  };
  return names[name] ?? name;
}

/** "Kanto · Meadow", or "Tower · floor 7". */
export function placeTitle(p: Place): string {
  if (p.tower) return `${t("Tower")} · ${t("Floor {n}", { n: p.slot })}`;
  return `${REGIONS[p.region]!.name} · ${placeName(p.name)}`;
}
