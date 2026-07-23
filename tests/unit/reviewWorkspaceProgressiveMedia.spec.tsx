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

describe("ReviewWorkspace perceived feedback", () => {
  test("reveals the passport without waiting for slower selfie URLs", async () => {
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
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    await waitFor(() =>
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(3),
    );
    expect(screen.getAllByText("Загружаем оригинал")[0]).toBeVisible();

    const fileStatus = document.querySelector(
      ".v19-review-status-strip > span:nth-child(3)",
    );
    expect(fileStatus).toHaveClass("is-loading");
    expect(fileStatus).not.toHaveClass("has-warning");
    expect(
      screen.getByText("Загружаем защищённые оригиналы для сверки…"),
    ).toBeVisible();

    await act(async () => {
      passport.resolve("https://media.test/passport.jpg");
      await passport.promise;
    });

    const passportImage = await screen.findByRole("img", {
      name: "Оригинал загранпаспорта",
    });
    expect(passportImage).toHaveAttribute("src", "https://media.test/passport.jpg");
    expect(passportImage).toHaveClass("is-loading");
    expect(fileStatus).toHaveAttribute(
      "aria-label",
      "Оригиналы: загружается 2; доступно 1 из 3",
    );

    fireEvent.load(passportImage);

    await waitFor(() => expect(passportImage).toHaveClass("is-ready"));
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
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(3),
    );
    const fileStatus = document.querySelector(
      ".v19-review-status-strip > span:nth-child(3)",
    );
    expect(fileStatus).toHaveClass("is-loading");
    expect(fileStatus).not.toHaveClass("has-warning");

    await act(async () => {
      mediaRequests[0]?.reject(new Error("offline"));
      await Promise.allSettled([mediaRequests[0]?.promise]);
    });

    await waitFor(() => expect(fileStatus).toHaveClass("has-warning"));
    expect(fileStatus).not.toHaveClass("is-loading");
    expect(fileStatus).toHaveAttribute(
      "aria-label",
      "Оригиналы: недоступно 1; загружается 2; доступно 0 из 3",
    );
    expect(
      screen.getByText(
        "Для подтверждения нужны защищённые оригиналы паспорта и двух селфи.",
      ),
    ).toBeVisible();

    await act(async () => {
      for (const request of mediaRequests.slice(1)) {
        request.reject(new Error("offline"));
      }
      await Promise.allSettled(
        mediaRequests.slice(1).map((request) => request.promise),
      );
    });
  });

  test("retries a transient signed URL failure without reopening the workspace", async () => {
    const submission = reviewSubmission();
    const requests = Array.from({ length: 6 }, () => deferred<string>());
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
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(3),
    );

    await act(async () => {
      requests[0]?.reject(new Error("temporary outage"));
      await Promise.allSettled([requests[0]?.promise]);
    });
    fireEvent.click(await screen.findByRole("button", { name: "Повторить загрузку" }));
    await waitFor(() =>
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(6),
    );

    await act(async () => {
      requests[3]?.resolve("https://media.test/retried-passport.jpg");
      await requests[3]?.promise;
    });

    expect(
      await screen.findByRole("img", { name: "Оригинал загранпаспорта" }),
    ).toHaveAttribute("src", "https://media.test/retried-passport.jpg");
    expect(screen.queryByRole("button", { name: "Повторить загрузку" })).toBeNull();
  });

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
    await waitFor(() =>
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(2),
    );
    expect(
      screen.getByRole("button", { name: "Подтвердить паспортную секцию" }),
    ).toBeDisabled();
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
    await waitFor(() =>
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(2),
    );
  });

  test("ignores signed URLs from the previously selected applicant", async () => {
    const firstSubmission = reviewSubmission("з-1053-1");
    const nextSubmission = reviewSubmission("з-2053-1");
    const requests = Array.from({ length: 6 }, () => deferred<string>());
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
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(3),
    );

    await act(async () => {
      requests[0]?.resolve("https://media.test/ready-first-passport.jpg");
      await requests[0]?.promise;
    });
    const firstImage = await screen.findByRole("img", {
      name: "Оригинал загранпаспорта",
    });
    fireEvent.load(firstImage);
    await waitFor(() => expect(firstImage).toHaveClass("is-ready"));

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
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(6),
    );

    await act(async () => {
      requests[1]?.resolve("https://media.test/stale-selfie.jpg");
      await requests[1]?.promise;
    });
    expect(screen.queryByRole("img", { name: "Оригинал загранпаспорта" })).toBeNull();

    await act(async () => {
      requests[3]?.resolve("https://media.test/current-passport.jpg");
      await requests[3]?.promise;
    });
    expect(
      await screen.findByRole("img", { name: "Оригинал загранпаспорта" }),
    ).toHaveAttribute("src", "https://media.test/current-passport.jpg");
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
    const requests = Array.from({ length: 6 }, () => deferred<string>());
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
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(3),
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
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(6),
    );

    await act(async () => {
      requests[3]?.resolve("https://media.test/replacement-passport.jpg");
      await requests[3]?.promise;
    });
    expect(
      await screen.findByRole("img", { name: "Оригинал загранпаспорта" }),
    ).toHaveAttribute("src", "https://media.test/replacement-passport.jpg");
  });

  test("drops a ready preview when the same file loses its protected storage identity", async () => {
    const submission = reviewSubmission();
    const requests = Array.from({ length: 5 }, () => deferred<string>());
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
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(3),
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
    await waitFor(() =>
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(5),
    );
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
      expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(3),
    );

    rerender(
      <ReviewWorkspace
        {...props}
        submission={{ ...submission, issues: [...submission.issues] }}
      />,
    );
    await act(async () => Promise.resolve());

    expect(mediaStorage.createMediaSignedUrl).toHaveBeenCalledTimes(3);
  });

  test("reserves the measured decision footer height for mobile scrolling", async () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      disconnect() {}
      observe() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
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
    expect(workspace).not.toBeNull();
    expect(footer).not.toBeNull();
    vi.spyOn(footer as HTMLElement, "getBoundingClientRect").mockReturnValue({
      bottom: 196,
      height: 196,
      left: 0,
      right: 390,
      toJSON: () => ({}),
      top: 0,
      width: 390,
      x: 0,
      y: 0,
    });

    act(() => resizeCallback?.([], {} as ResizeObserver));

    await waitFor(() =>
      expect(workspace).toHaveStyle("--v19-review-decision-height: 196px"),
    );
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
      name: "Подтвердить паспортную секцию",
    });
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
    expect(screen.getByText("Секция подтверждена")).toBeVisible();
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
      name: "Подтвердить паспортную секцию",
    });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    rerender(
      <ReviewWorkspace
        {...props}
        applicantId={nextSubmission.applicants[0]?.id}
        submission={nextSubmission}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Подтвердить паспортную секцию" }),
      ).toBeEnabled(),
    );

    await act(async () => {
      approval.resolve(true);
      await approval.promise;
    });

    expect(screen.queryByText("Секция подтверждена")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Подтвердить паспортную секцию" }),
    ).toBeEnabled();
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
    const acceptButton = screen.getByRole("button", { name: "Принять на выгрузку" });
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
    const acceptButton = screen.getByRole("button", { name: "Принять на выгрузку" });
    fireEvent.click(acceptButton);
    fireEvent.click(acceptButton);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(expected));
    expect(onReviewAction).toHaveBeenCalledTimes(1);
    expect(submission.status).toBe("submitted_for_review");
    expect(screen.getByRole("button", { name: "Принять на выгрузку" })).toBeEnabled();
  });
});
