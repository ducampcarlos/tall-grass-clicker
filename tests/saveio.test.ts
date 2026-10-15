import { beforeEach, describe, expect, it } from "vitest";

import { BACKUP_EVERY_MS, MAX_BACKUPS, backupNow, listBackups, readBackup } from "../src/web/backups.js";
import { decodeSaveCode, encodeSaveCode, looksLikeCode } from "../src/web/savecode.js";
import { buildSave, parseSave } from "../src/web/savefile.js";
import { parseProfile } from "../src/web/session.js";
import { store } from "../src/web/storage.js";
import { fresh, own } from "./helpers.js";

const sample = () => {
  const s = fresh(5);
  own(s, 25, 30, true);
  s.coins = 123456;
  return { profile: parseProfile(null), state: s };
};

describe("the save code", () => {
  it("brings back exactly the save it was made from", async () => {
    const { profile, state } = sample();
    const text = buildSave(profile, state, new Date("2026-01-02T03:04:05Z"));
    const code = await encodeSaveCode(text);
    expect(code).toMatch(/^TGC1\.[A-Za-z0-9_-]+$/);
    expect(looksLikeCode(code)).toBe(true);
    expect(await decodeSaveCode(code)).toBe(text);
    const back = parseSave((await decodeSaveCode(code))!);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.state).toEqual(state);
  });

  it("is much shorter than the file", async () => {
    const { profile, state } = sample();
    for (let id = 1; id <= 300; id++) own(state, id, 1 + (id % 40));
    const text = buildSave(profile, state);
    const code = await encodeSaveCode(text);
    expect(code.length).toBeLessThan(text.length / 3);
  });

  it("survives being pasted with spaces, line breaks and a wrapped line", async () => {
    const { profile, state } = sample();
    const code = await encodeSaveCode(buildSave(profile, state));
    const wrapped = code.replace(/(.{60})/g, "$1\n  ");
    expect(await decodeSaveCode(` \n${wrapped}\n `)).toBe(buildSave(profile, state, new Date(JSON.parse((await decodeSaveCode(code))!).exported)));
  });

  it("refuses anything that is not one of ours, or is damaged", async () => {
    for (const bad of ["", "hello", "TGC1.", "TGC1.%%%", "TGC2.abcd", "{\"game\":\"x\"}", "TGC1.AAAA", "TGC0.", "TGC1." + "A".repeat(40)]) {
      expect(await decodeSaveCode(bad), bad).toBeNull();
    }
    const { profile, state } = sample();
    const code = await encodeSaveCode(buildSave(profile, state));
    const cut = code.slice(0, Math.floor(code.length / 2));
    expect(await decodeSaveCode(cut)).toBeNull();
    const flipped = code.slice(0, 40) + (code[40] === "A" ? "B" : "A") + code.slice(41);
    const decoded = await decodeSaveCode(flipped);
    if (decoded !== null) expect(parseSave(decoded).ok).toBe(false);
  });

  it("stops a code that unpacks to something huge", async () => {
    const huge = "x".repeat(10 * 1024 * 1024);
    const packed = await encodeSaveCode(huge);
    expect(packed.startsWith("TGC1.")).toBe(true);
    expect(await decodeSaveCode(packed)).toBeNull();
  });

  it("a plain code (no compression) also works", async () => {
    const text = JSON.stringify({ hello: "world ñ ✦" });
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const code = "TGC0." + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(await decodeSaveCode(code)).toBe(text);
  });
});

describe("safety copies", () => {
  beforeEach(() => store.set("tall-grass-clicker.backups.v1", null));

  it("are made at most every twenty minutes, and only when something has happened", () => {
    const { profile, state } = sample();
    const t0 = 1_700_000_000_000;
    expect(backupNow(profile, state, "auto", t0)).toBe(true);
    expect(backupNow(profile, state, "auto", t0 + 60_000)).toBe(false);
    state.stats.playSeconds += 600;
    expect(backupNow(profile, state, "auto", t0 + BACKUP_EVERY_MS - 1)).toBe(false);
    expect(backupNow(profile, state, "auto", t0 + BACKUP_EVERY_MS)).toBe(true);
    // still the same game: no point in a third copy of it
    expect(backupNow(profile, state, "auto", t0 + 3 * BACKUP_EVERY_MS)).toBe(false);
    expect(listBackups()).toHaveLength(2);
  });

  it("keep only the newest few, newest first, and each one can be read back", () => {
    const { profile, state } = sample();
    const t0 = 1_800_000_000_000;
    for (let i = 0; i < MAX_BACKUPS + 3; i++) {
      state.stats.playSeconds += 100;
      state.stats.caught = 1 + i;
      expect(backupNow(profile, state, "auto", t0 + i * BACKUP_EVERY_MS)).toBe(true);
    }
    const list = listBackups();
    expect(list).toHaveLength(MAX_BACKUPS);
    expect(list.map((b) => b.caught)).toEqual([8, 7, 6, 5, 4]);
    for (const b of list) expect(readBackup(b).ok).toBe(true);
  });

  it("one is made on the spot before an import or an erase, whatever the clock says", () => {
    const { profile, state } = sample();
    const t0 = 1_900_000_000_000;
    backupNow(profile, state, "auto", t0);
    expect(backupNow(profile, state, "import", t0 + 1000)).toBe(true);
    expect(backupNow(profile, state, "erase", t0 + 2000)).toBe(true);
    expect(listBackups().map((b) => b.why)).toEqual(["erase", "import", "auto"]);
  });

  it("have nothing to keep when there is no game", () => {
    expect(backupNow(parseProfile(null), null, "erase")).toBe(false);
  });
});

describe("the profile", () => {
  it("remembers when a copy was last taken, and ignores nonsense", () => {
    expect(parseProfile(JSON.stringify({ lastExport: 1700000000000 })).lastExport).toBe(1700000000000);
    expect(parseProfile(JSON.stringify({ lastExport: -5 })).lastExport).toBe(0);
    expect(parseProfile(JSON.stringify({ lastExport: "yesterday" })).lastExport).toBe(0);
    expect(parseProfile(JSON.stringify({ lastReminder: 5 })).lastReminder).toBe(5);
    expect(parseProfile(null).lastExport).toBe(0);
  });
});
