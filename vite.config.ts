import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const localDemoBuildEnabled =
    mode === "development" || mode === "local-demo" || mode === "test";

  return {
    define: {
      __V19_LOCAL_DEMO_BUILD__: JSON.stringify(localDemoBuildEnabled),
    },
    // Keep Vite's CSS assets intact. Replacing an emitted CSS file during
    // generateBundle leaves lazy-import preload maps pointing at a file that
    // no longer exists and can break the authenticated workspace at runtime.
    plugins: [react()],
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
