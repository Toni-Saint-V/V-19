import { initialSubmissions } from "../data/demoData";
import type { AppointmentStatus, ExportBatch, Role, Submission } from "../types/domain";
import {
  appendExportBatch,
  filteredSubmissions,
  normalizeSubmission,
  statusMatchesFilter,
} from "../lib/workflow";

const storageKey = "visaflow.localSubmissions.v1";

export interface DashboardSelectors {
  active: number;
  filling: number;
  corrections: number;
  reviewWaiting: number;
  inReview: number;
  acceptedOrReady: number;
  exportedOrAppointment: number;
}

export function loadLocalSubmissions(): Submission[] {
  if (typeof window === "undefined") {
    return initialSubmissions.map(normalizeSubmission);
  }

  const stored = window.localStorage.getItem(storageKey);
  if (!stored) return initialSubmissions.map(normalizeSubmission);

  try {
    const parsed = JSON.parse(stored) as Submission[];
    return parsed.map(normalizeSubmission);
  } catch {
    window.localStorage.removeItem(storageKey);
    return initialSubmissions.map(normalizeSubmission);
  }
}

export function saveLocalSubmissions(submissions: Submission[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    storageKey,
    JSON.stringify(submissions.map(normalizeSubmission)),
  );
}

export function selectSubmissionsForRole(
  submissions: Submission[],
  role: Role,
  agentId: string,
): Submission[] {
  const normalized = submissions.map(normalizeSubmission);
  return role === "admin"
    ? normalized
    : normalized.filter((submission) => submission.agentId === agentId);
}

export function selectQueue(
  submissions: Submission[],
  filter: Parameters<typeof statusMatchesFilter>[1],
): Submission[] {
  const normalized = submissions.map(normalizeSubmission);
  return filter === "all" ? normalized : filteredSubmissions(normalized, filter);
}

export function dashboardSelectors(
  submissions: Submission[],
  role: Role,
  agentId: string,
): DashboardSelectors {
  const visible = selectSubmissionsForRole(submissions, role, agentId);

  return {
    active: visible.filter((submission) => submission.status !== "completed").length,
    filling: visible.filter((submission) =>
      ["draft", "filling", "ready_for_review"].includes(submission.status),
    ).length,
    corrections: visible.filter((submission) => submission.status === "returned")
      .length,
    reviewWaiting: visible.filter(
      (submission) => submission.status === "waiting_review",
    ).length,
    inReview: visible.filter((submission) => submission.status === "in_review").length,
    acceptedOrReady: visible.filter((submission) =>
      ["accepted", "ready_for_excel"].includes(submission.status),
    ).length,
    exportedOrAppointment: visible.filter((submission) =>
      [
        "exported",
        "sent_to_appointment",
        "appointment_scheduled",
        "attention_required",
        "completed",
      ].includes(submission.status),
    ).length,
  };
}

export function replaceSubmission(
  submissions: Submission[],
  nextSubmission: Submission,
): Submission[] {
  return submissions.map((submission) =>
    submission.id === nextSubmission.id
      ? normalizeSubmission(nextSubmission)
      : submission,
  );
}

export function markSubmissionsExported(
  submissions: Submission[],
  readyIds: Set<string>,
  batch: ExportBatch,
  changedBy: string,
  changedAt: string,
): Submission[] {
  return submissions.map((submission) =>
    readyIds.has(submission.id)
      ? appendExportBatch(submission, batch, changedBy, changedAt)
      : submission,
  );
}

export function updateAppointmentStatus(
  submission: Submission,
  status: AppointmentStatus,
  changedBy: string,
  changedAt: string,
): Submission {
  const nextStatus =
    status === "not_started"
      ? "exported"
      : status === "sent_to_appointment"
        ? "sent_to_appointment"
        : status === "appointment_scheduled"
          ? "appointment_scheduled"
          : status === "attention_required"
            ? "attention_required"
            : "completed";

  return normalizeSubmission({
    ...submission,
    status: nextStatus,
    appointment: status,
    appointmentDetails: {
      ...(submission.appointmentDetails ?? {
        submissionId: submission.id,
      }),
      submissionId: submission.id,
      status,
      city: submission.appointmentDetails?.city ?? submission.city,
      updatedBy: changedBy,
      updatedAt: changedAt,
    },
    updated: changedAt,
    timeline: [
      ...(submission.timeline ?? []),
      {
        id: `${submission.id}-appointment-${Date.now()}`,
        entityType: "appointment",
        entityId: submission.id,
        fromStatus: submission.appointment,
        toStatus: status,
        comment: "Оператор обновил ручной статус записи.",
        changedBy,
        changedAt,
      },
    ],
  });
}
