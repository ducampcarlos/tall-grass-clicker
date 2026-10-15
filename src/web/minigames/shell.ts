/** What the mini-games share: the panel they are played in, and the screen that shows what they paid. */

import { t } from "../../i18n/index.js";
import { formatNumber } from "../../engine/format.js";
import { tierDef } from "../../engine/items.js";
import { type GameDef, type Stars, awardGame } from "../../engine/minigames.js";
import type { App } from "../app.js";
import { $, h } from "../dom.js";
import { BALL_ICON, itemImg } from "../icons.js";

export interface GameCtx {
  app: App;
  /** Where the game draws itself. */
  body: HTMLElement;
  /** The game is over: pay for it and show the result. `note` is a line about how it went. */
  finish(stars: Stars, note?: string): void;
  /** Something to undo when the panel closes (a timer, a frame request). */
  onClose(fn: () => void): void;
}

export type GameStart = (ctx: GameCtx) => void;

/** Open a mini-game's panel and start it. */
export function openMiniGame(app: App, def: GameDef, start: GameStart): void {
  const host = $("modal");
  const cleanups: Array<() => void> = [];
  let over = false;
  const close = () => {
    over = true;
    for (const fn of cleanups.splice(0)) fn();
    host.replaceChildren();
    window.removeEventListener("keydown", onKey);
    app.dirty(true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  const body = h("div", { class: "mg-body" });
  const quit = h("button", { class: "btn small", on: { click: close } }, t("Quit"));
  const box = h("div", { class: "dialog minigame", role: "dialog", "aria-label": t(def.name) }, h("div", { class: "mg-head" }, h("h3", {}, t(def.name)), quit), body);
  host.replaceChildren(box);
  host.onclick = null;
  window.addEventListener("keydown", onKey);

  const ctx: GameCtx = {
    app,
    body,
    onClose: (fn) => cleanups.push(fn),
    finish: (stars, note) => {
      if (over) return;
      over = true;
      for (const fn of cleanups.splice(0)) fn();
      const events: Parameters<App["handle"]>[0] = [];
      const prize = awardGame(app.state, def.id, stars, events);
      app.audio.sfx(stars > 0 ? "levelup" : "error", 0.6);
      const lines: Node[] = prize.items.map((i) => h("div", { class: "prize" }, itemImg(tierDef(i.id, i.tier).icon), h("span", {}, `${t(tierDef(i.id, i.tier).name)} x${i.n}`)));
      if (prize.coins > 0) lines.push(h("div", { class: "prize" }, h("span", { class: "coin" }), h("span", {}, formatNumber(prize.coins))));
      for (const b of prize.balls) lines.push(h("div", { class: "prize" }, itemImg(BALL_ICON[(["ball", "great", "ultra"] as const)[b.ball]]), h("span", {}, `x${b.n}`)));
      body.replaceChildren(
        h("div", { class: "mg-result" }, h("div", { class: "stars", "aria-label": t("{n} of 3 stars", { n: stars }) }, "★".repeat(stars) + "☆".repeat(3 - stars)), note ? h("p", {}, note) : null, h("div", { class: "prizes" }, ...lines), h("button", { class: "btn primary", on: { click: close } }, t("Close"))),
      );
      quit.remove();
      app.handle(events);
      app.dirty(true);
    },
  };
  start(ctx);
}

/** Run `step(seconds)` every frame until the panel closes or `step` returns false. */
export function everyFrame(ctx: GameCtx, step: (dt: number) => boolean | void): void {
  let last = performance.now();
  let id = 0;
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (step(dt) === false) return;
    id = requestAnimationFrame(loop);
  };
  id = requestAnimationFrame(loop);
  ctx.onClose(() => cancelAnimationFrame(id));
}

/** Call `fn` once after `ms`, unless the panel closes first. */
export function later(ctx: GameCtx, ms: number, fn: () => void): void {
  const id = window.setTimeout(fn, ms);
  ctx.onClose(() => window.clearTimeout(id));
}
