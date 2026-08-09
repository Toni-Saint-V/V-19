import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { visaflowPwaServiceWorker } from "./config/pwa/visaflowPwaServiceWorker";
import { releaseBuildIdentity } from "./scripts/lib/release-source-identity.mjs";

function releaseIdentity(mode: string): Plugin {
  const vercelGitSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  const archiveReleaseGitSha = process.env.V19_RELEASE_GIT_SHA?.trim();
  const archiveReleaseSourceSha256 = process.env.V19_RELEASE_SOURCE_SHA256?.trim();
  const { dirty, gitSha, sourceSha256 } = releaseBuildIdentity({
    archiveGitSha: archiveReleaseGitSha,
    archiveSourceSha256: archiveReleaseSourceSha256,
    isProductionArchive:
      process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production",
    root: process.cwd(),
    vercelGitSha,
  });
  return {
    name: "visaflow-release-identity",
    generateBundle() {
      this.emitFile({
        fileName: "release-identity.json",
        source: `${JSON.stringify({
          schemaVersion: 1,
          gitSha,
          dirty,
          mode,
          sourceSha256,
          builtAt: new Date().toISOString(),
        })}\n`,
        type: "asset",
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const localDemoBuildEnabled =
    mode === "development" || mode === "local-demo" || mode === "test";
  const envFilesDisabled = process.env.V19_DISABLE_ENV_FILES === "1";

  return {
    define: {
      __V19_LOCAL_DEMO_BUILD__: JSON.stringify(localDemoBuildEnabled),
    },
    envDir: envFilesDisabled ? false : undefined,
    // Keep Vite's CSS assets intact. Replacing an emitted CSS file during
    // generateBundle leaves lazy-import preload maps pointing at a file that
    // no longer exists and can break the authenticated workspace at runtime.
    plugins: [react(), visaflowPwaServiceWorker(), releaseIdentity(mode)],
    build: {
      manifest: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes("node_modules/react") ||
              id.includes("node_modules/react-dom")
            ) {
              return "react";
            }
            if (id.includes("node_modules/@supabase/supabase-js")) {
              return "supabase";
            }
            if (id.includes("node_modules/lucide-react")) {
              return "lucide";
            }
            return undefined;
          },
        },
      },
    },
  };
});
