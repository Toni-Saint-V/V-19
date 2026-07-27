import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ReviewWorkspace } from "../../src/components/ReviewWorkspace";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import * as mediaStorage from "../../src/modules/submissions/mediaStorage";
import { buildMediaStoragePath } from "../../src/modules/submissions/mediaStoragePolicy";
import type {
  Submission,
  SubmissionFile,
  SubmissionFileType,
} from "../../src/modules/submissions/types";
import {
  adminAcceptRequiredMediaForTest,
  adminApprovePassportFieldsForTest,
  fillRequiredQuestionnaireForTest,
} from "./helpers/questionnaireTestFill";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, reject: rejectPromise, resolve: resolvePromise };
}

function protectedFile(
  submissionId: string,
  applicantId: string,
  type: Extract<SubmissionFileType, "passport_scan" | "selfie" | "selfie_2">,
): SubmissionFile {
  const generatedFileName = `${applicantId.replace(/\D/g, "")}_${type}.jpg`;
  const target = buildMediaStoragePath(
    submissionId,
    applicantId,
    type,
    generatedFileName,
  );

  return {
    applicantId,
    generatedFileName,
    id: `${applicantId}-${type}`,
    mimeType: "image/jpeg",
    status: "pending_review",
    storageAdapter: "supabase-private",
    storageBucket: target.bucket,
    storagePath: target.path,
    type,
    uploadStatus: "uploaded",
  };
}

function reviewSubmission(applicantId?: string): Submission {
  const source = initialSubmissions.find((submission) => submission.id === "ПД-1053");
  const sourceApplicant = source?.applicants[0];
  if (!source || !sourceApplicant) throw new Error("Expected review fixture");
  const selectedApplicant = applicantId
    ? { ...sourceApplicant, id: applicantId }
    : sourceApplicant;

  const filled = fillRequiredQuestionnaireForTest({
    ...source,
    applicants: [selectedApplicant],
    issues: [],
    status: "submitted_for_review",
    type: "single",
  });
  const applicant = filled.applicants[0];
  if (!applicant) throw new Error("Expected review applicant");

  return {
    ...filled,
    files: (["passport_scan", "selfie", "selfie_2"] as const).map((type) =>
      protectedFile(filled.id, applicant.id, type),
    ),
  };
}

function decisionReadySubmission(): Submission {
  const source = initialSubmissions.find((submission) => submission.id === "ПД-1056");
  if (!source) throw new Error("Expected final decision fixture");

  let submission: Submission = {
    ...source,
    exportState: "not_ready",
    issues: [],
    status: "submitted_for_review",
  };
  submission = fillRequiredQuestionnaireForTest(submission);
  submission = adminApprovePassportFieldsForTest(submission);
  return adminAcceptRequiredMediaForTest(submission);
}

async function approveAllIdentityOriginals() {
  const mediaByLabel = {
    Паспорт: "passport_scan",
    "Селфи 1": "selfie",
    "Селфи 2": "selfie_2",
  } as const;
  for (const label of ["Паспорт", "Селфи 1", "Селфи 2"] as const) {
    fireEvent.click(screen.getByRole("tab", { name: label }));
    const preview = await screen.findByTestId(
      `protected-media-preview-${mediaByLabel[label]}`,
    );
    fireEvent.load(preview);
    const approveButton = screen.getByRole("button", {
      name: `Подтвердить оригинал: ${label}`,
    });
    await waitFor(() => expect(approveButton).toBeEnabled());
    fireEvent.click(approveButton);
  }
  screen
    .getAllByRole("button", { name: /Подтвердить поле:/ })
    .forEach((button) => fireEvent.click(button));
}

