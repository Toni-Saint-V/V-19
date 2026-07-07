import type { Applicant, Submission, VisaApplicationPdfReviewState } from "./types";
import { buildApplicantDocumentFileName } from "./filenamePolicy";
import {
  assertVisaApplicationPdfSha256,
  mediaStorageBucket,
  validateVisaApplicationPdfStorageTarget,
} from "./mediaStoragePolicy";
import type {
  VisaApplicationPdfExtractionSource,
  VisaApplicationPdfReviewData,
  VisaPdfFieldKey,
  VisaPdfFinding,
  VisaPdfFindingSeverity,
} from "./visaApplicationPdfReviewTypes";
import { visaApplicationPdfParserVersion } from "./visaApplicationPdfReviewTypes";

export type {
  VisaApplicationPdfReviewData,
  VisaPdfFieldKey,
  VisaPdfFinding,
  VisaPdfFindingSeverity,
} from "./visaApplicationPdfReviewTypes";

export type VisaApplicationPdfData = VisaApplicationPdfReviewData & {
  passportLast3?: string;
  rawText: string;
};

export type VisaApplicationReferenceData = Partial<
  Record<
    | "birthCountry"
    | "birthDate"
    | "birthPlace"
    | "citizenship"
    | "firstName"
    | "passportExpiresAt"
    | "passportIssueCountry"
    | "passportIssuedAt"
    | "passportNumber"
    | "surname",
    string
  >
>;

export type VisaPdfReconciliationResult = {
  data: VisaApplicationPdfData;
  findings: VisaPdfFinding[];
  status: "clear" | "blocked" | "needs_review";
};

export type VisaApplicationPdfAgentHandoffStatus = {
  ok: boolean;
  reason: string;
  status:
    | "blocked"
    | "missing"
    | "needs_manual_confirmation"
    | "not_exported"
    | "ready";
};

export type VisaApplicationPdfArtifactInput = {
  extractedPageCount?: number;
  extractionSource?: VisaApplicationPdfExtractionSource;
  fileName: string;
  mimeType: string;
  ocrPageLimit?: number;
  parserVersion?: number;
  sha256: string;
  sizeBytes: number;
  storageBucket?: string;
  storagePath?: string;
  uploadedAtIso?: string;
  uploadedBy?: string;
};

const requiredPdfFields: Array<{
  field: VisaPdfFieldKey;
  label: string;
  severity: VisaPdfFindingSeverity;
}> = [
  { field: "destinationCountry", label: "страна назначения", severity: "critical" },
  { field: "firstEntryCountry", label: "страна первого въезда", severity: "critical" },
  { field: "entriesRequested", label: "количество въездов", severity: "warning" },
  { field: "arrivalDate", label: "дата въезда", severity: "critical" },
  { field: "departureDate", label: "дата выезда", severity: "critical" },
  { field: "paymentCoverage", label: "кто оплачивает поездку", severity: "warning" },
  { field: "tripPurpose", label: "цель поездки", severity: "warning" },
];

const comparableFields: Array<{
  field: keyof VisaApplicationReferenceData;
  label: string;
}> = [
  { field: "surname", label: "фамилия" },
  { field: "firstName", label: "имя" },
  { field: "birthDate", label: "дата рождения" },
  { field: "birthPlace", label: "место рождения" },
  { field: "birthCountry", label: "страна рождения" },
  { field: "citizenship", label: "гражданство" },
  { field: "passportNumber", label: "номер паспорта" },
  { field: "passportIssuedAt", label: "дата выдачи паспорта" },
  { field: "passportExpiresAt", label: "дата окончания паспорта" },
  { field: "passportIssueCountry", label: "страна выдачи паспорта" },
];

