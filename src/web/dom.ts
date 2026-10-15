/** A few helpers to build the page without a framework. */

type Child = Node | string | number | false | null | undefined;
type Props = Record<string, unknown> & { class?: string; style?: Partial<CSSStyleDeclaration> | string; on?: Record<string, (e: Event) => void>; dataset?: Record<string, string> };

/** h("button", { class: "x", on: { click } }, "Label") */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = String(value);
    else if (key === "style") {
      if (typeof value === "string") el.setAttribute("style", value);
      else Object.assign(el.style, value);
    } else if (key === "on") for (const [type, fn] of Object.entries(value as Record<string, (e: Event) => void>)) el.addEventListener(type, fn);
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key in el && key !== "list") (el as unknown as Record<string, unknown>)[key] = value;
    else el.setAttribute(key, String(value));
  }
  for (const c of children) if (c !== false && c !== null && c !== undefined) el.append(typeof c === "number" ? String(c) : c);
  return el;
}

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from the page`);
  return el as T;
};

export function replace(el: Element, ...children: Child[]): void {
  el.replaceChildren(...(children.filter((c) => c !== false && c !== null && c !== undefined).map((c) => (typeof c === "number" ? String(c) : c)) as Array<Node | string>));
}

/** Set text only when it changed: cheap to call every frame. */
export function setText(el: Node, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function setClass(el: Element, name: string, on: boolean): void {
  if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
}
