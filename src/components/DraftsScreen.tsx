import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  FileWarning,
  Loader2,
  MoreVertical,
  Plus,
  ScanLine,
  UploadCloud,
  User,
  Users,
} from 'lucide-react';
import type {
  Submission,
  SubmissionFile,
  SubmissionFileType,
} from '../modules/submissions/types';
import {
  uploadRequiredFile,
  type UploadedFileMetadata,
} from '../modules/submissions/submissionActions';
import { finishPassportExtraction } from '../modules/submissions/passportExtraction';
import {
  safeUnavailablePassportExtractionResult,
  type PassportExtractionResult,
} from '../modules/submissions/passportExtractionContract';
import { V19MetricCard, V19MetricStrip } from '../shared/ui/v19-design-system';
import { passportNumberFromApplicant } from '../modules/submissions/filenamePolicy';
import {
  canonicalCollectionDocTypes,
  collectionDocTypes,
  detectCollectionDocType,
  normalizeCollectionPassportNumber,
  passportNumberFromCollectionText,
  resolveCollectionUploadTarget,
  type CollectionDocType,
} from '../modules/submissions/documentCollectionIntake';
import { fileToDocumentStatus } from './v19BusinessScreenAdapter';

interface DraftsScreenProps {
  initialFilter?: DraftSummaryFilter;
  onOpenDrawer: (id: string) => void;
  onOpenIssue: (target: DocumentIssueTarget) => void;
  onSubmissionsChange?: (submissions: Submission[]) => void | Promise<void>;
  onUploadFile?: (
    submissionId: string,
    fileId: string,
    file: File,
  ) => Submission | Promise<Submission>;
  submissions?: Submission[];
}

type DocStatus = 'verified' | 'processing' | 'error' | 'missing';
export type DraftSummaryFilter = 'missing' | 'processing' | 'error';

type MatrixApplicant = {
  docs: Record<CollectionDocType, DocStatus>;
  id: string;
  isPrimary: boolean;
  name: string;
  passportNumber: string;
  role: string;
};

type MatrixSubmission = {
  applicants: MatrixApplicant[];
  city: string;
  country: string;
  deadline: string;
  id: string;
  progress: number;
  title: string;
  tripDates: string;
  type: 'single' | 'family';
};

type PendingCellTarget = {
  applicantId: string;
  docType: CollectionDocType;
  submissionId: string;
};

export type DocumentIssueTarget = PendingCellTarget;

type UnmatchedUpload = {
  applicantId?: string;
  detectedDocType: CollectionDocType | 'unknown';
  file: File;
  id: string;
  passportNumber?: string;
  reason: string;
  submissionId?: string;
};

const docTypes = collectionDocTypes.filter((doc) =>
  canonicalCollectionDocTypes.has(doc.key),
);
const passportCollectionExtractionTimeoutMs = 10_000;

function requiredDocTypesForApplicant(applicant: MatrixApplicant) {
  return applicant.isPrimary
    ? docTypes
    : docTypes.filter((doc) => doc.key === 'passport');
}

function groupSubmissionsByType(submissions: MatrixSubmission[]) {
  return [
    {
      key: 'family' as const,
      label: 'Семьи',
      submissions: submissions.filter((submission) => submission.type === 'family'),
    },
    {
      key: 'single' as const,
      label: 'Одиночные заявители',
      submissions: submissions.filter((submission) => submission.type === 'single'),
    },
  ].filter((group) => group.submissions.length > 0);
}

function applicantRoleLabel(applicant: Submission['applicants'][number]) {
  if (applicant.role === 'main') return 'Основной';
  if (applicant.role === 'spouse') return 'Супруг(а)';
  if (applicant.role === 'child') return 'Ребёнок';
  return 'Заявитель';
}

function applicantDisplayName(applicant: Submission['applicants'][number]) {
  const identityFields = new Map(
    applicant.sections.flatMap((section) =>
      section.fields.map((field) => [field.id, field.value.trim()] as const),
    ),
  );
  const nameFromFields = [identityFields.get('first-name'), identityFields.get('surname')]
    .filter(Boolean)
    .join(' ');
  return nameFromFields || applicant.fullName;
}

function docStatusClass(status: DocStatus) {
  if (status === 'verified') return 'bg-white/[0.045] border-white/10 text-[#b8baff]';
  if (status === 'processing') return 'bg-white/[0.045] border-white/10 text-[#b8baff]';
  if (status === 'error') return 'bg-[#24191b]/60 border-[#5b2b32]/50 text-[#d59aa3]';
  return 'bg-white/5 border-dashed border-white/20 text-white/60 hover:border-white/50 hover:bg-white/10 hover:text-white';
}

