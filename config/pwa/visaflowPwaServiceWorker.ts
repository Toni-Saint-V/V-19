import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const STATIC_BUILD_ASSET_PATTERN = /\.(?:css|gif|ico|jpe?g|js|png|svg|webp|woff2?)$/i;
const CORE_APP_SHELL_PATHS = ["/", "/manifest.webmanifest"] as const;
const BUILD_REFERENCE_ORIGIN = "https://visaflow.invalid";
const PRECACHE_LINK_RELATIONS = new Set([
  "apple-touch-icon",
  "icon",
  "manifest",
  "mask-icon",
  "modulepreload",
  "preload",
  "stylesheet",
]);

export type PrecacheBundleFile = {
  fileName: string;
  source: string | Uint8Array;
};

export type PrecacheFileReader = (filePath: string) => Promise<string | Uint8Array>;

type PrecacheContent = {
  path: string;
  source: string | Uint8Array;
};

function sourceToText(source: string | Uint8Array) {
  return typeof source === "string" ? source : Buffer.from(source).toString("utf8");
}

function normalizeReferencedPath(reference: string) {
  const url = new URL(reference, BUILD_REFERENCE_ORIGIN);

  if (url.origin !== BUILD_REFERENCE_ORIGIN) {
    return null;
  }

  if (url.search || url.hash) {
    throw new Error(
      `VisaFlow PWA fixed asset must use an unversioned path: ${reference}`,
    );
  }

  return url.pathname;
}

