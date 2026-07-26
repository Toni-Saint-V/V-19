import { passportExtractionRows } from "./passportExtraction";
import { hasApplicantPassportExtractionReviewPending } from "./passportExtractionGuards";
import { visaApplicationPdfReviewsForSubmission } from "./visaApplicationPdfReconciliation";
import type { WorkspaceTarget } from "./workspaceModel";
import type {
  Applicant,
  PassportExtractedField,
  PassportExtractedFieldKey,
  Submission,
  VisaApplicationPdfReviewState,
} from "./types";
import type { VisaPdfFieldKey, VisaPdfFinding } from "./visaApplicationPdfReviewTypes";

export type IdentityConsistencySource = "questionnaire" | "passport_ocr" | "visa_pdf";

export type IdentityConsistencySeverity = "critical" | "warning" | "info";

export type IdentityConsistencyStatus = "clear" | "needs_review" | "blocked";

export type IdentityFieldKey = Extract<
  PassportExtractedFieldKey,
  | "birthCountry"
  | "birthDate"
  | "birthPlace"
  | "citizenship"
  | "firstName"
  | "passportExpiresAt"
  | "passportIssueCountry"
  | "passportIssuePlace"
  | "passportIssuedAt"
  | "passportNumber"
  | "surname"
>;

export type IdentityConsistencyFindingCode =
  | "identity_source_mismatch"
  | "identity_questionnaire_missing_from_source"
  | "passport_ocr_unverified"
  | "visa_pdf_reconciliation_finding";

export type IdentityFieldEvidence = {
  confidence?: PassportExtractedField["confidence"];
  label: string;
  normalizedValue?: string;
  source: IdentityConsistencySource;
  value: string;
};

export type IdentityConsistencyFinding = {
  applicantId: string;
  applicantName: string;
  code: IdentityConsistencyFindingCode;
  evidence: IdentityFieldEvidence[];
  field: IdentityFieldKey | VisaPdfFieldKey;
  id: string;
  label: string;
  message: string;
  severity: IdentityConsistencySeverity;
  target: WorkspaceTarget;
};

export type IdentityConsistencyReport = {
  agentFollowUpDrafts: Array<{
    applicantId: string;
    applicantName: string;
    text: string;
  }>;
  findings: IdentityConsistencyFinding[];
  nextActions: string[];
  operatorSummary: string;
  status: IdentityConsistencyStatus;
  totals: {
    blocked: number;
    checkedApplicants: number;
    findings: number;
    needsReview: number;
  };
};

type IdentityFieldSpec = {
  fieldId: string;
  key: IdentityFieldKey;
  label: string;
  pdfKey?: VisaPdfFieldKey;
  sectionId: "personal" | "passport";
  sectionTitle: string;
  severity: IdentityConsistencySeverity;
};

type SourceValue = {
  confidence?: PassportExtractedField["confidence"];
  normalized: string;
  source: IdentityConsistencySource;
  value: string;
};

const identityFieldSpecs: IdentityFieldSpec[] = [
  {
    fieldId: "surname",
    key: "surname",
    label: "Фамилия",
    pdfKey: "surname",
    sectionId: "personal",
    sectionTitle: "Личные данные",
    severity: "critical",
  },
  {
    fieldId: "first-name",
    key: "firstName",
    label: "Имя",
    pdfKey: "firstName",
    sectionId: "personal",
    sectionTitle: "Личные данные",
    severity: "critical",
  },
  {
    fieldId: "birth-date",
    key: "birthDate",
    label: "Дата рождения",
    pdfKey: "birthDate",
    sectionId: "personal",
    sectionTitle: "Личные данные",
    severity: "critical",
  },
  {
    fieldId: "birth-place",
    key: "birthPlace",
    label: "Место рождения",
    pdfKey: "birthPlace",
    sectionId: "personal",
    sectionTitle: "Личные данные",
    severity: "warning",
  },
  {
    fieldId: "birth-country",
    key: "birthCountry",
    label: "Страна рождения",
    pdfKey: "birthCountry",
    sectionId: "personal",
    sectionTitle: "Личные данные",
    severity: "warning",
  },
  {
    fieldId: "nationality",
    key: "citizenship",
    label: "Гражданство",
    pdfKey: "citizenship",
    sectionId: "personal",
    sectionTitle: "Личные данные",
    severity: "warning",
  },
  {
    fieldId: "passport-no",
    key: "passportNumber",
    label: "Номер паспорта",
    pdfKey: "passportNumber",
    sectionId: "passport",
    sectionTitle: "Паспорт",
    severity: "critical",
  },
  {
    fieldId: "passport-issue-place",
    key: "passportIssuePlace",
    label: "Место выдачи паспорта",
    sectionId: "passport",
    sectionTitle: "Паспорт",
    severity: "warning",
  },
  {
    fieldId: "passport-issue-country",
    key: "passportIssueCountry",
    label: "Страна выдачи паспорта",
    pdfKey: "passportIssueCountry",
    sectionId: "passport",
    sectionTitle: "Паспорт",
    severity: "warning",
  },
  {
    fieldId: "passport-issue-date",
    key: "passportIssuedAt",
    label: "Дата выдачи паспорта",
    pdfKey: "passportIssuedAt",
    sectionId: "passport",
    sectionTitle: "Паспорт",
    severity: "warning",
  },
  {
    fieldId: "passport-expiry-date",
    key: "passportExpiresAt",
    label: "Дата окончания паспорта",
    pdfKey: "passportExpiresAt",
    sectionId: "passport",
    sectionTitle: "Паспорт",
    severity: "critical",
  },
];