function docStatusLabel(status: DocStatus) {
  if (status === 'verified') return 'Загружено';
  if (status === 'processing') return 'В обработке';
  if (status === 'error') return 'Проверить';
  return 'Загрузить документ';
}

function fileStatusToDocStatus(file?: SubmissionFile): DocStatus {
  return fileToDocumentStatus(file);
}

function applicantDocs(
  submission: Submission,
  applicant: Submission['applicants'][number],
): Record<CollectionDocType, DocStatus> {
  const applicantFiles = submission.files.filter((file) => file.applicantId === applicant.id);
  return {
    passport: fileStatusToDocStatus(applicantFiles.find((file) => file.type === 'passport_scan')),
    selfie: fileStatusToDocStatus(applicantFiles.find((file) => file.type === 'selfie')),
    selfie2: fileStatusToDocStatus(applicantFiles.find((file) => file.type === 'selfie_2')),
    questionnaire: 'missing',
  };
}

function submissionDeadline(submission: Submission) {
  if (submission.status === 'returned') return 'Требует исправлений';
  if (submission.status === 'submitted_for_review') return 'На проверке';
  if (submission.status === 'ready_for_export') return 'Готово к выгрузке';
  return 'В работе';
}

function compactTripDates(submission: Submission) {
  const from = submission.tripDateFrom.replace(/\.2026/g, '');
  const to = submission.tripDateTo.replace(/\.2026/g, '');
  return from && to ? `${from}–${to}` : from || to || 'Даты не указаны';
}

function buildMatrixSubmissions(submissions: Submission[]): MatrixSubmission[] {
  return submissions.map((submission) => {
    const applicants = submission.applicants.map((applicant) => ({
      docs: applicantDocs(submission, applicant),
      id: applicant.id,
      isPrimary: applicant.role === 'main',
      name: applicantDisplayName(applicant),
      passportNumber: normalizeCollectionPassportNumber(passportNumberFromApplicant(applicant)),
      role: applicantRoleLabel(applicant),
    }));
    const statuses = applicants.flatMap((applicant) =>
      requiredDocTypesForApplicant(applicant).map((doc) => applicant.docs[doc.key]),
    );
    const ready = statuses.filter((status) => status === 'verified').length;

    return {
      applicants,
      city: submission.city,
      country: submission.country,
      deadline: submissionDeadline(submission),
      id: submission.id,
      progress: statuses.length ? Math.round((ready / statuses.length) * 100) : 0,
      title: submission.listTitle ?? submission.title,
      tripDates: compactTripDates(submission),
      type: submission.type,
    };
  });
}

function findFreeCanonicalTarget(
  submission: Submission,
  applicantId: string,
  docType: CollectionDocType,
) {
  const targetTypes: SubmissionFileType[] =
    docType === 'passport'
      ? ['passport_scan']
      : docType === 'selfie'
        ? ['selfie']
        : docType === 'selfie2'
          ? ['selfie_2']
          : [];
  const applicant = submission.applicants.find((candidate) => candidate.id === applicantId);
  return submission.files.find((file) => {
    const canRetryPassportWithoutExtraction =
      docType === 'passport' &&
      file.status === 'uploaded' &&
      !applicant?.passportExtraction;

    return (
      file.applicantId === applicantId &&
      targetTypes.includes(file.type) &&
      (file.status === 'missing' ||
        file.status === 'needs_replacement' ||
        canRetryPassportWithoutExtraction)
    );
  });
}

function mimeTypeForFile(file: File, docType: CollectionDocType) {
  if (file.type) return file.type;
  if (docType === 'passport' || docType === 'questionnaire') {
    return 'application/pdf';
  }
  return 'image/jpeg';
}

function metadataForFile(file: File, docType: CollectionDocType): UploadedFileMetadata {
  const uploadedAtIso = new Date().toISOString();
  const safeName = file.name.replace(/[^a-zа-яё0-9_.-]+/gi, '-').replace(/^-+|-+$/g, '') || `${docType}-upload`;
  return {
    generatedFileName: `${uploadedAtIso.replace(/[^0-9]/g, '').slice(0, 14)}-${safeName}`,
    mimeType: mimeTypeForFile(file, docType),
    originalFileName: file.name,
    sizeBytes: file.size,
    storageAdapter: 'local-dev',
    uploadedAtIso,
  };
}

