import type { Applicant, Submission } from "../types/domain";
import {
  normalizeSubmission,
  readiness,
  requiredApplicantFields,
} from "../lib/workflow";
import {
  fieldLabels,
  placeholderValues,
  textReviewGuardrails,
} from "./textIntakeReviewCatalog";
import {
  cleanText,
  extractIsoDates,
  normalizeContact,
  normalizePassport,
  normalizedText,
  parseIsoDate,
  phoneDigits,
} from "./textIntakeReviewUtils";
import {
  reviewStatus,
  toCorrectionCandidate,
  uniqueTextReviewFindings,
} from "./textIntakeReviewResult";
import type {
  TextIntakeReviewFinding,
  TextIntakeReviewResult,
} from "./textIntakeReviewTypes";
export {
  textIntakeReviewCodes,
  type BlsApplicantTextFields,
  type BlsAppointmentTextFields,
  type BlsTextQuestionnaireInput,
  type TextIntakeReviewCode,
  type TextIntakeReviewFinding,
  type TextIntakeReviewResult,
  type TextIntakeReviewSeverity,
} from "./textIntakeReviewTypes";

function applicantIdentity(applicant: Applicant, index: number): string {
  return applicant.id ?? `applicant-${index + 1}`;
}

function fieldLabel(fieldKey: keyof Applicant): string {
  return fieldLabels.get(fieldKey) ?? String(fieldKey);
}

function isPlaceholder(value: string): boolean {
  return placeholderValues.has(normalizedText(value));
}

function addFinding(
  findings: TextIntakeReviewFinding[],
  finding: Omit<TextIntakeReviewFinding, "id">,
): void {
  const applicantPart = finding.applicantId ?? "submission";
  const fieldPart = finding.fieldKey
    ? String(finding.fieldKey)
    : (finding.sourceField ?? finding.scope);
  findings.push({
    ...finding,
    id: `${applicantPart}:${fieldPart}:${finding.code}`,
  });
}

function addRequiredFieldFindings(
  submission: Submission,
  applicant: Applicant,
  applicantId: string,
  findings: TextIntakeReviewFinding[],
): void {
  for (const { key, label } of requiredApplicantFields) {
    const value = cleanText(applicant[key]);
    if (!value) {
      addFinding(findings, {
        code: "missing_required_text",
        severity: "blocking",
        scope: "field",
        applicantId,
        applicantName: applicant.name,
        fieldKey: key,
        fieldLabel: label,
        problem: `${label} is missing.`,
        reason:
          "The questionnaire cannot be sent for operator review with an empty required text field.",
        requiredAction: `Fill ${label} for ${applicant.name}.`,
      });
      continue;
    }

    if (isPlaceholder(value)) {
      addFinding(findings, {
        code: "placeholder_text",
        severity: "blocking",
        scope: "field",
        applicantId,
        applicantName: applicant.name,
        fieldKey: key,
        fieldLabel: label,
        problem: `${label} contains a placeholder value.`,
        reason:
          "Placeholder text looks filled but does not give the operator usable applicant data.",
        requiredAction: `Replace the placeholder in ${label} with real data for ${applicant.name}.`,
      });
    }
  }

  if (normalizedText(applicant.country) && normalizedText(submission.country)) {
    if (normalizedText(applicant.country) !== normalizedText(submission.country)) {
      addFinding(findings, {
        code: "submission_applicant_country_mismatch",
        severity: "warning",
        scope: "field",
        applicantId,
        applicantName: applicant.name,
        fieldKey: "country",
        fieldLabel: fieldLabel("country"),
        problem: "Applicant country does not match the case country.",
        reason: "Country mismatch can send the operator to the wrong submission route.",
        requiredAction: "Confirm the correct submission country before handoff.",
      });
    }
  }

  if (normalizedText(applicant.city) && normalizedText(submission.city)) {
    if (normalizedText(applicant.city) !== normalizedText(submission.city)) {
      addFinding(findings, {
        code: "submission_applicant_city_mismatch",
        severity: "warning",
        scope: "field",
        applicantId,
        applicantName: applicant.name,
        fieldKey: "city",
        fieldLabel: fieldLabel("city"),
        problem: "Applicant city does not match the case city.",
        reason: "City mismatch can create appointment or consulate routing mistakes.",
        requiredAction: "Confirm the correct submission city before handoff.",
      });
    }
  }
}