export function extractVisaApplicationPdfData(text: string): VisaApplicationPdfData {
  const normalized = normalizePdfText(text);
  const pageOne = numberedSections(normalized, 1, 17);
  const pageTwo = numberedSections(normalized, 18, 31);
  const pageThree = numberedSections(normalized, 32, 34);
  const section19 = pageTwo.get(19) ?? "";
  const section23 = pageTwo.get(23) ?? "";
  const section27 = pageTwo.get(27) ?? "";
  const section28 = pageTwo.get(28) ?? "";
  const section33 = pageThree.get(33) ?? "";
  const tripDatesInAddress = section19.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
  const travelDates = section28.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];

  return compactData({
    arrivalDate: travelDates[0],
    birthCountry: firstValueLine(pageOne.get(6) ?? ""),
    birthDate: firstDate(pageOne.get(4) ?? ""),
    birthPlace: firstValueLine(pageOne.get(5) ?? ""),
    citizenship: firstValueLine(pageOne.get(7) ?? ""),
    departureDate: travelDates[1],
    destinationCountry: countryValue(pageTwo.get(25) ?? ""),
    entriesRequested: selectedEntries(section27),
    firstEntryCountry: countryValue(pageTwo.get(26) ?? ""),
    firstName: firstValueLine(pageOne.get(3) ?? ""),
    passportExpiresAt: firstDate(pageOne.get(15) ?? ""),
    passportIssueCountry: firstValueLine(pageOne.get(16) ?? ""),
    passportIssuedAt: firstDate(pageOne.get(14) ?? ""),
    passportNumber: firstPassportNumber(pageOne.get(13) ?? ""),
    passportLast3: passportLast3(pageOne.get(13) ?? ""),
    paymentCoverage: selectedPaymentCoverage(section33),
    rawText: text,
    surname: firstValueLine(pageOne.get(1) ?? ""),
    travelDatesInAddress:
      tripDatesInAddress.length > 0 ? tripDatesInAddress.join(" - ") : undefined,
    tripPurpose: selectedTripPurpose(section23),
  });
}

export function reconcileVisaApplicationPdf(
  pdfText: string,
  reference: VisaApplicationReferenceData,
): VisaPdfReconciliationResult {
  const data = extractVisaApplicationPdfData(pdfText);
  return reconcileVisaApplicationPdfData(data, reference);
}

function reconcileVisaApplicationPdfData(
  data: VisaApplicationPdfData,
  reference: VisaApplicationReferenceData,
): VisaPdfReconciliationResult {
  const findings: VisaPdfFinding[] = [];

  for (const item of comparableFields) {
    const expected = reference[item.field]?.trim();
    const actual = data[item.field]?.trim();
    if (!expected) continue;
    if (!actual) {
      findings.push({
        code: "pdf_critical_field_missing",
        expected,
        field: item.field,
        message: `В PDF не найдено критичное поле: ${item.label}.`,
        severity: "critical",
      });
      continue;
    }
    if (normalizedComparable(expected) === normalizedComparable(actual)) continue;

    findings.push({
      code: "pdf_field_mismatch",
      expected,
      field: item.field,
      message: `PDF не совпадает с заявкой: ${item.label}.`,
      severity: "critical",
      value: actual,
    });
  }

  for (const item of requiredPdfFields) {
    if (data[item.field]?.trim()) continue;
    findings.push({
      code: "pdf_required_field_missing",
      field: item.field,
      message: `В PDF не заполнено обязательное поле: ${item.label}.`,
      severity: item.severity,
    });
  }

  if (data.travelDatesInAddress) {
    findings.push({
      code: "pdf_travel_dates_in_address",
      field: "travelDatesInAddress",
      message:
        "Даты поездки обнаружены в домашнем адресе, а не в поле дат въезда/выезда.",
      severity: "critical",
      value: data.travelDatesInAddress,
    });
  }

  return {
    data,
    findings,
    status: findings.some((finding) => finding.severity === "critical")
      ? "blocked"
      : findings.length
        ? "needs_review"
        : "clear",
  };
}

export function referenceDataFromSubmission(
  submission: Submission,
  applicantIndex = 0,
): VisaApplicationReferenceData {
  const applicant = submission.applicants[applicantIndex];
  if (!applicant) return {};

  return {
    birthCountry: questionnaireValue(applicant, "birth-country"),
    birthDate: questionnaireValue(applicant, "birth-date"),
    birthPlace: questionnaireValue(applicant, "birth-place"),
    citizenship: questionnaireValue(applicant, "nationality"),
    firstName: questionnaireValue(applicant, "first-name"),
    passportExpiresAt: questionnaireValue(applicant, "passport-expiry-date"),
    passportIssueCountry: questionnaireValue(applicant, "passport-issue-country"),
    passportIssuedAt: questionnaireValue(applicant, "passport-issue-date"),
    passportNumber: questionnaireValue(applicant, "passport-no"),
    surname: questionnaireValue(applicant, "surname"),
  };
}

