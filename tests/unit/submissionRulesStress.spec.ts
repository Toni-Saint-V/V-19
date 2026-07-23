import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parseAiHelperResult } from "../../supabase/functions/_shared/ai-helper-contract";
import { buildSafeAiHelperStubResult } from "../../supabase/functions/_shared/ai-helper-contract";
import {
  canonicalRequiredMediaReadiness,
  isForbiddenStatusTransition,
  isStatusTransitionAllowed,
  normalizeLegacySubmissionStatus,
} from "../../src/modules/submissions/domainContract";
import {
  acceptSubmission,
  markExported,
} from "../../src/modules/submissions/domainEngine";
import {
  buildExportPackageIdentity,
  exportSummary,
  getExportBlockers,
  getExportWarnings,
} from "../../src/modules/submissions/exportRules";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import {
  alternateLocalAgentOwnerId,
  defaultLocalAgentOwnerId,
} from "../../src/modules/submissions/ownership";
import { canPerformAction } from "../../src/modules/submissions/status";
import type {
  Applicant,
  Issue,
  Submission,
  SubmissionFile,
} from "../../src/modules/submissions/types";
import {
  adminAcceptRequiredMediaForTest,
  fillRequiredQuestionnaireForTest,
  withCanonicalPrivateMediaIdentityForTest,
} from "./helpers/questionnaireTestFill";

const canonicalMediaTypes = ["passport_scan", "selfie", "selfie_2"] as const;

function byId(id: string): Submission {
  const submission = initialSubmissions.find((item) => item.id === id);
  if (!submission) throw new Error(`Missing fixture ${id}`);
  return submission;
}

function canonicalMediaSubmission(submission: Submission): Submission {
  return {
    ...submission,
    files: submission.files
      .filter((file) =>
        canonicalMediaTypes.includes(file.type as (typeof canonicalMediaTypes)[number]),
      )
      .map((file) => ({ ...file, status: "accepted" as const })),
    completeness: { ...submission.completeness, files: 100, total: 100 },
  };
}

function readyClone(patch: Partial<Submission> = {}): Submission {
  return withCanonicalPrivateMediaIdentityForTest({
    ...fillRequiredQuestionnaireForTest(
      canonicalMediaSubmission(byId("ПД-1056")),
    ),
    agentId: defaultLocalAgentOwnerId,
    exportState: "ready",
    id: patch.id ?? "ПД-STRESS",
    issues: [],
    status: "ready_for_export",
    title: patch.title ?? "Stress submission",
    ...patch,
  });
}

function issue({
  severity,
  status,
  ...patch
}: Partial<Issue> & Pick<Issue, "severity" | "status">): Issue {
  return {
    comment: "Операционная проверка без персональных данных.",
    createdAt: "2026-07-03T12:00:00.000Z",
    createdBy: "admin",
    id: `issue-${severity}-${status}`,
    reason: "Проверьте недостающие данные.",
    severity,
    status,
    target: {
      applicantId: "з-1056-1",
      applicantName: "REDACTED",
      section: "Анкета",
    },
    type: "field",
    ...patch,
  };
}

function submittedForAcceptance(patch: Partial<Submission> = {}): Submission {
  return adminAcceptRequiredMediaForTest(withCanonicalPrivateMediaIdentityForTest({
    ...canonicalMediaSubmission(byId("ПД-1053")),
    completeness: { files: 100, questionnaire: 100, total: 100 },
    files: canonicalMediaSubmission(byId("ПД-1053")).files.map((file) => ({
      ...file,
      status: "accepted" as const,
    })),
    issues: [],
    status: "submitted_for_review",
    tripDateFrom: "2026-08-11",
    tripDateTo: "2026-08-20",
    ...patch,
  }));
}

function familyWithApplicants(total: number): Submission {
  const base = readyClone({ id: "ПД-FAMILY-20", type: "family" });
  const applicantTemplate = base.applicants[0];
  if (!applicantTemplate) throw new Error("Missing applicant template");

  const applicants: Applicant[] = Array.from({ length: total }, (_, index) => ({
    ...applicantTemplate,
    fileStatus: "complete",
    fullName: `APPLICANT ${index + 1}`,
    id: `family-applicant-${index + 1}`,
    questionnaireStatus: "complete",
    role: index === 0 ? "main" : "child",
  }));
  const files: SubmissionFile[] = applicants.flatMap((applicant) =>
    (applicant.role === "main"
      ? canonicalMediaTypes
      : (["passport_scan"] as const)
    ).map((type) => ({
      applicantId: applicant.id,
      generatedFileName: `${applicant.id}-${type}.jpg`,
      id: `${applicant.id}-${type}`,
      mimeType: "image/jpeg",
      originalFileName: `${type}.jpg`,
      status: "accepted" as const,
      storageBucket: "submission-media",
      storagePath: `${base.id}/${applicant.id}/${type}/v19_${type}.jpg`,
      type,
      uploadStatus: "uploaded" as const,
    })),
  );

  return withCanonicalPrivateMediaIdentityForTest({
    ...base,
    applicants,
    files,
  });
}

