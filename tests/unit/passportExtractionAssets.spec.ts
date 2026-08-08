import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const tesseractAssetRoot = join(process.cwd(), "public", "tesseract");

describe("passport extraction runtime assets", () => {
  test("ships the local OCR worker, core, and English/Russian language data", () => {
    for (const relativePath of [
      "worker.min.js",
      "core/tesseract-core-lstm.wasm",
      "core/tesseract-core-lstm.wasm.js",
      "lang/eng.traineddata.gz",
      "lang/rus.traineddata.gz",
    ]) {
      expect(
        existsSync(join(tesseractAssetRoot, relativePath)),
        `${relativePath} must be present for browser OCR`,
      ).toBe(true);
    }
  });
});
