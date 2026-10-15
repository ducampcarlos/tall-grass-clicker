/**
 * Where the creatures' pictures come from. They are the animated Black & White sprites of the first
 * five generations, kept in docs/assets/sprites/ (see SPRITES-NOTICE.md). If a file is missing the
 * picture is asked from the PokeAPI sprites repository instead, so the game still works if the local
 * copies are ever removed.
 */

import { MAX_SPECIES } from "../engine/dex.js";

const REMOTE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions";

export type SpriteKind = "normal" | "shiny" | "icon";

export function spriteUrl(id: number, kind: SpriteKind): string {
  return `assets/sprites/${kind}/${id}.${kind === "icon" ? "png" : "gif"}`;
}

export function remoteUrl(id: number, kind: SpriteKind): string {
  if (kind === "icon") return `${REMOTE}/generation-vii/icons/${id}.png`;
  return `${REMOTE}/generation-v/black-white/animated/${kind === "shiny" ? "shiny/" : ""}${id}.gif`;
}

/** An <img> of a creature, which falls back to the remote copy once if the local one cannot be loaded. */
export function spriteImg(id: number, kind: SpriteKind, className = "", alt = ""): HTMLImageElement {
  const img = new Image();
  img.className = className;
  img.alt = alt;
  img.decoding = "async";
  img.draggable = false;
  let triedRemote = false;
  img.addEventListener("error", () => {
    if (triedRemote) return;
    triedRemote = true;
    img.src = remoteUrl(id, kind);
  });
  img.src = spriteUrl(id, kind);
  return img;
}

/** Draw a sprite at a whole multiple of its own size, so the pixels stay square, within a box. */
export function scaleSprite(img: HTMLImageElement, factor: number, maxWidth: number, maxHeight: number): void {
  const apply = () => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return;
    let k = factor;
    while (k > 1 && (w * k > maxWidth || h * k > maxHeight)) k--;
    img.style.width = `${w * k}px`;
    img.style.height = `${h * k}px`;
    img.style.maxHeight = "none";
  };
  if (img.complete && img.naturalWidth) apply();
  else img.addEventListener("load", apply, { once: true });
}

/** Point an existing <img> at another creature. */
export function setSprite(img: HTMLImageElement, id: number, kind: SpriteKind): void {
  const src = spriteUrl(id, kind);
  if (img.dataset.sprite === src) return;
  img.dataset.sprite = src;
  img.src = src;
  img.onerror = () => {
    img.onerror = null;
    img.src = remoteUrl(id, kind);
  };
}

/** Warm the cache with the pictures that are about to be needed. */
export function preload(ids: Iterable<number>, kind: SpriteKind): void {
  for (const id of ids) if (id >= 1 && id <= MAX_SPECIES) new Image().src = spriteUrl(id, kind);
}
