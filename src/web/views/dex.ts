import { t } from "../../i18n/index.js";
import { MAX_SPECIES, SPECIES, evolutionsOf, isSpecial, rootOf, species } from "../../engine/dex.js";
import { type State, attackOfEntry, evolutionTargets, evolve, partySlots, setParty, useCandy } from "../../engine/game.js";
import { PLACES, REGIONS, REGION_COUNT, ROUTE_COUNT, place, poolOf } from "../../engine/regions.js";
import { MAX_LEVEL, xpNeed } from "../../engine/rules.js";
import { formatNumber } from "../../engine/format.js";
import type { App } from "../app.js";
import { h, setClass } from "../dom.js";
import { itemImg } from "../icons.js";
import { TYPE_COLORS, placeName, typeLabel, typeLabels } from "../labels.js";
import { spriteImg } from "../sprites.js";

type Filter = "all" | "caught" | "missing" | "shiny";

/** Where in the five regions a creature can be met, by region: built once, on first use. */
let FOUND: Map<number, Map<number, string[]>> | null = null;
function foundIn(id: number): Map<number, string[]> {
  if (!FOUND) {
    FOUND = new Map();
    for (let i = 0; i < ROUTE_COUNT; i++) {
      const p = place(i);
      if (p.kind !== "wild") continue;
      for (const e of poolOf(p)) {
        const regions = FOUND.get(e.id) ?? FOUND.set(e.id, new Map()).get(e.id)!;
        const list = regions.get(p.region) ?? regions.set(p.region, []).get(p.region)!;
        if (!list.includes(p.name)) list.push(p.name);
      }
    }
  }
  return FOUND.get(id) ?? new Map();
}

function whereToFind(id: number): string {
  const sp = species(id);
  const parts: string[] = [];
  if (isSpecial(sp)) {
    const region = REGIONS.findIndex((r) => r.legends.includes(id));
    parts.push(region >= 0 ? t("Legendary Egg from the champion of {region}, or the Tower.", { region: REGIONS[region]!.name }) : t("The Tower."));
    return parts.join(" ");
  }
  const found = foundIn(id);
  // the first regions where it lives, in order, a few places each
  for (const [region, names] of [...found].sort((a, b) => a[0] - b[0]).slice(0, 2)) parts.push(`${REGIONS[region]!.name}: ${names.slice(0, 4).map(placeName).join(", ")}${names.length > 4 ? "…" : ""}`);
  if (sp.from) parts.push(t("Evolves from {name} at level {n}.", { name: species(sp.from).name, n: sp.evoLevel }));
  if (found.size === 0 && !sp.from) parts.push(t("Eggs."));
  else if (found.size > 0) parts.push(t("Also eggs."));
  return parts.join("  ");
}

/** The Pokédex: every creature, caught or not, and what to do with the ones you have. */
export class DexView {
  readonly el: HTMLElement;
  private readonly cells = new Map<number, HTMLButtonElement>();
  private readonly count = h("span", { class: "count" });
  private readonly grid = h("div", { class: "dexgrid" });
  private readonly detail = h("div", {});
  private readonly filterButtons = new Map<Filter, HTMLButtonElement>();
  private filter: Filter = "all";
  private gen = 0;
  private type = -1;
  private query = "";
  private selected = 0;
  private signature = "";
  private cellSignature = "";
  private readonly genSelect = h("select", { on: { change: () => ((this.gen = Number((this.genSelect as HTMLSelectElement).value)), this.apply()) } }) as HTMLSelectElement;
  private readonly typeSelect = h("select", { on: { change: () => ((this.type = Number((this.typeSelect as HTMLSelectElement).value)), this.apply()) } }) as HTMLSelectElement;

  constructor(private readonly app: App) {
    this.genSelect.append(h("option", { value: "0" }, t("All regions")), ...REGIONS.map((r) => h("option", { value: String(r.gen) }, r.name)));
    this.typeSelect.append(h("option", { value: "-1" }, t("All types")), ...typeLabels().map((label, i) => h("option", { value: String(i) }, label)));
    const filters = h("div", { class: "filters" });
    for (const [key, label] of [["all", t("All")], ["caught", t("Caught")], ["missing", t("Missing")], ["shiny", t("Shiny")]] as Array<[Filter, string]>) {
      const b = h("button", { class: "btn small", on: { click: () => ((this.filter = key), this.apply()) } }, label);
      this.filterButtons.set(key, b);
      filters.append(b);
    }
    const search = h("input", { type: "search", placeholder: t("Search"), "aria-label": t("Search"), on: { input: () => ((this.query = (search as HTMLInputElement).value.trim().toLowerCase()), this.apply()) } });
    for (const sp of SPECIES) {
      const cell = h("button", { class: "cell unseen", title: "???", on: { click: () => this.select(sp.id) } }, h("span", { class: "no" }, String(sp.id)));
      this.cells.set(sp.id, cell);
      this.grid.append(cell);
    }
    this.el = h("div", {}, h("div", { class: "dexhead" }, this.count, filters, this.genSelect, this.typeSelect, search), this.grid, this.detail);
  }

