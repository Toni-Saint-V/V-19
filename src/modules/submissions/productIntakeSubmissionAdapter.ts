import {
  createQuestionnaireSections,
  normalizeSubmissionQuestionnaire,
} from './questionnaire';
import { defaultLocalAgentOwnerId } from './ownership';
import { withRecalculatedSubmissionProgress } from './status';
import type {
  Applicant,
  ApplicantRole,
  City,
  Issue,
  PassportExtractedField,
  PassportExtractedFieldKey,
  PassportExtractionReviewState,
  QuestionnaireReviewSource,
  QuestionnaireSection,
  Submission,
  SubmissionFile,
} from './types';
import type {
  ProductApplicantFields,
  ProductApplicantRole,
  ProductFileKind,
  ProductIntakeDraft,
  ProductIntakeFile,
} from './productIntakeFlow';
import { isCity } from './types';

const fallbackCity: City = 'Москва';
const canonicalRequiredFileTypes = ['passport_scan', 'selfie', 'selfie_2'] as const;
const passportQuestionnaireFieldIds = new Set([
  'surname',
  'first-name',
  'birth-date',
  'birth-place',
  'birth-country',
  'nationality',
  'gender',
  'passport-type',
  'passport-no',
  'passport-issue-date',
  'passport-expiry-date',
  'passport-issue-country',
  'passport-issue-place',
]);

const supplementalQuestionnaireSource = 'pdf_reconciliation' satisfies QuestionnaireReviewSource;

function sourceForDraftQuestionnaireField(fieldId: string): QuestionnaireReviewSource {
  return passportQuestionnaireFieldIds.has(fieldId)
    ? 'passport_ocr'
    : supplementalQuestionnaireSource;
}


const draftFieldMap: Array<[keyof ProductApplicantFields, string]> = [
  ['surname', 'surname'],
  ['firstName', 'first-name'],
  ['previousSurname', 'previous-surname'],
  ['birthDate', 'birth-date'],
  ['birthPlace', 'birth-place'],
  ['birthCountry', 'birth-country'],
  ['nationality', 'nationality'],
  ['birthCitizenship', 'birth-citizenship'],
  ['otherCitizenship', 'other-citizenship'],
  ['gender', 'gender'],
  ['maritalStatus', 'marital-status'],
  ['nationalId', 'national-id'],
  ['phone', 'contact-number'],
  ['email', 'email'],
  ['homeAddress', 'home-address'],
  ['homeCountry', 'home-country'],
  ['homeCity', 'home-city'],
  ['postalCode', 'postal-code'],
  ['passportType', 'passport-type'],
  ['passportNo', 'passport-no'],
  ['passportIssuedAt', 'passport-issue-date'],
  ['passportExpiresAt', 'passport-expiry-date'],
  ['passportIssueCountry', 'passport-issue-country'],
  ['passportIssuePlace', 'passport-issue-place'],
  ['occupation', 'occupation'],
  ['occupationSpecify', 'occupation-specify'],
  ['employerName', 'employer-name'],
  ['employerAddress', 'employer-address'],
  ['employerPhone', 'employer-contact'],
  ['costCoveredBy', 'cost-covered-by'],
  ['financeType', 'cost-covered-by'],
  ['meansOfSupport', 'means-of-support'],
  ['mainDestination', 'main-destination'],
  ['firstEntryCountry', 'first-entry-country'],
  ['arrivalDate', 'arrival-date'],
  ['departureDate', 'departure-date'],
  ['stayDuration', 'stay-duration'],
  ['purpose', 'purpose'],
  ['stayPurposeDetails', 'stay-purpose-details'],
  ['entryCount', 'entry-count'],
  ['previousBiometrics', 'previous-biometrics'],
  ['invitingPartyType', 'inviting-party-type'],
  ['hotelName', 'hotel-name'],
  ['hotelCountry', 'hotel-country'],
  ['hotelCity', 'hotel-city'],
  ['hotelPostalCode', 'hotel-postal-code'],
  ['hotelAddress', 'hotel-address'],
  ['hotelEmail', 'hotel-email'],
  ['hotelContact', 'hotel-contact'],
];

export type ProductIntakeSubmissionOptions = {
  agentId?: Submission['agentId'];
  submissionId?: string;
  useIntakeFilesAsLocalDemoUploads?: boolean;
};

function stableToken(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36).padStart(6, '0');
}

function yearFromDate(value: string) {
  const match = /(?:^|\D)(\d{2})\.(\d{2})\.(\d{4})(?:\D|$)/.exec(value);
  return match ? Number(match[3]) : null;
}

function birthCountryFromBirthDate(value: string) {
  const year = yearFromDate(value);
  if (!year) return '';
  return year <= 1990 ? 'USSR' : 'Russian Federation';
}

