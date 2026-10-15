/** Memory Match: eight pairs of creatures face down; find them in as few tries as you can. */

import { t } from "../../i18n/index.js";
import { MAX_SPECIES, species } from "../../engine/dex.js";
import { memoryStars } from "../../engine/minigames.js";
import { h } from "../dom.js";
import { spriteImg } from "../sprites.js";
import { type GameCtx, later } from "./shell.js";

/** Eight different species: ones you know first, then whatever is needed to make eight. */
function pick(ctx: GameCtx): number[] {
  const s = ctx.app.state;
  const known = Object.entries(s.dex).filter(([, e]) => e.seen).map(([id]) => Number(id));
  const chosen = new Set<number>();
  const shuffle = <T,>(a: T[]) => a.map((x) => [Math.random(), x] as const).sort((p, q) => p[0] - q[0]).map(([, x]) => x);
  for (const id of shuffle(known)) if (chosen.size < 8) chosen.add(id);
  while (chosen.size < 8) chosen.add(1 + Math.floor(Math.random() * MAX_SPECIES));
  return [...chosen];
}

export function startMemory(ctx: GameCtx): void {
  const ids = pick(ctx);
  const deck = [...ids, ...ids].map((id) => [Math.random(), id] as const).sort((a, b) => a[0] - b[0]).map(([, id]) => id);
  let tries = 0;
  let found = 0;
  let open: HTMLButtonElement[] = [];
  let locked = false;
  const counter = h("span", {});
  const drawCounter = () => (counter.textContent = t("Tries: {n}", { n: tries }));
  drawCounter();
  const grid = h("div", { class: "memory" });
  for (const id of deck) {
    const card = h("button", { class: "mem-card", type: "button", "aria-label": t("Card"), dataset: { id: String(id) } }, h("span", { class: "back" }, "?"), h("span", { class: "face" }, spriteImg(id, "icon", "", species(id).name)));
    card.addEventListener("click", () => {
      if (locked || card.classList.contains("open") || card.classList.contains("done")) return;
      card.classList.add("open");
      ctx.app.audio.sfx("select", 0.3);
      open.push(card);
      if (open.length < 2) return;
      tries++;
      drawCounter();
      const [a, b] = open as [HTMLButtonElement, HTMLButtonElement];
      open = [];
      if (a.dataset.id === b.dataset.id) {
        a.classList.add("done");
        b.classList.add("done");
        found++;
        ctx.app.audio.sfx("coin", 0.4);
        if (found === ids.length) later(ctx, 500, () => ctx.finish(memoryStars(tries), t("Done in {n} tries.", { n: tries })));
      } else {
        locked = true;
        later(ctx, 750, () => {
          a.classList.remove("open");
          b.classList.remove("open");
          locked = false;
        });
      }
    });
    grid.append(card);
  }
  ctx.body.append(h("div", { class: "mg-info" }, counter, h("span", { class: "muted" }, t("3 stars: 10 tries or fewer"))), grid);
}
