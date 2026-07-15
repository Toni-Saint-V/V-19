const requiredFieldIds = Object.freeze([
  "birth-date",
  "contact-number",
  "email",
  "first-name",
  "passport-no",
  "surname",
]);

export function productionCohortExportDataGate({
  answers,
  applicants,
  submissions,
}) {
  const findings = [];
  const submissionById = new Map(submissions.map((row) => [row.id, row]));
  const applicantById = new Map(applicants.map((row) => [row.id, row]));
  const answerByKey = new Map();

  for (const answer of answers) {
    const applicant = applicantById.get(answer.applicant_id);
    if (!applicant || applicant.submission_id !== answer.submission_id) {
      findings.push({
        applicantId: answer.applicant_id,
        code: "answer_ownership_mismatch",
        submissionId: answer.submission_id,
      });
      continue;
    }

    const key = answerKey(answer);
    if (answerByKey.has(key)) {
      findings.push({
        applicantId: answer.applicant_id,
        code: "duplicate_answer_key",
        fieldId: answer.field_id,
        submissionId: answer.submission_id,
      });
      continue;
    }
    answerByKey.set(key, answer);
  }

  const exportRows = applicants.map((applicant) => {
    const submission = submissionById.get(applicant.submission_id);
    if (!submission) {
      findings.push({
        applicantId: applicant.id,
        code: "applicant_without_submission",
        submissionId: applicant.submission_id,
      });
    }

    const field = (fieldId) =>
      answerValue(
        answerByKey.get(
          `${applicant.submission_id}\u0000${applicant.id}\u0000${fieldId}`,
        )?.value,
      );

    for (const fieldId of requiredFieldIds) {
      if (!field(fieldId)) {
        findings.push({
          applicantId: applicant.id,
          code: "missing_export_field",
          fieldId,
          submissionId: applicant.submission_id,
        });
      }
    }

    const passport = normalizePassport(field("passport-no"));
    const phone = normalizeApplicantPhone(field("contact-number"));
    const email = normalizeEmail(field("email"));
    const birthDate = normalizeDate(field("birth-date"));
    addProjectionMismatchFinding({
      applicant,
      canonical: passport,
      code: "applicant_projection_passport_mismatch",
      findings,
      normalize: normalizePassport,
      projectionField: "passport_number",
    });
    addProjectionMismatchFinding({
      applicant,
      canonical: birthDate,
      code: "applicant_projection_birth_date_mismatch",
      findings,
      normalize: normalizeDate,
      projectionField: "birth_date",
    });
    addProjectionMismatchFinding({
      applicant,
      canonical: email,
      code: "applicant_projection_email_mismatch",
      findings,
      normalize: normalizeEmail,
      projectionField: "email",
    });
    addProjectionMismatchFinding({
      applicant,
      canonical: phone,
      code: "applicant_projection_phone_mismatch",
      findings,
      normalize: normalizeApplicantPhone,
      projectionField: "phone",
    });
    if (passport && !/^\d{8,9}$/.test(passport)) {
      findings.push({
        applicantId: applicant.id,
        code: "invalid_passport",
        submissionId: applicant.submission_id,
      });
    }
    if (phone && !/^\d{10}$/.test(phone)) {
      findings.push({
        applicantId: applicant.id,
        code: "invalid_applicant_phone",
        submissionId: applicant.submission_id,
      });
    }

    const firstName = normalizeIdentityText(field("first-name"));
    const surname = normalizeIdentityText(field("surname"));

    return {
      applicantId: applicant.id,
      email,
      identity:
        birthDate && firstName && surname
          ? `${surname}\u0000${firstName}\u0000${birthDate}`
          : "",
      passport,
      phone,
      submissionId: applicant.submission_id,
      submissionType: submission?.type,
    };
  });

  addDuplicateFindings(findings, exportRows, "passport", "duplicate_passport");
  addDuplicateFindings(findings, exportRows, "identity", "duplicate_identity");

  for (const submission of submissions) {
    if (submission.type !== "family") continue;
    const familyRows = exportRows.filter(
      (row) => row.submissionId === submission.id,
    );
    if (familyRows.length < 2) continue;

    const emails = new Set(familyRows.map((row) => row.email).filter(Boolean));
    const phones = new Set(familyRows.map((row) => row.phone).filter(Boolean));
    if (
      emails.size !== 1 ||
      phones.size !== 1 ||
      familyRows.some((row) => !row.email || !row.phone)
    ) {
      findings.push({
        code: "family_contact_mismatch",
        submissionId: submission.id,
      });
    }
  }

  return {
    findings,
    ok: findings.length === 0,
  };
}

function answerKey(answer) {
  return `${answer.submission_id}\u0000${answer.applicant_id}\u0000${answer.field_id}`;
}

function addProjectionMismatchFinding({
  applicant,
  canonical,
  code,
  findings,
  normalize,
  projectionField,
}) {
  if (!Object.hasOwn(applicant, projectionField)) return;
  const projected = normalize(answerValue(applicant[projectionField]));
  if (canonical === projected) return;
  findings.push({
    applicantId: applicant.id,
    code,
    submissionId: applicant.submission_id,
  });
}

function answerValue(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

function normalizeApplicantPhone(value) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return digits.slice(1);
  }
  return digits;
}

function normalizeDate(value) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dotted = /^(\d{2})[.-](\d{2})[.-](\d{4})$/.exec(value);
  if (dotted) return `${dotted[3]}-${dotted[2]}-${dotted[1]}`;
  return value.trim();
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function normalizeIdentityText(value) {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function normalizePassport(value) {
  return value.trim().toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g, "");
}

function addDuplicateFindings(findings, rows, key, code) {
  const rowsByValue = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    const matches = rowsByValue.get(value) ?? [];
    matches.push(row);
    rowsByValue.set(value, matches);
  }

  for (const matches of rowsByValue.values()) {
    if (matches.length < 2) continue;
    findings.push({
      code,
      count: matches.length,
      submissionIds: [...new Set(matches.map((row) => row.submissionId))],
    });
  }
}
