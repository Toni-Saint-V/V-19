import type { AgentNavSection } from '../integration/visaflowBusinessBridge';
import { requiredPassportReviewMediaTypesForApplicant } from '../modules/submissions/passportReviewContract';
import type { Issue, Submission, SubmissionAction, SubmissionFile, SubmissionStatus } from '../modules/submissions/types';
import { canPerformAction, fixedIssueCount, nextProblem, openIssueCount, statusLabelFor } from '../modules/submissions/status';
import { submissionPublicId } from '../modules/submissions/submissionIdentity';

export type LegacyAgentNavSection = AgentNavSection | 'applicants' | 'files' | 'media' | 'issues';

export type LegacySubmissionListItem = {
  id: string;
  publicId?: string;
  title: string;
  type: 'single' | 'family';
  applicantsCount: number;
  city: string;
  tripDates: string;
  status: SubmissionStatus;
  completeness: number;
  updated: string;
  owner: string;
  nextAction?: string;
  issueCount?: number;
};

export type LegacyDocumentStatus = 'verified' | 'processing' | 'error' | 'missing';

export type LegacyDocumentCell = {
  key: string;
  label: string;
  status: LegacyDocumentStatus;
  applicantId: string;
  applicantName: string;
  fileId?: string;
  issueCount: number;
};

export type LegacyMediaFile = {
  id: string;
  name: string;
  type: 'pdf' | 'image';
  category: 'all' | 'passports' | 'selfies' | 'financial' | 'other';
  size: string;
  status: 'verified' | 'processing' | 'error';
  applicant: string;
  submissionId: string;
  date: string;
  storagePath?: string;
};

export type LegacyIssueRow = {
  id: string;
  type: 'critical' | 'warning';
  title: string;
  description: string;
  applicant: string;
  submissionId: string;
  date: string;
  status: Issue['status'];
};

export function canonicalAgentNav(section: LegacyAgentNavSection): AgentNavSection | null {
  if (section === 'actions' || section === 'documents' || section === 'submissions' || section === 'settings') {
    return section;
  }
  return null;
}

export function legacySectionLabel(section: LegacyAgentNavSection) {
  switch (section) {
    case 'actions':
      return 'Мои действия';
    case 'documents':
      return 'Сбор документов';
    case 'submissions':
      return 'Мои подачи';
    case 'settings':
      return 'Настройки';
    case 'applicants':
      return 'Заявители / Семьи';
    case 'media':
    case 'files':
      return 'Файлы / Медиа';
    case 'issues':
      return 'Замечания';
  }
}

export function tripDatesForSubmission(submission: Pick<Submission, 'tripDateFrom' | 'tripDateTo'>) {
  const from = submission.tripDateFrom?.trim() || 'не указано';
  const to = submission.tripDateTo?.trim() || 'не указано';
  return from === to ? from : `${from}–${to}`;
}

export function tripDateRangeForSubmission(
  submission: Pick<Submission, 'tripDateFrom' | 'tripDateTo'>,
): string | undefined {
  const from = submission.tripDateFrom?.trim() ?? '';
  const to = submission.tripDateTo?.trim() ?? '';
  const isMissing = (value: string) => !value || /не указан[ао]?/i.test(value);
  const compact = (value: string) => {
    const match = value.match(/^(\d{2})\.(\d{2})\.(?:\d{4})$/);
    return match ? `${match[1]}.${match[2]}` : value;
  };

  if (isMissing(from) && isMissing(to)) return undefined;
  if (isMissing(from)) return compact(to);
  if (isMissing(to) || from === to) return compact(from);
  return `${compact(from)}–${compact(to)}`;
}

