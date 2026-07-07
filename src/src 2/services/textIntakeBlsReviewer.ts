import {
  blsApplicantFields,
  blsAppointmentFields,
  placeholderValues,
  textReviewGuardrails,
} from "./textIntakeReviewCatalog";
import {
  addMonths,
  ageAt,
  canonicalSubmissionCity,
  cleanText,
  containsCyrillic,
  normalizeContact,
  normalizedComparableText,
  normalizePassport,
  normalizedText,
  parseDmyDate,
  phoneDigits,
  yearsBetween,
} from "./textIntakeReviewUtils";
import {
  reviewStatus,
  toCorrectionCandidate,
  uniqueTextReviewFindings,
} from "./textIntakeReviewResult";
import type {
  BlsApplicantTextFields,
  BlsAppointmentTextFields,
  BlsTextQuestionnaireInput,
  TextIntakeReviewFinding,
  TextIntakeReviewResult,
} from "./textIntakeReviewTypes";

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
function blsApplicantIdentity(
  applicant: BlsApplicantTextFields,
  index: number,
): string {
  return applicant.id ?? `applicant-${index + 1}`;
}

function blsApplicantName(applicant: BlsApplicantTextFields, index: number): string {
  const name = [applicant.first_name, applicant.last_name]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
  return cleanText(applicant.label) || name || `Applicant #${index + 1}`;
}

function addBlsFieldFinding(
  findings: TextIntakeReviewFinding[],
  finding: Omit<TextIntakeReviewFinding, "id" | "scope"> & {
    sourceField: string;
    scope?: TextIntakeReviewFinding["scope"];
  },
): void {
  addFinding(findings, {
    ...finding,
    scope: finding.scope ?? "field",
  });
}

function addBlsAppointmentFindings(
  appointment: BlsAppointmentTextFields,
  findings: TextIntakeReviewFinding[],
): void {
  for (const field of blsAppointmentFields) {
    const value = cleanText(appointment[field.key]);
    if (field.required && (!value || isPlaceholder(value))) {
      addBlsFieldFinding(findings, {
        code: value ? "placeholder_text" : "missing_required_text",
        severity: "blocking",
        sourceField: field.key,
        fieldLabel: field.label,
        problem: `${field.label} is missing or not selected.`,
        reason:
          "The appointment block must be complete before the questionnaire is reliable.",
        requiredAction: `Fill ${field.label}.`,
      });
    }

    if (field.date && value && !parseDmyDate(value)) {
      addBlsFieldFinding(findings, {
        code: "invalid_date_format",
        severity: "warning",
        sourceField: field.key,
        fieldLabel: field.label,
        problem: `${field.label} is not a valid DD.MM.YYYY date.`,
        reason: "The appointment date cannot be compared or exported reliably.",
        requiredAction: `Use DD.MM.YYYY format for ${field.label}.`,
      });
    }
  }
}

