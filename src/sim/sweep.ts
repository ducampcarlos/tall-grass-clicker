/** Tries combinations of the balance dials and prints how long the milestones take. Usage: node --import tsx src/sim/sweep.ts [cps] [hours] */
import { formatDuration } from "../engine/format.js";
import { TUNING } from "../engine/tuning.js";
import { playBot } from "./bot.js";

const cps = Number(process.argv[2] ?? 3);
const hours = Number(process.argv[3] ?? 24);
const MARKS = [6, 12, 18, 24, 30, 36, 42, 48, 54, 60];

export function sweep(configs: Array<Partial<typeof TUNING> & { name?: string }>): void {
  const base = structuredClone(TUNING);
  for (const c of configs) {
    Object.assign(TUNING, structuredClone(base), c);
    const run = playBot({ cps, horizon: hours * 3600 });
    const at = (n: number) => run.milestones.find((m) => m.place >= n)?.seconds;
    console.log(
      `${(c.name ?? JSON.stringify(c)).padEnd(46)} ` + MARKS.map((n) => `${n}: ${at(n) === undefined ? "-" : formatDuration(at(n)!)}`.padEnd(9)).join(" ") + ` | max ${run.state.maxPlace} caught ${run.state.stats.caught}`,
    );
  }
  Object.assign(TUNING, base);
}

const configs: Array<Partial<typeof TUNING> & { name?: string }> = [];
for (const g of [1.17, 1.19, 1.21]) for (const boss of [{ gym: 2, champion: 3.5, tower: 2.5 }, { gym: 2.5, champion: 5, tower: 3 }]) configs.push({ name: `g ${g} boss x${boss.champion}`, hpGrowth: g, bossHp: boss });
sweep(configs);
