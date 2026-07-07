export type ProductPackageType = 'single' | 'family';

export type ProductIntakePhase = 'selecting' | 'uploading' | 'extracting' | 'review' | 'ready';

export type ProductFileKind = 'passport' | 'photo' | 'bank' | 'booking' | 'employment' | 'unknown';

export type ProductFileStatus =
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'extracting'
  | 'recognized'
  | 'needs_review'
  | 'failed';

export type ProductIntakeFile = {
  id: string;
  name: string;
  kind: ProductFileKind;
  status: ProductFileStatus;
  progress: number;
  issue?: string;
  ownerName?: string;
  extractedFieldKeys: string[];
};

export type ProductIntakeIssue = {
  id: string;
  severity: 'blocker' | 'warning' | 'info';
  title: string;
  description: string;
};

export type ProductApplicantRole = 'main' | 'spouse' | 'child' | 'single';

export type ProductApplicantFields = {
  surname: string;
  firstName: string;
  birthDate: string;
  birthPlace: string;
  nationality: string;
  gender: string;
  phone: string;
  email: string;
  passportType: string;
  passportNo: string;
  passportIssuedAt: string;
  passportExpiresAt: string;
  passportIssueCountry: string;
  passportIssuePlace: string;
  occupation: string;
  employerName: string;
  employerAddress: string;
  employerPhone: string;
  financeType: string;
  bankBalance: string;
  mainDestination: string;
  firstEntryCountry: string;
  tripDates: string;
  hotelName: string;
  hotelAddress: string;
  purpose: string;
  entryCount: string;
  biometrics: string;
  previousVisas: string;
  refusals: string;
};

export type ProductIntakeApplicant = {
  id: string;
  role: ProductApplicantRole;
  fullName: string;
  confidence: number;
  fields: ProductApplicantFields;
};

export type ProductIntakeDraft = {
  id: string;
  title: string;
  type: ProductPackageType;
  country: string;
  city: string;
  tripDates: string;
  readyPercent: number;
  statusLabel: string;
  nextAction: string;
  files: ProductIntakeFile[];
  applicants: ProductIntakeApplicant[];
  issues: ProductIntakeIssue[];
  createdAtIso: string;
};

export type PrefillPreviewField = {
  key: string;
  label: string;
  value: string;
  sourceKind: ProductFileKind;
  sourceFileName?: string;
  confidence: number;
  state: 'ok' | 'warning';
};

const storageKey = 'visaflow.v19.productIntakeDrafts.v1';

export const productFileKindLabels: Record<ProductFileKind, string> = {
  passport: 'Паспорт',
  photo: 'Фото / селфи',
  bank: 'Финансы',
  booking: 'Бронь / маршрут',
  employment: 'Работа',
  unknown: 'Неизвестно',
};

export const productFileStatusLabels: Record<ProductFileStatus, string> = {
  queued: 'В очереди',
  uploading: 'Загрузка',
  uploaded: 'Загружено',
  extracting: 'OCR',
  recognized: 'Распознано',
  needs_review: 'Проверить',
  failed: 'Ошибка',
};

export function productIntakePhaseLabel(phase: ProductIntakePhase) {
  switch (phase) {
    case 'selecting':
      return 'Выбор пакета';
    case 'uploading':
      return 'Загрузка';
    case 'extracting':
      return 'OCR';
    case 'review':
      return 'Сверка';
    case 'ready':
      return 'Готово';
  }
}

function stableToken(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36).padStart(6, '0');
}

function fileKindFromName(name: string): ProductFileKind {
  const lower = name.toLowerCase();
  if (/passport|паспорт|загран|mrz/.test(lower)) return 'passport';
  if (/selfie|photo|фото|селфи/.test(lower)) return 'photo';
  if (/bank|statement|finance|банк|выпис/.test(lower)) return 'bank';
  if (/booking|hotel|flight|ticket|брон|отел|авиа|билет/.test(lower)) return 'booking';
  if (/work|employment|job|работ|справ/.test(lower)) return 'employment';
  return 'unknown';
}

function extractedKeysForKind(kind: ProductFileKind) {
  switch (kind) {
    case 'passport':
      return ['surname', 'firstName', 'birthDate', 'birthPlace', 'passportNo', 'passportIssuedAt', 'passportExpiresAt'];
    case 'bank':
      return ['financeType', 'bankBalance'];
    case 'booking':
      return ['mainDestination', 'firstEntryCountry', 'tripDates', 'hotelName', 'hotelAddress'];
    case 'employment':
      return ['occupation', 'employerName', 'employerAddress', 'employerPhone'];
    case 'photo':
      return ['biometrics'];
    default:
      return [];
  }
}