  /** Show a creature's details (from outside: the party, a toast). */
  select(id: number): void {
    this.selected = id;
    this.signature = "";
    this.update();
    this.detail.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }

  private apply(): void {
    for (const [k, b] of this.filterButtons) setClass(b, "on", k === this.filter);
    this.cellSignature = "";
    this.update();
  }

  private matches(s: State, id: number): boolean {
    const sp = species(id);
    const e = s.dex[id];
    if (this.gen && sp.gen !== this.gen) return false;
    if (this.type >= 0 && !(e?.seen && sp.types.includes(this.type))) return false;
    if (this.filter === "caught" && !e?.caught) return false;
    if (this.filter === "missing" && e?.caught) return false;
    if (this.filter === "shiny" && !e?.shiny) return false;
    if (this.query && !(e?.seen && sp.name.toLowerCase().includes(this.query)) && String(id) !== this.query) return false;
    return true;
  }

  update(): void {
    const s = this.app.state;
    setText(this.count, t("{caught} caught · {seen} seen · {shiny} shiny · of {total}", { caught: s.stats.caught, seen: Object.values(s.dex).filter((e) => e.seen).length, shiny: s.stats.shinies, total: MAX_SPECIES }));
    for (const [k, b] of this.filterButtons) setClass(b, "on", k === this.filter);
    // the grid: only touched where something changed
    let sig = `${this.filter}|${this.gen}|${this.type}|${this.query}|`;
    for (const sp of SPECIES) {
      const e = s.dex[sp.id];
      sig += e ? (e.caught ? (e.shiny ? "S" : "C") : e.seen ? "s" : "u") : "u";
    }
    sig += s.party.join(",") + this.app.profile.showShiny;
    if (sig !== this.cellSignature) {
      this.cellSignature = sig;
      for (const [id, cell] of this.cells) {
        const e = s.dex[id];
        const state = e?.caught ? "caught" : e?.seen ? "seen" : "unseen";
        cell.className = `cell ${state}${e?.shiny ? " shiny" : ""}${s.party.includes(id) ? " party" : ""}${this.matches(s, id) ? "" : " hidden"}`;
        cell.title = e?.seen ? species(id).name : "???";
        const img = cell.querySelector("img");
        if (e?.seen && !img) cell.prepend(spriteImg(id, "icon", "", species(id).name));
        cell.querySelector(".evo")?.remove();
        if (e?.caught && evolutionTargets(s, id).some((to) => !s.dex[to]?.caught)) cell.append(h("span", { class: "evo" }, "▲"));
      }
    }
    this.renderDetail(s);
  }

  private renderDetail(s: State): void {
    const id = this.selected;
    if (!id) {
      if (this.signature !== "none") {
        this.signature = "none";
        this.detail.replaceChildren(h("p", { class: "muted" }, t("Pick a creature to see its details.")));
      }
      return;
    }
    const e = s.dex[id];
    const sig = `${id}|${e?.caught}|${e?.shiny}|${e?.level}|${e?.candy}|${s.party.indexOf(id)}|${s.party.length}|${partySlots(s)}|${evolutionTargets(s, id).join()}|${this.app.profile.showShiny}|${Math.floor((e?.xp ?? 0) / 10)}|${evolutionsOf(id).map((to) => s.dex[to]?.caught).join()}`;
    if (sig === this.signature) return;
    this.signature = sig;
    const sp = species(id);
    const known = !!e?.seen;
    const owned = !!e?.caught;
    const shinyView = owned && e!.shiny && this.app.profile.showShiny;
    const pic = h("div", { class: "pic" });
    if (known) {
      const img = spriteImg(id, shinyView ? "shiny" : "normal", owned ? "" : "dark", sp.name);
      pic.append(img);
    } else pic.append(h("span", { class: "muted" }, "?"));
    const body = h("div", {});
    body.append(h("h4", {}, known ? `#${id} ${sp.name}${owned && e!.shiny ? " ✦" : ""}` : `#${id} ???`));
    if (known) {
      body.append(h("div", { class: "chips" }, ...sp.types.map((ty) => h("span", { class: "chip", style: { background: TYPE_COLORS[ty] } }, typeLabel(ty)))));
      body.append(
        h(
          "div",
          { class: "facts" },
          h("span", {}, t("Strength {n}", { n: sp.bst })),
          h("span", {}, t("Catch rate {n}", { n: sp.catchRate })),
          h("span", {}, owned ? t("Lv {n}", { n: e!.level }) : t("Not caught")),
          owned ? h("span", {}, t("Hits for {n}", { n: formatNumber(attackOfEntry(id, e!)) })) : null,
        ),
      );
    }
    if (known) {
      const line = this.family(id);
      if (line) body.append(line);
    }
    if (owned) {
      const needed = xpNeed(e!.level);
      body.append(h("div", { class: "bar xp" }, h("i", { style: { width: e!.level >= MAX_LEVEL ? "100%" : `${Math.min(100, (e!.xp / needed) * 100)}%` } }), h("span", {}, e!.level >= MAX_LEVEL ? t("MAX") : `${formatNumber(e!.xp)} / ${formatNumber(needed)}`)));
      const actions = h("div", { class: "actions" });
      const inParty = s.party.indexOf(id);
      if (inParty < 0) {
        actions.append(
          h("button", { class: "btn small primary", on: { click: () => this.add(id) } }, t("Add to party")),
          h("button", { class: "btn small", on: { click: () => this.lead(id) } }, t("Make leader")),
        );
      } else {
        if (inParty > 0) actions.append(h("button", { class: "btn small", on: { click: () => this.lead(id) } }, t("Make leader")));
        if (s.party.length > 1) actions.append(h("button", { class: "btn small", on: { click: () => this.remove(inParty) } }, t("Remove from party")));
      }
      actions.append(h("button", { class: "btn small gold", disabled: e!.candy < 10 || e!.level >= MAX_LEVEL, on: { click: () => this.candy(id) } }, itemImg("rare-candy", "inline"), t("Use candy ({n})", { n: e!.candy })));
      for (const to of evolutionsOf(id)) {
        const need = species(to).evoLevel;
        const ready = e!.level >= need;
        actions.append(h("button", { class: `btn small ${ready ? "primary" : ""}`, disabled: !ready, on: { click: () => this.evolve(id, to) } }, ready ? t("Evolve into {name}", { name: species(to).name }) : t("{name} at Lv {n}", { name: species(to).name, n: need })));
      }
      body.append(actions);
    }
    body.append(h("div", { class: "where" }, known ? whereToFind(id) : t("You have not met this creature yet.")));
    this.detail.replaceChildren(h("div", { class: "detail" }, pic, body));
  }

