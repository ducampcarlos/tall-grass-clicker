/**
 * The game on the page: it owns the state, runs the clock, turns what the engine reports into
 * sounds and messages, and keeps the panels up to date.
 */

import { detectLang, setLang, t, tn } from "../i18n/index.js";
import { ACHIEVEMENTS, achievement } from "../engine/achievements.js";
import { formatDuration, formatNumber } from "../engine/format.js";
import { type GameEvent, type Result, type State, chooseStarter, claimRoamer, click as engineClick, evolutionTargets, marksFor, offline, tick } from "../engine/game.js";
import { species } from "../engine/dex.js";
import { REGIONS, place, poolOf } from "../engine/regions.js";
import { Audio, type Sfx } from "./audio.js";
import { $, h, replace } from "./dom.js";
import { TAB_ICON, itemImg } from "./icons.js";
import { eggLabel, placeTitle } from "./labels.js";
import { gamesOpen } from "../engine/minigames.js";
import { helperDef, helperOn, tickHelpers } from "../engine/helpers.js";
import { tierDef } from "../engine/items.js";
import type { Profile, Session } from "./session.js";
import { preload, spriteImg } from "./sprites.js";
import { dialog, toast } from "./ui.js";
import { BattleView } from "./views/battle.js";
import { BagView } from "./views/bag.js";
import { DexView } from "./views/dex.js";
import { EggsView } from "./views/eggs.js";
import { GamesView } from "./views/games.js";
import { PartyView } from "./views/party.js";
import { openSettings, showHelp } from "./views/settings.js";
import { ShopView } from "./views/shop.js";
import { TrainerView } from "./views/trainer.js";
import { WorldView } from "./views/world.js";

export type TabId = "shop" | "dex" | "eggs" | "world" | "bag" | "games" | "trainer";

interface View {
  el: HTMLElement;
  update(): void;
}

const SAVE_EVERY_MS = 5000;
const UI_EVERY_S = 0.2;

export class App {
  readonly audio = new Audio();
  private battle!: BattleView;
  private party!: PartyView;
  private views!: Record<TabId, View>;
  private tab: TabId = "shop";
  private tabButtons = new Map<TabId, HTMLButtonElement>();
  /** When the next creature crosses the battle (performance.now() ms). */
  private nextRoam = 0;
  /** Boss failures in a row at one place, to tell a stuck player that retiring pays. */
  private bossFails = { place: -1, count: 0, hinted: -1 };
  private viewHost!: HTMLElement;
  private coinsEl!: HTMLElement;
  private rateEl!: HTMLElement;
  private ballsEl!: HTMLElement;
  private dirtyFlag = true;
  private uiClock = 0;
  private lastFrame = 0;
  private lastSave = 0;
  private running = false;
  private lastSfx = new Map<string, number>();
  private lastNoBalls = 0;
  private lastKillPop = 0;
  private lastTrack: string | null = null;
  private income: Array<{ t: number; coins: number }> = [];

  constructor(readonly session: Session) {
    this.audio.muted = session.profile.muted;
    this.audio.musicVolume = session.profile.musicVolume;
    this.audio.sfxVolume = session.profile.sfxVolume;
  }

  get state(): State {
    return this.session.state!;
  }
  get profile(): Profile {
    return this.session.profile;
  }

  // ---- starting ----------------------------------------------------------------------------

