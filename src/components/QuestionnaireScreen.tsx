import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  emitVisaflowUiEvent,
  useVisaflowBusinessBridge,
} from "../integration/visaflowBusinessBridge";
import {
  FigmaQuestionnaireScreen,
  type QuestionnaireInitialFocus,
  type QuestionnaireDocumentsFilter,
} from "../modules/submissions/components/FigmaQuestionnaireScreen";
import {
  createQuestionnaireSections,
  normalizeSubmissionQuestionnaire,
  type QuestionnaireFieldUpdate,
} from "../modules/submissions/questionnaire";
import { updateQuestionnaireField } from "../modules/submissions/submissionActions";
import { defaultLocalAgentOwnerId } from "../modules/submissions/ownership";
import { confirmApplicantPassportReview } from "../modules/submissions/passportExtraction";
import {
  applySubmissionActionResult,
  markSubmissionIssueFixedResult,
  withRecalculatedSubmissionProgress,
} from "../modules/submissions/status";
import type {
  City,
  PassportExtractedFieldKey,
  Submission,
} from "../modules/submissions/types";
import { blsQuestionnaireReadiness } from "../modules/submissions/questionnaireBlsRules";
import type { PublicNumberAssignment } from "../modules/submissions/supabasePersistence";

interface QuestionnaireScreenProps {
  agentId?: Submission["agentId"];
  initialFocus?: QuestionnaireInitialFocus;
  submissionId: string;
  onBack: () => void;
  onAssignPublicNumber?: (submissionId: string) => Promise<PublicNumberAssignment>;
  onSavedAndExit?: (submission: Submission) => void | Promise<void>;
  onOpenDocuments?: (filter?: QuestionnaireDocumentsFilter) => void;
  submission?: Submission;
  onUploadFile?: (fileId: string, file: File) => void | Promise<void>;
  onSaveDraft?: (submissionId: string) => void | Promise<void>;
  onMarkIssueFixed?: (issueId: string) => Promise<Submission>;
  onSubmissionUpdate?: (
    update: (submission: Submission) => Submission,
  ) => Promise<Submission>;
  onSubmissionChange?: (submission: Submission) => void | Promise<void>;
  onSubmitForReview?: (submissionId: string) => void | Promise<void>;
}

type QuestionnaireCommitPayload = {
  fieldUpdates: QuestionnaireFieldUpdate[];
  focusedUpdate?: QuestionnaireFieldUpdate;
  reviewConfirmations?: QuestionnaireReviewConfirmation[];
  saveIntent?: "autosave" | "completion" | "manual" | "navigation";
  travelEnd: string;
  travelStart: string;
};

type QuestionnaireReviewConfirmation = {
  applicantId: string;
  fieldId: string;
  sectionId: string;
};

const questionnaireFieldIdByPassportExtractionKey: Record<
  PassportExtractedFieldKey,
  string
> = {
  birthCountry: "birth-country",
  birthDate: "birth-date",
  birthPlace: "birth-place",
  citizenship: "nationality",
  firstName: "first-name",
  gender: "gender",
  passportExpiresAt: "passport-expiry-date",
  passportIssueCountry: "passport-issue-country",
  passportIssuePlace: "passport-issue-place",
  passportIssuedAt: "passport-issue-date",
  passportNumber: "passport-no",
  passportType: "passport-type",
  surname: "surname",
};

const fallbackCity: City = "Москва";