function normalizeCountry(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'RUSSIAN FEDERATION' || normalized === 'RUS') return 'Russian Federation';
  if (normalized === 'USSR') return 'USSR';
  if (normalized === 'ESP' || normalized === 'SPAIN') return 'Spain';
  return value;
}

function normalizeGender(value: string) {
  if (value === 'M') return 'Мужской';
  if (value === 'F') return 'Женский';
  return value;
}

function normalizePassportType(value: string) {
  return value.trim().toUpperCase() === 'P' ? 'Ordinary Passport' : value;
}

function splitTripDates(value: string) {
  const [arrival = '', departure = ''] = value.split(/\s+[–-]\s+/);
  return { arrival: arrival.trim(), departure: departure.trim() };
}

function roleFromDraft(role: ProductApplicantRole): ApplicantRole {
  if (role === 'spouse') return 'spouse';
  if (role === 'child') return 'child';
  return 'main';
}

function finalIntakeFiles(draft: ProductIntakeDraft) {
  return draft.files.filter((file) =>
    ['recognized', 'needs_review', 'failed'].includes(file.status),
  );
}

function filesOfKind(draft: ProductIntakeDraft, kind: ProductFileKind) {
  return finalIntakeFiles(draft).filter((file) => file.kind === kind);
}

function normalizedName(value: string) {
  return value.trim().toLocaleLowerCase('ru-RU');
}

function looksLikeSelfie2(file: ProductIntakeFile) {
  return /(^|[^a-zа-я0-9])(selfie[_\s-]*2|селфи[_\s-]*2|2[_\s-]*selfie|2[_\s-]*селфи|profile|side|профиль|боком)([^a-zа-я0-9]|$)/i.test(
    normalizedName(file.name),
  );
}

function intakeFileForRequiredSlot(
  draft: ProductIntakeDraft,
  applicantIndex: number,
  type: (typeof canonicalRequiredFileTypes)[number],
) {
  if (type === 'passport_scan') {
    const passports = filesOfKind(draft, 'passport');
    return passports[applicantIndex] ?? (draft.type === 'single' ? passports[0] : undefined);
  }

  const photos = filesOfKind(draft, 'photo');
  const namedSecondSelfies = photos.filter(looksLikeSelfie2);
  const namedFirstSelfies = photos.filter((file) => !looksLikeSelfie2(file));
  const pairOffset = applicantIndex * 2;

  if (type === 'selfie_2') {
    return (
      namedSecondSelfies[applicantIndex] ??
      photos[pairOffset + 1] ??
      (draft.type === 'single' ? namedSecondSelfies[0] : undefined)
    );
  }

  return (
    namedFirstSelfies[applicantIndex] ??
    photos[pairOffset] ??
    (draft.type === 'single' ? namedFirstSelfies[0] : undefined)
  );
}

function fileStatusFromIntake(file: ProductIntakeFile | undefined): SubmissionFile['status'] {
  if (!file) return 'missing';
  if (file.status === 'failed') return 'needs_replacement';
  if (file.status === 'recognized') return 'accepted';
  return 'pending_review';
}

function buildRequiredFiles(
  draft: ProductIntakeDraft,
  applicants: Applicant[],
  submissionId: string,
  useIntakeFilesAsLocalDemoUploads: boolean,
): SubmissionFile[] {
  return applicants.flatMap((applicant, applicantIndex) =>
    canonicalRequiredFileTypes.map((type) => {
      const intakeFile = useIntakeFilesAsLocalDemoUploads
        ? intakeFileForRequiredSlot(draft, applicantIndex, type)
        : undefined;

      return {
        id: `file-${stableToken(`${submissionId}:${applicant.id}:${type}`)}-${type}`,
        applicantId: applicant.id,
        generatedFileName: intakeFile?.name,
        originalFileName: intakeFile?.name,
        status: fileStatusFromIntake(intakeFile),
        type,
        uploadedAtIso: intakeFile ? draft.createdAtIso : undefined,
        uploadStatus: intakeFile ? 'uploaded' : 'none',
      } satisfies SubmissionFile;
    }),
  );
}

const passportExtractionFieldMap: Array<[
  keyof ProductApplicantFields,
  PassportExtractedFieldKey,
]> = [
  ['surname', 'surname'],
  ['firstName', 'firstName'],
  ['birthDate', 'birthDate'],
  ['birthPlace', 'birthPlace'],
  ['nationality', 'citizenship'],
  ['gender', 'gender'],
  ['passportType', 'passportType'],
  ['passportNo', 'passportNumber'],
  ['passportIssuedAt', 'passportIssuedAt'],
  ['passportExpiresAt', 'passportExpiresAt'],
  ['passportIssueCountry', 'passportIssueCountry'],
  ['passportIssuePlace', 'passportIssuePlace'],
];

