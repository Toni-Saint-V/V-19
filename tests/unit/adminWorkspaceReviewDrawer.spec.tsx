import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AdminReviewDrawer } from "../../src/components/AdminReviewDrawer";
import { AdminWorkspace } from "../../src/components/AdminWorkspace";
import { ReviewWorkspace } from "../../src/components/ReviewWorkspace";
import { VisaflowBusinessBridgeProvider } from "../../src/integration/visaflowBusinessBridge";
import * as mediaStorage from "../../src/modules/submissions/mediaStorage";
import { buildMediaStoragePath } from "../../src/modules/submissions/mediaStoragePolicy";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { addPreciseAdminIssue } from "../../src/modules/submissions/submissionActions";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminReviewDrawer visual hierarchy", () => {
  test("uses truthful field labels and an accessible review dialog", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");

    const { container } = render(
      <AdminReviewDrawer
        isOpen
        submission={submission}
        submissionId={submission.id}
        onAddRemark={() => undefined}
        onClose={() => undefined}
        onVerifyDocument={() => undefined}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Проверка пакета" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "admin-review-drawer-heading");
    expect(screen.getByText("ПД-1053")).toBeInTheDocument();
    expect(screen.getByText("На проверке")).toHaveClass("is-blue");
    expect(screen.getByTestId("admin-review-verify-passport")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Файлы/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(screen.getByRole("tab", { name: /Анкета/ }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Анкета/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect((await screen.findAllByTestId("admin-review-add-remark")).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("Заполнено").length).toBeGreaterThan(0);
    expect(screen.queryByTitle("Пометить как проверенное")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Не все обязательные анкеты и файлы готовы",
    );
    expect(screen.getByRole("button", { name: "Принять" })).toHaveAttribute(
      "aria-describedby",
      "admin-review-primary-action-reason",
    );
    expect(container.querySelectorAll("details")).not.toHaveLength(0);
  });

  test("uses an in-drawer applicant menu and keeps Escape scoped to the menu", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");
    const additionalApplicant = {
      ...submission.applicants[0],
      id: "applicant-review-menu-second",
      fullName: "Ирина Петрова",
    };
    const twoApplicantSubmission = {
      ...submission,
      applicants: [...submission.applicants, additionalApplicant],
    };
    const onClose = vi.fn();
    const onVerifyDocument = vi.fn();

    render(
      <AdminReviewDrawer
        isOpen
        submission={twoApplicantSubmission}
        submissionId={twoApplicantSubmission.id}
        onAddRemark={() => undefined}
        onClose={onClose}
        onVerifyDocument={onVerifyDocument}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Анкета/ }));
    const trigger = await screen.findByRole("button", {
      name: "Выбранный заявитель: Нина Волкова",
    });
    fireEvent.click(trigger);

    expect(
      await screen.findByRole("listbox", { name: "Выберите заявителя" }),
    ).toBeInTheDocument();
    const secondApplicantOption = await screen.findByRole("option", {
      name: "Ирина Петрова",
    });
    fireEvent.click(secondApplicantOption);

    await waitFor(() => {
      expect(
        screen.queryByRole("listbox", { name: "Выберите заявителя" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", {
        name: "Выбранный заявитель: Ирина Петрова",
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Сверить с паспортом" }))[0]!,
    );
    expect(onVerifyDocument).toHaveBeenLastCalledWith(
      "applicant-review-menu-second",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Выбранный заявитель: Ирина Петрова",
      }),
    );
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "Выбранный заявитель: Ирина Петрова",
      }),
      { key: "Escape" },
    );

    expect(
      screen.queryByRole("listbox", { name: "Выберите заявителя" }),
    ).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("keeps document comparison and remarks on distinct controls", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");
    const onVerifyDocument = vi.fn();
    const onAddRemark = vi.fn();

    render(
      <AdminReviewDrawer
        isOpen
        submission={submission}
        submissionId={submission.id}
        onAddRemark={onAddRemark}
        onClose={() => undefined}
        onVerifyDocument={onVerifyDocument}
      />,
    );

    fireEvent.click(screen.getByTestId("admin-review-verify-passport"));
    expect(onVerifyDocument).toHaveBeenCalledTimes(1);
    expect(onAddRemark).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: /Анкета/ }));
    await waitFor(() =>
      expect(screen.getAllByTestId("admin-review-add-remark").length).toBeGreaterThan(0),
    );
    fireEvent.click(screen.getAllByTestId("admin-review-add-remark")[0]!);
    expect(onAddRemark).toHaveBeenCalledTimes(1);
    expect(onVerifyDocument).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("tab", { name: /Файлы/ }));
    await waitFor(() => {
      expect(
        screen.getByTestId("admin-review-verify-passport"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("admin-review-verify-passport"));
    expect(onVerifyDocument).toHaveBeenCalledTimes(2);
  });

  test("opens a review section from the overview decision checklist", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");

    render(
      <AdminReviewDrawer
        isOpen
        submission={submission}
        submissionId={submission.id}
        onAddRemark={() => undefined}
        onClose={() => undefined}
        onVerifyDocument={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Обзор" }));
    const checklistAction = await screen.findByRole("button", {
      name: "Открыть раздел: Анкета",
    });
    fireEvent.click(checklistAction);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Анкета/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });

  test("does not present a blocked package as a successful empty issues state", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");

    render(
      <AdminReviewDrawer
        isOpen
        submission={submission}
        submissionId={submission.id}
        onAddRemark={() => undefined}
        onClose={() => undefined}
        onVerifyDocument={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Замечания/ }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: "Замечаний нет, но пакет ещё не готов",
        }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Замечаний нет, но пакет ещё не готов").parentElement)
      .not.toHaveClass("is-success");
  });

  test("keeps every review section as a direct tab without a mobile overflow menu", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");
    const onClose = vi.fn();

    render(
      <AdminReviewDrawer
        isOpen
        submission={submission}
        submissionId={submission.id}
        onAddRemark={() => undefined}
        onClose={onClose}
        onVerifyDocument={() => undefined}
      />,
    );

    expect(screen.queryByRole("button", { name: "Ещё" })).not.toBeInTheDocument();
    const historyTab = screen.getByRole("tab", { name: /История/ });
    expect(historyTab).toBeInTheDocument();
    fireEvent.click(historyTab);

    await waitFor(() => {
      expect(historyTab).toHaveAttribute("aria-selected", "true");
    });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("shows an explicit empty state for empty applicants, files, and history", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");
    const emptySubmission = {
      ...submission,
      applicants: [],
      files: [],
      history: [],
    };

    render(
      <AdminReviewDrawer
        isOpen
        submission={emptySubmission}
        submissionId={emptySubmission.id}
        onAddRemark={() => undefined}
        onClose={() => undefined}
        onVerifyDocument={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Заявители/ }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Заявителей пока нет" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /Файлы/ }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Файлов пока нет" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /История/ }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "История пока пуста" }),
      ).toBeInTheDocument();
    });
  });
});

