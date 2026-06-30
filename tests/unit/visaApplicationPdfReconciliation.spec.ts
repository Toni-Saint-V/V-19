import { describe, expect, test } from "vitest";
import {
  applyVisaApplicationPdfReview,
  confirmVisaApplicationPdfManualReview,
  dismissVisaApplicationPdfReview,
  extractVisaApplicationPdfData,
  reconcileVisaApplicationPdf,
  visaApplicationPdfAgentHandoffStatus,
  visaApplicationPdfReviewsForSubmission,
  type VisaApplicationReferenceData,
} from "../../src/modules/submissions/visaApplicationPdfReconciliation";
import {
  buildVisaApplicationPdfStorageTarget,
  mediaStorageBucket,
  validateVisaApplicationPdfStorageTarget,
} from "../../src/modules/submissions/mediaStoragePolicy";
import {
  completeQuestionnaire,
  createDraftSubmission,
  uploadRequiredFiles,
} from "../../src/modules/submissions/submissionActions";
import {
  applySubmissionAction,
  canPerformAction,
} from "../../src/modules/submissions/status";
import type { Submission } from "../../src/modules/submissions/types";

const pdfTextFrom669308614 = `
1. Apellido(s)/Фамилия(-и):
BOGDANOV
PARTE RESERVADA A LA ADMINISTRACIÓN
2. Apellido(s) de nacimiento [(apellido(s) anterior(es)]/ Фамилия при рождении:
BOGDANOV
3. Nombre(s)/First name(s) /Имя (имена):
ANATOLII
4. Fecha de nacimiento (día-mes-año)/ Дата рождения:
23-04-1956
5.Lugar de nacimiento/Место рождения:
LENINGRAD REGION
6. País de nacimiento/Страна рождения:
Russian Federation
7.Nacionalidad actual/ Гражданство в настоящее время:
Russian Federation
8. Sexo/Пол:
Varón/Мужской
9. Estado civil/Семейное положение:
Casado-a/ Женат / замужем
10. Persona que ejerce la patria potestad
11. Número de documento nacional de identidad
12.Tipo de documento de viaje/ Тип документа
Pasaporte ordinario/ обычный паспорт
13. Número del documento de viaje/
Номер документа, удостоверяющего личность:
669308614
14.Fecha de expedición/ Дата выдачи:
2024-08-08
15. Válido hasta/Действителен до:
2029-08-08
16. . Expedido por (país)/Страна выдачи:
Russian Federation
17. Datos personales del miembro de la familia
18. Relación de parentesco
19. . Domicilio postal y dirección de correo electrónico del solicitante/
BOGDANOV@MAIL.RU
BELGRADSKAYA STR 26 9 115 FAMILY SCHEDULE PLEASE FROM 2026-05-18 -
2026-05-22 ST PETERSBURG Russian Federation 197567
Número(s) de teléfono:
9119900886
20. Residente en un país distinto
No/Нет
21. Profesión actual/ Кем работаете в настоящее время:
22. Nombre, dirección y número de teléfono del empleador:
RETIRED, RETIRED , RETIRED
23. Motivo(s) del viaje/ Цель (-и) поездки:
Turismo/Туризм
Negocios/Деловая
24.Información adicional sobre el motivo de la estancia:
25. Estado miembro de destino principal (y otros Estados miembros de destino, si procede)/
Страна основного назначения в Шенгене:
26. Estado miembro de primera entrada/ Страна первого въезда в Шенген:
27. Número de entradas que solicita/ Запрашиваемое количество вьездов:
Una/однократная
Dos/двукратная
Múltiples/многократный въезд
28. Fecha prevista de llegada de la primera estancia prevista en el espacio Schengen/
Fecha prevista de la salida del espacio Schengen después de la primera estancia prevista/
29. Impresiones dactilares tomadas anteriormente
NO/нет
30. Permiso de entrada al país de destino final
31. Apellido(s) y nombre (s) de las persona o personas que han emitido la invitación
HOTEL HOTEL@INFO.RU 34521425255
32. Nombre y dirección de la empresa u organización que ha emitido la invitación
CALLE 10 29680 HOTEL@INFO.RU
33. Los gastos de viaje y subsistencia del solicitante durante su estancia están cubiertos/
By the applicant himself/herself
por un patrocinador
Efectivo/наличные деньги
34. Nombre y apellidos de la persona que completa el formulario
`;

