import { useEffect, useMemo, useState } from 'react';
import { emitVisaflowUiEvent, useVisaflowBusinessBridge } from '../integration/visaflowBusinessBridge';
import { FigmaQuestionnaireScreen } from '../modules/submissions/components/FigmaQuestionnaireScreen';
import {
  createQuestionnaireSections,
  normalizeSubmissionQuestionnaire,
  updateQuestionnaireField,
  type QuestionnaireFieldUpdate,
} from '../modules/submissions/questionnaire';
import { defaultLocalAgentOwnerId } from '../modules/submissions/ownership';
import { applySubmissionActionResult } from '../modules/submissions/status';
import {
  isCity,
  type Applicant,
  type ApplicantRole,
  type City,
  type Issue,
  type QuestionnaireSection,
  type Submission,
  type SubmissionFile,
} from '../modules/submissions/types';
import type {
  ProductApplicantFields,
  ProductApplicantRole,
  ProductFileKind,
  ProductIntakeDraft,
} from '../modules/submissions/productIntakeFlow';

interface QuestionnaireScreenProps {
  agentId?: Submission['agentId'];
  submissionId: string;
  onBack: () => void;
  draft?: ProductIntakeDraft;
  submission?: Submission;
  onSaveDraft?: (submissionId: string) => void | Promise<void>;
  onSubmissionChange?: (submission: Submission) => void | Promise<void>;
  onSubmitForReview?: (submissionId: string) => void | Promise<void>;
}

const fallbackCity: City = 'Москва';

const draftFieldMap: Array<[keyof ProductApplicantFields, string]> = [
  ['surname', 'surname'],
  ['firstName', 'first-name'],
  ['birthDate', 'birth-date'],
  ['birthPlace', 'birth-place'],
  ['nationality', 'nationality'],
  ['gender', 'gender'],
  ['phone', 'contact-number'],
  ['email', 'email'],
  ['passportType', 'passport-type'],
  ['passportNo', 'passport-no'],
  ['passportIssuedAt', 'passport-issue-date'],
  ['passportExpiresAt', 'passport-expiry-date'],
  ['passportIssueCountry', 'passport-issue-country'],
  ['passportIssuePlace', 'passport-issue-place'],
  ['occupation', 'occupation'],
  ['employerName', 'employer-name'],
  ['employerAddress', 'employer-address'],
  ['employerPhone', 'employer-contact'],
  ['financeType', 'cost-covered-by'],
  ['mainDestination', 'main-destination'],
  ['firstEntryCountry', 'first-entry-country'],
  ['purpose', 'purpose'],
  ['entryCount', 'entry-count'],
  ['hotelName', 'hotel-name'],
  ['hotelAddress', 'hotel-address'],
];

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

function submissionFileType(kind: ProductFileKind): SubmissionFile['type'] {
  if (kind === 'passport') return 'passport_scan';
  if (kind === 'photo') return 'selfie';
  return 'passport_scan';
}

function sectionsFromDraftApplicant(draft: ProductIntakeDraft, applicant: ProductIntakeDraft['applicants'][number]): QuestionnaireSection[] {
  const tripDates = splitTripDates(applicant.fields.tripDates || draft.tripDates);
  const values = new Map<string, string>();

  for (const [draftKey, fieldId] of draftFieldMap) {
    const rawValue = String(applicant.fields[draftKey] ?? '').trim();
    if (!rawValue) continue;
    if (draftKey === 'nationality' || draftKey === 'passportIssueCountry') {
      values.set(fieldId, normalizeCountry(rawValue));
    } else if (draftKey === 'gender') {
      values.set(fieldId, normalizeGender(rawValue));
    } else if (draftKey === 'passportType') {
      values.set(fieldId, normalizePassportType(rawValue));
    } else {
      values.set(fieldId, rawValue);
    }
  }

  values.set('appointment-city', draft.city);
  values.set('visa-type', 'Шенгенская');
  values.set('birth-country', birthCountryFromBirthDate(applicant.fields.birthDate));
  values.set('birth-citizenship', birthCountryFromBirthDate(applicant.fields.birthDate));
  values.set('arrival-date', tripDates.arrival);
  values.set('departure-date', tripDates.departure);
  if (!values.get('main-destination')) values.set('main-destination', 'Spain');
  if (!values.get('first-entry-country')) values.set('first-entry-country', 'Spain');

  return createQuestionnaireSections(applicant.id, applicant.fullName, 'partial').map((section) => ({
    ...section,
    fields: section.fields.map((field) => {
      const value = values.get(field.id);
      if (!value) return field;
      return {
        ...field,
        value,
        reviewSource: 'passport_ocr',
        reviewState: 'needs_review',
      };
    }),
  }));
}

