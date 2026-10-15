import { LANGS, LANG_NAMES, getLang, setLang, t } from "../../i18n/index.js";
import type { App } from "../app.js";
import { h } from "../dom.js";
import { ABOUT_LINES, HELP_LINES } from "../help.js";
import { canShare, copyCode, eraseGame, exportFile, importFile, pasteCode, shareFile, showBackups } from "../saveio.js";
import { store } from "../storage.js";
import { dialog } from "../ui.js";
import { BIOME_NAMES, PAGE_BACKGROUNDS, THEMES, UI_SCALES, applyAppearance, type Scene } from "../appearance.js";
import { NUMBER_STYLES, type NumberStyle } from "../../engine/format.js";
import { placeName } from "../labels.js";

const toggle = (label: string, get: () => boolean, set: (v: boolean) => void): HTMLElement => {
  const input = h("input", { type: "checkbox", checked: get(), on: { change: () => set((input as HTMLInputElement).checked) } });
  return h("label", { class: "set" }, h("span", {}, label), input);
};

const slider = (label: string, get: () => number, set: (v: number) => void): HTMLElement => {
  const input = h("input", { type: "range", min: "0", max: "1", step: "0.1", value: String(get()), on: { input: () => set(Number((input as HTMLInputElement).value)) } });
  return h("label", { class: "set" }, h("span", {}, label), input);
};

const THEME_NAMES: Record<(typeof THEMES)[number], () => string> = { night: () => t("Night"), red: () => t("Red"), forest: () => t("Forest green"), twilight: () => t("Twilight"), ocean: () => t("Ocean") };
const PAGE_NAMES: Record<(typeof PAGE_BACKGROUNDS)[number], () => string> = { dim: () => t("Dim"), bright: () => t("Bright"), off: () => t("None") };
const SCALE_NAMES: Record<string, () => string> = { "0.9": () => t("Small"), "1": () => t("Normal"), "1.15": () => t("Large"), "1.3": () => t("Huge") };
const NUMBER_NAMES: Record<NumberStyle, () => string> = { short: () => t("Short"), full: () => t("Full"), scientific: () => t("Scientific") };
const sample = (style: NumberStyle): string => (style === "short" ? "1.23M" : style === "full" ? "1,234,567" : "1.23e6");
const SCENE_PLACE: Record<(typeof BIOME_NAMES)[number], string> = { meadow: "Meadow", forest: "Forest", cave: "Cave", lake: "Lake", hills: "Hills", gym: "Gym", swamp: "Swamp", desert: "Desert", haunted: "Haunted Tower", power: "Power Plant", victory: "Victory Road", champion: "Champion", tower: "Tower" };
const sceneName = (biome: (typeof BIOME_NAMES)[number]): string => placeName(SCENE_PLACE[biome]);

export function showHelp(): void {
  dialog(t("How to play"), HELP_LINES.map((l) => t(l)));
}

export function showAbout(): void {
  dialog(t("About"), [...ABOUT_LINES.map((l) => t(l)), h("p", { class: "legal" }, t("Source code: "), h("a", { href: "https://github.com/ducampcarlos/tall-grass-clicker", target: "_blank", rel: "noopener" }, "github.com/ducampcarlos/tall-grass-clicker"))]);
}