function addBlsApplicantRequiredFindings(
  applicant: BlsApplicantTextFields,
  applicantIndex: number,
  applicantId: string,
  applicantName: string,
  findings: TextIntakeReviewFinding[],
): void {
  for (const field of blsApplicantFields) {
    const value = cleanText(applicant[field.key]);
    if (field.required && (!value || isPlaceholder(value))) {
      addBlsFieldFinding(findings, {
        code: value ? "placeholder_text" : "missing_required_text",
        severity: "blocking",
        applicantId,
        applicantName,
        sourceField: field.key,
        fieldLabel: field.label,
        problem: `${field.label} is missing or not selected.`,
        reason: "This BLS questionnaire field is marked as required in the form.",
        requiredAction: `Fill ${field.label} for ${applicantName}.`,
      });
    }

    if (field.date && value && !parseDmyDate(value)) {
      addBlsFieldFinding(findings, {
        code: "invalid_date_format",
        severity: "blocking",
        applicantId,
        applicantName,
        sourceField: field.key,
        fieldLabel: field.label,
        problem: `${field.label} is not a valid DD.MM.YYYY date.`,
        reason:
          "BLS date fields in this form use DD.MM.YYYY and must be machine-checkable.",
        requiredAction: `Use DD.MM.YYYY format for ${field.label}.`,
      });
    }

    if (field.email && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      addBlsFieldFinding(findings, {
        code: "invalid_email",
        severity: "blocking",
        applicantId,
        applicantName,
        sourceField: field.key,
        fieldLabel: field.label,
        problem: `${field.label} format is invalid.`,
        reason: "The operator cannot reliably use an invalid email value.",
        requiredAction: `Correct ${field.label} for ${applicantName}.`,
      });
    }

    if (field.phone && value && phoneDigits(value).length < 10) {
      addBlsFieldFinding(findings, {
        code: "weak_phone",
        severity: "blocking",
        applicantId,
        applicantName,
        sourceField: field.key,
        fieldLabel: field.label,
        problem: `${field.label} has too few digits.`,
        reason: "Short phone values usually indicate incomplete contact data.",
        requiredAction: `Enter the full ${field.label.toLowerCase()} for ${applicantName}.`,
      });
    }

    if (field.passport && value && normalizePassport(value).length < 6) {
      addBlsFieldFinding(findings, {
        code: "weak_passport_number",
        severity: "blocking",
        applicantId,
        applicantName,
        sourceField: field.key,
        fieldLabel: field.label,
        problem: `${field.label} is too short to be a reliable passport number.`,
        reason: "Short passport values usually indicate a partial copy or typo.",
        requiredAction: `Check the full passport number for ${applicantName}.`,
      });
    }

    if (
      field.passport &&
      value &&
      normalizedText(applicant.current_nationality) === "russian federation" &&
      !/^\d{9}$/.test(normalizePassport(value))
    ) {
      addBlsFieldFinding(findings, {
        code: "passport_number_unexpected_format",
        severity: "warning",
        applicantId,
        applicantName,
        sourceField: field.key,
        fieldLabel: field.label,
        problem:
          "Passport No does not look like the usual 9-digit Russian international passport number.",
        reason:
          "Russian foreign passport numbers are commonly entered as a 2-digit series plus 7-digit number. Different formats can be valid, but this should be confirmed.",
        requiredAction: `Confirm Passport No from the foreign passport for ${applicantName}.`,
      });
    }

    if (field.latin && value && containsCyrillic(value)) {
      addBlsFieldFinding(findings, {
        code: "latin_text_expected",
        severity: "warning",
        applicantId,
        applicantName,
        sourceField: field.key,
        fieldLabel: field.label,
        problem: `${field.label} contains Cyrillic characters.`,
        reason:
          "BLS passport-name fields are usually entered in Latin characters from the passport.",
        requiredAction: `Confirm transliteration for ${field.label} on ${applicantName}.`,
      });
    }
  }

  if (normalizedText(applicant.occupation) === "other") {
    const occupationOther = cleanText(applicant.occupation_other);
    if (!occupationOther || isPlaceholder(occupationOther)) {
      addBlsFieldFinding(findings, {
        code: "missing_conditional_text",
        severity: "blocking",
        applicantId,
        applicantName,
        sourceField: "occupation_other",
        fieldLabel: "Occupation (specify)",
        problem: "Occupation is OTHER but the occupation detail is empty.",
        reason: "The operator needs the specific occupation when OTHER is selected.",
        requiredAction: `Specify occupation for ${applicantName}.`,
      });
    }
  }

  const address = cleanText(applicant.address_line1);
  if (address && (address.length < 8 || !/\d/.test(address))) {
    addBlsFieldFinding(findings, {
      code: "home_address_incomplete",
      severity: "warning",
      applicantId,
      applicantName,
      sourceField: "address_line1",
      fieldLabel: "Home Address Line 1",
      problem: "Home address looks too short or lacks a house/building number.",
      reason:
        "The home address should be specific enough for an operator to compare against residence/registration documents.",
      requiredAction: `Confirm street, house/building and apartment details for ${applicantName}.`,
    });
  }

  if (applicantIndex > 0) {
    const relation = cleanText(applicant.relation_to_primary);
    if (!relation || isPlaceholder(relation)) {
      addBlsFieldFinding(findings, {
        code: "missing_required_text",
        severity: "blocking",
        applicantId,
        applicantName,
        sourceField: "relation_to_primary",
        fieldLabel: "Relation to primary applicant",
        problem: "Relation to primary applicant is missing.",
        reason:
          "Family BLS questionnaires include this field for secondary applicants.",
        requiredAction: `Fill relation to primary applicant for ${applicantName}.`,
      });
    }
  }
}

