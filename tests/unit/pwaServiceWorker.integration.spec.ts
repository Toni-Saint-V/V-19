import vm from "node:vm";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { describe, expect, it, vi } from "vitest";
import { build } from "vite";
import {
  createPrecachePlan,
  createServiceWorkerSource,
  visaflowPwaServiceWorker,
  type PrecacheFileReader,
} from "../../config/pwa/visaflowPwaServiceWorker";

const APP_ORIGIN = "https://app.visaflow.test";
const CACHE_PREFIX = "visaflow-app-shell-";

type WorkerRequest = {
  method: string;
  mode: string;
  url: string;
};

type WaitUntilEvent = {
  waitUntil: (completion: Promise<unknown>) => void;
};

type FetchEvent = {
  request: WorkerRequest;
  respondWith: (response: Promise<Response> | Response) => void;
};

type WorkerListener = (event: unknown) => void;

function createServiceWorkerHarness() {
  const cacheContents = new Map<string, Map<string, string>>();
  const precacheRequestCacheModes: string[] = [];
  const networkFetch = vi.fn(async (request: WorkerRequest) => {
    return new Response(`network:${new URL(request.url).pathname}`);
  });

  function getCacheContents(cacheName: string) {
    let contents = cacheContents.get(cacheName);

    if (contents === undefined) {
      contents = new Map<string, string>();
      cacheContents.set(cacheName, contents);
    }

    return contents;
  }

  function findCachedResponse(cacheName: string, request: string) {
    const body = cacheContents.get(cacheName)?.get(request);
    return body === undefined ? undefined : new Response(body);
  }

  const openCache = vi.fn(async (cacheName: string) => {
    return {
      addAll: async (requests: readonly (Request | string)[]) => {
        const contents = getCacheContents(cacheName);
        requests.forEach((request) => {
          const requestUrl =
            typeof request === "string"
              ? new URL(request, APP_ORIGIN)
              : new URL(request.url);
          const path = requestUrl.pathname;

          if (typeof request !== "string") {
            precacheRequestCacheModes.push(request.cache);
          }

          contents.set(path, `${cacheName}:${path}`);
        });
      },
      match: async (request: string) => findCachedResponse(cacheName, request),
    };
  });

  const globalCacheMatch = vi.fn(async (request: string) => {
    for (const cacheName of cacheContents.keys()) {
      const response = findCachedResponse(cacheName, request);

      if (response !== undefined) {
        return response;
      }
    }

    return undefined;
  });

  const cacheStorage = {
    delete: vi.fn(async (cacheName: string) => cacheContents.delete(cacheName)),
    keys: vi.fn(async () => [...cacheContents.keys()]),
    match: globalCacheMatch,
    open: openCache,
  };

  function createWorker(source: string) {
    const listeners = new Map<string, WorkerListener>();
    const skipWaiting = vi.fn(async () => undefined);
    const claimClients = vi.fn(async () => undefined);
    const workerScope = {
      addEventListener: (eventName: string, listener: WorkerListener) => {
        listeners.set(eventName, listener);
      },
      clients: { claim: claimClients },
      location: { origin: APP_ORIGIN },
      skipWaiting,
    };

    vm.runInNewContext(source, {
      Response,
      Request,
      URL,
      caches: cacheStorage,
      fetch: networkFetch,
      self: workerScope,
    });

    async function dispatchWaitUntil(eventName: "activate" | "install") {
      let completion: Promise<unknown> | undefined;
      const event: WaitUntilEvent = {
        waitUntil: (eventCompletion) => {
          completion = eventCompletion;
        },
      };
      const listener = listeners.get(eventName);

      if (listener === undefined) {
        throw new Error(`Missing ${eventName} listener`);
      }

      listener(event);

      if (completion === undefined) {
        throw new Error(`${eventName} did not call waitUntil`);
      }

      await completion;
    }

    async function dispatchFetch(request: WorkerRequest) {
      let responsePromise: Promise<Response> | undefined;
      const event: FetchEvent = {
        request,
        respondWith: (response) => {
          responsePromise = Promise.resolve(response);
        },
      };
      const listener = listeners.get("fetch");

      if (listener === undefined) {
        throw new Error("Missing fetch listener");
      }

      listener(event);
      return responsePromise;
    }

    return {
      claimClients,
      dispatchFetch,
      dispatchWaitUntil,
      skipWaiting,
    };
  }

  return {
    cacheContents,
    createWorker,
    getCacheContents,
    globalCacheMatch,
    networkFetch,
    precacheRequestCacheModes,
  };
}

