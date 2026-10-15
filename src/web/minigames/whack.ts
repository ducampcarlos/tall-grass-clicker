/** Whack-a-Mole: Diglett pop out of nine holes; Dugtrio are worth three, and a Voltorb takes two away. */

import { t } from "../../i18n/index.js";
import { whackStars } from "../../engine/minigames.js";
import { h } from "../dom.js";
import { scaleSprite, spriteImg } from "../sprites.js";
import { type GameCtx, everyFrame } from "./shell.js";

const SECONDS = 25;
const KINDS = [
  { id: 50, points: 1, stay: 0.95, weight: 70 },
  { id: 51, points: 3, stay: 0.8, weight: 15 },
  { id: 100, points: -2, stay: 1.2, weight: 15 },
] as const;

export function startWhack(ctx: GameCtx): void {
  let points = 0;
  let left = SECONDS;
  let nextPop = 0.4;
  const score = h("span", {});
  const time = h("span", {});
  const draw = () => {
    score.textContent = t("Score: {n}", { n: points });
    time.textContent = t("Time: {n}s", { n: Math.max(0, Math.ceil(left)) });
  };
  draw();
  const holes = Array.from({ length: 9 }, () => {
    const hole = h("button", { class: "hole", type: "button", "aria-label": t("Hole") });
    const mole = h("div", { class: "mole" });
    hole.append(mole);
    return { hole, mole, kind: null as (typeof KINDS)[number] | null, left: 0, hit: false };
  });
  for (const hole of holes) {
    hole.hole.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (!hole.kind || hole.hit) return;
      hole.hit = true;
      points += hole.kind.points;
      hole.mole.classList.add(hole.kind.points > 0 ? "whacked" : "boom");
      ctx.app.audio.sfx(hole.kind.points > 0 ? "hit" : "error", 0.4);
      hole.left = 0.25;
      draw();
    });
  }
  ctx.body.append(h("div", { class: "mg-info" }, score, time), h("div", { class: "holes" }, ...holes.map((x) => x.hole)));

  const pick = () => {
    let roll = Math.random() * KINDS.reduce((a, k) => a + k.weight, 0);
    for (const k of KINDS) if ((roll -= k.weight) <= 0) return k;
    return KINDS[0];
  };

  everyFrame(ctx, (dt) => {
    left -= dt;
    nextPop -= dt;
    for (const hole of holes) {
      if (!hole.kind) continue;
      hole.left -= dt;
      if (hole.left <= 0) {
        hole.kind = null;
        hole.hit = false;
        hole.mole.replaceChildren();
        hole.mole.className = "mole";
      }
    }
    if (left > 0 && nextPop <= 0) {
      const free = holes.filter((x) => !x.kind);
      if (free.length > 0) {
        const hole = free[Math.floor(Math.random() * free.length)]!;
        const kind = pick();
        hole.kind = kind;
        hole.hit = false;
        hole.left = kind.stay;
        const pic = spriteImg(kind.id, "normal", "mole-pic", "");
        scaleSprite(pic, 2, 70, 60);
        hole.mole.className = "mole up";
        hole.mole.replaceChildren(pic);
      }
      nextPop = 0.45 + Math.random() * 0.4;
    }
    draw();
    if (left <= 0 && holes.every((x) => !x.kind)) {
      ctx.finish(whackStars(points), t("{n} points.", { n: points }));
      return false;
    }
    return true;
  });
}