function intakeFile(id: string, name: string, kind: ProductFileKind, ownerName?: string, status: ProductFileStatus = 'queued'): ProductIntakeFile {
  return {
    id,
    name,
    kind,
    ownerName,
    status,
    progress: status === 'recognized' || status === 'needs_review' || status === 'failed' ? 100 : 0,
    extractedFieldKeys: extractedKeysForKind(kind),
    issue: kind === 'bank' ? 'Проверьте дату и сумму по выписке' : kind === 'unknown' ? 'Файл не классифицирован' : undefined,
  };
}

export function createDemoIntakeFiles(type: ProductPackageType): ProductIntakeFile[] {
  const base = [
    intakeFile('demo-passport-main', 'Passport_Main.pdf', 'passport', type === 'family' ? 'Иван Петров' : 'Алина Смирнова'),
    intakeFile('demo-selfie-main', 'Selfie_Main.jpg', 'photo', type === 'family' ? 'Иван Петров' : 'Алина Смирнова'),
    intakeFile('demo-bank-main', 'Bank_Statement.pdf', 'bank', type === 'family' ? 'Иван Петров' : 'Алина Смирнова'),
    intakeFile('demo-booking', 'Booking_Hotel_Flights.pdf', 'booking'),
    intakeFile('demo-employment', 'Employment_Certificate.pdf', 'employment', type === 'family' ? 'Иван Петров' : 'Алина Смирнова'),
  ];

  if (type === 'single') return base;

  return [
    ...base,
    intakeFile('demo-passport-spouse', 'Passport_Spouse.pdf', 'passport', 'Анна Петрова'),
    intakeFile('demo-selfie-spouse', 'Selfie_Spouse.jpg', 'photo', 'Анна Петрова'),
  ];
}

export function createBrowserIntakeFiles(files: File[], type: ProductPackageType): ProductIntakeFile[] {
  return files.map((file, index) => {
    const kind = fileKindFromName(file.name);
    return intakeFile(`browser-${Date.now()}-${index}-${stableToken(file.name)}`, file.name, kind, type === 'family' && index > 0 ? undefined : undefined);
  });
}

export function resetFilesForPipeline(files: ProductIntakeFile[]): ProductIntakeFile[] {
  return files.map((file) => ({ ...file, status: 'queued', progress: 0 }));
}

function baseFields(index: number, type: ProductPackageType): ProductApplicantFields {
  const family = type === 'family';
  const isSecond = family && index === 1;
  const surname = family ? 'PETROV' : 'SMIRNOVA';
  const firstName = family ? (isSecond ? 'ANNA' : 'IVAN') : 'ALINA';
  return {
    surname,
    firstName,
    birthDate: isSecond ? '14.09.1987' : family ? '12.05.1985' : '02.03.1991',
    birthPlace: isSecond ? 'SAINT PETERSBURG' : 'MOSCOW',
    nationality: 'RUSSIAN FEDERATION',
    gender: isSecond || !family ? 'F' : 'M',
    phone: '+7 921 000-41-12',
    email: family ? 'petrov.family@example.com' : 'alina.smirnova@example.com',
    passportType: 'Ordinary passport',
    passportNo: isSecond ? '75 7654321' : '75 1234567',
    passportIssuedAt: '15.06.2020',
    passportExpiresAt: '15.06.2030',
    passportIssueCountry: 'RUSSIAN FEDERATION',
    passportIssuePlace: 'FMS 770-123',
    occupation: isSecond ? 'Designer' : 'Project manager',
    employerName: isSecond ? 'Self-employed' : 'ООО «Северный маршрут»',
    employerAddress: 'Москва, ул. Тверская, 1',
    employerPhone: '+7 495 000-00-00',
    financeType: 'Собственные средства',
    bankBalance: '480 000 ₽',
    mainDestination: 'Spain',
    firstEntryCountry: 'Spain',
    tripDates: '18.08.2026 – 02.09.2026',
    hotelName: 'Hotel Madrid Centro',
    hotelAddress: 'Calle Mayor 1, Madrid',
    purpose: 'Tourism',
    entryCount: 'Multiple entries',
    biometrics: 'Сдана 18.09.2023',
    previousVisas: 'Schengen C, 2023–2025',
    refusals: 'Нет',
  };
}

