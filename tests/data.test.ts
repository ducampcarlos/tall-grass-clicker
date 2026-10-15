import { describe, expect, it } from "vitest";

import { MAX_SPECIES, SPECIES, evolutionsOf, hasSpecies, isSpecial, isStarterLine, rootOf, species, typeName } from "../src/engine/dex.js";
import { TYPE_NAMES } from "../src/engine/dex.generated.js";
import { formatDuration, formatNumber } from "../src/engine/format.js";
import { IMMUNE, bestEffectiveness, effectiveness } from "../src/engine/typechart.js";

const id = (name: string): number => SPECIES.find((s) => s.name === name)!.id;
const type = (name: string): number => TYPE_NAMES.indexOf(name as (typeof TYPE_NAMES)[number]);

describe("the Pokédex data", () => {
  it("has the 649 creatures of Generations 1 to 5, in order, with plain names", () => {
    expect(SPECIES).toHaveLength(MAX_SPECIES);
    SPECIES.forEach((s, i) => expect(s.id, s.name).toBe(i + 1));
    expect(new Set(SPECIES.map((s) => s.name)).size).toBe(MAX_SPECIES);
    for (const s of SPECIES) expect(s.name, `#${s.id}`).toMatch(/^[A-Za-z0-9 .'-]+$/);
    expect(species(1).name).toBe("Bulbasaur");
    expect(species(649).name).toBe("Genesect");
    expect(() => species(0)).toThrow();
    expect(() => species(650)).toThrow();
    expect([hasSpecies(1), hasSpecies(649), hasSpecies(0), hasSpecies(650), hasSpecies(1.5), hasSpecies("1")]).toEqual([true, true, false, false, false, false]);
  });

  it("gives every creature one or two real types, a believable strength and a generation", () => {
    for (const s of SPECIES) {
      expect(s.types.length, s.name).toBeGreaterThanOrEqual(1);
      expect(s.types.length, s.name).toBeLessThanOrEqual(2);
      for (const t of s.types) expect(t >= 0 && t < 18, `${s.name} type ${t}`).toBe(true);
      expect(s.types[0]).not.toBe(s.types[1]);
      expect(s.bst, s.name).toBeGreaterThanOrEqual(150);
      expect(s.bst, s.name).toBeLessThanOrEqual(780);
      expect(s.catchRate, s.name).toBeGreaterThanOrEqual(3);
      expect(s.catchRate, s.name).toBeLessThanOrEqual(255);
      expect(s.gen).toBeGreaterThanOrEqual(1);
      expect(s.gen).toBeLessThanOrEqual(5);
    }
    // the generations are the known blocks
    expect(species(151).gen).toBe(1);
    expect(species(152).gen).toBe(2);
    expect(species(251).gen).toBe(2);
    expect(species(252).gen).toBe(3);
    expect(species(386).gen).toBe(3);
    expect(species(387).gen).toBe(4);
    expect(species(493).gen).toBe(4);
    expect(species(494).gen).toBe(5);
  });

  it("knows a few creatures well", () => {
    expect(species(25).types.map(typeName)).toEqual(["electric"]);
    expect(species(6).types.map(typeName)).toEqual(["fire", "flying"]);
    expect(species(1).types.map(typeName)).toEqual(["grass", "poison"]);
    expect(species(150).legendary).toBe(true);
    expect(species(151).mythical).toBe(true);
    expect(species(172).baby).toBe(true); // Pichu
    expect(species(25).baby).toBe(false);
    expect(species(129).catchRate).toBe(255); // Magikarp
    expect(species(150).catchRate).toBe(3);
    expect(species(150).bst).toBe(680);
    expect(species(129).bst).toBe(200);
  });

  it("describes evolution as a family tree with levels", () => {
    expect(species(2).from).toBe(1);
    expect(species(2).evoLevel).toBe(16);
    expect(species(3).evoLevel).toBe(32);
    expect(species(130).evoLevel).toBe(20); // Gyarados
    expect([species(1).stage, species(2).stage, species(3).stage]).toEqual([1, 2, 3]);
    expect(evolutionsOf(1)).toEqual([2]);
    expect(evolutionsOf(3)).toEqual([]);
    expect([...evolutionsOf(133)].sort((a, b) => a - b)).toEqual([134, 135, 136, 196, 197, 470, 471]); // Eevee and its seven forms of the first five generations
    expect(rootOf(6)).toBe(4);
    expect(rootOf(4)).toBe(4);
    expect(rootOf(id("Machamp"))).toBe(id("Machop"));
    for (const s of SPECIES) {
      if (s.from) {
        expect(s.from, s.name).toBeLessThan(MAX_SPECIES + 1);
        expect(s.evoLevel, `${s.name} needs a level to evolve at`).toBeGreaterThan(0);
        expect(evolutionsOf(s.from)).toContain(s.id);
        expect(s.stage).toBe(species(s.from).stage + 1);
      } else {
        expect(s.evoLevel).toBe(0);
        expect(s.stage).toBe(1);
      }
    }
  });

  it("tells the special ones and the starters apart", () => {
    const special = SPECIES.filter(isSpecial);
    expect(special.length).toBeGreaterThan(40);
    expect(special.length).toBeLessThan(100);
    expect(special.every((s) => s.stage === 1 || s.legendary || s.mythical)).toBe(true);
    expect([isStarterLine(1), isStarterLine(3), isStarterLine(4), isStarterLine(25), isStarterLine(501)]).toEqual([true, true, true, false, true]);
  });
});

describe("the type chart", () => {
  it("has the 18 types and only the four known multipliers", () => {
    expect(TYPE_NAMES).toHaveLength(18);
    for (let a = 0; a < 18; a++) for (let d = 0; d < 18; d++) expect([IMMUNE, 0.5, 1, 2], `${a} vs ${d}`).toContain(effectiveness(a, [d]));
  });

  it("gets the classic matchups right", () => {
    const e = (a: string, ...d: string[]) => effectiveness(type(a), d.map(type));
    expect(e("fire", "grass")).toBe(2);
    expect(e("water", "fire")).toBe(2);
    expect(e("grass", "water")).toBe(2);
    expect(e("fire", "water")).toBe(0.5);
    expect(e("normal", "ghost")).toBe(IMMUNE);
    expect(e("ghost", "normal")).toBe(IMMUNE);
    expect(e("electric", "ground")).toBe(IMMUNE);
    expect(e("ground", "flying")).toBe(IMMUNE);
    expect(e("dragon", "fairy")).toBe(IMMUNE);
    expect(e("fairy", "dragon")).toBe(2);
    expect(e("steel", "fairy")).toBe(2);
    expect(e("psychic", "dark")).toBe(IMMUNE);
    expect(e("poison", "steel")).toBe(IMMUNE);
  });

  it("multiplies against two types: double weakness 4x, double resistance a quarter", () => {
    const e = (a: string, ...d: string[]) => effectiveness(type(a), d.map(type));
    expect(e("water", "ground", "rock")).toBe(4);
    expect(e("ice", "dragon", "flying")).toBe(4);
    expect(e("fire", "rock", "water")).toBe(0.25);
    expect(e("grass", "fire", "flying")).toBe(0.25);
    expect(e("electric", "water", "flying")).toBe(4);
    expect(e("electric", "water", "ground")).toBeCloseTo(2 * IMMUNE);
  });

  it("lets a creature attack with its best type", () => {
    const dragonite = species(149).types; // dragon, flying
    expect(bestEffectiveness(dragonite, [type("grass")])).toBe(2); // flying hits grass
    expect(bestEffectiveness(dragonite, [type("steel")])).toBe(0.5);
    expect(bestEffectiveness([type("normal")], [type("ghost")])).toBe(IMMUNE);
  });
});

describe("formatting numbers and durations", () => {
  it("shrinks big numbers", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(7)).toBe("7");
    expect(formatNumber(7.5)).toBe("7.5");
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(1000)).toBe("1.00K");
    expect(formatNumber(1234)).toBe("1.23K");
    expect(formatNumber(12_345)).toBe("12.35K");
    expect(formatNumber(123_456)).toBe("123.5K");
    expect(formatNumber(999_999)).toBe("1.00M");
    expect(formatNumber(5e9)).toBe("5.00B");
    expect(formatNumber(2.5e15)).toBe("2.50Qa");
    expect(formatNumber(-1500)).toBe("-1.50K");
    expect(formatNumber(1e40)).toBe("1.00e40");
    expect(formatNumber(Infinity)).toBe("∞");
    expect(formatNumber(NaN)).toBe("0");
  });

  it("writes durations", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(8.9)).toBe("8s");
    expect(formatDuration(75)).toBe("1m 15s");
    expect(formatDuration(3725)).toBe("1h 2m");
    expect(formatDuration(86_400 * 3 + 3600)).toBe("3d 1h");
    expect(formatDuration(-5)).toBe("0s");
  });
});