describe("VisaFlow service worker integration", () => {
  it("installs the complete shell without forcing a waiting update onto open clients", async () => {
    const harness = createServiceWorkerHarness();
    const worker = harness.createWorker(
      createServiceWorkerSource(["/", "/assets/app-a.js"], "v1"),
    );

    await worker.dispatchWaitUntil("install");

    expect([...harness.getCacheContents(`${CACHE_PREFIX}v1`).keys()]).toEqual([
      "/",
      "/assets/app-a.js",
    ]);
    expect(harness.precacheRequestCacheModes).toEqual(["reload", "reload"]);
    expect(worker.skipWaiting).not.toHaveBeenCalled();
  });

  it("keeps serving the active worker's hashed chunks while an update waits", async () => {
    const harness = createServiceWorkerHarness();
    harness.getCacheContents("unrelated-runtime-cache").set("/shared", "unrelated");
    const activeWorker = harness.createWorker(
      createServiceWorkerSource(["/", "/assets/lazy-old.js"], "v1"),
    );
    await activeWorker.dispatchWaitUntil("install");
    await activeWorker.dispatchWaitUntil("activate");

    const waitingWorker = harness.createWorker(
      createServiceWorkerSource(["/", "/assets/lazy-new.js"], "v2"),
    );
    await waitingWorker.dispatchWaitUntil("install");

    const oldChunkResponse = await activeWorker.dispatchFetch({
      method: "GET",
      mode: "cors",
      url: `${APP_ORIGIN}/assets/lazy-old.js`,
    });

    expect(harness.cacheContents.has(`${CACHE_PREFIX}v1`)).toBe(true);
    expect(harness.cacheContents.has(`${CACHE_PREFIX}v2`)).toBe(true);
    expect(await oldChunkResponse?.text()).toBe(
      `${CACHE_PREFIX}v1:/assets/lazy-old.js`,
    );
    expect(waitingWorker.skipWaiting).not.toHaveBeenCalled();

    await waitingWorker.dispatchWaitUntil("activate");

    expect(harness.cacheContents.has(`${CACHE_PREFIX}v1`)).toBe(false);
    expect(harness.cacheContents.has(`${CACHE_PREFIX}v2`)).toBe(true);
    expect(harness.cacheContents.has("unrelated-runtime-cache")).toBe(true);
    expect(waitingWorker.claimClients).toHaveBeenCalledOnce();
  });

  it("serves static assets and the offline shell only from the current cache", async () => {
    const harness = createServiceWorkerHarness();
    harness.getCacheContents(`${CACHE_PREFIX}stale`).set("/", "stale-shell");
    harness
      .getCacheContents(`${CACHE_PREFIX}stale`)
      .set("/assets/app.js", "stale-asset");
    harness.getCacheContents(`${CACHE_PREFIX}current`).set("/", "current-shell");
    harness
      .getCacheContents(`${CACHE_PREFIX}current`)
      .set("/assets/app.js", "current-asset");
    const worker = harness.createWorker(
      createServiceWorkerSource(["/", "/assets/app.js"], "current"),
    );

    const staticResponse = await worker.dispatchFetch({
      method: "GET",
      mode: "cors",
      url: `${APP_ORIGIN}/assets/app.js`,
    });

    expect(await staticResponse?.text()).toBe("current-asset");

    harness.networkFetch.mockRejectedValueOnce(new TypeError("offline"));
    const navigationResponse = await worker.dispatchFetch({
      method: "GET",
      mode: "navigate",
      url: `${APP_ORIGIN}/submissions`,
    });

    expect(await navigationResponse?.text()).toBe("current-shell");
    expect(harness.globalCacheMatch).not.toHaveBeenCalled();
  });

  it.each([
    { mode: "cors", url: `${APP_ORIGIN}/api/submissions` },
    { mode: "navigate", url: `${APP_ORIGIN}/auth/callback` },
    {
      mode: "cors",
      url: `${APP_ORIGIN}/documents/submission-1/passport.pdf`,
    },
    { mode: "cors", url: `${APP_ORIGIN}/functions/v1/process-document` },
    { mode: "cors", url: `${APP_ORIGIN}/rest/v1/submissions` },
    {
      mode: "cors",
      url: `${APP_ORIGIN}/storage/v1/object/submission-media/passport.pdf`,
    },
    { mode: "cors", url: "https://tenant.supabase.co/rest/v1/submissions" },
  ])("does not intercept sensitive response $url", async ({ mode, url }) => {
    const harness = createServiceWorkerHarness();
    const worker = harness.createWorker(createServiceWorkerSource(["/"], "current"));

    const response = await worker.dispatchFetch({
      method: "GET",
      mode,
      url,
    });

    expect(response).toBeUndefined();
    expect(harness.networkFetch).not.toHaveBeenCalled();
    expect(harness.globalCacheMatch).not.toHaveBeenCalled();
  });
});

