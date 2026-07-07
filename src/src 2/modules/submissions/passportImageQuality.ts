export type PassportImageQualitySeverity = "blocker" | "warning" | "info";

export type PassportImageQualityIssueCode =
  | "unsupported_mime"
  | "too_small"
  | "portrait_scan"
  | "too_dark"
  | "too_bright"
  | "low_contrast"
  | "likely_blurry"
  | "tiny_file";

export type PassportImageQualityIssue = {
  code: PassportImageQualityIssueCode;
  message: string;
  severity: PassportImageQualitySeverity;
};

export type PassportImageQualityReport = {
  issues: PassportImageQualityIssue[];
  metrics: {
    brightness: number;
    contrast: number;
    height: number;
    sharpness: number;
    width: number;
  };
  status: "pass" | "review" | "reject";
  summary: string;
};

export type PassportImageQualityInput = {
  data: Uint8ClampedArray | number[];
  height: number;
  mimeType?: string;
  sizeBytes?: number;
  width: number;
};

export const passportImageQualityThresholds = {
  maxBrightness: 225,
  maxPortraitRatio: 1.12,
  minBrightness: 50,
  minContrast: 18,
  minHeight: 550,
  minSharpness: 7,
  minSizeBytes: 30_000,
  minWidth: 900,
  samplePixelBudget: 12_000,
} as const;

const supportedImageMimeTypes = new Set(["image/jpeg", "image/png"]);

export function analyzePassportImageQuality(
  input: PassportImageQualityInput,
): PassportImageQualityReport {
  const issues: PassportImageQualityIssue[] = [];
  const metrics = imageMetrics(input);

  if (input.mimeType && !supportedImageMimeTypes.has(input.mimeType)) {
    issues.push({
      code: "unsupported_mime",
      message: "Локальная проверка качества доступна только для JPEG или PNG.",
      severity: "blocker",
    });
  }

  if (
    input.width < passportImageQualityThresholds.minWidth ||
    input.height < passportImageQualityThresholds.minHeight
  ) {
    issues.push({
      code: "too_small",
      message: "Скан паспорта слишком маленький для надежного OCR.",
      severity: "blocker",
    });
  }

  if (input.height > input.width * passportImageQualityThresholds.maxPortraitRatio) {
    issues.push({
      code: "portrait_scan",
      message: "Паспорт лучше загрузить горизонтально: MRZ-строки должны быть внизу.",
      severity: "warning",
    });
  }

  if (
    typeof input.sizeBytes === "number" &&
    input.sizeBytes > 0 &&
    input.sizeBytes < passportImageQualityThresholds.minSizeBytes
  ) {
    issues.push({
      code: "tiny_file",
      message: "Файл выглядит слишком маленьким, возможна сильная компрессия.",
      severity: "warning",
    });
  }

  if (metrics.brightness < passportImageQualityThresholds.minBrightness) {
    issues.push({
      code: "too_dark",
      message: "Скан слишком темный, OCR может не увидеть MRZ.",
      severity: "warning",
    });
  } else if (metrics.brightness > passportImageQualityThresholds.maxBrightness) {
    issues.push({
      code: "too_bright",
      message: "Скан слишком светлый, часть текста может быть потеряна.",
      severity: "warning",
    });
  }

  if (metrics.contrast < passportImageQualityThresholds.minContrast) {
    issues.push({
      code: "low_contrast",
      message: "Низкий контраст: текст паспорта может плохо отделяться от фона.",
      severity: "warning",
    });
  }

  if (metrics.sharpness < passportImageQualityThresholds.minSharpness) {
    issues.push({
      code: "likely_blurry",
      message: "Изображение похоже на размытое, попросите новый скан перед OCR.",
      severity: "warning",
    });
  }

  const status = issues.some((issue) => issue.severity === "blocker")
    ? "reject"
    : issues.some((issue) => issue.severity === "warning")
      ? "review"
      : "pass";

  return {
    issues,
    metrics,
    status,
    summary: qualitySummary(status, issues),
  };
}

export function passportImageQualitySummary(report: PassportImageQualityReport) {
  return report.summary;
}

function qualitySummary(
  status: PassportImageQualityReport["status"],
  issues: PassportImageQualityIssue[],
) {
  if (status === "pass") {
    return "Скан паспорта подходит для локального OCR.";
  }

  const firstIssue = issues[0]?.message ?? "Проверьте качество скана вручную.";
  if (status === "reject") return `Скан паспорта не готов к OCR: ${firstIssue}`;
  return `Качество скана требует проверки: ${firstIssue}`;
}

function imageMetrics(input: PassportImageQualityInput) {
  const width = Math.max(0, Math.floor(input.width));
  const height = Math.max(0, Math.floor(input.height));
  const pixelCount = width * height;
  if (!width || !height || input.data.length < 4) {
    return { brightness: 0, contrast: 0, height, sharpness: 0, width };
  }

  const stride = Math.max(
    1,
    Math.floor(Math.sqrt(pixelCount / passportImageQualityThresholds.samplePixelBudget)),
  );
  let count = 0;
  let sum = 0;
  let sumSquares = 0;
  let gradientSum = 0;
  let gradientCount = 0;
  const previousRows = new Map<number, number>();

  for (let y = 0; y < height; y += stride) {
    let previousLuma: number | null = null;
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * 4;
      const luma = pixelLuma(input.data, offset);
      sum += luma;
      sumSquares += luma * luma;
      count += 1;

      if (previousLuma !== null) {
        gradientSum += Math.abs(luma - previousLuma);
        gradientCount += 1;
      }

      const previousRowLuma = previousRows.get(x);
      if (typeof previousRowLuma === "number") {
        gradientSum += Math.abs(luma - previousRowLuma);
        gradientCount += 1;
      }

      previousRows.set(x, luma);
      previousLuma = luma;
    }
  }

  const mean = count ? sum / count : 0;
  const variance = count ? Math.max(0, sumSquares / count - mean * mean) : 0;
  const sharpness = gradientCount ? gradientSum / gradientCount : 0;

  return {
    brightness: roundMetric(mean),
    contrast: roundMetric(Math.sqrt(variance)),
    height,
    sharpness: roundMetric(sharpness),
    width,
  };
}

function pixelLuma(data: Uint8ClampedArray | number[], offset: number) {
  const red = data[offset] ?? 0;
  const green = data[offset + 1] ?? red;
  const blue = data[offset + 2] ?? red;
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function roundMetric(value: number) {
  return Math.round(value * 10) / 10;
}
