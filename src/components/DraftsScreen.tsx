import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileWarning,
  Loader2,
  Plus,
  ScanLine,
  UploadCloud,
  User,
  Users,
} from 'lucide-react';
import type { Submission, SubmissionFile, SubmissionFileType } from '../modules/submissions/types';
import {
  uploadRequiredFile,
  type UploadedFileMetadata,
} from '../modules/submissions/submissionActions';
import { passportNumberFromApplicant } from '../modules/submissions/filenamePolicy';
import { fileToDocumentStatus } from './v19BusinessScreenAdapter';

interface DraftsScreenProps {
  onOpenDrawer: (id: string) => void;
  onSubmissionsChange?: (submissions: Submission[]) => void | Promise<void>;
  submissions?: Submission[];
}

type DocStatus = 'verified' | 'processing' | 'error' | 'missing';
type CollectionDocType =
  | 'passport'
  | 'selfie'
  | 'selfie2'
  | 'questionnaire';

type CollectionUploadRecord = {
  applicantId: string;
  docType: CollectionDocType;
  fileName: string;
  id: string;
  passportNumber?: string;
  sizeBytes: number;
  status: 'uploaded' | 'needs_review';
  submissionId: string;
  uploadedAtIso: string;
};

type MatrixApplicant = {
  docs: Record<CollectionDocType, DocStatus>;
  id: string;
  name: string;
  passportNumber: string;
  role: string;
};

type MatrixSubmission = {
  applicants: MatrixApplicant[];
  country: string;
  deadline: string;
  id: string;
  progress: number;
  title: string;
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

const collectionStorageKey = 'visaflow.v19.collectionDocumentUploads.v2';

const docTypes: Array<{ key: CollectionDocType; label: string }> = [
  { key: 'passport', label: 'Загран' },
  { key: 'selfie', label: 'Селфи 1' },
  { key: 'selfie2', label: 'Селфи 2' },
  { key: 'questionnaire', label: 'Анкета' },
];

const canonicalDocTypes = new Set<CollectionDocType>(['passport', 'selfie', 'selfie2']);
const collectionDocTypeSet = new Set<CollectionDocType>(docTypes.map((doc) => doc.key));

function loadCollectionUploads(): CollectionUploadRecord[] {
  try {
    const raw = globalThis.localStorage?.getItem(collectionStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isCollectionUploadRecord) : [];
  } catch {
    return [];
  }
}

function saveCollectionUploads(records: CollectionUploadRecord[]) {
  try {
    globalThis.localStorage?.setItem(collectionStorageKey, JSON.stringify(records));
  } catch {
    // Local persistence is best-effort in dev/browser mode.
  }
}

function isCollectionUploadRecord(value: unknown): value is CollectionUploadRecord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CollectionUploadRecord>;
  return Boolean(
    candidate.id &&
      candidate.submissionId &&
      candidate.applicantId &&
      typeof candidate.docType === 'string' &&
      collectionDocTypeSet.has(candidate.docType as CollectionDocType) &&
      candidate.fileName,
  );
}

function normalizePassportNumber(value: string | undefined) {
  const digits = value?.replace(/\D+/g, '') ?? '';
  if (digits.length < 7 || digits.length > 10) return '';
  return digits;
}

function passportNumberFromText(value: string) {
  const match = value.replace(/\D+/g, ' ').match(/\b\d{7,10}\b/);
  return normalizePassportNumber(match?.[0]);
}

function detectDocType(fileName: string): CollectionDocType | 'unknown' {
  const lower = fileName.toLowerCase();
  if (/passport|паспорт|загран|mrz/.test(lower)) return 'passport';
  if (/selfie[\s_-]*2|селфи[\s_-]*2|photo[\s_-]*2|фото[\s_-]*2/.test(lower)) return 'selfie2';
  if (/selfie|селфи|photo|фото/.test(lower)) return 'selfie';
  if (/questionnaire|application|form|анкета|заявлен/.test(lower)) return 'questionnaire';
  return 'unknown';
}

function roleLabel(role: MatrixApplicant['role']) {
  return role;
}

function applicantRoleLabel(applicant: Submission['applicants'][number]) {
  if (applicant.role === 'main') return 'Основной';
  if (applicant.role === 'spouse') return 'Супруг(а)';
  if (applicant.role === 'child') return 'Ребёнок';
  return 'Заявитель';
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
  if (status === 'error') return 'Требует проверки';
  return 'Загрузить документ';
}