function normalizedPassportExtractionValue(
  draftKey: keyof ProductApplicantFields,
  rawValue: string,
) {
  if (draftKey === 'nationality' || draftKey === 'passportIssueCountry') {
    return normalizeCountry(rawValue);
  }
  if (draftKey === 'gender') return normalizeGender(rawValue);
  if (draftKey === 'passportType') return normalizePassportType(rawValue);
  return rawValue;
}

function passportExtractionFromDraft(
  draft: ProductIntakeDraft,
  applicant: ProductIntakeDraft['applicants'][number],
  applicantIndex: number,
): PassportExtractionReviewState | undefined {
  const passportFile = filesOfKind(draft, 'passport')[applicantIndex] ??
    (draft.type === 'single' ? filesOfKind(draft, 'passport')[0] : undefined);

  if (!passportFile) return undefined;

  const extractedFields = passportExtractionFieldMap.flatMap(([draftKey, key]) => {
    const rawValue = String(applicant.fields[draftKey] ?? '').trim();
    if (!rawValue) return [];

    return [
      {
        confidence: passportFile.status === 'recognized' ? 'high' : 'medium',
        key,
        needsManualReview: passportFile.status !== 'recognized',
        source: 'passport_scan',
        value: normalizedPassportExtractionValue(draftKey, rawValue),
      } satisfies PassportExtractedField,
    ];
  });

  return {
    appliedFieldKeys: extractedFields.map((field) => field.key),
    attemptCount: 1,
    extractedFields,
    lastAttemptAtIso: draft.createdAtIso,
    sourceFileId: passportFile.id,
    sourceFileName: passportFile.name,
    status:
      passportFile.status === 'failed'
        ? 'failed'
        : extractedFields.length
          ? 'ready'
          : 'unavailable',
    summary:
      passportFile.status === 'recognized'
        ? 'Паспортные данные перенесены в анкету.'
        : passportFile.issue ?? 'Паспортные данные требуют ручной сверки.',
  };
}

function sectionsFromDraftApplicant(
  draft: ProductIntakeDraft,
  applicant: ProductIntakeDraft['applicants'][number],
): QuestionnaireSection[] {
  const tripDates = splitTripDates(applicant.fields.tripDates || draft.tripDates);
  const values = new Map<string, { source?: QuestionnaireReviewSource; value: string }>();

  const setValue = (
    fieldId: string,
    value: string | undefined,
    source?: QuestionnaireReviewSource,
  ) => {
    const normalized = String(value ?? '').trim();
    if (!normalized || values.has(fieldId)) return;
    values.set(fieldId, { source, value: normalized });
  };

  for (const [draftKey, fieldId] of draftFieldMap) {
    const rawValue = String(applicant.fields[draftKey] ?? '').trim();
    if (!rawValue) continue;
    const source = sourceForDraftQuestionnaireField(fieldId);
    if (draftKey === 'nationality' || draftKey === 'passportIssueCountry' || draftKey === 'homeCountry' || draftKey === 'birthCountry' || draftKey === 'birthCitizenship' || draftKey === 'otherCitizenship' || draftKey === 'hotelCountry' || draftKey === 'mainDestination' || draftKey === 'firstEntryCountry') {
      setValue(fieldId, normalizeCountry(rawValue), source);
    } else if (draftKey === 'gender') {
      setValue(fieldId, normalizeGender(rawValue), source);
    } else if (draftKey === 'passportType') {
      setValue(fieldId, normalizePassportType(rawValue), source);
    } else {
      setValue(fieldId, rawValue, source);
    }
  }

  setValue('appointment-city', draft.city);
  setValue('visa-type', 'Шенгенская');
  setValue('category', 'Normal');
  setValue('birth-country', applicant.fields.birthCountry || birthCountryFromBirthDate(applicant.fields.birthDate));
  setValue('birth-citizenship', applicant.fields.birthCitizenship || birthCountryFromBirthDate(applicant.fields.birthDate));
  setValue('arrival-date', applicant.fields.arrivalDate || tripDates.arrival, applicant.fields.arrivalDate ? supplementalQuestionnaireSource : undefined);
  setValue('departure-date', applicant.fields.departureDate || tripDates.departure, applicant.fields.departureDate ? supplementalQuestionnaireSource : undefined);
  setValue('stay-duration', applicant.fields.stayDuration, supplementalQuestionnaireSource);
  if (!values.get('passport-type')) setValue('passport-type', 'Ordinary Passport');
  if (!values.get('passport-issue-country')) setValue('passport-issue-country', 'Russian Federation');
  if (!values.get('nationality')) setValue('nationality', 'Russian Federation');
  if (!values.get('home-country')) setValue('home-country', 'Russian Federation');
  if (!values.get('lives-outside-citizenship')) setValue('lives-outside-citizenship', 'Нет');
  if (!values.get('purpose')) setValue('purpose', 'TOURISM');
  if (!values.get('main-destination')) setValue('main-destination', 'Spain');
  if (!values.get('first-entry-country')) setValue('first-entry-country', 'Spain');
  if (!values.get('entry-count')) setValue('entry-count', 'Многократная');
  if (!values.get('previous-biometrics')) setValue('previous-biometrics', 'Нет');
  if (!values.get('inviting-party-type')) setValue('inviting-party-type', 'Гостиница/временное жилье');
  if (!values.get('hotel-country')) setValue('hotel-country', 'Spain');
  if (!values.get('cost-covered-by')) setValue('cost-covered-by', 'Сам заявитель');
  if (!values.get('means-of-support')) setValue('means-of-support', 'Наличные');

  return createQuestionnaireSections(applicant.id, applicant.fullName, 'partial').map(
    (section) => ({
      ...section,
      fields: section.fields.map((field) => {
        const entry = values.get(field.id);
        if (!entry) return field;
        return {
          ...field,
          value: entry.value,
          ...(entry.source
            ? {
                reviewSource: entry.source,
                reviewState: 'needs_review' as const,
              }
            : {}),
        };
      }),
    }),
  );
}