describe("ReviewWorkspace safety boundary", () => {
  test("lists only fields that can be verified against a passport", () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");

    render(
      <ReviewWorkspace
        onAddRemark={() => undefined}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    expect(screen.getByText("Номер паспорта")).toBeInTheDocument();
    expect(screen.queryByText("Дата выдачи")).not.toBeInTheDocument();
    expect(screen.queryByText("Не заполнено")).not.toBeInTheDocument();
    expect(
      screen.getAllByText("Не подтверждено документом")[0],
    ).toHaveClass("text-[var(--vf-warning)]");
    expect(screen.queryByText("Город подачи")).not.toBeInTheDocument();
    expect(screen.queryByText("Тип визы")).not.toBeInTheDocument();
    expect(screen.queryByText("Категория обслуживания")).not.toBeInTheDocument();
    expect(screen.queryByText("Желаемая дата 1")).not.toBeInTheDocument();

    const verifyButton = screen.getAllByRole("button", {
      name: /^Подтвердить:/,
    })[0];
    expect(verifyButton).toBeDisabled();
    fireEvent.click(verifyButton!);
    expect(verifyButton).toHaveAttribute("aria-pressed", "false");
    expect(
      screen
        .getAllByText("Не подтверждено документом")
        .find((element) => element.tagName === "P"),
    ).toHaveClass(
      "text-[var(--vf-warning)]",
    );
    expect(
      screen.getByRole("button", { name: "Завершить сверку паспорта" }),
    ).toBeDisabled();
  });

  test("blocks completion when protected original and OCR evidence are unavailable", () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");
    const onAddRemark = vi.fn();

    render(
      <ReviewWorkspace
        onAddRemark={onAddRemark}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    expect(screen.getByText("Предпросмотр оригинала недоступен")).toBeInTheDocument();
    expect(screen.queryByText("PETROV")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Завершить сверку паспорта" }),
    ).toBeDisabled();

    screen.getAllByRole("button", { name: /^Добавить замечание/ })[0]?.click();
    expect(onAddRemark).toHaveBeenCalledTimes(1);
  });

  test("persists passport acceptance only after a protected original and all field confirmations", async () => {
    const source = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!source) throw new Error("Expected admin review fixture.");
    const applicant = source.applicants[0];
    if (!applicant) throw new Error("Expected applicant.");
    const generatedFileName = `demo${applicant.id.replace(/\D/g, "")}_passport_scan.jpg`;
    const passportTarget = buildMediaStoragePath(
      source.id,
      applicant.id,
      "passport_scan",
      generatedFileName,
    );
    const submission = {
      ...source,
      files: source.files.map((file) =>
        file.type === "passport_scan"
          ? {
              ...file,
              generatedFileName,
              storageAdapter: "supabase-private" as const,
              storageBucket: passportTarget.bucket,
              storagePath: passportTarget.path,
              uploadStatus: "uploaded" as const,
            }
          : file,
      ),
    };
    const onAcceptFile = vi.fn().mockResolvedValue(true);
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://example.test/signed-passport.png",
    );

    render(
      <ReviewWorkspace
        applicantId={applicant.id}
        onAcceptFile={onAcceptFile}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Оригинал паспорта" })).toBeInTheDocument(),
    );
    const confirmButtons = screen.getAllByRole("button", { name: /^Подтвердить:/ });
    expect(confirmButtons.length).toBeGreaterThan(0);
    for (const button of confirmButtons) fireEvent.click(button);

    const completeButton = screen.getByRole("button", {
      name: "Завершить сверку паспорта",
    });
    await waitFor(() => expect(completeButton).toBeEnabled());
    fireEvent.click(completeButton);

    await waitFor(() =>
      expect(onAcceptFile).toHaveBeenCalledWith({
        applicantId: applicant.id,
        fileType: "passport_scan",
      }),
    );
  });

  test("does not sign or accept a passport path that belongs to another applicant", () => {
    const source = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!source) throw new Error("Expected admin review fixture.");
    const applicant = source.applicants[0];
    if (!applicant) throw new Error("Expected applicant.");
    const foreignTarget = buildMediaStoragePath(
      source.id,
      "з-1053-чужой",
      "passport_scan",
      "demo1053foreign_passport_scan.jpg",
    );
    const submission = {
      ...source,
      files: source.files.map((file) =>
        file.type === "passport_scan"
          ? {
              ...file,
              generatedFileName: "demo1053foreign_passport_scan.jpg",
              storageAdapter: "supabase-private" as const,
              storageBucket: foreignTarget.bucket,
              storagePath: foreignTarget.path,
              uploadStatus: "uploaded" as const,
            }
          : file,
      ),
    };
    const onAcceptFile = vi.fn();
    const createSignedUrl = vi
      .spyOn(mediaStorage, "createMediaSignedUrl")
      .mockResolvedValue("https://example.test/foreign-passport.png");

    render(
      <ReviewWorkspace
        applicantId={applicant.id}
        onAcceptFile={onAcceptFile}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    expect(screen.getByText("Предпросмотр оригинала недоступен")).toBeInTheDocument();
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(onAcceptFile).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Завершить сверку паспорта" }),
    ).toBeDisabled();
  });

  test("persists only the selected member passport in a family", async () => {
    const source = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!source) throw new Error("Expected admin review fixture.");
    const firstApplicant = source.applicants[0];
    const sourcePassport = source.files.find((file) => file.type === "passport_scan");
    if (!firstApplicant || !sourcePassport) {
      throw new Error("Expected family review fixture.");
    }
    const secondApplicant = {
      ...firstApplicant,
      id: "з-1053-2",
    };
    const secondPassportTarget = buildMediaStoragePath(
      source.id,
      secondApplicant.id,
      "passport_scan",
      "demo10532_passport_scan.jpg",
    );
    const secondPassport = {
      ...sourcePassport,
      applicantId: secondApplicant.id,
      generatedFileName: "demo10532_passport_scan.jpg",
      id: "ф-1053-4-second",
      status: "pending_review" as const,
      storageAdapter: "supabase-private" as const,
      storageBucket: secondPassportTarget.bucket,
      storagePath: secondPassportTarget.path,
      uploadStatus: "uploaded" as const,
    };
    const submission = {
      ...source,
      applicants: [firstApplicant, secondApplicant],
      files: [...source.files, secondPassport],
    };
    const onAcceptFile = vi.fn().mockResolvedValue(true);
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://example.test/second-passport.png",
    );

    render(
      <ReviewWorkspace
        applicantId={secondApplicant.id}
        onAcceptFile={onAcceptFile}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Оригинал паспорта" })).toBeInTheDocument(),
    );
    for (const button of screen.getAllByRole("button", { name: /^Подтвердить:/ })) {
      fireEvent.click(button);
    }
    const completeButton = screen.getByRole("button", {
      name: "Завершить сверку паспорта",
    });
    await waitFor(() => expect(completeButton).toBeEnabled());
    fireEvent.click(completeButton);

    await waitFor(() =>
      expect(onAcceptFile).toHaveBeenCalledWith({
        applicantId: secondApplicant.id,
        fileType: "passport_scan",
      }),
    );
    expect(onAcceptFile).not.toHaveBeenCalledWith({
      applicantId: firstApplicant.id,
      fileType: "passport_scan",
    });
  });
});

