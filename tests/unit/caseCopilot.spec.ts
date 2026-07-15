import { describe, expect, test } from "vitest";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import {
  applyPassportExtractionField,
  failPassportExtraction,
  finishPassportExtraction,
  markPassportExtractionReviewed,
  startPassportExtraction,
} from "../../src/modules/submissions/passportExtraction";
import {
  createDraftSubmission,
  uploadRequiredFiles,
  updateQuestionnaireField,
} from "../../src/modules/submissions/submissionActions";
import { applySubmissionAction } from "../../src/modules/submissions/status";
import {
  buildCaseCopilotBrief,
  formatCaseCopilotHighlight,
} from "../../src/modules/submissions/caseCopilot";
import type { PassportExtractionResult } from "../../src/modules/submissions/passportExtractionContract";
import type { Issue, Submission } from "../../src/modules/submissions/types";
import { fillRequiredQuestionnaireForTest } from "./helpers/questionnaireTestFill";

const forbiddenTrustCopy =
  /approved|guaranteed|officially verified|approval odds|visa odds|одобрен|гарантир|официальн[а-я\s]+провер|ш[а]нс[а-я\s]+визы|вероятн[а-я\s]+одобр|решени[ея][а-я\s]+принял[а-я\s]+ии/i;

const extractedPassport: PassportExtractionResult = {
  fields: [
    {
      confidence: "high",
      key: "passportNumber",
      needsManualReview: true,
      value: "765432100",
    },
    {
      confidence: "medium",
      key: "surname",
      needsManualReview: true,
      value: "IVANOVA",
    },
  ],
  guardrails: [],
  source: "local-ocr",
  status: "extracted",
  summary: "Локальная проверка нашла 2 поля MRZ.",
};

function byId(id: string): Submission {
  const submission = initialSubmissions.find((item) => item.id === id);
  if (!submission) throw new Error(`expected submission ${id}`);
  return submission;
}

function canonicalMediaSubmission(submission: Submission): Submission {
  return {
    ...submission,
    files: submission.files.filter(
      (file) =>
        file.type === "passport_scan" ||
        file.type === "selfie" ||
        file.type === "selfie_2",
    ),
  };
}

function draftSubmission(type: Submission["type"] = "single"): Submission {
  return createDraftSubmission({
    applicantNames:
      type === "family" ? ["Мария Иванова", "Антон Иванов"] : ["Мария Иванова"],
    city: "Москва",
    familyCount: type === "family" ? 2 : 1,
    idScheme: "supabase",
    submissions: [],
    type,
  });
}

function applicantId(submission: Submission, index = 0) {
  const id = submission.applicants[index]?.id;
  if (!id) throw new Error(`expected applicant ${index}`);
  return id;
}

function passportFile(submission: Submission, applicantIndex = 0) {
  const file = submission.files.find(
    (item) =>
      item.type === "passport_scan" &&
      item.applicantId === applicantId(submission, applicantIndex),
  );
  if (!file) throw new Error("expected passport slot");
  return file;
}

function sectionIdForField(submission: Submission, fieldId: string) {
  const section = submission.applicants[0]?.sections.find((item) =>
    item.fields.some((field) => field.id === fieldId),
  );
  if (!section) throw new Error(`expected section for ${fieldId}`);
  return section.id;
}

function reviewReadySubmission(): Submission {
  return {
    ...uploadRequiredFiles(fillRequiredQuestionnaireForTest(draftSubmission())),
    status: "in_progress",
    tripDateFrom: "2026-07-10",
    tripDateTo: "2026-07-18",
  };
}

function visibleCopy(brief: ReturnType<typeof buildCaseCopilotBrief>) {
  return [
    brief.status,
    brief.owner,
    brief.title,
    brief.summary,
    brief.nextStep.label,
    ...brief.actions,
    ...brief.highlights.flatMap((item) => [
      item.kind,
      item.label,
      item.source,
      item.status,
      item.summary,
      item.detail ?? "",
    ]),
    brief.reason,
    ...brief.drafts.flatMap((item) => [item.title, item.body]),
    ...brief.guardrails,
  ].join(" ");
}

