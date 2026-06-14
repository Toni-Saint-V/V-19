import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  adminAcceptancePreflight,
  buildMediaSlot,
  canAcceptSubmission,
  canSubmitToOperator,
  markCorrectionFixed,
  nextAction,
  normalizeApplicant,
  normalizeSubmission,
  readiness as submissionReadiness,
  submissionPreflight,
  statusMeta,
  transitionSubmissionStatus,
} from "./lib/workflow";
import type { AppProfile, AppSession } from "./types/session";
import { canAccessRole } from "./services/authService";
import { supabaseRuntimeConfig } from "./lib/supabase/config";
import { selectSubmissionsForRole } from "./services/localRepository";
import { storageTargetForSlot, uploadMediaToStorage } from "./services/storageService";
import { logPersistenceDiagnostics } from "./services/persistenceObservability";
import { buildSmartCorrectionReturnPackage } from "./services/smartCorrectionReturn";
import { useWorkspacePersistence } from "./hooks/useWorkspacePersistence";
import type { Applicant, MediaSlotType, Role, Submission } from "./types/domain";

type Tone = "blue" | "green" | "gold" | "red" | "purple" | "neutral";

type Metric = {
  label: string;
  value: string;
  hint: string;
  tone: Tone;
  icon: string;
};

type QueueCase = {
  id: string;
  applicant: string;
  agency: string;
  country: string;
  city: string;
  group: string;
  readiness: number;
  status: string;
  nextAction: string;
  tone: Tone;
  submission: Submission;
};

const reviewStageStatuses: Array<Submission["status"]> = [
  "waiting_review",
  "in_review",
];
const handoffStageStatuses: Array<Submission["status"]> = [
  "accepted",
  "ready_for_excel",
  "exported",
  "sent_to_appointment",
  "appointment_scheduled",
];
const editableApplicantFields: Array<{
  key: keyof Pick<
    Applicant,
    | "name"
    | "passport"
    | "birthDate"
    | "citizenship"
    | "address"
    | "phone"
    | "email"
    | "passportIssuedAt"
    | "passportExpiresAt"
    | "country"
    | "city"
    | "tripDates"
    | "hotelName"
    | "hotelAddress"
  >;
  label: string;
}> = [
  { key: "name", label: "Full name" },
  { key: "passport", label: "Passport number" },
  { key: "birthDate", label: "Birth date" },
  { key: "citizenship", label: "Citizenship" },
  { key: "address", label: "Address" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "passportIssuedAt", label: "Passport issued" },
  { key: "passportExpiresAt", label: "Passport expires" },
  { key: "country", label: "Submission country" },
  { key: "city", label: "Submission city" },
  { key: "tripDates", label: "Trip dates" },
  { key: "hotelName", label: "Hotel" },
  { key: "hotelAddress", label: "Hotel address" },
];

const statusRank: Record<Submission["status"], number> = {
  waiting_review: 1,
  in_review: 2,
  attention_required: 3,
  returned: 4,
  accepted: 5,
  ready_for_excel: 6,
  exported: 7,
  sent_to_appointment: 8,
  appointment_scheduled: 9,
  ready_for_review: 10,
  filling: 11,
  draft: 12,
  completed: 13,
};

const statusColumns = [
  {
    title: "Agent prepares",
    description: "Collect fields, files, and corrections before admin review.",
    items: [
      ["Draft", "Agent", "Fill required fields"],
      ["Needs fixes", "Agent", "Correct returned blocker"],
    ],
  },
  {
    title: "Admin reviews",
    description: "Human review decides if the package is ready for handoff.",
    items: [
      ["In review", "Admin", "Accept or return"],
      ["Ready for queue", "Admin", "Prepare manual tracking"],
    ],
  },
  {
    title: "Manual tracking",
    description: "Admin tracks appointments and results outside automation.",
    items: [
      ["Queued", "Admin", "Update date/comment"],
      ["Result pending", "Admin", "Monitor final status"],
    ],
  },
];

function uiTone(tone: string): Tone {
  if (tone === "success") return "green";
  if (tone === "error") return "red";
  if (tone === "warning" || tone === "gold") return "gold";
  if (tone === "violet") return "purple";
  if (tone === "info") return "blue";
  return "neutral";
}

function caseGroup(submission: Submission): string {
  return submission.type === "family"
    ? `Family · ${submission.applicants.length}`
    : "Single";
}

function actionSummary(submission: Submission): string {
  if (submission.status === "waiting_review" || submission.status === "in_review") {
    return "Human review can accept the package or return corrections.";
  }
  if (submission.status === "returned") {
    return "Waiting for agency corrections before another review.";
  }
  if (submission.status === "accepted" || submission.status === "ready_for_excel") {
    return "Ready for manual queue handoff and export preparation.";
  }
  if (
    ["exported", "sent_to_appointment", "appointment_scheduled"].includes(
      submission.status,
    )
  ) {
    return "Manual appointment tracking is the next operator step.";
  }

  return nextAction(submission, true).label;
}

function toQueueCase(submission: Submission): QueueCase {
  const meta = statusMeta[submission.status];

  return {
    id: submission.id,
    applicant: submission.title,
    agency: submission.agentName,
    country: submission.country,
    city: submission.city,
    group: caseGroup(submission),
    readiness: submissionReadiness(submission),
    status: meta.label,
    nextAction: actionSummary(submission),
    tone: uiTone(meta.tone),
    submission,
  };
}

function countMatching(
  submissions: Submission[],
  statuses: Array<Submission["status"]>,
): number {
  return submissions.filter((submission) => statuses.includes(submission.status))
    .length;
}

function buildMetrics(submissions: Submission[]): Metric[] {
  const reviewCount = countMatching(submissions, ["waiting_review", "in_review"]);
  const blockedCount = countMatching(submissions, ["returned", "attention_required"]);
  const returnedCount = countMatching(submissions, ["returned"]);
  const appointmentCount = countMatching(submissions, [
    "exported",
    "sent_to_appointment",
    "appointment_scheduled",
  ]);

  return [
    {
      label: "Ready for review",
      value: String(reviewCount),
      hint: "operator-owned review work",
      tone: reviewCount ? "green" : "neutral",
      icon: "✓",
    },
    {
      label: "Blocked cases",
      value: String(blockedCount),
      hint: "corrections or manual issue",
      tone: blockedCount ? "red" : "neutral",
      icon: "!",
    },
    {
      label: "Returned",
      value: String(returnedCount),
      hint: "awaiting agency fixes",
      tone: returnedCount ? "gold" : "neutral",
      icon: "↺",
    },
    {
      label: "In appointment queue",
      value: String(appointmentCount),
      hint: "manual tracking statuses",
      tone: appointmentCount ? "purple" : "neutral",
      icon: "▣",
    },
  ];
}