const completeCriticalPdfText = `
1. Apellido(s)/Фамилия(-и):
VOLKOV
2. Apellido(s) de nacimiento:
VOLKOV
3. Nombre(s)/First name(s):
ANTON
4. Fecha de nacimiento:
20.08.1990
5.Lugar de nacimiento:
LENINGRAD
6. País de nacimiento:
USSR
7.Nacionalidad actual:
Russian Federation
8. Sexo/Пол:
Varón/Мужской
9. Estado civil/Семейное положение:
Casado-a/ Женат / замужем
10. Persona que ejerce la patria potestad
11. Número de documento nacional de identidad
12.Tipo de documento de viaje/ Тип документа
Pasaporte ordinario/ обычный паспорт
13. Número del documento de viaje:
752869613
14.Fecha de expedición:
26.02.2016
15. Válido hasta:
26.02.2026
16. . Expedido por (país):
Russian Federation
17. Datos personales
18. Relación de parentesco
19. Domicilio postal:
NEVSKY 10
20. Residente
21. Profesión actual
22. Empleador
23. Motivo(s) del viaje:
Turismo/Туризм
24.Información adicional
25. Estado miembro de destino principal:
Spain
26. Estado miembro de primera entrada:
Spain
27. Número de entradas que solicita:
Una/однократная
28. Fecha prevista de llegada:
2026-05-18
Fecha prevista de la salida:
2026-05-22
29. Impresiones
30. Permiso
31. Hotel
32. Empresa
33. Los gastos de viaje:
By the applicant himself/herself
34. Nombre
`;

const matchingReference: VisaApplicationReferenceData = {
  birthCountry: "USSR",
  birthDate: "20.08.1990",
  birthPlace: "LENINGRAD",
  citizenship: "Russian Federation",
  firstName: "ANTON",
  passportExpiresAt: "26.02.2026",
  passportIssueCountry: "Russian Federation",
  passportIssuedAt: "26.02.2016",
  passportNumber: "752869613",
  surname: "VOLKOV",
};

const bogdanovReference: VisaApplicationReferenceData = {
  birthCountry: "Russian Federation",
  birthDate: "23-04-1956",
  birthPlace: "LENINGRAD REGION",
  citizenship: "Russian Federation",
  firstName: "ANATOLII",
  passportExpiresAt: "2029-08-08",
  passportIssueCountry: "Russian Federation",
  passportIssuedAt: "2024-08-08",
  passportNumber: "669308614",
  surname: "BOGDANOV",
};

const fullSha256 = "b".repeat(64);

