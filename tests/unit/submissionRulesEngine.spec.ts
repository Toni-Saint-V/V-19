import { describe, expect, test } from "vitest";
import {
  appointmentReadinessRuleIds,
  evaluateAppointmentReadiness,
  type AppointmentReadinessApplicantInput,
  type AppointmentReadinessInput,
  type AppointmentReadinessRuleId,
} from "../../src/modules/submissions/submissionRulesEngine";

const forbiddenCopy = new RegExp(
  [
    ["виза", "одобрена"].join(" "),
    ["ша", "нс"].join(""),
    ["вероят", "ность"].join(""),
    ["гаран", "тия"].join(""),
    ["официальная", "проверка"].join(" "),
    ["OCR", "подтвердил"].join(" "),
    ["AI", "решил"].join(" "),
    ["ИИ", "решил"].join(" "),
    ["одобрено", "ИИ"].join(" "),
  ].join("|"),
  "i",
);

function readyApplicant(
  patch: Partial<AppointmentReadinessApplicantInput> = {},
): AppointmentReadinessApplicantInput {
  return {
    applicantId: "applicant-1",
    blankPagesConfirmed: true,
    city: "Москва",
    contactEmailPresent: true,
    contactPhonePresent: true,
    declaredBlankPages: 2,
    dobPresent: true,
    fullNamePresent: true,
    hasPassportScan: true,
    hasSelfie1: true,
    hasSelfie2: true,
    nationalityPresent: true,
    passportExpiryDate: "2027-01-20",
    passportIdentityFieldsReadable: true,
    passportMrzReadable: true,
    selfieQualityStatus: "accepted",
    tripDates: {
      entryDate: "2026-08-01",
      exitDate: "2026-08-15",
    },
    visaType: "tourism",
    ...patch,
  };
}

function readyInput(patch: Partial<AppointmentReadinessInput> = {}) {
  return {
    applicants: [readyApplicant()],
    applicationDate: "2026-02-01",
    appointmentCenter: "BLS Москва",
    city: "Москва",
    jurisdiction: "Москва",
    jurisdictionMatches: true,
    now: "2026-02-01",
    residenceCity: "Москва",
    submissionStatus: "in_progress",
    submissionType: "single",
    supportedVisaTypes: ["tourism", "business"],
    trip: {
      entryDate: "2026-08-01",
      exitDate: "2026-08-15",
    },
    visaType: "tourism",
    ...patch,
  } satisfies AppointmentReadinessInput;
}

function blockerIds(input: AppointmentReadinessInput) {
  return evaluateAppointmentReadiness(input).blockers.map((finding) => finding.ruleId);
}

function expectBlocker(
  input: AppointmentReadinessInput,
  ruleId: AppointmentReadinessRuleId,
) {
  const result = evaluateAppointmentReadiness(input);

  expect(result.ready).toBe(false);
  expect(result.canBookAppointment).toBe(false);
  expect(result.blockers.map((finding) => finding.ruleId)).toContain(ruleId);
}