export function applyVisaApplicationPdfReview(
  submission: Submission,
  pdfText: string,
  options: {
    applicantIndex?: number;
    artifact?: VisaApplicationPdfArtifactInput;
    fileName?: string;
  } = {},
): Submission {
  const data = extractVisaApplicationPdfData(pdfText);
  const applicantIndex =
    options.applicantIndex ?? matchingApplicantIndexForPdfData(submission, data);
  const applicant =
    applicantIndex >= 0 ? submission.applicants[applicantIndex] : undefined;
  const review = applicant
    ? reconcileVisaApplicationPdfData(
        data,
        referenceDataFromSubmission(submission, applicantIndex),
      )
    : unmatchedApplicantReview(data);
  const { passportLast3: _passportLast3, rawText: _rawText, ...safeData } =
    review.data;
  const checkedAtIso = new Date().toISOString();
  void _rawText;
  void _passportLast3;
  const artifact = normalizeVisaApplicationPdfArtifact(
    options.artifact,
    checkedAtIso,
    applicant
      ? {
          applicantId: applicant.id,
          submissionId: submission.id,
        }
      : undefined,
  );
  const displayArtifact =
    artifact && applicant
      ? {
          ...artifact,
          fileName: buildApplicantDocumentFileName({
            applicant,
            documentType: "application_form_pdf",
          }),
        }
      : artifact;
  const displayFileName = applicant
    ? buildApplicantDocumentFileName({
        applicant,
        documentType: "application_form_pdf",
      })
    : options.fileName;
  const nextReview: VisaApplicationPdfReviewState = {
    applicantId: applicant?.id,
    applicantName: applicant?.fullName,
    artifact: displayArtifact,
    checkedAtIso,
    data: safeData,
    fileName: displayArtifact?.fileName ?? displayFileName,
    findings: review.findings,
    handoffStatus: reviewHandoffStatus(review.status),
    id: visaPdfReviewId(applicant, displayArtifact, checkedAtIso),
    status: review.status,
  };
  const existingReviews = visaApplicationPdfReviewsForSubmission(submission);
  const nextReviews = [
    ...existingReviews.filter((existingReview) => {
      if (
        nextReview.applicantId &&
        existingReview.applicantId === nextReview.applicantId
      ) {
        return false;
      }
      if (
        !nextReview.applicantId &&
        nextReview.artifact?.sha256 &&
        existingReview.artifact?.sha256 === nextReview.artifact.sha256
      ) {
        return false;
      }
      return true;
    }),
    nextReview,
  ];

  return {
    ...submission,
    updatedAt: "сейчас",
    visaApplicationPdfReview: nextReview,
    visaApplicationPdfReviews: nextReviews,
  };
}

export function visaApplicationPdfReviewsForSubmission(
  submission: Submission,
): VisaApplicationPdfReviewState[] {
  const reviews =
    submission.visaApplicationPdfReviews?.map(normalizeVisaPdfReview) ?? [];
  if (!submission.visaApplicationPdfReview) return reviews;

  const legacyReview = normalizeVisaPdfReview(submission.visaApplicationPdfReview);
  if (reviews.some((review) => review.id === legacyReview.id)) return reviews;
  return [...reviews, legacyReview];
}

export function confirmVisaApplicationPdfManualReview(
  submission: Submission,
  reviewId: string,
  actor: string,
): Submission {
  const existingReviews = visaApplicationPdfReviewsForSubmission(submission);
  const targetReview = existingReviews.find((review) => review.id === reviewId);
  if (
    !targetReview ||
    targetReview.status !== "needs_review" ||
    targetReview.handoffStatus === "ready_for_agent"
  ) {
    return submission;
  }

  const confirmedAtIso = new Date().toISOString();
  const nextReviews = existingReviews.map((review) =>
    review.id === reviewId
      ? {
          ...review,
          handoffStatus: "ready_for_agent" as const,
          manualReviewConfirmedAtIso: confirmedAtIso,
          manualReviewConfirmedBy: actor,
        }
      : review,
  );
  const nextCurrentReview =
    nextReviews.find(
      (review) => review.id === submission.visaApplicationPdfReview?.id,
    ) ?? nextReviews.at(-1);

  return {
    ...submission,
    history: withVisaPdfHistoryEvent(
      submission,
      `и-${submission.id}-visa-pdf-confirm-${reviewId}`,
      `PDF анкеты подтверждён вручную: ${targetReview.applicantName ?? "заявитель"}`,
      actor,
    ),
    updatedAt: "сейчас",
    visaApplicationPdfReview: nextCurrentReview,
    visaApplicationPdfReviews: nextReviews,
  };
}