describe("visa application PDF reconciliation", () => {
  test("extracts identity and passport fields from a wkhtmltopdf text layer", () => {
    expect(extractVisaApplicationPdfData(pdfTextFrom669308614)).toMatchObject({
      birthCountry: "Russian Federation",
      birthDate: "23-04-1956",
      birthPlace: "LENINGRAD REGION",
      citizenship: "Russian Federation",
      firstName: "ANATOLII",
      passportExpiresAt: "2029-08-08",
      passportIssueCountry: "Russian Federation",
      passportIssuedAt: "2024-08-08",
      passportNumber: "669308614",
      surname: "BOGDANOV",
      travelDatesInAddress: "2026-05-18 - 2026-05-22",
    });
  });

  test("does not treat wrapped country field labels as filled country values", () => {
    const wrappedEmptyCountryLabelsText = completeCriticalPdfText
      .replace(
        "25. Estado miembro de destino principal:\nSpain",
        `25. Estado miembro de destino principal (y otros Estados miembros de
destino, si procede)/
страны назначения в Шенгене, если
Страна основного назначения в Шенгене:`,
      )
      .replace(
        "26. Estado miembro de primera entrada:\nSpain",
        `26. Estado miembro de primera entrada
Страна первого въезда в Шенген:`,
      );

    const data = extractVisaApplicationPdfData(wrappedEmptyCountryLabelsText);
    expect(data.destinationCountry).toBeUndefined();
    expect(data.firstEntryCountry).toBeUndefined();

    const result = reconcileVisaApplicationPdf(
      wrappedEmptyCountryLabelsText,
      matchingReference,
    );
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "pdf_required_field_missing",
          field: "destinationCountry",
          severity: "critical",
        }),
        expect.objectContaining({
          code: "pdf_required_field_missing",
          field: "firstEntryCountry",
          severity: "critical",
        }),
      ]),
    );
  });

  test.each([
    ["surname", "SMIRNOV"],
    ["firstName", "IVAN"],
    ["birthDate", "21.08.1990"],
    ["birthPlace", "MOSCOW"],
    ["birthCountry", "Russian Federation"],
    ["citizenship", "Armenia"],
    ["passportNumber", "999999999"],
    ["passportIssuedAt", "27.02.2016"],
    ["passportExpiresAt", "27.02.2026"],
    ["passportIssueCountry", "Armenia"],
  ] satisfies Array<[keyof VisaApplicationReferenceData, string]>)(
    "blocks post-export handoff when critical reference field %s differs",
    (field, expected) => {
      const result = reconcileVisaApplicationPdf(completeCriticalPdfText, {
        ...matchingReference,
        [field]: expected,
      });

      expect(result.status).toBe("blocked");
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "pdf_field_mismatch",
            expected,
            field,
            severity: "critical",
          }),
        ]),
      );
    },
  );

  test("blocks post-export handoff when a critical PDF identity field is missing", () => {
    const result = reconcileVisaApplicationPdf(
      completeCriticalPdfText.replace("752869613", ""),
      matchingReference,
    );

    expect(result.status).toBe("blocked");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "pdf_critical_field_missing",
          expected: "752869613",
          field: "passportNumber",
          severity: "critical",
        }),
      ]),
    );
  });

  test("blocks post-export handoff when critical travel fields are missing", () => {
    const result = reconcileVisaApplicationPdf(pdfTextFrom669308614, matchingReference);

    expect(result.status).toBe("blocked");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "pdf_required_field_missing",
          field: "destinationCountry",
          severity: "critical",
        }),
        expect.objectContaining({
          code: "pdf_required_field_missing",
          field: "firstEntryCountry",
          severity: "critical",
        }),
        expect.objectContaining({
          code: "pdf_required_field_missing",
          field: "arrivalDate",
          severity: "critical",
        }),
        expect.objectContaining({
          code: "pdf_required_field_missing",
          field: "departureDate",
          severity: "critical",
        }),
        expect.objectContaining({
          code: "pdf_travel_dates_in_address",
          field: "travelDatesInAddress",
          severity: "critical",
        }),
      ]),
    );
  });

  test("blocks a returned PDF when it belongs to another passport and misses required BLS fields", () => {
    const result = reconcileVisaApplicationPdf(pdfTextFrom669308614, {
      birthCountry: "USSR",
      birthDate: "20.08.1990",
      birthPlace: "LENINGRAD",
      citizenship: "Russian Federation",
      firstName: "ANTON",
      passportExpiresAt: "26.02.2026",
      passportIssueCountry: "Russian Federation",
      passportIssuedAt: "26.02.2016",
      passportNumber: "752869613",
      surname: "VOLKOV",
    });

    expect(result.status).toBe("blocked");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "pdf_field_mismatch",
          expected: "VOLKOV",
          field: "surname",
          severity: "critical",
          value: "BOGDANOV",
        }),
        expect.objectContaining({
          code: "pdf_field_mismatch",
          expected: "ANTON",
          field: "firstName",
          value: "ANATOLII",
        }),
        expect.objectContaining({
          code: "pdf_field_mismatch",
          expected: "752869613",
          field: "passportNumber",
          value: "669308614",
        }),
        expect.objectContaining({
          code: "pdf_required_field_missing",
          field: "destinationCountry",
          severity: "critical",
        }),
        expect.objectContaining({
          code: "pdf_required_field_missing",
          field: "arrivalDate",
          severity: "critical",
        }),
        expect.objectContaining({
          code: "pdf_required_field_missing",
          field: "paymentCoverage",
          severity: "warning",
        }),
        expect.objectContaining({
          code: "pdf_travel_dates_in_address",
          field: "travelDatesInAddress",
          severity: "critical",
        }),
      ]),
    );
  });

  test("keeps checkbox-only gaps as review warnings instead of critical blockers", () => {
    const result = reconcileVisaApplicationPdf(completeCriticalPdfText, {
      birthCountry: "USSR",
      birthDate: "20.08.1990",
      birthPlace: "LENINGRAD",
      citizenship: "Russian Federation",
      firstName: "ANTON",
      passportExpiresAt: "26.02.2026",
      passportIssueCountry: "Russian Federation",
      passportIssuedAt: "26.02.2016",
      passportNumber: "752869613",
      surname: "VOLKOV",
    });

    expect(result.status).toBe("needs_review");
    expect(result.findings.every((finding) => finding.severity === "warning")).toBe(
      true,
    );
  });

  test("does not block acceptance because returned PDF review is post-export", () => {
    const submitted = submittedFixture();
    const withPdfReview = applyVisaApplicationPdfReview(
      submitted,
      pdfTextFrom669308614,
      { fileName: "669308614_Form.pdf" },
    );

    expect(
      "rawText" in
        ((withPdfReview.visaApplicationPdfReview?.data ?? {}) as Record<
          string,
          string
        >),
    ).toBe(false);
    expect(canPerformAction(withPdfReview, "accept", "admin")).toEqual({ ok: true });
  });

  test("stores returned PDF artifact metadata without raw PDF text", () => {
    const submitted = submittedFixture();
    const withPdfReview = applyVisaApplicationPdfReview(
      submitted,
      pdfTextFrom669308614,
      {
        artifact: {
          extractionSource: "text_layer",
          fileName: "669308614_Form.pdf",
          mimeType: "application/pdf",
          sha256: fullSha256,
          sizeBytes: 19570,
          uploadedBy: "admin@example.test",
        },
      },
    );
    const review = visaApplicationPdfReviewsForSubmission(withPdfReview)[0];

    expect(review).toMatchObject({
      artifact: {
        extractionSource: "text_layer",
        fileName: "669308614_Form.pdf",
        mimeType: "application/pdf",
        parserVersion: 1,
        sha256: fullSha256,
        sizeBytes: 19570,
        uploadedBy: "admin@example.test",
      },
      fileName: "669308614_Form.pdf",
    });
    expect("rawText" in ((review?.data ?? {}) as Record<string, string>)).toBe(false);
  });

  test("blocks agent handoff after export when returned PDF has critical mismatches", () => {
    const exported = {
      ...submittedFixture(),
      exportState: "marked_exported" as const,
      status: "exported" as const,
    };
    const withPdfReview = applyVisaApplicationPdfReview(
      exported,
      pdfTextFrom669308614,
      { fileName: "669308614_Form.pdf" },
    );

    expect(visaApplicationPdfAgentHandoffStatus(withPdfReview)).toEqual({
      ok: false,
      reason:
        "PDF анкеты не удалось однозначно сопоставить с заявителем по паспорту или ФИО.",
      status: "blocked",
    });
  });

  test("does not allow agent handoff for warning-only PDF without manual confirmation", () => {
    const withPdfReview = applyVisaApplicationPdfReview(
      exportedFixture(),
      completeCriticalPdfText,
      { fileName: "volkov-warning.pdf" },
    );

    expect(visaApplicationPdfAgentHandoffStatus(withPdfReview)).toEqual({
      ok: false,
      reason:
        "Есть предупреждения PDF, подтвердите ручную проверку перед передачей агентам.",
      status: "needs_manual_confirmation",
    });
  });

  test("allows agent handoff for warning-only PDF after explicit manual confirmation", () => {
    const withPdfReview = applyVisaApplicationPdfReview(
      exportedFixture(),
      completeCriticalPdfText,
      { fileName: "volkov-warning.pdf" },
    );
    const reviewId = visaApplicationPdfReviewsForSubmission(withPdfReview)[0]?.id;
    expect(reviewId).toBeTruthy();

    const confirmed = confirmVisaApplicationPdfManualReview(
      withPdfReview,
      reviewId ?? "",
      "admin@example.test",
    );
    const confirmedReview = visaApplicationPdfReviewsForSubmission(confirmed)[0];

    expect(confirmedReview).toMatchObject({
      handoffStatus: "ready_for_agent",
      manualReviewConfirmedBy: "admin@example.test",
      status: "needs_review",
    });
    expect(visaApplicationPdfAgentHandoffStatus(confirmed)).toEqual({
      ok: true,
      reason: "PDF анкеты совпадает с критичными данными заявки.",
      status: "ready",
    });
  });

  test("allows an unmatched returned PDF to be dismissed so it does not permanently block handoff", () => {
    const secondApplicantReference = {
      ...bogdanovReference,
      firstName: "IVAN",
      passportNumber: "111111111",
      surname: "SMIRNOV",
    };
    const exported = exportedFixture(
      submittedFixture([matchingReference, secondApplicantReference]),
    );
    const withUnmatchedPdf = applyVisaApplicationPdfReview(
      exported,
      pdfTextFrom669308614,
      { fileName: "wrong-person.pdf" },
    );
    const reviewId = visaApplicationPdfReviewsForSubmission(withUnmatchedPdf)[0]?.id;

    expect(visaApplicationPdfAgentHandoffStatus(withUnmatchedPdf).status).toBe(
      "blocked",
    );

    const dismissed = dismissVisaApplicationPdfReview(
      withUnmatchedPdf,
      reviewId ?? "",
      "admin@example.test",
    );

    expect(visaApplicationPdfReviewsForSubmission(dismissed)).toHaveLength(0);
    expect(visaApplicationPdfAgentHandoffStatus(dismissed)).toEqual({
      ok: false,
      reason: "Загрузите PDF анкеты после внешней обработки перед передачей агентам.",
      status: "missing",
    });
  });

  test("rejects returned PDF artifact metadata without full checksum or safe storage target", () => {
    expect(() =>
      applyVisaApplicationPdfReview(exportedFixture(), completeCriticalPdfText, {
        artifact: {
          extractionSource: "text_layer",
          fileName: "volkov-warning.pdf",
          mimeType: "application/pdf",
          sha256: "abc123",
          sizeBytes: 19570,
        },
      }),
    ).toThrow(/SHA-256/);

    expect(() =>
      applyVisaApplicationPdfReview(exportedFixture(), completeCriticalPdfText, {
        artifact: {
          extractionSource: "text_layer",
          fileName: "volkov-warning.pdf",
          mimeType: "application/pdf",
          sha256: fullSha256,
          sizeBytes: 19570,
          storageBucket: "submission-media",
          storagePath: "unsafe/path",
        },
      }),
    ).toThrow(/storage path/);
  });

  test("rejects returned PDF artifact storage identity for another applicant", () => {
    const exported = exportedFixture();
    const artifactTarget = buildVisaApplicationPdfStorageTarget({
      applicantId: "other-applicant",
      sha256: fullSha256,
      submissionId: exported.id,
    });

    expect(() =>
      applyVisaApplicationPdfReview(exported, completeCriticalPdfText, {
        artifact: {
          extractionSource: "text_layer",
          fileName: "volkov-warning.pdf",
          mimeType: "application/pdf",
          sha256: fullSha256,
          sizeBytes: 19570,
          storageBucket: mediaStorageBucket,
          storagePath: artifactTarget.path,
        },
      }),
    ).toThrow(/current submission/);

    expect(() =>
      validateVisaApplicationPdfStorageTarget({
        applicantId: exported.applicants[0]?.id ?? "",
        sha256: fullSha256,
        submissionId: exported.id,
        target: artifactTarget,
      }),
    ).toThrow(/current submission/);
  });

  test("matches returned PDFs to the right applicant and requires every family member", () => {
    const exported = exportedFixture(
      submittedFixture([matchingReference, bogdanovReference]),
    );
    const secondApplicant = exported.applicants[1];
    const withSecondApplicantPdf = applyVisaApplicationPdfReview(
      exported,
      clearPdfTextFor(bogdanovReference),
      { fileName: "bogdanov.pdf" },
    );
    const secondReview =
      visaApplicationPdfReviewsForSubmission(withSecondApplicantPdf)[0];

    expect(secondReview).toMatchObject({
      applicantId: secondApplicant?.id,
      applicantName: secondApplicant?.fullName,
      status: "clear",
    });
    expect(visaApplicationPdfAgentHandoffStatus(withSecondApplicantPdf)).toEqual({
      ok: false,
      reason: `Загрузите и проверьте PDF анкеты для ${exported.applicants[0]?.fullName}.`,
      status: "missing",
    });

    const withBothPdfs = applyVisaApplicationPdfReview(
      withSecondApplicantPdf,
      clearPdfTextFor(matchingReference),
      { fileName: "volkov.pdf" },
    );

    expect(visaApplicationPdfAgentHandoffStatus(withBothPdfs)).toEqual({
      ok: true,
      reason: "PDF анкеты совпадает с критичными данными заявки.",
      status: "ready",
    });
  });

  test("requires a post-export PDF before agent handoff", () => {
    const exported = {
      ...submittedFixture(),
      exportState: "marked_exported" as const,
      status: "exported" as const,
    };

    expect(visaApplicationPdfAgentHandoffStatus(exported)).toEqual({
      ok: false,
      reason: "Загрузите PDF анкеты после внешней обработки перед передачей агентам.",
      status: "missing",
    });
  });
});

