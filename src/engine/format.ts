/** Numbers for people: 1234 -> "1.23K", 5e9 -> "5.00B". Clickers live on big numbers, so they shrink. */

const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

/** How big numbers are written: shrunk with letters (1.23M), in full (1,234,567) or in scientific form (1.23e6). */
export type NumberStyle = "short" | "full" | "scientific";
export const NUMBER_STYLES: readonly NumberStyle[] = ["short", "full", "scientific"];
let style: NumberStyle = "short";
export const setNumberStyle = (next: NumberStyle): void => {
  style = next;
};
export const getNumberStyle = (): NumberStyle => style;

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? "∞" : "0";
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (v < 1000) return sign + (v < 10 && v % 1 !== 0 ? v.toFixed(1) : String(Math.floor(v)));
  if (style === "full") return sign + (v >= 1e21 ? v.toExponential(2).replace("e+", "e") : Math.floor(v).toLocaleString("en-US"));
  if (style === "scientific") return sign + v.toExponential(2).replace("e+", "e");
  const tier = Math.floor(Math.log10(v) / 3);
  if (tier >= SUFFIXES.length) return `${sign}${v.toExponential(2).replace("e+", "e")}`;
  const scaled = v / 1000 ** tier;
  // "999.99K" must not round up to "1000.00K"
  const text = scaled >= 999.995 ? `${(1).toFixed(2)}${SUFFIXES[tier + 1] ?? "e36"}` : `${scaled.toFixed(scaled >= 100 ? 1 : 2)}${SUFFIXES[tier]}`;
  return sign + text;
}

/** 3725 seconds -> "1h 2m", 75 -> "1m 15s", 8 -> "8s". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
