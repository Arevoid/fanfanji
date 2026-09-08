export const NETEASE_SESSION_COOKIE = "fanfanji_netease_session";

const cookiePair = (name: string, value: string, options: { maxAge?: number; secure?: boolean } = {}) => [
  `${name}=${encodeURIComponent(value)}`,
  "Path=/",
  "HttpOnly",
  "SameSite=Lax",
  options.maxAge === undefined ? "" : `Max-Age=${options.maxAge}`,
  options.secure ? "Secure" : "",
].filter(Boolean).join("; ");

export const getCookie = (header: string | null | undefined, name: string): string | undefined => {
  if (!header) return undefined;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = header.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
};

/** Keep only upstream name=value pairs; never forward Set-Cookie attributes upstream. */
export const normalizeUpstreamCookie = (setCookie: string | null | undefined): string | undefined => {
  if (!setCookie) return undefined;
  const pairs = Array.from(setCookie.matchAll(/(?:^|,\s*)([A-Za-z0-9_\-]+=[^;,]*)/g))
    .map((match) => match[1]?.trim())
    .filter(Boolean);
  return pairs.length ? pairs.join("; ") : undefined;
};

export const buildNeteaseSessionCookie = (upstreamSetCookie: string | null | undefined, secure = false): string | undefined => {
  const normalized = normalizeUpstreamCookie(upstreamSetCookie);
  return normalized ? cookiePair(NETEASE_SESSION_COOKIE, normalized, { maxAge: 60 * 60 * 24 * 30, secure }) : undefined;
};

export const clearNeteaseSessionCookie = (secure = false): string => cookiePair(NETEASE_SESSION_COOKIE, "", { maxAge: 0, secure });

export const getNeteaseUpstreamCookie = (cookieHeader: string | null | undefined): string | undefined =>
  getCookie(cookieHeader, NETEASE_SESSION_COOKIE);