function submittedFixture(
  references: VisaApplicationReferenceData[] = [matchingReference],
): Submission {
  const draft = createDraftSubmission({
    applicantNames: references.map(
      (reference) => `${reference.surname} ${reference.firstName}`,
    ),
    city: "Москва",
    familyCount: references.length,
    submissions: [],
    type: references.length > 1 ? "family" : "single",
  });
  const completed = completeQuestionnaire(draft);
  const withPassportFields = {
    ...completed,
    applicants: completed.applicants.map((item, index) => {
      const reference = references[index];
      if (!reference) return item;

      return {
        ...item,
        sections: item.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) => {
            const values: Record<string, string | undefined> = {
              "birth-country": reference.birthCountry,
              "birth-date": reference.birthDate,
              "birth-place": reference.birthPlace,
              nationality: reference.citizenship,
              "first-name": reference.firstName,
              "passport-expiry-date": reference.passportExpiresAt,
              "passport-issue-country": reference.passportIssueCountry,
              "passport-issue-date": reference.passportIssuedAt,
              "passport-no": reference.passportNumber,
              surname: reference.surname,
            };
            const value = values[field.id];
            return value ? { ...field, value } : field;
          }),
        })),
      };
    }),
  };
  const withFiles = {
    ...uploadRequiredFiles(withPassportFields),
    tripDateFrom: "2026-07-10",
    tripDateTo: "2026-07-18",
  };
  const inProgress = applySubmissionAction(withFiles, "save_progress", "agent");
  return applySubmissionAction(inProgress, "submit_for_review", "agent");
}

