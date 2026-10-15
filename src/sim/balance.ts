/**
 * Balance report: plays the game with the bot and prints how long each milestone takes.
 *
 *   npm run balance                 3 clicks a second, 10 hours
 *   npm run balance -- 0 24         idle (no clicks), 24 hours
 *   npm run balance -- 3 10 retire  retires whenever it pays 10 marks or more
 */
import { formatDuration, formatNumber } from "../engine/format.js";
import { dps, upgradeLevel } from "../engine/game.js";
import { playBot } from "./bot.js";

const cps = Number(process.argv[2] ?? 3);
const hours = Number(process.argv[3] ?? 10);
const retireAt = process.argv[4] === "retire" ? Number(process.argv[5] ?? 10) : Infinity;

const run = playBot({ cps, horizon: hours * 3600, retireAt });
console.log(`Bot: ${cps} clicks/s, ${hours} h${retireAt < Infinity ? `, retires at ${retireAt} marks` : ""}\n`);
console.log("place  time        caught  coins      party");
for (const m of run.milestones) console.log(`${String(m.place).padStart(5)}  ${formatDuration(m.seconds).padEnd(10)}  ${String(m.caught).padStart(6)}  ${formatNumber(m.coins).padEnd(9)}  ${m.party}`);
for (const r of run.retires) console.log(`retired after ${formatDuration(r.seconds)} at place ${r.place}: ${r.marks} marks`);
const s = run.state;
console.log(`\nEnd: place ${s.maxPlace} (best ${s.bestPlace}), ${s.stats.caught} caught, ${s.stats.shinies} shiny, rank ${s.rank}, dps ${formatNumber(dps(s))}, kills ${formatNumber(s.stats.kills)}`);
console.log("upgrades: " + Object.entries(s.upgrades).map(([k, v]) => `${k} ${v}`).join(", "));
void upgradeLevel;
