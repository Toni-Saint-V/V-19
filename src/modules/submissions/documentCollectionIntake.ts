import type { CollectionDocumentUpload, Submission } from './types';

export type CollectionDocType =
  | 'passport'
  | 'selfie'
  | 'selfie2'
  | 'questionnaire';

export type CollectionApplicantIndexEntry = {
  applicantId: string;
  applicantName: string;
  passportNumber: string;
  submissionId: string;
};

export type CollectionUploadTarget = {
  applicantId: string;
  docType: CollectionDocType;
  submissionId: string;
};

export type CollectionUploadResolution =
  | {
      status: 'matched';
      target: CollectionUploadTarget;
    }
  | {
      reason: string;
      status: 'unmatched';
    };

export const collectionDocTypes: Array<{ key: CollectionDocType; label: string }> = [
  { key: 'passport', label: 'Загран' },
  { key: 'selfie', label: 'Селфи 1' },
  { key: 'selfie2', label: 'Селфи 2' },
  { key: 'questionnaire', label: 'Анкета' },
];

export const canonicalCollectionDocTypes: ReadonlySet<CollectionDocType> = new Set([
  'passport',
  'selfie',
  'selfie2',
]);

export const collectionDocumentDocTypes: ReadonlySet<CollectionDocType> = new Set([
  'questionnaire',
]);

const collectionDocTypeKeys = new Set(collectionDocTypes.map((doc) => doc.key));

export function isCollectionDocType(value: string): value is CollectionDocType {
  return collectionDocTypeKeys.has(value as CollectionDocType);
}

export function normalizeCollectionPassportNumber(value: string | undefined) {
  const digits = value?.replace(/\D+/g, '') ?? '';
  if (digits.length < 7 || digits.length > 10) return '';
  return digits;
}

export function passportNumberFromCollectionText(value: string) {
  const match = value.replace(/\D+/g, ' ').match(/\b\d{7,10}\b/);
  return normalizeCollectionPassportNumber(match?.[0]);
}

export function detectCollectionDocType(fileName: string): CollectionDocType | 'unknown' {
  const lower = fileName.toLowerCase();
  if (/passport|паспорт|загран|mrz/.test(lower)) return 'passport';
  if (/selfie[\s_-]*2|селфи[\s_-]*2|photo[\s_-]*2|фото[\s_-]*2/.test(lower)) return 'selfie2';
  if (/selfie|селфи|photo|фото/.test(lower)) return 'selfie';
  if (/questionnaire|application|form|анкета|заявлен/.test(lower)) return 'questionnaire';
  return 'unknown';
}

export function resolveCollectionUploadTarget({
  applicants,
  detectedDocType,
  passportNumber,
}: {
  applicants: CollectionApplicantIndexEntry[];
  detectedDocType: CollectionDocType | 'unknown';
  passportNumber: string;
}): CollectionUploadResolution {
  if (detectedDocType === 'unknown') {
    return {
      reason: 'Тип документа не определён по имени файла.',
      status: 'unmatched',
    };
  }

  if (!passportNumber) {
    return {
      reason: 'Номер паспорта не найден в имени файла или OCR.',
      status: 'unmatched',
    };
  }

  const matches = applicants.filter((item) => item.passportNumber === passportNumber);
  if (matches.length !== 1) {
    return {
      reason: 'Номер паспорта не дал одного точного совпадения.',
      status: 'unmatched',
    };
  }

  const match = matches[0];
  return {
    status: 'matched',
    target: {
      applicantId: match.applicantId,
      docType: detectedDocType,
      submissionId: match.submissionId,
    },
  };
}

function isCollectionDocumentStatus(
  value: unknown,
): value is CollectionDocumentUpload['status'] {
  return value === 'uploaded' || value === 'needs_review';
}

export function normalizeCollectionDocuments(
  value: unknown,
  submissionId?: string,
): CollectionDocumentUpload[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<CollectionDocumentUpload>;
    if (
      !candidate.id ||
      !candidate.applicantId ||
      !candidate.fileName ||
      candidate.docType !== 'questionnaire'
    ) {
      return [];
    }

    const normalizedSubmissionId = submissionId ?? candidate.submissionId;
    if (!normalizedSubmissionId) return [];
    if (submissionId && candidate.submissionId && candidate.submissionId !== submissionId) {
      return [];
    }

    return [
      {
        applicantId: candidate.applicantId,
        docType: 'questionnaire',
        fileName: candidate.fileName,
        id: candidate.id,
        mimeType: candidate.mimeType || 'application/octet-stream',
        passportNumber: normalizeCollectionPassportNumber(candidate.passportNumber),
        sizeBytes: Number.isFinite(Number(candidate.sizeBytes)) ? Number(candidate.sizeBytes) : 0,
        status: isCollectionDocumentStatus(candidate.status) ? candidate.status : 'uploaded',
        submissionId: normalizedSubmissionId,
        uploadedAtIso: candidate.uploadedAtIso || new Date(0).toISOString(),
      },
    ];
  });
}

export function findCollectionDocumentUpload(
  submission: Pick<Submission, 'collectionDocuments' | 'id'>,
  applicantId: string,
  docType: CollectionDocType,
) {
  if (!collectionDocumentDocTypes.has(docType)) return undefined;
  return normalizeCollectionDocuments(submission.collectionDocuments, submission.id).find(
    (record) =>
      record.submissionId === submission.id &&
      record.applicantId === applicantId &&
      record.docType === docType,
  );
}

export function upsertCollectionDocumentUpload(
  submission: Submission,
  record: CollectionDocumentUpload,
): Submission {
  if (!collectionDocumentDocTypes.has(record.docType)) return submission;

  const current = normalizeCollectionDocuments(submission.collectionDocuments, submission.id);
  const collectionDocuments = [
    record,
    ...current.filter(
      (item) =>
        !(
          item.submissionId === record.submissionId &&
          item.applicantId === record.applicantId &&
          item.docType === record.docType
        ),
    ),
  ];

  return {
    ...submission,
    collectionDocuments,
    history: [
      ...submission.history,
      {
        id: `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: `Загружена анкета: ${record.fileName}`,
        at: 'сейчас',
        source: 'agent',
      },
    ],
    updatedAt: 'сейчас',
  };
}