function exportedFixture(submission = submittedFixture()): Submission {
  return {
    ...submission,
    exportState: "marked_exported",
    status: "exported",
  };
}

function clearPdfTextFor(reference: VisaApplicationReferenceData) {
  return `
1. Apellido(s)/Фамилия(-и):
${reference.surname}
2. Apellido(s) de nacimiento:
${reference.surname}
3. Nombre(s)/First name(s):
${reference.firstName}
4. Fecha de nacimiento:
${reference.birthDate}
5.Lugar de nacimiento:
${reference.birthPlace}
6. País de nacimiento:
${reference.birthCountry}
7.Nacionalidad actual:
${reference.citizenship}
8. Sexo/Пол:
Varón/Мужской
9. Estado civil/Семейное положение:
Casado-a/ Женат / замужем
10. Persona que ejerce la patria potestad
11. Número de documento nacional de identidad
12.Tipo de documento de viaje/ Тип документа
Pasaporte ordinario/ обычный паспорт
13. Número del documento de viaje:
${reference.passportNumber}
14.Fecha de expedición:
${reference.passportIssuedAt}
15. Válido hasta:
${reference.passportExpiresAt}
16. . Expedido por (país):
${reference.passportIssueCountry}
17. Datos personales
18. Relación de parentesco
19. Domicilio postal:
NEVSKY 10
20. Residente
21. Profesión actual
22. Empleador
23. Motivo(s) del viaje:
✓ Turismo/Туризм
24.Información adicional
25. Estado miembro de destino principal:
Spain
26. Estado miembro de primera entrada:
Spain
27. Número de entradas que solicita:
✓ Una/однократная
28. Fecha prevista de llegada:
2026-05-18
Fecha prevista de la salida:
2026-05-22
29. Impresiones
30. Permiso
31. Hotel
32. Empresa
33. Los gastos de viaje:
✓ By the applicant himself/herself
34. Nombre
`;
}
