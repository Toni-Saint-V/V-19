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
  applicantIndex?: number;
  extractedValues?: Partial<ProductApplicantFields>;
  fileRef?: File;
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
  previousSurname: string;
  birthDate: string;
  birthPlace: string;
  birthCountry: string;
  nationality: string;
  birthCitizenship: string;
  otherCitizenship: string;
  gender: string;
  maritalStatus: string;
  nationalId: string;
  phone: string;
  email: string;
  homeAddress: string;
  homeCountry: string;
  homeCity: string;
  postalCode: string;
  passportType: string;
  passportNo: string;
  passportIssuedAt: string;
  passportExpiresAt: string;
  passportIssueCountry: string;
  passportIssuePlace: string;
  occupation: string;
  occupationSpecify: string;
  employerName: string;
  employerAddress: string;
  employerPhone: string;
  costCoveredBy: string;
  financeType: string;
  bankBalance: string;
  meansOfSupport: string;
  mainDestination: string;
  firstEntryCountry: string;
  arrivalDate: string;
  departureDate: string;
  stayDuration: string;
  tripDates: string;
  hotelName: string;
  hotelCountry: string;
  hotelCity: string;
  hotelPostalCode: string;
  hotelAddress: string;
  hotelEmail: string;
  hotelContact: string;
  purpose: string;
  stayPurposeDetails: string;
  entryCount: string;
  biometrics: string;
  previousBiometrics: string;
  previousVisas: string;
  invitingPartyType: string;
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
      return [
        'surname',
        'firstName',
        'previousSurname',
        'birthDate',
        'birthPlace',
        'birthCountry',
        'nationality',
        'birthCitizenship',
        'otherCitizenship',
        'gender',
        'maritalStatus',
        'nationalId',
        'homeAddress',
        'homeCountry',
        'homeCity',
        'postalCode',
        'passportType',
        'passportNo',
        'passportIssuedAt',
        'passportExpiresAt',
        'passportIssueCountry',
        'passportIssuePlace',
      ];
    case 'bank':
      return ['financeType', 'bankBalance', 'costCoveredBy', 'meansOfSupport'];
    case 'booking':
      return ['mainDestination', 'firstEntryCountry', 'arrivalDate', 'departureDate', 'stayDuration', 'tripDates', 'hotelName', 'hotelCountry', 'hotelCity', 'hotelPostalCode', 'hotelAddress', 'hotelEmail', 'hotelContact'];
    case 'employment':
      return ['occupation', 'occupationSpecify', 'employerName', 'employerAddress', 'employerPhone'];
    case 'photo':
      return ['biometrics', 'previousBiometrics'];
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
    intakeFile('demo-selfie-2-main', 'Selfie_2_Main.jpg', 'photo', type === 'family' ? 'Иван Петров' : 'Алина Смирнова'),
    intakeFile('demo-bank-main', 'Bank_Statement.pdf', 'bank', type === 'family' ? 'Иван Петров' : 'Алина Смирнова'),
    intakeFile('demo-booking', 'Booking_Hotel_Flights.pdf', 'booking'),
    intakeFile('demo-employment', 'Employment_Certificate.pdf', 'employment', type === 'family' ? 'Иван Петров' : 'Алина Смирнова'),
  ];

  if (type === 'single') return base;

  return [
    ...base,
    intakeFile('demo-passport-spouse', 'Passport_Spouse.pdf', 'passport', 'Анна Петрова'),
    intakeFile('demo-selfie-spouse', 'Selfie_Spouse.jpg', 'photo', 'Анна Петрова'),
    intakeFile('demo-selfie-2-spouse', 'Selfie_2_Spouse.jpg', 'photo', 'Анна Петрова'),
  ];
}

export function createBrowserIntakeFiles(files: File[], type: ProductPackageType): ProductIntakeFile[] {
  return files.map((file, index) => {
    const kind = fileKindFromName(file.name);
    return {
      ...intakeFile(`browser-${Date.now()}-${index}-${stableToken(file.name)}`, file.name, kind, type === 'family' && index > 0 ? undefined : undefined),
      fileRef: file,
    };
  });
}

export function resetFilesForPipeline(files: ProductIntakeFile[]): ProductIntakeFile[] {
  return files.map((file) => ({ ...file, status: 'queued', progress: 0 }));
}

function emptyApplicantFields(): ProductApplicantFields {
  return {
    surname: '',
    firstName: '',
    previousSurname: '',
    birthDate: '',
    birthPlace: '',
    birthCountry: '',
    nationality: '',
    birthCitizenship: '',
    otherCitizenship: '',
    gender: '',
    maritalStatus: '',
    nationalId: '',
    phone: '',
    email: '',
    homeAddress: '',
    homeCountry: '',
    homeCity: '',
    postalCode: '',
    passportType: '',
    passportNo: '',
    passportIssuedAt: '',
    passportExpiresAt: '',
    passportIssueCountry: '',
    passportIssuePlace: '',
    occupation: '',
    occupationSpecify: '',
    employerName: '',
    employerAddress: '',
    employerPhone: '',
    costCoveredBy: '',
    financeType: '',
    bankBalance: '',
    meansOfSupport: '',
    mainDestination: '',
    firstEntryCountry: '',
    arrivalDate: '',
    departureDate: '',
    stayDuration: '',
    tripDates: '',
    hotelName: '',
    hotelCountry: '',
    hotelCity: '',
    hotelPostalCode: '',
    hotelAddress: '',
    hotelEmail: '',
    hotelContact: '',
    purpose: '',
    stayPurposeDetails: '',
    entryCount: '',
    biometrics: '',
    previousBiometrics: '',
    previousVisas: '',
    invitingPartyType: '',
    refusals: '',
  };
}

