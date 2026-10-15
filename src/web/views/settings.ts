import { LANGS, LANG_NAMES, getLang, setLang, t } from "../../i18n/index.js";
import type { App } from "../app.js";
import { h } from "../dom.js";
import { ABOUT_LINES, HELP_LINES } from "../help.js";
import { buildSave, parseSave } from "../savefile.js";
import { store } from "../storage.js";
import { downloadText, pickTextFile } from "../transfer.js";
import { confirmDialog, dialog, toast } from "../ui.js";

const toggle = (label: string, get: () => boolean, set: (v: boolean) => void): HTMLElement => {
  const input = h("input", { type: "checkbox", checked: get(), on: { change: () => set((input as HTMLInputElement).checked) } });
  return h("label", { class: "set" }, h("span", {}, label), input);
};

const slider = (label: string, get: () => number, set: (v: number) => void): HTMLElement => {
  const input = h("input", { type: "range", min: "0", max: "1", step: "0.1", value: String(get()), on: { input: () => set(Number((input as HTMLInputElement).value)) } });
  return h("label", { class: "set" }, h("span", {}, label), input);
};

export function showHelp(): void {
  dialog(t("How to play"), HELP_LINES.map((l) => t(l)));
}

export function showAbout(): void {
  dialog(t("About"), [...ABOUT_LINES.map((l) => t(l)), h("p", { class: "legal" }, t("Source code: "), h("a", { href: "https://github.com/ducampcarlos/tall-grass-clicker", target: "_blank", rel: "noopener" }, "github.com/ducampcarlos/tall-grass-clicker"))]);
}

/** The settings dialog: sound, language, playing options and the save file. */
export function openSettings(app: App): void {
  const profile = app.profile;
  const language = h("select", {
    on: {
      change: () => {
        const next = (language as HTMLSelectElement).value as (typeof LANGS)[number];
        setLang(next);
        document.documentElement.lang = next;
        profile.lang = next;
        app.saveProfile();
        // every text is drawn once, so draw the page again in the new language, with the settings open again
        app.rebuild();
        openSettings(app);
      },
    },
  });
  for (const l of LANGS) language.append(h("option", { value: l, selected: l === getLang() }, LANG_NAMES[l]));

  const s = app.state;
  const body = h(
    "div",
    { class: "settings" },
    h("label", { class: "set" }, h("span", {}, t("Language")), language),
    toggle(t("Sound"), () => !profile.muted, (v) => app.setMuted(!v)),
    slider(t("Music"), () => profile.musicVolume, (v) => app.setMusicVolume(v)),
    slider(t("Effects"), () => profile.sfxVolume, (v) => app.setSfxVolume(v)),
    toggle(t("Damage numbers"), () => profile.numbers, (v) => ((profile.numbers = v), app.saveProfile())),
    toggle(t("Passing creatures"), () => profile.roamers, (v) => ((profile.roamers = v), app.saveProfile())),
    toggle(t("Show shiny pictures"), () => profile.showShiny, (v) => ((profile.showShiny = v), app.saveProfile(), app.dirty(true))),
    toggle(t("Go on to the next place by itself"), () => s.settings.autoAdvance, (v) => (s.settings.autoAdvance = v)),
    toggle(t("Evolve by itself when there is only one way"), () => s.settings.autoEvolve, (v) => (s.settings.autoEvolve = v)),
    h("div", { class: "section-title" }, t("Your save")),
    h("p", { class: "muted" }, t("The game is kept in this browser. Export it to keep a copy, or to play somewhere else.")),
    h(
      "div",
      { class: "actions", style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
      h("button", { class: "btn primary", on: { click: () => exportSave(app) } }, t("Export")),
      h("button", { class: "btn gold", on: { click: () => importSave(app) } }, t("Import")),
      h("button", { class: "btn danger", on: { click: () => eraseGame(app) } }, t("Erase everything")),
    ),
    store.persistent ? null : h("p", { class: "red" }, t("Your browser is not keeping saves. Export your save to keep it.")),
  );
  dialog(t("Settings"), [body], [{ label: t("How to play"), keepOpen: true, onClick: () => showHelp() }, { label: t("About"), keepOpen: true, onClick: () => showAbout() }, { label: t("Done"), kind: "primary" }]);
}

function exportSave(app: App): void {
  app.session.save();
  const day = new Date().toISOString().slice(0, 10);
  downloadText(`tall-grass-clicker-save-${day}.json`, buildSave(app.profile, app.state));
  toast(t("Save exported. Keep the file safe."), { kind: "good" });
}

function importSave(app: App): void {
  pickTextFile(".json,application/json", (content) => {
    const imported = parseSave(content);
    if (!imported.ok) return toast(imported.error, { kind: "bad" });
    const when = imported.exported ? ` (${imported.exported.slice(0, 10)})` : "";
    confirmDialog(t("Import this save?"), t("Replace your progress with this save{when}? What you have now will be lost.", { when }), t("Replace"), t("Keep mine"), () => {
      app.session.restore(imported.profile, imported.state);
      window.location.reload();
    }, "danger");
  });
}

function eraseGame(app: App): void {
  confirmDialog(t("Erase everything?"), t("This deletes your whole game on this device: Pokédex, perks and all. Export first if you may want it back."), t("Erase"), t("Keep it"), () => {
    app.session.erase();
    window.location.reload();
  }, "danger");
}
