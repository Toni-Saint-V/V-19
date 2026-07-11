import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { buildSubmissionAiHelperSurface } from "../../src/modules/submissions/aiHelperSurface";
import { AiHelperSurfacePanel } from "../../src/modules/submissions/components/AiHelperSurfacePanel";
import type { Submission } from "../../src/modules/submissions/types";

const forbiddenTrustCopy =
  /approved|guaranteed|officially verified|approval odds|visa odds|одобрен|гарантир|официально провер|ш[а]нс[а-я\s]+визы/i;

afterEach(() => {
  cleanup();
});

function submission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "ПД-AI",
    title: "AI helper surface",
    type: "single",
    country: "Испания",
    city: "Москва",
    tripDateFrom: "22.07",
    tripDateTo: "31.07",
    status: "submitted_for_review",
    applicants: [
      {
        id: "з-ai-1",
        fullName: "Мария Иванова",
        role: "main",
        questionnaireStatus: "partial",
        fileStatus: "needs_fix",
        sections: [
          {
            id: "contacts",
            title: "Адрес и контакты",
            status: "partial",
            fields: [
              {
                id: "email",
                label: "Email",
                value: "bad-email",
                required: true,
              },
              {
                id: "passport-no",
                label: "Номер паспорта",
                value: "778194570",
                required: true,
              },
            ],
          },
        ],
      },
    ],
    issues: [
      {
        id: "зм-ai-1",
        type: "field",
        target: {
          applicantId: "з-ai-1",
          applicantName: "Мария Иванова",
          section: "Анкета",
          field: "Email",
        },
        reason: "Email требует проверки",
        comment: "Введите корректный email.",
        severity: "blocker",
        status: "open",
        createdBy: "admin",
        createdAt: "сейчас",
      },
    ],
    files: [
      { id: "ф-ai-1", applicantId: "з-ai-1", type: "passport_scan", status: "accepted" },
      { id: "ф-ai-2", applicantId: "з-ai-1", type: "selfie", status: "missing" },
      { id: "ф-ai-3", applicantId: "з-ai-1", type: "selfie_2", status: "missing" },
    ],
    completeness: { questionnaire: 50, files: 33, total: 42 },
    exportState: "not_ready",
    createdAt: "12.06",
    updatedAt: "15.06",
    history: [],
    ...overrides,
  };
}

function acceptedCanonicalFiles(): Submission["files"] {
  return [
    {
      id: "ф-ai-1",
      applicantId: "з-ai-1",
      type: "passport_scan",
      status: "accepted",
    },
    { id: "ф-ai-2", applicantId: "з-ai-1", type: "selfie", status: "accepted" },
    { id: "ф-ai-3", applicantId: "з-ai-1", type: "selfie_2", status: "accepted" },
  ];
}

function completedApplicants() {
  return submission().applicants.map((applicant) => ({
    ...applicant,
    fileStatus: "complete" as const,
    questionnaireStatus: "complete" as const,
    sections: applicant.sections.map((section) => ({
      ...section,
      missing: undefined,
      status: "complete" as const,
      fields: section.fields.map((field) => ({
        ...field,
        error: undefined,
        value: field.id === "email" ? "ready@example.com" : field.value || "ok",
      })),
    })),
  }));
}

