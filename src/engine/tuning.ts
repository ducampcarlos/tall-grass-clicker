/** The dials the balance bot turns (npm run balance). The game reads them every time, so a sweep can change them. */
export const TUNING = {
  hpBase: 900,
  hpGrowth: 1.18,
  coinShare: 0.28,
  /** How much of each upgrade level counts. */
  upgradePower: 0.05,
  /** Kills needed in an ordinary place before the next opens. */
  killsToOpen: 12,
  bossHp: { gym: 2.5, champion: 4, tower: 3 } as Record<"gym" | "champion" | "tower", number>,
};