function fallbackSubmission(
  submissionId: string,
  agentId: Submission["agentId"] = defaultLocalAgentOwnerId,
): Submission {
  const createdAt = new Date().toISOString();
  return normalizeSubmissionQuestionnaire({
    id: submissionId,
    publicNumber: null,
    agentId,
    title: "Новая анкета",
    type: "single",
    country: "Испания",
    countryCode: "ES",
    city: fallbackCity,
    tripDateFrom: "",
    tripDateTo: "",
    status: "draft",
    applicants: [
      {
        id: "applicant-1",
        fullName: "Заявитель",
        role: "main",
        questionnaireStatus: "empty",
        fileStatus: "empty",
        sections: createQuestionnaireSections("applicant-1", "Заявитель", "empty"),
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

function questionnaireReviewConfirmationKey(
  input: Pick<QuestionnaireReviewConfirmation, "applicantId" | "fieldId">,
) {
  return `${input.applicantId}:${input.fieldId}`;
}

function questionnaireSectionMatches(sectionId: string, expectedSectionId: string) {
  return sectionId === expectedSectionId || sectionId.endsWith(`-${expectedSectionId}`);
}

function applyQuestionnaireReviewConfirmations(
  submission: Submission,
  confirmations: QuestionnaireReviewConfirmation[],
  actorId: string,
  nowIso: string,
) {
  if (!confirmations.length) return submission;

  const confirmationKeys = new Set(
    confirmations.map((confirmation) => questionnaireReviewConfirmationKey(confirmation)),
  );
  const confirmationSections = new Map(
    confirmations.map((confirmation) => [
      questionnaireReviewConfirmationKey(confirmation),
      confirmation.sectionId,
    ]),
  );

  return {
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      sections: applicant.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) => {
          const key = questionnaireReviewConfirmationKey({
            applicantId: applicant.id,
            fieldId: field.id,
          });
          const expectedSectionId = confirmationSections.get(key);
          if (
            !confirmationKeys.has(key) ||
            !expectedSectionId ||
            !questionnaireSectionMatches(section.id, expectedSectionId) ||
            !field.value.trim() ||
            field.error
          ) {
            return field;
          }

          return {
            ...field,
            reviewConfirmedAtIso: nowIso,
            reviewConfirmedBy: actorId,
            reviewOriginSource: field.reviewOriginSource ?? field.reviewSource,
            reviewSource: "manual" as const,
            reviewState: "confirmed" as const,
          };
        }),
      })),
    })),
    updatedAt: nowIso,
  };
}

function synchronizePassportExtractionConfirmations(
  submission: Submission,
  fieldUpdates: QuestionnaireFieldUpdate[],
  confirmations: QuestionnaireReviewConfirmation[],
  nowIso: string,
) {
  const updatedKeys = new Set(
    fieldUpdates.map((update) => questionnaireReviewConfirmationKey(update)),
  );
  const confirmationKeys = new Set(
    confirmations.map((confirmation) => questionnaireReviewConfirmationKey(confirmation)),
  );

  return {
    ...submission,
    applicants: submission.applicants.map((applicant) => {
      const extraction = applicant.passportExtraction;
      if (!extraction || extraction.status !== "ready" || !extraction.extractedFields.length) {
        return applicant;
      }

      const questionnaireFields = new Map(
        applicant.sections
          .flatMap((section) => section.fields)
          .map((field) => [field.id, field]),
      );
      const extractedFields = extraction.extractedFields.map((field) => {
        const questionnaireFieldId = questionnaireFieldIdByPassportExtractionKey[field.key];
        const key = questionnaireReviewConfirmationKey({
          applicantId: applicant.id,
          fieldId: questionnaireFieldId,
        });
        const questionnaireField = questionnaireFields.get(questionnaireFieldId);
        const explicitlyConfirmed =
          confirmationKeys.has(key) &&
          questionnaireField?.reviewState === "confirmed" &&
          Boolean(questionnaireField.reviewConfirmedAtIso);
        const previouslyConfirmed =
          questionnaireField?.reviewState === "confirmed" &&
          Boolean(questionnaireField.reviewConfirmedAtIso);

        if (explicitlyConfirmed || previouslyConfirmed) {
          return {
            ...field,
            needsManualReview: false,
            value: questionnaireField?.value ?? field.value,
            verified: true,
          };
        }
        if (updatedKeys.has(key)) {
          return { ...field, needsManualReview: true, verified: false };
        }
        return field;
      });
      const allExtractedFieldsVerified = extractedFields.every(
        (field) => field.verified === true,
      );
      const hasUpdatedExtractedField = extraction.extractedFields.some((field) => {
        const questionnaireFieldId =
          questionnaireFieldIdByPassportExtractionKey[field.key];
        return updatedKeys.has(
          questionnaireReviewConfirmationKey({
            applicantId: applicant.id,
            fieldId: questionnaireFieldId,
          }),
        );
      });

      return {
        ...applicant,
        passportExtraction: {
          ...extraction,
          extractedFields,
          verifiedAtIso: allExtractedFieldsVerified
            ? (extraction.verifiedAtIso ?? nowIso)
            : hasUpdatedExtractedField
              ? undefined
              : extraction.verifiedAtIso,
        },
      };
    }),
  };
}

