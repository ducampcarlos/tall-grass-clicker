import { t, tn } from "../../i18n/index.js";
import { PLACES_PER_REGION, REGIONS } from "../../engine/regions.js";
import { HELPERS, type HelperDef, helperOn, helperProgress, helperUnlocked, setHelper } from "../../engine/helpers.js";
import { HELPER_ICON, PERK_ICON, REGION_BADGE, badgeImg, itemImg } from "../icons.js";
import { fill } from "../../i18n/index.js";
import { ACHIEVEMENTS, ACHIEVEMENT_BONUS } from "../../engine/achievements.js";
import { canRetire, forgetPerks, globalMult, learnPerk, marksFor, retire, type State } from "../../engine/game.js";
import { formatDuration, formatNumber } from "../../engine/format.js";
import { BRANCHES, BRANCH_INFO, PERKS, type PerkDef } from "../../engine/perks.js";
import { place } from "../../engine/regions.js";
import type { App } from "../app.js";
import { h, setClass, setText } from "../dom.js";
import { placeTitle } from "../labels.js";
import { drawCard } from "../card.js";
import { downloadBlob } from "../transfer.js";
import { confirmDialog, dialog } from "../ui.js";

/** The trainer: what you have done, retiring, the perks marks buy, and the achievements. */
export class TrainerView {
  readonly el: HTMLElement;
  private readonly stats = h("div", { class: "stats" });
  private readonly mult = h("p", {});
  private readonly retireInfo = h("p", {});
  private readonly retireButton = h("button", { class: "btn danger", on: { click: () => this.confirmRetire() } }, t("Retire and start over"));
  private readonly marks = h("span", { class: "gold" });
  private readonly nodes = new Map<string, { el: HTMLButtonElement; cost: HTMLElement }>();
  private readonly helperList = h("div", { class: "rows" });
  private readonly helperRows: Array<{ def: HelperDef; goal: HTMLElement; bar: HTMLElement; toggle: HTMLButtonElement; box: HTMLElement }> = [];
  private readonly badges = h("div", { class: "badges" });
  private badgeSignature = "";
  private readonly achievements = h("div", { class: "grid2" });
  private readonly achTitle = h("div", { class: "section-title" });
  private achSignature = "";