const fieldSpecsByKey = new Map(
  identityFieldSpecs.map((spec) => [spec.key, spec] as const),
);
const fieldSpecsByPdfKey = new Map(
  identityFieldSpecs.flatMap((spec) =>
    spec.pdfKey
      ? ([[spec.pdfKey, spec] as const] satisfies Array<
          readonly [VisaPdfFieldKey, IdentityFieldSpec]
        >)
      : [],
  ),
);

const sourceLabels: Record<IdentityConsistencySource, string> = {
  passport_ocr: "паспорт OCR",
  questionnaire: "анкета",
  visa_pdf: "PDF анкеты",
};

export function buildIdentityConsistencyReport(
  submission: Submission,
): IdentityConsistencyReport {
  const pdfReviews = visaApplicationPdfReviewsForSubmission(submission);
  const findings = submission.applicants.flatMap((applicant) =>
    applicantIdentityFindings(submission, applicant, pdfReviews),
  );
  const sortedFindings = findings.sort(identityFindingSort);
  const totals = {
    blocked: sortedFindings.filter((finding) => finding.severity === "critical").length,
    checkedApplicants: submission.applicants.length,
    findings: sortedFindings.length,
    needsReview: sortedFindings.filter((finding) => finding.severity === "warning")
      .length,
  };

  return {
    agentFollowUpDrafts: buildAgentFollowUpDrafts(sortedFindings),
    findings: sortedFindings,
    nextActions: buildNextActions(sortedFindings),
    operatorSummary: operatorSummaryFor(totals),
    status:
      totals.blocked > 0 ? "blocked" : totals.findings > 0 ? "needs_review" : "clear",
    totals,
  };
}

export function firstIdentityConsistencyTarget(
  report: IdentityConsistencyReport,
): WorkspaceTarget | undefined {
  return firstActionableIdentityFinding(report)?.target;
}

export function firstActionableIdentityFinding(
  report: IdentityConsistencyReport,
): IdentityConsistencyFinding | undefined {
  return (
    report.findings.find((finding) => finding.severity === "critical") ??
    report.findings.find((finding) => finding.severity === "warning")
  );
}

export function identityConsistencyFieldLabel(
  field: IdentityFieldKey | VisaPdfFieldKey,
) {
  return (
    fieldSpecsByKey.get(field as IdentityFieldKey)?.label ??
    fieldSpecsByPdfKey.get(field as VisaPdfFieldKey)?.label ??
    "Поле PDF анкеты"
  );
}

function applicantIdentityFindings(
  submission: Submission,
  applicant: Applicant,
  pdfReviews: VisaApplicationPdfReviewState[],
): IdentityConsistencyFinding[] {
  const pdfReview = reviewForApplicant(submission, applicant, pdfReviews);
  const fieldFindings = identityFieldSpecs.flatMap((spec) =>
    fieldConsistencyFindings(applicant, pdfReview, spec),
  );

  return [
    ...fieldFindings,
    ...passportManualReviewFinding(applicant),
    ...pdfReviewFindings(applicant, pdfReview),
  ];
}