function applyQuestionnairePayload(
  submission: Submission,
  payload: QuestionnaireCommitPayload,
  actorId: string,
  nowIso: string,
) {
  const updates = uniqueQuestionnaireUpdates(payload.fieldUpdates).map(
    (update) => {
      const currentValue = submission.applicants
        .find((applicant) => applicant.id === update.applicantId)
        ?.sections.flatMap((section) => section.fields)
        .find((field) => field.id === update.fieldId)?.value;
      return currentValue === update.value
        ? update
        : { ...update, reviewSource: "manual" as const };
    },
  );
  const withFields = updates.reduce(
    (nextSubmission, update) =>
      updateQuestionnaireField(nextSubmission, update),
    submission,
  );
  const confirmations = payload.reviewConfirmations ?? [];
  const withExplicitConfirmations = applyQuestionnaireReviewConfirmations(
    withFields,
    confirmations,
    actorId,
    nowIso,
  );
  const withPassportReview = synchronizePassportExtractionConfirmations(
    withExplicitConfirmations,
    updates,
    confirmations,
    nowIso,
  );
  const travelStart = payload.travelStart.trim();
  const travelEnd = payload.travelEnd.trim();

  return withRecalculatedSubmissionProgress(
    normalizeSubmissionQuestionnaire({
      ...withPassportReview,
      tripDateFrom: travelStart || withPassportReview.tripDateFrom,
      tripDateTo: travelEnd || withPassportReview.tripDateTo,
      updatedAt: nowIso,
    }),
  );
}