  constructor(private readonly app: App) {
    const tree = h("div", { class: "tree" });
    for (const branch of BRANCHES) {
      const col = h("div", { class: "branch" }, h("h4", {}, t(BRANCH_INFO[branch].name)), h("div", { class: "muted", style: { textAlign: "center", marginBottom: "4px" } }, t(BRANCH_INFO[branch].blurb)));
      for (const perk of PERKS.filter((p) => p.branch === branch)) {
        const cost = h("span", {});
        const el = h("button", { class: "node", on: { click: () => this.learn(perk) } }, h("div", { class: "t" }, h("span", { class: "with-icon" }, itemImg(PERK_ICON[perk.id] ?? "poke-ball"), h("span", {}, t(perk.name))), cost), h("div", { class: "d" }, t(perk.text)));
        this.nodes.set(perk.id, { el, cost });
        col.append(el);
      }
      tree.append(col);
    }
    for (const def of HELPERS) {
      const goal = h("div", { class: "d" });
      const bar = h("i");
      const toggle = h("button", { class: "btn small", on: { click: () => this.flip(def) } });
      const box = h("div", { class: "row helper" }, h("div", { class: "with-icon" }, itemImg(HELPER_ICON[def.id] ?? "poke-ball"), h("div", {}, h("div", { class: "t" }, t(def.name)), h("div", { class: "d" }, t(def.text)), goal, h("div", { class: "bar timer thin" }, bar))), toggle);
      this.helperRows.push({ def, goal, bar, toggle, box });
      this.helperList.append(box);
    }
    this.el = h(
      "div",
      {},
      h("div", { class: "section-title" }, t("Retire")),
      h("p", { class: "muted" }, t("Start over from the first place with nothing but your Pokédex and your Marks. You are paid Marks only for going further than ever before, so retire when you are stuck.")),
      this.retireInfo,
      h("div", { class: "actions" }, this.retireButton),
      h("div", { class: "section-title" }, t("Perks")),
      h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "6px" } }, h("span", {}, t("Marks to spend: "), this.marks), h("button", { class: "btn small", on: { click: () => this.respec() } }, t("Respec"))),
      tree,
      h("div", { class: "section-title" }, t("Helpers")),
      h("p", { class: "muted" }, t("Chores the game takes over once you have done enough of them yourself. Each one switches on when it opens.")),
      this.helperList,
      h("div", { class: "section-title" }, t("Gym badges")),
      this.badges,
      h("div", { class: "section-title" }, t("Your trainer")),
      this.mult,
      this.stats,
      h("div", { class: "actions" }, h("button", { class: "btn small primary", on: { click: () => void this.showCard() } }, t("Trainer card"))),
      this.achTitle,
      this.achievements,
    );
  }

  /** The trainer card: a picture to look at, save and share. */
  private async showCard(): Promise<void> {
    const canvas = await drawCard(this.app.state);
    canvas.className = "card-picture";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", t("Trainer card"));
    dialog(t("Trainer card"), [canvas, h("p", { class: "muted" }, t("Save it, and show what your party looks like."))], [
      { label: t("Save image"), kind: "primary", keepOpen: true, onClick: () => canvas.toBlob((blob) => blob && downloadBlob(blob, "tall-grass-clicker-trainer-card.png"), "image/png") },
      { label: t("Close") },
    ]);
  }

  private flip(def: HelperDef): void {
    const s = this.app.state;
    if (setHelper(s, def.id, !helperOn(s, def.id))) this.app.audio.sfx("toggle", 0.5);
    this.app.dirty();
  }

  private confirmRetire(): void {
    const s = this.app.state;
    const gain = marksFor(s);
    confirmDialog(t("Retire?"), t("You will lose your coins, upgrades, levels and progress through the places, and keep the Pokédex, candy, shinies, achievements and perks. You earn {n} Marks.", { n: gain }), t("Retire"), t("Not yet"), () => {
      if (this.app.act(retire(s))) {
        this.app.audio.sfx("levelup", 0.8);
        this.app.dirty();
      }
    }, "danger");
  }

  private learn(perk: PerkDef): void {
    if (this.app.act(learnPerk(this.app.state, perk.id))) this.app.audio.sfx("levelup", 0.5);
    this.app.dirty();
  }

  private respec(): void {
    if (this.app.state.perks.length === 0) return;
    forgetPerks(this.app.state);
    this.app.audio.sfx("back", 0.5);
    this.app.dirty();
  }

  update(): void {
    const s: State = this.app.state;
    const gain = marksFor(s);
    setText(this.retireInfo, canRetire(s) ? t("Retiring now pays {n} Marks (you have {total} in all).", { n: gain, total: s.marksTotal }) : t("Beat the champion of the first region to be able to retire."));
    this.retireButton.disabled = !canRetire(s);
    setText(this.marks, `${s.marks}`);
    for (const perk of PERKS) {
      const node = this.nodes.get(perk.id)!;
      const owned = s.perks.includes(perk.id);
      const open = perk.requires.every((r) => s.perks.includes(r));
      setClass(node.el, "owned", owned);
      setClass(node.el, "buyable", !owned && open && s.marks >= perk.cost);
      setClass(node.el, "locked", !owned && !open);
      setText(node.cost, owned ? t("Owned") : tn(perk.cost, "{n} mark", "{n} marks"));
    }
    setText(this.mult, t("Everything you earn and deal is multiplied by {n}: {marks} from Marks, {dex} from the Pokédex, {ach} from achievements.", {
      n: formatNumber(globalMult(s)),
      marks: `x${(1 + 0.03 * s.marksTotal).toFixed(2)}`,
      dex: `x${(1 + 0.004 * s.stats.caught + 0.02 * s.stats.shinies).toFixed(2)}`,
      ach: `x${(1 + ACHIEVEMENT_BONUS * s.achievements.length).toFixed(2)}`,
    }));
    const st = s.stats;
    const rows: Array<[string, string]> = [
      [t("Play time"), formatDuration(st.playSeconds)],
      [t("Clicks"), formatNumber(st.clicks)],
      [t("Critical clicks"), formatNumber(st.crits)],
      [t("Creatures defeated"), formatNumber(st.kills)],
      [t("Caught"), `${st.caught} / 649`],
      [t("Shiny"), String(st.shinies)],
      [t("Legendary and mythical"), String(st.legendary)],
      [t("Evolutions"), String(st.evolved)],
      [t("Eggs hatched"), String(st.hatched)],
      [t("Bosses beaten"), String(st.bosses)],
      [t("Coins earned, in all"), formatNumber(s.lifetimeCoins)],
      [t("Furthest place"), placeTitle(place(s.bestPlace))],
      [t("Times retired"), String(s.rank)],
    ];
    const sig = rows.map((r) => r.join(":")).join("|");
    if (sig !== this.statsSignature) {
      this.statsSignature = sig;
      this.stats.replaceChildren(...rows.map(([k, v]) => h("div", {}, h("span", {}, k), h("b", {}, v))));
    }
    for (const r of this.helperRows) {
      const open = helperUnlocked(s, r.def.id);
      const p = helperProgress(s, r.def.id);
      setClass(r.box, "locked", !open);
      r.bar.style.width = `${(p.have / p.need) * 100}%`;
      setText(r.goal, open ? (helperOn(s, r.def.id) ? t("Working") : t("Switched off")) : `${fill(t(r.def.goal), { n: formatNumber(p.need) })}: ${formatNumber(p.have)} / ${formatNumber(p.need)}`);
      r.toggle.disabled = !open;
      setText(r.toggle, !open ? t("Closed") : helperOn(s, r.def.id) ? t("On") : t("Off"));
      setClass(r.toggle, "primary", open && helperOn(s, r.def.id));
    }
    const bsig = REGIONS.map((r) => `${s.bestPlace > r.id * PLACES_PER_REGION + 5 ? 1 : 0}${s.champions[r.id] ? 1 : 0}`).join(",");
    if (bsig !== this.badgeSignature) {
      this.badgeSignature = bsig;
      this.badges.replaceChildren(
        ...REGIONS.map((r) => {
          const gym = s.bestPlace > r.id * PLACES_PER_REGION + 5;
          return h("div", { class: `badge-slot ${gym ? "" : "locked"}`, title: t("{name} gym badge", { name: r.name }) }, badgeImg(REGION_BADGE[r.id]!), s.champions[r.id] ? h("span", { class: "crown" }, "♛") : null, h("span", { class: "k" }, r.name));
        }),
      );
    }
    const asig = s.achievements.join(",");
    if (asig !== this.achSignature) {
      this.achSignature = asig;
      setText(this.achTitle, t("Achievements: {done} of {total}", { done: s.achievements.length, total: ACHIEVEMENTS.length }));
      this.achievements.replaceChildren(
        ...ACHIEVEMENTS.map((a) => h("div", { class: `ach ${s.achievements.includes(a.id) ? "done" : ""}` }, h("div", { class: "star" }, "★"), h("div", {}, h("div", { class: "t" }, t(a.name)), h("div", { class: "d" }, t(a.text))))),
      );
    }
  }

  private statsSignature = "";
}