function applyCanonicalUpload(
  submissions: Submission[],
  target: PendingCellTarget,
  file: File,
) {
  let applied = false;
  const nextSubmissions = submissions.map((submission) => {
    if (submission.id !== target.submissionId) return submission;
    const targetFile = findFreeCanonicalTarget(submission, target.applicantId, target.docType);
    if (!targetFile) return submission;

    const updated = uploadRequiredFile(
      submission,
      targetFile.id,
      metadataForFile(file, target.docType),
    );
    applied = updated !== submission;
    return updated;
  });

  return { applied, nextSubmissions };
}

async function attachPassportExtractionForUpload(
  submissions: Submission[],
  target: PendingCellTarget,
  localFile: File,
) {
  const submission = submissions.find((candidate) => candidate.id === target.submissionId);
  const applicantIndex = submission?.applicants.findIndex(
    (applicant) => applicant.id === target.applicantId,
  );
  const passportFile = submission?.files.find(
    (file) =>
      file.applicantId === target.applicantId && file.type === 'passport_scan',
  );
  if (!submission || applicantIndex === undefined || applicantIndex < 0 || !passportFile) {
    return submissions;
  }

  const { invokePassportExtraction } = await import('../modules/submissions/passportExtractionService');
  const extraction = await Promise.race<PassportExtractionResult>([
    invokePassportExtraction({
      applicantIndex,
      localFile,
      openAiFallbackAllowed: false,
    }),
    new Promise((resolve) =>
      window.setTimeout(
        () => resolve(safeUnavailablePassportExtractionResult(applicantIndex)),
        passportCollectionExtractionTimeoutMs,
      ),
    ),
  ]);

  return submissions.map((candidate) =>
    candidate.id === submission.id
      ? finishPassportExtraction(candidate, passportFile, extraction)
      : candidate,
  );
}

async function passportNumberFromPassportOcr(file: File) {
  try {
    const { invokePassportExtraction } = await import('../modules/submissions/passportExtractionService');
    const result = await invokePassportExtraction({
      applicantIndex: 0,
      localFile: file,
      openAiFallbackAllowed: false,
    });
    const passportField = result.fields.find((field) => field.key === 'passportNumber');
    return normalizeCollectionPassportNumber(passportField?.value);
  } catch {
    return '';
  }
}

function applicantIndex(submissions: Submission[]) {
  return submissions.flatMap((submission) =>
    submission.applicants.map((applicant) => ({
      applicantId: applicant.id,
      applicantName: applicant.fullName,
      passportNumber: normalizeCollectionPassportNumber(passportNumberFromApplicant(applicant)),
      submissionId: submission.id,
    })),
  );
}

function targetRequiresDocType(
  submissions: Submission[],
  target: PendingCellTarget,
) {
  if (!canonicalCollectionDocTypes.has(target.docType)) return false;
  if (target.docType === 'passport') return true;
  const submission = submissions.find((candidate) => candidate.id === target.submissionId);
  const applicant = submission?.applicants.find(
    (candidate) => candidate.id === target.applicantId,
  );
  return applicant?.role === 'main';
}

async function detectedPassportNumber(file: File, detectedDocType: CollectionDocType | 'unknown') {
  const fromName = passportNumberFromCollectionText(file.name);
  if (fromName) return fromName;
  if (detectedDocType !== 'passport') return '';
  return passportNumberFromPassportOcr(file);
}

function firstApplicantTarget(submissions: Submission[]) {
  const submission = submissions[0];
  const applicant = submission?.applicants[0];
  if (!submission || !applicant) return {};
  return { applicantId: applicant.id, submissionId: submission.id };
}

