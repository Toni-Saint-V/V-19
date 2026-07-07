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