describe("VisaFlow precache revision", () => {
  const manifestIcons = [
    "/v19-app-icon-192-v1.png",
    "/v19-app-icon-512-v1.png",
    "/v19-app-icon-maskable-192-v1.png",
    "/v19-app-icon-maskable-512-v1.png",
  ];

  function createHtml(scriptPath = "/assets/app-a.js") {
    return `<link rel="icon" href="/v19-app-icon.svg"><link rel="apple-touch-icon" href="/v19-apple-touch-icon-v1.png"><script src="${scriptPath}"></script>`;
  }

  function createManifest(name = "VisaFlow") {
    return JSON.stringify({
      icons: manifestIcons.map((src) => ({ src })),
      name,
    });
  }

  const bundleFiles = [
    { fileName: "index.html", source: createHtml() },
    { fileName: "assets/app-a.js", source: "console.log('app-a')" },
  ];

  function createAssetReader(overrides: Readonly<Record<string, string>> = {}) {
    const reader: PrecacheFileReader = async (filePath) => {
      const override = Object.entries(overrides).find(([suffix]) =>
        filePath.endsWith(suffix),
      );

      if (override !== undefined) {
        return override[1];
      }

      if (filePath.endsWith("manifest.webmanifest")) {
        return createManifest();
      }

      return `fixed-content:${filePath}`;
    };
    return reader;
  }

  it("changes for manifest, built HTML, and fixed-path asset content", async () => {
    const baseline = await createPrecachePlan(
      bundleFiles,
      "/repo",
      "/repo/public",
      createAssetReader(),
    );
    const changedManifest = await createPrecachePlan(
      bundleFiles,
      "/repo",
      "/repo/public",
      createAssetReader({ "manifest.webmanifest": createManifest("VisaFlow 2") }),
    );
    const changedHtml = await createPrecachePlan(
      [{ ...bundleFiles[0], source: createHtml("/assets/app-b.js") }, bundleFiles[1]],
      "/repo",
      "/repo/public",
      createAssetReader(),
    );
    const changedFixedAsset = await createPrecachePlan(
      bundleFiles,
      "/repo",
      "/repo/public",
      createAssetReader({ "v19-app-icon-192-v1.png": "icon-v2" }),
    );

    expect(changedManifest.version).not.toBe(baseline.version);
    expect(changedHtml.version).not.toBe(baseline.version);
    expect(changedFixedAsset.version).not.toBe(baseline.version);
    expect(baseline.paths).toContain("/assets/app-a.js");
    expect(baseline.paths).toContain("/manifest.webmanifest");
    expect(baseline.paths).toContain("/v19-app-icon-192-v1.png");
    expect(baseline.paths).toContain("/v19-apple-touch-icon-v1.png");
  });

  it("is stable across bundle order and changes for every fixed-path asset", async () => {
    const baseline = await createPrecachePlan(
      bundleFiles,
      "/repo",
      "/repo/public",
      createAssetReader(),
    );
    const reordered = await createPrecachePlan(
      bundleFiles.toReversed(),
      "/repo",
      "/repo/public",
      createAssetReader(),
    );
    const fixedAssetPaths = baseline.paths.filter(
      (path) =>
        path !== "/" &&
        path !== "/manifest.webmanifest" &&
        !path.startsWith("/assets/"),
    );

    expect(reordered.version).toBe(baseline.version);

    for (const fixedAssetPath of fixedAssetPaths) {
      const changed = await createPrecachePlan(
        bundleFiles,
        "/repo",
        "/repo/public",
        createAssetReader({ [fixedAssetPath]: `changed:${fixedAssetPath}` }),
      );

      expect(changed.version, fixedAssetPath).not.toBe(baseline.version);
    }
  });

  it("derives a newly declared manifest icon without a manual asset list", async () => {
    const baseline = await createPrecachePlan(
      bundleFiles,
      "/repo",
      "/repo/public",
      createAssetReader(),
    );
    const newIconPath = "/v19-app-icon-1024-v2.png";
    const expanded = await createPrecachePlan(
      bundleFiles,
      "/repo",
      "/repo/public",
      createAssetReader({
        "manifest.webmanifest": JSON.stringify({
          icons: [...manifestIcons, newIconPath].map((src) => ({ src })),
          name: "VisaFlow",
        }),
      }),
    );

    expect(expanded.paths).toContain(newIconPath);
    expect(expanded.version).not.toBe(baseline.version);
  });

  it("discovers manifest shortcut icons and screenshots as fixed assets", async () => {
    const shortcutIcon = "/v19-shortcut-icon-v1.png";
    const screenshot = "/v19-dashboard-wide-v1.png";
    const expanded = await createPrecachePlan(
      bundleFiles,
      "/repo",
      "/repo/public",
      createAssetReader({
        "manifest.webmanifest": JSON.stringify({
          icons: manifestIcons.map((src) => ({ src })),
          name: "VisaFlow",
          screenshots: [{ src: screenshot }],
          shortcuts: [
            { icons: [{ src: shortcutIcon }], name: "Drafts", url: "/drafts" },
          ],
        }),
      }),
    );

    expect(expanded.paths).toContain(shortcutIcon);
    expect(expanded.paths).toContain(screenshot);
  });

  it("ignores route-bearing metadata links when discovering fixed assets", async () => {
    const plan = await createPrecachePlan(
      [
        {
          fileName: "index.html",
          source:
            '<link rel="canonical" href="/submissions"><link rel="alternate" href="/ru"><link rel="icon" href="/v19-app-icon.svg">',
        },
      ],
      "/repo",
      "/repo/public",
      createAssetReader(),
    );

    expect(plan.paths).toContain("/v19-app-icon.svg");
    expect(plan.paths).not.toContain("/submissions");
    expect(plan.paths).not.toContain("/ru");
  });
});

