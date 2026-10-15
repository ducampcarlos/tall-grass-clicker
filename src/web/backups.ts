/**
 * Safety copies: now and then, while you play, the game keeps a copy of your save apart from the
 * one it is playing on, and a copy is made right before anything replaces your progress. The
 * newest few are kept; the settings can put one back.
 */

import { type Imported, buildSave, parseSave } from "./savefile.js";
import { store } from "./storage.js";
import type { State } from "../engine/game.js";
import type { Profile } from "./session.js";

const KEY = "tall-grass-clicker.backups.v1";
export const MAX_BACKUPS = 5;
/** At most one copy this often (ms) while playing. */
export const BACKUP_EVERY_MS = 20 * 60 * 1000;

export interface Backup {
  /** When it was made (ms since 1970). */
  at: number;
  /** A line to recognise it by. */
  caught: number;
  furthest: number;
  playSeconds: number;
  /** The whole save file, as exported. */
  text: string;
  /** Why it was made. */
  why: "auto" | "import" | "erase";
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function listBackups(): Backup[] {
  try {
    const raw: unknown = JSON.parse(store.get(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((b): b is Backup => typeof b === "object" && b !== null && isNum(b.at) && isNum(b.caught) && isNum(b.furthest) && isNum(b.playSeconds) && typeof b.text === "string" && ["auto", "import", "erase"].includes(b.why))
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_BACKUPS);
  } catch {
    return [];
  }
}

function write(list: Backup[]): void {
  // a store that is full gives up the oldest copy rather than the new one
  for (let keep = list.length; keep >= 1; keep--) {
    store.set(KEY, JSON.stringify(list.slice(0, keep)));
    if (store.get(KEY) === JSON.stringify(list.slice(0, keep))) return;
  }
}

/** Make a copy if it is time (or `why` says it must be now). Returns whether one was made. */
export function backupNow(profile: Profile, state: State | null, why: Backup["why"], now = Date.now()): boolean {
  if (!state) return false;
  const list = listBackups();
  const last = list[0];
  if (why === "auto") {
    if (last && now - last.at < BACKUP_EVERY_MS) return false;
    if (last && last.playSeconds === state.stats.playSeconds) return false; // nothing new to keep
  }
  const copy: Backup = { at: now, caught: state.stats.caught, furthest: state.bestPlace, playSeconds: state.stats.playSeconds, text: buildSave(profile, state, new Date(now)), why };
  write([copy, ...list].slice(0, MAX_BACKUPS));
  return true;
}

/** The save inside a backup, checked like any other. */
export function readBackup(b: Backup): Imported {
  return parseSave(b.text);
}