export function dismissVisaApplicationPdfReview(
  submission: Submission,
  reviewId: string,
  actor: string,
): Submission {
  const existingReviews = visaApplicationPdfReviewsForSubmission(submission);
  const dismissedReview = existingReviews.find((review) => review.id === reviewId);
  if (!dismissedReview) return submission;

  const nextReviews = existingReviews.filter((review) => review.id !== reviewId);
  const nextCurrentReview =
    nextReviews.find(
      (review) => review.id === submission.visaApplicationPdfReview?.id,
    ) ?? nextReviews.at(-1);

  return {
    ...submission,
    history: withVisaPdfHistoryEvent(
      submission,
      `и-${submission.id}-visa-pdf-dismiss-${reviewId}`,
      `PDF анкеты снят с проверки: ${dismissedReview.artifact?.fileName ?? dismissedReview.fileName ?? "файл"}`,
      actor,
    ),
    updatedAt: "сейчас",
    visaApplicationPdfReview: nextCurrentReview,
    visaApplicationPdfReviews: nextReviews,
  };
}

export function visaApplicationPdfBlockingReason(submission: Submission) {
  const review = visaApplicationPdfReviewsForSubmission(submission).find(
    (candidate) => candidate.status === "blocked",
  );
  if (review?.status !== "blocked") return "";
  return (
    review.findings.find((finding) => finding.severity === "critical")?.message ??
    "PDF анкеты не совпадает с данными заявки."
  );
}

export function visaApplicationPdfAgentHandoffStatus(
  submission: Submission,
): VisaApplicationPdfAgentHandoffStatus {
  if (submission.status !== "exported") {
    return {
      ok: false,
      reason: "PDF анкеты проверяется после выгрузки и внешней обработки.",
      status: "not_exported",
    };
  }

  const reviews = visaApplicationPdfReviewsForSubmission(submission);
  if (!reviews.length) {
    return {
      ok: false,
      reason: "Загрузите PDF анкеты после внешней обработки перед передачей агентам.",
      status: "missing",
    };
  }

  const criticalReason = visaApplicationPdfBlockingReason(submission);
  if (criticalReason) {
    return {
      ok: false,
      reason: criticalReason,
      status: "blocked",
    };
  }

  const coveredApplicantIds = new Set(
    reviews
      .filter((review) => review.applicantId && review.status !== "blocked")
      .map((review) => review.applicantId),
  );
  const missingApplicant = submission.applicants.find(
    (applicant) => !coveredApplicantIds.has(applicant.id),
  );
  if (missingApplicant) {
    return {
      ok: false,
      reason: `Загрузите и проверьте PDF анкеты для ${missingApplicant.fullName}.`,
      status: "missing",
    };
  }

  if (
    reviews.some(
      (review) =>
        (review.status === "needs_review" &&
          review.handoffStatus !== "ready_for_agent") ||
        review.handoffStatus === "needs_manual_confirmation",
    )
  ) {
    return {
      ok: false,
      reason:
        "Есть предупреждения PDF, подтвердите ручную проверку перед передачей агентам.",
      status: "needs_manual_confirmation",
    };
  }

  return {
    ok: true,
    reason: "PDF анкеты совпадает с критичными данными заявки.",
    status: "ready",
  };
}

function unmatchedApplicantReview(
  data: VisaApplicationPdfData,
): VisaPdfReconciliationResult {
  return {
    data,
    findings: [
      {
        code: "pdf_applicant_match_missing",
        field: "passportNumber",
        message:
          "PDF анкеты не удалось однозначно сопоставить с заявителем по паспорту или ФИО.",
        severity: "critical",
        value: data.passportNumber,
      },
    ],
    status: "blocked",
  };
}

