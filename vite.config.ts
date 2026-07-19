import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { parse } from "postcss";

const cssRawChunkLimit = 240 * 1024;
const cssGzipChunkLimit = 36 * 1024;

type BundleAsset = {
  source?: string | Uint8Array;
  type: "asset";
};

type BuildBundle = Record<string, BundleAsset | unknown>;

export default defineConfig(({ mode }) => {
  const localDemoBuildEnabled =
    mode === "development" || mode === "local-demo" || mode === "test";

  return {
    define: {
      __V19_LOCAL_DEMO_BUILD__: JSON.stringify(localDemoBuildEnabled),
    },
    plugins: [react(), splitLargeCssAssets()],
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

function splitLargeCssAssets(): Plugin {
  return {
    name: "visaflow-css-runtime-split",
    enforce: "post" as const,
    generateBundle(_options, bundle: BuildBundle) {
      const htmlAssets = Object.entries(bundle).flatMap(([fileName, asset]) =>
        fileName.endsWith(".html") &&
        isBundleAsset(asset) &&
        typeof asset.source === "string"
          ? [asset]
          : [],
      );

      for (const [fileName, asset] of Object.entries(bundle)) {
        if (!isBundleAsset(asset) || !fileName.endsWith(".css")) continue;

        // Dynamic CSS is linked from Vite's lazy-import runtime, not HTML.
        // Rewriting only its asset would leave that runtime pointing at a
        // removed file. Keep it intact so an authenticated workspace can
        // preload its visual layer before the lazy boundary resolves.
        if (!htmlAssets.some((htmlAsset) => String(htmlAsset.source).includes(fileName))) {
          continue;
        }

        const source = String(asset.source ?? "");
        if (
          Buffer.byteLength(source, "utf8") <= cssRawChunkLimit &&
          gzipSync(source).length <= cssGzipChunkLimit
        ) {
          continue;
        }

        const chunks = splitCssByTopLevelNodes(source);
        if (chunks.length < 2) continue;

        delete bundle[fileName];
        const chunkFiles = chunks.map((chunk, index) => {
          const chunkHash = createHash("sha256")
            .update(chunk)
            .digest("hex")
            .slice(0, 8);
          const lastSlash = fileName.lastIndexOf("/");
          const outputPrefix = lastSlash >= 0 ? fileName.slice(0, lastSlash + 1) : "";
          const chunkFileName = `${outputPrefix}system-${index + 1}-${chunkHash}.css`;
          this.emitFile({
            fileName: chunkFileName,
            source: chunk,
            type: "asset",
          });
          return chunkFileName;
        });

        for (const htmlAsset of htmlAssets) {
          const htmlSource = String(htmlAsset.source);
          htmlAsset.source = htmlSource.replace(
            /<link\s+[^>]*href=["']([^"']+\.css)["'][^>]*>/g,
            (tag: string, href: string) => {
              if (!href.endsWith(fileName)) return tag;
              return chunkFiles
                .map((chunkFile) =>
                  tag.replace(
                    /href=["'][^"']+["']/,
                    `href="${href.replace(fileName, chunkFile)}"`,
                  ),
                )
                .join("");
            },
          );
        }
      }
    },
  };
}

function isBundleAsset(value: unknown): value is BundleAsset {
  return Boolean(
    value && typeof value === "object" && "type" in value && value.type === "asset",
  );
}

function splitCssByTopLevelNodes(source: string) {
  const root = parse(source, { from: undefined });
  const chunks: string[] = [];
  let current = "";

  for (const node of root.nodes) {
    const text = `${node.toString()}\n`;
    const candidate = `${current}${text}`;

    if (
      current &&
      (Buffer.byteLength(candidate, "utf8") > cssRawChunkLimit ||
        gzipSync(candidate).length > cssGzipChunkLimit)
    ) {
      chunks.push(current);
      current = text;
      continue;
    }

    current = candidate;
  }

  if (current) chunks.push(current);
  return chunks;
}
