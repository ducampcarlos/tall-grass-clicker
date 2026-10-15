import { t } from "../../i18n/index.js";
import { goTo, killsLeft, type State } from "../../engine/game.js";
import { PLACES_PER_REGION, REGIONS, ROUTE_COUNT, killsToUnlock, place } from "../../engine/regions.js";
import type { App } from "../app.js";
import { h, setClass, setText } from "../dom.js";
import { REGION_BADGE, badgeImg } from "../icons.js";
import { placeName } from "../labels.js";

interface Node {
  el: HTMLButtonElement;
  kills: HTMLElement;
  index: number;
}

/** The map: every place, how far you are in it, and a way to go back to farm an earlier one. */
export class WorldView {
  readonly el: HTMLElement;
  private readonly nodes: Node[] = [];
  private readonly tower = h("div", {});
  private readonly towerText = h("span", {});

  constructor(private readonly app: App) {
    this.el = h("div", {});
    for (const region of REGIONS) {
      const places = h("div", { class: "places" });
      for (let slot = 0; slot < PLACES_PER_REGION; slot++) {
        const index = region.id * PLACES_PER_REGION + slot;
        const p = place(index);
        const kills = h("span", { class: "k" });
        const el = h("button", { class: `place ${p.kind !== "wild" ? "boss" : ""}`, on: { click: () => this.go(index) } }, h("span", { class: "n" }, `${slot + 1}. ${placeName(p.name)}${p.kind === "champion" ? " ♛" : ""}`, p.kind === "gym" ? badgeImg(REGION_BADGE[region.id]!, "tiny") : null), kills);
        this.nodes.push({ el, kills, index });
        places.append(el);
      }
      this.el.append(h("div", { class: "region" }, h("h4", {}, region.name), places));
    }
    this.tower.append(h("h4", { class: "gold" }, t("The Tower")), h("p", { class: "muted" }, t("Past the fifth champion the Tower never ends: every floor is stronger, every tenth has a boss, and any creature can show up.")), h("p", {}, this.towerText), h("div", { class: "actions" }, h("button", { class: "btn small primary", on: { click: () => this.go(this.app.state.maxPlace >= ROUTE_COUNT ? this.app.state.maxPlace : -1) } }, t("Go to the furthest floor"))));
    this.el.append(h("div", { class: "region" }, this.tower));
  }

  private go(index: number): void {
    if (index < 0) return;
    if (goTo(this.app.state, index)) {
      this.app.audio.sfx("select", 0.5);
      this.app.dirty();
    } else this.app.audio.sfx("error", 0.4);
  }

  update(): void {
    const s: State = this.app.state;
    for (const n of this.nodes) {
      const p = place(n.index);
      const locked = n.index > s.maxPlace;
      setClass(n.el, "locked", locked);
      setClass(n.el, "current", n.index === s.place);
      setClass(n.el, "done", n.index < s.maxPlace);
      n.el.disabled = locked;
      setText(n.kills, locked ? t("Locked") : n.index < s.maxPlace ? t("Cleared") : p.kind === "wild" ? t("{done}/{need}", { done: killsToUnlock(p) - killsLeft(s, n.index), need: killsToUnlock(p) }) : t("Boss"));
    }
    this.tower.parentElement!.style.display = s.maxPlace >= ROUTE_COUNT ? "" : "none";
    setText(this.towerText, t("Furthest floor: {n}", { n: Math.max(1, s.maxPlace - ROUTE_COUNT + 1) }));
  }
}