function fileStatusToDocStatus(file?: SubmissionFile): DocStatus {
  return fileToDocumentStatus(file);
}

function collectionStatus(
  submission: Submission,
  applicant: Submission['applicants'][number],
  docType: CollectionDocType,
  uploads: CollectionUploadRecord[],
): DocStatus {
  const upload = uploads.find(
    (record) =>
      record.submissionId === submission.id &&
      record.applicantId === applicant.id &&
      record.docType === docType,
  );

  if (upload) return upload.status === 'needs_review' ? 'processing' : 'verified';

  if (docType === 'questionnaire') {
    if (applicant.questionnaireStatus === 'complete') return 'verified';
    if (applicant.questionnaireStatus === 'needs_fix') return 'error';
    if (applicant.questionnaireStatus === 'partial') return 'processing';
  }

  return 'missing';
}

function applicantDocs(
  submission: Submission,
  applicant: Submission['applicants'][number],
  uploads: CollectionUploadRecord[],
): Record<CollectionDocType, DocStatus> {
  const applicantFiles = submission.files.filter((file) => file.applicantId === applicant.id);
  return {
    passport: fileStatusToDocStatus(applicantFiles.find((file) => file.type === 'passport_scan')),
    selfie: fileStatusToDocStatus(applicantFiles.find((file) => file.type === 'selfie')),
    selfie2: fileStatusToDocStatus(applicantFiles.find((file) => file.type === 'selfie_2')),
    questionnaire: collectionStatus(submission, applicant, 'questionnaire', uploads),
  };
}

function submissionDeadline(submission: Submission) {
  if (submission.status === 'returned') return 'Требует исправлений';
  if (submission.status === 'submitted_for_review') return 'На проверке';
  if (submission.status === 'ready_for_export') return 'Готово к выгрузке';
  return 'В работе';
}