describe("appointment readiness rules engine", () => {
  test("fully ready single applicant returns ready and can book", () => {
    const result = evaluateAppointmentReadiness(readyInput());

    expect(result).toMatchObject({
      phase: "appointment_readiness",
      ready: true,
      canBookAppointment: true,
      blockers: [],
      infos: [],
    });
    expect(result.evaluatedRuleIds).toEqual([...appointmentReadinessRuleIds]);
  });

  test("missing passport scan blocks appointment readiness", () => {
    expectBlocker(
      readyInput({ applicants: [readyApplicant({ hasPassportScan: false })] }),
      "APPT_PASSPORT_MISSING",
    );
  });

  test("passport scan with unreadable MRZ blocks appointment readiness", () => {
    expectBlocker(
      readyInput({ applicants: [readyApplicant({ passportMrzReadable: false })] }),
      "APPT_PASSPORT_MRZ_UNREADABLE",
    );
  });

  test("expired passport blocks appointment readiness", () => {
    expectBlocker(
      readyInput({ applicants: [readyApplicant({ passportExpiryDate: "2026-01-31" })] }),
      "APPT_PASSPORT_EXPIRED",
    );
  });

  test("passport validity shorter than 3 months after departure blocks", () => {
    expectBlocker(
      readyInput({ applicants: [readyApplicant({ passportExpiryDate: "2026-11-14" })] }),
      "APPT_PASSPORT_VALIDITY_TOO_SHORT",
    );
  });

  test("declared blank pages fewer than 2 blocks", () => {
    expectBlocker(
      readyInput({ applicants: [readyApplicant({ declaredBlankPages: 1 })] }),
      "APPT_PASSPORT_NO_BLANK_PAGES_DECLARED",
    );
  });

  test("unconfirmed blank pages are warning only", () => {
    const result = evaluateAppointmentReadiness(
      readyInput({
        applicants: [
          readyApplicant({
            blankPagesConfirmed: false,
            declaredBlankPages: undefined,
          }),
        ],
      }),
    );

    expect(result.ready).toBe(true);
    expect(result.canBookAppointment).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.warnings.map((finding) => finding.ruleId)).toContain(
      "APPT_PASSPORT_NO_BLANK_PAGES_UNCONFIRMED",
    );
  });

  test("missing selfie slots block appointment readiness", () => {
    const ids = blockerIds(
      readyInput({
        applicants: [readyApplicant({ hasSelfie1: false, hasSelfie2: false })],
      }),
    );

    expect(ids).toContain("APPT_SELFIE_1_MISSING");
    expect(ids).toContain("APPT_SELFIE_2_MISSING");
  });

  test("bad selfie quality blocks appointment readiness", () => {
    expectBlocker(
      readyInput({
        applicants: [readyApplicant({ selfieQualityStatus: "bad" })],
      }),
      "APPT_SELFIE_BAD_QUALITY",
    );
  });

  test("duplicated selfies are warning only by default", () => {
    const result = evaluateAppointmentReadiness(
      readyInput({ applicants: [readyApplicant({ selfiesLookDuplicated: true })] }),
    );

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.warnings.map((finding) => finding.ruleId)).toContain(
      "APPT_SELFIES_LOOK_DUPLICATED",
    );
  });

  test("missing trip dates block appointment readiness", () => {
    expectBlocker(
      readyInput({ trip: { entryDate: "", exitDate: "" } }),
      "APPT_TRIP_DATES_MISSING",
    );
  });

  test("exit before entry blocks appointment readiness", () => {
    expectBlocker(
      readyInput({
        trip: { entryDate: "2026-08-15", exitDate: "2026-08-01" },
      }),
      "APPT_TRIP_DATE_INVALID_RANGE",
    );
  });

  test("application more than 6 months before trip blocks", () => {
    expectBlocker(
      readyInput({ applicationDate: "2026-01-31", now: "2026-01-31" }),
      "APPT_TOO_EARLY_FOR_APPLICATION",
    );
  });

  test("application less than 15 days before trip blocks with admin override policy", () => {
    const result = evaluateAppointmentReadiness(
      readyInput({ applicationDate: "2026-07-20", now: "2026-07-20" }),
    );
    const finding = result.blockers.find(
      (item) => item.ruleId === "APPT_TOO_LATE_FOR_APPLICATION",
    );

    expect(finding).toBeDefined();
    expect(finding?.overridePolicy).toContain("администратор");
    expect(result.ready).toBe(false);
  });

  test("missing visa type blocks appointment readiness", () => {
    expectBlocker(readyInput({ visaType: "" }), "APPT_VISA_TYPE_MISSING");
  });

  test("unsupported visa type blocks appointment readiness", () => {
    expectBlocker(
      readyInput({ supportedVisaTypes: ["tourism"], visaType: "medical" }),
      "APPT_UNSUPPORTED_VISA_TYPE",
    );
  });

  test("missing jurisdiction data blocks appointment readiness", () => {
    expectBlocker(
      readyInput({ appointmentCenter: "" }),
      "APPT_CONSULAR_JURISDICTION_MISSING",
    );
  });

  test("jurisdiction mismatch blocks appointment readiness", () => {
    expectBlocker(
      readyInput({ jurisdictionMatches: false }),
      "APPT_CONSULAR_JURISDICTION_MISMATCH",
    );
  });

  test("duplicate active submission blocks appointment readiness", () => {
    expectBlocker(
      readyInput({ duplicatePassportActiveSubmission: true }),
      "APPT_DUPLICATE_PASSPORT_ACTIVE_SUBMISSION",
    );
  });

  test("duplicate active appointment blocks appointment readiness", () => {
    expectBlocker(
      readyInput({ duplicateActiveAppointment: true }),
      "APPT_DUPLICATE_ACTIVE_APPOINTMENT",
    );
  });

  test("missing contact blocks appointment readiness", () => {
    expectBlocker(
      readyInput({
        applicants: [
          readyApplicant({
            contactEmailPresent: false,
            contactPhonePresent: false,
          }),
        ],
      }),
      "APPT_CONTACT_MISSING",
    );
  });

  test("missing identity basics emit name, dob, and nationality blockers", () => {
    const ids = blockerIds(
      readyInput({
        applicants: [
          readyApplicant({
            dobPresent: false,
            fullNamePresent: false,
            nationalityPresent: false,
          }),
        ],
      }),
    );

    expect(ids).toContain("APPT_APPLICANT_NAME_MISSING");
    expect(ids).toContain("APPT_DOB_MISSING");
    expect(ids).toContain("APPT_NATIONALITY_MISSING");
  });

  test("family members in different cities block appointment readiness", () => {
    expectBlocker(
      familyInput([
        readyApplicant({ applicantId: "applicant-1", city: "Москва" }),
        readyApplicant({ applicantId: "applicant-2", city: "Казань" }),
      ]),
      "APPT_FAMILY_DIFFERENT_CITIES",
    );
  });

  test("family members with different trip dates block appointment readiness", () => {
    expectBlocker(
      familyInput([
        readyApplicant({
          applicantId: "applicant-1",
          tripDates: { entryDate: "2026-08-01", exitDate: "2026-08-15" },
        }),
        readyApplicant({
          applicantId: "applicant-2",
          tripDates: { entryDate: "2026-08-01", exitDate: "2026-08-16" },
        }),
      ]),
      "APPT_FAMILY_DIFFERENT_TRIP_DATES",
    );
  });

  test("family members with different visa types block appointment readiness", () => {
    expectBlocker(
      familyInput([
        readyApplicant({ applicantId: "applicant-1", visaType: "tourism" }),
        readyApplicant({ applicantId: "applicant-2", visaType: "business" }),
      ]),
      "APPT_FAMILY_DIFFERENT_VISA_TYPES",
    );
  });

  test("family member missing passport and selfies emits family blockers", () => {
    const ids = blockerIds(
      familyInput([
        readyApplicant({ applicantId: "applicant-1" }),
        readyApplicant({
          applicantId: "applicant-2",
          hasPassportScan: false,
          hasSelfie1: false,
          hasSelfie2: false,
        }),
      ]),
    );

    expect(ids).toContain("APPT_FAMILY_MEMBER_MISSING_PASSPORT");
    expect(ids).toContain("APPT_FAMILY_MEMBER_MISSING_SELFIES");
  });

  test("family member count above MVP limit warns without blocking", () => {
    const input = familyInput(
      [
        readyApplicant({ applicantId: "applicant-1" }),
        readyApplicant({ applicantId: "applicant-2" }),
        readyApplicant({ applicantId: "applicant-3" }),
      ],
      { familyAutoLimit: 2 },
    );
    const result = evaluateAppointmentReadiness(input);

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.warnings.map((finding) => finding.ruleId)).toContain(
      "APPT_FAMILY_MEMBER_COUNT_REQUIRES_MANUAL_CHECK",
    );
  });

  test("full visa evidence package files are ignored for appointment readiness", () => {
    const input = {
      ...readyInput(),
      futureDocumentPackageEvidence: {
        insurance: false,
        hotelBooking: false,
        tickets: false,
        bankStatements: false,
        employmentProof: false,
        invitationLetters: false,
      },
    };

    const result = evaluateAppointmentReadiness(input);

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(
      /insurance|hotel|booking|tickets|bank|employment|invitation/i,
    );
  });

  test("safe copy does not include forbidden phrases", () => {
    const result = evaluateAppointmentReadiness(
      readyInput({
        applicants: [
          readyApplicant({
            contactEmailPresent: false,
            hasPassportScan: false,
            hasSelfie1: false,
            passportMrzReadable: false,
          }),
        ],
        duplicateActiveAppointment: true,
        jurisdictionMatches: false,
        visaType: "medical",
      }),
    );

    expect(JSON.stringify(result)).not.toMatch(forbiddenCopy);
  });

  test("messages do not include direct PII when extra private fields are present", () => {
    const privateValues = [
      "Private Applicant",
      "123456789",
      "1990-01-01",
      "Private street 10",
      "P<RUSPRIVATE<<APPLICANT<<<<<<<<<<<<<<<<<<<<",
      "Private OCR text",
      "private@example.test",
      "+79990000000",
    ];
    const privateKeys = [
      ["full", "Name"].join(""),
      ["passport", "Number"].join(""),
      ["birth", "Date"].join(""),
      ["ad", "dress"].join(""),
      ["raw", "MRZ"].join(""),
      ["raw", "OCR"].join(""),
      ["contact", "Email"].join(""),
      ["contact", "Phone"].join(""),
    ];
    const applicantWithPrivateFields = {
      ...readyApplicant({
        contactEmailPresent: false,
        contactPhonePresent: false,
        hasPassportScan: false,
      }),
      ...Object.fromEntries(
        privateKeys.map((key, index) => [key, privateValues[index]]),
      ),
    } as AppointmentReadinessApplicantInput;
    const result = evaluateAppointmentReadiness({
      ...readyInput(),
      applicants: [applicantWithPrivateFields],
    });
    const serialized = JSON.stringify(result);

    for (const value of privateValues) {
      expect(serialized).not.toContain(value);
    }
  });

  test("evaluated rule ids are stable and include every APPT rule", () => {
    const clean = evaluateAppointmentReadiness(readyInput());
    const blocked = evaluateAppointmentReadiness(
      readyInput({ applicants: [readyApplicant({ hasPassportScan: false })] }),
    );

    expect(clean.evaluatedRuleIds).toEqual([...appointmentReadinessRuleIds]);
    expect(blocked.evaluatedRuleIds).toEqual([...appointmentReadinessRuleIds]);
    expect(new Set(clean.evaluatedRuleIds).size).toBe(30);
  });
});

function familyInput(
  applicants: AppointmentReadinessApplicantInput[],
  patch: Partial<AppointmentReadinessInput> = {},
) {
  return readyInput({
    applicants,
    familyUnifiedTripRequired: true,
    familyUnifiedVisaTypeRequired: true,
    submissionType: "family",
    ...patch,
  });
}
