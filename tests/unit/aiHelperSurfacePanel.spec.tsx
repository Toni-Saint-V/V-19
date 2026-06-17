import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { AiHelperSurfacePanel } from "../../src/modules/submissions/components/AiHelperSurfacePanel";
import type { Submission } from "../../src/modules/submissions/types";

const forbiddenTrustCopy =
  /approved|guaranteed|officially verified|approval odds|visa odds|одобрен|гарантир|официально провер|шанс[а-я\s]+визы/i;

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
      { id: "ф-ai-1", applicantId: "з-ai-1", type: "photo", status: "accepted" },
      { id: "ф-ai-2", applicantId: "з-ai-1", type: "selfie", status: "missing" },
      { id: "ф-ai-3", applicantId: "з-ai-1", type: "video", status: "missing" },
    ],
    completeness: { questionnaire: 50, files: 33, total: 42 },
    exportState: "not_ready",
    createdAt: "12.06",
    updatedAt: "15.06",
    history: [],
    ...overrides,
  };
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
    expect(screen.getByText("Локальная проверка")).toBeVisible();
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
    expect(screen.getByText("Следующие действия")).toBeVisible();
  });

  test("does not show agent handoff copy for admin-owned lifecycle states", () => {
    render(
      <AiHelperSurfacePanel
        role="agent"
        submission={submission({
          completeness: { questionnaire: 100, files: 100, total: 100 },
          files: [
            { id: "ф-ai-1", applicantId: "з-ai-1", type: "photo", status: "accepted" },
            { id: "ф-ai-2", applicantId: "з-ai-1", type: "selfie", status: "accepted" },
            { id: "ф-ai-3", applicantId: "з-ai-1", type: "video", status: "accepted" },
          ],
          issues: [],
          status: "submitted_for_review",
        })}
        surface="agent"
      />,
    );

    const helper = screen.getByLabelText("Локальная подсказка агента");
    expect(screen.getByText("Пакет на ручной проверке")).toBeVisible();
    expect(helper.textContent ?? "").toContain("Дождитесь ручной проверки");
    expect(helper.textContent ?? "").not.toContain("передайте заявку оператору");
  });

  test("keeps open non-blocker issues out of ready copy", () => {
    render(
      <AiHelperSurfacePanel
        role="agent"
        submission={submission({
          completeness: { questionnaire: 100, files: 100, total: 100 },
          files: [
            { id: "ф-ai-1", applicantId: "з-ai-1", type: "photo", status: "accepted" },
            { id: "ф-ai-2", applicantId: "з-ai-1", type: "selfie", status: "accepted" },
            { id: "ф-ai-3", applicantId: "з-ai-1", type: "video", status: "accepted" },
          ],
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
          completeness: { questionnaire: 100, files: 100, total: 100 },
          files: [
            { id: "ф-ai-1", applicantId: "з-ai-1", type: "photo", status: "accepted" },
            { id: "ф-ai-2", applicantId: "з-ai-1", type: "selfie", status: "accepted" },
            { id: "ф-ai-3", applicantId: "з-ai-1", type: "video", status: "accepted" },
          ],
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
          files: [
            { id: "ф-ai-1", applicantId: "з-ai-1", type: "photo", status: "accepted" },
            { id: "ф-ai-2", applicantId: "з-ai-1", type: "selfie", status: "accepted" },
            { id: "ф-ai-3", applicantId: "з-ai-1", type: "video", status: "accepted" },
          ],
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
          files: [
            { id: "ф-ai-1", applicantId: "з-ai-1", type: "photo", status: "accepted" },
            { id: "ф-ai-2", applicantId: "з-ai-1", type: "selfie", status: "accepted" },
            { id: "ф-ai-3", applicantId: "з-ai-1", type: "video", status: "accepted" },
          ],
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
});
