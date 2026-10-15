/**
 * Everything that outlives the screen: the game being played, the player's settings, and their
 * storage. Storage can be blocked (private windows), so every access goes through the store, which
 * copes with that, and the game works without it.
 */

import { type Lang, isLang } from "../i18n/index.js";
import { type State, newGame } from "../engine/game.js";
import { parseState, serializeState } from "../engine/save.js";
import { store } from "./storage.js";

const GAME_KEY = "tall-grass-clicker.game.v1";
const PROFILE_KEY = "tall-grass-clicker.profile.v1";

export interface Profile {
  /** The language chosen in the settings; null until the player chooses, and then the browser's decides. */
  lang: Lang | null;
  muted: boolean;
  musicVolume: number;
  sfxVolume: number;
  /** Show the shiny picture of a creature that has one. */
  showShiny: boolean;
  /** The welcome panel has been seen. */
  seenIntro: boolean;
  /** Floating damage numbers. */
  numbers: boolean;
}

const emptyProfile = (): Profile => ({ lang: null, muted: false, musicVolume: 0.4, sfxVolume: 0.8, showShiny: true, seenIntro: false, numbers: true });

export function parseProfile(text: string | null): Profile {
  const base = emptyProfile();
  if (!text) return base;
  try {
    const raw = JSON.parse(text) as Partial<Record<keyof Profile, unknown>> | null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
    if (isLang(raw.lang)) base.lang = raw.lang;
    if (typeof raw.muted === "boolean") base.muted = raw.muted;
    if (typeof raw.musicVolume === "number" && raw.musicVolume >= 0 && raw.musicVolume <= 1) base.musicVolume = raw.musicVolume;
    if (typeof raw.sfxVolume === "number" && raw.sfxVolume >= 0 && raw.sfxVolume <= 1) base.sfxVolume = raw.sfxVolume;
    if (typeof raw.showShiny === "boolean") base.showShiny = raw.showShiny;
    if (typeof raw.seenIntro === "boolean") base.seenIntro = raw.seenIntro;
    if (typeof raw.numbers === "boolean") base.numbers = raw.numbers;
    return base;
  } catch {
    return base;
  }
}

export class Session {
  profile: Profile = parseProfile(store.get(PROFILE_KEY));
  state: State | null = null;
  /** Seconds the player was away when this session loaded the game (for the welcome-back panel). */
  awaySeconds = 0;

  constructor() {
    const saved = store.get(GAME_KEY);
    if (saved) {
      const state = parseState(saved);
      if (state) {
        this.state = state;
        if (state.savedAt > 0) this.awaySeconds = Math.max(0, (Date.now() - state.savedAt) / 1000);
      } else store.set(GAME_KEY, null); // damaged: better a new game than a game that cannot start
    }
  }

  /** A new game with a seed from the clock. */
  start(): State {
    this.state = newGame((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
    this.save();
    return this.state;
  }

  save(): void {
    if (!this.state) return;
    this.state.savedAt = Date.now();
    store.set(GAME_KEY, serializeState(this.state));
  }

  saveProfile(): void {
    store.set(PROFILE_KEY, JSON.stringify(this.profile));
  }

  /** Put an imported save in place of everything. */
  restore(profile: Profile, state: State | null): void {
    this.profile = profile;
    this.state = state;
    this.saveProfile();
    if (state) {
      state.savedAt = Date.now();
      store.set(GAME_KEY, serializeState(state));
    } else store.set(GAME_KEY, null);
  }

  /** Forget the game (not the settings). */
  erase(): void {
    this.state = null;
    store.set(GAME_KEY, null);
  }
}