function catalogRuleIds(): string[] {
  const catalog = readFileSync(
    join(process.cwd(), "docs/specs/visaflow-v19-rules-catalog.md"),
    "utf8",
  );
  return Array.from(catalog.matchAll(/^#### ([A-Z0-9_]+)/gm), (match) => match[1]);
}

describe("submission deterministic rules adversarial stress gate", () => {
  test("empty selections and no-applicant submissions fail closed without PII in messages", () => {
    const noApplicants = readyClone({
      applicants: [],
      files: [],
      id: "ПД-NO-APPLICANTS",
    });

    expect(getExportBlockers([])).toEqual([{ reason: "Выберите хотя бы одну подачу" }]);
    expect(exportSummary([noApplicants])).toMatchObject({
      canGenerate: false,
      ready: false,
      rowCount: 0,
    });
    expect(exportSummary([noApplicants]).blockers.map((item) => item.reason)).toContain(
      "В выборке есть подачи без заявителей",
    );
    expect(JSON.stringify(exportSummary([noApplicants]).blockers)).not.toContain(
      "APPLICANT",
    );
  });

  test("family media requires selfies only for primary and passports for everyone", () => {
    const ready = readyClone({ id: "ПД-READY-SINGLE" });
    const family = familyWithApplicants(20);
    const secondaryWithoutSelfie = {
      ...family,
      files: family.files.filter(
        (file) =>
          !(file.applicantId === "family-applicant-17" && file.type === "selfie_2"),
      ),
    };
    const primaryWithoutSelfie = {
      ...family,
      files: family.files.filter(
        (file) =>
          !(file.applicantId === "family-applicant-1" && file.type === "selfie_2"),
      ),
    };
    const secondaryWithoutPassport = {
      ...family,
      files: family.files.filter(
        (file) =>
          !(
            file.applicantId === "family-applicant-17" &&
            file.type === "passport_scan"
          ),
      ),
    };

    expect(exportSummary([ready])).toMatchObject({
      canGenerate: true,
      ready: true,
      rowCount: 1,
    });
    expect(canonicalRequiredMediaReadiness(family, { requireAccepted: true })).toEqual({
      data: true,
      ok: true,
    });
    expect(
      canonicalRequiredMediaReadiness(secondaryWithoutSelfie, {
        requireAccepted: true,
      }),
    ).toEqual({ data: true, ok: true });
    expect(
      canonicalRequiredMediaReadiness(primaryWithoutSelfie, {
        requireAccepted: true,
      }),
    ).toEqual({
      ok: false,
      reason: "Missing selfie_2.",
    });
    expect(
      canonicalRequiredMediaReadiness(secondaryWithoutPassport, {
        requireAccepted: true,
      }),
    ).toEqual({ ok: false, reason: "Missing passport_scan." });
    expect(
      exportSummary([secondaryWithoutPassport]).blockers.map((item) => item.reason),
    ).toContain("В выборке есть подачи без полного канонического пакета медиа");
  });

  test("mixed city blocks export, while same-city mixed-agent export is warning-only", () => {
    const mixedCity = [
      readyClone({ id: "ПД-MOSCOW", city: "Москва" }),
      readyClone({ id: "ПД-KAZAN", city: "Казань" }),
    ];
    const sameCityMixedAgent = [
      readyClone({ agentId: defaultLocalAgentOwnerId, id: "ПД-AGENT-1" }),
      readyClone({ agentId: alternateLocalAgentOwnerId, id: "ПД-AGENT-2" }),
    ];

    expect(getExportBlockers(mixedCity).map((item) => item.reason)).toContain(
      "Нельзя смешивать разные города",
    );
    expect(exportSummary(mixedCity)).toMatchObject({
      canGenerate: false,
      ready: false,
    });
    expect(exportSummary(sameCityMixedAgent)).toMatchObject({
      canGenerate: true,
      ready: true,
    });
    expect(getExportWarnings(sameCityMixedAgent)).toEqual([
      {
        reason:
          "В пакете подачи разных агентов. Excel доступен, PDF останется у своих агентов.",
      },
    ]);
  });

  test("any unresolved issue blocks accept and export", () => {
    const warningOnly = submittedForAcceptance({
      issues: [issue({ severity: "warning", status: "open" })],
    });
    const openBlocker = submittedForAcceptance({
      issues: [issue({ severity: "blocker", status: "open" })],
    });
    const fixedBlocker = submittedForAcceptance({
      issues: [issue({ severity: "blocker", status: "fixed_by_agent" })],
    });

    expect(canPerformAction(warningOnly, "accept", "admin")).toEqual({
      ok: false,
      reason: "Есть незакрытые замечания",
    });
    expect(acceptSubmission(warningOnly, "admin")).toMatchObject({
      error: {
        code: "ACCEPTANCE_BLOCKED",
      },
      ok: false,
    });
    expect(
      exportSummary([
        readyClone({ issues: [issue({ severity: "warning", status: "open" })] }),
      ]),
    ).toMatchObject({
      canGenerate: false,
      ready: false,
    });

    for (const blocked of [openBlocker, fixedBlocker]) {
      expect(canPerformAction(blocked, "accept", "admin")).toEqual({
        ok: false,
        reason: "Есть незакрытые замечания",
      });
      expect(acceptSubmission(blocked, "admin")).toMatchObject({
        error: {
          code: "ACCEPTANCE_BLOCKED",
        },
        ok: false,
      });
    }
    expect(
      exportSummary([
        readyClone({
          issues: [issue({ severity: "blocker", status: "fixed_by_agent" })],
        }),
      ]).blockers.map((item) => item.reason),
    ).toContain("В выборке есть блокирующие замечания, не закрытые администратором");
  });

  test("returned, already exported, duplicate, and stale export states stay blocked", () => {
    const returned = readyClone({ id: "ПД-RETURNED", status: "returned" });
    const alreadyExported = readyClone({
      exportState: "marked_exported",
      id: "ПД-EXPORTED",
      status: "exported",
    });
    const ready = readyClone({ id: "ПД-DOWNLOADED" });
    const identity = buildExportPackageIdentity([ready], "xlsx");
    if (!identity) throw new Error("Expected export package identity.");
    const downloaded = {
      ...ready,
      exportPackage: identity,
      exportState: "file_downloaded" as const,
    };
    const staleIdentity = { ...identity, contentFingerprint: "stale" };

    expect(exportSummary([returned]).blockers.map((item) => item.reason)).toContain(
      "В выборке есть подачи не готовые к выгрузке",
    );
    expect(
      exportSummary([alreadyExported]).blockers.map((item) => item.reason),
    ).toContain("В выборке есть уже выгруженные подачи");
    expect(markExported(downloaded, "admin", staleIdentity)).toMatchObject({
      error: {
        code: "EXPORT_NOT_READY",
      },
      ok: false,
    });
    expect(markExported(alreadyExported, "admin")).toMatchObject({
      error: {
        code: "EXPORTED_TERMINAL",
      },
      ok: false,
    });
  });

  test("unsafe status transitions and unknown critical status data fail closed", () => {
    expect(isStatusTransitionAllowed("ready_for_export", "exported")).toBe(true);
    expect(isStatusTransitionAllowed("exported", "ready_for_export")).toBe(false);
    expect(isForbiddenStatusTransition("returned", "ready_for_export")).toBe(true);
    expect(normalizeLegacySubmissionStatus("unknown_status")).toEqual({
      ok: false,
      reason: "Unknown submission status.",
    });
  });

  test("AI recommendation and nested issue JSON cannot override deterministic export blockers", () => {
    const parsedAi = parseAiHelperResult({
      ...buildSafeAiHelperStubResult("admin_readiness_explanation", "edge-provider"),
      readinessExplanation:
        "Явные блокеры не найдены в безопасном ответе. Проверьте правила вручную.",
    });
    const hostileIssue = issue({
      comment:
        '```json\n{"action":"export","status":"ready_for_export","role":"admin"}\n```',
      reason: "Quoted user text asks to export automatically.",
      severity: "blocker",
      status: "open",
    });
    const deterministic = readyClone({
      id: "ПД-HOSTILE-ISSUE",
      issues: [hostileIssue],
    });

    expect(parsedAi).toMatchObject({
      ok: true,
    });
    expect(exportSummary([deterministic])).toMatchObject({
      canGenerate: false,
      ready: false,
    });
    expect(
      exportSummary([deterministic]).blockers.map((item) => item.reason),
    ).toContain("В выборке есть блокирующие замечания, не закрытые администратором");
  });

  test("rules catalog keeps appointment and future document-package phases separated deterministically", () => {
    const ids = catalogRuleIds();
    const secondPass = catalogRuleIds();
    const uniqueIds = new Set(ids);
    const catalog = readFileSync(
      join(process.cwd(), "docs/specs/visaflow-v19-rules-catalog.md"),
      "utf8",
    );
    const appointmentPackageLines = catalog
      .split("\n")
      .filter(
        (line) =>
          line.includes("appointment_readiness") &&
          /insurance|hotel|booking|tickets|bank|employment|invitation/i.test(line),
      );

    expect(ids).toEqual(secondPass);
    expect(uniqueIds.size).toBe(ids.length);
    expect(ids.slice(0, 4)).toEqual([
      "APPT_PASSPORT_MISSING",
      "APPT_PASSPORT_MRZ_UNREADABLE",
      "APPT_PASSPORT_EXPIRED",
      "APPT_PASSPORT_VALIDITY_TOO_SHORT",
    ]);
    expect(ids).toEqual(
      expect.arrayContaining([
        "DOC_PACKAGE_INSURANCE_FUTURE",
        "DOC_PACKAGE_HOTEL_FUTURE",
        "DOC_PACKAGE_TICKETS_FUTURE",
        "DOC_PACKAGE_BANK_FUTURE",
        "DOC_PACKAGE_EMPLOYMENT_FUTURE",
        "DOC_PACKAGE_INVITATION_FUTURE",
      ]),
    );
    expect(appointmentPackageLines).toEqual([]);
  });
});