function buildAgentMetrics(submissions: Submission[]): Metric[] {
  const draftCount = countMatching(submissions, ["draft", "filling"]);
  const returnedCount = countMatching(submissions, ["returned"]);
  const readyCount = countMatching(submissions, ["ready_for_review"]);
  const reviewCount = countMatching(submissions, ["waiting_review", "in_review"]);

  return [
    {
      label: "In progress",
      value: String(draftCount),
      hint: "cases still being prepared",
      tone: draftCount ? "blue" : "neutral",
      icon: "□",
    },
    {
      label: "Returned",
      value: String(returnedCount),
      hint: "corrections to close",
      tone: returnedCount ? "red" : "neutral",
      icon: "!",
    },
    {
      label: "Ready to send",
      value: String(readyCount),
      hint: "preflight can run",
      tone: readyCount ? "green" : "neutral",
      icon: "✓",
    },
    {
      label: "With operator",
      value: String(reviewCount),
      hint: "waiting for human review",
      tone: reviewCount ? "purple" : "neutral",
      icon: "▣",
    },
  ];
}

function firstBlocker(submission: Submission): string {
  const preflight = adminAcceptancePreflight(submission);
  return preflight.blockers[0] ?? "Review preflight is not clear.";
}

function canRunReviewAction(submission: Submission): boolean {
  return reviewStageStatuses.includes(submission.status);
}

function canRunHandoffAction(submission: Submission): boolean {
  return handoffStageStatuses.includes(submission.status);
}

function handoffActionLabel(submission: Submission): string {
  if (submission.status === "accepted") return "Prepare Excel";
  if (submission.status === "ready_for_excel") return "Mark exported";
  if (submission.status === "exported") return "Send to appointment tracking";
  if (submission.status === "sent_to_appointment") return "Mark appointment scheduled";
  if (submission.status === "appointment_scheduled") return "Complete tracking";
  return "Continue handoff";
}

function nextHandoffStatus(status: Submission["status"]): Submission["status"] | null {
  if (status === "accepted") return "ready_for_excel";
  if (status === "ready_for_excel") return "exported";
  if (status === "exported") return "sent_to_appointment";
  if (status === "sent_to_appointment") return "appointment_scheduled";
  if (status === "appointment_scheduled") return "completed";
  return null;
}

function actionTimestamp(): string {
  return new Date().toISOString();
}

function candidateWithClosedCorrections(
  submission: Submission,
  changedBy: string,
  changedAt: string,
): Submission {
  return submission.notes.reduce(
    (next, note) =>
      markCorrectionFixed(
        next,
        note.id ?? `${note.target}-${note.text}`,
        changedBy,
        changedAt,
      ),
    submission,
  );
}

function profileInitial(profile: AppProfile): string {
  return profile.displayName.trim().charAt(0).toUpperCase() || "A";
}

function dataSourceLabel(session: AppSession | null): string {
  if (session?.mode !== "supabase") return "Local demo data";

  return supabaseRuntimeConfig.activation.ready
    ? "Supabase data"
    : "Supabase sandbox probe";
}

function mediaAccept(type: MediaSlotType): string {
  return type === "video" ? "video/mp4" : "image/jpeg";
}

function mediaUploadButtonLabel(type: MediaSlotType): string {
  if (type === "video") return "Choose MP4";
  return "Choose JPG";
}

function createAgentDraft(profile: AppProfile, count: number): Submission {
  const id = `VF-AGENT-${Date.now().toString().slice(-6)}-${count + 1}`;
  const applicantId = `${id}-1`;
  const title = `New applicant ${count + 1}`;
  const createdAt = actionTimestamp();

  return normalizeSubmission({
    id,
    title,
    type: "single",
    agentId: profile.id,
    agentName: profile.organizationName ?? profile.displayName,
    country: "Spain",
    city: "Madrid",
    travelDate: "2026-08-20",
    updated: createdAt,
    createdAt,
    status: "draft",
    appointment: "not_started",
    priority: "Средний",
    fields: 0,
    media: 0,
    mediaRequired: 3,
    applicants: [
      {
        id: applicantId,
        name: title,
        role: "Заявитель",
        passport: "-",
        form: 0,
        media: 0,
        mediaRequired: 3,
        country: "Spain",
        city: "Madrid",
        tripDates: "2026-08-20",
      },
    ],
    mediaRows: [],
    notes: [],
  });
}

