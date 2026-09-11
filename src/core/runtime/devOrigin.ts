/**
 * Returns whether a hostname is a local loopback name that is safe to treat
 * as a Vite development origin. This deliberately does not inspect ports or
 * user data; the caller must still require the dev-mode flag.
 */
export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (normalized === "localhost" || normalized === "::1" || normalized === "[::1]") return true;
  const octets = normalized.split(".");
  if (octets.length !== 4 || octets[0] !== "127") return false;
  return octets.slice(1).every((octet) => {
    if (!/^\d+$/.test(octet)) return false;
    const value = Number(octet);
    return Number.isInteger(value) && value >= 0 && value <= 255;
  });
}

/** Production builds must never inherit the local-dev Service Worker path. */
export function isDevLoopbackOrigin(hostname: string, isDev: boolean): boolean {
  return isDev && isLoopbackHostname(hostname);
}
