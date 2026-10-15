/**
 * The trainer card: a picture of the player's party, Pokédex and badges to save and share, drawn on a
 * canvas from the same sprites and backgrounds the game uses.
 */

import { t } from "../i18n/index.js";
import { formatDuration, formatNumber } from "../engine/format.js";
import { ACHIEVEMENTS } from "../engine/achievements.js";
import { type State, globalMult } from "../engine/game.js";
import { PLACES_PER_REGION, REGIONS, place } from "../engine/regions.js";
import { MAX_SPECIES } from "../engine/dex.js";
import { REGION_BADGE } from "./icons.js";
import { placeTitle } from "./labels.js";
import { remoteUrl, spriteUrl } from "./sprites.js";

const W = 640;
const H = 380;
const BIOMES: Record<string, string> = {
  Meadow: "meadow", Forest: "forest", Cave: "cave", Lake: "lake", Hills: "hills", Gym: "gym", Swamp: "swamp", Desert: "desert",
  "Haunted Tower": "haunted", "Power Plant": "power", "Victory Road": "victory", Champion: "champion",
};

/** Load a picture, trying the local copy and then the remote one; null if neither can be had. */
function load(...sources: string[]): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const next = (i: number) => {
      if (i >= sources.length) return resolve(null);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => next(i + 1);
      img.src = sources[i]!;
    };
    next(0);
  });
}

/** Draw an image at a whole multiple of its size, centred on (cx, bottom), inside a box. */
function stand(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, bottom: number, maxW: number, maxH: number): void {
  let k = 3;
  while (k > 1 && (img.naturalWidth * k > maxW || img.naturalHeight * k > maxH)) k--;
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  ctx.drawImage(img, Math.round(cx - w / 2), Math.round(bottom - h), w, h);
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = "rgba(14, 22, 36, 0.82)"): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#0b111b";
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
}

export async function drawCard(s: State, name = "", canvas: HTMLCanvasElement = document.createElement("canvas")): Promise<HTMLCanvasElement> {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  try {
    await document.fonts.load('20px "KenneyPixel"');
  } catch {
    /* the system font will do */
  }
  const font = (px: number) => `${px}px "KenneyPixel", "Trebuchet MS", system-ui, sans-serif`;

  const p = place(Math.min(s.place, s.maxPlace));
  const biome = p.tower ? "tower" : (BIOMES[p.name] ?? "meadow");
  const party = s.party.map((id) => ({ id, shiny: s.dex[id]?.shiny === true }));
  const [scene, ...pics] = await Promise.all([
    load(`assets/scenes/${biome}.png`),
    ...party.map(({ id, shiny }) => load(spriteUrl(id, shiny ? "shiny" : "normal"), remoteUrl(id, shiny ? "shiny" : "normal"))),
  ]);

  // the background: the biome the trainer is in, in the light of the region
  ctx.fillStyle = "#1c2a3c";
  ctx.fillRect(0, 0, W, H);
  if (scene) ctx.drawImage(scene, 0, 0, W, Math.round((W / scene.naturalWidth) * scene.naturalHeight));
  ctx.fillStyle = "rgba(8, 12, 22, 0.45)";
  ctx.fillRect(0, 0, W, H);

  // title
  panel(ctx, 12, 12, W - 24, 48, "rgba(34, 48, 73, 0.92)");
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffcb3d";
  ctx.font = font(26);
  ctx.textAlign = "left";
  ctx.fillText(name ? `${name} · ${t("Trainer card")}` : t("Trainer card"), 28, 37);
  ctx.textAlign = "right";
  ctx.fillStyle = "#9fb0c9";
  ctx.font = font(18);
  ctx.fillText(placeTitle(p), W - 28, 37);

  // the party, standing on shadows
  const slotW = (W - 24) / 6;
  party.forEach((_, i) => {
    const cx = 12 + slotW * i + slotW / 2;
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.ellipse(cx, 196, 40, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    const img = pics[i];
    if (img) stand(ctx, img, cx, 198, slotW - 8, 110);
  });
  if (party.length === 0) {
    ctx.fillStyle = "#eef1f6";
    ctx.textAlign = "center";
    ctx.font = font(20);
    ctx.fillText("—", W / 2, 150);
  }

  // facts
  panel(ctx, 12, 214, 372, 146);
  const rows: Array<[string, string]> = [
    [t("Caught"), `${s.stats.caught} / ${MAX_SPECIES}`],
    [t("Shiny"), String(s.stats.shinies)],
    [t("Legendary and mythical"), String(s.stats.legendary)],
    [t("Furthest place"), placeTitle(place(s.bestPlace))],
    [t("Times retired"), String(s.rank)],
    [t("Play time"), formatDuration(s.stats.playSeconds)],
  ];
  ctx.font = font(18);
  rows.forEach(([k, v], i) => {
    const y = 238 + i * 22;
    ctx.textAlign = "left";
    ctx.fillStyle = "#9fb0c9";
    ctx.fillText(k, 28, y);
    ctx.textAlign = "right";
    ctx.fillStyle = "#eef1f6";
    ctx.fillText(v, 368, y);
  });

  // the badges
  panel(ctx, 396, 214, 232, 146);
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffcb3d";
  ctx.font = font(16);
  ctx.fillText(t("Gym badges"), 410, 232);
  const badges = await Promise.all(REGIONS.map((r) => load(`assets/badges/${REGION_BADGE[r.id]}.png`, `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/badges/${REGION_BADGE[r.id]}.png`)));
  badges.forEach((img, i) => {
    const earned = s.bestPlace > i * PLACES_PER_REGION + 5;
    const x = 406 + i * 44;
    if (img) {
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = earned ? 1 : 0.22;
      ctx.drawImage(img, x, 246, 40, 40);
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = false;
    }
    if (s.champions[i]) {
      ctx.fillStyle = "#ffcb3d";
      ctx.font = font(16);
      ctx.textAlign = "center";
      ctx.fillText("♛", x + 20, 296);
    }
  });
  ctx.textAlign = "left";
  ctx.fillStyle = "#9fb0c9";
  ctx.font = font(14);
  ctx.fillText(`${t("Achievements: {done} of {total}", { done: s.achievements.length, total: ACHIEVEMENTS.length })}`, 410, 322);
  ctx.fillText(t("Everything is x{n}", { n: formatNumber(globalMult(s)) }), 410, 342);

  // the signature, and the legal line
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(238, 241, 246, 0.8)";
  ctx.font = font(13);
  ctx.fillText("Tall Grass Clicker · ducampcarlos.github.io/tall-grass-clicker · " + t("unofficial fan game"), W / 2, H - 6);
  return canvas;
}

/** The card as a PNG file to hand to the player. */
export async function cardBlob(s: State, name = ""): Promise<Blob> {
  const canvas = await drawCard(s, name);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The card could not be drawn."))), "image/png"));
}