function addFormatAndDateFindings(
  submission: Submission,
  applicant: Applicant,
  applicantId: string,
  findings: TextIntakeReviewFinding[],
): void {
  const nameParts = cleanText(applicant.name).split(/\s+/).filter(Boolean);
  if (nameParts.length < 2) {
    addFinding(findings, {
      code: "name_too_short",
      severity: "warning",
      scope: "field",
      applicantId,
      applicantName: applicant.name,
      fieldKey: "name",
      fieldLabel: fieldLabel("name"),
      problem: "Applicant name looks incomplete.",
      reason: "A one-word name is hard for the operator to compare with passport data.",
      requiredAction:
        "Confirm the full applicant name exactly as it appears in the passport.",
    });
  }

  const email = cleanText(applicant.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    addFinding(findings, {
      code: "invalid_email",
      severity: "blocking",
      scope: "field",
      applicantId,
      applicantName: applicant.name,
      fieldKey: "email",
      fieldLabel: fieldLabel("email"),
      problem: "Email format is invalid.",
      reason:
        "The operator cannot reliably contact or match the applicant with an invalid email.",
      requiredAction:
        "Enter a valid email address or confirm the correct contact channel.",
    });
  }

  const phone = cleanText(applicant.phone);
  if (phone && phoneDigits(phone).length < 10) {
    addFinding(findings, {
      code: "weak_phone",
      severity: "blocking",
      scope: "field",
      applicantId,
      applicantName: applicant.name,
      fieldKey: "phone",
      fieldLabel: fieldLabel("phone"),
      problem: "Phone number has too few digits.",
      reason: "Short phone values usually indicate an incomplete contact field.",
      requiredAction: "Enter the full phone number with country or city code.",
    });
  }

  const birthDate = parseIsoDate(applicant.birthDate);
  const today = new Date();
  if (applicant.birthDate && !birthDate) {
    addFinding(findings, {
      code: "invalid_birth_date",
      severity: "blocking",
      scope: "field",
      applicantId,
      applicantName: applicant.name,
      fieldKey: "birthDate",
      fieldLabel: fieldLabel("birthDate"),
      problem: "Birth date is not a valid ISO date.",
      reason: "Date fields must be machine-checkable before the case is reviewed.",
      requiredAction: "Use YYYY-MM-DD format for birth date.",
    });
  } else if (birthDate && birthDate > today) {
    addFinding(findings, {
      code: "birth_date_in_future",
      severity: "blocking",
      scope: "field",
      applicantId,
      applicantName: applicant.name,
      fieldKey: "birthDate",
      fieldLabel: fieldLabel("birthDate"),
      problem: "Birth date is in the future.",
      reason: "Future birth dates indicate a data-entry error.",
      requiredAction: "Correct the birth date before handoff.",
    });
  }

  const passportIssued = parseIsoDate(applicant.passportIssuedAt);
  const passportExpires = parseIsoDate(applicant.passportExpiresAt);
  if (passportIssued && passportExpires && passportIssued > passportExpires) {
    addFinding(findings, {
      code: "passport_issued_after_expiry",
      severity: "blocking",
      scope: "field",
      applicantId,
      applicantName: applicant.name,
      fieldKey: "passportIssuedAt",
      fieldLabel: fieldLabel("passportIssuedAt"),
      problem: "Passport issue date is after the passport expiry date.",
      reason: "The passport date range is internally inconsistent.",
      requiredAction: "Correct passport issue and expiry dates.",
    });
  }

  const travelDate = parseIsoDate(submission.travelDate);
  if (passportExpires && travelDate && passportExpires < travelDate) {
    addFinding(findings, {
      code: "passport_expired_before_travel",
      severity: "blocking",
      scope: "field",
      applicantId,
      applicantName: applicant.name,
      fieldKey: "passportExpiresAt",
      fieldLabel: fieldLabel("passportExpiresAt"),
      problem: "Passport expires before the case travel date.",
      reason: "Expired passport dates can block operator handoff or trigger a return.",
      requiredAction: "Confirm passport validity or update the travel/passport dates.",
    });
  }

  const tripDates = extractIsoDates(applicant.tripDates);
  if (cleanText(applicant.tripDates) && tripDates.length === 0) {
    addFinding(findings, {
      code: "trip_dates_not_machine_readable",
      severity: "warning",
      scope: "field",
      applicantId,
      applicantName: applicant.name,
      fieldKey: "tripDates",
      fieldLabel: fieldLabel("tripDates"),
      problem: "Trip dates are not machine-readable.",
      reason:
        "The reviewer can only compare travel dates when at least one YYYY-MM-DD date is present.",
      requiredAction:
        "Enter trip dates with ISO dates, for example 2026-08-20 - 2026-08-30.",
    });
  } else if (travelDate && tripDates.length >= 2) {
    const [start, end] = [...tripDates].sort((a, b) => a.getTime() - b.getTime());
    if (travelDate < start || travelDate > end) {
      addFinding(findings, {
        code: "travel_date_outside_trip_dates",
        severity: "blocking",
        scope: "field",
        applicantId,
        applicantName: applicant.name,
        fieldKey: "tripDates",
        fieldLabel: fieldLabel("tripDates"),
        problem: "Case travel date is outside the applicant trip date range.",
        reason: "The case-level travel date and applicant trip dates disagree.",
        requiredAction:
          "Align the case travel date and applicant trip dates before review.",
      });
    }
  }
}

