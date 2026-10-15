/** Toasts and dialogs: the two ways the game talks to the player outside its panels. */

import { t } from "../i18n/index.js";
import { $, h } from "./dom.js";
import { spriteImg } from "./sprites.js";

export interface ToastOptions {
  kind?: "good" | "bad" | "shiny" | "big";
  /** A creature to show beside the text. */
  sprite?: number;
}

export function toast(message: string, options: ToastOptions = {}): void {
  const host = $("toasts");
  const el = h("div", { class: `toast ${options.kind ?? ""}` }, options.sprite ? spriteImg(options.sprite, "icon") : null, h("span", {}, message));
  host.append(el);
  while (host.children.length > 4) host.firstElementChild?.remove();
  window.setTimeout(() => el.remove(), 3300);
}

export interface Dialog {
  close: () => void;
}

/** Open a dialog. Clicking the dimmed background or pressing Escape closes it unless `modal` is set. */
export function dialog(title: string, body: Array<Node | string>, buttons: Array<{ label: string; kind?: "primary" | "danger" | "gold"; onClick?: () => void; keepOpen?: boolean }> = [], options: { dismiss?: boolean; noButtons?: boolean } = {}): Dialog {
  const host = $("modal");
  const close = () => {
    host.replaceChildren();
    window.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && options.dismiss !== false) close();
  };
  const box = h(
    "div",
    { class: "dialog", role: "dialog", "aria-label": title },
    h("h3", {}, title),
    ...body.map((b) => (typeof b === "string" ? h("p", {}, b) : b)),
    options.noButtons ? null : h(
      "div",
      { class: "buttons" },
      ...(buttons.length === 0 ? [{ label: t("Close") }] : buttons).map((b) =>
        h("button", { class: `btn ${(b as { kind?: string }).kind ?? ""}`, on: { click: () => ((b as { onClick?: () => void }).onClick?.(), (b as { keepOpen?: boolean }).keepOpen || close()) } }, b.label),
      ),
    ),
  );
  host.replaceChildren(box);
  host.onclick = (e) => {
    if (e.target === host && options.dismiss !== false) close();
  };
  window.addEventListener("keydown", onKey);
  return { close };
}

/** A question with two answers. */
export function confirmDialog(title: string, message: string, yes: string, no: string, onYes: () => void, kind: "primary" | "danger" = "primary"): void {
  dialog(title, [message], [{ label: no }, { label: yes, kind, onClick: onYes }]);
}
