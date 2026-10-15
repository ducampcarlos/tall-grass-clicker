import { t } from "../../i18n/index.js";
import { formatNumber } from "../../engine/format.js";
import { type State, affordableBalls, ballPrice, buyBall, buyUpgrade, partySlots, eggSlots, upgradeLevel, upgradePlan } from "../../engine/game.js";
import { BALLS, type BallId, UPGRADES } from "../../engine/rules.js";
import type { App } from "../app.js";
import { h, setClass, setText } from "../dom.js";
import { BALL_ICON, UPGRADE_ICON, itemImg } from "../icons.js";
import { ballLabel, ballLabels } from "../labels.js";

interface Row {
  name: HTMLElement;
  lvl: HTMLElement;
  desc: HTMLElement;
  buy: HTMLButtonElement;
  price: HTMLElement;
  id: string;
}

const coin = () => h("span", { class: "coin" });

/** Upgrades and balls. */
export class ShopView {
  readonly el: HTMLElement;
  private readonly rows: Row[] = [];
  private readonly ballRows: Array<{ ball: Exclude<BallId, "master">; own: HTMLElement; price: HTMLElement; one: HTMLButtonElement; ten: HTMLButtonElement; max: HTMLButtonElement }> = [];
  private readonly master = h("span", {});
  private readonly amountButtons: HTMLButtonElement[] = [];
  private readonly choose = h("select", { on: { change: () => this.pick() } }) as HTMLSelectElement;

  constructor(private readonly app: App) {
    const amounts = h("div", { class: "segment", role: "group", "aria-label": t("Levels per purchase") });
    for (const [value, label] of [[1, "x1"], [10, "x10"], [100, "x100"], [0, t("Max")]] as const) {
      const b = h("button", { class: "btn small", "data-amount": String(value), on: { click: () => this.setAmount(value) } }, label);
      this.amountButtons.push(b);
      amounts.append(b);
    }
    const upgrades = h("div", { class: "rows" });
    for (const id of ["slots", "incubator", ...UPGRADES.map((u) => u.id)]) upgrades.append(this.row(id));
    const balls = h("div", { class: "rows" });
    for (const ball of ["ball", "great", "ultra"] as const) balls.append(this.ballRow(ball));
    this.el = h(
      "div",
      {},
      h("div", { class: "section-title with-tools" }, h("span", {}, t("Upgrades")), amounts),
      upgrades,
      h("div", { class: "section-title" }, t("Balls")),
      balls,
      h("div", { class: "row" }, h("div", { class: "with-icon" }, itemImg("master-ball"), h("div", {}, h("div", { class: "t" }, t("Master Balls")), h("div", { class: "d" }, t("Never miss. Kept for the legendary ones. They are gifts: the first win over each champion gives one.")))), h("b", {}, this.master)),
      h("div", { class: "row" }, h("div", {}, h("div", { class: "t" }, t("Ball to throw")), h("div", { class: "d" }, t("Creatures you already have never need one."))), this.choose),
    );
    this.fillChoose();
  }

  private fillChoose(): void {
    const options = [...ballLabels(), t("Choose for me")];
    this.choose.replaceChildren(...options.map((label, i) => h("option", { value: String(i) }, label)));
  }

  private pick(): void {
    this.app.state.settings.ball = Number(this.choose.value);
    this.app.audio.sfx("toggle", 0.5);
  }

  private upgradeInfo(id: string): { name: string; text: string; max: number } {
    if (id === "slots") return { name: t("Party Slot"), text: t("Bring one more creature into battle."), max: 5 };
    if (id === "incubator") return { name: t("Egg Incubator"), text: t("Hatch one more egg at a time."), max: 3 };
    const u = UPGRADES.find((x) => x.id === id)!;
    return { name: t(u.name), text: t(u.text), max: u.max };
  }

