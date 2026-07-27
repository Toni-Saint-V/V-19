import { defineConfig, devices } from "@playwright/test";
import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const configuredArtifactsRoot = process.env.V19_TEST_ARTIFACTS_DIR?.trim();
const repositoryRoot = canonicalizeBoundaryPath(
  dirname(fileURLToPath(import.meta.url)),
);
const testArtifactsRoot = canonicalizeBoundaryPath(
  configuredArtifactsRoot ?? resolve(tmpdir(), "visaflow-v19"),
);
const artifactsRelativeToRepository = relative(repositoryRoot, testArtifactsRoot);
const artifactsInsideRepository =
  artifactsRelativeToRepository === "" ||
  (artifactsRelativeToRepository !== ".." &&
    !artifactsRelativeToRepository.startsWith(`..${sep}`) &&
    !isAbsolute(artifactsRelativeToRepository));

if (artifactsInsideRepository) {
  throw new Error("V19_TEST_ARTIFACTS_DIR must resolve outside the repository");
}

const testArtifactPath = (...segments: string[]) =>
  resolve(testArtifactsRoot, ...segments);

const e2eHost = requireLocalhost(
  "PW_BASE_HOST",
  process.env.PW_BASE_HOST ?? "127.0.0.1",
);
const e2eServerHost = requireLocalhost(
  "PW_SERVER_HOST",
  process.env.PW_SERVER_HOST ?? "127.0.0.1",
);
const e2ePort = requirePort(process.env.PW_BASE_PORT ?? "4207");
const e2eUrl = `http://${e2eHost}:${e2ePort}`;
const denyExternalProxy = "http://127.0.0.1:1";

export default defineConfig({
  outputDir: testArtifactPath("playwright", "local-e2e"),
  preserveOutput: "failures-only",
  retries: process.env.CI ? 2 : 0,
  retryStrategy: "isolated",
  testDir: "./tests/e2e",
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: testArtifactPath("playwright", "html-report"),
      },
    ],
  ],
  use: {
    baseURL: e2eUrl,
    proxy: {
      // Route every non-target origin to a closed loopback endpoint. The exact
      // local Vite origin is the only browser-network bypass.
      bypass: `${e2eHost}:${e2ePort}`,
      server: denyExternalProxy,
    },
    screenshot: "only-on-failure",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    launchOptions: {
      args: ["--no-first-run", "--disable-default-apps", "--disable-dev-shm-usage"],
    },
  },
  webServer: {
    command: `npx vite --host ${e2eServerHost} --port ${e2ePort} --strictPort`,
    env: {
      VITE_SUPABASE_BACKEND_TARGET: "local-demo",
      VITE_E2E_PASSPORT_MOCK_ENABLED: "true",
      VITE_SUPABASE_SANDBOX_PROBE_ENABLED: "false",
      VITE_SUPABASE_RELEASE_ENABLED: "false",
    },
    url: e2eUrl,
    // Release evidence must come from the local-demo server configured above,
    // never from an arbitrary developer server already bound to the port.
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
    },
  ],
});

function canonicalizeBoundaryPath(path: string) {
  let existingAncestor = resolve(path);
  const missingSegments = [];

  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) break;
    missingSegments.unshift(basename(existingAncestor));
    existingAncestor = parent;
  }

  const canonicalAncestor = existsSync(existingAncestor)
    ? realpathSync(existingAncestor)
    : existingAncestor;
  return resolve(canonicalAncestor, ...missingSegments);
}

function requireLocalhost(name: string, value: string) {
  if (value !== "127.0.0.1" && value !== "localhost") {
    throw new Error(`${name} must be exactly 127.0.0.1 or localhost`);
  }
  return value;
}

function requirePort(value: string) {
  if (!/^\d{1,5}$/.test(value)) {
    throw new Error("PW_BASE_PORT must be a decimal port");
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PW_BASE_PORT must be between 1 and 65535");
  }
  return String(port);
}
