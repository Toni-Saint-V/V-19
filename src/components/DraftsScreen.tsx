import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  FileWarning,
  Loader2,
  MapPin,
  MoreVertical,
  Plus,
  ScanLine,
  UploadCloud,
  User,
  Users,
} from 'lucide-react';
import type {
  CollectionDocumentUpload,
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
import { V19SummaryTile, V19SummaryTileGrid } from '../shared/ui/v19-design-system';
import { passportNumberFromApplicant } from '../modules/submissions/filenamePolicy';
import {
  canonicalCollectionDocTypes,
  collectionDocumentDocTypes,
  collectionDocTypes,
  detectCollectionDocType,
  findCollectionDocumentUpload,
  normalizeCollectionPassportNumber,
  passportNumberFromCollectionText,
  resolveCollectionUploadTarget,
  upsertCollectionDocumentUpload,
  type CollectionDocType,
} from '../modules/submissions/documentCollectionIntake';
import { fileToDocumentStatus } from './v19BusinessScreenAdapter';

interface DraftsScreenProps {
  onOpenDrawer: (id: string) => void;
  onSubmissionsChange?: (submissions: Submission[]) => void | Promise<void>;
  submissions?: Submission[];
}

type DocStatus = 'verified' | 'processing' | 'error' | 'missing';
type DraftSummaryFilter = 'missing' | 'processing' | 'error';

type MatrixApplicant = {
  docs: Record<CollectionDocType, DocStatus>;
  id: string;
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

type UnmatchedUpload = {
  applicantId?: string;
  detectedDocType: CollectionDocType | 'unknown';
  file: File;
  id: string;
  passportNumber?: string;
  reason: string;
  submissionId?: string;
};

const docTypes = collectionDocTypes;
const passportCollectionExtractionTimeoutMs = 10_000;

function roleLabel(role: MatrixApplicant['role']) {
  return role;
}

function applicantRoleLabel(applicant: Submission['applicants'][number]) {
  if (applicant.role === 'main') return 'Основной';
  if (applicant.role === 'spouse') return 'Супруг(а)';
  if (applicant.role === 'child') return 'Ребёнок';
  return 'Заявитель';
}

function mobileApplicantRoleLabel(applicant: MatrixApplicant) {
  if (applicant.role === 'Основной') return '';
  if (applicant.role === 'Ребёнок') return 'Ребенок';
  if (applicant.role === 'Супруг(а)') {
    const lastNamePart = applicant.name.trim().split(/\s+/).at(-1)?.toLowerCase() ?? '';
    return /[ая]$/.test(lastNamePart) ? 'Супруга' : 'Супруг';
  }
  return applicant.role;
}

function docStatusClass(status: DocStatus) {
  if (status === 'verified') return 'bg-white/[0.045] border-white/10 text-[#b8baff]';
  if (status === 'processing') return 'bg-white/[0.045] border-white/10 text-[#b8baff]';
  if (status === 'error') return 'bg-[#24191b]/60 border-[#5b2b32]/50 text-[#d59aa3]';
  return 'bg-white/5 border-dashed border-white/20 text-white/30 hover:border-white/50 hover:bg-white/10 hover:text-white';
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

function collectionStatus(
  submission: Submission,
  applicant: Submission['applicants'][number],
  docType: CollectionDocType,
): DocStatus {
  const upload = findCollectionDocumentUpload(submission, applicant.id, docType);
  if (upload) return upload.status === 'needs_review' ? 'processing' : 'verified';

  return 'missing';
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
    questionnaire: collectionStatus(submission, applicant, 'questionnaire'),
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
      name: applicant.fullName,
      passportNumber: normalizeCollectionPassportNumber(passportNumberFromApplicant(applicant)),
      role: applicantRoleLabel(applicant),
    }));
    const statuses = applicants.flatMap((applicant) => docTypes.map((doc) => applicant.docs[doc.key]));
    const ready = statuses.filter((status) => status === 'verified').length;

    return {
      applicants,
      city: submission.city,
      country: `${submission.country} (V-19)`,
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

function applyCollectionDocumentUpload(
  submissions: Submission[],
  target: PendingCellTarget,
  file: File,
  passportNumber?: string,
) {
  if (!collectionDocumentDocTypes.has(target.docType)) {
    return { applied: false, nextSubmissions: submissions };
  }

  let applied = false;
  const nextSubmissions = submissions.map((submission) => {
    if (submission.id !== target.submissionId) return submission;
    applied = true;
    return upsertCollectionDocumentUpload(
      submission,
      assignmentRecord(target, file, passportNumber),
    );
  });

  return { applied, nextSubmissions };
}

function assignmentRecord(
  target: PendingCellTarget,
  file: File,
  passportNumber?: string,
): CollectionDocumentUpload {
  return {
    applicantId: target.applicantId,
    docType: 'questionnaire',
    fileName: file.name,
    id: `collection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mimeType: mimeTypeForFile(file, target.docType),
    passportNumber,
    sizeBytes: file.size,
    status: 'uploaded',
    submissionId: target.submissionId,
    uploadedAtIso: new Date().toISOString(),
  };
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
  onUpload,
  status,
}: {
  onUpload: () => void;
  status: DocStatus;
}) => {
  const className = `w-8 h-8 rounded-lg flex items-center justify-center border mx-auto transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${docStatusClass(status)}`;
  if (status === 'missing') {
    return (
      <button className={className} title={docStatusLabel(status)} type="button" onClick={onUpload}>
        <Plus className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button className={className} title={docStatusLabel(status)} type="button" onClick={onUpload}>
      {status === 'verified' ? <CheckCircle2 className="w-[18px] h-[18px]" /> : null}
      {status === 'processing' ? <ScanLine className="w-[16px] h-[16px] animate-pulse" /> : null}
      {status === 'error' ? <AlertCircle className="w-[18px] h-[18px]" /> : null}
    </button>
  );
};

const MobileDocSlot = ({
  label,
  onUpload,
  status,
}: {
  label: string;
  onUpload: () => void;
  status: DocStatus;
}) => {
  const isMissing = status === 'missing';

  return (
    <button
      className={`flex min-h-[64px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${docStatusClass(status)}`}
      type="button"
      onClick={onUpload}
      title={docStatusLabel(status)}
    >
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-semibold text-white/80">{label}</span>
        <span className="mt-1 block truncate text-[10px] font-medium text-current opacity-75">
          {isMissing ? 'Добавить' : docStatusLabel(status)}
        </span>
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#101011]/70">
        {status === 'verified' ? <CheckCircle2 className="h-4 w-4" /> : null}
        {status === 'processing' ? <ScanLine className="h-4 w-4 animate-pulse" /> : null}
        {status === 'error' ? <AlertCircle className="h-4 w-4" /> : null}
        {isMissing ? <Plus className="h-4 w-4" /> : null}
      </span>
    </button>
  );
};

export function DraftsScreen({
  onOpenDrawer,
  onSubmissionsChange,
  submissions = [],
}: DraftsScreenProps) {
  const [unmatchedUploads, setUnmatchedUploads] = useState<UnmatchedUpload[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [pendingCellTarget, setPendingCellTarget] = useState<PendingCellTarget | null>(null);
  const [mobileApplicantIndex, setMobileApplicantIndex] = useState<Record<string, number>>({});
  const [draftSummaryFilter, setDraftSummaryFilter] = useState<DraftSummaryFilter>('missing');
  const cellInputRef = useRef<HTMLInputElement | null>(null);
  const bulkInputRef = useRef<HTMLInputElement | null>(null);
  const allDrafts = useMemo(() => buildMatrixSubmissions(submissions), [submissions]);
  const visibleDrafts = useMemo(
    () =>
      allDrafts.filter((submission) =>
        submission.applicants.some((applicant) =>
          docTypes.some((doc) => applicant.docs[doc.key] === draftSummaryFilter),
        ),
      ),
    [allDrafts, draftSummaryFilter],
  );
  const summary = useMemo(() => {
    const statuses = allDrafts.flatMap((submission) =>
      submission.applicants.flatMap((applicant) => docTypes.map((doc) => applicant.docs[doc.key])),
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
    passportNumber?: string,
  ) => {
    if (canonicalCollectionDocTypes.has(target.docType)) {
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

    const result = applyCollectionDocumentUpload(submissions, target, file, passportNumber);
    if (!result.applied) return false;
    return commitSubmissions(result.nextSubmissions);
  };

  const triggerCellUpload = (target: PendingCellTarget) => {
    setPendingCellTarget(target);
    cellInputRef.current?.click();
  };

  const handleCellFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || !pendingCellTarget) return;
    void assignFileToTarget(
      pendingCellTarget,
      file,
      passportNumberFromCollectionText(file.name),
    ).finally(() => setPendingCellTarget(null));
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
        const result = canonicalCollectionDocTypes.has(target.docType)
          ? applyCanonicalUpload(workingSubmissions, target, file)
          : applyCollectionDocumentUpload(workingSubmissions, target, file, passportNumber);

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
      upload.passportNumber,
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

  const updateMobileApplicantIndex = (submissionId: string, index: number) => {
    setMobileApplicantIndex((current) =>
      current[submissionId] === index ? current : { ...current, [submissionId]: index },
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
      className="space-y-6 lg:space-y-8"
    >
      <input
        ref={cellInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf"
        className="hidden"
        onChange={handleCellFileInput}
      />
      <input
        ref={bulkInputRef}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf"
        className="hidden"
        onChange={handleBulkFileInput}
      />

      <V19SummaryTileGrid className="v19-documents-summary-grid grid-cols-3">
        <V19SummaryTile
          active={draftSummaryFilter === 'missing'}
          detail={`ожидают · ${summary.submissions}`}
          icon={UploadCloud}
          label="Ждут загрузки"
          tone="neutral"
          value={summary.missing}
          onClick={() => setDraftSummaryFilter('missing')}
        />
        <V19SummaryTile
          active={draftSummaryFilter === 'processing'}
          detail="OCR"
          icon={ScanLine}
          label="В обработке"
          tone="indigo"
          value={summary.processing}
          onClick={() => setDraftSummaryFilter('processing')}
        />
        <V19SummaryTile
          active={draftSummaryFilter === 'error'}
          detail="ревью"
          icon={FileWarning}
          label="Ошибки"
          tone="danger"
          value={summary.error}
          onClick={() => setDraftSummaryFilter('error')}
        />
      </V19SummaryTileGrid>

      <div className="flex flex-col overflow-hidden rounded-2xl border border-[#242529] bg-[#161617] shadow-[0_4px_24px_rgba(0,0,0,0.15)]">
        <div className="flex items-center justify-between border-b border-[#242529] bg-[#1a1a1d] px-4 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-white">Матрица сбора документов</h2>
            <p className="mt-1 text-[11px] text-white/50 sm:text-[12px]">
              Загрузка по заявителю, массовое распределение по номеру паспорта.
            </p>
          </div>
          <button
            className="flex h-9 shrink-0 items-center gap-2 rounded-[8px] border border-white/5 bg-[#301e39] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#3a2645] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] disabled:cursor-wait sm:px-4 sm:text-[13px]"
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

        <div className="space-y-4 p-3 sm:hidden">
          {visibleDrafts.map((sub) => (
            <section key={sub.id} className="overflow-hidden rounded-2xl border border-[#242529] bg-[#141416]">
              <div className="flex items-start justify-between gap-3 border-b border-[#242529] bg-[#1a1a1d] p-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  {sub.type === 'family' ? <Users className="mt-0.5 h-4 w-4 shrink-0 text-white/45" /> : <User className="mt-0.5 h-4 w-4 shrink-0 text-white/45" />}
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="min-w-0 truncate text-[14px] font-semibold text-white">{sub.title}</h3>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#8fa3ff]/20 bg-[#8fa3ff]/10 px-2 py-0.5 text-[10px] font-medium text-[#b8baff]">
                        <MapPin className="h-3 w-3" />
                        {sub.city}
                      </span>
                    </div>
                    <div className="mt-1 inline-flex min-w-0 items-center gap-1 text-[11px] text-white/48">
                      <CalendarDays className="h-3 w-3 shrink-0 text-white/35" />
                      <span className="truncate">{sub.tripDates}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onOpenDrawer(sub.id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
                  type="button"
                  title="Открыть пакет"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>

              <div className="px-3 pt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-[#6f64ff]/55" style={{ width: `${sub.progress}%` }} />
                </div>
              </div>

              <div
                className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth scrollbar-hide"
                onScroll={(event) => {
                  const width = event.currentTarget.clientWidth;
                  if (!width) return;
                  updateMobileApplicantIndex(sub.id, Math.round(event.currentTarget.scrollLeft / width));
                }}
              >
                {sub.applicants.map((app) => (
                  <div key={app.id} className="w-full shrink-0 snap-start space-y-3 p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#202024] text-white/55">
                        <Users className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-medium text-white/85">{app.name}</div>
                        {mobileApplicantRoleLabel(app) ? (
                          <div className="mt-0.5 truncate text-[10px] font-medium text-white/40">
                            {mobileApplicantRoleLabel(app)}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {docTypes.map((doc) => (
                        <MobileDocSlot
                          key={`${app.id}-${doc.key}`}
                          label={doc.label}
                          status={app.docs[doc.key]}
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

              {sub.applicants.length > 1 ? (
                <div className="flex items-center justify-between border-t border-[#242529] px-3 py-2 text-[11px] font-medium text-white/45">
                  <span>Заявитель</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-white/62">
                    {(mobileApplicantIndex[sub.id] ?? 0) + 1} / {sub.applicants.length}
                  </span>
                </div>
              ) : null}
            </section>
          ))}
        </div>

        <div className="hidden w-full overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent sm:block">
          <div className="min-w-[700px]">
            <div className="flex items-center border-b border-[#242529] bg-[#111113]/50">
              <div className="sticky left-0 z-20 w-[280px] shrink-0 border-r border-[#242529] bg-[#111113] px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-white/40 lg:w-[320px]">
                Пакет / Заявитель
              </div>
              <div className="grid flex-1 grid-cols-4 px-2">
                {docTypes.map((doc) => (
                  <div key={doc.key} className="py-3 text-center text-[11px] font-medium uppercase tracking-wider text-white/40">
                    {doc.label}
                  </div>
                ))}
              </div>
              <div className="w-[60px] shrink-0" />
            </div>

            <div className="divide-y divide-[#202124]">
              {visibleDrafts.map((sub) => (
                <div key={sub.id} className="group/sub">
                  <div className="flex items-center border-b border-[#202124] bg-[#1a1a1d] transition-colors hover:bg-[#1e1e21]">
                    <div className="sticky left-0 z-20 w-[280px] shrink-0 border-r border-[#242529] bg-[#1a1a1d] px-5 py-3.5 transition-colors group-hover/sub:bg-[#1e1e21] lg:w-[320px]">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            {sub.type === 'family' ? <Users className="w-3.5 h-3.5 text-white/50" /> : <User className="w-3.5 h-3.5 text-white/50" />}
                            <span className="text-[13px] font-medium text-white">{sub.title}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-white/40">
                            <span>{sub.country}</span>
                            <span className="h-1 w-1 rounded-full bg-white/20" />
                            <span className="text-white/55">{sub.deadline}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-1 justify-center px-6 py-3">
                      <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-white/5">
                        <div className="absolute inset-y-0 left-0 bg-[#6f64ff]/40" style={{ width: `${sub.progress}%` }} />
                      </div>
                    </div>
                    <div className="flex w-[60px] shrink-0 items-center justify-center">
                      <button
                        onClick={() => onOpenDrawer(sub.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
                        type="button"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-white/5">
                    {sub.applicants.map((app) => (
                      <div key={app.id} className="flex items-center bg-[#161617] transition-colors hover:bg-[#1a1a1d]">
                        <div className="sticky left-0 z-20 flex w-[280px] shrink-0 items-center gap-3 border-r border-[#242529] bg-[#161617] px-5 py-3 transition-colors hover:bg-[#1a1a1d] lg:w-[320px]">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/5 bg-[#202024] text-[10px] font-medium text-white/50">
                            {app.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium text-white/80">{app.name}</div>
                            <div className="mt-0.5 text-[11px] text-white/40">
                              {roleLabel(app.role)}
                              {app.passportNumber ? ` · ${app.passportNumber}` : ''}
                            </div>
                          </div>
                        </div>

                        <div className="grid flex-1 grid-cols-4 px-2 py-2">
                          {docTypes.map((doc) => (
                            <DocCell
                              key={`${app.id}-${doc.key}`}
                              status={app.docs[doc.key]}
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
                        <div className="w-[60px] shrink-0" />
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
        <section className="rounded-2xl border border-[#4e2c33] bg-[#161617] p-4">
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
                  className="h-10 rounded-[8px] border border-[#242529] bg-[#101011] px-3 text-[12px] text-white outline-none focus:border-[#6f64ff]"
                  value={upload.submissionId && upload.applicantId ? `${upload.submissionId}:${upload.applicantId}` : ''}
                  onChange={(event) => {
                    const [submissionId, applicantId] = event.currentTarget.value.split(':');
                    updateUnmatchedUpload(upload.id, { applicantId, submissionId });
                  }}
                >
                  <option value="">Выберите заявителя</option>
                  {visibleDrafts.flatMap((submission) =>
                    submission.applicants.map((applicant) => (
                      <option key={`${submission.id}:${applicant.id}`} value={`${submission.id}:${applicant.id}`}>
                        {submission.title} · {applicant.name}
                      </option>
                    )),
                  )}
                </select>
                <select
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
