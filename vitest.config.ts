import { defineConfig } from "vitest/config";

const runLiveSupabase = process.env.VITEST_SUPABASE_LIVE === "1";

export default defineConfig({
  define: {
    __V19_LOCAL_DEMO_BUILD__: "true",
  },
  envDir: false,
  test: {
    include: [
      "tests/unit/**/*.{test,spec}.{ts,tsx}",
      "tests/integration/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: [
      "tests/e2e/**",
      "node_modules/**",
      "dist/**",
      ...(runLiveSupabase ? [] : ["tests/integration/**"]),
    ],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
