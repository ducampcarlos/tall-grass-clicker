import { t } from "../../i18n/index.js";
import { formatDuration } from "../../engine/format.js";
import { type State } from "../../engine/game.js";
import { GAMES, GAMES_OPEN_AT, type GameDef, gamesOpen, restLeft } from "../../engine/minigames.js";
import type { App } from "../app.js";
import { h, setClass, setText } from "../dom.js";
import { itemImg } from "../icons.js";
import { startMemory } from "../minigames/memory.js";
import { startQuiz } from "../minigames/quiz.js";
import { openMiniGame, type GameStart } from "../minigames/shell.js";
import { startThrow } from "../minigames/throw.js";
import { startWhack } from "../minigames/whack.js";

const STARTS: Record<GameDef["id"], GameStart> = { throw: startThrow, memory: startMemory, quiz: startQuiz, whack: startWhack };

/** The mini-games: play for boosters, coins and balls. */
export class GamesView {
  readonly el: HTMLElement;
  private readonly intro = h("p", { class: "muted" });
  private readonly cards: Array<{ def: GameDef; play: HTMLButtonElement; rest: HTMLElement }> = [];

  constructor(private readonly app: App) {
    this.el = h("div", {}, this.intro);
    for (const def of GAMES) {
      const rest = h("div", { class: "d" });
      const play = h("button", { class: "btn small primary", on: { click: () => this.play(def) } }, t("Play"));
      this.cards.push({ def, play, rest });
      this.el.append(h("div", { class: "row" }, h("div", { class: "with-icon" }, itemImg(def.icon), h("div", {}, h("div", { class: "t" }, t(def.name)), h("div", { class: "d" }, t(def.text)), rest)), play));
    }
    this.el.append(h("p", { class: "muted" }, t("Three stars pay the most. A game can be played again after a short rest, and the rest runs while you play.")));
  }

  private play(def: GameDef): void {
    this.app.audio.sfx("open", 0.5);
    openMiniGame(this.app, def, STARTS[def.id]);
  }

  update(): void {
    const s: State = this.app.state;
    const open = gamesOpen(s);
    setText(this.intro, open ? t("Play for boosters, coins and balls.") : t("Defeat {n} creatures to open the games ({have}/{n}).", { n: GAMES_OPEN_AT, have: Math.min(GAMES_OPEN_AT, s.stats.kills) }));
    for (const c of this.cards) {
      const left = restLeft(s, c.def.id);
      c.play.disabled = !open || left > 0;
      setClass(c.play, "primary", open && left <= 0);
      setText(c.rest, !open ? "" : left > 0 ? t("Resting: ready in {time}", { time: formatDuration(Math.ceil(left)) }) : t("Ready"));
    }
  }
}