function fieldConsistencyFindings(
  applicant: Applicant,
  pdfReview: VisaApplicationPdfReviewState | undefined,
  spec: IdentityFieldSpec,
): IdentityConsistencyFinding[] {
  const questionnaireValue = questionnaireFieldValue(applicant, spec.fieldId);
  const passportField = passportFieldFor(applicant, spec.key);
  const pdfValue = spec.pdfKey ? pdfReview?.data[spec.pdfKey] : undefined;
  const sources = compactValues([
    sourceValue("questionnaire", questionnaireValue, spec),
    sourceValue("passport_ocr", passportField?.value, spec, passportField?.confidence),
    sourceValue("visa_pdf", pdfValue, spec),
  ]);
  const findings: IdentityConsistencyFinding[] = [];
  const nonEmptySources = sources.filter((source) => source.normalized);
  const normalizedValues = new Set(nonEmptySources.map((source) => source.normalized));

  if (normalizedValues.size > 1) {
    findings.push({
      applicantId: applicant.id,
      applicantName: applicant.fullName,
      code: "identity_source_mismatch",
      evidence: nonEmptySources.map(evidenceFromSourceValue),
      field: spec.key,
      id: identityFindingId(applicant.id, "identity_source_mismatch", spec.key),
      label: spec.label,
      message: `${applicant.fullName}: ${spec.label.toLowerCase()} расходится между источниками — ${sourceSnapshot(nonEmptySources)}.`,
      severity: sourceMismatchSeverity(spec, nonEmptySources),
      target: targetForSpec(applicant.id, spec),
    });
  }

  if (!sourceValue("questionnaire", questionnaireValue, spec)?.normalized) {
    const sourceWithValue = [
      sourceValue(
        "passport_ocr",
        passportField?.value,
        spec,
        passportField?.confidence,
      ),
      sourceValue("visa_pdf", pdfValue, spec),
    ].find((source) => source?.normalized);

    if (sourceWithValue) {
      findings.push({
        applicantId: applicant.id,
        applicantName: applicant.fullName,
        code: "identity_questionnaire_missing_from_source",
        evidence: [evidenceFromSourceValue(sourceWithValue)],
        field: spec.key,
        id: identityFindingId(
          applicant.id,
          "identity_questionnaire_missing_from_source",
          spec.key,
        ),
        label: spec.label,
        message: `${applicant.fullName}: ${spec.label.toLowerCase()} есть в ${sourceLabels[sourceWithValue.source]}, но отсутствует в анкете.`,
        severity: "warning",
        target: targetForSpec(applicant.id, spec),
      });
    }
  }

  return findings;
}

function sourceMismatchSeverity(
  spec: IdentityFieldSpec,
  sources: SourceValue[],
): IdentityConsistencySeverity {
  return sources.some((source) => source.source === "visa_pdf")
    ? spec.severity
    : "warning";
}

function passportManualReviewFinding(
  applicant: Applicant,
): IdentityConsistencyFinding[] {
  const extraction = applicant.passportExtraction;
  if (
    !extraction ||
    extraction.status !== "ready" ||
    !extraction.extractedFields.length ||
    !hasApplicantPassportExtractionReviewPending(applicant)
  ) {
    return [];
  }

  const reviewRows = passportExtractionRows(applicant);
  if (
    reviewRows.length === 0 ||
    !reviewRows.some((row) => row.needsManualReview || row.conflict || !row.applied)
  ) {
    return [];
  }

  const firstRow = reviewRows.find((row) => row.conflict) ?? reviewRows[0];
  if (!firstRow) return [];
  const spec = fieldSpecsByKey.get(firstRow.key as IdentityFieldKey);
  const target = spec
    ? targetForSpec(applicant.id, spec)
    : ({
        applicantId: applicant.id,
        section: "Паспорт",
        tab: "questionnaire",
      } satisfies WorkspaceTarget);

  return [
    {
      applicantId: applicant.id,
      applicantName: applicant.fullName,
      code: "passport_ocr_unverified",
      evidence: reviewRows.slice(0, 5).map((row) => ({
        confidence: row.confidence,
        label: sourceLabels.passport_ocr,
        normalizedValue: normalizeIdentityValue(
          row.extractedValue,
          fieldSpecsByKey.get(row.key as IdentityFieldKey)?.key ?? "passportNumber",
        ),
        source: "passport_ocr",
        value: `${row.fieldLabel}: ${row.extractedValue}`,
      })),
      field: spec?.key ?? "passportNumber",
      id: identityFindingId(
        applicant.id,
        "passport_ocr_unverified",
        spec?.key ?? firstRow.key,
      ),
      label: "Ручная сверка паспорта",
      message: `${applicant.fullName}: распознанные паспортные поля ещё не подтверждены вручную.`,
      severity: "warning",
      target,
    },
  ];
}

