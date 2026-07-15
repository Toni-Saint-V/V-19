import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AdminReviewDrawer } from "../../src/components/AdminReviewDrawer";
import { AdminWorkspace } from "../../src/components/AdminWorkspace";
import { ReviewWorkspace } from "../../src/components/ReviewWorkspace";
import { VisaflowBusinessBridgeProvider } from "../../src/integration/visaflowBusinessBridge";
import { initialSubmissions } from "../../src/modules/submissions/mockData";

afterEach(cleanup);

describe("AdminReviewDrawer visual hierarchy", () => {
  test("uses truthful field labels and an accessible review dialog", () => {
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
    expect(screen.getAllByTestId("admin-review-add-remark").length).toBeGreaterThan(0);
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

    render(
      <AdminReviewDrawer
        isOpen
        submission={twoApplicantSubmission}
        submissionId={twoApplicantSubmission.id}
        onAddRemark={() => undefined}
        onClose={onClose}
        onVerifyDocument={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Анкета/ }));
    const trigger = await screen.findByRole("button", {
      name: "Выбранный заявитель: Нина Волкова",
    });
    fireEvent.click(trigger);

    expect(
      screen.getByRole("listbox", { name: "Выберите заявителя" }),
    ).toBeInTheDocument();
    const secondApplicantOption = screen.getByRole("option", {
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

    fireEvent.click(
      screen.getAllByRole("button", { name: "Сверить с паспортом" })[0]!,
    );
    expect(onVerifyDocument).toHaveBeenCalledTimes(1);
    expect(onAddRemark).not.toHaveBeenCalled();

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
    fireEvent.click(verifyButton!);
    expect(verifyButton).toHaveAttribute("aria-pressed", "true");
    expect(
      screen
        .getAllByText("Проверено")
        .find((element) => element.tagName === "P"),
    ).toHaveClass(
      "text-[var(--vf-success)]",
    );
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
    expect(screen.queryByRole("button", { name: "Завершить сверку" })).toBeNull();

    screen.getAllByRole("button", { name: /^Добавить замечание/ })[0]?.click();
    expect(onAddRemark).toHaveBeenCalledTimes(1);
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