function addBlsApplicantConsistencyFindings(
  appointment: BlsAppointmentTextFields,
  applicant: BlsApplicantTextFields,
  applicantId: string,
  applicantName: string,
  findings: TextIntakeReviewFinding[],
): void {
  const birthDate = parseDmyDate(applicant.birth_date);
  const today = new Date();
  if (birthDate && birthDate > today) {
    addBlsFieldFinding(findings, {
      code: "birth_date_in_future",
      severity: "blocking",
      applicantId,
      applicantName,
      sourceField: "birth_date",
      fieldLabel: "Date of Birth",
      problem: "Date of Birth is in the future.",
      reason: "Future birth dates indicate a data-entry error.",
      requiredAction: `Correct Date of Birth for ${applicantName}.`,
    });
  }

  const passportIssued = parseDmyDate(applicant.passport_issued_at);
  const passportExpires = parseDmyDate(applicant.passport_expires_at);
  const travelDate = parseDmyDate(applicant.travel_date);
  const arrivalDate = parseDmyDate(applicant.arrival_date);
  const departureDate = parseDmyDate(applicant.departure_date);

  if (passportIssued && passportExpires && passportIssued > passportExpires) {
    addBlsFieldFinding(findings, {
      code: "passport_issued_after_expiry",
      severity: "blocking",
      applicantId,
      applicantName,
      sourceField: "passport_issued_at",
      fieldLabel: "Passport Issue Date",
      problem: "Passport Issue Date is after Passport Expiry Date.",
      reason: "The passport date range is internally inconsistent.",
      requiredAction: `Correct passport dates for ${applicantName}.`,
    });
  }

  if (passportExpires && travelDate && passportExpires < travelDate) {
    addBlsFieldFinding(findings, {
      code: "passport_expired_before_travel",
      severity: "blocking",
      applicantId,
      applicantName,
      sourceField: "passport_expires_at",
      fieldLabel: "Passport Expiry Date",
      problem: "Passport expires before Travel Date.",
      reason: "The passport validity and travel date conflict.",
      requiredAction: `Confirm passport validity or travel date for ${applicantName}.`,
    });
  }

  if (passportExpires && departureDate) {
    const minimumExpiry = addMonths(departureDate, 3);
    if (passportExpires < minimumExpiry) {
      addBlsFieldFinding(findings, {
        code: "passport_validity_too_short_after_departure",
        severity: "blocking",
        applicantId,
        applicantName,
        sourceField: "passport_expires_at",
        fieldLabel: "Passport Expiry Date",
        problem:
          "Passport expires less than three months after the intended departure date.",
        reason:
          "Schengen passport preflight commonly requires validity beyond the planned exit date; this needs operator confirmation before handoff.",
        requiredAction: `Confirm passport validity window for ${applicantName}.`,
      });
    }
  }

  if (
    passportIssued &&
    passportExpires &&
    passportExpires > passportIssued &&
    yearsBetween(passportIssued, passportExpires) > 10.15
  ) {
    addBlsFieldFinding(findings, {
      code: "passport_validity_period_unexpected",
      severity: "warning",
      applicantId,
      applicantName,
      sourceField: "passport_expires_at",
      fieldLabel: "Passport Expiry Date",
      problem: "Passport validity period is longer than the usual 10-year maximum.",
      reason:
        "Russian foreign passports are commonly valid for 5 or 10 years; a longer period usually means a date typo.",
      requiredAction: `Check issue and expiry dates from the passport for ${applicantName}.`,
    });
  }

  if (arrivalDate && departureDate && arrivalDate > departureDate) {
    addBlsFieldFinding(findings, {
      code: "date_order_inconsistent",
      severity: "blocking",
      applicantId,
      applicantName,
      sourceField: "arrival_date",
      fieldLabel: "Intended Date of Arrival",
      problem: "Arrival date is after departure date.",
      reason: "Travel date order is impossible.",
      requiredAction: `Correct arrival and departure dates for ${applicantName}.`,
    });
  }

  if (travelDate && arrivalDate && departureDate) {
    if (travelDate < arrivalDate || travelDate > departureDate) {
      addBlsFieldFinding(findings, {
        code: "travel_date_outside_trip_dates",
        severity: "blocking",
        applicantId,
        applicantName,
        sourceField: "travel_date",
        fieldLabel: "Travel Date",
        problem: "Travel Date is outside the arrival/departure range.",
        reason: "The applicant travel date and trip interval disagree.",
        requiredAction: `Align Travel Date, Arrival Date and Departure Date for ${applicantName}.`,
      });
    }
  }

  const scheduleDates = [
    appointment.schedule_date1,
    appointment.schedule_date2,
    appointment.schedule_date3,
  ].flatMap((value) => {
    const parsed = parseDmyDate(value);
    return parsed ? [parsed] : [];
  });
  if (arrivalDate && scheduleDates.some((scheduleDate) => scheduleDate > arrivalDate)) {
    addBlsFieldFinding(findings, {
      code: "appointment_after_travel_date",
      severity: "warning",
      applicantId,
      applicantName,
      sourceField: "schedule_date1",
      fieldLabel: "Желаемая дата записи",
      problem: "One preferred appointment date is after the intended arrival date.",
      reason:
        "Appointment dates should normally be before travel; this may indicate shifted travel or appointment data.",
      requiredAction: `Confirm appointment preferences against travel dates for ${applicantName}.`,
    });
  }

  const durationText = cleanText(applicant.stay_duration);
  if (durationText && !/^\d+$/.test(durationText)) {
    addBlsFieldFinding(findings, {
      code: "non_numeric_duration",
      severity: "blocking",
      applicantId,
      applicantName,
      sourceField: "stay_duration",
      fieldLabel: "Stay Duration in Days",
      problem: "Stay Duration in Days is not numeric.",
      reason: "Duration must be a number before it can be compared with trip dates.",
      requiredAction: `Enter numeric stay duration for ${applicantName}.`,
    });
  } else if (arrivalDate && departureDate && durationText) {
    const duration = Number(durationText);
    const days = Math.round(
      (departureDate.getTime() - arrivalDate.getTime()) / 86_400_000,
    );
    if (Number.isFinite(duration) && Math.abs(duration - days) > 1) {
      addBlsFieldFinding(findings, {
        code: "duration_dates_mismatch",
        severity: "warning",
        applicantId,
        applicantName,
        sourceField: "stay_duration",
        fieldLabel: "Stay Duration in Days",
        problem: "Stay duration does not match arrival/departure dates.",
        reason:
          "This may be valid depending on counting rules, but it should be checked.",
        requiredAction: `Confirm stay duration against trip dates for ${applicantName}.`,
      });
    }
  }

  if (
    normalizedText(applicant.host_country) &&
    normalizedText(applicant.host_country) !== "spain"
  ) {
    addBlsFieldFinding(findings, {
      code: "host_country_unexpected",
      severity: "warning",
      applicantId,
      applicantName,
      sourceField: "host_country",
      fieldLabel: "Host Country",
      problem: "Host country is not Spain.",
      reason:
        "This may be intentional, but for a Spain BLS route it deserves manual confirmation.",
      requiredAction: `Confirm host country for ${applicantName}.`,
    });
  }

  if (normalizedText(applicant.host_country) === "spain") {
    const hostPostal = cleanText(applicant.host_postal);
    if (hostPostal && !/^\d{5}$/.test(hostPostal)) {
      addBlsFieldFinding(findings, {
        code: "spanish_host_postal_invalid",
        severity: "warning",
        applicantId,
        applicantName,
        sourceField: "host_postal",
        fieldLabel: "Host Postal Code",
        problem: "Spanish host postal code does not look like 5 digits.",
        reason:
          "Spanish accommodation postal codes are normally 5 digits; a different value should be checked.",
        requiredAction: `Confirm host postal code for ${applicantName}.`,
      });
    }

    const hostPhone = phoneDigits(cleanText(applicant.host_phone));
    const looksSpanishPhone =
      hostPhone.length === 9 || (hostPhone.startsWith("34") && hostPhone.length === 11);
    if (hostPhone && !looksSpanishPhone) {
      addBlsFieldFinding(findings, {
        code: "spanish_host_phone_unexpected",
        severity: "warning",
        applicantId,
        applicantName,
        sourceField: "host_phone",
        fieldLabel: "Host Contact Number",
        problem:
          "Spanish host phone does not look like a local 9-digit number or +34 number.",
        reason:
          "Accommodation contact numbers can vary, but this value should be easy for an operator to verify.",
        requiredAction: `Confirm host phone number for ${applicantName}.`,
      });
    }
  }

  const submissionCity = canonicalSubmissionCity(appointment.city);
  const residenceCity = canonicalSubmissionCity(applicant.addr_city);
  if (submissionCity && residenceCity && submissionCity !== residenceCity) {
    addBlsFieldFinding(findings, {
      code: "residence_submission_city_mismatch",
      severity: "warning",
      applicantId,
      applicantName,
      sourceField: "addr_city",
      fieldLabel: "City",
      problem: "Residence city differs from the selected submission city.",
      reason:
        "This can be valid, but the agent should confirm residence/registration and the chosen BLS center before handoff.",
      requiredAction: `Confirm residence/registration route for ${applicantName}.`,
    });
  }

  const occupation = normalizedComparableText(applicant.occupation);
  if (occupation === "minor" && birthDate && (arrivalDate || travelDate)) {
    const referenceDate = arrivalDate ?? travelDate;
    if (referenceDate && ageAt(birthDate, referenceDate) >= 18) {
      addBlsFieldFinding(findings, {
        code: "minor_occupation_age_mismatch",
        severity: "warning",
        applicantId,
        applicantName,
        sourceField: "occupation",
        fieldLabel: "Occupation",
        problem: "Occupation is MINOR but applicant is 18 or older at travel date.",
        reason:
          "Age and occupation status may have been copied from another applicant.",
        requiredAction: `Confirm occupation status for ${applicantName}.`,
      });
    }
  }

  const applicantPhone = phoneDigits(cleanText(applicant.phone));
  const workPhone = phoneDigits(cleanText(applicant.work_phone));
  if (applicantPhone && workPhone && applicantPhone === workPhone) {
    addBlsFieldFinding(findings, {
      code: "employer_contact_matches_applicant",
      severity: "warning",
      applicantId,
      applicantName,
      sourceField: "work_phone",
      fieldLabel: "Employer Contact Number",
      problem: "Employer contact number matches applicant contact number.",
      reason:
        "This can be valid for self-employed applicants, but often indicates copied contact data.",
      requiredAction: `Confirm employer contact number for ${applicantName}.`,
    });
  }

  if (
    occupation !== "selfemployed" &&
    normalizedComparableText(applicant.address_line1) &&
    normalizedComparableText(applicant.address_line1) ===
      normalizedComparableText(applicant.work_address)
  ) {
    addBlsFieldFinding(findings, {
      code: "employer_address_matches_home",
      severity: "warning",
      applicantId,
      applicantName,
      sourceField: "work_address",
      fieldLabel: "Employer Address",
      problem: "Employer address matches home address.",
      reason:
        "This may be valid, but for non self-employed applicants it often means the work address was copied from residence data.",
      requiredAction: `Confirm employer address for ${applicantName}.`,
    });
  }
}

