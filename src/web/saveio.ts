/**
 * Getting the save out of the game and back in, every way there is: a file, a piece of text to copy,
 * the share sheet, a file dropped on the page, and the safety copies the game keeps. Whatever comes
 * in is checked like any other save, and nothing replaces your progress without asking.
 */

import { t } from "../i18n/index.js";
import { formatDuration } from "../engine/format.js";
import { place } from "../engine/regions.js";
import type { App } from "./app.js";
import { h } from "./dom.js";
import { type Backup, backupNow, listBackups, readBackup } from "./backups.js";
import { placeTitle } from "./labels.js";
import { type Imported, SAVE_GAME, buildSave, parseSave } from "./savefile.js";
import { decodeSaveCode, encodeSaveCode, looksLikeCode } from "./savecode.js";
import { downloadText, pickTextFile } from "./transfer.js";
import { confirmDialog, dialog, toast } from "./ui.js";

const stamp = (): string => new Date().toISOString().slice(0, 10);

function took(app: App): void {
  app.profile.lastExport = Date.now();
  app.saveProfile();
}

/** The save, as a file to keep. */
export function exportFile(app: App): void {
  app.session.save();
  downloadText(`tall-grass-clicker-save-${stamp()}.json`, buildSave(app.profile, app.state));
  took(app);
  toast(t("Save exported. Keep the file safe."), { kind: "good" });
}

/** Hand the file to the device's share sheet (messages, mail, cloud drives), where there is one. */
export const canShare = (): boolean => {
  try {
    return typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [new File(["{}"], "save.json", { type: "application/json" })] });
  } catch {
    return false;
  }
};

export async function shareFile(app: App): Promise<void> {
  app.session.save();
  const file = new File([buildSave(app.profile, app.state)], `tall-grass-clicker-save-${stamp()}.json`, { type: "application/json" });
  try {
    await navigator.share({ files: [file], title: "Tall Grass Clicker" });
    took(app);
  } catch (error) {
    if ((error as { name?: string }).name !== "AbortError") toast(t("Sharing did not work here. Use Export instead."), { kind: "bad" });
  }
}

/** The save as text, on the clipboard (or on screen to copy by hand when the browser will not). */
export async function copyCode(app: App): Promise<void> {
  app.session.save();
  const code = await encodeSaveCode(buildSave(app.profile, app.state));
  try {
    await navigator.clipboard.writeText(code);
    took(app);
    toast(t("Save code copied. Paste it in a note or a message to keep it."), { kind: "good" });
  } catch {
    const box = h("textarea", { class: "code", readOnly: true, rows: 6, "aria-label": t("Save code") }, code) as HTMLTextAreaElement;
    dialog(t("Save code"), [t("Copy this text and keep it somewhere safe."), box], [{ label: t("Done"), kind: "primary" }]);
    box.focus();
    box.select();
    took(app);
  }
}

/** Ask for a pasted code. */
export function pasteCode(app: App): void {
  const box = h("textarea", { class: "code", rows: 6, placeholder: "TGC1.…", "aria-label": t("Save code") }) as HTMLTextAreaElement;
  dialog(t("Import from a code"), [t("Paste the code of a save here."), box], [
    { label: t("Cancel") },
    { label: t("Continue"), kind: "primary", onClick: () => void importText(app, box.value) },
  ]);
  box.focus();
}

/** Whatever was given: a save file's text or a save code. Asks before replacing anything. */
export async function importText(app: App, text: string): Promise<void> {
  let imported: Imported;
  if (looksLikeCode(text)) {
    const json = await decodeSaveCode(text);
    imported = json === null ? { ok: false, error: t("That code is not a Tall Grass Clicker save.") } : parseSave(json);
  } else imported = parseSave(text);
  if (!imported.ok) {
    toast(imported.error, { kind: "bad" });
    return;
  }
  offerReplace(app, imported);
}

function offerReplace(app: App, imported: Extract<Imported, { ok: true }>): void {
  const when = imported.exported ? ` (${imported.exported.slice(0, 10)})` : "";
  confirmDialog(
    t("Import this save?"),
    t("Replace your progress with this save{when}? What you have now will be lost.", { when }),
    t("Replace"),
    t("Keep mine"),
    () => {
      app.session.save();
      backupNow(app.profile, app.state, "import"); // so that nothing is ever lost for good
      app.session.restore(imported.profile, imported.state);
      window.location.reload();
    },
    "danger",
  );
}

/** Pick a file and read it. */
export function importFile(app: App): void {
  pickTextFile(".json,application/json,text/plain", (content) => void importText(app, content));
}

/** A save file (or a code in a text file) dropped on the page. */
export function installDrop(app: App): void {
  window.addEventListener("dragover", (e) => {
    if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
  });
  window.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    if (file.size > 2 * 1024 * 1024) return void toast(t("That file is too big to be a save."), { kind: "bad" });
    void file.text().then((text) => importText(app, text));
  });
}

export function eraseGame(app: App): void {
  confirmDialog(t("Erase everything?"), t("This deletes your whole game on this device: Pokédex, perks and all. Export first if you may want it back."), t("Erase"), t("Keep it"), () => {
    app.session.save();
    backupNow(app.profile, app.state, "erase");
    app.session.erase();
    window.location.reload();
  }, "danger");
}

const WHY: Record<Backup["why"], () => string> = { auto: () => t("while playing"), import: () => t("before an import"), erase: () => t("before erasing") };

/** The safety copies, with a way to put one back. */
export function showBackups(app: App): void {
  const list = listBackups();
  const rows = list.map((b) =>
    h(
      "div",
      { class: "row backup" },
      h("div", {}, h("div", { class: "t" }, new Date(b.at).toLocaleString()), h("div", { class: "d" }, `${t("Caught")}: ${b.caught} · ${placeTitle(place(b.furthest))} · ${formatDuration(b.playSeconds)} · ${WHY[b.why]()}`)),
      h("button", { class: "btn small gold", on: { click: () => restore(app, b) } }, t("Restore")),
    ),
  );
  dialog(t("Safety copies"), [h("p", { class: "muted" }, t("The game keeps a few copies of your save while you play, and one before anything replaces it. They live in this browser: export a file to keep one somewhere else.")), list.length === 0 ? h("p", {}, t("There are none yet.")) : h("div", { class: "rows" }, ...rows)], [{ label: t("Done"), kind: "primary" }]);
}

function restore(app: App, b: Backup): void {
  const imported = readBackup(b);
  if (!imported.ok) return void toast(imported.error, { kind: "bad" });
  confirmDialog(t("Restore this copy?"), t("Your progress now will be replaced by the copy from {when}.", { when: new Date(b.at).toLocaleString() }), t("Restore"), t("Keep mine"), () => {
    app.session.save();
    backupNow(app.profile, app.state, "import");
    app.session.restore(imported.profile, imported.state);
    window.location.reload();
  }, "danger");
}

/** A reminder, once in a while, to keep a copy outside the browser. Returns whether it was shown. */
export function remindToExport(app: App, now = Date.now()): boolean {
  const s = app.state;
  const last = Math.max(app.profile.lastExport, app.profile.lastReminder);
  const hours = s.stats.playSeconds / 3600;
  const due = last === 0 ? hours >= 1 : now - last > 7 * 24 * 3600 * 1000 && hours >= 0.5;
  if (!due) return false;
  toast(t("It has been a while since you took a copy of your game out of the browser. Settings → Export keeps it safe."), { kind: "big" });
  app.profile.lastReminder = now;
  app.saveProfile();
  return true;
}

void SAVE_GAME;