function matchingApplicantIndexForPdfData(
  submission: Submission,
  data: VisaApplicationPdfData,
) {
  const passportIndex = uniqueApplicantIndexBy(submission, (applicant) => {
    if (!data.passportNumber) return false;
    return (
      normalizedComparable(questionnaireValue(applicant, "passport-no")) ===
      normalizedComparable(data.passportNumber)
    );
  });
  if (passportIndex !== undefined) return passportIndex;
  if (data.passportNumber) return -1;

  const nameIndex = uniqueApplicantIndexBy(submission, (applicant) => {
    if (!data.surname || !data.firstName || !data.birthDate) return false;
    const applicantPassport = normalizedComparable(
      questionnaireValue(applicant, "passport-no"),
    );
    const pdfPassportLast3 = normalizedComparable(data.passportLast3 ?? "").slice(-3);
    if (!pdfPassportLast3) return false;
    return (
      normalizedComparable(questionnaireValue(applicant, "surname")) ===
        normalizedComparable(data.surname) &&
      normalizedComparable(questionnaireValue(applicant, "first-name")) ===
        normalizedComparable(data.firstName) &&
      normalizedComparable(questionnaireValue(applicant, "birth-date")) ===
        normalizedComparable(data.birthDate) &&
      (!pdfPassportLast3 || applicantPassport.endsWith(pdfPassportLast3))
    );
  });
  if (nameIndex !== undefined) return nameIndex;

  return submission.applicants.length === 1 ? 0 : -1;
}

function uniqueApplicantIndexBy(
  submission: Submission,
  predicate: (applicant: Applicant) => boolean,
) {
  const indexes = submission.applicants
    .map((applicant, index) => (predicate(applicant) ? index : -1))
    .filter((index) => index >= 0);
  return indexes.length === 1 ? indexes[0] : undefined;
}

function reviewHandoffStatus(status: VisaPdfReconciliationResult["status"]) {
  if (status === "blocked") return "blocked";
  if (status === "needs_review") return "needs_manual_confirmation";
  return "ready_for_agent";
}

function normalizeVisaApplicationPdfArtifact(
  artifact: VisaApplicationPdfArtifactInput | undefined,
  checkedAtIso: string,
  storageIdentity?: { applicantId: string; submissionId: string },
): VisaApplicationPdfReviewState["artifact"] {
  if (!artifact) return undefined;

  const sha256 = assertVisaApplicationPdfSha256(artifact.sha256);
  if (artifact.storageBucket || artifact.storagePath) {
    if (artifact.storageBucket !== mediaStorageBucket || !artifact.storagePath) {
      throw new Error(
        "PDF анкеты должен храниться в приватном bucket submission-media с валидным путём.",
      );
    }

    if (!storageIdentity) {
      throw new Error(
        "PDF анкеты с private storage identity должен быть сопоставлен с заявителем.",
      );
    }

    validateVisaApplicationPdfStorageTarget({
      applicantId: storageIdentity.applicantId,
      file: {
        name: artifact.fileName,
        size: artifact.sizeBytes,
        type: artifact.mimeType,
      },
      sha256,
      submissionId: storageIdentity.submissionId,
      target: {
        bucket: mediaStorageBucket,
        path: artifact.storagePath,
      },
    });
  }

  return {
    extractedPageCount: artifact.extractedPageCount,
    extractionSource: artifact.extractionSource,
    fileName: artifact.fileName,
    mimeType: artifact.mimeType,
    ocrPageLimit: artifact.ocrPageLimit,
    parserVersion: artifact.parserVersion ?? visaApplicationPdfParserVersion,
    sha256,
    sizeBytes: artifact.sizeBytes,
    storageBucket: artifact.storageBucket,
    storagePath: artifact.storagePath,
    uploadedAtIso: artifact.uploadedAtIso ?? checkedAtIso,
    uploadedBy: artifact.uploadedBy,
  };
}

function withVisaPdfHistoryEvent(
  submission: Submission,
  id: string,
  text: string,
  actor: string,
): Submission["history"] {
  if (submission.history.some((event) => event.id === id)) return submission.history;
  return [
    {
      at: new Date().toISOString(),
      detail: actor ? `Оператор: ${actor}` : undefined,
      id,
      source: "admin",
      text,
    },
    ...submission.history,
  ];
}

function visaPdfReviewId(
  applicant: Applicant | undefined,
  artifact: VisaApplicationPdfArtifactInput | undefined,
  checkedAtIso: string,
) {
  const owner = applicant?.id ?? "unmatched";
  const source = artifact?.sha256.slice(0, 16) ?? checkedAtIso;
  return `visa-pdf-${owner}-${source}`;
}