describe("VisaFlow Vite PWA build integration", () => {
  it("emits a content-revisioned worker from the real app build without env files", async () => {
    const result = await build({
      root: process.cwd(),
      configFile: false,
      envFile: false,
      publicDir: resolve(process.cwd(), "public"),
      mode: "test",
      logLevel: "silent",
      define: {
        __V19_LOCAL_DEMO_BUILD__: "true",
      },
      plugins: [react(), visaflowPwaServiceWorker()],
      build: {
        emptyOutDir: false,
        manifest: true,
        write: false,
      },
    });
    const outputs = Array.isArray(result)
      ? result.flatMap((output) => output.output)
      : "output" in result
        ? result.output
        : [];
    const worker = outputs.find(
      (output) => output.type === "asset" && output.fileName === "service-worker.js",
    );

    expect(worker?.type).toBe("asset");
    if (worker?.type !== "asset") {
      throw new Error("Vite build did not emit service-worker.js");
    }

    const workerSource =
      typeof worker.source === "string"
        ? worker.source
        : Buffer.from(worker.source).toString("utf8");

    expect(workerSource).toContain('const CACHE_PREFIX = "visaflow-app-shell-"');
    expect(workerSource).toContain('"/manifest.webmanifest"');
    expect(workerSource).toContain('"/v19-app-icon-192-v1.png"');
    expect(workerSource).toContain("caches.open(CACHE_NAME)");
    expect(workerSource).not.toContain("skipWaiting");
  }, 30_000);
});
