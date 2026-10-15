import { t } from "../../i18n/index.js";
import { formatNumber } from "../../engine/format.js";
import { buyEgg, eggPrice, eggSlots, incubate, type State } from "../../engine/game.js";
import { EGG_STEPS, type EggTier } from "../../engine/rules.js";
import type { App } from "../app.js";
import { h, setText } from "../dom.js";
import { eggLabel } from "../labels.js";

const DESCRIPTIONS: Array<() => string> = [
  () => t("A first form, from the regions you have walked."),
  () => t("Up to a second form, favouring the uncommon ones."),
  () => t("Strong creatures, with a chance of a legendary one if you have Legend Seeker."),
  () => t("A legendary creature of the region whose champion you beat."),
];

/** Eggs: buy them, put them in an incubator, and click or fight to hatch them. */
export class EggsView {
  readonly el: HTMLElement;
  private readonly bag: Array<{ own: HTMLElement; price: HTMLElement; buy: HTMLButtonElement | null; put: HTMLButtonElement }> = [];
  private readonly incubators = h("div", { class: "rows" });
  private shown = "";

  constructor(private readonly app: App) {
    const bag = h("div", { class: "rows" });
    for (const tier of [0, 1, 2, 3] as EggTier[]) {
      const own = h("span", { class: "lvl" });
      const price = h("span", { class: "price" });
      const buy = tier < 3 ? h("button", { class: "btn small", on: { click: () => this.buy(tier as 0 | 1 | 2) } }, price) : null;
      const put = h("button", { class: "btn small primary", on: { click: () => this.put(tier) } }, t("Incubate"));
      this.bag.push({ own, price, buy, put });
      bag.append(h("div", { class: "row" }, h("div", { style: { display: "flex", gap: "10px", alignItems: "center" } }, h("span", { class: `egg t${tier}` }), h("div", {}, h("div", { class: "t" }, eggLabel(tier), " ", own), h("div", { class: "d" }, DESCRIPTIONS[tier]!()))), h("div", { style: { display: "grid", gap: "4px" } }, ...(buy ? [buy] : []), put)));
    }
    this.el = h("div", {}, h("div", { class: "section-title" }, t("Incubators")), this.incubators, h("div", { class: "section-title" }, t("Your eggs")), bag, h("p", { class: "muted" }, t("Every click is a step, every defeat is four. Hatched creatures can be shiny: eggs are twice as lucky.")));
  }

  private buy(tier: 0 | 1 | 2): void {
    if (this.app.act(buyEgg(this.app.state, tier))) this.app.audio.sfx("coin", 0.6);
    this.app.dirty();
  }

  private put(tier: EggTier): void {
    if (this.app.act(incubate(this.app.state, tier))) this.app.audio.sfx("open", 0.6);
    this.app.dirty();
  }

  update(): void {
    const s: State = this.app.state;
    this.bag.forEach((b, tier) => {
      setText(b.own, `x${s.bag[tier] ?? 0}`);
      b.put.disabled = (s.bag[tier] ?? 0) < 1 || s.eggs.length >= eggSlots(s);
      if (b.buy) {
        const p = eggPrice(s, tier as 0 | 1 | 2);
        b.price.replaceChildren(h("span", { class: "coin" }), formatNumber(p));
        b.buy.disabled = s.coins < p;
      }
    });
    // the incubators are rebuilt only when what is in them changes; the bars move every time
    const slots = eggSlots(s);
    const signature = `${slots}:${s.eggs.map((e) => e.tier).join(",")}`;
    if (signature !== this.shown) {
      this.shown = signature;
      this.incubators.replaceChildren(
        ...Array.from({ length: slots }, (_, i) => {
          const egg = s.eggs[i];
          if (!egg) return h("div", { class: "incubator empty" }, h("span", { class: "egg" }), h("div", {}, t("Empty incubator")));
          const fill = h("i");
          const label = h("span");
          const node = h("div", { class: "incubator", dataset: { i: String(i) } }, h("span", { class: `egg t${egg.tier} rock` }), h("div", {}, h("div", {}, eggLabel(egg.tier)), h("div", { class: "bar egg" }, fill, label)));
          return node;
        }),
      );
    }
    s.eggs.forEach((egg, i) => {
      const node = this.incubators.children[i];
      if (!node || !node.classList.contains("incubator") || node.classList.contains("empty")) return;
      const fill = node.querySelector("i") as HTMLElement | null;
      const label = node.querySelector(".bar span");
      if (fill) fill.style.width = `${Math.min(100, (egg.steps / egg.need) * 100)}%`;
      if (label) setText(label, `${Math.floor(egg.steps)} / ${EGG_STEPS[egg.tier]}`);
    });
  }
}
