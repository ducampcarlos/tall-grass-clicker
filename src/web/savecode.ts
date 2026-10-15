/**
 * A save as a short piece of text to copy and paste: the save file, squeezed with gzip when the
 * browser can and written in a form that survives chat apps and notes ("TGC1." and letters, digits,
 * dashes and underscores). Anything else that is pasted is refused, and a code that unpacks to
 * something enormous is stopped before it fills the memory.
 */

import { MAX_SAVE_BYTES } from "./savefile.js";

const PLAIN = "TGC0.";
const PACKED = "TGC1.";

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "="));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array | null> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes as unknown as BufferSource).catch(() => {});
  void writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export const canPack = (): boolean => typeof CompressionStream === "function" && typeof DecompressionStream === "function";

/** The code for a save (the text of the save file). */
export async function encodeSaveCode(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  if (canPack()) {
    const packed = await pipe(bytes, new CompressionStream("gzip"));
    if (packed) return PACKED + toBase64Url(packed);
  }
  return PLAIN + toBase64Url(bytes);
}

export const looksLikeCode = (text: string): boolean => /^\s*TGC[01]\./.test(text);

/** The save file text a code holds, or null if it is not one of ours, is damaged or is too big. */
export async function decodeSaveCode(code: string): Promise<string | null> {
  const clean = code.replace(/\s+/g, "");
  const packed = clean.startsWith(PACKED);
  if (!packed && !clean.startsWith(PLAIN)) return null;
  const bytes = fromBase64Url(clean.slice(PACKED.length));
  if (!bytes || bytes.length === 0) return null;
  let raw: Uint8Array | null = bytes;
  if (packed) {
    if (!canPack()) return null;
    raw = await pipe(bytes, new DecompressionStream("gzip"), MAX_SAVE_BYTES * 2);
  } else if (bytes.length > MAX_SAVE_BYTES * 2) raw = null;
  if (!raw) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    return null;
  }
}
