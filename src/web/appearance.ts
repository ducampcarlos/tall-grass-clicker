/**
 * How the game looks to each player: the colours, the pictures behind the battle and the page, the
 * size of everything, how numbers are written, and whether things move. The choices live in the
 * profile; this turns them into classes and variables on the page.
 */

import { NUMBER_STYLES, type NumberStyle, setNumberStyle } from "../engine/format.js";
import type { Profile } from "./session.js";

export const THEMES = ["night", "red", "forest", "twilight", "ocean"] as const;
export type Theme = (typeof THEMES)[number];
export const PAGE_BACKGROUNDS = ["dim", "bright", "off"] as const;
export type PageBackground = (typeof PAGE_BACKGROUNDS)[number];
export const BIOME_NAMES = ["meadow", "forest", "cave", "lake", "hills", "gym", "swamp", "desert", "haunted", "power", "victory", "champion", "tower"] as const;
export type Biome = (typeof BIOME_NAMES)[number];
/** The picture behind the battle: the place's own ("auto") or one chosen for good. */
export type Scene = "auto" | Biome;
export const UI_SCALES = [0.9, 1, 1.15, 1.3] as const;
export type UiScale = (typeof UI_SCALES)[number];

export const isTheme = (v: unknown): v is Theme => (THEMES as readonly unknown[]).includes(v);
export const isPageBackground = (v: unknown): v is PageBackground => (PAGE_BACKGROUNDS as readonly unknown[]).includes(v);
export const isScene = (v: unknown): v is Scene => v === "auto" || (BIOME_NAMES as readonly unknown[]).includes(v);
export const isUiScale = (v: unknown): v is UiScale => (UI_SCALES as readonly unknown[]).includes(v);
export { NUMBER_STYLES };
export type { NumberStyle };

/** The scene the player chose, for the battle and the page to ask. */
let chosenScene: Scene = "auto";
export const getScene = (): Scene => chosenScene;

/** Put the profile's choices on the page. Safe to call as often as it changes. */
export function applyAppearance(profile: Profile, root: HTMLElement = document.documentElement): void {
  chosenScene = profile.scene;
  setNumberStyle(profile.numberFormat);
  root.dataset.theme = profile.theme;
  root.dataset.pageBackground = profile.pageBackground;
  root.style.setProperty("--ui-zoom", String(profile.uiScale));
  root.classList.toggle("reduce-motion", profile.reduceMotion);
  root.classList.toggle("big-creatures", profile.bigCreatures);
}