describe("ReviewWorkspace perceived feedback", () => {
  test("loads originals on demand and requires explicit approval for every file", async () => {
    const submission = reviewSubmission();
    const passport = deferred<string>();
    const selfie = deferred<string>();
    const secondSelfie = deferred<string>();

    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockImplementation(
      async ({ path }) => {
        if (path.includes("passport_scan")) return passport.promise;
        if (path.includes("selfie_2")) return secondSelfie.promise;
        return selfie.promise;
      },
    );

    render(
      <ReviewWorkspace
        applicantId={submission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onApproveSection={vi.fn()}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    await waitFor(() =>
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(1),
    );
    expect(screen.getAllByText("Загружаем оригинал")[0]).toBeVisible();

    const confirmButton = screen.getByRole("button", { name: "Сохранить" });
    expect(confirmButton).toBeDisabled();
    expect(confirmButton).toHaveAttribute(
      "aria-description",
      "Загружаем защищённые оригиналы для сверки…",
    );

    await act(async () => {
      passport.resolve("https://media.test/passport.jpg");
      await passport.promise;
    });

    const passportImage = await screen.findByRole("img", {
      name: "Оригинал загранпаспорта",
    });
    expect(passportImage).toHaveAttribute("src", "https://media.test/passport.jpg");
    expect(passportImage).toHaveClass("is-loading");

    fireEvent.load(passportImage);

    await waitFor(() => expect(passportImage).toHaveClass("is-ready"));
    const approvePassport = screen.getByRole("button", {
      name: "Подтвердить оригинал: Паспорт",
    });
    expect(approvePassport).toBeEnabled();
    fireEvent.click(approvePassport);
    expect(confirmButton).toBeDisabled();
    expect(confirmButton).toHaveAttribute(
      "aria-description",
      "Дождитесь отображения каждого оригинала.",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Селфи 1" }));
    await waitFor(() =>
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(2),
    );
    await act(async () => {
      selfie.resolve("https://media.test/selfie.jpg");
      await selfie.promise;
    });
    const selfieImage = await screen.findByRole("img", {
      name: "Первое селфи заявителя",
    });
    expect(selfieImage).toHaveAttribute("src", "https://media.test/selfie.jpg");
    const approveSelfie = screen.getByRole("button", {
      name: "Подтвердить оригинал: Селфи 1",
    });
    expect(approveSelfie).toBeDisabled();
    fireEvent.load(selfieImage);
    await waitFor(() => expect(approveSelfie).toBeEnabled());
    fireEvent.click(approveSelfie);
    expect(confirmButton).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Селфи 2" }));
    await waitFor(() =>
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(3),
    );
    await act(async () => {
      secondSelfie.resolve("https://media.test/selfie-2.jpg");
      await secondSelfie.promise;
    });
    const secondSelfieImage = await screen.findByRole("img", {
      name: "Второе селфи заявителя",
    });
    const approveSecondSelfie = screen.getByRole("button", {
      name: "Подтвердить оригинал: Селфи 2",
    });
    expect(approveSecondSelfie).toBeDisabled();
    fireEvent.load(secondSelfieImage);
    await waitFor(() => expect(approveSecondSelfie).toBeEnabled());
    expect(confirmButton).toBeDisabled();
    expect(confirmButton).toHaveAttribute(
      "aria-description",
      "Подтвердите каждый оригинал перед сохранением проверки.",
    );
    fireEvent.click(approveSecondSelfie);
    expect(confirmButton).toBeDisabled();
    expect(confirmButton).toHaveAttribute(
      "aria-description",
      "Сверьте с паспортом и подтвердите каждое поле.",
    );
    screen
      .getAllByRole("button", { name: /Подтвердить поле:/ })
      .forEach((button) => fireEvent.click(button));
    await waitFor(() => expect(confirmButton).toBeEnabled());
  });

  test("keeps completed checks when a remark form is opened and cancelled", async () => {
    const submission = reviewSubmission();
    const onAddRemark = vi.fn();
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://media.test/passport-remark.jpg",
    );

    render(
      <ReviewWorkspace
        applicantId={submission.applicants[0]?.id}
        onAddRemark={onAddRemark}
        onApproveSection={vi.fn()}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    const passportImage = await screen.findByRole("img", {
      name: "Оригинал загранпаспорта",
    });
    fireEvent.load(passportImage);
    const approvePassport = screen.getByRole("button", {
      name: "Подтвердить оригинал: Паспорт",
    });
    await waitFor(() => expect(approvePassport).toBeEnabled());
    fireEvent.click(approvePassport);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Добавить замечание: Скан загранпаспорта",
      }),
    );

    expect(onAddRemark).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Оригинал проверен: Паспорт" }),
    ).toBeDisabled();
  });

  test("clears a transient approval when the rendered original fails or retries", async () => {
    const submission = reviewSubmission();
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://media.test/passport-retry.jpg",
    );

    render(
      <ReviewWorkspace
        applicantId={submission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onApproveSection={vi.fn()}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    const firstImage = await screen.findByRole("img", {
      name: "Оригинал загранпаспорта",
    });
    const approveButton = screen.getByRole("button", {
      name: "Подтвердить оригинал: Паспорт",
    });
    expect(approveButton).toBeDisabled();
    fireEvent.load(firstImage);
    await waitFor(() => expect(approveButton).toBeEnabled());
    fireEvent.click(approveButton);
    expect(
      screen.getByRole("button", { name: "Оригинал проверен: Паспорт" }),
    ).toBeDisabled();

    fireEvent.error(firstImage);
    await waitFor(() =>
      expect(screen.getByText("Защищённый оригинал недоступен")).toBeVisible(),
    );
    expect(
      screen.getByRole("button", { name: "Подтвердить оригинал: Паспорт" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    const retriedImage = await screen.findByRole("img", {
      name: "Оригинал загранпаспорта",
    });
    fireEvent.load(retriedImage);
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Подтвердить оригинал: Паспорт",
        }),
      ).toBeEnabled(),
    );
  });

  test("treats accepted media without review metadata as repairable", async () => {
    const canonical = adminAcceptRequiredMediaForTest(
      adminApprovePassportFieldsForTest(reviewSubmission()),
    );
    const submission: Submission = {
      ...canonical,
      files: canonical.files.map((file) =>
        file.type === "passport_scan"
          ? { ...file, reviewedAtIso: undefined, reviewedBy: undefined }
          : file,
      ),
    };
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://media.test/partial-review.jpg",
    );

    render(
      <ReviewWorkspace
        applicantId={submission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onApproveSection={vi.fn()}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    expect(screen.queryByRole("button", { name: "Сохранено" })).toBeNull();
    const image = await screen.findByRole("img", {
      name: "Оригинал загранпаспорта",
    });
    const approveButton = screen.getByRole("button", {
      name: "Подтвердить оригинал: Паспорт",
    });
    expect(approveButton).toBeDisabled();
    fireEvent.load(image);
    await waitFor(() => expect(approveButton).toBeEnabled());
  });

  test("shows a warning only after protected media becomes unavailable", async () => {
    const submission = reviewSubmission();
    const mediaRequests = [deferred<string>(), deferred<string>(), deferred<string>()];
    let requestIndex = 0;
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockImplementation(
      () => mediaRequests[requestIndex++]?.promise ?? Promise.resolve(""),
    );

    render(
      <ReviewWorkspace
        applicantId={submission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    await waitFor(() =>
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(1),
    );
    const confirmButton = screen.getByRole("button", { name: "Сохранить" });
    expect(screen.getByText("Загружаем оригинал")).toBeVisible();
    expect(confirmButton).toHaveAttribute(
      "aria-description",
      "Загружаем защищённые оригиналы для сверки…",
    );

    await act(async () => {
      mediaRequests[0]?.reject(new Error("offline"));
      await Promise.allSettled([mediaRequests[0]?.promise]);
    });

    expect(await screen.findByText("Защищённый оригинал недоступен")).toBeVisible();
    expect(confirmButton).toHaveAttribute(
      "aria-description",
      "Для подтверждения нужны защищённые оригиналы паспорта и двух селфи.",
    );
  });

  test("retries a transient signed URL failure without reopening the workspace", async () => {
    const submission = reviewSubmission();
    const requests = Array.from({ length: 2 }, () => deferred<string>());
    let requestIndex = 0;
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockImplementation(
      () => requests[requestIndex++]?.promise ?? Promise.resolve(""),
    );

    render(
      <ReviewWorkspace
        applicantId={submission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );
    await waitFor(() =>
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(1),
    );

    await act(async () => {
      requests[0]?.reject(new Error("temporary outage"));
      await Promise.allSettled([requests[0]?.promise]);
    });
    fireEvent.click(await screen.findByRole("button", { name: "Повторить загрузку" }));
    await waitFor(() =>
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(2),
    );

    await act(async () => {
      requests[1]?.resolve("https://media.test/retried-passport.jpg");
      await requests[1]?.promise;
    });

    expect(
      await screen.findByRole("img", { name: "Оригинал загранпаспорта" }),
    ).toHaveAttribute("src", "https://media.test/retried-passport.jpg");
    expect(screen.queryByRole("button", { name: "Повторить загрузку" })).toBeNull();
  });

  test.skipIf(process.env.VITE_SUPABASE_BACKEND_TARGET === "local-demo")(
    "keeps another in-flight original alive when retrying a failed passport",
    async () => {
      const submission = reviewSubmission();
      const passport = deferred<string>();
      const retriedPassport = deferred<string>();
      const selfie = deferred<string>();
      let passportRequestCount = 0;
      vi.spyOn(mediaStorage, "createMediaSignedUrl").mockImplementation(({ path }) => {
        if (!path.includes("passport_scan")) return selfie.promise;
        passportRequestCount += 1;
        return passportRequestCount === 1 ? passport.promise : retriedPassport.promise;
      });

      render(
        <ReviewWorkspace
          applicantId={submission.applicants[0]?.id}
          onAddRemark={() => undefined}
          onBack={() => undefined}
          submission={submission}
          submissionId={submission.id}
        />,
      );
      await waitFor(() =>
        expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(1),
      );

      fireEvent.click(screen.getByRole("tab", { name: "Селфи 1" }));
      await waitFor(() =>
        expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(2),
      );

      await act(async () => {
        passport.reject(new Error("temporary passport outage"));
        await Promise.allSettled([passport.promise]);
      });
      fireEvent.click(
        await screen.findByRole("button", { name: "Повторить загрузку" }),
      );
      await waitFor(() =>
        expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(3),
      );

      await act(async () => {
        selfie.resolve("https://media.test/in-flight-selfie.jpg");
        retriedPassport.resolve("https://media.test/retried-passport.jpg");
        await Promise.all([selfie.promise, retriedPassport.promise]);
      });

      expect(
        await screen.findByRole("img", { name: "Первое селфи заявителя" }),
      ).toHaveAttribute("src", "https://media.test/in-flight-selfie.jpg");
      expect(
        await screen.findByRole("img", { name: "Оригинал загранпаспорта" }),
      ).toHaveAttribute("src", "https://media.test/retried-passport.jpg");
    },
  );

  test("does not sign or retry rejected media and explains the replacement state", async () => {
    const source = reviewSubmission();
    const submission: Submission = {
      ...source,
      files: source.files.map((file) =>
        file.type === "passport_scan"
          ? {
              ...file,
              reviewStatus: "poor_quality",
              status: "needs_replacement",
            }
          : file,
      ),
    };
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://media.test/protected.jpg",
    );

    render(
      <ReviewWorkspace
        applicantId={submission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onApproveSection={vi.fn()}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    expect(screen.getByText("Оригинал нельзя принять")).toBeVisible();
    expect(
      screen.getByText(
        "Файл отклонён или требует замены. Новый оригинал загружает агент.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Повторить загрузку" })).toBeNull();
    expect(mediaStorage.createMediaSignedUrl).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  });

  test("does not retry media with a noncanonical private-storage identity", async () => {
    const source = reviewSubmission();
    const submission: Submission = {
      ...source,
      files: source.files.map((file) =>
        file.type === "passport_scan"
          ? {
              ...file,
              storagePath: `submissions/another-case/${file.applicantId}/passport_scan/${file.generatedFileName}`,
            }
          : file,
      ),
    };
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://media.test/protected.jpg",
    );

    render(
      <ReviewWorkspace
        applicantId={submission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onApproveSection={vi.fn()}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    expect(screen.getByText("Оригинал нельзя принять")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Повторить загрузку" })).toBeNull();
    expect(mediaStorage.createMediaSignedUrl).not.toHaveBeenCalled();
  });

  test("ignores signed URLs from the previously selected applicant", async () => {
    const firstSubmission = reviewSubmission("з-1053-1");
    const nextSubmission = reviewSubmission("з-2053-1");
    const requests = Array.from({ length: 2 }, () => deferred<string>());
    let requestIndex = 0;
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockImplementation(
      () => requests[requestIndex++]?.promise ?? Promise.resolve(""),
    );

    const { rerender } = render(
      <ReviewWorkspace
        applicantId={firstSubmission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        submission={firstSubmission}
        submissionId={firstSubmission.id}
      />,
    );
    await waitFor(() =>
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(1),
    );

    rerender(
      <ReviewWorkspace
        applicantId={nextSubmission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        submission={nextSubmission}
        submissionId={nextSubmission.id}
      />,
    );
    await waitFor(() =>
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(2),
    );

    await act(async () => {
      requests[0]?.resolve("https://media.test/stale-passport.jpg");
      await requests[0]?.promise;
    });
    expect(screen.queryByRole("img", { name: "Оригинал загранпаспорта" })).toBeNull();

    await act(async () => {
      requests[1]?.resolve("https://media.test/current-passport.jpg");
      await requests[1]?.promise;
    });
    expect(
      await screen.findByRole("img", { name: "Оригинал загранпаспорта" }),
    ).toHaveAttribute("src", "https://media.test/current-passport.jpg");
  });

  test("ignores a completed image decode from the previous media owner", async () => {
    const firstSubmission = reviewSubmission("з-1053-1");
    const nextSubmission = reviewSubmission("з-2053-1");
    let finishDecode!: () => void;
    const decode = new Promise<void>((resolve) => {
      finishDecode = resolve;
    });
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://media.test/shared-passport.jpg",
    );

    const { rerender } = render(
      <ReviewWorkspace
        applicantId={firstSubmission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        submission={firstSubmission}
        submissionId={firstSubmission.id}
      />,
    );
    const oldImage = await screen.findByRole("img", {
      name: "Оригинал загранпаспорта",
    });
    Object.defineProperty(oldImage, "decode", {
      configurable: true,
      value: () => decode,
    });
    fireEvent.load(oldImage);

    rerender(
      <ReviewWorkspace
        applicantId={nextSubmission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        submission={nextSubmission}
        submissionId={nextSubmission.id}
      />,
    );
    const currentImage = await screen.findByRole("img", {
      name: "Оригинал загранпаспорта",
    });
    expect(currentImage).not.toBe(oldImage);

    await act(async () => {
      finishDecode();
      await decode;
    });

    const approveButton = screen.getByRole("button", {
      name: "Подтвердить оригинал: Паспорт",
    });
    expect(approveButton).toBeDisabled();
    fireEvent.load(currentImage);
    await waitFor(() => expect(approveButton).toBeEnabled());
  });

  test("drops a ready preview when the protected file generation changes", async () => {
    const submission = reviewSubmission();
    const replacementSubmission: Submission = {
      ...submission,
      files: submission.files.map((file) =>
        file.type === "passport_scan"
          ? {
              ...file,
              id: `${file.id}-replacement`,
              uploadedAtIso: "2026-07-22T12:00:00.000Z",
            }
          : file,
      ),
    };
    const requests = Array.from({ length: 2 }, () => deferred<string>());
    let requestIndex = 0;
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockImplementation(
      () => requests[requestIndex++]?.promise ?? Promise.resolve(""),
    );

    const props = {
      applicantId: submission.applicants[0]?.id,
      onAddRemark: () => undefined,
      onBack: () => undefined,
      submissionId: submission.id,
    };
    const { rerender } = render(<ReviewWorkspace {...props} submission={submission} />);
    await waitFor(() =>
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(1),
    );

    await act(async () => {
      requests[0]?.resolve("https://media.test/old-passport.jpg");
      await requests[0]?.promise;
    });
    expect(
      await screen.findByRole("img", { name: "Оригинал загранпаспорта" }),
    ).toHaveAttribute("src", "https://media.test/old-passport.jpg");

    rerender(<ReviewWorkspace {...props} submission={replacementSubmission} />);
    expect(screen.queryByRole("img", { name: "Оригинал загранпаспорта" })).toBeNull();
    await waitFor(() =>
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(2),
    );

    await act(async () => {
      requests[1]?.resolve("https://media.test/replacement-passport.jpg");
      await requests[1]?.promise;
    });
    expect(
      await screen.findByRole("img", { name: "Оригинал загранпаспорта" }),
    ).toHaveAttribute("src", "https://media.test/replacement-passport.jpg");
  });

  test("drops a ready preview when the same file loses its protected storage identity", async () => {
    const submission = reviewSubmission();
    const requests = [deferred<string>()];
    let requestIndex = 0;
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockImplementation(
      () => requests[requestIndex++]?.promise ?? Promise.resolve(""),
    );
    const props = {
      applicantId: submission.applicants[0]?.id,
      onAddRemark: () => undefined,
      onBack: () => undefined,
      submissionId: submission.id,
    };
    const { rerender } = render(<ReviewWorkspace {...props} submission={submission} />);
    await waitFor(() =>
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(1),
    );

    await act(async () => {
      requests[0]?.resolve("https://media.test/old-passport.jpg");
      await requests[0]?.promise;
    });
    expect(
      await screen.findByRole("img", { name: "Оригинал загранпаспорта" }),
    ).toHaveAttribute("src", "https://media.test/old-passport.jpg");

    rerender(
      <ReviewWorkspace
        {...props}
        submission={{
          ...submission,
          files: submission.files.map((file) =>
            file.type === "passport_scan"
              ? { ...file, storageAdapter: "local-dev" }
              : file,
          ),
        }}
      />,
    );

    expect(screen.queryByRole("img", { name: "Оригинал загранпаспорта" })).toBeNull();
    expect(screen.getByText("Оригинал нельзя принять")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Повторить загрузку" })).toBeNull();
    expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(1);
  });

  test("does not refetch unchanged media for a new submission object", async () => {
    const submission = reviewSubmission();
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockImplementation(
      () => new Promise(() => undefined),
    );
    const props = {
      applicantId: submission.applicants[0]?.id,
      onAddRemark: () => undefined,
      onBack: () => undefined,
      submissionId: submission.id,
    };
    const { rerender } = render(<ReviewWorkspace {...props} submission={submission} />);
    await waitFor(() =>
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(1),
    );

    rerender(
      <ReviewWorkspace
        {...props}
        submission={{ ...submission, issues: [...submission.issues] }}
      />,
    );
    await act(async () => Promise.resolve());

    expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(1);
  });

  test("renders a compact focus layout without legacy scrolling blocks", async () => {
    const submission = reviewSubmission();
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockImplementation(
      () => new Promise(() => undefined),
    );

    const { container } = render(
      <ReviewWorkspace
        applicantId={submission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );
    const workspace = container.querySelector<HTMLElement>(".v19-review-workspace");
    const footer = container.querySelector<HTMLElement>(".v19-review-decision");
    expect(workspace).toHaveClass("is-media-focus");
    expect(footer).toBeInTheDocument();
    expect(container.querySelector(".v19-review-decision-context")).toBeNull();
    expect(container.querySelector(".v19-review-readiness")).toBeNull();
    expect(container.querySelector(".v19-review-field-grid")).toBeNull();
    expect(workspace?.style.getPropertyValue("--v19-review-decision-height")).toBe("");
  });

  test("shows pending and completed section feedback as distinct states", async () => {
    const submission = reviewSubmission();
    const approval = deferred<boolean>();
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://media.test/protected.jpg",
    );

    const { container } = render(
      <ReviewWorkspace
        applicantId={submission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onApproveSection={() => approval.promise}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );
    const confirmButton = screen.getByRole("button", {
      name: "Сохранить",
    });
    await approveAllIdentityOriginals();
    await waitFor(() => expect(confirmButton).toBeEnabled());

    fireEvent.click(confirmButton);

    const confirmation = container.querySelector(".v19-review-confirmation");
    expect(confirmation).toHaveClass("is-pending");
    expect(confirmation).toHaveAttribute("aria-busy", "true");
    expect(confirmButton).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      approval.resolve(true);
      await approval.promise;
    });

    await waitFor(() => expect(confirmation).toHaveClass("is-complete"));
    expect(screen.getByRole("button", { name: "Сохранено" })).toBeVisible();
    expect(confirmation).toHaveAttribute("aria-busy", "false");
  });

  test("ignores a section approval that resolves after switching applicants", async () => {
    const firstSubmission = reviewSubmission("з-1053-1");
    const nextSubmission = reviewSubmission("з-2053-1");
    const approval = deferred<boolean>();
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://media.test/protected.jpg",
    );
    const props = {
      onAddRemark: () => undefined,
      onApproveSection: () => approval.promise,
      onBack: () => undefined,
      submissionId: firstSubmission.id,
    };
    const { rerender } = render(
      <ReviewWorkspace
        {...props}
        applicantId={firstSubmission.applicants[0]?.id}
        submission={firstSubmission}
      />,
    );
    const confirmButton = screen.getByRole("button", {
      name: "Сохранить",
    });
    await approveAllIdentityOriginals();
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    rerender(
      <ReviewWorkspace
        {...props}
        applicantId={nextSubmission.applicants[0]?.id}
        submission={nextSubmission}
      />,
    );
    await approveAllIdentityOriginals();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled(),
    );

    await act(async () => {
      approval.resolve(true);
      await approval.promise;
    });

    expect(screen.queryByRole("button", { name: "Сохранено" })).toBeNull();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled();
  });

  test("keeps final decision feedback explicit while persistence is pending", async () => {
    const submission = decisionReadySubmission();
    const persisted = deferred<boolean>();
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockImplementation(
      () => new Promise(() => undefined),
    );

    const { container } = render(
      <ReviewWorkspace
        applicantId={submission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        onReviewAction={() => persisted.promise}
        submission={submission}
        submissionId={submission.id}
      />,
    );
    const acceptButton = screen.getByRole("button", { name: "Принять" });
    expect(acceptButton).toBeEnabled();

    fireEvent.click(acceptButton);

    const decision = container.querySelector(".v19-review-decision");
    expect(decision).toHaveClass("is-pending");
    expect(decision).toHaveAttribute("aria-busy", "true");
    expect(acceptButton).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByText("Сохраняем принятие подачи…")[0]).toBeVisible();

    await act(async () => {
      persisted.resolve(true);
      await persisted.promise;
    });

    await waitFor(() => expect(decision).not.toHaveClass("is-pending"));
    expect(decision).toHaveAttribute("aria-busy", "false");
  });

  test.each([
    {
      error: new Error("revision conflict"),
      expected:
        "Данные уже изменены другим администратором. Обновите подачу и проверьте её заново.",
    },
    {
      error: new Error("permission lost for current session"),
      expected:
        "Сессия или права доступа изменились. Войдите снова; подача не была изменена.",
    },
  ])("keeps the decision unchanged after $expected", async ({ error, expected }) => {
    const submission = decisionReadySubmission();
    const onReviewAction = vi.fn().mockRejectedValue(error);
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockImplementation(
      () => new Promise(() => undefined),
    );

    render(
      <ReviewWorkspace
        applicantId={submission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        onReviewAction={onReviewAction}
        submission={submission}
        submissionId={submission.id}
      />,
    );
    const acceptButton = screen.getByRole("button", { name: "Принять" });
    fireEvent.click(acceptButton);
    fireEvent.click(acceptButton);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(expected));
    expect(onReviewAction).toHaveBeenCalledTimes(1);
    expect(submission.status).toBe("submitted_for_review");
    expect(screen.getByRole("button", { name: "Принять" })).toBeEnabled();
  });
});
