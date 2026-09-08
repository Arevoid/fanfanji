/** Creates a collision-resistant application ID with a stable prefix. */
export function createId(prefix: string): string {
  const normalizedPrefix = prefix.trim() || "id";
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return `${normalizedPrefix}-${cryptoApi.randomUUID()}`;
  }
  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${normalizedPrefix}-${value}`;
  }
  return `${normalizedPrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