function addCrossApplicantFindings(
  submission: Submission,
  findings: TextIntakeReviewFinding[],
): void {
  const passportOwners = new Map<string, Applicant[]>();
  const emailOwners = new Map<string, Applicant[]>();
  const phoneOwners = new Map<string, Applicant[]>();

  for (const applicant of submission.applicants) {
    const passport = normalizePassport(applicant.passport);
    if (passport) {
      passportOwners.set(passport, [
        ...(passportOwners.get(passport) ?? []),
        applicant,
      ]);
    }

    const email = normalizeContact(cleanText(applicant.email));
    if (email) {
      emailOwners.set(email, [...(emailOwners.get(email) ?? []), applicant]);
    }

    const phone = phoneDigits(cleanText(applicant.phone));
    if (phone) {
      phoneOwners.set(phone, [...(phoneOwners.get(phone) ?? []), applicant]);
    }
  }

  for (const owners of passportOwners.values()) {
    if (owners.length < 2) continue;
    const names = owners.map((owner) => owner.name).join(", ");
    addFinding(findings, {
      code: "duplicate_passport",
      severity: "blocking",
      scope: "submission",
      relatedApplicantNames: owners.map((owner) => owner.name),
      problem: "Two or more applicants use the same passport number.",
      reason: "Duplicate passport numbers usually indicate copied applicant data.",
      requiredAction: `Check passport numbers for: ${names}.`,
    });
  }

  for (const [fieldKey, ownerGroups] of [
    ["email", emailOwners.values()],
    ["phone", phoneOwners.values()],
  ] as const) {
    for (const owners of ownerGroups) {
      if (owners.length < 2) continue;
      const names = owners.map((owner) => owner.name).join(", ");
      addFinding(findings, {
        code: "shared_contact_requires_review",
        severity: submission.type === "family" ? "warning" : "blocking",
        scope: "field",
        fieldKey,
        fieldLabel: fieldLabel(fieldKey),
        relatedApplicantNames: owners.map((owner) => owner.name),
        problem: "Multiple applicants share the same contact value.",
        reason:
          submission.type === "family"
            ? "Shared family contacts can be valid, but the agent should confirm they are intentional."
            : "Shared contacts in a single-applicant or unrelated case can indicate copied data.",
        requiredAction: `Confirm shared contact data for: ${names}.`,
      });
    }
  }

  if (submission.type === "family") {
    for (const applicant of submission.applicants) {
      if (applicant.suggestedRole && !applicant.roleConfirmed) {
        addFinding(findings, {
          code: "family_role_unconfirmed",
          severity: "warning",
          scope: "applicant",
          applicantId: applicant.id,
          applicantName: applicant.name,
          fieldKey: "role",
          fieldLabel: "Роль",
          problem: "Family role suggestion is not confirmed.",
          reason: "AI family analysis is advisory and must be confirmed manually.",
          requiredAction: `Confirm or dismiss the suggested role for ${applicant.name}.`,
        });
      }
    }
  }
}

export { reviewBlsTextQuestionnaire } from "./textIntakeBlsReviewer";

export function reviewTextIntake(submission: Submission): TextIntakeReviewResult {
  const normalized = normalizeSubmission(submission);
  const findings: TextIntakeReviewFinding[] = [];

  normalized.applicants.forEach((applicant, index) => {
    const applicantId = applicantIdentity(applicant, index);
    addRequiredFieldFindings(normalized, applicant, applicantId, findings);
    addFormatAndDateFindings(normalized, applicant, applicantId, findings);
  });
  addCrossApplicantFindings(normalized, findings);

  const uniqueFindings = uniqueTextReviewFindings(findings);

  return {
    status: reviewStatus(uniqueFindings),
    readiness: readiness(normalized),
    reviewedApplicants: normalized.applicants.length,
    reviewedFields: normalized.applicants.length * requiredApplicantFields.length,
    findings: uniqueFindings,
    correctionCandidates: uniqueFindings.map(toCorrectionCandidate),
    guardrails: textReviewGuardrails,
  };
}