  private row(id: string): HTMLElement {
    const info = this.upgradeInfo(id);
    const name = h("span", {}, info.name);
    const lvl = h("span", { class: "lvl" });
    const desc = h("div", { class: "d" }, info.text);
    const price = h("span", { class: "price" });
    const buy = h("button", { class: "btn small", on: { click: () => this.buy(id) } }, price);
    this.rows.push({ name, lvl, desc, buy, price, id });
    return h("div", { class: "row" }, h("div", { class: "with-icon" }, itemImg(UPGRADE_ICON[id] ?? "poke-ball"), h("div", {}, h("div", { class: "t" }, name, " ", lvl), desc)), buy);
  }

  private setAmount(value: number): void {
    this.app.profile.buyAmount = value;
    this.app.saveProfile();
    this.app.audio.sfx("toggle", 0.5);
    this.update();
  }

  private amount(): number | "max" {
    return this.app.profile.buyAmount === 0 ? "max" : this.app.profile.buyAmount;
  }

  private buy(id: string): void {
    const r = buyUpgrade(this.app.state, id, this.amount());
    if (this.app.act(r)) this.app.audio.sfx("coin", 0.6);
    this.app.dirty();
  }

  private ballRow(ball: Exclude<BallId, "master">): HTMLElement {
    const own = h("span", { class: "lvl" });
    const price = h("span", { class: "price" });
    const one = h("button", { class: "btn small", on: { click: () => this.buyBalls(ball, 1) } }, "x1");
    const ten = h("button", { class: "btn small", on: { click: () => this.buyBalls(ball, 10) } }, "x10");
    const max = h("button", { class: "btn small", on: { click: () => this.buyBalls(ball, Math.min(999, affordableBalls(this.app.state, ball))) } }, t("Max"));
    this.ballRows.push({ ball, own, price, one, ten, max });
    return h("div", { class: "row" }, h("div", { class: "with-icon" }, itemImg(BALL_ICON[ball]), h("div", {}, h("div", { class: "t" }, ballLabel(ball), " ", own), h("div", { class: "d" }, price))), h("div", { style: { display: "flex", gap: "4px" } }, one, ten, max));
  }

  private buyBalls(ball: Exclude<BallId, "master">, n: number): void {
    if (n < 1) return;
    if (this.app.act(buyBall(this.app.state, ball, n))) this.app.audio.sfx("coins", 0.6);
    this.app.dirty();
  }

  update(): void {
    const s: State = this.app.state;
    for (const r of this.rows) {
      const level = r.id === "slots" ? partySlots(s) - 1 : r.id === "incubator" ? eggSlots(s) - 1 : upgradeLevel(s, r.id);
      const info = this.upgradeInfo(r.id);
      const plan = upgradePlan(s, r.id, this.amount());
      const price = plan.n === 0 ? null : plan.cost;
      setText(r.lvl, level >= info.max ? t("MAX") : r.id === "slots" ? `${partySlots(s)}/6` : r.id === "incubator" ? `${eggSlots(s)}/4` : t("Lv {n}", { n: level }));
      r.price.replaceChildren(...(price === null ? [t("Done")] : [...(plan.n > 1 ? [`x${plan.n}`] : []), coin(), formatNumber(price)]));
      r.buy.disabled = price === null || s.coins < price;
      setClass(r.buy, "gold", price !== null && s.coins >= price);
    }
    for (const b of this.amountButtons) setClass(b, "primary", b.dataset.amount === String(this.app.profile.buyAmount));
    for (const r of this.ballRows) {
      const idx = BALLS.indexOf(r.ball);
      setText(r.own, `x${formatNumber(s.balls[idx] ?? 0)}`);
      const p = ballPrice(s, r.ball);
      r.price.replaceChildren(coin(), `${formatNumber(p)} ${t("each")}`);
      r.one.disabled = s.coins < p;
      r.ten.disabled = s.coins < p * 10;
      r.max.disabled = s.coins < p;
    }
    setText(this.master, `x${s.balls[3] ?? 0}`);
    if (this.choose.value !== String(s.settings.ball)) this.choose.value = String(s.settings.ball);
  }
}