function buildMatrixSubmissions(
  submissions: Submission[],
  uploads: CollectionUploadRecord[],
): MatrixSubmission[] {
  return submissions.map((submission) => {
    const applicants = submission.applicants.map((applicant) => ({
      docs: applicantDocs(submission, applicant, uploads),
      id: applicant.id,
      name: applicant.fullName,
      passportNumber: normalizePassportNumber(passportNumberFromApplicant(applicant)),
      role: applicantRoleLabel(applicant),
    }));
    const statuses = applicants.flatMap((applicant) => docTypes.map((doc) => applicant.docs[doc.key]));
    const ready = statuses.filter((status) => status === 'verified').length;

    return {
      applicants,
      country: `${submission.country} (V-19)`,
      deadline: submissionDeadline(submission),
      id: submission.id,
      progress: statuses.length ? Math.round((ready / statuses.length) * 100) : 0,
      title: submission.listTitle ?? submission.title,
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
  return submission.files.find(
    (file) =>
      file.applicantId === applicantId &&
      targetTypes.includes(file.type) &&
      (file.status === 'missing' || file.status === 'needs_replacement'),
  );
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

function assignmentRecord(
  target: PendingCellTarget,
  file: File,
  passportNumber?: string,
): CollectionUploadRecord {
  return {
    applicantId: target.applicantId,
    docType: target.docType,
    fileName: file.name,
    id: `collection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    return normalizePassportNumber(passportField?.value);
  } catch {
    return '';
  }
}

function applicantIndex(submissions: Submission[]) {
  return submissions.flatMap((submission) =>
    submission.applicants.map((applicant) => ({
      applicantId: applicant.id,
      applicantName: applicant.fullName,
      passportNumber: normalizePassportNumber(passportNumberFromApplicant(applicant)),
      submissionId: submission.id,
    })),
  );
}

async function detectedPassportNumber(file: File, detectedDocType: CollectionDocType | 'unknown') {
  const fromName = passportNumberFromText(file.name);
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

export function DraftsScreen({
  onOpenDrawer,
  onSubmissionsChange,
  submissions = [],
}: DraftsScreenProps) {
  const [collectionUploads, setCollectionUploads] = useState<CollectionUploadRecord[]>(() =>
    loadCollectionUploads(),
  );
  const [unmatchedUploads, setUnmatchedUploads] = useState<UnmatchedUpload[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pendingCellTarget, setPendingCellTarget] = useState<PendingCellTarget | null>(null);
  const cellInputRef = useRef<HTMLInputElement | null>(null);
  const bulkInputRef = useRef<HTMLInputElement | null>(null);
  const visibleDrafts = useMemo(
    () => buildMatrixSubmissions(submissions, collectionUploads),
    [collectionUploads, submissions],
  );
  const summary = useMemo(() => {
    const statuses = visibleDrafts.flatMap((submission) =>
      submission.applicants.flatMap((applicant) => docTypes.map((doc) => applicant.docs[doc.key])),
    );
    return {
      error: statuses.filter((status) => status === 'error').length,
      missing: statuses.filter((status) => status === 'missing').length,
      processing: statuses.filter((status) => status === 'processing').length,
      submissions: visibleDrafts.length,
    };
  }, [visibleDrafts]);

  useEffect(() => {
    saveCollectionUploads(collectionUploads);
  }, [collectionUploads]);

  const commitSubmissions = (nextSubmissions: Submission[]) => {
    void onSubmissionsChange?.(nextSubmissions);
  };

  const upsertCollectionUpload = (
    target: PendingCellTarget,
    file: File,
    passportNumber?: string,
  ) => {
    setCollectionUploads((current) => [
      assignmentRecord(target, file, passportNumber),
      ...current.filter(
        (record) =>
          !(
            record.submissionId === target.submissionId &&
            record.applicantId === target.applicantId &&
            record.docType === target.docType
          ),
      ),
    ]);
  };

  const assignFileToTarget = (
    target: PendingCellTarget,
    file: File,
    passportNumber?: string,
  ) => {
    if (canonicalDocTypes.has(target.docType)) {
      const result = applyCanonicalUpload(submissions, target, file);
      if (result.applied) {
        commitSubmissions(result.nextSubmissions);
        return true;
      }
      return false;
    }

    upsertCollectionUpload(target, file, passportNumber);
    return true;
  };

  const triggerCellUpload = (target: PendingCellTarget) => {
    setPendingCellTarget(target);
    cellInputRef.current?.click();
  };

  const handleCellFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || !pendingCellTarget) return;
    assignFileToTarget(pendingCellTarget, file, passportNumberFromText(file.name));
    setPendingCellTarget(null);
  };

  const handleBulkFiles = async (files: FileList | File[]) => {
    const uploadFiles = Array.from(files);
    if (!uploadFiles.length) return;
    setBulkBusy(true);
    const index = applicantIndex(submissions);
    const unmatched: UnmatchedUpload[] = [];
    let workingSubmissions = submissions;
    let submissionsChanged = false;

    for (const file of uploadFiles) {
      const detectedDocType = detectDocType(file.name);
      const passportNumber = await detectedPassportNumber(file, detectedDocType);

      if (detectedDocType === 'unknown') {
        unmatched.push({
          ...firstApplicantTarget(submissions),
          detectedDocType,
          file,
          id: `unmatched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          passportNumber,
          reason: 'Тип документа не определён по имени файла.',
        });
        continue;
      }

      const matches = passportNumber
        ? index.filter((item) => item.passportNumber === passportNumber)
        : [];

      if (matches.length !== 1) {
        unmatched.push({
          ...firstApplicantTarget(submissions),
          detectedDocType,
          file,
          id: `unmatched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          passportNumber,
          reason: passportNumber
            ? 'Номер паспорта не дал одного точного совпадения.'
            : 'Номер паспорта не найден в имени файла или OCR.',
        });
        continue;
      }

      const match = matches[0];
      const target = {
        applicantId: match.applicantId,
        docType: detectedDocType,
        submissionId: match.submissionId,
      };
      let applied = false;

      if (canonicalDocTypes.has(detectedDocType)) {
        const result = applyCanonicalUpload(workingSubmissions, target, file);
        applied = result.applied;
        if (result.applied) {
          workingSubmissions = result.nextSubmissions;
          submissionsChanged = true;
        }
      } else {
        applied = assignFileToTarget(target, file, passportNumber);
      }

      if (!applied) {
        unmatched.push({
          applicantId: match.applicantId,
          detectedDocType,
          file,
          id: `unmatched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          passportNumber,
          reason: 'В canonical слот нельзя загрузить файл в текущем статусе.',
          submissionId: match.submissionId,
        });
      }
    }

    if (submissionsChanged) {
      commitSubmissions(workingSubmissions);
    }
    setUnmatchedUploads((current) => [...unmatched, ...current]);
    setBulkBusy(false);
  };

  const handleBulkFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.currentTarget.files) void handleBulkFiles(event.currentTarget.files);
    event.currentTarget.value = '';
  };

  const assignUnmatchedUpload = (upload: UnmatchedUpload) => {
    if (!upload.submissionId || !upload.applicantId || upload.detectedDocType === 'unknown') return;
    const applied = assignFileToTarget(
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

      <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
        <div className="flex h-[60px] flex-col justify-between rounded-2xl border border-[#242529] bg-gradient-to-br from-[#1a1a1d] to-[#141416] px-3 py-1.5 shadow-sm sm:h-[110px] sm:p-4 lg:p-5">
          <div className="flex items-center justify-end sm:justify-between">
            <span className="hidden text-[12px] font-medium text-white/50 uppercase tracking-wide sm:block">Ждут загрузки</span>
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/5 sm:h-8 sm:w-8">
              <UploadCloud className="h-3.5 w-3.5 text-white/40 sm:h-4 sm:w-4" />
            </div>
          </div>
          <div>
            <div className="text-[24px] font-medium leading-none text-white sm:text-2xl sm:font-semibold">{summary.missing}</div>
            <div className="mt-1 hidden text-[11px] text-white/40 sm:block">по {summary.submissions} пакетам</div>
          </div>
        </div>

        <div className="flex h-[60px] flex-col justify-between rounded-2xl border border-[#242529] bg-gradient-to-br from-[#1a1a1d] to-[#141416] px-3 py-1.5 shadow-sm sm:h-[110px] sm:p-4 lg:p-5">
          <div className="flex items-center justify-end sm:justify-between">
            <span className="hidden text-[12px] font-medium text-white/50 uppercase tracking-wide sm:block">В обработке OCR</span>
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.045] sm:h-8 sm:w-8">
              <ScanLine className="h-3.5 w-3.5 text-[#b8baff] sm:h-4 sm:w-4" />
            </div>
          </div>
          <div>
            <div className="text-[24px] font-medium leading-none text-white sm:text-2xl sm:font-semibold">{summary.processing}</div>
            <div className="mt-1 hidden text-[11px] text-white/40 sm:block">распознаются системой</div>
          </div>
        </div>

        <div className="group relative flex h-[60px] flex-col justify-between overflow-hidden rounded-2xl border border-[#5b2b32]/50 bg-gradient-to-br from-[#1a1a1d] to-[#141416] px-3 py-1.5 shadow-[0_4px_20px_rgba(239,68,68,0.05)] sm:h-[110px] sm:p-4 lg:p-5">
          <div className="relative z-10 flex items-center justify-end sm:justify-between">
            <span className="hidden text-[12px] font-medium text-[#d59aa3]/80 uppercase tracking-wide sm:block">Ошибки проверки</span>
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#24191b]/60 sm:h-8 sm:w-8">
              <FileWarning className="h-3.5 w-3.5 text-[#d59aa3] sm:h-4 sm:w-4" />
            </div>
          </div>
          <div className="relative z-10">
            <div className="text-[24px] font-medium leading-none text-white sm:text-2xl sm:font-semibold">{summary.error}</div>
            <div className="mt-1 hidden text-[11px] text-white/50 sm:block">требуют ручного ревью</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-2xl border border-[#242529] bg-[#161617] shadow-[0_4px_24px_rgba(0,0,0,0.15)]">
        <div className="flex items-center justify-between border-b border-[#242529] bg-[#1a1a1d] px-4 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-white">Матрица сбора документов</h2>
            <p className="mt-1 text-[12px] text-white/50">
              Загрузка по заявителю, массовое распределение по номеру паспорта.
            </p>
          </div>
          <button
            className="hidden h-9 items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-4 text-[13px] font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] sm:flex"
            type="button"
            onClick={() => bulkInputRef.current?.click()}
            disabled={bulkBusy}
          >
            {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin text-white/70" /> : <UploadCloud className="w-4 h-4 text-white/70" />}
            Массовая загрузка
          </button>
        </div>

        <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
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
                        <ChevronRight className="w-4 h-4" />
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
                  onClick={() => assignUnmatchedUpload(upload)}
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
