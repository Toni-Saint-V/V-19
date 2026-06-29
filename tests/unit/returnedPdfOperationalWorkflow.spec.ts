import { describe, expect, test } from "vitest";
import {
  buildAgentReturnedPdfPackageView,
  buildAgentHandoffPackage,
  buildApplicantArtifactFileNames,
  buildAppointmentListPdfMapping,
  buildReturnedPdfAgentHandoffGate,
  type ReturnedPdfArtifact,
} from "../../src/modules/submissions/operationalWorkflow";
import { buildExportPackageIdentity } from "../../src/modules/submissions/exportRules";
import {
  applyVisaApplicationPdfReview,
  visaApplicationPdfReviewsForSubmission,
} from "../../src/modules/submissions/visaApplicationPdfReconciliation";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import {
  buildAppointmentPdfStorageTarget,
  buildVisaApplicationPdfStorageTarget,
} from "../../src/modules/submissions/mediaStoragePolicy";
import type {
  Submission,
  VisaApplicationPdfReviewState,
} from "../../src/modules/submissions/types";

describe("returned PDF operational handoff gate", () => {
  test("application_form_pdf with full passport maps to applicant passport and owner-scoped filename", () => {
    const submission = withApplicantIdentity(exportedSubmission("ПД-1056", "local-agent-tony"), {
      birthDate: "23-04-1956",
      firstName: "ANATOLII",
      fullName: "ANATOLII BOGDANOV",
      passportNumber: "669308614",
      surname: "BOGDANOV",
    });
    const reviewed = applyVisaApplicationPdfReview(
      submission,
      applicationPdfText({
        birthDate: "23-04-1956",
        firstName: "ANATOLII",
        passportNumber: "669308614",
        surname: "BOGDANOV",
      }),
      {
        artifact: {
          fileName: "uploaded.pdf",
          mimeType: "application/pdf",
          sha256: "c".repeat(64),
          sizeBytes: 12_000,
        },
      },
    );
    const review = visaApplicationPdfReviewsForSubmission(reviewed)[0];

    expect(review).toMatchObject({
      applicantId: submission.applicants[0]?.id,
      artifact: {
        fileName: "669308614_application_form_pdf_bogdanov_anatolii.pdf",
      },
      data: { passportNumber: "669308614" },
    });
  });

  test("appointment_list_pdf row maps only when group URN and export mapping agree", () => {
    const submission = withApplicantIdentity(exportedSubmission("ПД-1056", "local-agent-tony"), {
      firstName: "ANATOLII",
      fullName: "ANATOLII BOGDANOV",
      passportNumber: "669308614",
      surname: "BOGDANOV",
    });
    const pdfText = [
      "Group URN STP398400350726",
      "STP398400350726/1 ANA***** BOG***** *****614 2026-07-01 10:00",
    ].join("\n");

    expect(
      buildAppointmentListPdfMapping({
        expectedGroupUrn: "STP398400350726",
        exportPackageId: "pkg-spb",
        pdfText,
        submissions: [submission],
      }),
    ).toMatchObject({
      agentHandoffAllowed: true,
      artifactKind: "appointment_list_pdf",
      exportPackageId: "pkg-spb",
      groupUrn: "STP398400350726",
      matchedApplicantsCount: 1,
      matchedApplicantIds: [submission.applicants[0]?.id],
      packageLevel: true,
      unmatchedRows: [],
    });
    expect(
      buildAppointmentListPdfMapping({
        expectedGroupUrn: "STP000000000000",
        pdfText,
        submissions: [submission],
      }),
    ).toMatchObject({
      agentHandoffAllowed: false,
      matchedApplicantsCount: 0,
      unmatchedRows: expect.arrayContaining([
        expect.objectContaining({ passportLast3: "614" }),
      ]),
    });
  });

  test("appointment_list_pdf is package-level and mixed-agent package is not exposed to one agent", () => {
    const primary = withApplicantIdentity(exportedSubmission("ПД-1056", "local-agent-tony"), {
      firstName: "ANATOLII",
      fullName: "ANATOLII BOGDANOV",
      passportNumber: "669308614",
      surname: "BOGDANOV",
    });
    const secondary = withApplicantIdentity(
      {
        ...exportedSubmission("ПД-1056", "local-agent-partner"),
        applicants: exportedSubmission("ПД-1056", "local-agent-partner").applicants.map(
          (applicant) => ({ ...applicant, id: "з-secondary-appointment" }),
        ),
        exportPackage: primary.exportPackage,
        files: exportedSubmission("ПД-1056", "local-agent-partner").files.map(
          (file) => ({ ...file, applicantId: "з-secondary-appointment" }),
        ),
        id: "ПД-MIXED-APPOINTMENT",
      },
      {
        firstName: "OLGA",
        fullName: "OLGA MOROZOVA",
        passportNumber: "123456789",
        surname: "MOROZOVA",
      },
    );
    const pdfText = [
      "Group URN STP398400350726",
      "STP398400350726/1 ANA***** BOG***** *****614 2026-07-01 10:00",
      "STP398400350726/2 OLG***** MOR***** *****789 2026-07-01 10:15",
    ].join("\n");
    const mapping = buildAppointmentListPdfMapping({
      expectedGroupUrn: "STP398400350726",
      pdfText,
      submissions: [primary, secondary],
    });

    expect(mapping.packageLevel).toBe(true);
    expect(mapping.matchedApplicantsCount).toBe(2);
    expect(mapping.agentHandoffAllowed).toBe(false);
    expect(mapping.mixedAgentBlocker).toBe(
      "Mixed-agent appointment list PDF is admin-only until the export package is split or scoped.",
    );
  });

  test("blocks mixed-agent appointment list handoff until package is split or scoped", () => {
    const primary = exportedSubmission("ПД-1056", "local-agent-tony");
    const secondary = {
      ...exportedSubmission("ПД-1056", "local-agent-partner"),
      exportPackage: primary.exportPackage,
      id: "ПД-MIXED-PDF",
      title: "Mixed agent package member",
    };
    const cleanPrimary = {
      ...primary,
      visaApplicationPdfReviews: [cleanApplicationPdfReview(primary)],
    };
    const appointmentPdf = appointmentPdfArtifact(primary);

    expect(
      buildAgentHandoffPackage(cleanPrimary, {
        commonAppointmentPdf: appointmentPdf,
      }).ready,
    ).toBe(true);
    expect(
      buildReturnedPdfAgentHandoffGate(
        cleanPrimary,
        [cleanPrimary, secondary],
        { commonAppointmentPdf: appointmentPdf },
      ),
    ).toMatchObject({
      ready: false,
      mappings: [],
      blockers: expect.arrayContaining([
        "Mixed-agent appointment list PDF is admin-only until the export package is split or scoped.",
      ]),
    });
  });

  test("application_form_pdf is exposed only to owner agent and returned filenames are passport-first", () => {
    const primary = exportedSubmission("ПД-1056", "local-agent-tony");
    const cleanPrimary = {
      ...primary,
      visaApplicationPdfReviews: [cleanApplicationPdfReview(primary)],
    };
    const appointmentPdf = appointmentPdfArtifact(primary);
    const ownerView = buildAgentReturnedPdfPackageView(
      cleanPrimary,
      "local-agent-tony",
      { commonAppointmentPdf: appointmentPdf },
    );
    const otherAgentView = buildAgentReturnedPdfPackageView(
      cleanPrimary,
      "local-agent-partner",
      { commonAppointmentPdf: appointmentPdf },
    );

    expect(ownerView.visible).toBe(true);
    expect(ownerView.applicantPdfs[0]?.fileName.startsWith("778194570_")).toBe(true);
    expect(ownerView.applicantPdfs[0]?.fileNames).toMatchObject({
      applicationFormPdf: expect.stringMatching(/^778194570_application_form_pdf_/),
      passportScan: expect.stringMatching(/^778194570_passport_scan_/),
      questionnaire: expect.stringMatching(/^778194570_questionnaire_/),
      selfie: expect.stringMatching(/^778194570_selfie_/),
      selfie2: expect.stringMatching(/^778194570_selfie_2_/),
    });
    expect(otherAgentView).toMatchObject({
      applicantPdfs: [],
      visible: false,
    });
  });

  test("missing passport artifact filenames use fallback and handoff creates blocker", () => {
    const withoutPassport = withApplicantIdentity(
      exportedSubmission("ПД-1056", "local-agent-tony"),
      {
        firstName: "NO",
        fullName: "NO PASSPORT",
        passportNumber: "",
        surname: "PASSPORT",
      },
    );

    expect(
      buildApplicantArtifactFileNames(
        withoutPassport,
        withoutPassport.applicants[0]?.id ?? "",
      )?.passportScan,
    ).toMatch(/^missing-passport_passport_scan_/);
    expect(buildAgentHandoffPackage(withoutPassport).blockers.join(" ")).toContain(
      "Passport number is missing",
    );
  });
});