  start(): void {
    const unlock = () => this.audio.unlock();
    window.addEventListener("pointerdown", unlock, { once: false });
    window.addEventListener("keydown", unlock, { once: false });
    if (!this.session.state) {
      this.session.start();
      this.build(false);
      this.chooseStarterDialog();
    } else {
      this.build(true);
      this.begin();
      this.welcomeBack();
    }
    window.addEventListener("keydown", (e) => this.hotkey(e));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.session.save();
    });
    window.addEventListener("pagehide", () => this.session.save());
  }

  private chooseStarterDialog(): void {
    const starters = REGIONS[0]!.starters;
    preload(starters, "normal");
    const cards = starters.map((id) =>
      h("button", { class: "starter", on: { click: () => this.pickStarter(id) } }, spriteImg(id, "normal", "", species(id).name), h("span", {}, species(id).name)),
    );
    dialog(
      t("Welcome to Tall Grass Clicker!"),
      [t("Choose your first partner."), h("div", { class: "starters" }, ...cards), h("p", { class: "legal" }, t("An unofficial fan-made game: free, open source and not affiliated with the creators of the creatures shown."))],
      [],
      { dismiss: false, noButtons: true },
    );
  }

  private pickStarter(id: number): void {
    if (!chooseStarter(this.state, id)) return;
    $("modal").replaceChildren();
    this.build(true);
    this.audio.unlock();
    this.audio.sfx("confirm", 0.8);
    this.begin();
    if (!this.profile.seenIntro) {
      this.profile.seenIntro = true;
      this.saveProfile();
      showHelp();
    }
  }

  private begin(): void {
    this.lastFrame = performance.now();
    this.lastSave = this.lastFrame;
    if (!this.running) {
      this.running = true;
      requestAnimationFrame(this.frame);
    }
    this.dirty(true);
  }

  private welcomeBack(): void {
    const away = this.session.awaySeconds;
    this.session.awaySeconds = 0;
    if (away < 60) return;
    const r = offline(this.state, away);
    this.dirty(true);
    dialog(t("Welcome back!"), [
      t("You were away for {time}. Your party kept fighting at half strength.", { time: formatDuration(away) }),
      t("It earned {coins} coins and defeated {kills} creatures.", { coins: formatNumber(r.coins), kills: formatNumber(r.kills) }),
    ]);
  }

  // ---- the page ----------------------------------------------------------------------------

  /** Draw the page. Called once, and again when the language changes. */
  build(started: boolean): void {
    this.coinsEl = h("b", {}, "0");
    this.rateEl = h("small", {}, "");
    this.ballsEl = h("b", {}, "0");
    const top = h(
      "header",
      { class: "top" },
      h("div", { class: "stat" }, h("span", { class: "coin" }), this.coinsEl, this.rateEl),
      h("div", { class: "stat", title: t("Capture Balls") }, itemImg("poke-ball", "stat-ico"), this.ballsEl),
      h("div", { class: "grow" }),
      h("button", { class: "btn small", on: { click: () => showHelp() } }, "?"),
      h("button", { class: "btn small icon-btn", title: t("Settings"), "aria-label": t("Settings"), on: { click: () => openSettings(this) } }, "⚙"),
    );
    if (!started) {
      replace($("app"), top, h("p", { class: "muted" }));
      return;
    }
    this.battle = new BattleView(this);
    this.party = new PartyView(this);
    this.views = { shop: new ShopView(this), dex: new DexView(this), eggs: new EggsView(this), world: new WorldView(this), bag: new BagView(this), games: new GamesView(this), trainer: new TrainerView(this) };
    const labels: Record<TabId, string> = { shop: t("Shop"), dex: t("Pokédex"), eggs: t("Eggs"), world: t("World"), bag: t("Bag"), games: t("Games"), trainer: t("Trainer") };
    this.tabButtons.clear();
    const tabs = h("nav", { class: "tabs", role: "tablist" });
    for (const id of Object.keys(labels) as TabId[]) {
      const b = h("button", { class: "tab", role: "tab", on: { click: () => this.showTab(id) } }, itemImg(TAB_ICON[id]!), h("span", {}, labels[id]));
      this.tabButtons.set(id, b);
      tabs.append(b);
    }
    this.viewHost = h("div", { class: "view" });
    replace(
      $("app"),
      top,
      h("div", { class: "layout" }, h("div", { class: "left" }, this.battle.el, this.party.el), h("div", { class: "right" }, h("section", { class: "card" }, tabs, this.viewHost))),
    );
    this.showTab(this.tab);
  }

  /** Redraw everything in the current language. */
  rebuild(): void {
    this.build(true);
    this.dirty(true);
  }

  showTab(id: TabId): void {
    this.tab = id;
    for (const [key, b] of this.tabButtons) b.classList.toggle("on", key === id);
    replace(this.viewHost, this.views[id].el);
    this.views[id].update();
    this.audio.sfx("select", 0.3);
  }

  openDex(id: number): void {
    this.showTab("dex");
    (this.views.dex as DexView).select(id);
  }

  dirty(force = false): void {
    this.dirtyFlag = true;
    if (force) this.uiClock = UI_EVERY_S;
  }

  // ---- the clock ---------------------------------------------------------------------------

  private frame = (now: number): void => {
    const real = Math.max(0, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const s = this.state;
    const dt = Math.min(real, 0.25);
    // a hidden tab is not given frames: the time it missed is time away
    if (real > 5) this.catchUp(real - dt);
    const events = tick(s, dt);
    this.handle(events);
    this.handle(tickHelpers(s, dt, events));
    this.battle.frame(s);
    this.roamer(now);
    this.uiClock += dt;
    if (this.dirtyFlag || this.uiClock >= UI_EVERY_S) {
      this.uiClock = 0;
      this.dirtyFlag = false;
      this.refresh();
    }
    if (now - this.lastSave > SAVE_EVERY_MS) {
      this.lastSave = now;
      this.session.save();
    }
    requestAnimationFrame(this.frame);
  };

  /** Bring the next passing creature forward (the end-to-end tests use it). */
  roamSoon(): void {
    this.nextRoam = performance.now() + 300;
  }

  /** Now and then a creature crosses the battle: tap it for a gift. */
  private roamer(now: number): void {
    if (this.nextRoam === 0) this.nextRoam = now + 40_000 + Math.random() * 30_000;
    if (now < this.nextRoam || !this.profile.roamers || document.hidden || $("modal").childElementCount > 0) return;
    const s = this.state;
    const pool = poolOf(place(s.place));
    const sp = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)]!.id : 1 + Math.floor(Math.random() * 649);
    const shiny = Math.random() < 1 / 40;
    this.nextRoam = now + 75_000 + Math.random() * 75_000;
    const claim = () => {
      const events: GameEvent[] = [];
      claimRoamer(this.state, sp, shiny, events);
      this.handle(events);
      this.dirty();
    };
    if (this.battle.roam(sp, shiny, claim) && helperOn(this.state, "net")) window.setTimeout(() => this.battle.tapRoamer(), 1500);
  }

  private catchUp(seconds: number): void {
    if (seconds < 30) return;
    const r = offline(this.state, seconds);
    toast(t("Away for {time}: +{coins} coins, {kills} defeated.", { time: formatDuration(seconds), coins: formatNumber(r.coins), kills: formatNumber(r.kills) }), { kind: "good" });
  }

  private refresh(): void {
    const s = this.state;
    this.coinsEl.textContent = formatNumber(s.coins);
    this.ballsEl.textContent = formatNumber((s.balls[0] ?? 0) + (s.balls[1] ?? 0) + (s.balls[2] ?? 0));
    const now = performance.now() / 1000;
    this.income.push({ t: now, coins: s.lifetimeCoins });
    while (this.income.length > 2 && now - this.income[0]!.t > 10) this.income.shift();
    const first = this.income[0]!;
    const rate = now - first.t > 1 ? (s.lifetimeCoins - first.coins) / (now - first.t) : 0;
    this.rateEl.textContent = rate > 0 ? `+${formatNumber(rate)}/s` : "";
    this.party.update();
    this.views[this.tab].update();
    this.dots();
    const boss = s.wild?.boss ? "boss" : "menu";
    if (boss !== this.lastTrack) {
      this.lastTrack = boss;
      this.audio.music(boss);
    }
  }

  /** A red dot on the tabs that have something waiting. */
  private dots(): void {
    const s = this.state;
    const can: Record<TabId, boolean> = {
      shop: false,
      dex: s.party.some((id) => evolutionTargets(s, id).length > 0),
      eggs: (s.bag.some((n) => n > 0) && s.eggs.length < 1 + (s.upgrades.incubator ?? 0)) || false,
      world: false,
      bag: Object.keys(s.items).length > 0 && s.buffs.length === 0,
      games: gamesOpen(s) && Object.keys(s.cooldowns).length === 0,
      trainer: s.marks > 0,
    };
    for (const [id, b] of this.tabButtons) {
      const has = b.querySelector(".dot") !== null;
      if (can[id] && !has) b.append(h("span", { class: "dot" }));
      else if (!can[id] && has) b.querySelector(".dot")!.remove();
    }
  }

  // ---- what the player does ----------------------------------------------------------------

  click(x: number, y: number): void {
    this.audio.unlock();
    const r = engineClick(this.state);
    this.battle.hit();
    this.sound("hit_soft", r.crit ? 0.7 : 0.35, r.crit ? 0.8 : 0.9 + Math.random() * 0.3);
    if (this.profile.numbers) this.battle.pop(r.crit ? `${formatNumber(r.damage)}!` : formatNumber(r.damage), x, y, r.crit ? "crit" : "");
    this.handle(r.events);
    this.dirty();
  }

  /** Show the error of a failed command; true when it worked. */
  act(r: Result): boolean {
    if (r.ok) return true;
    toast(r.error, { kind: "bad" });
    this.sound("error", 0.4);
    return false;
  }

  private sound(name: Sfx, volume: number, rate = 1): void {
    const now = performance.now();
    if (now - (this.lastSfx.get(name) ?? 0) < 70) return;
    this.lastSfx.set(name, now);
    this.audio.sfx(name, volume, rate);
  }

  /** Turn what the engine reports into sound, messages and pictures. */
  handle(events: GameEvent[]): void {
    if (events.length === 0) return;
    const now = performance.now();
    for (const e of events) {
      switch (e.t) {
        case "kill":
          if (now - this.lastKillPop > 120) {
            this.lastKillPop = now;
            if (this.profile.numbers) this.battle.pop(`+${formatNumber(e.coins)}`, 60 + Math.random() * 200, 70, "coin");
            this.sound("coin", 0.35, 0.9 + Math.random() * 0.4);
          }
          break;
        case "caught":
          if (e.fresh || e.shiny) toast(e.fresh ? t("Caught {name}!", { name: species(e.sp).name }) : t("A shiny {name}!", { name: species(e.sp).name }), { sprite: e.sp, kind: e.shiny ? "shiny" : "good" });
          if (e.fresh || e.shiny) this.battle.throwBall(e.ball, true);
          this.sound(e.shiny ? "bell" : "confirm", e.shiny ? 0.8 : 0.6, e.shiny ? 1.2 : 1);
          this.dirty();
          break;
        case "escaped":
          this.battle.throwBall(e.ball, false);
          if (this.profile.numbers) this.battle.pop(t("It broke free!"), 120 + Math.random() * 120, 100);
          break;
        case "fled":
          if (now - this.lastNoBalls > 15000) {
            this.lastNoBalls = now;
            toast(t("Out of balls! {name} got away. Buy more in the Shop.", { name: species(e.sp).name }), { kind: "bad" });
          }
          break;
        case "levelUp":
          this.sound("levelup", 0.3, 1.1);
          break;
        case "canEvolve":
          toast(t("{name} can evolve!", { name: species(e.sp).name }), { sprite: e.sp, kind: "good" });
          this.dirty();
          break;
        case "evolved":
          toast(t("{from} evolved into {to}!", { from: species(e.from).name, to: species(e.to).name }), { sprite: e.to, kind: "good" });
          this.sound("levelup", 0.7, 1.3);
          this.dirty(true);
          break;
        case "hatched":
          toast(e.shiny ? t("A shiny {name} hatched!", { name: species(e.sp).name }) : t("{name} hatched!", { name: species(e.sp).name }), { sprite: e.sp, kind: e.shiny ? "shiny" : "good" });
          this.sound("bell", 0.7);
          this.dirty();
          break;
        case "roam": {
          const name = species(e.sp).name;
          const text =
            e.kind === "coins" ? t("{name} dropped {amount} coins!", { name, amount: formatNumber(e.amount) })
            : e.kind === "balls" ? t("{name} left {amount} balls!", { name, amount: e.amount })
            : e.kind === "egg" ? t("{name} left an egg: {egg}!", { name, egg: eggLabel((e.tier ?? 0) as 0 | 1 | 2 | 3) })
            : t("{name} shared {amount} candy with your party!", { name, amount: e.amount });
          toast(text, { sprite: e.sp, kind: e.shiny ? "shiny" : "good" });
          this.sound(e.shiny ? "bell" : "coins", 0.7);
          break;
        }
        case "buffEnded":
          toast(t("{name} ran out.", { name: t(tierDef(e.id, e.tier).name) }), { kind: "bad" });
          this.sound("back", 0.4);
          this.dirty();
          break;
        case "helperUnlocked": {
          // several can open in the same moment (an old save with a lot of play): say it once
          const opened = events.filter((x) => x.t === "helperUnlocked");
          if (events.find((x) => x.t === "helperUnlocked") !== e) break;
          toast(
            opened.length === 1
              ? t("A helper is ready: {name}! It is on; you can turn it off in the Trainer tab.", { name: t(helperDef(e.id as Parameters<typeof helperDef>[0]).name) })
              : t("{n} helpers are ready! They are on; you can turn them off in the Trainer tab.", { n: opened.length }),
            { kind: "big" },
          );
          this.sound("bell", 0.8);
          this.dirty();
          break;
        }
        case "unlocked":
          toast(t("New place: {name}", { name: placeTitle(place(e.place)) }), { kind: "good" });
          this.sound("open", 0.5);
          this.dirty();
          break;
        case "bossFailed": {
          toast(t("It got away! Get stronger and try again."), { kind: "bad" });
          const f = this.bossFails;
          f.count = f.place === e.place ? f.count + 1 : 1;
          f.place = e.place;
          const pays = marksFor(this.state);
          if (f.count >= 3 && pays >= 1 && f.hinted !== e.place) {
            f.hinted = e.place;
            toast(tn(pays, "Stuck? Retiring now would pay {n} Mark: see the Trainer tab.", "Stuck? Retiring now would pay {n} Marks: see the Trainer tab."), { kind: "big" });
          }
          this.sound("error", 0.5);
          this.dirty();
          break;
        }
        case "champion":
          toast(t("You beat the champion of {region}! A Legendary Egg and a Master Ball!", { region: REGIONS[e.region]!.name }), { kind: "big" });
          this.sound("bell", 1, 0.8);
          this.dirty(true);
          break;
        case "egg":
          break;
        case "achievement": {
          const a = achievement(e.id);
          if (a) toast(t("Achievement: {name}", { name: t(a.name) }), { kind: "shiny" });
          this.sound("glass", 0.5);
          this.dirty();
          break;
        }
        case "candy":
          break;
      }
    }
  }

  // ---- settings ----------------------------------------------------------------------------

  saveProfile(): void {
    this.session.saveProfile();
  }

  /** Keys: 1 to 5 switch tabs, Space attacks, M mutes, H shows the help. */
  private hotkey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat && e.key !== " ") return;
    if ($("modal").childElementCount > 0 || !this.running) return;
    const target = e.target as HTMLElement;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
    const tabs = Object.keys(this.views) as TabId[];
    if (e.key >= "1" && e.key <= "7") this.showTab(tabs[Number(e.key) - 1]!);
    else if (e.key === "m" || e.key === "M") this.setMuted(!this.profile.muted);
    else if (e.key === "h" || e.key === "H" || e.key === "?") showHelp();
    else if (e.key === " " && target === document.body) {
      e.preventDefault();
      this.click(this.battle.el.clientWidth / 2, 150);
    }
  }

  setMuted(muted: boolean): void {
    this.profile.muted = muted;
    this.audio.setMuted(muted);
    this.saveProfile();
  }

  setMusicVolume(v: number): void {
    this.profile.musicVolume = v;
    this.audio.setMusicVolume(v);
    this.saveProfile();
  }

  setSfxVolume(v: number): void {
    this.profile.sfxVolume = v;
    this.audio.sfxVolume = v;
    this.saveProfile();
    this.audio.sfx("coin", 0.6);
  }
}

void ACHIEVEMENTS;
void detectLang;
void setLang;
void tn;
