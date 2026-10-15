/** Capture Throw: a ring closes in on a creature; the smaller it is when you throw, the better the throw. */

import { t } from "../../i18n/index.js";
import { species } from "../../engine/dex.js";
import { type GameEvent, startEncounter, throwAt } from "../../engine/game.js";
import { place } from "../../engine/regions.js";
import { type Stars, throwQuality } from "../../engine/minigames.js";
import { h } from "../dom.js";
import { BALL_ICON, itemImg } from "../icons.js";
import { scaleSprite, spriteImg } from "../sprites.js";
import { setBiome } from "../views/battle.js";
import { type GameCtx, everyFrame, later } from "./shell.js";

const RING_SECONDS = 1.6;
const SMALLEST = 0.15;
const QUALITY_TEXT = ["", "Nice!", "Great!", "Excellent!"] as const;

export function startThrow(ctx: GameCtx): void {
  const s = ctx.app.state;
  const enc = startEncounter(s);
  const sp = species(enc.sp);
  const arena = h("div", { class: "arena" });
  setBiome(arena, place(Math.min(s.place, s.maxPlace)));
  const scene = h("div", { class: "scene" });
  const pic = spriteImg(enc.sp, enc.shiny ? "shiny" : "normal", "target-pic", sp.name);
  scaleSprite(pic, 3, 200, 170);
  const ring = h("div", { class: "ring" });
  const good = h("div", { class: "ring-mark great" });
  const best = h("div", { class: "ring-mark excellent" });
  const focus = h("div", { class: "focus" }, good, best, ring);
  const stage = h("div", { class: "throw-stage" }, pic, focus, enc.shiny ? h("div", { class: "sparkle", style: { top: "6px", right: "20%" } }, "✦") : null);
  const info = h("div", { class: "mg-info" });
  const balls = h("div", { class: "mg-balls" });
  const say = h("div", { class: "mg-say" });
  const hint = h("p", { class: "muted" }, t("Tap the creature when the ring is small. Three throws, and they are free."));
  const ball = itemImg(BALL_ICON.great, "flying-ball");
  arena.append(scene, stage, ball, say);
  ctx.body.append(info, arena, balls, hint);

  const drawInfo = () => {
    info.replaceChildren(h("span", { class: "name" }, `${sp.name}${enc.shiny ? " ✦" : ""}`), h("span", { class: "muted" }, t("Throws: {n}", { n: enc.throws })));
    balls.replaceChildren(...Array.from({ length: enc.throws }, () => itemImg(BALL_ICON.great, "mini")));
  };
  drawInfo();

  let clock = 0;
  let busy = false;
  let ratio = 1;
  everyFrame(ctx, (dt) => {
    if (busy) return;
    clock = (clock + dt) % RING_SECONDS;
    ratio = 1 - (1 - SMALLEST) * (clock / RING_SECONDS);
    ring.style.transform = `translate(-50%, -50%) scale(${ratio})`;
    ring.className = `ring ${ratio <= 0.4 ? "excellent" : ratio <= 0.7 ? "great" : "nice"}`;
  });

  let caughtWith: 1 | 2 | 3 | 0 = 0;
  const events: GameEvent[] = [];

  const end = () => {
    const stars = (caughtWith === 0 ? 0 : caughtWith) as Stars;
    const note = caughtWith > 0 ? t("{name} was caught!", { name: sp.name }) : t("{name} got away.", { name: sp.name });
    ctx.finish(stars, note);
  };

  arena.addEventListener("pointerdown", (e) => {
    if (busy || enc.throws < 1) return;
    busy = true;
    const box = pic.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const reach = Math.max(60, Math.max(box.width, box.height) * 0.6);
    const onTarget = Math.hypot(e.clientX - cx, e.clientY - cy) <= reach;
    const quality = throwQuality(ratio, onTarget);
    const arenaBox = arena.getBoundingClientRect();
    // the ball flies from the bottom to the creature
    ball.className = "flying-ball fly";
    ball.style.setProperty("--tx", `${cx - arenaBox.left - arenaBox.width / 2}px`);
    ball.style.setProperty("--ty", `${cy - arenaBox.top - arenaBox.height + 30}px`);
    ctx.app.audio.sfx("select", 0.5);
    later(ctx, 420, () => {
      const result = throwAt(ctx.app.state, enc, quality, events);
      ball.className = "flying-ball shake";
      later(ctx, 900, () => {
        ball.className = "flying-ball hidden";
        if (result.caught) {
          caughtWith = Math.max(1, quality) as 1 | 2 | 3;
          say.textContent = t("Gotcha!");
          say.className = "mg-say show good";
          ctx.app.audio.sfx("bell", 0.7);
          ctx.app.handle(events.splice(0));
          later(ctx, 900, end);
        } else {
          say.textContent = quality === 0 ? t("Missed!") : t("It broke free!");
          say.className = "mg-say show bad";
          ctx.app.audio.sfx("error", 0.4);
          drawInfo();
          if (enc.throws < 1) later(ctx, 800, end);
          else
            later(ctx, 700, () => {
              say.className = "mg-say";
              busy = false;
            });
        }
      });
    });
    if (quality > 0) {
      say.textContent = t(QUALITY_TEXT[quality]!);
      say.className = `mg-say show q${quality}`;
    }
  });
}