function extractedApplicantFieldsForFile(file: ProductIntakeFile | undefined) {
  if (file?.kind !== 'passport') return {};
  return file.extractedValues ?? {};
}

function buildApplicants(
  type: ProductPackageType,
  files: ProductIntakeFile[],
  requestedApplicantCount?: number,
): ProductIntakeApplicant[] {
  const passportFiles = files.filter((file) => file.kind === 'passport');
  const highestAssignedApplicantIndex = passportFiles.reduce(
    (highest, file) => Math.max(highest, file.applicantIndex ?? -1),
    -1,
  );
  const count =
    type === 'family'
      ? Math.max(
          2,
          requestedApplicantCount ?? 0,
          passportFiles.length,
          highestAssignedApplicantIndex + 1,
        )
      : 1;

  return Array.from({ length: count }, (_, index) => {
    const assignedPassport = passportFiles.find(
      (file) => file.applicantIndex === index,
    );
    const fallbackPassport = passportFiles.some(
      (file) => file.applicantIndex !== undefined,
    )
      ? undefined
      : passportFiles[index];
    const passportFile = assignedPassport ?? fallbackPassport;
    const fields = {
      ...emptyApplicantFields(),
      ...extractedApplicantFieldsForFile(
        passportFile ?? (type === 'single' ? passportFiles[0] : undefined),
      ),
    };
    const fullName = [fields.firstName, fields.surname].filter(Boolean).join(' ');
    return {
      id: `intake-app-${index + 1}`,
      role: type === 'single' ? 'single' : index === 0 ? 'main' : 'spouse',
      fullName: fullName || `Заявитель ${index + 1}`,
      confidence: Object.values(fields).some((value) => value.trim()) ? 0.94 : 0,
      fields,
    };
  });
}

export function buildProductIntakeDraft(
  type: ProductPackageType,
  files: ProductIntakeFile[],
  seedIso = new Date().toISOString(),
  requestedApplicantCount?: number,
): ProductIntakeDraft {
  const applicants = buildApplicants(type, files, requestedApplicantCount);
  const namedApplicants = applicants
    .map((applicant) => applicant.fullName)
    .filter((name) => !/^Заявитель \d+$/.test(name));
  const finalFiles = files.filter((file) => ['recognized', 'needs_review', 'failed'].includes(file.status));
  const blockers = finalFiles.filter((file) => file.status === 'failed');
  const warnings = finalFiles.filter((file) => file.status === 'needs_review');
  const recognizedScore = files.length
    ? Math.round((files.reduce((sum, file) => sum + (file.status === 'recognized' ? 1 : file.status === 'needs_review' ? 0.75 : file.status === 'failed' ? 0 : file.progress / 100), 0) / files.length) * 100)
    : 0;
  const id = `INT-${stableToken(`${type}:${seedIso}:${files.map((file) => file.name).join('|')}`).toUpperCase()}`;

  return {
    id,
    title: namedApplicants[0] ?? (type === 'family' ? 'Семейный пакет' : 'Фамилия Имя'),
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
    ['birthPlace', 'Место рождения', 'passport', 0.9],
    ['passportNo', 'Номер паспорта', 'passport', 0.97],
    ['passportIssuedAt', 'Дата выдачи', 'passport', 0.9],
    ['passportExpiresAt', 'Срок действия', 'passport', 0.95],
    ['bankBalance', 'Сумма на счёте', 'bank', 0.76],
    ['tripDates', 'Даты поездки', 'booking', 0.94],
    ['hotelName', 'Отель', 'booking', 0.92],
    ['employerName', 'Работодатель', 'employment', 0.84],
  ];

  return fields.flatMap(([key, label, kind, confidence]) => {
    const source = sourceForKind(kind);
    if (!source) return [];
    const value = String(main.fields[key] ?? '').trim();
    if (!value) return [];
    return [{
      key,
      label,
      value,
      sourceKind: kind,
      sourceFileName: source.name,
      confidence,
      state: source.status === 'needs_review' ? 'warning' : 'ok',
    } satisfies PrefillPreviewField];
  });
}

export function loadProductIntakeDrafts(): ProductIntakeDraft[] {
  const storage = globalThis.localStorage;
  if (!storage) return [];
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as ProductIntakeDraft[] : [];
  } catch {
    return [];
  }
}

export function saveProductIntakeDrafts(drafts: ProductIntakeDraft[]) {
  const storage = globalThis.localStorage;
  if (!storage) return;
  try {
    storage.setItem(storageKey, JSON.stringify(drafts));
  } catch {
    // Local demo persistence is best-effort; canonical persistence remains in V19 submissions.
  }
}

export function clearProductIntakeDrafts() {
  const storage = globalThis.localStorage;
  if (!storage) return;
  try {
    storage.removeItem(storageKey);
  } catch {
    // Keep legacy data untouched when local demo storage is unavailable.
  }
}
