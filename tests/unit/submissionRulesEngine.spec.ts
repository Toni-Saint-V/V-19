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

function warningIds(input: AppointmentReadinessInput) {
  return evaluateAppointmentReadiness(input).warnings.map((finding) => finding.ruleId);
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
  test("no applicants blocks appointment readiness", () => {
    expectBlocker(readyInput({ applicants: [] }), "APPT_NO_APPLICANTS");
  });

  test("fully ready single applicant returns ready and can book", () => {
    const result = evaluateAppointmentReadiness(readyInput());

    expect(result).toMatchObject({
      phase: "appointment_readiness",
      ready: true,
      canBookAppointment: true,
      blockers: [],
      infos: [],
      warnings: [],
    });
    expect(result.evaluatedRuleIds).toEqual([...appointmentReadinessRuleIds]);
  });

  test("missing passport scan blocks appointment readiness", () => {
    expectBlocker(
      readyInput({ applicants: [readyApplicant({ hasPassportScan: false })] }),
      "APPT_PASSPORT_MISSING",
    );
  });

  test("passport scan with unreadable, partial, or low-confidence MRZ warns only", () => {
    const result = evaluateAppointmentReadiness(
      readyInput({
        applicants: [
          readyApplicant({
            passportIdentityFieldsReadable: false,
            passportMrzConfidence: "low",
            passportMrzReadable: false,
          }),
        ],
      }),
    );

    expect(result.ready).toBe(true);
    expect(result.canBookAppointment).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.warnings.map((finding) => finding.ruleId)).toContain(
      "APPT_PASSPORT_MRZ_UNREADABLE",
    );
  });

  test("expired passport warns without blocking appointment readiness", () => {
    const result = evaluateAppointmentReadiness(
      readyInput({ applicants: [readyApplicant({ passportExpiryDate: "2026-01-31" })] }),
    );

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.warnings.map((finding) => finding.ruleId)).toContain(
      "APPT_PASSPORT_EXPIRED",
    );
  });

  test("passport validity shorter than 3 months after departure warns only", () => {
    const result = evaluateAppointmentReadiness(
      readyInput({ applicants: [readyApplicant({ passportExpiryDate: "2026-11-14" })] }),
    );

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.warnings.map((finding) => finding.ruleId)).toContain(
      "APPT_PASSPORT_VALIDITY_TOO_SHORT",
    );
  });

  test("declared blank pages fewer than 2 warns only", () => {
    const result = evaluateAppointmentReadiness(
      readyInput({ applicants: [readyApplicant({ declaredBlankPages: 1 })] }),
    );

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.warnings.map((finding) => finding.ruleId)).toContain(
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

  test("bad selfie quality warns without blocking when both selfie slots are present", () => {
    const result = evaluateAppointmentReadiness(
      readyInput({
        applicants: [readyApplicant({ selfieQualityStatus: "bad" })],
      }),
    );

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.warnings.map((finding) => finding.ruleId)).toContain(
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

  test("missing trip dates warn without blocking appointment readiness", () => {
    expect(warningIds(readyInput({ trip: { entryDate: "", exitDate: "" } }))).toContain(
      "APPT_TRIP_DATES_MISSING",
    );
    expect(evaluateAppointmentReadiness(readyInput({ trip: { entryDate: "", exitDate: "" } })).ready).toBe(true);
  });

  test("exit before entry warns without blocking appointment readiness", () => {
    const result = evaluateAppointmentReadiness(
      readyInput({
        trip: { entryDate: "2026-08-15", exitDate: "2026-08-01" },
      }),
    );

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.warnings.map((finding) => finding.ruleId)).toContain(
      "APPT_TRIP_DATE_INVALID_RANGE",
    );
  });

  test("application more than 6 months before trip warns only", () => {
    expect(
      warningIds(readyInput({ applicationDate: "2026-01-31", now: "2026-01-31" })),
    ).toContain("APPT_TOO_EARLY_FOR_APPLICATION");
  });

  test("application less than 15 days before trip warns with admin override policy", () => {
    const result = evaluateAppointmentReadiness(
      readyInput({ applicationDate: "2026-07-20", now: "2026-07-20" }),
    );
    const finding = result.warnings.find(
      (item) => item.ruleId === "APPT_TOO_LATE_FOR_APPLICATION",
    );

    expect(finding).toBeDefined();
    expect(finding?.overridePolicy).toContain("администратор");
    expect(result.ready).toBe(true);
  });

  test("missing visa type warns without blocking appointment readiness", () => {
    expect(warningIds(readyInput({ visaType: "" }))).toContain(
      "APPT_VISA_TYPE_MISSING",
    );
    expect(evaluateAppointmentReadiness(readyInput({ visaType: "" })).ready).toBe(true);
  });

  test("unsupported visa type warns without blocking appointment readiness", () => {
    const result = evaluateAppointmentReadiness(
      readyInput({ supportedVisaTypes: ["tourism"], visaType: "medical" }),
    );

    expect(result.ready).toBe(true);
    expect(result.warnings.map((finding) => finding.ruleId)).toContain(
      "APPT_UNSUPPORTED_VISA_TYPE",
    );
  });

  test("missing city, center, jurisdiction, or agent warns without blocking", () => {
    const result = evaluateAppointmentReadiness(
      readyInput({ agentId: "", appointmentCenter: "", city: "" }),
    );

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.warnings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        "APPT_CONSULAR_JURISDICTION_MISSING",
        "APPT_AGENT_MISSING",
      ]),
    );
  });

  test("jurisdiction mismatch warns without blocking appointment readiness", () => {
    expect(warningIds(readyInput({ jurisdictionMatches: false }))).toContain(
      "APPT_CONSULAR_JURISDICTION_MISMATCH",
    );
    expect(evaluateAppointmentReadiness(readyInput({ jurisdictionMatches: false })).ready).toBe(true);
  });

  test("duplicate active submission warns without blocking appointment readiness", () => {
    expect(
      warningIds(readyInput({ duplicatePassportActiveSubmission: true })),
    ).toContain("APPT_DUPLICATE_PASSPORT_ACTIVE_SUBMISSION");
  });

  test("duplicate active appointment warns without blocking appointment readiness", () => {
    expect(warningIds(readyInput({ duplicateActiveAppointment: true }))).toContain(
      "APPT_DUPLICATE_ACTIVE_APPOINTMENT",
    );
  });

  test("missing contact warns without blocking appointment readiness", () => {
    const result = evaluateAppointmentReadiness(
      readyInput({
        applicants: [
          readyApplicant({
            contactEmailPresent: false,
            contactPhonePresent: false,
          }),
        ],
      }),
    );

    expect(result.ready).toBe(true);
    expect(result.warnings.map((finding) => finding.ruleId)).toContain(
      "APPT_CONTACT_MISSING",
    );
  });

  test("missing identity basics emit name, dob, and nationality warnings", () => {
    const ids = warningIds(
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

  test("family members in different cities warn without blocking appointment readiness", () => {
    const result = evaluateAppointmentReadiness(
      familyInput([
        readyApplicant({ applicantId: "applicant-1", city: "Москва" }),
        readyApplicant({ applicantId: "applicant-2", city: "Казань" }),
      ]),
    );

    expect(result.ready).toBe(true);
    expect(result.warnings.map((finding) => finding.ruleId)).toContain(
      "APPT_FAMILY_DIFFERENT_CITIES",
    );
  });

  test("family members with different trip dates warn without blocking", () => {
    const result = evaluateAppointmentReadiness(
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
    );

    expect(result.ready).toBe(true);
    expect(result.warnings.map((finding) => finding.ruleId)).toContain(
      "APPT_FAMILY_DIFFERENT_TRIP_DATES",
    );
  });

  test("family members with different visa types warn without blocking", () => {
    const result = evaluateAppointmentReadiness(
      familyInput([
        readyApplicant({ applicantId: "applicant-1", visaType: "tourism" }),
        readyApplicant({ applicantId: "applicant-2", visaType: "business" }),
      ]),
    );

    expect(result.ready).toBe(true);
    expect(result.warnings.map((finding) => finding.ruleId)).toContain(
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
    expect(new Set(clean.evaluatedRuleIds).size).toBe(32);
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
