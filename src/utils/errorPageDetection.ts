export type ErrorPageDetection = {
  code: "cloudflare_block" | "html_error";
};

// Cloudflare challenge/block pages are HTML documents. Keep the markers
// deliberately specific so normal messages mentioning HTML or a Ray ID are
// not hidden by mistake.
const CLOUDFLARE_BLOCK_PATTERN = /(?:cf-error-details|cf-error-footer|attention\s+required.*cloudflare|security\s+solution\s+that\s+protects|you(?:'|’)ve\s+been\s+blocked|you\s+have\s+been\s+blocked|checking\s+your\s+browser|browser\s+integrity\s+check|enable\s+javascript\s+and\s+cookies|cloudflare\s+(?:has\s+)?(?:blocked|denied))/iu;
const HTML_DOCUMENT_PATTERN = /(?:<!doctype\s+html|<html(?:\s|>)|<head(?:\s|>)|<body(?:\s|>)|<script(?:\s|>))/iu;
const HTML_ERROR_MARKER_PATTERN = /(?:error|blocked|forbidden|denied|gateway|security\s+solution|attention\s+required|challenge)/iu;

export function detectErrorPage(value: unknown): ErrorPageDetection | undefined {
  if (typeof value !== "string") return undefined;
  const sample = value.slice(0, 20000);
  if (CLOUDFLARE_BLOCK_PATTERN.test(sample)) return { code: "cloudflare_block" };
  if (HTML_DOCUMENT_PATTERN.test(sample) && HTML_ERROR_MARKER_PATTERN.test(sample)) return { code: "html_error" };
  return undefined;
}

export function getErrorPageMessage(detection: ErrorPageDetection): string {
  return detection.code === "cloudflare_block"
    ? "网页访问受限，暂时无法读取内容。"
    : "网页返回了异常内容，暂时无法读取。";
}

