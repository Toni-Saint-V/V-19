import { describe, expect, test } from "vitest";
import {
  analyzePassportImageQuality,
  passportImageQualityThresholds,
} from "../../src/modules/submissions/passportImageQuality";

function rgbaImage(width: number, height: number, lumaAt: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = lumaAt(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return data;
}

describe("passport image quality", () => {
  test("passes a readable horizontal passport scan", () => {
    const report = analyzePassportImageQuality({
      data: rgbaImage(1200, 700, (x) => (Math.floor(x / 16) % 2 === 0 ? 35 : 225)),
      height: 700,
      mimeType: "image/jpeg",
      sizeBytes: 250_000,
      width: 1200,
    });

    expect(report.status).toBe("pass");
    expect(report.issues).toEqual([]);
    expect(report.metrics.contrast).toBeGreaterThan(40);
    expect(report.metrics.sharpness).toBeGreaterThan(20);
  });

  test("marks too small scans as reject quality", () => {
    const report = analyzePassportImageQuality({
      data: rgbaImage(640, 360, () => 130),
      height: 360,
      mimeType: "image/png",
      sizeBytes: 120_000,
      width: 640,
    });

    expect(report.status).toBe("reject");
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "too_small",
          severity: "blocker",
        }),
      ]),
    );
  });

  test("flags dark low-contrast blurry scans for review", () => {
    const report = analyzePassportImageQuality({
      data: rgbaImage(1200, 700, () => 42),
      height: 700,
      mimeType: "image/jpeg",
      sizeBytes: 80_000,
      width: 1200,
    });

    expect(report.status).toBe("review");
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["too_dark", "low_contrast", "likely_blurry"]),
    );
  });

  test("flags portrait scans and tiny compressed files", () => {
    const report = analyzePassportImageQuality({
      data: rgbaImage(700, 1200, (x, y) => ((x + y) % 3 === 0 ? 20 : 230)),
      height: 1200,
      mimeType: "image/jpeg",
      sizeBytes: 12_000,
      width: 700,
    });

    expect(report.status).toBe("reject");
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["too_small", "portrait_scan", "tiny_file"]),
    );
  });

  test("keeps threshold values explicit for OCR gating review", () => {
    expect(passportImageQualityThresholds).toMatchObject({
      minHeight: 550,
      minWidth: 900,
      minSizeBytes: 30_000,
    });
  });
});
