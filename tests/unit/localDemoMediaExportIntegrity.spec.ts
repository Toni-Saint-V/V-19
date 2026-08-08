import { describe, expect, test } from "vitest";

import {
  buildLocalDemoExportMediaZipOptions,
  localDemoReviewMediaUrl,
} from "../../src/modules/submissions/exportMediaZipLocalDemo";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import type { Submission, SubmissionFile } from "../../src/modules/submissions/types";

function readySeedSubmission(): Submission {
  const source = initialSubmissions.find((submission) =>
    submission.files.some(
      (file) =>
        file.status === "accepted" &&
        file.type === "passport_scan" &&
        file.localDemoSeedMedia === true,
    ),
  );
  if (!source) throw new Error("Missing explicit local-demo media seed");
  return structuredClone(source);
}

async function downloadPassport(
  submission: Submission,
): Promise<Blob | null | undefined> {
  const options = buildLocalDemoExportMediaZipOptions([submission]);
  const asset = options.documentAssets?.find(
    (candidate) => candidate.type === "passport_scan",
  );
  if (!asset) throw new Error("Missing passport document asset");
  return options.downloadDocument?.(asset, {
    applicant: submission.applicants[0]!,
    applicantIndex: 0,
    exportDate: "2026-07-28",
    submission,
    type: asset.type,
  });
}

describe("local-demo bundled media integrity", () => {
  test("uses bundled JPEG bytes only for an explicit JPEG seed", async () => {
    const submission = readySeedSubmission();
    const passport = submission.files.find(
      (file) => file.type === "passport_scan" && file.status === "accepted",
    );
    if (!passport) throw new Error("Missing seed passport");

    const blob = await downloadPassport(submission);
    expect(blob?.type).toBe("image/jpeg");
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    expect(Array.from(bytes.slice(0, 2))).toEqual([0xff, 0xd8]);
    expect(Array.from(bytes.slice(-2))).toEqual([0xff, 0xd9]);
    await expect(localDemoReviewMediaUrl("passport_scan", passport)).resolves.toMatch(
      /passport_scan\.jpeg$/,
    );
  });

  test.each([
    {
      label: "unflagged JPEG",
      patch: {
        localDemoSeedMedia: undefined,
      },
    },
    {
      label: "flagged PDF metadata",
      patch: {
        generatedFileName: "passport.pdf",
        localDemoSeedMedia: true as const,
        mimeType: "application/pdf",
        originalFileName: "passport.pdf",
      },
    },
    {
      label: "flagged PNG metadata",
      patch: {
        generatedFileName: "passport.png",
        localDemoSeedMedia: true as const,
        mimeType: "image/png",
        originalFileName: "passport.png",
      },
    },
  ])("does not substitute JPEG bytes for $label", async ({ patch }) => {
    const source = readySeedSubmission();
    const passport = source.files.find(
      (file) => file.type === "passport_scan" && file.status === "accepted",
    );
    if (!passport) throw new Error("Missing seed passport");
    const tamperedPassport = { ...passport, ...patch } as SubmissionFile;
    const submission = {
      ...source,
      files: source.files.map((file) =>
        file.id === passport.id ? tamperedPassport : file,
      ),
    };

    await expect(downloadPassport(submission)).resolves.toBeNull();
    await expect(
      localDemoReviewMediaUrl("passport_scan", tamperedPassport),
    ).resolves.toBeNull();
  });
});