function normalizeVisaPdfReview(
  review: VisaApplicationPdfReviewState,
): VisaApplicationPdfReviewState {
  const legacyReview = review as VisaApplicationPdfReviewState & {
    handoffStatus?: VisaApplicationPdfReviewState["handoffStatus"];
    id?: string;
  };
  return {
    ...review,
    handoffStatus: legacyReview.handoffStatus ?? reviewHandoffStatus(review.status),
    id:
      legacyReview.id ??
      `visa-pdf-${review.applicantId ?? "legacy"}-${review.checkedAtIso}`,
  };
}

function compactData<T extends VisaApplicationPdfData>(data: T): T {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined && value !== ""),
  ) as T;
}

function normalizePdfText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function numberedSections(text: string, start: number, end: number) {
  const sections = new Map<number, string>();
  for (let number = start; number <= end; number += 1) {
    const current = numberedFieldRegex(number);
    const next =
      number === end
        ? /No se requiere|$/.source
        : numberedFieldRegex(number + 1).source;
    const match = new RegExp(`${current.source}([\\s\\S]*?)(?=${next})`).exec(text);
    if (match?.[1]) sections.set(number, match[1].trim());
  }
  return sections;
}

function numberedFieldRegex(number: number) {
  return new RegExp(`(?:^|\\n)\\s*\\*?\\s*${number}\\s*[\\.](?!\\d)`);
}

function firstValueLine(section: string) {
  const lines = section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isLabelLine(line));
  return lines.find((line) => /[A-ZА-Я0-9]/.test(line))?.replace(/[:]+$/, "") ?? "";
}

function isLabelLine(line: string) {
  return (
    line.includes("/") ||
    line.includes(":") ||
    /^[a-z]/.test(line) ||
    /^(PARTE RESERVADA|Fecha de|Fecha prevista|Número de|Solicitud|Embajada|Proveedor|Intermediario|Frontera|Otros|Documento|Medios|Invitación|Seguro|Decisión|Expedido|Válido|Estado miembro|Страна|Una|Dos|múltiples)$/i.test(
      line,
    )
  );
}

function firstDate(section: string) {
  return (
    section.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ??
    section.match(/\b\d{2}[.-]\d{2}[.-]\d{4}\b/)?.[0] ??
    ""
  );
}

function firstPassportNumber(section: string) {
  return section.match(/\b\d{8,9}\b/)?.[0] ?? "";
}

function passportLast3(section: string) {
  return (
    section.match(/\*{2,}\s*(\d{3,4})\b/)?.[1]?.slice(-3) ??
    section.match(/\b\d{3}\b/)?.[0] ??
    ""
  );
}

function countryValue(section: string) {
  const lines = section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isLabelLine(line));
  return lines.find((line) => isCountryValueLine(line)) ?? "";
}

function isCountryValueLine(line: string) {
  if (/^(una|dos|múltiples|multiples)$/i.test(line)) return false;
  if (
    /(estado miembro|destino|entrada|schengen|si procede|страна|страны|основного|назначени|первого|въезда|шенген)/i.test(
      line,
    )
  ) {
    return false;
  }
  return /[\p{L}]/u.test(line);
}

function selectedEntries(section: string) {
  if (/M[úu]ltiples\/|M[úu]ltiples\b/.test(section) && hasSelectionSignal(section)) {
    return "multiple";
  }
  if (/\bDos\/|Dos\b/.test(section) && hasSelectionSignal(section)) return "two";
  if (/\bUna\/|Una\b/.test(section) && hasSelectionSignal(section)) return "one";
  return "";
}

function selectedTripPurpose(section: string) {
  if (/Turismo\/|Turismo\b/.test(section) && hasSelectionSignal(section)) {
    return "Turismo";
  }
  return "";
}

function selectedPaymentCoverage(section: string) {
  if (
    /By the applicant himself\/herself/.test(section) &&
    hasSelectionSignal(section)
  ) {
    return "applicant";
  }
  if (/por un patrocinador/.test(section) && hasSelectionSignal(section)) {
    return "sponsor";
  }
  return "";
}

function hasSelectionSignal(section: string) {
  return /[✓✔☑■]/.test(section);
}

function normalizedComparable(value: string) {
  const date = normalizeDate(value);
  if (date) return date;
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toUpperCase();
}

function normalizeDate(value: string) {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{2})[.-](\d{2})[.-](\d{4})$/.exec(trimmed);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return "";
}

function questionnaireValue(applicant: Applicant, fieldId: string) {
  return (
    applicant.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === fieldId)
      ?.value.trim() ?? ""
  );
}