export function updatedLabel(iso?: string) {
  if (!iso) return 'нет данных';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function listItemFromSubmission(submission: Submission): LegacySubmissionListItem {
  return {
    id: submission.id,
    publicId: submissionPublicId(submission),
    title: submission.listTitle ?? submission.title,
    type: submission.type,
    applicantsCount: submission.applicants.length,
    city: submission.city,
    tripDates: tripDatesForSubmission(submission),
    status: submission.status,
    completeness: submission.completeness.total,
    updated: updatedLabel(submission.updatedAt),
    owner: submission.agentId,
    nextAction: nextProblem(submission),
    issueCount: openIssueCount(submission) + fixedIssueCount(submission),
  };
}

export function listItemsFromSubmissions(submissions?: Submission[]): LegacySubmissionListItem[] {
  return submissions?.map(listItemFromSubmission) ?? [];
}

export function statusLabel(status: SubmissionStatus) {
  return statusLabelFor(status, 'full');
}

export function actionGate(submission: Submission | undefined, action: SubmissionAction, role: 'agent' | 'admin') {
  if (!submission) return { ok: false, reason: 'Подача не выбрана' } as const;
  return canPerformAction(submission, action, role);
}

export function applicantInitials(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join('');
  return letters || 'З';
}

export function fileSlotLabel(type: SubmissionFile['type']) {
  switch (type) {
    case 'passport_scan':
      return 'Загран';
    case 'selfie':
      return 'Селфи';
    case 'selfie_2':
      return 'Селфи 2';
    case 'photo':
    case 'photo_white':
      return 'Фото';
    case 'video':
      return 'Видео';
    default:
      return String(type);
  }
}

export function fileToDocumentStatus(file?: SubmissionFile): LegacyDocumentStatus {
  if (!file) return 'missing';
  if (file.status === 'accepted' || file.reviewStatus === 'accepted') return 'verified';
  if (file.status === 'needs_replacement' || file.reviewStatus === 'replace_required' || file.reviewStatus === 'poor_quality') return 'error';
  if (file.uploadStatus === 'failed') return 'error';
  if (file.status === 'pending_review' || file.uploadStatus === 'pending') return 'processing';
  if (file.status === 'uploaded') return 'processing';
  return 'missing';
}

export function documentCellsForSubmission(submission: Submission): LegacyDocumentCell[] {
  const cells: LegacyDocumentCell[] = [];
  const issueByApplicantAndType = new Map<string, number>();
  for (const issue of submission.issues) {
    if (issue.status === 'closed_by_admin') continue;
    const key = `${issue.target.applicantId}:${issue.target.fileType ?? ''}`;
    issueByApplicantAndType.set(key, (issueByApplicantAndType.get(key) ?? 0) + 1);
  }
  for (const applicant of submission.applicants) {
    for (const slot of requiredPassportReviewMediaTypesForApplicant(
      submission,
      applicant.id,
    )) {
      const file = submission.files.find((item) => item.applicantId === applicant.id && item.type === slot);
      const key = `${applicant.id}:${slot}`;
      cells.push({
        key,
        label: fileSlotLabel(slot),
        status: fileToDocumentStatus(file),
        applicantId: applicant.id,
        applicantName: applicant.fullName,
        fileId: file?.id,
        issueCount: issueByApplicantAndType.get(key) ?? 0,
      });
    }
  }
  return cells;
}

export function mediaRowsFromSubmissions(submissions?: Submission[]): LegacyMediaFile[] {
  return (submissions ?? []).flatMap((submission) =>
    submission.files
      .filter((file) => file.status !== 'missing')
      .map((file) => {
        const applicant = submission.applicants.find((item) => item.id === file.applicantId);
        const mimeType = file.mimeType ?? '';
        return {
          id: file.id,
          name: file.originalFileName ?? file.generatedFileName ?? `${fileSlotLabel(file.type)} · ${submission.id}`,
          type: mimeType.includes('pdf') || file.type === 'passport_scan' ? 'pdf' : 'image',
          category: file.type === 'passport_scan' ? 'passports' : file.type === 'selfie' || file.type === 'selfie_2' ? 'selfies' : 'other',
          size: file.sizeBytes ? `${Math.max(1, Math.round(file.sizeBytes / 1024))} KB` : '—',
          status: fileToDocumentStatus(file) === 'verified' ? 'verified' : fileToDocumentStatus(file) === 'error' ? 'error' : 'processing',
          applicant: applicant?.fullName ?? 'Заявитель',
          submissionId: submission.id,
          date: updatedLabel(file.uploadedAtIso ?? submission.updatedAt),
          storagePath: file.storagePath,
        } satisfies LegacyMediaFile;
      }),
  );
}

export function issueRowsFromSubmissions(submissions?: Submission[]): LegacyIssueRow[] {
  return (submissions ?? []).flatMap((submission) =>
    submission.issues
      .filter((issue) => issue.status !== 'closed_by_admin')
      .map((issue) => ({
        id: issue.id,
        type: issue.severity === 'blocker' ? 'critical' : 'warning',
        title: issue.reason,
        description: issue.comment || issue.snapshot || 'Нужно проверить и исправить перед следующим статусом.',
        applicant: issue.target.applicantName,
        submissionId: submission.id,
        date: updatedLabel(issue.createdAt),
        status: issue.status,
      })),
  );
}

export function canShowInExportQueue(submission: Submission) {
  return submission.status === 'ready_for_export' && submission.exportState !== 'marked_exported';
}