function buildApplicants(type: ProductPackageType): ProductIntakeApplicant[] {
  const count = type === 'family' ? 2 : 1;
  return Array.from({ length: count }, (_, index) => {
    const fields = baseFields(index, type);
    return {
      id: `intake-app-${index + 1}`,
      role: type === 'single' ? 'single' : index === 0 ? 'main' : 'spouse',
      fullName: `${fields.firstName} ${fields.surname}`,
      confidence: index === 0 ? 0.94 : 0.89,
      fields,
    };
  });
}

export function buildProductIntakeDraft(type: ProductPackageType, files: ProductIntakeFile[], seedIso = new Date().toISOString()): ProductIntakeDraft {
  const applicants = buildApplicants(type);
  const finalFiles = files.filter((file) => ['recognized', 'needs_review', 'failed'].includes(file.status));
  const blockers = finalFiles.filter((file) => file.status === 'failed');
  const warnings = finalFiles.filter((file) => file.status === 'needs_review');
  const recognizedScore = files.length
    ? Math.round((files.reduce((sum, file) => sum + (file.status === 'recognized' ? 1 : file.status === 'needs_review' ? 0.75 : file.status === 'failed' ? 0 : file.progress / 100), 0) / files.length) * 100)
    : 0;
  const id = `INT-${stableToken(`${type}:${seedIso}:${files.map((file) => file.name).join('|')}`).toUpperCase()}`;

  return {
    id,
    title: type === 'family' ? 'Семья Петровых' : 'Алина Смирнова',
    type,
    country: 'Испания',
    city: 'Москва',
    tripDates: '18.08.2026 – 02.09.2026',
    readyPercent: recognizedScore,
    statusLabel: blockers.length ? 'Есть блокеры' : warnings.length ? 'Нужна ручная сверка' : recognizedScore >= 95 ? 'Готово к анкете' : 'Сборка пакета',
    nextAction: blockers.length
      ? 'Удалить или заменить нераспознанные файлы.'
      : warnings.length
        ? 'Подтвердить предупреждения OCR перед отправкой.'
        : 'Проверить автозаполненную анкету и отправить на ревью.',
    files,
    applicants,
    issues: [
      ...blockers.map((file) => ({ id: `${file.id}-blocker`, severity: 'blocker' as const, title: 'Файл не распознан', description: file.issue ?? 'Файл нужно заменить.' })),
      ...warnings.map((file) => ({ id: `${file.id}-warning`, severity: 'warning' as const, title: 'Требуется сверка', description: file.issue ?? 'Нужно подтвердить извлечённые поля.' })),
    ],
    createdAtIso: seedIso,
  };
}

export function getPrefillPreviewFields(draft: ProductIntakeDraft): PrefillPreviewField[] {
  const main = draft.applicants[0];
  if (!main) return [];

  const sourceForKind = (kind: ProductFileKind) => draft.files.find((file) => file.kind === kind && ['recognized', 'needs_review'].includes(file.status));
  const fields: Array<[keyof ProductApplicantFields, string, ProductFileKind, number]> = [
    ['surname', 'Фамилия', 'passport', 0.98],
    ['firstName', 'Имя', 'passport', 0.98],
    ['birthDate', 'Дата рождения', 'passport', 0.96],
    ['passportNo', 'Номер паспорта', 'passport', 0.97],
    ['bankBalance', 'Сумма на счёте', 'bank', 0.76],
    ['tripDates', 'Даты поездки', 'booking', 0.94],
    ['hotelName', 'Отель', 'booking', 0.92],
    ['employerName', 'Работодатель', 'employment', 0.84],
  ];

  return fields.flatMap(([key, label, kind, confidence]) => {
    const source = sourceForKind(kind);
    if (!source) return [];
    return [{
      key,
      label,
      value: String(main.fields[key] ?? ''),
      sourceKind: kind,
      sourceFileName: source.name,
      confidence,
      state: source.status === 'needs_review' ? 'warning' : 'ok',
    } satisfies PrefillPreviewField];
  });
}

export function loadProductIntakeDrafts(): ProductIntakeDraft[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as ProductIntakeDraft[] : [];
  } catch {
    return [];
  }
}

export function saveProductIntakeDrafts(drafts: ProductIntakeDraft[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(drafts));
  } catch {
    // Local demo persistence is best-effort; canonical persistence remains in V19 submissions.
  }
}
