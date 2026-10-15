/**
 * The small item icons and gym badges of the interface, kept in docs/assets/items/ and
 * docs/assets/badges/ (see assets/sprites/NOTICE.md). Like the creatures, a missing file is asked
 * from the PokeAPI sprites repository instead, so the game works if the local copies are removed.
 */

import type { BallId } from "../engine/rules.js";

const REMOTE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites";

function icon(kind: "items" | "badges", name: string, className: string): HTMLImageElement {
  const img = new Image();
  img.className = `ico ${kind === "badges" ? "badge" : ""} ${className}`.trim();
  img.alt = "";
  img.decoding = "async";
  img.draggable = false;
  img.addEventListener("error", () => (img.src = `${REMOTE}/${kind}/${name}.png`), { once: true });
  img.src = `assets/${kind}/${name}.png`;
  return img;
}

/** An item icon: 30 pixels, drawn crisp. */
export const itemImg = (name: string, className = ""): HTMLImageElement => icon("items", name, className);

/** A gym badge. */
export const badgeImg = (id: number, className = ""): HTMLImageElement => icon("badges", String(id), className);

export const BALL_ICON: Record<BallId, string> = { ball: "poke-ball", great: "great-ball", ultra: "ultra-ball", master: "master-ball" };

export const UPGRADE_ICON: Record<string, string> = {
  slots: "poke-doll", incubator: "mystery-egg", click: "lucky-punch", train: "macho-brace", crit: "scope-lens", auto: "bicycle",
  coins: "amulet-coin", catch: "net-ball", lure: "honey", shiny: "shiny-charm", xp: "exp-share",
};

export const PERK_ICON: Record<string, string> = {
  claws: "dragon-fang", rhythm: "soothe-bell", eye: "choice-band", alpha: "muscle-band",
  pocket: "nugget", shopper: "coin-case", bargain: "lure-ball", jackpot: "gold-bottle-cap",
  scent: "max-repel", hunter: "oval-charm", warm: "mystery-egg", seeker: "old-amber",
};

export const HELPER_ICON: Record<string, string> = { stocker: "poke-ball", hatchery: "mystery-egg", coach: "focus-band", shopkeeper: "coin-case", sorter: "rare-candy", net: "net-ball", belt: "berry-pouch" };

export const TAB_ICON: Record<string, string> = { shop: "super-potion", dex: "poke-ball", eggs: "mystery-egg", world: "town-map", bag: "berry-pouch", games: "poke-flute", trainer: "coin-case" };

/** The badge each region's gym leader gives. */
export const REGION_BADGE = [4, 11, 19, 28, 37] as const;
