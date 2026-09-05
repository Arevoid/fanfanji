/**
 * Enforced browser policy for the app shell and proxy responses.
 * `connect-src https:` intentionally preserves user-configured API endpoints;
 * endpoint validation/authentication is outside this plan's approved scope.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: blob: https:",
  "connect-src 'self' https:",
  "media-src 'self' data: blob: https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'none'",
].join("; ");

export const applyContentSecurityPolicy = (headers: Headers): Headers => {
  headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  return headers;
};
