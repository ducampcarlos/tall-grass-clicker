import { t } from "../../i18n/index.js";
import { species } from "../../engine/dex.js";
import { type State, killsLeft, goTo } from "../../engine/game.js";
import { type Place, killsToUnlock, place } from "../../engine/regions.js";
import { formatNumber } from "../../engine/format.js";
import type { App } from "../app.js";
import { h, setClass, setText } from "../dom.js";
import { TYPE_COLORS, placeTitle, typeLabel } from "../labels.js";
import type { BallId } from "../../engine/rules.js";
import { BALL_ICON, itemImg } from "../icons.js";
import { scaleSprite, setSprite, spriteImg } from "../sprites.js";

const BIOMES: Record<string, string> = {
  Meadow: "meadow", Forest: "forest", Cave: "cave", Lake: "lake", Hills: "hills", Gym: "gym", Swamp: "swamp", Desert: "desert",
  "Haunted Tower": "haunted", "Power Plant": "power", "Victory Road": "victory", Champion: "champion",
};

/** Dress an element (the battle card, the page) as the place: its biome picture, tinted by the region's light. */
export function setBiome(el: HTMLElement, p: Place): void {
  el.className = el.className.replace(/\b(biome|region)-\w+\s*/g, "").trim();
  el.classList.add(`biome-${p.tower ? "tower" : (BIOMES[p.name] ?? "meadow")}`, `region-${p.tower ? 5 : p.region}`);
}

/** The fight: the creature in front of you, its health, and where you are. Click anywhere on it. */
export class BattleView {
  readonly el: HTMLElement;
  private readonly where = h("span", {});
  private readonly prev = h("button", { class: "btn small icon-btn", title: t("Previous place"), on: { click: (e) => this.go(e, -1) } }, "◀");
  private readonly next = h("button", { class: "btn small icon-btn", title: t("Next place"), on: { click: (e) => this.go(e, 1) } }, "▶");
  private readonly furthest = h("button", { class: "btn small", title: t("Go to the furthest place"), on: { click: (e) => this.go(e, Infinity) } }, "⇥");
  private readonly img = spriteImg(1, "normal", "wild") as HTMLImageElement;
  private readonly sparkle = h("div", { class: "sparkle" }, "✦");
  private readonly floaters = h("div", { class: "floaters" });
  private readonly name = h("span", { class: "name" });
  private readonly types = h("span", { class: "chips" });
  private readonly hpFill = h("i");
  private readonly stage = h("div", { class: "stage" });
  private readonly scene = h("div", { class: "scene", "aria-hidden": "true" });
  private lastThrow = -1000;
  private roamer: HTMLElement | null = null;
  private readonly hpText = h("span");
  private readonly timerBar = h("div", { class: "bar timer" }, h("i"), h("span"));
  private readonly killFill = h("i");
  private readonly killText = h("span");
  private readonly kills = h("div", { class: "killsbar" }, h("div", { class: "bar" }, this.killFill), this.killText);
  private readonly hint = h("div", { class: "hint" }, t("Tap the creature to attack!"));
  private shown: object | null = null;
  private lastPlace = -1;
  private clicks = 0;