function draftToSubmission(
  draft: ProductIntakeDraft,
  submissionId: string,
  agentId: Submission['agentId'] = defaultLocalAgentOwnerId,
): Submission {
  const city = isCity(draft.city) ? draft.city : fallbackCity;
  const tripDates = splitTripDates(draft.tripDates);
  const applicants: Applicant[] = draft.applicants.map((applicant) => ({
    id: applicant.id,
    fullName: applicant.fullName,
    role: roleFromDraft(applicant.role),
    questionnaireStatus: 'partial',
    fileStatus: draft.files.length ? 'partial' : 'empty',
    sections: sectionsFromDraftApplicant(draft, applicant),
  }));
  const mainApplicant = applicants[0];

  const files: SubmissionFile[] = draft.files.map((file) => ({
    id: file.id,
    applicantId: mainApplicant?.id ?? 'applicant-1',
    type: submissionFileType(file.kind),
    status: file.status === 'failed' ? 'needs_replacement' : file.status === 'recognized' ? 'accepted' : 'uploaded',
    originalFileName: file.name,
    uploadedAtIso: draft.createdAtIso,
  }));

  const issues: Issue[] = draft.issues.map((issue) => ({
    id: issue.id,
    type: issue.severity === 'blocker' ? 'file' : 'section',
    target: {
      applicantId: mainApplicant?.id ?? 'applicant-1',
      applicantName: mainApplicant?.fullName ?? draft.title,
      section: issue.severity === 'blocker' ? 'Файлы' : 'Сверка OCR',
    },
    reason: issue.title,
    comment: issue.description,
    severity: issue.severity,
    status: 'open',
    createdBy: 'system',
    createdAt: draft.createdAtIso,
  }));

  return normalizeSubmissionQuestionnaire({
    id: submissionId || draft.id,
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
      files: draft.files.length ? Math.round(draft.files.reduce((sum, file) => sum + file.progress, 0) / draft.files.length) : 0,
      total: draft.readyPercent,
    },
    createdAt: draft.createdAtIso,
    updatedAt: draft.createdAtIso,
    history: [
      {
        id: `${draft.id}-created`,
        text: 'Черновик собран из OCR',
        at: draft.createdAtIso,
        source: 'system',
      },
    ],
  });
}

function fallbackSubmission(
  submissionId: string,
  agentId: Submission['agentId'] = defaultLocalAgentOwnerId,
): Submission {
  const createdAt = new Date().toISOString();
  return normalizeSubmissionQuestionnaire({
    id: submissionId,
    agentId,
    title: 'Новая анкета',
    type: 'single',
    country: 'Испания',
    countryCode: 'ES',
    city: fallbackCity,
    tripDateFrom: '',
    tripDateTo: '',
    status: 'draft',
    applicants: [
      {
        id: 'applicant-1',
        fullName: 'Заявитель',
        role: 'main',
        questionnaireStatus: 'empty',
        fileStatus: 'empty',
        sections: createQuestionnaireSections('applicant-1', 'Заявитель', 'empty'),
      },
    ],
    issues: [],
    files: [],
    completeness: { questionnaire: 0, files: 0, total: 0 },
    createdAt,
    updatedAt: createdAt,
    history: [],
  });
}

export function QuestionnaireScreen({
  agentId,
  submissionId,
  onBack,
  draft,
  submission,
  onSaveDraft,
  onSubmissionChange,
  onSubmitForReview,
}: QuestionnaireScreenProps) {
  const bridge = useVisaflowBusinessBridge();
  const sourceSubmission = useMemo(
    () => submission ?? (draft ? draftToSubmission(draft, submissionId, agentId) : fallbackSubmission(submissionId, agentId)),
    [agentId, draft, submission, submissionId],
  );
  const [workingSubmission, setWorkingSubmission] = useState(sourceSubmission);

  useEffect(() => {
    setWorkingSubmission(sourceSubmission);
  }, [sourceSubmission]);

  const handleComplete = (payload: { fieldUpdates: QuestionnaireFieldUpdate[] }) => {
    const updatedSubmission = payload.fieldUpdates.reduce(
      (nextSubmission, update) =>
        updateQuestionnaireField(nextSubmission, {
          ...update,
          reviewSource: 'manual',
          reviewState: 'confirmed',
        }),
      workingSubmission,
    );
    const savedResult = applySubmissionActionResult(
      updatedSubmission,
      'save_progress',
      'agent',
      updatedSubmission.agentId,
    );
    const savedSubmission = savedResult.ok ? savedResult.data : updatedSubmission;
    const submittedResult = applySubmissionActionResult(
      savedSubmission,
      'submit_for_review',
      'agent',
      savedSubmission.agentId,
    );
    const nextSubmission = submittedResult.ok ? submittedResult.data : savedSubmission;

    setWorkingSubmission(nextSubmission);
    void onSubmissionChange?.(nextSubmission);

    if (submittedResult.ok) {
      void onSubmitForReview?.(nextSubmission.id);
      const actionPayload = {
        submissionId: nextSubmission.id,
        action: 'submit_for_review' as const,
        source: 'agent' as const,
      };
      emitVisaflowUiEvent(bridge, { type: 'submission.action', payload: actionPayload });
      return;
    }

    void onSaveDraft?.(nextSubmission.id);
    if (savedResult.ok) {
      const actionPayload = {
        submissionId: nextSubmission.id,
        action: 'save_progress' as const,
        source: 'agent' as const,
      };
      emitVisaflowUiEvent(bridge, { type: 'submission.action', payload: actionPayload });
    }
  };

  return (
    <FigmaQuestionnaireScreen
      submission={workingSubmission}
      onBack={onBack}
      onComplete={handleComplete}
    />
  );
}