function appendLocalHistory(
  submission: Submission,
  text: string,
  source: "agent" | "system" = "agent",
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
  initialFocus,
  submissionId,
  onBack,
  onAssignPublicNumber,
  onSavedAndExit,
  onOpenDocuments,
  submission,
  onUploadFile,
  onSaveDraft,
  onMarkIssueFixed,
  onSubmissionUpdate,
  onSubmissionChange,
  onSubmitForReview,
}: QuestionnaireScreenProps) {
  const bridge = useVisaflowBusinessBridge();
  const commandActorId = agentId ?? defaultLocalAgentOwnerId;
  const sourceSubmission = useMemo(
    () =>
      normalizeSubmissionQuestionnaire(
        submission ?? fallbackSubmission(submissionId, agentId),
      ),
    [agentId, submission, submissionId],
  );
  const [workingSubmission, setWorkingSubmission] = useState(sourceSubmission);
  const workingSubmissionRef = useRef(sourceSubmission);

  useEffect(() => {
    workingSubmissionRef.current = sourceSubmission;
    setWorkingSubmission(sourceSubmission);
  }, [sourceSubmission]);

  const persistSubmissionUpdate = useCallback(
    async (update: (submission: Submission) => Submission) => {
      const nextSubmission = onSubmissionUpdate
        ? await onSubmissionUpdate(update)
        : update(workingSubmissionRef.current);
      if (!onSubmissionUpdate) await onSubmissionChange?.(nextSubmission);
      workingSubmissionRef.current = nextSubmission;
      setWorkingSubmission(nextSubmission);
      return nextSubmission;
    },
    [onSubmissionChange, onSubmissionUpdate],
  );

  const handleSaveDraft = useCallback(
    async (payload: QuestionnaireCommitPayload) => {
      const nextSubmission = await persistSubmissionUpdate((currentSubmission) => {
        const preparedSubmission = applyQuestionnairePayload(
          currentSubmission,
          payload,
          commandActorId,
          new Date().toISOString(),
        );

        return payload.saveIntent === "manual"
          ? appendLocalHistory(preparedSubmission, "Черновик анкеты сохранён")
          : preparedSubmission;
      });
      await onSaveDraft?.(nextSubmission.id);
    },
    [commandActorId, onSaveDraft, persistSubmissionUpdate],
  );

  const handleComplete = useCallback(
    async (payload: QuestionnaireCommitPayload) => {
      const nextSubmission = await persistSubmissionUpdate((currentSubmission) => {
        const nowIso = new Date().toISOString();
        const preparedSubmission = applyQuestionnairePayload(
          currentSubmission,
          payload,
          commandActorId,
          nowIso,
        );
        const savedResult =
          preparedSubmission.status === "draft"
            ? applySubmissionActionResult(
                preparedSubmission,
                "save_progress",
                "agent",
                commandActorId,
              )
            : { ok: true as const, data: preparedSubmission };
        if (!savedResult.ok) throw new Error(savedResult.error.message);
        const completionAction =
          savedResult.data.status === "returned"
            ? "submit_corrections"
            : "submit_for_review";
        const submittedResult = applySubmissionActionResult(
          savedResult.data,
          completionAction,
          "agent",
          commandActorId,
        );
        if (!submittedResult.ok) throw new Error(submittedResult.error.message);
        return submittedResult.data;
      });
      if (
        nextSubmission.status !== "corrections_received" &&
        nextSubmission.status !== "submitted_for_review"
      ) {
        throw new Error("Не удалось подтвердить отправку анкеты в актуальном состоянии.");
      }
      const completedAction =
        nextSubmission.status === "corrections_received"
          ? "submit_corrections"
          : "submit_for_review";
      await onSubmitForReview?.(nextSubmission.id);
      emitVisaflowUiEvent(bridge, {
        type: "submission.action",
        payload: {
          submissionId: nextSubmission.id,
          action: completedAction,
          source: "agent",
        },
      });
    },
    [bridge, commandActorId, onSubmitForReview, persistSubmissionUpdate],
  );

  const handleMarkIssueFixed = useCallback(
    async (issueId: string) => {
      if (onMarkIssueFixed) {
        const nextSubmission = await onMarkIssueFixed(issueId);
        workingSubmissionRef.current = nextSubmission;
        setWorkingSubmission(nextSubmission);
        return;
      }

      await persistSubmissionUpdate((currentSubmission) => {
        const result = markSubmissionIssueFixedResult(
          currentSubmission,
          issueId,
          "agent",
        );
        if (!result.ok) throw new Error(result.error.message);
        return result.data;
      });
    },
    [onMarkIssueFixed, persistSubmissionUpdate],
  );

  const handleConfirmPassportReview = useCallback(
    async (applicantId: string) => {
      await persistSubmissionUpdate((currentSubmission) =>
        confirmApplicantPassportReview(currentSubmission, applicantId),
      );
    },
    [persistSubmissionUpdate],
  );

  const handleSaveAndExit = useCallback(async () => {
    let savedSubmission = workingSubmissionRef.current;
    if (blsQuestionnaireReadiness(savedSubmission).ready && onAssignPublicNumber) {
      const assignment = await onAssignPublicNumber(savedSubmission.id);
      savedSubmission = {
        ...savedSubmission,
        publicNumber: assignment.publicNumber,
      };
      workingSubmissionRef.current = savedSubmission;
      setWorkingSubmission(savedSubmission);
      if (assignment.assignedNow) {
        window.alert(
          `Анкета сохранена. Номер подачи: VF-${assignment.publicNumber}`,
        );
      }
    }

    if (onSavedAndExit) {
      await onSavedAndExit(savedSubmission);
      return;
    }
    onBack();
  }, [onAssignPublicNumber, onBack, onSavedAndExit]);

  return (
    <FigmaQuestionnaireScreen
      initialFocus={initialFocus}
      submission={workingSubmission}
      onBack={onBack}
      onComplete={handleComplete}
      onConfirmPassportReview={handleConfirmPassportReview}
      onMarkIssueFixed={handleMarkIssueFixed}
      onOpenDocuments={onOpenDocuments}
      onSaveDraft={handleSaveDraft}
      onSaveAndExit={handleSaveAndExit}
      onUploadFile={onUploadFile}
    />
  );
}
