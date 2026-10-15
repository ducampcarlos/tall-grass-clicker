import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { BUFFS } from "../src/engine/items.js";
import { GAMES } from "../src/engine/minigames.js";
import { HELPER_ICON, PERK_ICON, REGION_BADGE, TAB_ICON, UPGRADE_ICON } from "../src/web/icons.js";
import { BIOME_NAMES } from "../src/web/appearance.js";
import { PERKS } from "../src/engine/perks.js";
import { UPGRADES } from "../src/engine/rules.js";
import { HELPERS } from "../src/engine/helpers.js";

const docs = join(import.meta.dirname, "..", "docs", "assets");
const item = (name: string) => existsSync(join(docs, "items", `${name}.png`));

describe("the pictures the game refers to are in the repository", () => {
  it("every item icon", () => {
    const names = new Set<string>([
      ...BUFFS.flatMap((b) => b.tiers.map((t) => t.icon)),
      ...GAMES.map((g) => g.icon),
      ...Object.values(UPGRADE_ICON),
      ...Object.values(PERK_ICON),
      ...Object.values(TAB_ICON),
      ...Object.values(HELPER_ICON),
      "poke-ball", "great-ball", "ultra-ball", "master-ball", "rare-candy", "mystery-egg",
    ]);
    const missing = [...names].filter((n) => !item(n));
    expect(missing).toEqual([]);
  });

  it("an icon for every upgrade, perk and helper", () => {
    for (const u of UPGRADES) expect(UPGRADE_ICON[u.id], u.id).toBeDefined();
    expect(UPGRADE_ICON.slots).toBeDefined();
    expect(UPGRADE_ICON.incubator).toBeDefined();
    for (const p of PERKS) expect(PERK_ICON[p.id], p.id).toBeDefined();
    for (const h of HELPERS) expect(HELPER_ICON[h.id], h.id).toBeDefined();
  });

  it("every gym badge and every biome picture", () => {
    for (const id of REGION_BADGE) expect(existsSync(join(docs, "badges", `${id}.png`)), `badge ${id}`).toBe(true);
    for (const b of BIOME_NAMES) expect(existsSync(join(docs, "scenes", `${b}.png`)), b).toBe(true);
  });

  it("the sprites of the first partners and a few more", () => {
    for (const id of [1, 4, 7, 25, 150, 649]) {
      for (const kind of ["normal", "shiny"]) expect(existsSync(join(docs, "sprites", kind, `${id}.gif`)), `${kind} ${id}`).toBe(true);
      expect(existsSync(join(docs, "sprites", "icon", `${id}.png`)), `icon ${id}`).toBe(true);
    }
  });
});
