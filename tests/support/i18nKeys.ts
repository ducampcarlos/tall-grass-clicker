/**
 * Every English text of the game that can be translated, found in the source and in the content
 * tables, each with a short note on where it is shown. The translation tests and the script that
 * lists what is missing both read from here, so nothing has to be kept in a second list by hand.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { ACHIEVEMENTS } from "../../src/engine/achievements.js";
import { BRANCH_INFO, PERKS } from "../../src/engine/perks.js";
import { UPGRADES } from "../../src/engine/rules.js";
import { HELPERS } from "../../src/engine/helpers.js";
import { BUFFS } from "../../src/engine/items.js";
import { GAMES } from "../../src/engine/minigames.js";
import { ABOUT_LINES, HELP_LINES } from "../../src/web/help.js";

export interface Entry {
  key: string;
  /** Where the text appears: a hint for translators. */
  note: string;
}

const ROOT = join(import.meta.dirname, "..", "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "i18n" ? [] : sourceFiles(path);
    return name.endsWith(".ts") ? [path] : [];
  });
}

const DOUBLE = String.raw`"((?:[^"\\\n]|\\.)*)"`;
const TICKS = "`([^`$\\\\\\n]*)`";
const STRING = `(?:${DOUBLE}|${TICKS})`;
const unescape = (raw: string): string => JSON.parse(`"${raw}"`) as string;

/** The texts passed to t() and tn() in the code. */
export function keysInCode(): Entry[] {
  const found = new Map<string, string>();
  const single = new RegExp(`(?<![\\w.])t\\(\\s*${STRING}`, "g");
  const plural = new RegExp(`(?<![\\w.])tn\\([^,]+,\\s*${STRING}\\s*,\\s*${STRING}`, "g");
  for (const file of sourceFiles(ROOT)) {
    const source = readFileSync(file, "utf8");
    const where = file.slice(ROOT.length + 1);
    for (const m of source.matchAll(single)) found.set(m[1] !== undefined ? unescape(m[1]) : m[2]!, where);
    for (const m of source.matchAll(plural)) {
      found.set(m[1] !== undefined ? unescape(m[1]) : m[2]!, where);
      found.set(m[3] !== undefined ? unescape(m[3]) : m[4]!, where);
    }
  }
  return [...found].map(([key, where]) => ({ key, note: `interface (${where})` }));
}

/** Names and descriptions in the content tables. Creature, region and place-kind names are proper names, kept as they are. */
export function keysInContent(): Entry[] {
  const out: Entry[] = [];
  const add = (key: string | undefined, note: string) => key && out.push({ key, note });
  for (const u of UPGRADES) {
    add(u.name, "shop upgrade name");
    add(u.text, `effect of the shop upgrade ${u.name}`);
  }
  for (const b of Object.values(BRANCH_INFO)) {
    add(b.name, "perk tree branch name");
    add(b.blurb, "perk tree branch description");
  }
  for (const p of PERKS) {
    add(p.name, "perk name (bought with Marks after retiring)");
    add(p.text, `effect of the perk ${p.name}`);
  }
  for (const a of ACHIEVEMENTS) {
    add(a.name, "achievement name (each one makes everything 2% stronger)");
    add(a.text, `how to earn the achievement ${a.name}`);
  }
  for (const b of BUFFS) {
    add(b.label, "booster kind (an item that works for a while)");
    add(b.text, `what the ${b.label} does; {value} is the strength of each of its three tiers, like "2 / 3 / 5"`);
    for (const x of b.tiers) add(x.name, `name of an item of the ${b.label}, one of three tiers`);
  }
  for (const h of HELPERS) {
    add(h.name, "helper name (a chore the game takes over once unlocked)");
    add(h.text, `what the helper ${h.name} does`);
    add(h.goal, `what to do to unlock the helper ${h.name}; {n} is the number`);
  }
  for (const g of GAMES) {
    add(g.name, "mini-game name");
    add(g.text, `how to play the mini-game ${g.name}`);
  }
  for (const line of HELP_LINES) add(line, "paragraph of the How to play panel");
  for (const line of ABOUT_LINES) add(line, "paragraph of the About panel");
  return out;
}

/** All the keys, each once, in a stable order. */
export function allKeys(): Entry[] {
  const seen = new Map<string, string>();
  for (const e of [...keysInContent(), ...keysInCode()]) if (!seen.has(e.key)) seen.set(e.key, e.note);
  return [...seen].map(([key, note]) => ({ key, note }));
}

/** The `{placeholders}` of a text, sorted. */
export const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
