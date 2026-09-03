/**
 * Stable content hash for reading data. Web Crypto is unavailable on some
 * mobile browsers when the app is opened through a LAN HTTP address, so the
 * non-cryptographic fallback keeps local import and anchor creation working.
 */
export async function stableTextHash(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const byte of bytes) {
    first = Math.imul(first ^ byte, 0x01000193) >>> 0;
    second = Math.imul(second ^ byte, 0x85ebca6b) >>> 0;
  }
  const size = bytes.length >>> 0;
  return [first, second, size, first ^ second ^ size]
    .map((part) => (part >>> 0).toString(16).padStart(8, "0"))
    .join("");
}
