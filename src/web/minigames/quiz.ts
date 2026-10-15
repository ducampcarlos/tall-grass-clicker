/** Who's That Creature?: eight shadows, four names each. */

import { t } from "../../i18n/index.js";
import { MAX_SPECIES, species } from "../../engine/dex.js";
import { quizStars } from "../../engine/minigames.js";
import { h } from "../dom.js";
import { scaleSprite, spriteImg } from "../sprites.js";
import { type GameCtx, everyFrame, later } from "./shell.js";

const QUESTIONS = 8;
const SECONDS = 12;

const shuffle = <T,>(a: T[]): T[] => a.map((x) => [Math.random(), x] as const).sort((p, q) => p[0] - q[0]).map(([, x]) => x);

export function startQuiz(ctx: GameCtx): void {
  const chosen = new Set<number>();
  while (chosen.size < QUESTIONS) chosen.add(1 + Math.floor(Math.random() * MAX_SPECIES));
  const asked = [...chosen];
  let n = 0;
  let right = 0;

  const progress = h("span", {});
  const timer = h("div", { class: "bar timer" }, h("i"));
  const stage = h("div", { class: "quiz-stage" });
  const options = h("div", { class: "quiz-options" });
  const verdict = h("div", { class: "mg-say" });
  ctx.body.append(h("div", { class: "mg-info" }, progress), timer, stage, verdict, options);

  let left = 0;
  let answering = false;
  const bar = timer.firstElementChild as HTMLElement;

  const next = () => {
    if (n === QUESTIONS) return ctx.finish(quizStars(right), t("{n} right out of {total}.", { n: right, total: QUESTIONS }));
    const id = asked[n]!;
    const sp = species(id);
    n++;
    progress.textContent = t("Question {n} of {total}", { n, total: QUESTIONS });
    const pic = spriteImg(id, "normal", "silhouette", "");
    scaleSprite(pic, 3, 220, 180);
    stage.replaceChildren(pic);
    verdict.className = "mg-say";
    const others = new Set<number>();
    while (others.size < 3) {
      const o = 1 + Math.floor(Math.random() * MAX_SPECIES);
      if (o !== id) others.add(o);
    }
    options.replaceChildren(...shuffle([id, ...others]).map((o) => h("button", { class: "btn", type: "button", on: { click: () => answer(o, id, pic) } }, species(o).name)));
    left = SECONDS;
    answering = true;
  };

  const answer = (choice: number | null, id: number, pic: HTMLImageElement) => {
    if (!answering) return;
    answering = false;
    pic.classList.remove("silhouette");
    const ok = choice === id;
    if (ok) right++;
    verdict.textContent = ok ? t("Correct!") : t("It was {name}.", { name: species(id).name });
    verdict.className = `mg-say show ${ok ? "good" : "bad"}`;
    ctx.app.audio.sfx(ok ? "coin" : "error", 0.4);
    for (const b of options.querySelectorAll("button")) {
      b.disabled = true;
      if (b.textContent === species(id).name) b.classList.add("primary");
    }
    later(ctx, 1100, next);
  };

  everyFrame(ctx, (dt) => {
    if (!answering) return;
    left -= dt;
    bar.style.width = `${Math.max(0, (left / SECONDS) * 100)}%`;
    if (left <= 0) answer(null, asked[n - 1]!, stage.querySelector("img") as HTMLImageElement);
  });
  next();
}