/** A choice among a few things. `look` choices redraw the page, so that it shows at once. */
function choice<T extends string | number>(app: App, label: string, options: ReadonlyArray<readonly [T, string]>, get: () => T, set: (v: T) => void, redraw = false): HTMLElement {
  const select = h("select", {
    "aria-label": label,
    on: {
      change: () => {
        const picked = options[(select as HTMLSelectElement).selectedIndex]![0];
        set(picked);
        app.saveProfile();
        applyAppearance(app.profile);
        if (redraw) {
          app.rebuild();
          openSettings(app);
        }
      },
    },
  });
  for (const [value, text] of options) select.append(h("option", { value: String(value), selected: value === get() }, text));
  return h("label", { class: "set" }, h("span", {}, label), select);
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
    h("div", { class: "section-title" }, t("Look")),
    h("label", { class: "set" }, h("span", {}, t("Trainer name")), h("input", { type: "text", maxLength: 16, value: profile.name, placeholder: t("Trainer"), "aria-label": t("Trainer name"), on: { change: (e) => ((profile.name = (e.target as HTMLInputElement).value.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 16)), app.saveProfile()) } })),
    choice(app, t("Colours"), THEMES.map((v) => [v, THEME_NAMES[v]()] as const), () => profile.theme, (v) => (profile.theme = v)),
    choice(app, t("Picture behind the page"), PAGE_BACKGROUNDS.map((v) => [v, PAGE_NAMES[v]()] as const), () => profile.pageBackground, (v) => (profile.pageBackground = v)),
    choice(app, t("Picture behind the battle"), [["auto", t("Follow the place")] as const, ...BIOME_NAMES.map((v) => [v, sceneName(v)] as const)] as ReadonlyArray<readonly [Scene, string]>, () => profile.scene, (v) => (profile.scene = v), true),
    choice(app, t("Size of everything"), UI_SCALES.map((v) => [v, SCALE_NAMES[String(v)]!()] as const), () => profile.uiScale, (v) => (profile.uiScale = v)),
    choice(app, t("Big numbers"), NUMBER_STYLES.map((v) => [v, `${NUMBER_NAMES[v]()} (${sample(v)})`] as const), () => profile.numberFormat, (v) => (profile.numberFormat = v as NumberStyle)),
    toggle(t("Reduce motion"), () => profile.reduceMotion, (v) => ((profile.reduceMotion = v), app.saveProfile(), applyAppearance(profile))),
    toggle(t("Bigger creatures in battle"), () => profile.bigCreatures, (v) => ((profile.bigCreatures = v), app.saveProfile(), applyAppearance(profile), app.rebuild(), openSettings(app))),
    h("div", { class: "section-title" }, t("Playing")),
    toggle(t("Passing creatures"), () => profile.roamers, (v) => ((profile.roamers = v), app.saveProfile())),
    toggle(t("Show shiny pictures"), () => profile.showShiny, (v) => ((profile.showShiny = v), app.saveProfile(), app.dirty(true))),
    toggle(t("Go on to the next place by itself"), () => s.settings.autoAdvance, (v) => (s.settings.autoAdvance = v)),
    toggle(t("Evolve by itself when there is only one way"), () => s.settings.autoEvolve, (v) => (s.settings.autoEvolve = v)),
    h("div", { class: "section-title" }, t("Your save")),
    h("p", { class: "muted" }, t("The game is kept in this browser. Export it to keep a copy, or to play somewhere else.")),
    h(
      "div",
      { class: "actions", style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
      h("button", { class: "btn primary", on: { click: () => exportFile(app) } }, t("Export")),
      h("button", { class: "btn gold", on: { click: () => importFile(app) } }, t("Import")),
      h("button", { class: "btn", on: { click: () => void copyCode(app) } }, t("Copy code")),
      h("button", { class: "btn", on: { click: () => pasteCode(app) } }, t("Paste code")),
      canShare() ? h("button", { class: "btn", on: { click: () => void shareFile(app) } }, t("Share")) : null,
      h("button", { class: "btn", on: { click: () => showBackups(app) } }, t("Safety copies")),
      h("button", { class: "btn danger", on: { click: () => eraseGame(app) } }, t("Erase everything")),
    ),
    store.persistent ? null : h("p", { class: "red" }, t("Your browser is not keeping saves. Export your save to keep it.")),
  );
  dialog(t("Settings"), [body], [{ label: t("How to play"), keepOpen: true, onClick: () => showHelp() }, { label: t("About"), keepOpen: true, onClick: () => showAbout() }, { label: t("Done"), kind: "primary" }]);
}