function pdfReviewFindings(
  applicant: Applicant,
  pdfReview: VisaApplicationPdfReviewState | undefined,
): IdentityConsistencyFinding[] {
  if (!pdfReview || pdfReview.status === "clear") return [];

  return pdfReview.findings.map((finding) => {
    const spec = fieldSpecsByPdfKey.get(finding.field);
    const label = spec?.label ?? identityConsistencyFieldLabel(finding.field);
    return {
      applicantId: applicant.id,
      applicantName: applicant.fullName,
      code: "visa_pdf_reconciliation_finding" as const,
      evidence: pdfFindingEvidence(finding),
      field: spec?.key ?? finding.field,
      id: identityFindingId(
        applicant.id,
        "visa_pdf_reconciliation_finding",
        `${finding.code}-${finding.field}`,
      ),
      label,
      message: `${applicant.fullName}: ${finding.message}`,
      severity: finding.severity === "critical" ? "critical" : "warning",
      target: spec
        ? targetForSpec(applicant.id, spec)
        : ({
            applicantId: applicant.id,
            section: "Анкета",
            tab: "questionnaire",
          } satisfies WorkspaceTarget),
    };
  });
}

function reviewForApplicant(
  submission: Submission,
  applicant: Applicant,
  reviews: VisaApplicationPdfReviewState[],
) {
  const applicantReviews = reviews.filter(
    (review) => review.applicantId === applicant.id,
  );
  if (applicantReviews.length) return latestReview(applicantReviews);

  const orphanReviews = reviews.filter((review) => !review.applicantId);
  if (submission.applicants.length === 1 && orphanReviews.length) {
    return latestReview(orphanReviews);
  }

  return undefined;
}

function latestReview(reviews: VisaApplicationPdfReviewState[]) {
  return [...reviews].sort(
    (left, right) =>
      Date.parse(right.checkedAtIso) - Date.parse(left.checkedAtIso) ||
      right.id.localeCompare(left.id),
  )[0];
}

function sourceValue(
  source: IdentityConsistencySource,
  value: string | undefined,
  spec: IdentityFieldSpec,
  confidence?: PassportExtractedField["confidence"],
): SourceValue | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;

  return {
    confidence,
    normalized: normalizeIdentityValue(trimmed, spec.key),
    source,
    value: trimmed,
  };
}

function compactValues(values: Array<SourceValue | null>): SourceValue[] {
  return values.filter((value): value is SourceValue => Boolean(value));
}

function evidenceFromSourceValue(value: SourceValue): IdentityFieldEvidence {
  return {
    confidence: value.confidence,
    label: sourceLabels[value.source],
    normalizedValue: value.normalized,
    source: value.source,
    value: value.value,
  };
}

function pdfFindingEvidence(finding: VisaPdfFinding): IdentityFieldEvidence[] {
  const evidence: Array<IdentityFieldEvidence | null> = [
    finding.expected
      ? {
          label: "анкета",
          normalizedValue: normalizeIdentityValue(finding.expected, finding.field),
          source: "questionnaire" as const,
          value: finding.expected,
        }
      : null,
    finding.value
      ? {
          label: "PDF анкеты",
          normalizedValue: normalizeIdentityValue(finding.value, finding.field),
          source: "visa_pdf" as const,
          value: finding.value,
        }
      : null,
  ];

  return evidence.filter((item): item is IdentityFieldEvidence => Boolean(item));
}

function passportFieldFor(applicant: Applicant, key: IdentityFieldKey) {
  const fields = applicant.passportExtraction?.extractedFields.filter(
    (field) => field.key === key,
  );
  if (!fields?.length) return undefined;
  return [...fields].sort(passportFieldSort)[0];
}

function passportFieldSort(
  left: PassportExtractedField,
  right: PassportExtractedField,
) {
  const confidenceOrder = { high: 3, medium: 2, low: 1 } satisfies Record<
    PassportExtractedField["confidence"],
    number
  >;
  return confidenceOrder[right.confidence] - confidenceOrder[left.confidence];
}

function questionnaireFieldValue(applicant: Applicant, fieldId: string) {
  return (
    applicant.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === fieldId)
      ?.value.trim() ?? ""
  );
}