function addBlsCrossApplicantFindings(
  applicants: BlsApplicantTextFields[],
  findings: TextIntakeReviewFinding[],
): void {
  const passportOwners = new Map<string, string[]>();
  const emailOwners = new Map<string, string[]>();
  const phoneOwners = new Map<string, string[]>();
  const tripOwners = new Map<string, string[]>();

  applicants.forEach((applicant, index) => {
    const name = blsApplicantName(applicant, index);
    const passport = normalizePassport(cleanText(applicant.passport_number));
    const email = normalizeContact(cleanText(applicant.email));
    const phone = phoneDigits(cleanText(applicant.phone));
    const arrivalDate = parseDmyDate(applicant.arrival_date);
    const departureDate = parseDmyDate(applicant.departure_date);

    if (passport)
      passportOwners.set(passport, [...(passportOwners.get(passport) ?? []), name]);
    if (email) emailOwners.set(email, [...(emailOwners.get(email) ?? []), name]);
    if (phone) phoneOwners.set(phone, [...(phoneOwners.get(phone) ?? []), name]);
    if (arrivalDate && departureDate) {
      const signature = `${arrivalDate.toISOString().slice(0, 10)}:${departureDate
        .toISOString()
        .slice(0, 10)}`;
      tripOwners.set(signature, [...(tripOwners.get(signature) ?? []), name]);
    }
  });

  for (const names of passportOwners.values()) {
    if (names.length < 2) continue;
    addBlsFieldFinding(findings, {
      code: "duplicate_passport",
      severity: "blocking",
      scope: "submission",
      sourceField: "passport_number",
      fieldLabel: "Passport No",
      relatedApplicantNames: names,
      problem: "Two or more BLS applicants use the same passport number.",
      reason: "Duplicate passport numbers usually indicate copied applicant data.",
      requiredAction: `Check passport numbers for: ${names.join(", ")}.`,
    });
  }

  for (const [sourceField, groups] of [
    ["email", emailOwners.values()],
    ["phone", phoneOwners.values()],
  ] as const) {
    for (const names of groups) {
      if (names.length < 2) continue;
      addBlsFieldFinding(findings, {
        code: "shared_contact_requires_review",
        severity: "warning",
        scope: "submission",
        sourceField,
        fieldLabel: sourceField === "email" ? "Email" : "Contact Number",
        relatedApplicantNames: names,
        problem: "Multiple BLS applicants share the same contact value.",
        reason: "Shared contacts can be valid for families, but should be intentional.",
        requiredAction: `Confirm shared contact data for: ${names.join(", ")}.`,
      });
    }
  }

  if (applicants.length > 1 && tripOwners.size > 1) {
    const groups = Array.from(tripOwners.values())
      .map((names) => names.join(", "))
      .join(" / ");
    addBlsFieldFinding(findings, {
      code: "family_trip_mismatch",
      severity: "warning",
      scope: "submission",
      sourceField: "arrival_date",
      fieldLabel: "Travel dates",
      relatedApplicantNames: Array.from(
        new Set(Array.from(tripOwners.values()).flat()),
      ),
      problem: "Family applicants have different arrival/departure date ranges.",
      reason:
        "Family members can travel separately, but copied or shifted dates are a common intake error.",
      requiredAction: `Confirm family travel dates for: ${groups}.`,
    });
  }
}

