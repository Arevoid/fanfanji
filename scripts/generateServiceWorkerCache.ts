import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function replaceServiceWorkerCacheName(source: string, cacheName: string): string {
  const declaration = /const CACHE_NAME\s*=\s*["'][^"']+["'];/;
  if (!declaration.test(source)) throw new Error("Service Worker CACHE_NAME declaration is missing");
  return source.replace(declaration, `const CACHE_NAME = "${cacheName}";`);
}

export function createServiceWorkerCacheName(version: string, sourceMaterial: string): string {
  const digest = createHash("sha256").update(sourceMaterial).digest("hex").slice(0, 12);
  return `fanfan-phone-${version}-${digest}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const root = process.cwd();
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version?: string };
  const sourceFiles = ["src/main.tsx", "src/App.tsx", "src/index.css", "public/manifest.json"];
  const sourceMaterial = sourceFiles.map((file) => `${file}\n${readFileSync(path.join(root, file), "utf8")}`).join("\n");
  const cacheName = createServiceWorkerCacheName(packageJson.version || "0", sourceMaterial);
  const serviceWorkerPath = path.join(root, "public/sw.js");
  writeFileSync(serviceWorkerPath, replaceServiceWorkerCacheName(readFileSync(serviceWorkerPath, "utf8"), cacheName));
  console.log(`Updated Service Worker cache: ${cacheName}`);
}