function App() {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [uploadingMediaKey, setUploadingMediaKey] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const {
    authChecked,
    authError,
    dataLoading,
    isSupabaseSession,
    loginBusy,
    loginDemo,
    loginSupabase,
    logout,
    persistExistingSubmission,
    persistSubmissionImmediately,
    recoverRemoteFailure,
    saveState,
    saveStatusDescription,
    saveStatusLabel,
    session,
    setSaveError,
    setSubmissions,
    stageSubmissionUpdates,
    submissions,
  } = useWorkspacePersistence({ setToast });

  const profile = session?.profile ?? null;
  const sourceLabel = dataSourceLabel(session);
  const hasAdminAccess = canAccessRole(profile, "admin");
  const agentSubmissions = useMemo(
    () =>
      profile?.role === "agent"
        ? selectSubmissionsForRole(submissions, "agent", profile.id)
        : [],
    [profile?.id, profile?.role, submissions],
  );
  const agentCases = useMemo(
    () =>
      [...agentSubmissions.map(toQueueCase)].sort((left, right) => {
        const byStatus =
          statusRank[left.submission.status] - statusRank[right.submission.status];
        if (byStatus !== 0) return byStatus;
        return right.readiness - left.readiness;
      }),
    [agentSubmissions],
  );
  const agentMetrics = useMemo(
    () => buildAgentMetrics(agentSubmissions),
    [agentSubmissions],
  );
  const visibleSubmissions = useMemo(
    () => selectSubmissionsForRole(submissions, "admin", profile?.id ?? "admin-1"),
    [profile?.id, submissions],
  );
  const queueCases = useMemo(
    () =>
      [...visibleSubmissions.map(toQueueCase)].sort((left, right) => {
        const byStatus =
          statusRank[left.submission.status] - statusRank[right.submission.status];
        if (byStatus !== 0) return byStatus;
        return right.readiness - left.readiness;
      }),
    [visibleSubmissions],
  );
  const metrics = useMemo(() => buildMetrics(visibleSubmissions), [visibleSubmissions]);
  const selectedSubmission = selectedCaseId
    ? (submissions.find((submission) => submission.id === selectedCaseId) ?? null)
    : null;
  const selectedCase = selectedSubmission ? toQueueCase(selectedSubmission) : null;
  const selectedPreflight = selectedSubmission
    ? adminAcceptancePreflight(selectedSubmission)
    : null;
  const selectedAgentSubmission =
    profile?.role === "agent" &&
    selectedSubmission?.agentId === profile.id &&
    ["draft", "filling", "returned", "ready_for_review"].includes(
      selectedSubmission.status,
    )
      ? selectedSubmission
      : null;
  const selectedAgentPreflight = selectedAgentSubmission
    ? submissionPreflight(selectedAgentSubmission)
    : null;
  const selectedAgentCorrectionPreflight =
    selectedAgentSubmission?.status === "returned" && profile
      ? submissionPreflight(
          candidateWithClosedCorrections(
            selectedAgentSubmission,
            profile.displayName,
            selectedAgentSubmission.updated,
          ),
        )
      : selectedAgentPreflight;
  const priorityCase = queueCases[0] ?? null;
  const recentEvents = useMemo(
    () =>
      [...visibleSubmissions]
        .sort((left, right) => right.updated.localeCompare(left.updated))
        .slice(0, 3),
    [visibleSubmissions],
  );
  const countryLoad = useMemo(() => {
    const tracked = visibleSubmissions.filter((submission) =>
      ["exported", "sent_to_appointment", "appointment_scheduled"].includes(
        submission.status,
      ),
    );
    const total = Math.max(1, tracked.length);
    const counts = new Map<string, number>();

    for (const submission of tracked) {
      counts.set(submission.country, (counts.get(submission.country) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([country, count]) => ({
        country,
        count,
        width: Math.max(12, Math.round((count / total) * 100)),
      }));
  }, [visibleSubmissions]);

  useEffect(() => {
    if (!toast) return undefined;

    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!selectedCaseId) return undefined;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedCaseId(null);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedCaseId]);

  async function handleLoginDemo(role: Role) {
    await loginDemo(role);
    setSelectedCaseId(null);
  }

  async function handleLoginSupabase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await loginSupabase(loginEmail, loginPassword)) setSelectedCaseId(null);
  }

  async function handleLogout() {
    await logout();
    setSelectedCaseId(null);
  }

  function createAgentCase() {
    if (!profile || profile.role !== "agent") {
      setToast("Agent access is required to create a case.");
      return;
    }

    const nextSubmission = createAgentDraft(profile, submissions.length);
    stageSubmissionUpdates(
      [nextSubmission.id],
      (current) => [nextSubmission, ...current],
      `${nextSubmission.id} draft created for intake.`,
    );
    setSelectedCaseId(nextSubmission.id);
  }

  function updateAgentApplicantField(
    submissionId: string,
    applicantId: string,
    field: (typeof editableApplicantFields)[number]["key"],
    value: string,
  ) {
    if (!profile || profile.role !== "agent") {
      setToast("Agent access is required to edit intake data.");
      return;
    }

    const changedAt = actionTimestamp();
    stageSubmissionUpdates([submissionId], (current) =>
      current.map((submission) => {
        if (submission.id !== submissionId || submission.agentId !== profile.id) {
          return submission;
        }

        const applicants = submission.applicants.map((applicant, index) => {
          const normalized = normalizeApplicant(applicant, index, submission);
          if (normalized.id !== applicantId) return normalized;

          return normalizeApplicant(
            {
              ...normalized,
              [field]: value,
              ...(field === "name" ? { name: value || "New applicant" } : {}),
              ...(field === "passport" ? { passport: value || "-" } : {}),
            },
            index,
            submission,
          );
        });
        const firstApplicant = applicants[0];

        return normalizeSubmission({
          ...submission,
          title:
            submission.type === "single" && firstApplicant?.name
              ? firstApplicant.name
              : submission.title,
          country:
            field === "country" && applicants[0]?.country
              ? applicants[0].country
              : submission.country,
          city:
            field === "city" && applicants[0]?.city
              ? applicants[0].city
              : submission.city,
          travelDate:
            field === "tripDates" && applicants[0]?.tripDates
              ? applicants[0].tripDates
              : submission.travelDate,
          applicants,
          status: submission.status === "draft" ? "filling" : submission.status,
          updated: changedAt,
        });
      }),
    );
  }

  async function updateAgentMediaSlot(
    submissionId: string,
    applicantId: string,
    type: MediaSlotType,
    file?: File,
  ) {
    if (!profile || profile.role !== "agent") {
      setToast("Agent access is required to update media.");
      return;
    }

    const submission = submissions.find(
      (item) => item.id === submissionId && item.agentId === profile.id,
    );
    if (!submission) {
      setToast("This media slot is not available for the current agent.");
      return;
    }

    if (isSupabaseSession && session?.mode === "supabase") {
      if (!file) {
        setToast("Choose a real media file before marking this slot uploaded.");
        return;
      }

      if (type !== "video" && file.type !== "image/jpeg") {
        setToast("Photo and selfie slots require a JPG file for this storage path.");
        return;
      }

      const applicant = submission.applicants
        .map((item, index) => normalizeApplicant(item, index, submission))
        .find((item) => item.id === applicantId);
      if (!applicant?.id) {
        setToast("Applicant data must be saved before uploading media.");
        return;
      }

      const existingSlot = (applicant.mediaSlots ?? []).find(
        (slot) => slot.type === type,
      );
      const rebuilt = buildMediaSlot(applicant, type, "uploaded");
      if (!rebuilt.generatedFileName) {
        setToast("Enter a passport number before uploading this media file.");
        return;
      }

      const changedAt = actionTimestamp();
      const uploadedSlot = {
        ...existingSlot,
        ...rebuilt,
        state: "uploaded" as const,
        passportFileName: rebuilt.generatedFileName,
        mimeType: file.type,
        sizeBytes: file.size,
        uploadedAt: changedAt,
        uploadStatus: "uploaded" as const,
        reviewStatus: "not_reviewed" as const,
      };
      const target = storageTargetForSlot(submissionId, applicant.id, uploadedSlot);
      const mediaKey = `${submissionId}:${applicant.id}:${type}`;

      setUploadingMediaKey(mediaKey);
      setSaveError("");
      try {
        await persistExistingSubmission(session, submission);

        const upload = await uploadMediaToStorage(target, file);
        if (!upload) {
          throw new Error("Supabase storage is inactive.");
        }

        const nextSubmissions = submissions.map((currentSubmission) => {
          if (
            currentSubmission.id !== submissionId ||
            currentSubmission.agentId !== profile.id
          ) {
            return currentSubmission;
          }

          const applicants = currentSubmission.applicants.map(
            (currentApplicant, index) => {
              const normalized = normalizeApplicant(
                currentApplicant,
                index,
                currentSubmission,
              );
              if (normalized.id !== applicantId) return normalized;

              const mediaSlots = (normalized.mediaSlots ?? []).map((slot) =>
                slot.type === type ? uploadedSlot : slot,
              );

              return normalizeApplicant(
                {
                  ...normalized,
                  mediaSlots,
                },
                index,
                currentSubmission,
              );
            },
          );

          return normalizeSubmission({
            ...currentSubmission,
            applicants,
            status:
              currentSubmission.status === "draft"
                ? "filling"
                : currentSubmission.status,
            updated: changedAt,
          });
        });
        const nextSubmission = nextSubmissions.find((item) => item.id === submissionId);
        if (!nextSubmission) {
          throw new Error("Updated submission was not found after media upload.");
        }

        setSubmissions(nextSubmissions);
        await persistSubmissionImmediately(
          session,
          nextSubmission,
          `${uploadedSlot.label} uploaded and saved.`,
          target,
        );
      } catch (error) {
        logPersistenceDiagnostics("Supabase media upload failed", error);
        const message = await recoverRemoteFailure(
          session,
          error,
          "Media upload failed. No uploaded file was marked complete.",
          "Supabase reload after media failure failed",
        );
        setToast(message);
      } finally {
        setUploadingMediaKey("");
      }
      return;
    }

    const changedAt = actionTimestamp();
    stageSubmissionUpdates([submissionId], (current) =>
      current.map((submission) => {
        if (submission.id !== submissionId || submission.agentId !== profile.id) {
          return submission;
        }

        const applicants = submission.applicants.map((applicant, index) => {
          const normalized = normalizeApplicant(applicant, index, submission);
          if (normalized.id !== applicantId) return normalized;

          const mediaSlots = (normalized.mediaSlots ?? []).map((slot) => {
            if (slot.type !== type) return slot;
            const rebuilt = buildMediaSlot(normalized, type, "uploaded");

            return {
              ...slot,
              ...rebuilt,
              state: "uploaded" as const,
              passportFileName: rebuilt.generatedFileName,
              uploadedAt: changedAt,
            };
          });

          return normalizeApplicant(
            {
              ...normalized,
              mediaSlots,
            },
            index,
            submission,
          );
        });

        return normalizeSubmission({
          ...submission,
          applicants,
          status: submission.status === "draft" ? "filling" : submission.status,
          updated: changedAt,
        });
      }),
    );
  }

  function fixReturnedCase(submission: Submission) {
    if (!profile || profile.role !== "agent" || submission.agentId !== profile.id) {
      setToast("Only the assigned agent can fix this case.");
      return;
    }

    if (submission.status !== "returned") {
      setToast("Only returned cases can be marked corrected.");
      return;
    }

    const changedAt = actionTimestamp();
    const fixedCandidate = candidateWithClosedCorrections(
      submission,
      profile.displayName,
      changedAt,
    );
    const preflight = submissionPreflight(fixedCandidate);
    if (!preflight.canSubmit) {
      setSelectedCaseId(submission.id);
      setToast("Fix data and media blockers before closing returned corrections.");
      return;
    }

    stageSubmissionUpdates(
      [submission.id],
      (current) =>
        current.map((item) => {
          if (item.id !== submission.id) return item;

          const fixed = candidateWithClosedCorrections(
            item,
            profile.displayName,
            changedAt,
          );

          return transitionSubmissionStatus(
            fixed,
            "ready_for_review",
            profile.displayName,
            changedAt,
            "Agent marked returned corrections as fixed.",
          );
        }),
      `${submission.id} corrections marked fixed.`,
    );
  }

  function submitAgentCase(submission: Submission) {
    if (!profile || profile.role !== "agent" || submission.agentId !== profile.id) {
      setToast("Only the assigned agent can submit this case.");
      return;
    }

    if (!["draft", "filling", "ready_for_review"].includes(submission.status)) {
      setToast("Case is not in an editable handoff state.");
      return;
    }

    if (!canSubmitToOperator(submission)) {
      setSelectedCaseId(submission.id);
      setToast("Preflight blocked handoff: close required fields and media first.");
      return;
    }

    const changedAt = actionTimestamp();
    stageSubmissionUpdates(
      [submission.id],
      (current) =>
        current.map((item) =>
          item.id === submission.id
            ? transitionSubmissionStatus(
                item,
                "waiting_review",
                profile.displayName,
                changedAt,
                "Agent submitted the case to operator review.",
              )
            : item,
        ),
      `${submission.id} sent to operator review.`,
    );
  }

  function openPriorityCase() {
    if (!priorityCase) {
      setToast("No operator cases are available.");
      return;
    }

    setSelectedCaseId(priorityCase.id);
  }

  function markReady() {
    if (!selectedSubmission || !hasAdminAccess) {
      setToast("Admin access is required for this action.");
      return;
    }

    if (!canRunReviewAction(selectedSubmission)) {
      setToast(
        `${selectedSubmission.id} has left review; use manual tracking instead.`,
      );
      return;
    }

    if (!canAcceptSubmission(selectedSubmission)) {
      setToast(`Cannot mark ready: ${firstBlocker(selectedSubmission)}`);
      return;
    }

    const actor = profile?.displayName ?? "Operator";
    const changedAt = actionTimestamp();
    stageSubmissionUpdates(
      [selectedSubmission.id],
      (current) =>
        current.map((submission) => {
          if (submission.id !== selectedSubmission.id) return submission;

          const reviewStarted =
            submission.status === "in_review"
              ? submission
              : transitionSubmissionStatus(
                  submission,
                  "in_review",
                  actor,
                  changedAt,
                  "Operator started human readiness review.",
                );

          return transitionSubmissionStatus(
            reviewStarted,
            "accepted",
            actor,
            changedAt,
            "Operator accepted the case for manual handoff.",
          );
        }),
      `${selectedSubmission.id} marked ready for manual handoff.`,
    );
    setSelectedCaseId(null);
  }

  function returnToAgent() {
    if (!selectedSubmission || !hasAdminAccess) {
      setToast("Admin access is required for this action.");
      return;
    }

    if (!canRunReviewAction(selectedSubmission)) {
      setToast(
        `${selectedSubmission.id} has left review; use manual tracking instead.`,
      );
      return;
    }

    const actor = profile?.displayName ?? "Operator";
    const actorId = profile?.id ?? actor;
    const changedAt = actionTimestamp();
    const correctionPackage = buildSmartCorrectionReturnPackage(selectedSubmission, {
      createdBy: actorId,
      createdAt: changedAt,
      idFactory: () => crypto.randomUUID(),
    });

    stageSubmissionUpdates(
      [selectedSubmission.id],
      (current) =>
        current.map((submission) => {
          if (submission.id !== selectedSubmission.id) return submission;

          return transitionSubmissionStatus(
            {
              ...submission,
              notes: [...correctionPackage.notes, ...submission.notes],
            },
            "returned",
            actor,
            changedAt,
            correctionPackage.summary,
          );
        }),
      `${selectedSubmission.id} returned to the agency for correction.`,
    );
    setSelectedCaseId(null);
  }

  function advanceHandoff() {
    if (!selectedSubmission || !hasAdminAccess) {
      setToast("Admin access is required for this action.");
      return;
    }

    const nextStatus = nextHandoffStatus(selectedSubmission.status);
    if (!nextStatus) {
      setToast(`${selectedSubmission.id} has no next handoff action.`);
      return;
    }

    const actor = profile?.displayName ?? "Operator";
    const changedAt = actionTimestamp();
    stageSubmissionUpdates(
      [selectedSubmission.id],
      (current) =>
        current.map((submission) =>
          submission.id === selectedSubmission.id
            ? transitionSubmissionStatus(
                submission,
                nextStatus,
                actor,
                changedAt,
                `Operator advanced handoff to ${statusMeta[nextStatus].label}.`,
              )
            : submission,
        ),
      `${selectedSubmission.id}: ${handoffActionLabel(selectedSubmission)}.`,
    );
    setSelectedCaseId(null);
  }

  if (!authChecked) {
    return (
      <main className="auth-shell" aria-busy="true">
        <section className="auth-card">
          <p className="eyebrow">VisaOps AI</p>
          <h1>Checking access</h1>
          <p>Loading the current session before showing operator workspaces.</p>
        </section>
      </main>
    );
  }

  if (!session) {
    const canUseSupabaseAuth = supabaseRuntimeConfig.selected === "supabase";
    const activationBlocked =
      supabaseRuntimeConfig.target === "supabase" &&
      supabaseRuntimeConfig.selected !== "supabase";

    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="login-title">
          <p className="eyebrow">VisaOps AI</p>
          <h1 id="login-title">Sign in required</h1>
          <p>
            Operator queues are gated. Admin review actions are available only after the
            current session is known.
          </p>
          {canUseSupabaseAuth ? (
            <form className="auth-form" onSubmit={handleLoginSupabase}>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.currentTarget.value)}
                  required
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.currentTarget.value)}
                  required
                />
              </label>
              <button
                className="button button-primary"
                type="submit"
                disabled={loginBusy || dataLoading}
              >
                {loginBusy || dataLoading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          ) : (
            <div className="auth-actions">
              <button
                className="button button-primary"
                type="button"
                onClick={() => void handleLoginDemo("admin")}
              >
                Continue as Admin demo
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => void handleLoginDemo("agent")}
              >
                Continue as Agent demo
              </button>
            </div>
          )}
          {authError ? (
            <p className="auth-error" role="alert">
              {authError}
            </p>
          ) : null}
          <p className="auth-note">
            {canUseSupabaseAuth
              ? "Supabase sandbox access is enabled for real Auth, database, and Storage smoke. Human review still owns readiness and handoff."
              : activationBlocked
                ? `Supabase remains fail-closed: ${supabaseRuntimeConfig.blockedReasons[0] ?? "activation evidence is incomplete."}`
                : "This workspace uses local demo data until Supabase RLS, storage, and persistence activation pass live review."}
          </p>
        </section>
        <div
          className={`toast ${toast ? "is-visible" : ""}`}
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      </main>
    );
  }

  if (profile?.role === "agent") {
    return (
      <div className="app-shell agent-shell">
        <aside className="sidebar" aria-label="Agent navigation">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              V
            </div>
            <div>
              <strong>VisaOps AI</strong>
              <span>Agent Workspace</span>
            </div>
          </div>

          <nav className="nav-stack" aria-label="Agent operations">
            <p className="nav-kicker">Intake</p>
            <a className="nav-item is-active" href="#agent-workspace">
              <span className="nav-icon" aria-hidden="true">
                ◇
              </span>
              <span>Workspace</span>
              <strong>{agentSubmissions.length}</strong>
            </a>
            <a className="nav-item" href="#agent-cases">
              <span className="nav-icon" aria-hidden="true">
                ▣
              </span>
              <span>Cases</span>
              <strong>{agentCases.length}</strong>
            </a>
            <a className="nav-item" href="#agent-cases">
              <span className="nav-icon" aria-hidden="true">
                !
              </span>
              <span>Corrections</span>
              <strong>{countMatching(agentSubmissions, ["returned"])}</strong>
            </a>
          </nav>

          <div className="demo-card">
            <strong>Agent boundary</strong>
            <p>
              Agents prepare data, close corrections, and submit readiness. Human
              operators still own review and handoff.
            </p>
          </div>
        </aside>

        <div className="workspace">
          <header className="topbar">
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <input
                placeholder="Search your cases..."
                aria-label="Search agent cases"
              />
            </label>
            <div className="topbar-actions">
              <span className="demo-pill">{sourceLabel}</span>
              {isSupabaseSession ? (
                <span
                  className={`save-pill save-pill-${saveState}`}
                  aria-label={saveStatusDescription}
                  title={saveStatusDescription}
                >
                  {saveStatusLabel}
                </span>
              ) : null}
              <div className="role-switch" aria-label="Current role">
                <strong>Agent</strong>
                <span>Admin</span>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Sign out"
                onClick={() => void handleLogout()}
              >
                ≡
              </button>
              <span className="avatar" aria-label={`${profile.displayName} profile`}>
                {profileInitial(profile)}
              </span>
            </div>
          </header>

          <main className="main-surface" id="agent-workspace">
            <section className="hero-row" aria-labelledby="agent-title">
              <div>
                <p className="eyebrow">Agent</p>
                <h1 id="agent-title">Agent Workspace</h1>
                <p className="lead">
                  Prepare cases, resolve returned blockers, and submit only ready
                  packages to operator review.
                </p>
              </div>
              <div className="hero-actions">
                <button
                  className="button button-primary"
                  type="button"
                  onClick={createAgentCase}
                >
                  Create case
                </button>
              </div>
            </section>

            <section className="metric-grid" aria-label="Agent metrics">
              {agentMetrics.map((metric) => (
                <article className="metric-card" key={metric.label}>
                  <span className={`signal signal-${metric.tone}`} aria-hidden="true">
                    {metric.icon}
                  </span>
                  <div>
                    <strong>{metric.value}</strong>
                    <p>{metric.label}</p>
                    <small>{metric.hint}</small>
                  </div>
                </article>
              ))}
            </section>

            <section className="ai-next-action" aria-label="Agent readiness guardrail">
              <span className="spark" aria-hidden="true">
                ✦
              </span>
              <div>
                <p className="eyebrow">Readiness guardrail</p>
                <h2>Submit only after required data and media are complete.</h2>
                <p>
                  The app checks readiness before handoff; it does not approve visa
                  outcomes or replace human review.
                </p>
              </div>
            </section>

            <section
              className="priority-section"
              id="agent-cases"
              aria-labelledby="agent-cases-title"
            >
              <div className="section-heading">
                <p className="eyebrow" id="agent-cases-title">
                  Agent cases
                </p>
                <button
                  className="link-button"
                  type="button"
                  onClick={() =>
                    setToast(`Agent cases are loaded from ${sourceLabel}.`)
                  }
                >
                  Repository source <span aria-hidden="true">→</span>
                </button>
              </div>

              <div className="case-list">
                {agentCases.length ? (
                  agentCases.map((caseItem, index) => (
                    <article className="case-card" key={caseItem.id}>
                      <span className="rank">{index + 1}</span>
                      <div className="case-main">
                        <div className="case-meta-line">
                          <strong>{caseItem.id}</strong>
                          <span className={`chip chip-${caseItem.tone}`}>
                            {caseItem.status}
                          </span>
                        </div>
                        <div className="chip-row">
                          <span className="chip chip-neutral">{caseItem.country}</span>
                          <span className="chip chip-neutral">{caseItem.city}</span>
                          <span className="chip chip-blue">{caseItem.group}</span>
                        </div>
                        <h3>{caseItem.applicant}</h3>
                        <p>{nextAction(caseItem.submission, false).label}</p>
                        <small>{caseItem.agency}</small>
                      </div>
                      <div className="case-readiness">
                        <span>Readiness</span>
                        <strong>{caseItem.readiness}%</strong>
                        <div
                          className="progress"
                          aria-label={`${caseItem.readiness}% readiness`}
                        >
                          <span style={{ width: `${caseItem.readiness}%` }} />
                        </div>
                      </div>
                      {caseItem.submission.status === "returned" ? (
                        <button
                          className="button button-primary"
                          type="button"
                          onClick={() => fixReturnedCase(caseItem.submission)}
                        >
                          Mark correction fixed
                        </button>
                      ) : caseItem.submission.status === "ready_for_review" ? (
                        <button
                          className="button button-primary"
                          type="button"
                          onClick={() => submitAgentCase(caseItem.submission)}
                        >
                          Send to review
                        </button>
                      ) : ["draft", "filling"].includes(caseItem.submission.status) ? (
                        <button
                          className="button button-primary"
                          type="button"
                          onClick={() => setSelectedCaseId(caseItem.id)}
                        >
                          Continue intake
                        </button>
                      ) : (
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled
                        >
                          {nextAction(caseItem.submission, false).button}
                        </button>
                      )}
                    </article>
                  ))
                ) : (
                  <article className="empty-queue">
                    <h3>No agent cases</h3>
                    <p>Create a case to begin intake for this agent account.</p>
                  </article>
                )}
              </div>
            </section>
          </main>
        </div>

        {selectedAgentSubmission && selectedAgentPreflight ? (
          <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setSelectedCaseId(null);
              }
            }}
          >
            <section
              className="case-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="agent-case-modal-title"
            >
              <header className="modal-header">
                <div>
                  <p className="eyebrow">{selectedAgentSubmission.id}</p>
                  <h2 id="agent-case-modal-title">{selectedAgentSubmission.title}</h2>
                  <p>
                    {statusMeta[selectedAgentSubmission.status].label} ·{" "}
                    {selectedAgentSubmission.country} · {selectedAgentSubmission.city}
                  </p>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Close intake editor"
                  onClick={() => setSelectedCaseId(null)}
                >
                  ×
                </button>
              </header>

              <div className="modal-body">
                {selectedAgentSubmission.applicants.map((applicant, index) => {
                  const normalized = normalizeApplicant(
                    applicant,
                    index,
                    selectedAgentSubmission,
                  );

                  return (
                    <section className="modal-card" key={normalized.id}>
                      <p className="eyebrow">Applicant data</p>
                      <div className="intake-form">
                        {editableApplicantFields.map((field) => (
                          <label key={field.key}>
                            <span>{field.label}</span>
                            <input
                              value={String(normalized[field.key] ?? "")}
                              onChange={(event) =>
                                updateAgentApplicantField(
                                  selectedAgentSubmission.id,
                                  normalized.id ?? "",
                                  field.key,
                                  event.currentTarget.value,
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>

                      <div className="media-edit-list" aria-label="Applicant media">
                        {(normalized.mediaSlots ?? []).map((slot) => {
                          const mediaKey = `${selectedAgentSubmission.id}:${normalized.id ?? ""}:${slot.type}`;
                          const mediaComplete =
                            slot.state === "uploaded" || slot.state === "accepted";
                          const mediaBusy = uploadingMediaKey === mediaKey;

                          return (
                            <div className="media-edit-row" key={slot.id}>
                              <div>
                                <strong>{slot.label}</strong>
                                <span>{slot.state}</span>
                              </div>
                              {isSupabaseSession ? (
                                <label
                                  className={`button button-secondary upload-button ${
                                    mediaComplete || mediaBusy ? "is-disabled" : ""
                                  }`}
                                  aria-disabled={mediaComplete || mediaBusy}
                                >
                                  <input
                                    type="file"
                                    accept={mediaAccept(slot.type)}
                                    disabled={mediaComplete || mediaBusy}
                                    onChange={(event) => {
                                      const file = event.currentTarget.files?.[0];
                                      event.currentTarget.value = "";
                                      if (file) {
                                        void updateAgentMediaSlot(
                                          selectedAgentSubmission.id,
                                          normalized.id ?? "",
                                          slot.type,
                                          file,
                                        );
                                      }
                                    }}
                                  />
                                  {mediaBusy
                                    ? "Uploading..."
                                    : mediaComplete
                                      ? "Uploaded"
                                      : mediaUploadButtonLabel(slot.type)}
                                </label>
                              ) : (
                                <button
                                  className="button button-secondary"
                                  type="button"
                                  onClick={() =>
                                    void updateAgentMediaSlot(
                                      selectedAgentSubmission.id,
                                      normalized.id ?? "",
                                      slot.type,
                                    )
                                  }
                                  disabled={mediaComplete}
                                >
                                  {slot.state === "missing" || slot.state === "replace"
                                    ? "Mark uploaded"
                                    : "Uploaded"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}

                <section className="modal-card">
                  <p className="eyebrow">Preflight</p>
                  <ul className="checklist">
                    {selectedAgentPreflight.checklist.map((item) => (
                      <li key={item.label}>
                        <strong>{item.label}</strong>
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="modal-card">
                  <p className="eyebrow">Blockers</p>
                  {selectedAgentPreflight.blockers.length ? (
                    <ul className="checklist">
                      {selectedAgentPreflight.blockers.map((blocker) => (
                        <li key={blocker}>
                          <strong>Fix before handoff</strong>
                          <span>{blocker}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="modal-muted">No blockers before operator handoff.</p>
                  )}
                </section>
              </div>

              <footer className="modal-footer">
                <button
                  className="button button-light"
                  type="button"
                  onClick={() => setSelectedCaseId(null)}
                >
                  Close
                </button>
                {selectedAgentSubmission.status === "returned" ? (
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => fixReturnedCase(selectedAgentSubmission)}
                    disabled={!selectedAgentCorrectionPreflight?.canSubmit}
                  >
                    Close correction
                  </button>
                ) : (
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => submitAgentCase(selectedAgentSubmission)}
                    disabled={!selectedAgentPreflight.canSubmit}
                  >
                    Send to review
                  </button>
                )}
              </footer>
            </section>
          </div>
        ) : null}

        <div
          className={`toast ${toast ? "is-visible" : ""}`}
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      </div>
    );
  }

  if (!hasAdminAccess) {
    return (
      <main className="auth-shell">
        <section className="auth-card auth-card-denied" aria-labelledby="denied-title">
          <p className="eyebrow">Permission denied</p>
          <h1 id="denied-title">Admin access required</h1>
          <p>
            {profile?.displayName ?? "This user"} is signed in as{" "}
            <strong>{profile?.role ?? "unknown"}</strong>. Agent sessions cannot open
            the admin review console.
          </p>
          <div className="auth-actions">
            {!isSupabaseSession ? (
              <button
                className="button button-primary"
                type="button"
                onClick={() => void handleLoginDemo("admin")}
              >
                Switch to Admin demo
              </button>
            ) : null}
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void handleLogout()}
            >
              Sign out
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Admin navigation">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            V
          </div>
          <div>
            <strong>VisaOps AI</strong>
            <span>Admin Console</span>
          </div>
        </div>

        <nav className="nav-stack" aria-label="Operations">
          <p className="nav-kicker">Operations</p>
          <a className="nav-item is-active" href="#command-center">
            <span className="nav-icon" aria-hidden="true">
              ◇
            </span>
            <span>Command Center</span>
            <strong>{visibleSubmissions.length}</strong>
          </a>
          <a className="nav-item" href="#priority-queue">
            <span className="nav-icon" aria-hidden="true">
              ▣
            </span>
            <span>Cases</span>
            <strong>{queueCases.length}</strong>
          </a>
          <a className="nav-item" href="#queue-load">
            <span className="nav-icon" aria-hidden="true">
              □
            </span>
            <span>Appointment Queue</span>
            <strong>{metrics[3]?.value ?? 0}</strong>
          </a>
          <a className="nav-item" href="#status-board">
            <span className="nav-icon" aria-hidden="true">
              ▥
            </span>
            <span>Agents</span>
          </a>
          <a className="nav-item" href="#status-board">
            <span className="nav-icon" aria-hidden="true">
              ◌
            </span>
            <span>Trust & Audit</span>
          </a>
          <a className="nav-item" href="#events">
            <span className="nav-icon" aria-hidden="true">
              ◱
            </span>
            <span>Messages</span>
          </a>
        </nav>

        <div className="demo-card">
          <strong>Review boundary</strong>
          <p>
            No consulate integration, booking automation, OCR result, or outcome
            prediction. Human review owns readiness and handoff.
          </p>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input
              placeholder="Search cases, tourists, agencies..."
              aria-label="Search cases"
            />
          </label>
          <div className="topbar-actions">
            <span className="demo-pill">{sourceLabel}</span>
            {isSupabaseSession ? (
              <span
                className={`save-pill save-pill-${saveState}`}
                aria-label={saveStatusDescription}
                title={saveStatusDescription}
              >
                {saveStatusLabel}
              </span>
            ) : null}
            <div className="role-switch" aria-label="Current role">
              <span>Agent</span>
              <strong>Admin</strong>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Sign out"
              onClick={() => void handleLogout()}
            >
              ≡
            </button>
            <span
              className="avatar"
              aria-label={`${profile?.displayName ?? "Admin"} profile`}
            >
              {profile ? profileInitial(profile) : "A"}
            </span>
          </div>
        </header>

        <main className="main-surface" id="command-center">
          <section className="hero-row" aria-labelledby="command-title">
            <div>
              <p className="eyebrow">Administrator</p>
              <h1 id="command-title">Command Center</h1>
              <p className="lead">
                One dense control room for blocked cases, review-ready packages, agency
                corrections, and manual handoff.
              </p>
            </div>
            <div className="hero-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={openPriorityCase}
              >
                Open priority case <span aria-hidden="true">→</span>
              </button>
              <button
                className="button button-primary"
                type="button"
                onClick={() => setToast(`Showing the ${sourceLabel} case queue below.`)}
              >
                View all cases
              </button>
            </div>
          </section>

          <section className="metric-grid" aria-label="Case metrics">
            {metrics.map((metric) => (
              <article className="metric-card" key={metric.label}>
                <span className={`signal signal-${metric.tone}`} aria-hidden="true">
                  {metric.icon}
                </span>
                <div>
                  <strong>{metric.value}</strong>
                  <p>{metric.label}</p>
                  <small>{metric.hint}</small>
                </div>
              </article>
            ))}
          </section>

          <section className="ai-next-action" aria-label="Next review action">
            <span className="spark" aria-hidden="true">
              ✦
            </span>
            <div>
              <p className="eyebrow">Next review action</p>
              <h2>
                {priorityCase
                  ? `${priorityCase.id} needs operator review.`
                  : "No operator cases are waiting."}
              </h2>
              <p>
                {priorityCase
                  ? priorityCase.nextAction
                  : "The queue is empty for the current repository state."}
              </p>
            </div>
            <button
              className="button button-gold"
              type="button"
              onClick={openPriorityCase}
              disabled={!priorityCase}
            >
              Review now
            </button>
          </section>

          <div className="content-grid">
            <section
              className="priority-section"
              id="priority-queue"
              aria-labelledby="priority-title"
            >
              <div className="section-heading">
                <p className="eyebrow" id="priority-title">
                  Priority queue
                </p>
                <button
                  className="link-button"
                  type="button"
                  onClick={() => setToast(`Queue is loaded from ${sourceLabel}.`)}
                >
                  Queue source <span aria-hidden="true">→</span>
                </button>
              </div>
              <div className="case-list">
                {queueCases.length ? (
                  queueCases.map((caseItem, index) => (
                    <article className="case-card" key={caseItem.id}>
                      <span className="rank">{index + 1}</span>
                      <div className="case-main">
                        <div className="case-meta-line">
                          <strong>{caseItem.id}</strong>
                          <span className={`chip chip-${caseItem.tone}`}>
                            {caseItem.status}
                          </span>
                        </div>
                        <div className="chip-row">
                          <span className="chip chip-neutral">{caseItem.country}</span>
                          <span className="chip chip-neutral">{caseItem.city}</span>
                          <span className="chip chip-blue">{caseItem.group}</span>
                        </div>
                        <h3>{caseItem.applicant}</h3>
                        <p>{caseItem.nextAction}</p>
                        <small>{caseItem.agency}</small>
                      </div>
                      <div className="case-readiness">
                        <span>Readiness</span>
                        <strong>{caseItem.readiness}%</strong>
                        <div
                          className="progress"
                          aria-label={`${caseItem.readiness}% readiness`}
                        >
                          <span style={{ width: `${caseItem.readiness}%` }} />
                        </div>
                      </div>
                      <button
                        className="button button-primary"
                        type="button"
                        onClick={() => setSelectedCaseId(caseItem.id)}
                      >
                        Open
                      </button>
                    </article>
                  ))
                ) : (
                  <article className="empty-queue">
                    <h3>No cases available</h3>
                    <p>The repository returned no submissions for the admin queue.</p>
                  </article>
                )}
              </div>
            </section>

            <aside className="right-rail" aria-label="Queue overview">
              <section
                className="panel"
                id="queue-load"
                aria-labelledby="queue-load-title"
              >
                <div className="panel-head">
                  <p className="eyebrow" id="queue-load-title">
                    Queue load
                  </p>
                  <span className="soft-pill">Repository-backed</span>
                </div>
                {countryLoad.length ? (
                  countryLoad.map((item) => (
                    <div className="load-row" key={item.country}>
                      <span>{item.country}</span>
                      <strong>{item.count}</strong>
                      <div className="load-bar">
                        <span style={{ width: `${item.width}%` }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="panel-empty">No cases are in appointment tracking.</p>
                )}
                <div className="panel-stats">
                  <div>
                    <strong>
                      {countMatching(visibleSubmissions, ["appointment_scheduled"])}
                    </strong>
                    <span>Scheduled</span>
                  </div>
                  <div>
                    <strong>
                      {countMatching(visibleSubmissions, ["attention_required"])}
                    </strong>
                    <span>Needs decision</span>
                  </div>
                </div>
              </section>

              <section
                className="panel events-panel"
                id="events"
                aria-labelledby="events-title"
              >
                <p className="eyebrow" id="events-title">
                  Recent events
                </p>
                <ol className="event-list">
                  {recentEvents.map((submission) => (
                    <li key={submission.id}>
                      <strong>{submission.id}</strong>
                      <span>{statusMeta[submission.status].label}</span>
                      <small>{submission.updated}</small>
                    </li>
                  ))}
                </ol>
              </section>
            </aside>
          </div>

          <section
            className="status-board"
            id="status-board"
            aria-labelledby="status-board-title"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow" id="status-board-title">
                  Status board
                </p>
                <h2>Every state has an owner and next action.</h2>
              </div>
            </div>
            <div className="status-columns">
              {statusColumns.map((column) => (
                <article className="status-column" key={column.title}>
                  <h3>{column.title}</h3>
                  <p>{column.description}</p>
                  <ul>
                    {column.items.map(([label, owner, action]) => (
                      <li key={label}>
                        <span className="chip chip-neutral">{label}</span>
                        <strong>{owner}</strong>
                        <small>{action}</small>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>

      {selectedCase && selectedSubmission && selectedPreflight ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedCaseId(null);
            }
          }}
        >
          <section
            className="case-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="case-modal-title"
          >
            <header className="modal-header">
              <div>
                <p className="eyebrow">{selectedCase.id}</p>
                <h2 id="case-modal-title">{selectedCase.applicant}</h2>
                <p>
                  {selectedCase.agency} · {selectedCase.country} · {selectedCase.city}
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close case details"
                onClick={() => setSelectedCaseId(null)}
              >
                ×
              </button>
            </header>

            <div className="modal-body">
              <section className="modal-card">
                <p className="eyebrow">Decision summary</p>
                <p>{selectedCase.nextAction}</p>
              </section>

              <section className="modal-card data-card">
                <p className="eyebrow">Case data</p>
                <dl>
                  <div>
                    <dt>Status</dt>
                    <dd>{selectedCase.status}</dd>
                  </div>
                  <div>
                    <dt>Readiness</dt>
                    <dd>{selectedCase.readiness}%</dd>
                  </div>
                  <div>
                    <dt>Country</dt>
                    <dd>{selectedCase.country}</dd>
                  </div>
                  <div>
                    <dt>City</dt>
                    <dd>{selectedCase.city}</dd>
                  </div>
                </dl>
              </section>

              <section className="modal-card">
                <p className="eyebrow">Checklist</p>
                <ul className="checklist">
                  {selectedPreflight.checklist.map((item) => (
                    <li key={item.label}>
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="modal-card">
                <p className="eyebrow">Open blockers</p>
                {selectedPreflight.blockers.length ? (
                  <ul className="checklist">
                    {selectedPreflight.blockers.map((blocker) => (
                      <li key={blocker}>
                        <strong>Needs correction</strong>
                        <span>{blocker}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="modal-muted">No blockers in the admin preflight.</p>
                )}
              </section>

              {!canRunReviewAction(selectedSubmission) ? (
                <section className="modal-card">
                  <p className="eyebrow">Review actions closed</p>
                  <p>
                    This case has left human review. Use manual tracking instead of
                    moving it back to review states.
                  </p>
                </section>
              ) : null}
            </div>

            <footer className="modal-footer">
              {canRunReviewAction(selectedSubmission) ? (
                <>
                  <button
                    className="button button-light"
                    type="button"
                    onClick={returnToAgent}
                  >
                    Return to agent
                  </button>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={markReady}
                  >
                    Mark ready for queue
                  </button>
                </>
              ) : canRunHandoffAction(selectedSubmission) ? (
                <>
                  <button
                    className="button button-light"
                    type="button"
                    onClick={() => setSelectedCaseId(null)}
                  >
                    Close
                  </button>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={advanceHandoff}
                  >
                    {handoffActionLabel(selectedSubmission)}
                  </button>
                </>
              ) : (
                <button
                  className="button button-light"
                  type="button"
                  onClick={() => setSelectedCaseId(null)}
                >
                  Close
                </button>
              )}
            </footer>
          </section>
        </div>
      ) : null}

      <div
        className={`toast ${toast ? "is-visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {toast}
      </div>
    </div>
  );
}

export default App;
