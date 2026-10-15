import { afterEach, describe, expect, it } from "vitest";

import { formatNumber, getNumberStyle, setNumberStyle } from "../src/engine/format.js";
import { BIOME_NAMES, THEMES, UI_SCALES, applyAppearance, getScene, isScene, isTheme, isUiScale } from "../src/web/appearance.js";
import { parseProfile } from "../src/web/session.js";

afterEach(() => setNumberStyle("short"));

const fakeRoot = () => {
  const classes = new Set<string>();
  const vars: Record<string, string> = {};
  return {
    dataset: {} as Record<string, string>,
    style: { setProperty: (k: string, v: string) => (vars[k] = v) },
    classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
    classes,
    vars,
  };
};

describe("how numbers are written", () => {
  it("short by default, in full, or in scientific form", () => {
    expect(getNumberStyle()).toBe("short");
    expect(formatNumber(1234567)).toBe("1.23M");
    setNumberStyle("full");
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(-1500)).toBe("-1,500");
    expect(formatNumber(5.5)).toBe("5.5");
    expect(formatNumber(1e30)).toBe("1.00e30");
    setNumberStyle("scientific");
    expect(formatNumber(1234567)).toBe("1.23e6");
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(2.5e12)).toBe("2.50e12");
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("∞");
  });
});

describe("what a player can choose", () => {
  it("starts with the defaults", () => {
    const p = parseProfile(null);
    expect(p).toMatchObject({ name: "", theme: "night", pageBackground: "dim", scene: "auto", uiScale: 1, numberFormat: "short", reduceMotion: false, bigCreatures: false });
  });

  it("keeps good choices and drops bad ones, one by one", () => {
    const p = parseProfile(JSON.stringify({ theme: "ocean", pageBackground: "off", scene: "cave", uiScale: 1.3, numberFormat: "full", reduceMotion: true, bigCreatures: true, name: "  Ash  " }));
    expect(p).toMatchObject({ theme: "ocean", pageBackground: "off", scene: "cave", uiScale: 1.3, numberFormat: "full", reduceMotion: true, bigCreatures: true, name: "Ash" });
    const bad = parseProfile(JSON.stringify({ theme: "neon", pageBackground: 3, scene: "moon", uiScale: 5, numberFormat: "roman", reduceMotion: "yes", bigCreatures: 1, name: 42 }));
    expect(bad).toMatchObject({ theme: "night", pageBackground: "dim", scene: "auto", uiScale: 1, numberFormat: "short", reduceMotion: false, bigCreatures: false, name: "" });
    const mixed = parseProfile(JSON.stringify({ theme: "red", scene: "volcano" }));
    expect(mixed.theme).toBe("red");
    expect(mixed.scene).toBe("auto");
  });

  it("keeps a name short and free of anything that could be markup or control characters", () => {
    expect(parseProfile(JSON.stringify({ name: "A".repeat(40) })).name).toHaveLength(16);
    expect(parseProfile(JSON.stringify({ name: "<img src=x onerror=1>" })).name).not.toMatch(/[<>]/);
    expect(parseProfile(JSON.stringify({ name: "a\u0000b\nc" })).name).toBe("abc");
  });

  it("lists every theme, scene and size once, and recognises only those", () => {
    for (const v of THEMES) expect(isTheme(v)).toBe(true);
    for (const v of BIOME_NAMES) expect(isScene(v)).toBe(true);
    for (const v of UI_SCALES) expect(isUiScale(v)).toBe(true);
    expect(isScene("auto")).toBe(true);
    expect(isTheme("light")).toBe(false);
    expect(isUiScale(2)).toBe(false);
    expect(new Set(THEMES).size).toBe(THEMES.length);
    expect(BIOME_NAMES).toHaveLength(13);
  });

  it("turns the choices into what the page wears", () => {
    const root = fakeRoot();
    const p = parseProfile(JSON.stringify({ theme: "forest", pageBackground: "bright", uiScale: 1.15, reduceMotion: true, bigCreatures: false, scene: "desert", numberFormat: "scientific" }));
    applyAppearance(p, root as unknown as HTMLElement);
    expect(root.dataset.theme).toBe("forest");
    expect(root.dataset.pageBackground).toBe("bright");
    expect(root.vars["--ui-zoom"]).toBe("1.15");
    expect(root.classes.has("reduce-motion")).toBe(true);
    expect(root.classes.has("big-creatures")).toBe(false);
    expect(getScene()).toBe("desert");
    expect(getNumberStyle()).toBe("scientific");
    applyAppearance(parseProfile(null), root as unknown as HTMLElement);
    expect(root.classes.has("reduce-motion")).toBe(false);
    expect(getScene()).toBe("auto");
  });
});