  /** The whole family of a creature in stages, each a small picture (a silhouette until it has been met). */
  private family(id: number): HTMLElement | null {
    const s = this.app.state;
    const root = rootOf(id);
    const stages: number[][] = [[root]];
    for (;;) {
      const next = stages[stages.length - 1]!.flatMap((x) => [...evolutionsOf(x)]);
      if (next.length === 0) break;
      stages.push(next);
    }
    if (stages.length === 1) return null;
    const columns: Array<Node | string> = [];
    stages.forEach((members, i) => {
      if (i > 0) columns.push(h("span", { class: "arrow" }, "▸"));
      columns.push(
        h(
          "div",
          { class: "stage-col" },
          ...members.map((m) => {
            const seen = s.dex[m]?.seen === true;
            const sp = species(m);
            const pic = spriteImg(m, "icon", seen ? "" : "dark", seen ? sp.name : "");
            return h(
              "button",
              { class: `fam ${m === id ? "current" : ""}`, type: "button", title: seen ? sp.name : "???", on: { click: () => this.select(m) } },
              pic,
              h("span", {}, sp.evoLevel > 0 ? t("Lv {n}", { n: sp.evoLevel }) : ""),
            );
          }),
        ),
      );
    });
    return h("div", { class: "family", "aria-label": t("Evolution line") }, ...columns);
  }

  private add(id: number): void {
    const s = this.app.state;
    const slots = partySlots(s);
    const ok = s.party.length < slots ? setParty(s, s.party.length, id) : setParty(s, slots - 1, id);
    this.app.audio.sfx(ok ? "select" : "error", 0.5);
    this.app.dirty();
  }

  private lead(id: number): void {
    const s = this.app.state;
    const ok = s.party.includes(id) ? setParty(s, 0, id) : s.party.length > 0 ? setParty(s, 0, id) : false;
    this.app.audio.sfx(ok ? "select" : "error", 0.5);
    this.app.dirty();
  }

  private remove(slot: number): void {
    const ok = setParty(this.app.state, slot, null);
    this.app.audio.sfx(ok ? "back" : "error", 0.5);
    this.app.dirty();
  }

  private candy(id: number): void {
    const s = this.app.state;
    const have = s.dex[id]?.candy ?? 0;
    const events: Parameters<App["handle"]>[0] = [];
    if (useCandy(s, id, Math.floor(have / 10) * 10, events)) {
      this.app.audio.sfx("levelup", 0.5);
      this.app.handle(events);
    }
    this.app.dirty();
  }

  private evolve(from: number, to: number): void {
    const events: Parameters<App["handle"]>[0] = [];
    if (evolve(this.app.state, from, to, events)) {
      this.app.handle(events);
      this.selected = to;
    }
    this.app.dirty();
  }
}

const setText = (el: Node, text: string): void => {
  if (el.textContent !== text) el.textContent = text;
};

void PLACES;
void REGION_COUNT;
