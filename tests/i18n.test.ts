import { afterEach, describe, expect, it } from "vitest";

import { LANGS, LANG_NAMES, detectLang, fill, getLang, hasTranslation, isLang, setLang, t, tn, translate, type Lang } from "../src/i18n/index.js";
import { ES } from "../src/i18n/es.js";
import { PT } from "../src/i18n/pt.js";
import { allKeys, placeholders } from "./support/i18nKeys.js";

afterEach(() => setLang("en"));

const TRANSLATED: Array<[Lang, Record<string, string>]> = [["es", ES], ["pt", PT]];

describe("translating", () => {
  it("returns the English text itself when there is no translation, and fills placeholders", () => {
    expect(t("Not a text anyone translated")).toBe("Not a text anyone translated");
    expect(t("Floor {n}", { n: 3 })).toBe("Floor 3");
    expect(fill("{a} and {b}", { a: 1 })).toBe("1 and {b}");
    expect(fill("no placeholders")).toBe("no placeholders");
  });

  it("speaks the language that is set, and goes back", () => {
    expect(getLang()).toBe("en");
    setLang("es");
    expect(t("Missing")).toBe(ES["Missing"]);
    expect(t("Missing")).not.toBe("Missing");
    setLang("pt");
    expect(t("Missing")).toBe(PT["Missing"]);
    setLang("en");
    expect(t("Missing")).toBe("Missing");
  });

  it("chooses between singular and plural, and fills the number", () => {
    const one = "{n} creature", many = "{n} creatures";
    expect(tn(1, one, many)).toBe("1 creature");
    expect(tn(0, one, many)).toBe("0 creatures");
    expect(tn(5, one, many)).toBe("5 creatures");
  });

  it("translates by language without touching the current one", () => {
    expect(translate("es", "Missing")).toBe(ES["Missing"]);
    expect(translate("en", "Missing")).toBe("Missing");
    expect(getLang()).toBe("en");
    expect(hasTranslation("en", "anything")).toBe(true);
    expect(hasTranslation("es", "constructor")).toBe(false); // not inherited from Object
    expect(hasTranslation("pt", "toString")).toBe(false);
  });

  it("recognises the languages, and picks the first one the browser prefers that the game speaks", () => {
    expect(LANGS).toEqual(["en", "es", "pt"]);
    for (const l of LANGS) expect(LANG_NAMES[l].length).toBeGreaterThan(1);
    expect(isLang("es")).toBe(true);
    expect(isLang("fr")).toBe(false);
    expect(detectLang(["fr-FR", "es-AR", "en"])).toBe("es");
    expect(detectLang(["pt-BR"])).toBe("pt");
    expect(detectLang(["de", "fr"])).toBe("en");
    expect(detectLang([])).toBe("en");
  });
});

describe("the translations", () => {
  const keys = allKeys();

  it("finds the texts of the game", () => {
    expect(keys.length).toBeGreaterThan(300);
    expect(keys.map((k) => k.key)).toContain("Strong Fists");
  });

  for (const [lang, dict] of TRANSLATED) {
    it(`${lang}: translates every text of the game`, () => {
      const missing = keys.filter((k) => !hasTranslation(lang, k.key)).map((k) => k.key);
      expect(missing).toEqual([]);
    });

    it(`${lang}: has nothing that the game does not use`, () => {
      const known = new Set(keys.map((k) => k.key));
      expect(Object.keys(dict).filter((k) => !known.has(k))).toEqual([]);
    });

    it(`${lang}: keeps every {placeholder} and leaves no text empty`, () => {
      for (const [source, text] of Object.entries(dict)) {
        expect(text.trim().length, source).toBeGreaterThan(0);
        expect(placeholders(text), source).toEqual(placeholders(source));
      }
    });
  }
});