function extractHtmlLinkPaths(source: string | Uint8Array) {
  const paths: string[] = [];

  for (const linkMatch of sourceToText(source).matchAll(/<link\b[^>]*>/gi)) {
    const relMatch = linkMatch[0].match(/\brel\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
    const rel = relMatch?.[1] ?? relMatch?.[2];

    if (
      rel === undefined ||
      !rel
        .toLowerCase()
        .split(/\s+/)
        .some((relation) => PRECACHE_LINK_RELATIONS.has(relation))
    ) {
      continue;
    }

    const hrefMatch = linkMatch[0].match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
    const href = hrefMatch?.[1] ?? hrefMatch?.[2];

    if (href === undefined) {
      continue;
    }

    const path = normalizeReferencedPath(href);

    if (path !== null) {
      paths.push(path);
    }
  }

  return paths;
}

function extractManifestResourcePaths(resources: unknown) {
  if (!Array.isArray(resources)) {
    return [];
  }

  return resources.flatMap((resource) => {
    if (typeof resource !== "object" || resource === null) {
      return [];
    }

    const sourcePath = Reflect.get(resource, "src");

    if (typeof sourcePath !== "string") {
      return [];
    }

    const path = normalizeReferencedPath(sourcePath);
    return path === null ? [] : [path];
  });
}

function extractManifestAssetPaths(source: string | Uint8Array) {
  const manifest: unknown = JSON.parse(sourceToText(source));

  if (typeof manifest !== "object" || manifest === null) {
    throw new Error("VisaFlow PWA manifest must contain a JSON object");
  }

  const shortcutResources = Array.isArray(Reflect.get(manifest, "shortcuts"))
    ? Reflect.get(manifest, "shortcuts").flatMap((shortcut: unknown) =>
        typeof shortcut === "object" && shortcut !== null
          ? extractManifestResourcePaths(Reflect.get(shortcut, "icons"))
          : [],
      )
    : [];

  return [
    ...extractManifestResourcePaths(Reflect.get(manifest, "icons")),
    ...extractManifestResourcePaths(Reflect.get(manifest, "screenshots")),
    ...shortcutResources,
  ];
}

function createPrecacheRevision(contents: readonly PrecacheContent[]) {
  const revisionHash = createHash("sha256");

  contents
    .toSorted((left, right) => {
      if (left.path < right.path) {
        return -1;
      }

      if (left.path > right.path) {
        return 1;
      }

      return 0;
    })
    .forEach(({ path, source }) => {
      const contentHash = createHash("sha256").update(source).digest("hex");
      revisionHash.update(path).update("\0").update(contentHash).update("\n");
    });

  return revisionHash.digest("hex").slice(0, 16);
}

export async function createPrecachePlan(
  bundleFiles: readonly PrecacheBundleFile[],
  root: string,
  publicDir: string | false,
  readFileContent: PrecacheFileReader = readFile,
) {
  const bundleFileByName = new Map(
    bundleFiles.map((bundleFile) => [bundleFile.fileName, bundleFile]),
  );
  const emittedStaticPaths = bundleFiles
    .map(({ fileName }) => fileName)
    .filter((fileName) => STATIC_BUILD_ASSET_PATTERN.test(fileName))
    .map((fileName) => `/${fileName.replace(/^\/+/, "")}`);
  const indexFile = bundleFileByName.get("index.html");

  if (indexFile === undefined) {
    throw new Error("VisaFlow PWA build is missing emitted index.html");
  }

  if (publicDir === false) {
    throw new Error("VisaFlow PWA public directory is unavailable");
  }

  const manifestFileName = "manifest.webmanifest";
  const manifestFile = bundleFileByName.get(manifestFileName);
  const manifestSource =
    manifestFile?.source ??
    (await readFileContent(resolve(root, publicDir, manifestFileName)));
  const referencedStaticPaths = [
    ...extractHtmlLinkPaths(indexFile.source),
    ...extractManifestAssetPaths(manifestSource),
  ];
  const paths = [
    ...new Set([
      ...CORE_APP_SHELL_PATHS,
      ...referencedStaticPaths,
      ...emittedStaticPaths,
    ]),
  ].toSorted();
  const contents = await Promise.all(
    paths.map(async (path): Promise<PrecacheContent> => {
      const fileName = path === "/" ? "index.html" : path.replace(/^\/+/, "");
      const bundleFile = bundleFileByName.get(fileName);

      if (bundleFile !== undefined) {
        return { path, source: bundleFile.source };
      }

      if (path === "/manifest.webmanifest") {
        return { path, source: manifestSource };
      }

      return {
        path,
        source: await readFileContent(resolve(root, publicDir, fileName)),
      };
    }),
  );

  return { paths, version: createPrecacheRevision(contents) };
}

export function visaflowPwaServiceWorker(): Plugin {
  let root = "";
  let publicDir: string | false = false;

  return {
    name: "visaflow-pwa-service-worker",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      root = config.root;
      publicDir = config.publicDir;
    },
    async generateBundle(_outputOptions, bundle) {
      const bundleFiles = Object.values(bundle).map(
        (entry): PrecacheBundleFile => ({
          fileName: entry.fileName,
          source: entry.type === "chunk" ? entry.code : entry.source,
        }),
      );
      const { paths, version } = await createPrecachePlan(bundleFiles, root, publicDir);

      this.emitFile({
        type: "asset",
        fileName: "service-worker.js",
        source: createServiceWorkerSource(paths, version),
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
const PRECACHE_REQUESTS = PRECACHE_PATHS.map(
  (path) => new Request(new URL(path, self.location.origin), { cache: "reload" }),
);
const EXCLUDED_PATH_PREFIXES = [
  "/api",
  "/auth",
  "/document",
  "/documents",
  "/functions/v1",
  "/realtime/v1",
  "/rest/v1",
  "/storage/v1",
];

function isExcludedPath(pathname) {
  return EXCLUDED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_REQUESTS)));
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
  if (
    url.origin !== self.location.origin ||
    url.hostname.endsWith(".supabase.co") ||
    isExcludedPath(url.pathname)
  ) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async (networkError) => {
        const cache = await caches.open(CACHE_NAME);
        const offlineShell = await cache.match("/");

        if (offlineShell) return offlineShell;
        throw networkError;
      }),
    );
    return;
  }

  if (url.search || !PRECACHE_PATH_SET.has(url.pathname)) return;

  event.respondWith(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.match(url.pathname))
      .then((cachedResponse) => cachedResponse || fetch(request)),
  );
});
`;
}