function targetForSpec(applicantId: string, spec: IdentityFieldSpec): WorkspaceTarget {
  return {
    applicantId,
    field: spec.fieldId,
    section: spec.sectionTitle,
    tab: "questionnaire",
  };
}

function normalizeIdentityValue(
  value: string,
  field: IdentityFieldKey | VisaPdfFieldKey,
) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (field.toLowerCase().includes("date") || field.endsWith("At")) {
    return normalizeDate(trimmed) ?? normalizeText(trimmed);
  }

  if (field === "passportNumber") {
    return trimmed.replace(/[^a-zа-яё0-9]/gi, "").toUpperCase();
  }

  return countryAlias(normalizeText(trimmed));
}

function normalizeDate(value: string) {
  const iso = value.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})$/);
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;

  const dotted = value.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (dotted) return `${dotted[3]}${dotted[2]}${dotted[1]}`;

  return undefined;
}

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[«»“”]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function countryAlias(value: string) {
  const aliases: Record<string, string> = {
    ESPANA: "SPAIN",
    ESPAÑA: "SPAIN",
    ES: "SPAIN",
    ИСПАНИЯ: "SPAIN",
    RF: "RUSSIAN FEDERATION",
    RUS: "RUSSIAN FEDERATION",
    RUSSIA: "RUSSIAN FEDERATION",
    РОССИЯ: "RUSSIAN FEDERATION",
    РФ: "RUSSIAN FEDERATION",
    USSR: "USSR",
    СССР: "USSR",
  };
  return aliases[value] ?? value;
}

function sourceSnapshot(values: SourceValue[]) {
  return values
    .map((value) => `${sourceLabels[value.source]}: «${value.value}»`)
    .join("; ");
}

function buildNextActions(findings: IdentityConsistencyFinding[]) {
  const critical = findings.filter((finding) => finding.severity === "critical");
  const warnings = findings.filter((finding) => finding.severity === "warning");
  const first = critical[0] ?? warnings[0];
  if (!first) return ["Согласованность анкеты, паспорта и PDF без активных сигналов."];

  const actions = [
    `Открыть ${first.applicantName} → ${first.label} и выбрать источник истины.`,
  ];
  if (critical.length > 1) {
    actions.push(`Закрыть ещё ${critical.length - 1} критичных расхождения.`);
  }
  if (warnings.length) {
    actions.push(`Проверить ${warnings.length} предупреждения перед передачей дальше.`);
  }
  return actions;
}

function buildAgentFollowUpDrafts(findings: IdentityConsistencyFinding[]) {
  const grouped = new Map<string, IdentityConsistencyFinding[]>();
  for (const finding of findings.filter((item) => item.severity !== "info")) {
    const key = finding.applicantId;
    grouped.set(key, [...(grouped.get(key) ?? []), finding]);
  }

  return [...grouped.values()].map((items) => {
    const first = items[0];
    return {
      applicantId: first.applicantId,
      applicantName: first.applicantName,
      text: `Проверьте данные ${first.applicantName}: ${items
        .slice(0, 4)
        .map((finding) => finding.label.toLowerCase())
        .join(", ")}. Нужен один подтверждённый вариант по анкете, паспорту и PDF.`,
    };
  });
}

function operatorSummaryFor(totals: IdentityConsistencyReport["totals"]) {
  if (!totals.findings) {
    return `Проверено заявителей: ${totals.checkedApplicants}. Расхождений между анкетой, паспортом и PDF не найдено.`;
  }

  return `Проверено заявителей: ${totals.checkedApplicants}. Найдено сигналов: ${totals.findings}; критичных: ${totals.blocked}; предупреждений: ${totals.needsReview}.`;
}

function identityFindingSort(
  left: IdentityConsistencyFinding,
  right: IdentityConsistencyFinding,
) {
  const severityOrder = { critical: 0, warning: 1, info: 2 } satisfies Record<
    IdentityConsistencySeverity,
    number
  >;
  return (
    severityOrder[left.severity] - severityOrder[right.severity] ||
    left.applicantName.localeCompare(right.applicantName) ||
    left.label.localeCompare(right.label) ||
    left.id.localeCompare(right.id)
  );
}

function identityFindingId(
  applicantId: string,
  code: IdentityConsistencyFindingCode,
  field: string,
) {
  return `identity-${applicantId}-${code}-${stableIdToken(field)}`;
}

function stableIdToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-zа-яё0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}