describe("AdminReviewDrawer document comparison", () => {
  test("keeps document comparison separate from remarks and restores the original queue focus", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");
    const onVerifyDocument = vi.fn();

    const { container } = render(
      <VisaflowBusinessBridgeProvider bridge={{ onVerifyDocument }}>
        <AdminWorkspace
          currentEmail="qa-admin@example.test"
          onSignOut={() => undefined}
          submissions={[submission]}
          usesSupabase
        />
      </VisaflowBusinessBridgeProvider>,
    );

    const opener = container.querySelector<HTMLButtonElement>(
      '[data-submission-id="ПД-1053"]',
    );
    if (!opener) throw new Error("Review queue opener was not rendered.");
    opener.focus();
    fireEvent.click(opener);

    fireEvent.click(await screen.findByRole("tab", { name: /Анкета/ }));
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Сверить с паспортом" }))[0]!,
    );

    expect(onVerifyDocument).toHaveBeenCalledWith(submission.id);
    expect(
      screen.getByRole("heading", { name: "Сверка паспорта" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Добавить замечание" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Вернуться к подаче" }));
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(opener).toHaveFocus());
  });
});

describe("Admin document-review target safety", () => {
  test("does not redirect a family remark to the first applicant when its ID is invalid", () => {
    const source = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!source) throw new Error("Expected admin review fixture.");
    const firstApplicant = source.applicants[0];
    if (!firstApplicant) throw new Error("Expected applicant.");
    const family = {
      ...source,
      applicants: [
        firstApplicant,
        { ...firstApplicant, id: "з-1053-2" },
      ],
    };

    expect(
      addPreciseAdminIssue(family, {
        applicantId: firstApplicant.id,
        comment: "Контрольная запись для проверки допустимого адресата.",
        field: "Номер паспорта",
        reason: "Требуется исправление поля.",
        severity: "blocker",
        type: "field",
      }),
    ).not.toBe(family);

    const unchanged = addPreciseAdminIssue(family, {
      applicantId: "missing-applicant",
      comment: "Точный комментарий для проверки fail-closed поведения.",
      field: "Номер паспорта",
      reason: "Требуется исправление поля.",
      severity: "blocker",
      type: "field",
    });

    expect(unchanged).toBe(family);
  });
});
