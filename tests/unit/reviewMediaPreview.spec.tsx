import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ReviewMediaPreview } from "../../src/components/ReviewMediaPreview";

afterEach(cleanup);

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
  test("keeps ready images inside the preview canvas and preserves transforms", () => {
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
      expect.stringContaining("position: sticky"),
    );
    expect(ruleBodies(".v19-review-details-scroll")).toContainEqual(
      expect.stringContaining("scroll-padding-bottom"),
    );

    const closeRule = ruleBodies(".v19-remark-form-close")[0];
    expect(closeRule).toContain("min-width: var(--v19b-size-44)");
    expect(closeRule).toContain("min-height: var(--v19b-size-44)");
  });
});
