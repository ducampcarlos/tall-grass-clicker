import { t } from "../../i18n/index.js";
import { formatDuration, formatNumber } from "../../engine/format.js";
import { boosterPrice, buyBooster, craft, itemCount, useItem, type State } from "../../engine/game.js";
import { BUFFS, type BuffDef, type Tier, tierDef } from "../../engine/items.js";
import type { App } from "../app.js";
import { h, setClass, setText } from "../dom.js";
import { itemImg } from "../icons.js";
import { fill } from "../../i18n/index.js";

const TIERS: readonly Tier[] = [1, 2, 3];
const effect = (id: string, value: number): string => (id === "lure" ? `+${value}` : `x${value}`);

interface TierCell {
  own: HTMLElement;
  use: HTMLButtonElement;
  combine: HTMLButtonElement | null;
}

interface Card {
  def: BuffDef;
  el: HTMLElement;
  status: HTMLElement;
  bar: HTMLElement;
  buy: HTMLButtonElement;
  price: HTMLElement;
  cells: TierCell[];
}

/** The bag: the boosters you have, the ones working, and how to get more. */
export class BagView {
  readonly el: HTMLElement;
  private readonly cards: Card[] = [];
  private readonly empty = h("p", { class: "muted" }, t("Boosters make something better for a while: they last as long as you play. Win them in the mini-games, find them on passing creatures, buy the first tier here, and combine three of a tier into one of the next."));

  constructor(private readonly app: App) {
    this.el = h("div", {}, this.empty);
    for (const def of BUFFS) this.el.append(this.card(def));
  }

  private card(def: BuffDef): HTMLElement {
    const status = h("div", { class: "d" });
    const bar = h("i");
    const price = h("span", { class: "price" });
    const buy = h("button", { class: "btn small", title: t("Buy the first tier"), on: { click: () => this.buy(def) } }, price);
    const cells: TierCell[] = [];
    const tiers = h("div", { class: "tiers" });
    for (const tier of TIERS) {
      const td = tierDef(def.id, tier);
      const own = h("span", { class: "own" });
      const use = h("button", { class: "btn small primary", on: { click: () => this.use(def, tier) } }, t("Use"));
      const combine = tier < 3 ? h("button", { class: "btn small gold", title: t("Three of these make one of the next tier"), on: { click: () => this.combine(def, tier) } }, t("Combine 3")) : null;
      cells.push({ own, use, combine });
      tiers.append(
        h(
          "div",
          { class: `tier t${tier}` },
          itemImg(td.icon),
          h("div", { class: "n" }, t(td.name)),
          h("div", { class: "e" }, `${effect(def.id, td.value)} · ${formatDuration(td.seconds)}`),
          own,
          h("div", { class: "acts" }, use, combine),
        ),
      );
    }
    const values = def.tiers.map((x) => x.value).join(" / ");
    const el = h(
      "div",
      { class: "booster" },
      h("div", { class: "head" }, h("div", {}, h("div", { class: "t" }, t(def.label)), h("div", { class: "d" }, fill(t(def.text), { value: values }))), buy),
      h("div", { class: "status" }, status, h("div", { class: "bar timer" }, bar)),
      tiers,
    );
    this.cards.push({ def, el, status, bar, buy, price, cells });
    return el;
  }

  private use(def: BuffDef, tier: Tier): void {
    if (this.app.act(useItem(this.app.state, def.id, tier))) this.app.audio.sfx("levelup", 0.5);
    this.app.dirty();
  }

  private combine(def: BuffDef, tier: Tier): void {
    if (this.app.act(craft(this.app.state, def.id, tier))) this.app.audio.sfx("confirm", 0.6);
    this.app.dirty();
  }

  private buy(def: BuffDef): void {
    if (this.app.act(buyBooster(this.app.state, def.id))) this.app.audio.sfx("coin", 0.6);
    this.app.dirty();
  }

  update(): void {
    const s: State = this.app.state;
    for (const c of this.cards) {
      const working = s.buffs.find((b) => b.id === c.def.id);
      setClass(c.el, "working", !!working);
      if (working) {
        const td = tierDef(c.def.id, working.tier);
        setText(c.status, t("Working: {name}, {time} left", { name: t(td.name), time: formatDuration(Math.ceil(working.left)) }));
        c.bar.style.width = `${Math.min(100, (working.left / td.seconds) * 100)}%`;
      } else {
        setText(c.status, t("Not working"));
        c.bar.style.width = "0";
      }
      const price = boosterPrice(s, c.def.id);
      c.price.replaceChildren(h("span", { class: "coin" }), formatNumber(price));
      c.buy.disabled = s.coins < price;
      TIERS.forEach((tier, i) => {
        const n = itemCount(s, c.def.id, tier);
        const cell = c.cells[i]!;
        setText(cell.own, `x${n}`);
        cell.use.disabled = n < 1 || (!!working && working.tier > tier);
        if (cell.combine) cell.combine.disabled = n < 3;
      });
    }
  }
}
