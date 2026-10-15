/**
 * The save file: the whole progress of a player (settings and the game) as one JSON document they
 * can keep, move to another browser or put back. It is read like any untrusted input: the game is
 * checked field by field by the same code that checks what comes out of the browser's storage.
 */

import { t } from "../i18n/index.js";
import type { State } from "../engine/game.js";
import { parseState } from "../engine/save.js";
import { type Profile, parseProfile } from "./session.js";

export const SAVE_GAME = "tall-grass-clicker";
export const SAVE_FORMAT = 1;
/** A real save is a few tens of kilobytes; anything much bigger is not one. */
export const MAX_SAVE_BYTES = 2 * 1024 * 1024;

export interface SaveFile {
  game: typeof SAVE_GAME;
  format: typeof SAVE_FORMAT;
  /** When it was exported (ISO 8601). */
  exported: string;
  profile: Profile;
  state: State | null;
}

export function buildSave(profile: Profile, state: State | null, now = new Date()): string {
  const file: SaveFile = { game: SAVE_GAME, format: SAVE_FORMAT, exported: now.toISOString(), profile, state };
  return JSON.stringify(file);
}

export type Imported = { ok: true; profile: Profile; state: State | null; exported: string } | { ok: false; error: string };

export function parseSave(text: string): Imported {
  if (text.length > MAX_SAVE_BYTES) return { ok: false, error: t("That file is too big to be a save.") };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: t("That file is not a Tall Grass Clicker save.") };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: t("That file is not a Tall Grass Clicker save.") };
  const file = raw as Record<string, unknown>;
  if (file.game !== SAVE_GAME) return { ok: false, error: t("That file is not a Tall Grass Clicker save.") };
  if (file.format !== SAVE_FORMAT) return { ok: false, error: t("That save comes from a different version of the game.") };
  if (typeof file.profile !== "object" || file.profile === null || Array.isArray(file.profile)) return { ok: false, error: t("That save has no progress in it.") };
  // parseProfile keeps what is valid and drops what is not, so damaged settings still give usable ones
  const profile = parseProfile(JSON.stringify(file.profile));
  let state: State | null = null;
  if (file.state !== null && file.state !== undefined) {
    state = parseState(JSON.stringify(file.state));
    if (state === null) return { ok: false, error: t("The game inside that save is damaged.") };
  }
  return { ok: true, profile, state, exported: typeof file.exported === "string" ? file.exported.slice(0, 40) : "" };
}