  constructor(private readonly app: App) {
    this.el = h(
      "section",
      { class: "card battle", tabIndex: 0, role: "button", "aria-label": t("Attack the wild creature") },
      h("div", { class: "where" }, this.where, h("div", { class: "nav", on: { pointerdown: (e) => e.stopPropagation() } }, this.prev, this.next, this.furthest)),
      this.scene,
      this.stage,
      h(
        "div",
        { class: "info" },
        h("div", { class: "line" }, this.name, this.types),
        h("div", { class: "hprow" }, h("span", { class: "hptag" }, "HP"), h("div", { class: "bar hp" }, this.hpFill, this.hpText)),
        this.timerBar,
        this.kills,
      ),
      this.floaters,
      this.hint,
    );
    this.stage.append(this.img, this.sparkle);
    this.el.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest(".nav")) return;
      const box = this.el.getBoundingClientRect();
      this.app.click(e.clientX - box.left, e.clientY - box.top);
    });
    this.el.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!e.repeat) this.app.click(this.el.clientWidth / 2, 150);
      }
    });
  }

  private go(e: Event, delta: number): void {
    e.stopPropagation();
    const s = this.app.state;
    const target = delta === Infinity ? s.maxPlace : Math.max(0, Math.min(s.maxPlace, s.place + delta));
    if (goTo(s, target)) {
      this.app.audio.sfx("select", 0.5);
      this.app.dirty();
    }
  }

  /** A number floating up from where the click landed. */
  pop(text: string, x: number, y: number, kind = ""): void {
    if (this.floaters.children.length > 14) this.floaters.firstElementChild?.remove();
    const el = h("div", { class: `floater ${kind}`, style: { left: `${x}px`, top: `${y - 20}px` } }, text);
    this.floaters.append(el);
    window.setTimeout(() => el.remove(), 900);
  }

  /** A ball thrown at the creature: it wobbles, then either bursts open in a flash or the creature breaks free. */
  throwBall(ball: BallId, caught: boolean): void {
    const now = performance.now();
    if (now - this.lastThrow < 400) return;
    this.lastThrow = now;
    const el = itemImg(BALL_ICON[ball], `throw ${caught ? "caught" : "broke"}`);
    this.stage.append(el);
    window.setTimeout(() => el.remove(), 1300);
  }

  /** A creature crosses the card; tapping it gives a gift. Returns false if one is already on its way. */
  roam(sp: number, shiny: boolean, onTap: () => void): boolean {
    if (this.roamer) return false;
    const img = spriteImg(sp, shiny ? "shiny" : "normal", "roam-pic", "");
    scaleSprite(img, 2, 110, 90);
    const el = h("button", { class: `roamer ${shiny ? "shiny" : ""}`, type: "button", "aria-label": t("A creature is passing by: tap it for a gift!"), style: { top: `${10 + Math.random() * 14}%` } }, img, h("span", { class: "spark" }, "✦"));
    const done = () => {
      el.remove();
      if (this.roamer === el) this.roamer = null;
    };
    el.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      done();
      onTap();
    });
    el.addEventListener("animationend", done);
    this.roamer = el;
    this.el.append(el);
    return true;
  }

  /** Tap the passing creature, if there is one (the Collector's Net does). */
  tapRoamer(): void {
    this.roamer?.dispatchEvent(new Event("pointerdown"));
  }

  hit(): void {
    this.img.classList.remove("hit");
    void this.img.offsetWidth;
    this.img.classList.add("hit");
    if (++this.clicks > 3) this.hint.remove();
  }

  /** Redraw what only changes when the creature or the place does. */
  private redraw(s: State): void {
    const w = s.wild!;
    const p = place(s.place);
    const sp = species(w.sp);
    const showShiny = w.shiny;
    this.img.classList.remove("enter");
    void this.img.offsetWidth;
    this.img.classList.add("enter");
    this.img.style.width = "";
    this.img.style.height = "";
    setSprite(this.img, sp.id, showShiny ? "shiny" : "normal");
    scaleSprite(this.img, 3, 260, 190);
    setClass(this.img, "shiny", showShiny);
    this.sparkle.style.display = showShiny ? "" : "none";
    setText(this.name, `${sp.name}${w.boss ? " ★" : ""}  ${t("Lv {n}", { n: w.level })}`);
    this.types.replaceChildren(...sp.types.map((ty) => h("span", { class: "chip", style: { background: TYPE_COLORS[ty] } }, typeLabel(ty))));
    setClass(this.el, "boss", w.boss);
    this.timerBar.style.display = w.boss ? "" : "none";
    if (p.index !== this.lastPlace) {
      this.lastPlace = p.index;
      setBiome(this.el, p);
      setBiome(document.body, p);
      setText(this.where, placeTitle(p));
    }
    setClass(this.prev, "hidden", false);
    this.prev.disabled = s.place <= 0;
    this.next.disabled = s.place >= s.maxPlace;
    this.furthest.disabled = s.place >= s.maxPlace;
  }

  frame(s: State): void {
    const w = s.wild;
    if (!w) return;
    if (this.shown !== w) {
      this.shown = w;
      this.redraw(s);
    }
    const ratio = Math.max(0, Math.min(1, w.hp / w.maxHp));
    this.hpFill.style.width = `${ratio * 100}%`;
    const hpClass = ratio > 0.5 ? "" : ratio > 0.2 ? "mid" : "low";
    if (this.hpFill.className !== hpClass) this.hpFill.className = hpClass;
    setText(this.hpText, `${formatNumber(Math.max(0, w.hp))} / ${formatNumber(w.maxHp)}`);
    if (w.boss) {
      const bar = this.timerBar.firstElementChild as HTMLElement;
      const total = place(s.place).kind === "champion" ? 60 : place(s.place).tower ? 45 : 40;
      bar.style.width = `${Math.max(0, Math.min(1, w.timer / total)) * 100}%`;
      setText(this.timerBar.lastElementChild!, `${Math.max(0, Math.ceil(w.timer))}s`);
    }
    const p = place(s.place);
    const need = killsToUnlock(p);
    const left = killsLeft(s);
    const done = s.place < s.maxPlace || left === 0 ? need : need - left;
    (this.killFill as HTMLElement).style.width = `${(done / need) * 100}%`;
    setText(this.killText, p.kind === "wild" ? t("{done}/{need} defeated", { done, need }) : s.place < s.maxPlace ? t("Cleared") : t("Defeat it to go on"));
  }
}