function issueApplicantId(
  issue: ProductIntakeDraft['issues'][number],
  applicants: Applicant[],
  draft: ProductIntakeDraft,
) {
  const fileId = issue.id.replace(/-(blocker|warning|info)$/u, '');
  const passportIndex = filesOfKind(draft, 'passport').findIndex((file) => file.id === fileId);
  if (passportIndex >= 0) return applicants[passportIndex]?.id ?? applicants[0]?.id;
  const photoIndex = filesOfKind(draft, 'photo').findIndex((file) => file.id === fileId);
  if (photoIndex >= 0) return applicants[photoIndex]?.id ?? applicants[0]?.id;
  return applicants[0]?.id;
}

export function productIntakeDraftToSubmission(
  draft: ProductIntakeDraft,
  options: ProductIntakeSubmissionOptions = {},
): Submission {
  const submissionId = options.submissionId || draft.id;
  const agentId = options.agentId ?? defaultLocalAgentOwnerId;
  const city = isCity(draft.city) ? draft.city : fallbackCity;
  const tripDates = splitTripDates(draft.tripDates);
  const applicants: Applicant[] = draft.applicants.map((applicant, applicantIndex) => ({
    id: applicant.id,
    fullName: applicant.fullName,
    role: roleFromDraft(applicant.role),
    questionnaireStatus: 'partial',
    fileStatus: 'empty',
    passportExtraction: passportExtractionFromDraft(draft, applicant, applicantIndex),
    sections: sectionsFromDraftApplicant(draft, applicant),
  }));
  const files = buildRequiredFiles(
    draft,
    applicants,
    submissionId,
    options.useIntakeFilesAsLocalDemoUploads ?? true,
  );
  const issues: Issue[] = draft.issues.filter((issue) => issue.severity === 'blocker').map((issue) => {
    const applicantId = issueApplicantId(issue, applicants, draft) ?? 'applicant-1';
    const applicant = applicants.find((candidate) => candidate.id === applicantId);
    return {
      id: issue.id,
      type: issue.severity === 'blocker' ? 'file' : 'section',
      target: {
        applicantId,
        applicantName: applicant?.fullName ?? draft.title,
        section: issue.severity === 'blocker' ? 'Файлы' : 'Сверка OCR',
      },
      reason: issue.title,
      comment: issue.description,
      severity: issue.severity,
      status: 'open',
      createdBy: 'system',
      createdAt: draft.createdAtIso,
    } satisfies Issue;
  });

  return withRecalculatedSubmissionProgress(normalizeSubmissionQuestionnaire({
    id: submissionId,
    agentId,
    title: draft.title,
    type: draft.type,
    country: 'Испания',
    countryCode: 'ES',
    city,
    tripDateFrom: tripDates.arrival,
    tripDateTo: tripDates.departure,
    status: 'draft',
    applicants,
    issues,
    files,
    completeness: {
      questionnaire: draft.readyPercent,
      files: files.length
        ? Math.round((files.filter((file) => file.status !== 'missing').length / files.length) * 100)
        : 0,
      total: draft.readyPercent,
    },
    createdAt: draft.createdAtIso,
    updatedAt: draft.createdAtIso,
    history: [
      {
        id: `${draft.id}-created`,
        text: 'Черновик анкеты собран из OCR',
        at: draft.createdAtIso,
        source: 'system',
      },
    ],
  }));
}