function withApplicantIdentity(
  submission: Submission,
  identity: {
    birthDate?: string;
    firstName: string;
    fullName: string;
    passportNumber: string;
    surname: string;
  },
): Submission {
  const applicant = submission.applicants[0];
  if (!applicant) throw new Error("Missing applicant.");
  return {
    ...submission,
    applicants: [
      {
        ...applicant,
        fullName: identity.fullName,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) => {
            const values: Record<string, string | undefined> = {
              "birth-date": identity.birthDate,
              "first-name": identity.firstName,
              "passport-no": identity.passportNumber,
              surname: identity.surname,
            };
            return field.id in values
              ? { ...field, value: values[field.id] ?? "" }
              : field;
          }),
        })),
      },
    ],
    title: identity.fullName,
  };
}

function applicationPdfText(input: {
  birthDate: string;
  firstName: string;
  passportNumber: string;
  surname: string;
}): string {
  return `
1. Apellido(s)/Фамилия(-и):
${input.surname}
2. Apellido(s) de nacimiento:
${input.surname}
3. Nombre(s)/First name(s):
${input.firstName}
4. Fecha de nacimiento:
${input.birthDate}
5.Lugar de nacimiento:
LENINGRAD
6. País de nacimiento:
Russian Federation
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
${input.passportNumber}
14.Fecha de expedición:
2024-08-08
15. Válido hasta:
2029-08-08
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
}

function exportedSubmission(id: string, agentId: string): Submission {
  const source = initialSubmissions.find((submission) => submission.id === id);
  if (!source) throw new Error(`Missing fixture ${id}`);
  const sourceApplicantName = source.applicants[0]?.fullName ?? "DMITRY ORLOV";
  const [firstName = sourceApplicantName, ...surnameParts] =
    sourceApplicantName.split(/\s+/);
  const submission = withApplicantIdentity(
    {
      ...source,
      agentId,
      exportState: "marked_exported" as const,
      status: "exported" as const,
    },
    {
      firstName,
      fullName: sourceApplicantName,
      passportNumber: "778194570",
      surname: surnameParts.join(" ") || firstName,
    },
  );
  const exportPackage = buildExportPackageIdentity([submission], "xlsx");

  return {
    ...submission,
    exportPackage: exportPackage ?? undefined,
  };
}

function cleanApplicationPdfReview(
  submission: Submission,
): VisaApplicationPdfReviewState {
  const applicant = submission.applicants[0];
  if (!applicant) throw new Error("Missing applicant.");
  const sha256 = "b".repeat(64);
  const storageTarget = buildVisaApplicationPdfStorageTarget({
    applicantId: applicant.id,
    sha256,
    submissionId: submission.id,
  });

  return {
    applicantId: applicant.id,
    applicantName: applicant.fullName,
    artifact: {
      fileName: "778194570_application.pdf",
      mimeType: "application/pdf",
      sha256,
      sizeBytes: 32_000,
      storageBucket: storageTarget.bucket,
      storagePath: storageTarget.path,
      uploadStatus: "uploaded",
      uploadedAtIso: "2026-06-29T08:00:00.000Z",
    },
    checkedAtIso: "2026-06-29T08:01:00.000Z",
    data: {
      passportNumber: "778194570",
    },
    fileName: "778194570_application.pdf",
    findings: [],
    handoffStatus: "ready_for_agent",
    id: `visa-pdf-${submission.id}`,
    status: "clear",
  };
}

function appointmentPdfArtifact(submission: Submission): ReturnedPdfArtifact {
  const sha256 = "a".repeat(64);
  const storageTarget = buildAppointmentPdfStorageTarget({
    sha256,
    submissionId: submission.id,
  });

  return {
    fileName: "STP398400350726_appointment_list_pdf.pdf",
    mimeType: "application/pdf",
    sha256,
    sizeBytes: 24_000,
    storageBucket: storageTarget.bucket,
    storagePath: storageTarget.path,
    uploadStatus: "uploaded",
    uploadedAtIso: "2026-06-29T08:02:00.000Z",
  };
}