describe("AI helper surface panel", () => {
  test("renders a local readiness helper for agents without unsafe trust copy", () => {
    render(
      <AiHelperSurfacePanel
        role="agent"
        submission={submission({ status: "returned" })}
        surface="agent"
      />,
    );

    expect(screen.getByLabelText("Локальная подсказка агента")).toBeVisible();
    expect(screen.getByText("Помощник по подаче")).toBeVisible();
    expect(screen.getByText("Есть блокер")).toBeVisible();
    expect(screen.getByText("Почему сейчас")).toBeVisible();
    expect(screen.getByText("Сигналы")).toBeVisible();
    expect(screen.getByText("Черновик")).toBeVisible();
    expect(screen.getByText("Границы подсказки")).toBeVisible();
    expect(
      screen.getByText("Детерминированные проверки остаются источником истины."),
    ).toBeVisible();
    expect(
      screen.getByLabelText("Локальная подсказка агента").textContent ?? "",
    ).not.toMatch(forbiddenTrustCopy);
  });

  test("renders the admin review helper for review surface", () => {
    render(
      <AiHelperSurfacePanel role="admin" submission={submission()} surface="review" />,
    );

    expect(screen.getByLabelText("Фокус проверки администратора")).toBeVisible();
    expect(
      screen.getByText(/Фокус проверки|Нужна ручная проверка блокеров/),
    ).toBeVisible();
    expect(screen.getByText("Нужна проверка")).toBeVisible();
    expect(screen.getByText("Следующие действия")).toBeVisible();
  });

  test("does not show agent handoff copy for admin-owned lifecycle states", () => {
    render(
      <AiHelperSurfacePanel
        role="agent"
        submission={submission({
          completeness: { questionnaire: 100, files: 100, total: 100 },
          applicants: completedApplicants(),
          files: acceptedCanonicalFiles(),
          issues: [],
          status: "submitted_for_review",
        })}
        surface="agent"
      />,
    );

    const helper = screen.getByLabelText("Локальная подсказка агента");
    expect(screen.getByText("Пакет на ручной проверке")).toBeVisible();
    expect(screen.getByText("Ожидание")).toBeVisible();
    expect(helper.textContent ?? "").toContain("Дождитесь ручной проверки");
    expect(helper.textContent ?? "").toContain(
      "агенту не нужно выполнять редактируемое действие",
    );
    expect(helper.textContent ?? "").not.toContain("передайте заявку оператору");
  });

  test("keeps open non-blocker issues out of ready copy", () => {
    render(
      <AiHelperSurfacePanel
        role="agent"
        submission={submission({
          applicants: completedApplicants(),
          completeness: { questionnaire: 100, files: 100, total: 100 },
          files: acceptedCanonicalFiles(),
          issues: [
            {
              id: "зм-ai-warning",
              type: "field",
              target: {
                applicantId: "з-ai-1",
                applicantName: "Мария Иванова",
                section: "Анкета",
                field: "Email",
              },
              reason: "Email требует подтверждения",
              comment: "Проверьте адрес перед отправкой.",
              severity: "warning",
              status: "open",
              createdBy: "admin",
              createdAt: "сейчас",
            },
          ],
          status: "in_progress",
        })}
        surface="agent"
      />,
    );

    const helper = screen.getByLabelText("Локальная подсказка агента");
    expect(screen.getByText("Нужно закрыть замечания")).toBeVisible();
    expect(helper.textContent ?? "").toContain("замечаний ожидают закрытия");
    expect(helper.textContent ?? "").not.toContain(
      "отправьте заявку на ручную проверку",
    );
  });

  test("does not suggest review handoff from a clean draft", () => {
    render(
      <AiHelperSurfacePanel
        role="agent"
        submission={submission({
          applicants: completedApplicants(),
          completeness: { questionnaire: 100, files: 100, total: 100 },
          files: acceptedCanonicalFiles(),
          issues: [],
          status: "draft",
        })}
        surface="agent"
      />,
    );

    const helper = screen.getByLabelText("Локальная подсказка агента");
    expect(helper.textContent ?? "").toContain("Сохраните черновик");
    expect(helper.textContent ?? "").not.toContain(
      "отправьте заявку на ручную проверку",
    );
  });

  test("does not suggest admin acceptance while readiness blockers remain", () => {
    render(
      <AiHelperSurfacePanel
        role="admin"
        submission={submission({
          completeness: { questionnaire: 80, files: 100, total: 90 },
          files: acceptedCanonicalFiles(),
          issues: [],
          status: "submitted_for_review",
        })}
        surface="review"
      />,
    );

    const helper = screen.getByLabelText("Фокус проверки администратора");
    expect(helper.textContent ?? "").toContain("Анкета заполнена на 80%");
    expect(helper.textContent ?? "").toContain("Сначала закройте пункты готовности");
    expect(helper.textContent ?? "").not.toContain("можно принять заявку");
  });

  test("renders export helper with admin export label and terminal copy", () => {
    render(
      <AiHelperSurfacePanel
        role="admin"
        submission={submission({
          completeness: { questionnaire: 100, files: 100, total: 100 },
          files: acceptedCanonicalFiles(),
          issues: [],
          status: "exported",
        })}
        surface="export"
      />,
    );

    expect(screen.getByLabelText("Фокус выгрузки администратора")).toBeVisible();
    expect(screen.getByText("Пакет уже выгружен")).toBeVisible();
    expect(screen.queryByLabelText("Локальная подсказка агента")).toBeNull();
  });

  test("emits structured primary action clicks for future drawer routing", () => {
    const onPrimaryAction = vi.fn();
    render(
      <AiHelperSurfacePanel
        role="agent"
        submission={submission({
          applicants: completedApplicants(),
          completeness: { questionnaire: 100, files: 100, total: 100 },
          files: acceptedCanonicalFiles(),
          issues: [],
          status: "in_progress",
        })}
        surface="agent"
        onPrimaryAction={onPrimaryAction}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Выполнить следующий шаг: Отправить",
      }),
    );

    expect(onPrimaryAction).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "submission_action",
        submissionAction: "submit_for_review",
      }),
    );
  });

  test("does not emit disabled primary actions", () => {
    const onPrimaryAction = vi.fn();
    render(
      <AiHelperSurfacePanel
        role="admin"
        submission={submission({
          applicants: completedApplicants(),
          completeness: { questionnaire: 100, files: 100, total: 100 },
          files: acceptedCanonicalFiles(),
          issues: [],
          status: "submitted_for_review",
        })}
        surface="export"
        onPrimaryAction={onPrimaryAction}
      />,
    );

    const button = screen.getByRole("button", {
      name: /Следующий шаг недоступен:/,
    });
    expect(button).toBeDisabled();
    fireEvent.click(button);

    expect(onPrimaryAction).not.toHaveBeenCalled();
  });

  test("exposes a structured local helper contract for downstream drawer wiring", () => {
    const helper = buildSubmissionAiHelperSurface({
      role: "agent",
      submission: submission({ status: "returned" }),
      surface: "agent",
    });

    expect(helper).toMatchObject({
      modelVersion: "local-case-helper-v1",
      owner: "agent",
      status: "blocked",
    });
    expect(helper.nextStep).toContain("Открыть место исправления");
    expect(helper.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "questionnaire",
          source: "questionnaire",
        }),
        expect.objectContaining({
          kind: "files",
          source: "files",
        }),
        expect.objectContaining({
          kind: "issues",
          source: "issues",
        }),
      ]),
    );
    expect(helper.drafts[0]).toMatchObject({
      audience: "agent",
      title: "Ответ агенту",
    });
    expect(helper.sections.map((section) => section.id)).toEqual(
      expect.arrayContaining(["why_now", "highlights", "drafts", "guardrails"]),
    );
  });

  test("keeps family identity in local helper signals", () => {
    const helper = buildSubmissionAiHelperSurface({
      role: "agent",
      submission: submission({
        applicants: [
          ...submission().applicants,
          {
            ...submission().applicants[0],
            fullName: "Иван Иванов",
            id: "з-ai-2",
            role: "spouse",
          },
        ],
        status: "in_progress",
        type: "family",
      }),
      surface: "agent",
    });

    expect(helper.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: expect.stringContaining("2 заявителя"),
          kind: "family",
          source: "status",
        }),
      ]),
    );
  });

  test("sanitizes unsafe issue copy instead of crashing the helper", () => {
    const helper = buildSubmissionAiHelperSurface({
      role: "admin",
      submission: submission({
        issues: [
          {
            ...submission().issues[0],
            comment: "Гарантирую одобрение после замены файла.",
          },
        ],
        status: "submitted_for_review",
      }),
      surface: "review",
    });
    const visibleCopy = [
      helper.title,
      helper.summary,
      helper.nextStep,
      ...helper.sections.flatMap((section) => section.items),
      ...helper.drafts.map((draft) => draft.body),
    ].join(" ");

    expect(visibleCopy).not.toMatch(forbiddenTrustCopy);
    expect(visibleCopy).toContain("ручной проверки");
  });
});