function calculateBlsReadiness(input: BlsTextQuestionnaireInput): number {
  const appointmentRequired = blsAppointmentFields.filter((field) => field.required);
  const applicantRequired = blsApplicantFields.filter((field) => field.required);
  const total =
    appointmentRequired.length +
    input.applicants.length * applicantRequired.length +
    Math.max(0, input.applicants.length - 1);
  if (total === 0) return 0;

  let filled = appointmentRequired.filter((field) => {
    const value = cleanText(input.appointment[field.key]);
    return value && !isPlaceholder(value);
  }).length;

  for (const applicant of input.applicants) {
    filled += applicantRequired.filter((field) => {
      const value = cleanText(applicant[field.key]);
      return value && !isPlaceholder(value);
    }).length;
  }
  for (const applicant of input.applicants.slice(1)) {
    const relation = cleanText(applicant.relation_to_primary);
    if (relation && !isPlaceholder(relation)) filled += 1;
  }

  return Math.round((filled / total) * 100);
}

function reviewedBlsFieldCount(input: BlsTextQuestionnaireInput): number {
  return (
    blsAppointmentFields.length +
    input.applicants.reduce(
      (total, _applicant, index) =>
        total + blsApplicantFields.length - (index === 0 ? 1 : 0),
      0,
    )
  );
}

export function reviewBlsTextQuestionnaire(
  input: BlsTextQuestionnaireInput,
): TextIntakeReviewResult {
  const findings: TextIntakeReviewFinding[] = [];
  addBlsAppointmentFindings(input.appointment, findings);

  input.applicants.forEach((applicant, index) => {
    const applicantId = blsApplicantIdentity(applicant, index);
    const applicantName = blsApplicantName(applicant, index);
    addBlsApplicantRequiredFindings(
      applicant,
      index,
      applicantId,
      applicantName,
      findings,
    );
    addBlsApplicantConsistencyFindings(
      input.appointment,
      applicant,
      applicantId,
      applicantName,
      findings,
    );
  });
  addBlsCrossApplicantFindings(input.applicants, findings);

  const uniqueFindings = uniqueTextReviewFindings(findings);

  return {
    status: reviewStatus(uniqueFindings),
    readiness: calculateBlsReadiness(input),
    reviewedApplicants: input.applicants.length,
    reviewedFields: reviewedBlsFieldCount(input),
    findings: uniqueFindings,
    correctionCandidates: uniqueFindings.map(toCorrectionCandidate),
    guardrails: textReviewGuardrails,
  };
}