describe("local Case Copilot", () => {
  test("maps every submission lifecycle status to a safe copilot state and owner", () => {
    const submitted = applySubmissionAction(
      reviewReadySubmission(),
      "submit_for_review",
      "agent",
    );
    const cases = [
      {
        expectedOwner: "agent",
        expectedStatus: "blocked",
        submission: byId("ПД-1052"),
        surface: "agent",
      },
      {
        expectedOwner: "agent",
        expectedStatus: "blocked",
        submission: byId("ПД-1051"),
        surface: "agent",
      },
      {
        expectedOwner: "agent",
        expectedStatus: "blocked",
        submission: { ...byId("ПД-1048"), status: "requires_action" as const },
        surface: "agent",
      },
      {
        expectedOwner: "agent",
        expectedStatus: "blocked",
        submission: byId("ПД-1048"),
        surface: "agent",
      },
      {
        expectedOwner: "admin",
        expectedStatus: "waiting",
        submission: submitted,
        surface: "agent",
      },
      {
        expectedOwner: "admin",
        expectedStatus: "waiting",
      submission: byId("ПД-1055"),
        surface: "agent",
      },
      {
        expectedOwner: "admin",
        expectedStatus: "waiting",
        submission: byId("ПД-1056"),
        surface: "agent",
      },
      {
        expectedOwner: "admin",
        expectedStatus: "complete",
        submission: byId("ПД-1057"),
        surface: "export",
      },
    ] as const;

    for (const item of cases) {
      const brief = buildCaseCopilotBrief({
        role: item.surface === "export" ? "admin" : "agent",
        submission: item.submission,
        surface: item.surface,
      });

      expect(brief.status).toBe(item.expectedStatus);
      expect(brief.owner).toBe(item.expectedOwner);
      expect(visibleCopy(brief)).not.toMatch(forbiddenTrustCopy);
    }
  });

  test("prioritizes passport safe fields, conflicts, and active extraction without provider calls", () => {
    const draft = draftSubmission();
    const withSafePassport = finishPassportExtraction(
      draft,
      passportFile(draft),
      extractedPassport,
    );
    const safeBrief = buildCaseCopilotBrief({
      role: "agent",
      submission: withSafePassport,
      surface: "agent",
    });

    expect(safeBrief.status).toBe("needs_review");
    expect(safeBrief.owner).toBe("agent");
    expect(safeBrief.nextStep).toMatchObject({
      id: "apply_passport_fields",
      kind: "passport_review",
    });
    expect(safeBrief.highlights.find((item) => item.kind === "passport")).toMatchObject({
      status: "needs_review",
      summary: expect.stringContaining("сверить и применить"),
    });

    const withExistingPassport = updateQuestionnaireField(draft, {
      applicantId: applicantId(draft),
      fieldId: "passport-no",
      sectionId: sectionIdForField(draft, "passport-no"),
      value: "OLD-PASSPORT",
    });
    const withConflict = finishPassportExtraction(
      withExistingPassport,
      passportFile(draft),
      extractedPassport,
    );
    const conflictBrief = buildCaseCopilotBrief({
      role: "agent",
      submission: withConflict,
      surface: "agent",
    });

    expect(conflictBrief.status).toBe("needs_review");
    expect(conflictBrief.nextStep.id).toBe("resolve_passport_conflicts");
    expect(conflictBrief.highlights.find((item) => item.kind === "passport")).toMatchObject({
      status: "needs_review",
      summary: expect.stringContaining("конфликт"),
    });

    const extractingBrief = buildCaseCopilotBrief({
      role: "agent",
      submission: startPassportExtraction(draft, passportFile(draft)),
      surface: "agent",
    });

    expect(extractingBrief.status).toBe("waiting");
    expect(extractingBrief.owner).toBe("system");
    expect(extractingBrief.nextStep).toMatchObject({
      disabled: true,
      kind: "wait",
    });
    expect(
      extractingBrief.highlights.find((item) => item.kind === "passport"),
    ).toMatchObject({
      owner: "system",
      status: "waiting",
      summary: expect.stringContaining("выполняется"),
    });
    expect(extractingBrief.reason).toContain("OCR паспорта");
  });

  test("keeps passport evidence sources explicit across extraction states", () => {
    const draft = draftSubmission();
    const withSafePassport = finishPassportExtraction(
      draft,
      passportFile(draft),
      extractedPassport,
    );
    const withAppliedNumber = applyPassportExtractionField(
      withSafePassport,
      applicantId(withSafePassport),
      "passportNumber",
    );
    const withAllFieldsApplied = applyPassportExtractionField(
      withAppliedNumber,
      applicantId(withAppliedNumber),
      "surname",
    );
    const reviewRequired = buildCaseCopilotBrief({
      role: "agent",
      submission: withAllFieldsApplied,
      surface: "agent",
    });
    const reviewed = buildCaseCopilotBrief({
      role: "agent",
      submission: markPassportExtractionReviewed(withAllFieldsApplied, "verified"),
      surface: "agent",
    });
    const failed = buildCaseCopilotBrief({
      role: "agent",
      submission: failPassportExtraction(draft, passportFile(draft), "Не распознано"),
      surface: "agent",
    });
    const notStartedMissing = buildCaseCopilotBrief({
      role: "agent",
      submission: draft,
      surface: "agent",
    });
    const notStartedManual = buildCaseCopilotBrief({
      role: "agent",
      submission: reviewReadySubmission(),
      surface: "agent",
    });

    const reviewRequiredPassport = reviewRequired.highlights.find(
      (item) => item.kind === "passport",
    );
    const reviewedPassport = reviewed.highlights.find((item) => item.kind === "passport");
    const failedPassport = failed.highlights.find((item) => item.kind === "passport");
    const missingPassport = notStartedMissing.highlights.find(
      (item) => item.kind === "passport",
    );
    const manualPassport = notStartedManual.highlights.find(
      (item) => item.kind === "passport",
    );

    expect(reviewRequiredPassport).toMatchObject({
      source: "ocr",
      status: "needs_review",
    });
    expect(formatCaseCopilotHighlight(reviewRequiredPassport!)).toContain(
      "Источник: OCR",
    );
    expect(reviewedPassport).toMatchObject({
      source: "manual_review",
      status: "ready",
    });
    expect(formatCaseCopilotHighlight(reviewedPassport!)).toContain(
      "Источник: ручная сверка",
    );
    expect(failedPassport).toMatchObject({ source: "ocr", status: "blocked" });
    expect(missingPassport).toMatchObject({ source: "files", status: "blocked" });
    expect(manualPassport).toMatchObject({
      source: "manual_review",
      status: "ready",
    });
  });

  test("summarizes questionnaire gaps, file gaps, and returned corrections", () => {
    const issue: Issue = {
      id: "issue-passport",
      type: "field",
      target: {
        applicantId: applicantId(byId("ПД-1051")),
        applicantName: "Артём Соколов",
        section: "Анкета",
        field: "Маршрут поездки",
      },
      reason: "Маршрут требует исправления",
      comment: "Заполните маршрут и адрес отеля.",
      severity: "blocker",
      status: "open",
      createdBy: "admin",
      createdAt: "сейчас",
    };
    const brief = buildCaseCopilotBrief({
      role: "agent",
      submission: { ...byId("ПД-1051"), issues: [issue] },
      surface: "agent",
    });

    expect(brief.status).toBe("blocked");
    expect(brief.highlights.find((item) => item.kind === "questionnaire")).toMatchObject({
      status: "blocked",
      summary: expect.stringContaining("67%"),
    });
    expect(brief.highlights.find((item) => item.kind === "files")).toMatchObject({
      status: "blocked",
      summary: expect.stringContaining("33%"),
    });
    expect(brief.highlights.find((item) => item.kind === "issues")).toMatchObject({
      status: "blocked",
      summary: expect.stringContaining("1"),
    });
    expect(brief.drafts.some((draft) => draft.audience === "agent")).toBe(true);
  });

  test("explains why the next step matters and cites evidence for user trust", () => {
    const brief = buildCaseCopilotBrief({
      role: "agent",
      submission: byId("ПД-1048"),
      surface: "agent",
    });
    const blockers = brief.highlights.map(formatCaseCopilotHighlight);

    expect(brief.reason).toContain("Почему сейчас");
    expect(brief.reason).toContain("замечания");
    expect(brief.reason).toContain("главный ограничитель");
    expect(blockers.join(" ")).toContain("Источник: замечания");
  });

  test("aligns why-now copy with the actual executable next step", () => {
    const draftBrief = buildCaseCopilotBrief({
      role: "agent",
      submission: draftSubmission(),
      surface: "agent",
    });
    const inProgressBrief = buildCaseCopilotBrief({
      role: "agent",
      submission: byId("ПД-1051"),
      surface: "agent",
    });
    const correctionsBrief = buildCaseCopilotBrief({
      role: "admin",
      submission: fillRequiredQuestionnaireForTest(byId("ПД-1055")),
      surface: "review",
    });

    expect(draftBrief.nextStep.target).toMatchObject({ tab: "questionnaire" });
    expect(draftBrief.reason).toContain("анкета");
    expect(inProgressBrief.nextStep.target).toMatchObject({ tab: "questionnaire" });
    expect(inProgressBrief.reason).toContain("анкета");
    expect(correctionsBrief.nextStep.submissionAction).toBe("close_issues_accept");
    expect(correctionsBrief.reason).toContain("замечания");
  });

  test("keeps agent waiting states read-only and not executable", () => {
    const waitingStates = [
      byId("ПД-1053"),
      byId("ПД-1055"),
      byId("ПД-1056"),
    ];

    for (const submission of waitingStates) {
      const brief = buildCaseCopilotBrief({
        role: "agent",
        submission,
        surface: "agent",
      });

      expect(brief.status).toBe("waiting");
      expect(brief.owner).toBe("admin");
      expect(brief.nextStep.kind).toBe("wait");
      expect(brief.nextStep.disabled).toBe(true);
      expect(brief.nextStep.submissionAction).toBeUndefined();
      expect(brief.nextStep.target).toBeUndefined();
      expect(brief.reason).not.toContain("действие не у текущей роли");
    }
  });

  test("keeps stale passport signals read-only after agent handoff", () => {
    const submitted = applySubmissionAction(
      reviewReadySubmission(),
      "submit_for_review",
      "agent",
    );
    const stalePassport = finishPassportExtraction(
      submitted,
      passportFile(submitted),
      extractedPassport,
    );

    const brief = buildCaseCopilotBrief({
      role: "agent",
      submission: stalePassport,
      surface: "agent",
    });
    const passport = brief.highlights.find((item) => item.kind === "passport");

    expect(brief.status).toBe("waiting");
    expect(brief.owner).toBe("admin");
    expect(brief.nextStep).toMatchObject({
      disabled: true,
      kind: "wait",
    });
    expect(brief.nextStep.submissionAction).toBeUndefined();
    expect(brief.nextStep.target).toBeUndefined();
    expect(passport).toMatchObject({
      owner: "admin",
      status: "waiting",
    });
    expect(passport?.summary ?? "").not.toMatch(/примен|разберите|заполните/i);
  });

  test("gives admin review and export guard summaries without claiming decisions", () => {
    const adminReview = buildCaseCopilotBrief({
      role: "admin",
      submission: byId("ПД-1053"),
      surface: "review",
    });

    expect(adminReview.status).toBe("needs_review");
    expect(adminReview.owner).toBe("admin");
    expect(adminReview.summary).toContain("Нина Волкова");
    expect(adminReview.highlights.some((item) => item.kind === "export")).toBe(false);
    expect(adminReview.highlights.find((item) => item.kind === "files")).toMatchObject({
      status: "needs_review",
      summary: expect.stringContaining("3"),
    });
    expect(adminReview.drafts.some((draft) => draft.audience === "admin")).toBe(true);
    expect(adminReview.drafts.map((draft) => draft.body).join(" ")).not.toContain(
      "Верните",
    );

    const blockedExport = buildCaseCopilotBrief({
      role: "admin",
      submission: byId("ПД-1051"),
      surface: "export",
    });
    expect(blockedExport.status).toBe("blocked");
    expect(blockedExport.highlights.find((item) => item.kind === "export")).toMatchObject({
      status: "blocked",
      summary: expect.stringContaining("не готов"),
    });

    const readyExport = buildCaseCopilotBrief({
      role: "admin",
      submission: fillRequiredQuestionnaireForTest(
        canonicalMediaSubmission(byId("ПД-1056")),
      ),
      surface: "export",
    });
    expect(readyExport.status).toBe("ready");
    expect(readyExport.nextStep.submissionAction).toBe("generate_export");
    expect(readyExport.reason).toContain("блокеры закрыты");
    expect(readyExport.highlights.find((item) => item.kind === "passport")).toMatchObject({
      source: "manual_review",
      status: "ready",
    });
    expect(readyExport.highlights.find((item) => item.kind === "export")).toMatchObject({
      status: "ready",
      summary: expect.stringContaining("1 строк"),
    });
  });

  test("preserves family identity and applicant-level signals", () => {
    const family = draftSubmission("family");
    const withFirstPassport = finishPassportExtraction(
      family,
      passportFile(family, 0),
      extractedPassport,
    );
    const brief = buildCaseCopilotBrief({
      role: "agent",
      submission: withFirstPassport,
      surface: "agent",
    });
    const copy = visibleCopy(brief);

    expect(brief.summary).toContain("Семейная подача");
    expect(copy).toContain("Мария Иванова");
    expect(copy).toContain("Антон Иванов");
    expect(copy).toContain("2 заявителя");
  });

  test("keeps the full copilot brief free from unsafe trust copy", () => {
    const brief = buildCaseCopilotBrief({
      role: "agent",
      submission: byId("ПД-1048"),
      surface: "agent",
    });

    expect(visibleCopy(brief)).not.toMatch(forbiddenTrustCopy);
  });
});
