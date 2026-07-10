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
import {
  applySubmissionActionResult,
  withRecalculatedSubmissionProgress,
} from '../modules/submissions/status';
import { productIntakeDraftToSubmission } from '../modules/submissions/productIntakeSubmissionAdapter';
import type { City, Submission } from '../modules/submissions/types';
import type { ProductIntakeDraft } from '../modules/submissions/productIntakeFlow';

interface QuestionnaireScreenProps {
  agentId?: Submission['agentId'];
  submissionId: string;
  onBack: () => void;
  draft?: ProductIntakeDraft;
  submission?: Submission;
  onUploadFile?: (fileId: string, file: File) => void | Promise<void>;
  onSaveDraft?: (submissionId: string) => void | Promise<void>;
  onSubmissionChange?: (submission: Submission) => void | Promise<void>;
  onSubmitForReview?: (submissionId: string) => void | Promise<void>;
}

type QuestionnaireCommitPayload = {
  fieldUpdates: QuestionnaireFieldUpdate[];
  focusedUpdate?: QuestionnaireFieldUpdate;
  travelEnd: string;
  travelStart: string;
};

const fallbackCity: City = 'Москва';

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

function questionnaireUpdateKey(update: QuestionnaireFieldUpdate) {
  return `${update.applicantId}:${update.sectionId}:${update.fieldId}`;
}

function uniqueQuestionnaireUpdates(
  updates: Array<QuestionnaireFieldUpdate | undefined>,
) {
  const byKey = new Map<string, QuestionnaireFieldUpdate>();
  for (const update of updates) {
    if (!update) continue;
    byKey.set(questionnaireUpdateKey(update), update);
  }
  return [...byKey.values()];
}

function applyQuestionnairePayload(
  submission: Submission,
  payload: QuestionnaireCommitPayload,
) {
  const updates = uniqueQuestionnaireUpdates([
    ...payload.fieldUpdates,
    payload.focusedUpdate,
  ]);
  const withFields = updates.reduce(
    (nextSubmission, update) =>
      updateQuestionnaireField(nextSubmission, {
        ...update,
        reviewOriginSource: update.reviewOriginSource ?? update.reviewSource,
        reviewSource: 'manual',
        reviewState: 'confirmed',
      }),
    submission,
  );
  const travelStart = payload.travelStart.trim();
  const travelEnd = payload.travelEnd.trim();

  return withRecalculatedSubmissionProgress(
    normalizeSubmissionQuestionnaire({
      ...withFields,
      tripDateFrom: travelStart || withFields.tripDateFrom,
      tripDateTo: travelEnd || withFields.tripDateTo,
      updatedAt: new Date().toISOString(),
    }),
  );
}

function confirmAnsweredQuestionnaireFields(
  submission: Submission,
  actorId: string,
  nowIso: string,
): Submission {
  return withRecalculatedSubmissionProgress(
    normalizeSubmissionQuestionnaire({
      ...submission,
      applicants: submission.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) => {
            if (!field.value.trim() || field.error) return field;
            return {
              ...field,
              reviewConfirmedAtIso: nowIso,
              reviewConfirmedBy: actorId,
              reviewOriginSource: field.reviewOriginSource ?? field.reviewSource,
              reviewSource: 'manual',
              reviewState: 'confirmed',
            };
          }),
        })),
      })),
      updatedAt: nowIso,
    }),
  );
}

function markPassportExtractionVerifiedForSubmit(
  submission: Submission,
  nowIso: string,
): Submission {
  return {
    ...submission,
    applicants: submission.applicants.map((applicant) => {
      const extraction = applicant.passportExtraction;
      if (!extraction || extraction.status !== 'ready') return applicant;

      return {
        ...applicant,
        passportExtraction: {
          ...extraction,
          extractedFields: extraction.extractedFields.map((field) => ({
            ...field,
            needsManualReview: false,
            verified: true,
          })),
          verifiedAtIso: nowIso,
        },
      };
    }),
    updatedAt: nowIso,
  };
}

function appendLocalHistory(
  submission: Submission,
  text: string,
  source: 'agent' | 'system' = 'agent',
): Submission {
  const nowIso = new Date().toISOString();
  return {
    ...submission,
    updatedAt: nowIso,
    history: [
      {
        id: `${submission.id}-${source}-${Date.now()}`,
        text,
        at: nowIso,
        source,
      },
      ...submission.history,
    ],
  };
}

export function QuestionnaireScreen({
  agentId,
  submissionId,
  onBack,
  draft,
  submission,
  onUploadFile,
  onSaveDraft,
  onSubmissionChange,
  onSubmitForReview,
}: QuestionnaireScreenProps) {
  const bridge = useVisaflowBusinessBridge();
  const sourceSubmission = useMemo(
    () =>
      submission ??
      (draft
        ? productIntakeDraftToSubmission(draft, {
            agentId,
            submissionId,
            useIntakeFilesAsLocalDemoUploads: true,
          })
        : fallbackSubmission(submissionId, agentId)),
    [agentId, draft, submission, submissionId],
  );
  const [workingSubmission, setWorkingSubmission] = useState(sourceSubmission);

  useEffect(() => {
    setWorkingSubmission(sourceSubmission);
  }, [sourceSubmission]);

  const persistSubmission = (nextSubmission: Submission) => {
    setWorkingSubmission(nextSubmission);
    void onSubmissionChange?.(nextSubmission);
  };

  const handleSaveDraft = (payload: QuestionnaireCommitPayload) => {
    const nextSubmission = appendLocalHistory(
      applyQuestionnairePayload(workingSubmission, payload),
      'Черновик анкеты сохранён',
    );

    persistSubmission(nextSubmission);
    void onSaveDraft?.(nextSubmission.id);
  };

  const handleComplete = (payload: QuestionnaireCommitPayload) => {
    const nowIso = new Date().toISOString();
    const actorId = workingSubmission.agentId;
    const preparedSubmission = withRecalculatedSubmissionProgress(
      markPassportExtractionVerifiedForSubmit(
        confirmAnsweredQuestionnaireFields(
          applyQuestionnairePayload(workingSubmission, payload),
          actorId,
          nowIso,
        ),
        nowIso,
      ),
    );

    const savedResult =
      preparedSubmission.status === 'draft'
        ? applySubmissionActionResult(
            preparedSubmission,
            'save_progress',
            'agent',
            actorId,
          )
        : { ok: true as const, data: preparedSubmission };
    const savedSubmission = savedResult.ok ? savedResult.data : preparedSubmission;
    const submittedResult = applySubmissionActionResult(
      savedSubmission,
      'submit_for_review',
      'agent',
      actorId,
    );
    const submitSucceeded = 'data' in submittedResult;
    const nextSubmission = submitSucceeded ? submittedResult.data : savedSubmission;

    persistSubmission(nextSubmission);

    if (submitSucceeded) {
      void onSubmitForReview?.(nextSubmission.id);
      emitVisaflowUiEvent(bridge, {
        type: 'submission.action',
        payload: {
          submissionId: nextSubmission.id,
          action: 'submit_for_review',
          source: 'agent',
        },
      });
      return;
    }

    void onSaveDraft?.(nextSubmission.id);
    if (typeof window !== 'undefined' && 'error' in submittedResult) {
      window.alert(submittedResult.error.message);
    }
  };

  return (
    <FigmaQuestionnaireScreen
      submission={workingSubmission}
      onBack={onBack}
      onComplete={handleComplete}
      onSaveDraft={handleSaveDraft}
      onUploadFile={onUploadFile}
    />
  );
}