function formatBytes(size: number) {
  if (!size) return '0 KB';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const DocCell = ({
  label,
  onReview,
  onUpload,
  status,
}: {
  label: string;
  onReview: () => void;
  onUpload: () => void;
  status: DocStatus;
}) => {
  const className = `v19-document-desktop-cell is-${status} w-8 h-8 rounded-lg flex items-center justify-center border mx-auto transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${docStatusClass(status)}`;
  const actionLabel = `${label}: ${docStatusLabel(status)}`;
  if (status === 'missing') {
    return (
      <button aria-label={actionLabel} className={className} title={actionLabel} type="button" onClick={onUpload}>
        <Plus className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      aria-label={actionLabel}
      className={className}
      title={actionLabel}
      type="button"
      onClick={status === 'error' ? onReview : onUpload}
    >
      {status === 'verified' ? <CheckCircle2 className="w-[18px] h-[18px]" /> : null}
      {status === 'processing' ? <ScanLine className="w-[16px] h-[16px] animate-pulse" /> : null}
      {status === 'error' ? <AlertCircle className="w-[18px] h-[18px]" /> : null}
    </button>
  );
};

const MobileDocSlot = ({
  label,
  onReview,
  onUpload,
  status,
}: {
  label: string;
  onReview: () => void;
  onUpload: () => void;
  status: DocStatus;
}) => {
  const isMissing = status === 'missing';

  return (
    <button
      aria-label={`${label}: ${docStatusLabel(status)}`}
      data-testid="document-mobile-slot"
      className={`v19-document-mobile-slot is-${status} flex min-h-[64px] items-center justify-between gap-1 rounded-xl border px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] sm:gap-2 sm:px-3 ${docStatusClass(status)}`}
      type="button"
      onClick={status === 'error' ? onReview : onUpload}
      title={`${label}: ${docStatusLabel(status)}`}
    >
      <span className="v19-mobile-document-slot-copy min-w-0">
        <span className="v19-mobile-document-slot-label block text-[12px] font-semibold text-white/80">{label}</span>
        <span className="v19-mobile-document-slot-status mt-1 block text-[10px] font-medium text-current">
          {isMissing ? 'Добавить' : docStatusLabel(status)}
        </span>
      </span>
      <span className="v19-document-mobile-slot-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#101011]/70 sm:h-8 sm:w-8">
        {status === 'verified' ? <CheckCircle2 className="h-4 w-4" /> : null}
        {status === 'processing' ? <ScanLine className="h-4 w-4 animate-pulse" /> : null}
        {status === 'error' ? <AlertCircle className="h-4 w-4" /> : null}
        {isMissing ? <Plus className="h-4 w-4" /> : null}
      </span>
    </button>
  );
};

export function DraftsScreen({
  initialFilter = 'missing',
  onOpenDrawer,
  onOpenIssue,
  onSubmissionsChange,
  onUploadFile,
  submissions = [],
}: DraftsScreenProps) {
  const [unmatchedUploads, setUnmatchedUploads] = useState<UnmatchedUpload[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [pendingCellTarget, setPendingCellTarget] = useState<PendingCellTarget | null>(null);
  const [draftSummaryFilter, setDraftSummaryFilter] = useState<DraftSummaryFilter>(initialFilter);
  useEffect(() => {
    setDraftSummaryFilter(initialFilter);
  }, [initialFilter]);
  const cellInputRef = useRef<HTMLInputElement | null>(null);
  const bulkInputRef = useRef<HTMLInputElement | null>(null);
  const allDrafts = useMemo(() => buildMatrixSubmissions(submissions), [submissions]);
  const visibleDrafts = useMemo(
    () =>
      allDrafts.filter((submission) =>
        submission.applicants.some((applicant) =>
          requiredDocTypesForApplicant(applicant).some(
            (doc) => applicant.docs[doc.key] === draftSummaryFilter,
          ),
        ),
      ),
    [allDrafts, draftSummaryFilter],
  );
  const draftGroups = useMemo(
    () => groupSubmissionsByType(visibleDrafts),
    [visibleDrafts],
  );
  const summary = useMemo(() => {
    const statuses = allDrafts.flatMap((submission) =>
      submission.applicants.flatMap((applicant) =>
        requiredDocTypesForApplicant(applicant).map(
          (doc) => applicant.docs[doc.key],
        ),
      ),
    );
    return {
      error: statuses.filter((status) => status === 'error').length,
      missing: statuses.filter((status) => status === 'missing').length,
      processing: statuses.filter((status) => status === 'processing').length,
      submissions: allDrafts.length,
    };
  }, [allDrafts]);

  const commitSubmissions = async (nextSubmissions: Submission[]) => {
    setUploadError('');
    try {
      await onSubmissionsChange?.(nextSubmissions);
      return true;
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить изменения. Попробуйте повторить загрузку.',
      );
      return false;
    }
  };

  const assignFileToTarget = async (
    target: PendingCellTarget,
    file: File,
  ) => {
    const submission = submissions.find(
      (candidate) => candidate.id === target.submissionId,
    );
    const targetFile = submission && findFreeCanonicalTarget(
      submission,
      target.applicantId,
      target.docType,
    );
    if (!submission || !targetFile || !targetRequiresDocType(submissions, target)) {
      return false;
    }

    if (onUploadFile) {
      const uploadedSubmission = await onUploadFile(submission.id, targetFile.id, file);
      if (target.docType !== 'passport') return true;

      const extractedSubmissions = await attachPassportExtractionForUpload(
        [uploadedSubmission],
        target,
        file,
      );
      const extractedSubmission = extractedSubmissions[0];
      if (!extractedSubmission || extractedSubmission === uploadedSubmission) return true;
      return commitSubmissions([extractedSubmission]);
    }

    if (targetRequiresDocType(submissions, target)) {
      const result = applyCanonicalUpload(submissions, target, file);
      if (result.applied) {
        const nextSubmissions =
          target.docType === 'passport'
            ? await attachPassportExtractionForUpload(
                result.nextSubmissions,
                target,
                file,
              )
            : result.nextSubmissions;
        return commitSubmissions(nextSubmissions);
      }
      return false;
    }

    return false;
  };

  const triggerCellUpload = (target: PendingCellTarget) => {
    setPendingCellTarget(target);
    cellInputRef.current?.click();
  };

  const handleCellFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || !pendingCellTarget) return;
    void assignFileToTarget(pendingCellTarget, file).finally(() =>
      setPendingCellTarget(null),
    );
  };

  const handleBulkFiles = async (files: FileList | File[]) => {
    const uploadFiles = Array.from(files);
    if (!uploadFiles.length) return;
    setBulkBusy(true);
    const unmatched: UnmatchedUpload[] = [];
    const autoAssigned: UnmatchedUpload[] = [];
    let workingSubmissions = submissions;
    let submissionsChanged = false;

    try {
      for (const file of uploadFiles) {
        const detectedDocType = detectCollectionDocType(file.name);
        const passportNumber = await detectedPassportNumber(file, detectedDocType);
        const resolution = resolveCollectionUploadTarget({
          applicants: applicantIndex(submissions),
          detectedDocType,
          passportNumber,
        });

        if (resolution.status === 'unmatched') {
          unmatched.push({
            ...firstApplicantTarget(submissions),
            detectedDocType,
            file,
            id: `unmatched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            passportNumber,
            reason: resolution.reason,
          });
          continue;
        }

        const target = resolution.target;
        if (!canonicalCollectionDocTypes.has(target.docType)) {
          unmatched.push({
            applicantId: target.applicantId,
            detectedDocType,
            file,
            id: `unmatched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            passportNumber,
            reason: 'Этот тип файла не входит в пакет документов.',
            submissionId: target.submissionId,
          });
          continue;
        }

        const targetSubmission = workingSubmissions.find(
          (submission) => submission.id === target.submissionId,
        );
        const targetApplicant = targetSubmission?.applicants.find(
          (applicant) => applicant.id === target.applicantId,
        );
        if (target.docType !== 'passport' && targetApplicant?.role !== 'main') {
          unmatched.push({
            applicantId: target.applicantId,
            detectedDocType,
            file,
            id: `unmatched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            passportNumber,
            reason: 'Для члена семьи требуется только скан загранпаспорта.',
            submissionId: target.submissionId,
          });
          continue;
        }

        const result = applyCanonicalUpload(workingSubmissions, target, file);

        if (result.applied) {
          workingSubmissions = result.nextSubmissions;
          submissionsChanged = true;
          autoAssigned.push({
            applicantId: target.applicantId,
            detectedDocType,
            file,
            id: `unmatched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            passportNumber,
            reason: 'Сохранение не прошло. Назначьте повторно после проверки.',
            submissionId: target.submissionId,
          });
          continue;
        }

        unmatched.push({
          applicantId: target.applicantId,
          detectedDocType,
          file,
          id: `unmatched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          passportNumber,
          reason: 'В canonical слот нельзя загрузить файл в текущем статусе.',
          submissionId: target.submissionId,
        });
      }

      if (submissionsChanged) {
        const saved = await commitSubmissions(workingSubmissions);
        if (!saved) unmatched.push(...autoAssigned);
      }
      setUnmatchedUploads((current) => [...unmatched, ...current]);
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : 'Массовая загрузка прервалась. Проверьте нераспределённые файлы.',
      );
      setUnmatchedUploads((current) => [...unmatched, ...autoAssigned, ...current]);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.currentTarget.files) void handleBulkFiles(event.currentTarget.files);
    event.currentTarget.value = '';
  };

  const assignUnmatchedUpload = async (upload: UnmatchedUpload) => {
    if (!upload.submissionId || !upload.applicantId || upload.detectedDocType === 'unknown') return;
    const applied = await assignFileToTarget(
      {
        applicantId: upload.applicantId,
        docType: upload.detectedDocType,
        submissionId: upload.submissionId,
      },
      upload.file,
    );
    if (applied) {
      setUnmatchedUploads((current) => current.filter((item) => item.id !== upload.id));
    }
  };

  const updateUnmatchedUpload = (id: string, patch: Partial<UnmatchedUpload>) => {
    setUnmatchedUploads((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  if (!submissions.length) {
    return (
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-dashed border-[#242529] bg-[#161617] p-8 text-center"
        initial={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.3 }}
      >
        <h2 className="text-[16px] font-semibold text-white">Документы ещё не собирались</h2>
        <p className="mt-2 text-[13px] text-white/45">
          Создайте первую подачу или загрузите пакет документов.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="v19-documents-screen space-y-6 lg:space-y-8"
    >
      <input
        data-testid="document-cell-file-input"
        ref={cellInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf"
        className="hidden"
        onChange={handleCellFileInput}
      />
      <input
        data-testid="document-bulk-file-input"
        ref={bulkInputRef}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf"
        className="hidden"
        onChange={handleBulkFileInput}
      />

      <V19MetricStrip>
        <V19MetricCard
          active={draftSummaryFilter === 'missing'}
          detail={`ожидают · ${summary.submissions}`}
          icon={UploadCloud}
          label="Загрузки"
          tone="neutral"
          value={summary.missing}
          onClick={() => setDraftSummaryFilter('missing')}
        />
        <V19MetricCard
          active={draftSummaryFilter === 'processing'}
          detail="OCR"
          icon={ScanLine}
          label="В обработке"
          tone="indigo"
          value={summary.processing}
          onClick={() => setDraftSummaryFilter('processing')}
        />
        <V19MetricCard
          active={draftSummaryFilter === 'error'}
          detail="ревью"
          icon={FileWarning}
          label="Ошибки"
          tone="red"
          value={summary.error}
          onClick={() => setDraftSummaryFilter('error')}
        />
      </V19MetricStrip>

      <div
        className="v19-documents-board flex flex-col overflow-hidden rounded-2xl border border-[#242529] bg-[#161617] shadow-[0_4px_24px_rgba(0,0,0,0.15)]"
        data-testid="document-collection-matrix"
      >
        <div className="v19-documents-board-header flex items-center justify-between border-b border-[#242529] bg-[#1a1a1d] px-4 py-4">
          <div className="v19-documents-board-heading">
            <h2>Загрузка документов</h2>
            <p className="mt-1 text-[11px] text-white/50 sm:text-[12px]">
              Загрузите сканы загранпаспортов для всех заявителей и два селфи заявителя.
            </p>
          </div>
          <button
            aria-label="Массовая загрузка документов"
            className="v19-documents-upload-action flex h-9 shrink-0 items-center gap-2 rounded-[8px] border border-white/5 bg-[#301e39] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#3a2645] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] disabled:cursor-wait sm:px-4 sm:text-[13px]"
            type="button"
            onClick={() => bulkInputRef.current?.click()}
            disabled={bulkBusy}
          >
            {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin text-white/70" /> : <UploadCloud className="w-4 h-4 text-white/70" />}
            <span className="hidden sm:inline">Массовая загрузка</span>
            <span className="sm:hidden">Загрузить</span>
          </button>
        </div>

        {uploadError ? (
          <div className="border-b border-[#5b2b32]/60 bg-[#24191b]/50 px-4 py-2 text-[12px] text-[#d59aa3]" role="alert">
            {uploadError}
          </div>
        ) : null}

        <div className="v19-documents-mobile-list p-3 xl:hidden">
          {draftGroups.map((group) => (
            <div className={`v19-document-type-group is-${group.key}`} key={group.key}>
              <div
                className="v19-document-type-divider flex items-center gap-3"
                data-testid="document-type-divider"
              >
                {group.key === 'family' ? <Users aria-hidden="true" className="h-4 w-4" /> : <User aria-hidden="true" className="h-4 w-4" />}
                <span>{group.label}</span>
                <span aria-hidden="true" className="v19-document-type-divider-line" />
              </div>
              <div className="v19-document-package-list">
                {group.submissions.map((sub, submissionIndex) => (
                  <div className="v19-document-package-block" key={sub.id}>
                    {group.key === 'family' && submissionIndex > 0 ? (
                      <div aria-hidden="true" className="v19-document-family-divider" />
                    ) : null}
                    <section
                      className="v19-document-mobile-card overflow-hidden rounded-2xl border border-[#242529] bg-[#141416]"
                      data-document-submission-id={sub.id}
                    >
                      <div
                        aria-label="Заявители пакета"
                        data-testid="document-applicant-list"
                        role="list"
                      >
                        {sub.applicants.map((app) => (
                          <div
                            className={`v19-document-mobile-applicant ${app.isPrimary ? 'is-primary' : 'is-family-member'}`}
                            data-testid="document-applicant-row"
                            key={app.id}
                            role="listitem"
                          >
                            <div className="v19-document-mobile-applicant-identity flex min-w-0 items-center gap-3">
                              <div className="v19-document-applicant-avatar flex shrink-0 items-center justify-center rounded-full">
                                {sub.type === 'family' ? (
                                  <Users aria-hidden="true" className="h-3.5 w-3.5" />
                                ) : (
                                  <User aria-hidden="true" className="h-3.5 w-3.5" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div
                                  className="v19-document-applicant-name"
                                  data-testid="document-applicant-name"
                                >
                                  {app.name}
                                </div>
                              </div>
                              {app.isPrimary ? (
                                <button
                                  aria-label={`Открыть пакет ${sub.title}`}
                                  className="v19-document-mobile-menu ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
                                  onClick={() => onOpenDrawer(sub.id)}
                                  title="Открыть пакет"
                                  type="button"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                              ) : null}
                            </div>

                            <div className="v19-document-mobile-slots grid grid-cols-2 gap-2">
                              {requiredDocTypesForApplicant(app).map((doc) => (
                                <MobileDocSlot
                                  key={`${app.id}-${doc.key}`}
                                  label={doc.label}
                                  status={app.docs[doc.key]}
                                  onReview={() =>
                                    onOpenIssue({
                                      applicantId: app.id,
                                      docType: doc.key,
                                      submissionId: sub.id,
                                    })
                                  }
                                  onUpload={() =>
                                    triggerCellUpload({
                                      applicantId: app.id,
                                      docType: doc.key,
                                      submissionId: sub.id,
                                    })
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="v19-documents-table-scroll hidden w-full overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent xl:block">
          <div className="v19-documents-table min-w-[700px]">
            <div className="v19-documents-table-header flex items-center border-b border-[#242529] bg-[#111113]/50">
              <div className="sticky left-0 z-20 w-[280px] shrink-0 border-r border-[#242529] bg-[#111113] px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-white/40 lg:w-[320px]">
                Пакет / Заявитель
              </div>
              <div className="grid flex-1 grid-cols-3 px-2">
                {docTypes.map((doc) => (
                  <div key={doc.key} className="py-3 text-center text-[11px] font-medium uppercase tracking-wider text-white/40">
                    {doc.label}
                  </div>
                ))}
              </div>
              <div className="w-[60px] shrink-0" />
            </div>

            <div>
              {draftGroups.map((group) => (
                <div className={`v19-document-type-group is-${group.key}`} key={group.key}>
                  <div
                    className="v19-document-type-divider v19-document-type-divider-desktop flex items-center gap-3"
                    data-testid="document-type-divider"
                  >
                    {group.key === 'family' ? <Users aria-hidden="true" className="h-4 w-4" /> : <User aria-hidden="true" className="h-4 w-4" />}
                    <span>{group.label}</span>
                    <span aria-hidden="true" className="v19-document-type-divider-line" />
                  </div>
                  <div>
                    {group.submissions.map((sub, submissionIndex) => (
                      <div className="v19-document-package-block" key={sub.id}>
                        {group.key === 'family' && submissionIndex > 0 ? (
                          <div aria-hidden="true" className="v19-document-family-divider" />
                        ) : null}
                <div
                  className="v19-document-desktop-package group/sub"
                  data-document-submission-id={sub.id}
                >
                  <div className="divide-y divide-white/5">
                    {sub.applicants.map((app) => (
                      <div key={app.id} className="v19-document-desktop-applicant-row flex items-center bg-[#161617] transition-colors hover:bg-[#1a1a1d]">
                        <div className="v19-document-desktop-identity sticky left-0 z-20 flex w-[280px] shrink-0 items-center gap-3 px-5 py-3 lg:w-[320px]">
                          <div className="v19-document-applicant-avatar flex shrink-0 items-center justify-center rounded-full text-[10px] font-medium">
                            {app.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <div
                              className="v19-document-applicant-name"
                              data-testid="document-applicant-name"
                            >
                              {app.name}
                            </div>
                          </div>
                        </div>

                        <div className="grid flex-1 grid-cols-3 px-2 py-2">
                          {docTypes.map((doc) =>
                            app.isPrimary || doc.key === 'passport' ? (
                              <DocCell
                                key={`${app.id}-${doc.key}`}
                                label={doc.label}
                                status={app.docs[doc.key]}
                                onReview={() =>
                                  onOpenIssue({
                                    applicantId: app.id,
                                    docType: doc.key,
                                    submissionId: sub.id,
                                  })
                                }
                                onUpload={() =>
                                  triggerCellUpload({
                                    applicantId: app.id,
                                    docType: doc.key,
                                    submissionId: sub.id,
                                  })
                                }
                              />
                            ) : (
                              <div
                                aria-label={`${doc.label}: не требуется`}
                                className="v19-document-desktop-not-required mx-auto"
                                data-testid="document-not-required"
                                key={`${app.id}-${doc.key}`}
                                title={`${doc.label}: не требуется`}
                              >
                                Не нужно
                              </div>
                            ),
                          )}
                        </div>
                        <div className="flex w-[60px] shrink-0 items-center justify-center">
                          {app.isPrimary ? (
                            <button
                              aria-label={`Открыть пакет ${sub.title}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
                              onClick={() => onOpenDrawer(sub.id)}
                              title={`Открыть пакет ${sub.title}`}
                              type="button"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {unmatchedUploads.length ? (
        <section
          className="rounded-2xl border border-[#4e2c33] bg-[#161617] p-4"
          data-testid="document-unmatched-uploads"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-semibold text-white">Не распределено</h3>
              <p className="mt-1 text-[12px] text-white/45">
                Выберите заявителя и тип документа вручную.
              </p>
            </div>
            <span className="rounded-full border border-[#5b2b32]/50 bg-[#24191b]/60 px-2.5 py-1 text-[11px] font-medium text-[#d59aa3]">
              {unmatchedUploads.length}
            </span>
          </div>

          <div className="space-y-2">
            {unmatchedUploads.map((upload) => (
              <div
                key={upload.id}
                className="grid gap-2 rounded-xl border border-[#242529] bg-[#1a1a1d] p-3 lg:grid-cols-[minmax(0,1fr)_220px_180px_120px]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-white">{upload.file.name}</div>
                  <div className="mt-1 text-[11px] text-white/42">
                    {formatBytes(upload.file.size)} · {upload.reason}
                    {upload.passportNumber ? ` · паспорт ${upload.passportNumber}` : ''}
                  </div>
                </div>
                <select
                  aria-label="Заявитель для нераспределённого файла"
                  className="h-10 rounded-[8px] border border-[#242529] bg-[#101011] px-3 text-[12px] text-white outline-none focus:border-[#6f64ff]"
                  value={upload.submissionId && upload.applicantId ? `${upload.submissionId}:${upload.applicantId}` : ''}
                  onChange={(event) => {
                    const [submissionId, applicantId] = event.currentTarget.value.split(':');
                    updateUnmatchedUpload(upload.id, { applicantId, submissionId });
                  }}
                >
                  <option value="">Выберите заявителя</option>
                  {allDrafts.flatMap((submission) =>
                    submission.applicants.map((applicant) => (
                      <option key={`${submission.id}:${applicant.id}`} value={`${submission.id}:${applicant.id}`}>
                        {submission.title} · {applicant.name}
                      </option>
                    )),
                  )}
                </select>
                <select
                  aria-label="Тип для нераспределённого файла"
                  className="h-10 rounded-[8px] border border-[#242529] bg-[#101011] px-3 text-[12px] text-white outline-none focus:border-[#6f64ff]"
                  value={upload.detectedDocType}
                  onChange={(event) =>
                    updateUnmatchedUpload(upload.id, {
                      detectedDocType: event.currentTarget.value as CollectionDocType,
                    })
                  }
                >
                  <option value="unknown">Тип документа</option>
                  {docTypes.map((doc) => (
                    <option key={doc.key} value={doc.key}>
                      {doc.label}
                    </option>
                  ))}
                </select>
                <button
                  data-testid="document-assign-unmatched"
                  className="h-10 rounded-[8px] bg-[#1e1e21] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#27272b] disabled:cursor-not-allowed disabled:text-white/35"
                  disabled={!upload.submissionId || !upload.applicantId || upload.detectedDocType === 'unknown'}
                  type="button"
                  onClick={() => void assignUnmatchedUpload(upload)}
                >
                  Назначить
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </motion.div>
  );
}
