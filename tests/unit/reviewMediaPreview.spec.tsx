import { readFileSync } from "node:fs";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ReviewMediaPreview } from "../../src/components/ReviewMediaPreview";
import type { SubmissionFile } from "../../src/modules/submissions/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const reviewWorkspaceCss = readFileSync(
  `${process.cwd()}/src/shared/ui/review-workspace.css`,
  "utf8",
);

function ruleBodies(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(
    reviewWorkspaceCss.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "g")),
    (match) => match[1] ?? "",
  );
}

describe("ReviewMediaPreview", () => {
  test("keeps ready images inside the preview canvas and preserves transforms", async () => {
    render(
      <ReviewMediaPreview
        alt="Оригинал загранпаспорта"
        label="Паспорт"
        preview={{ status: "ready", url: "blob:passport-preview" }}
        testId="protected-media-preview-passport_scan"
        transform="scale(1) rotate(0deg)"
        variant="single"
        onError={vi.fn()}
      />,
    );

    const image = screen.getByRole("img", { name: "Оригинал загранпаспорта" });
    expect(image.parentElement).toHaveClass("v19-review-preview-canvas");
    expect(image).toHaveStyle({ transform: "scale(1) rotate(0deg)" });
    expect(image).toHaveClass("is-loading");
    expect(image.parentElement).toHaveAttribute("aria-busy", "true");

    fireEvent.load(image);

    await waitFor(() => expect(image).toHaveClass("is-ready"));
    expect(image.parentElement).toHaveAttribute("aria-busy", "false");
  });

  test("keeps the skeleton until async image decoding finishes", async () => {
    let finishDecode!: () => void;
    const decode = new Promise<void>((resolve) => {
      finishDecode = resolve;
    });

    const { container } = render(
      <ReviewMediaPreview
        alt="Оригинал загранпаспорта"
        label="Паспорт"
        preview={{ status: "ready", url: "blob:decoded-passport" }}
        testId="protected-media-preview-passport_scan"
        variant="single"
        onError={vi.fn()}
      />,
    );
    const image = screen.getByRole("img", { name: "Оригинал загранпаспорта" });
    Object.defineProperty(image, "decode", { configurable: true, value: () => decode });

    fireEvent.load(image);

    expect(image).toHaveClass("is-loading");
    expect(container.querySelector(".v19-review-preview-skeleton")).toBeVisible();

    await act(async () => {
      finishDecode();
      await decode;
    });

    expect(image).toHaveClass("is-ready");
    expect(container.querySelector(".v19-review-preview-skeleton")).toBeNull();
  });

  test("ignores a completed decode from a stale preview URL", async () => {
    let finishDecode!: () => void;
    const decode = new Promise<void>((resolve) => {
      finishDecode = resolve;
    });
    const props = {
      alt: "Оригинал загранпаспорта",
      label: "Паспорт",
      testId: "protected-media-preview-passport_scan",
      variant: "single" as const,
      onError: vi.fn(),
    };
    const { rerender } = render(
      <ReviewMediaPreview
        {...props}
        preview={{ status: "ready", url: "blob:old-passport" }}
      />,
    );
    const oldImage = screen.getByRole("img", { name: "Оригинал загранпаспорта" });
    Object.defineProperty(oldImage, "decode", {
      configurable: true,
      value: () => decode,
    });
    fireEvent.load(oldImage);

    rerender(
      <ReviewMediaPreview
        {...props}
        preview={{ status: "ready", url: "blob:new-passport" }}
      />,
    );
    await act(async () => {
      finishDecode();
      await decode;
    });

    const currentImage = screen.getByRole("img", {
      name: "Оригинал загранпаспорта",
    });
    expect(currentImage).toHaveAttribute("src", "blob:new-passport");
    expect(currentImage).toHaveClass("is-loading");
  });

  test("replaces the image element when the preview URL changes", () => {
    const props = {
      alt: "Оригинал загранпаспорта",
      label: "Паспорт",
      testId: "protected-media-preview-passport_scan",
      variant: "single" as const,
      onError: vi.fn(),
    };
    const { rerender } = render(
      <ReviewMediaPreview
        {...props}
        preview={{ status: "ready", url: "blob:old-passport" }}
      />,
    );
    const oldImage = screen.getByRole("img", { name: "Оригинал загранпаспорта" });

    rerender(
      <ReviewMediaPreview
        {...props}
        preview={{ status: "ready", url: "blob:new-passport" }}
      />,
    );

    const currentImage = screen.getByRole("img", {
      name: "Оригинал загранпаспорта",
    });
    expect(currentImage).not.toBe(oldImage);
    expect(currentImage).toHaveAttribute("src", "blob:new-passport");
    expect(currentImage).toHaveClass("is-loading");
  });

  test("announces unavailable protected media", () => {
    render(
      <ReviewMediaPreview
        alt="Оригинал загранпаспорта"
        file={
          {
            applicantId: "applicant-1",
            id: "passport-1",
            mimeType: "image/jpeg",
            status: "pending_review",
            type: "passport_scan",
          } satisfies SubmissionFile
        }
        label="Паспорт"
        preview={{ status: "unavailable" }}
        testId="protected-media-preview-passport_scan"
        variant="single"
        onError={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Защищённый оригинал недоступен",
    );
  });

  test("keeps a stable skeleton visible until protected media is ready", () => {
    const { container } = render(
      <ReviewMediaPreview
        alt="Оригинал загранпаспорта"
        label="Паспорт"
        preview={{ status: "loading" }}
        testId="protected-media-preview-passport_scan"
        variant="single"
        onError={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Загружаем оригинал: Паспорт");
    expect(container.querySelector(".v19-review-preview-skeleton")).toBeVisible();
    expect(container.querySelector(".v19-review-preview-canvas")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  test("reports an embedded PDF load failure so the workspace can retry safely", () => {
    const onError = vi.fn();
    const { container } = render(
      <ReviewMediaPreview
        alt="Оригинал паспорта PDF"
        file={
          {
            applicantId: "applicant-1",
            generatedFileName: "passport.pdf",
            id: "passport-pdf",
            mimeType: "application/pdf",
            status: "pending_review",
            type: "passport_scan",
          } satisfies SubmissionFile
        }
        label="Паспорт"
        preview={{ status: "ready", url: "blob:passport-pdf" }}
        testId="protected-media-preview-passport_scan"
        variant="single"
        onError={onError}
      />,
    );

    const embeddedPdf = container.querySelector("object");
    expect(embeddedPdf).not.toBeNull();
    fireEvent.error(embeddedPdf);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Открыть оригинал" })).toHaveAttribute(
      "href",
      "blob:passport-pdf",
    );
  });

  test("uses a positioned containing block so 100 percent media fits before zoom", () => {
    expect(ruleBodies(".v19-review-preview-canvas")).toContainEqual(
      expect.stringContaining("position: relative"),
    );

    const mediaRule = ruleBodies(".v19-review-preview-canvas :is(img, object)")[0];
    expect(mediaRule).toContain("position: absolute");
    expect(mediaRule).toContain("inset: var(--v19b-size-0)");
    expect(mediaRule).toContain("width: var(--v19b-size-full)");
    expect(mediaRule).toContain("height: var(--v19b-size-full)");
    expect(mediaRule).toContain("object-fit: contain");
  });

  test("keeps mobile review actions visible and the decision footer reachable", () => {
    const mobileRemarkRule = ruleBodies(".v19-review-file-remark span").at(-1);
    expect(mobileRemarkRule).toContain("position: static");
    expect(mobileRemarkRule).toContain("clip-path: none");

    expect(ruleBodies(".v19-review-decision")).toContainEqual(
      expect.stringContaining("position: fixed"),
    );
    expect(ruleBodies(".v19-review-header")).toContainEqual(
      expect.stringContaining("position: sticky"),
    );
    expect(ruleBodies(".v19-review-details-scroll")).toContainEqual(
      expect.stringContaining("scroll-padding-bottom"),
    );

    const closeRule = ruleBodies(".v19-remark-form-close")[0];
    expect(closeRule).toContain("min-width: var(--v19b-size-44)");
    expect(closeRule).toContain("min-height: var(--v19b-size-44)");
  });

  test("preserves warning and completed feedback without relying on icons", () => {
    const warningRule = ruleBodies(".v19-review-status-strip > span.has-warning")[0];
    const completedRule = ruleBodies(
      ".v19-review-confirmation.is-complete button:disabled",
    )[0];

    expect(warningRule).toContain("border:");
    expect(warningRule).toContain("var(--v19b-dot-warning)");
    expect(completedRule).toContain("opacity: var(--v19b-opacity-full)");
    expect(completedRule).toContain("color: var(--v19b-dot-success)");
  });
});
