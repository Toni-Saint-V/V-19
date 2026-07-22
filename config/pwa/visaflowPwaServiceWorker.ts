import { createHash } from "node:crypto";
import type { Plugin } from "vite";

const STATIC_BUILD_ASSET_PATTERN = /\.(?:css|gif|ico|jpe?g|js|png|svg|webp|woff2?)$/i;
const PUBLIC_APP_SHELL_PATHS = [
  "/",
  "/manifest.webmanifest",
  "/v19-app-icon.svg",
  "/v19-app-icon-192-v1.png",
  "/v19-app-icon-512-v1.png",
  "/v19-app-icon-maskable-192-v1.png",
  "/v19-app-icon-maskable-512-v1.png",
  "/v19-apple-touch-icon-v1.png",
] as const;

export function visaflowPwaServiceWorker(): Plugin {
  return {
    name: "visaflow-pwa-service-worker",
    apply: "build",
    enforce: "post",
    generateBundle(_outputOptions, bundle) {
      const emittedStaticPaths = Object.values(bundle)
        .map((entry) => entry.fileName)
        .filter((fileName) => STATIC_BUILD_ASSET_PATTERN.test(fileName))
        .map((fileName) => `/${fileName.replace(/^\/+/, "")}`);
      const precachePaths = [
        ...new Set([...PUBLIC_APP_SHELL_PATHS, ...emittedStaticPaths]),
      ].sort();
      const version = createHash("sha256")
        .update(precachePaths.join("\n"))
        .digest("hex")
        .slice(0, 16);

      this.emitFile({
        type: "asset",
        fileName: "service-worker.js",
        source: createServiceWorkerSource(precachePaths, version),
      });
    },
  };
}

export function createServiceWorkerSource(
  precachePaths: readonly string[],
  version: string,
) {
  return `const CACHE_PREFIX = "visaflow-app-shell-";
const CACHE_NAME = CACHE_PREFIX + ${JSON.stringify(version)};
const PRECACHE_PATHS = ${JSON.stringify(precachePaths)};
const PRECACHE_PATH_SET = new Set(PRECACHE_PATHS);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_PATHS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
    return;
  }

  if (url.search || !PRECACHE_PATH_SET.has(url.pathname)) return;

  event.respondWith(
    caches.match(url.pathname).then((cachedResponse) => cachedResponse || fetch(request)),
  );
});
`;
}
