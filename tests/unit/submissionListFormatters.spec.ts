import { describe, expect, it } from "vitest";
import {
  formatAgentActionRowText,
  formatSubmissionListStatus,
  formatSubmissionListTitle,
} from "../../src/modules/submissions/listFormatters";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { createDraftSubmission } from "../../src/modules/submissions/submissionActions";

function fixture(id: string) {
  const submission = initialSubmissions.find((item) => item.id === id);
  if (!submission) throw new Error(`Missing fixture ${id}`);
  return submission;
}

describe("submission list formatters", () => {
  it("keeps agent submission rows compact", () => {
    expect(formatSubmissionListTitle(fixture("ПД-1048"))).toBe("Ивановы");
    expect(formatSubmissionListTitle(fixture("ПД-1054"))).toBe("Петровы");
    expect(formatSubmissionListTitle(fixture("ПД-1053"))).toBe("Нина Волкова");
  });

  it("falls back to the stored title instead of guessing unknown family names", () => {
    expect(
      formatSubmissionListTitle({
        ...fixture("ПД-1048"),
        listTitle: undefined,
        title: "Семья Неизвестных",
      }),
    ).toBe("Семья Неизвестных");
  });

  it("uses a controlled compact title for newly created family drafts", () => {
    const draft = createDraftSubmission({
      city: "Москва",
      familyCount: 4,
      applicantNames: ["Кузнецова Анна", "Кузнецов Иван"],
      submissions: initialSubmissions,
      type: "family",
    });

    expect(draft.title).toBe("Семья Кузнецовых");
    expect(draft.listTitle).toBe("Кузнецовы");
    expect(formatSubmissionListTitle(draft)).toBe("Кузнецовы");
  });

  it("shortens submission statuses without clipped blocker copy", () => {
    expect(formatSubmissionListStatus(fixture("ПД-1048"))).toBe("Возвращено 2");
    expect(formatSubmissionListStatus(fixture("ПД-1054"))).toBe("Исправление");
    expect(formatSubmissionListStatus(fixture("ПД-1053"))).toBe("Проверка");
  });

  it("separates agent action target from the action text", () => {
    expect(
      formatAgentActionRowText({
        applicantName: "Иванов Иван",
        fieldSummary: "4 поля",
        kind: "fill_questionnaire",
      }),
    ).toEqual({
      subtitle: "Заполнить анкету · 4 поля",
      title: "Иванов Иван",
    });

    expect(
      formatAgentActionRowText({
        applicantName: "Мария Иванова",
        fileType: "selfie",
        kind: "replace_file",
      }),
    ).toEqual({
      subtitle: "Заменить селфи",
      title: "Мария Иванова",
    });
  });
});
