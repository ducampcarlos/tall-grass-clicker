import { t } from "../../i18n/index.js";
import { species } from "../../engine/dex.js";
import { MAX_PARTY, xpNeed } from "../../engine/rules.js";
import { type State, evolutionTargets, partySlots } from "../../engine/game.js";
import { bestEffectiveness } from "../../engine/typechart.js";
import type { App } from "../app.js";
import { h, setClass, setText } from "../dom.js";
import { spriteImg } from "../sprites.js";

interface Slot {
  el: HTMLElement;
  shown: string;
  img: HTMLImageElement | null;
  name: HTMLElement;
  lv: HTMLElement;
  eff: HTMLElement;
  evo: HTMLElement;
  bar: HTMLElement;
  fill: HTMLElement;
}

/** The creatures fighting for you, under the battle. Tap one to open it in the Pokédex. */
export class PartyView {
  readonly el: HTMLElement;
  private readonly slots: Slot[] = [];

  constructor(private readonly app: App) {
    this.el = h("section", { class: "card party", "aria-label": t("Your party") });
    for (let i = 0; i < MAX_PARTY; i++) {
      const name = h("div", { class: "nm" });
      const lv = h("div", { class: "lv" });
      const eff = h("div", { class: "eff" });
      const evo = h("div", { class: "evo", title: t("Can evolve") }, "▲");
      const fill = h("i");
      const bar = h("div", { class: "bar xp" }, fill);
      const el = h("button", { class: "slot", on: { click: () => this.open(i) } }, eff, evo, name, lv, bar);
      this.slots.push({ el, shown: "", img: null, name, lv, eff, evo, bar, fill });
      this.el.append(el);
    }
  }

  private open(i: number): void {
    const id = this.app.state.party[i];
    if (id) this.app.openDex(id);
    else if (i < partySlots(this.app.state)) this.app.showTab("dex");
    else this.app.showTab("shop");
  }

  update(): void {
    const s: State = this.app.state;
    const slots = partySlots(s);
    this.slots.forEach((slot, i) => {
      const id = s.party[i];
      const locked = i >= slots;
      setClass(slot.el, "locked", locked);
      setClass(slot.el, "lead", i === 0 && !!id);
      if (!id) {
        const key = locked ? "locked" : "empty";
        if (slot.shown !== key) {
          slot.shown = key;
          slot.img?.remove();
          slot.img = null;
          setText(slot.name, locked ? t("Locked") : t("Empty"));
          setText(slot.lv, "");
        }
        slot.fill.style.width = "0";
        setText(slot.eff, "");
        setClass(slot.evo, "hidden", true);
        slot.evo.style.display = "none";
        slot.bar.style.visibility = "hidden";
        return;
      }
      const e = s.dex[id]!;
      const sp = species(id);
      const key = `${id}${e.shiny && this.app.profile.showShiny ? "s" : ""}`;
      if (slot.shown !== key) {
        slot.shown = key;
        slot.img?.remove();
        slot.img = spriteImg(id, e.shiny && this.app.profile.showShiny ? "shiny" : "normal", "", sp.name);
        slot.el.insertBefore(slot.img, slot.name);
        setText(slot.name, sp.name);
      }
      setText(slot.lv, t("Lv {n}", { n: e.level }));
      slot.bar.style.visibility = e.level >= 100 ? "hidden" : "visible";
      slot.fill.style.width = `${Math.min(100, (e.xp / xpNeed(e.level)) * 100)}%`;
      const mult = s.wild ? bestEffectiveness(sp.types, species(s.wild.sp).types) : 1;
      setText(slot.eff, mult > 1 ? `x${mult}` : mult < 1 ? `x${mult === 0.25 ? "¼" : "½"}` : "");
      slot.eff.className = `eff ${mult > 1 ? "up" : mult < 1 ? "down" : ""}`;
      const canEvolve = evolutionTargets(s, id).length > 0;
      slot.evo.style.display = canEvolve ? "" : "none";
    });
  }
}
