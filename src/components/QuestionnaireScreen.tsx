import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { emitVisaflowUiEvent, useVisaflowBusinessBridge } from '../integration/visaflowBusinessBridge';
import { motion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Building2,
  CheckCircle2,
  CreditCard,
  FileText,
  History,
  Mail,
  Phone,
  Plane,
  Save,
  Search,
  Send,
  Sparkles,
  User,
} from 'lucide-react';
import { type ProductFileKind, type ProductIntakeDraft } from '../modules/submissions/productIntakeFlow';
import { createQuestionnaireSections } from '../modules/submissions/questionnaire';
import type {
  Applicant as SubmissionApplicant,
  QuestionnaireField as SubmissionQuestionnaireField,
  QuestionnaireSection as SubmissionQuestionnaireSection,
  Submission,
} from '../modules/submissions/types';

interface QuestionnaireScreenProps {
  submissionId: string;
  onBack: () => void;
  draft?: ProductIntakeDraft;
  submission?: Submission;
  onSaveDraft?: (submissionId: string) => void | Promise<void>;
  onSubmitForReview?: (submissionId: string) => void | Promise<void>;
}

type SectionStatus = 'complete' | 'active' | 'attention' | 'locked';
type FieldState = 'ok' | 'warning' | 'empty';
type DraftApplicant = ProductIntakeDraft['applicants'][number];
type ScreenApplicant = DraftApplicant | SubmissionApplicant;

interface QuestionnaireField {
  key: string;
  label: string;
  value: string;
  state: FieldState;
  control?: SubmissionQuestionnaireField['control'];
  options?: string[];
  placeholder?: string;
  required?: boolean;
  span?: SubmissionQuestionnaireField['span'];
  source?: string;
  confidence?: number;
}

interface QuestionnaireSection {
  id: string;
  title: string;
  description: string;
  progress: number;
  progressLabel: string;
  status: SectionStatus;
  icon: ComponentType<{ className?: string }>;
  fields: QuestionnaireField[];
  stepLabel?: string;
}

const statusMeta: Record<SectionStatus, { label: string; className: string; dot: string }> = {
  complete: {
    label: 'Готово',
    className: 'bg-white/[0.045] border-white/10 text-[#b8baff]',
    dot: 'bg-[#7c73ff]',
  },
  active: {
    label: 'В работе',
    className: 'bg-[#6f64ff]/15 border-[#6f64ff]/25 text-[#b8baff]',
    dot: 'bg-[#8fa3ff]',
  },
  attention: {
    label: 'Проверить',
    className: 'bg-white/[0.045] border-white/10 text-white/62',
    dot: 'bg-[#7c73ff]',
  },
  locked: {
    label: 'Закрыто',
    className: 'bg-white/5 border-white/10 text-white/40',
    dot: 'bg-white/30',
  },
};

function field(
  key: string,
  label: string,
  value: string,
  state: FieldState = value.trim() ? 'ok' : 'empty',
  source?: string,
  confidence?: number,
  meta: Pick<QuestionnaireField, 'control' | 'options' | 'placeholder' | 'required' | 'span'> = {},
): QuestionnaireField {
  return { key, label, value, state, source, confidence, ...meta };
}

function recalcSection(section: Omit<QuestionnaireSection, 'progress' | 'progressLabel' | 'status'>): QuestionnaireSection {
  const fields = section.fields;
  const score = fields.reduce((sum, item) => sum + (item.state === 'ok' ? 1 : item.state === 'warning' ? 0.55 : 0), 0);
  const progress = fields.length ? Math.round((score / fields.length) * 100) : 0;
  const hasWarning = fields.some((item) => item.state === 'warning');
  const hasEmpty = fields.some((item) => item.state === 'empty');
  const status: SectionStatus = progress >= 100 ? 'complete' : hasWarning ? 'attention' : hasEmpty ? 'active' : 'active';

  return {
    ...section,
    progress,
    progressLabel: `${progress}%`,
    status,
  };
}

function sourceName(draft: ProductIntakeDraft, kind: ProductFileKind) {
  return draft.files.find((file) => file.kind === kind && ['recognized', 'needs_review'].includes(file.status))?.name;
}

function fieldSourceState(source: string | undefined, value: string): FieldState {
  if (!value.trim()) return 'empty';
  return source ? 'ok' : 'warning';
}

function fileSection(
  files: Array<{ kind?: ProductFileKind; name?: string; originalFileName?: string; generatedFileName?: string; status?: string; type?: string }> = [],
): QuestionnaireSection {
  const draftPassport = files.find((file) => file.kind === 'passport')?.name;
  const draftPhoto = files.find((file) => file.kind === 'photo')?.name;
  const submissionPassport = files.find((file) => file.type === 'passport_scan')?.originalFileName ?? files.find((file) => file.type === 'passport_scan')?.generatedFileName;
  const submissionSelfie1 = files.find((file) => file.type === 'selfie')?.originalFileName ?? files.find((file) => file.type === 'selfie')?.generatedFileName;
  const submissionSelfie2 = files.find((file) => file.type === 'selfie_2')?.originalFileName ?? files.find((file) => file.type === 'selfie_2')?.generatedFileName;
  const passportValue = draftPassport ?? submissionPassport ?? '';
  const selfie1Value = draftPhoto ?? submissionSelfie1 ?? '';
  const selfie2Value = submissionSelfie2 ?? '';

  return recalcSection({
    id: 'files',
    title: 'Файлы',
    stepLabel: '0 из 10',
    description: 'Финальная карта передачи: загранпаспорт, селфи анфас и селфи профиль.',
    icon: FileText,
    fields: [
      field('passport-scan', 'Загранпаспорт - скан/фото главной страницы с фото', passportValue, passportValue ? 'ok' : 'empty', passportValue ? 'Загруженный файл' : undefined, undefined, { required: true }),
      field('selfie-front', 'Селфи 1 - лицом/анфас', selfie1Value, selfie1Value ? 'ok' : 'empty', selfie1Value ? 'Загруженный файл' : undefined, undefined, { required: true }),
      field('selfie-profile', 'Селфи 2 - боком/профиль', selfie2Value, selfie2Value ? 'ok' : 'empty', selfie2Value ? 'Загруженный файл' : undefined, undefined, { required: true }),
    ],
  });
}

function sectionIdFromCanonical(sectionId: string) {
  return sectionId.split('-').at(-1) ?? sectionId;
}

function screenFieldFromCanonical(fieldItem: SubmissionQuestionnaireField): QuestionnaireField {
  return field(
    fieldItem.id,
    fieldItem.label,
    fieldItem.value,
    submissionFieldState(fieldItem),
    submissionFieldSource(fieldItem),
    submissionFieldConfidence(fieldItem),
    {
      control: fieldItem.control,
      options: fieldItem.options,
      placeholder: fieldItem.placeholder,
      required: fieldItem.required,
      span: fieldItem.span,
    },
  );
}

function screenSectionFromCanonical(section: SubmissionQuestionnaireSection): QuestionnaireSection {
  const id = sectionIdFromCanonical(section.id);
  return recalcSection({
    id,
    title: section.title,
    stepLabel: section.stepLabel,
    description: sectionDescriptionFromSubmission(section),
    icon: iconForSubmissionSection(id),
    fields: section.fields.map(screenFieldFromCanonical),
  });
}

function buildFallbackSections(): QuestionnaireSection[] {
  return [
    fileSection(),
    ...createQuestionnaireSections('fallback-applicant', 'Заявитель', 'empty').map(screenSectionFromCanonical),
  ];
}

function yearFromDate(value: string) {
  const match = /(?:^|\D)(\d{2})\.(\d{2})\.(\d{4})(?:\D|$)/.exec(value);
  return match ? Number(match[3]) : null;
}

function birthCountryFromBirthDate(value: string) {
  const year = yearFromDate(value);
  if (!year) return '';
  return year <= 1990 ? 'USSR' : 'Russian Federation';
}

function normalizeGender(value: string) {
  if (value === 'M') return 'Мужской';
  if (value === 'F') return 'Женский';
  return value;
}

function normalizeCountry(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'RUSSIAN FEDERATION' || normalized === 'RUS') return 'Russian Federation';
  if (normalized === 'USSR') return 'USSR';
  if (normalized === 'ESP' || normalized === 'SPAIN') return 'Spain';
  return value;
}

function normalizePassportType(value: string) {
  return value.trim().toUpperCase() === 'P' ? 'Ordinary Passport' : value;
}

function splitTripDates(value: string) {
  const [arrival = '', departure = ''] = value.split(/\s+[–-]\s+/);
  return { arrival: arrival.trim(), departure: departure.trim() };
}

function draftFieldValues(draft: ProductIntakeDraft, applicant: DraftApplicant) {
  const data = applicant.fields;
  const tripDates = splitTripDates(data.tripDates || draft.tripDates);
  return new Map<string, { confidence?: number; source?: string; value: string }>([
    ['appointment-city', { source: 'Пакет', value: draft.city }],
    ['visa-type', { source: 'Пакет', value: 'Шенгенская' }],
    ['surname', { confidence: 0.98, source: sourceName(draft, 'passport'), value: data.surname }],
    ['first-name', { confidence: 0.98, source: sourceName(draft, 'passport'), value: data.firstName }],
    ['birth-date', { confidence: 0.96, source: sourceName(draft, 'passport'), value: data.birthDate }],
    ['birth-place', { confidence: 0.9, source: sourceName(draft, 'passport'), value: data.birthPlace }],
    ['birth-country', { confidence: 0.9, source: data.birthDate ? 'Правило по году рождения' : undefined, value: birthCountryFromBirthDate(data.birthDate) }],
    ['nationality', { confidence: 0.94, source: sourceName(draft, 'passport'), value: normalizeCountry(data.nationality) }],
    ['birth-citizenship', { confidence: 0.9, source: data.birthDate ? 'Правило по году рождения' : undefined, value: birthCountryFromBirthDate(data.birthDate) }],
    ['gender', { confidence: 0.91, source: sourceName(draft, 'passport'), value: normalizeGender(data.gender) }],
    ['email', { source: data.email ? 'Профиль клиента' : undefined, value: data.email }],
    ['contact-number', { source: data.phone ? 'Профиль клиента' : undefined, value: data.phone }],
    ['passport-type', { confidence: 0.92, source: sourceName(draft, 'passport'), value: normalizePassportType(data.passportType) }],
    ['passport-no', { confidence: 0.97, source: sourceName(draft, 'passport'), value: data.passportNo }],
    ['passport-issue-date', { confidence: 0.95, source: sourceName(draft, 'passport'), value: data.passportIssuedAt }],
    ['passport-expiry-date', { confidence: 0.96, source: sourceName(draft, 'passport'), value: data.passportExpiresAt }],
    ['passport-issue-country', { confidence: 0.92, source: sourceName(draft, 'passport'), value: normalizeCountry(data.passportIssueCountry) }],
    ['passport-issue-place', { confidence: 0.87, source: sourceName(draft, 'passport'), value: data.passportIssuePlace }],
    ['occupation', { confidence: 0.84, source: sourceName(draft, 'employment'), value: data.occupation }],
    ['employer-name', { confidence: 0.84, source: sourceName(draft, 'employment'), value: data.employerName }],
    ['employer-address', { confidence: 0.78, source: sourceName(draft, 'employment'), value: data.employerAddress }],
    ['employer-contact', { confidence: 0.74, source: sourceName(draft, 'employment'), value: data.employerPhone }],
    ['purpose', { confidence: 0.86, source: sourceName(draft, 'booking'), value: data.purpose }],
    ['main-destination', { confidence: 0.94, source: data.mainDestination ? sourceName(draft, 'booking') : 'Пакет', value: data.mainDestination || 'Spain' }],
    ['first-entry-country', { confidence: 0.92, source: data.firstEntryCountry ? sourceName(draft, 'booking') : 'Пакет', value: data.firstEntryCountry || 'Spain' }],
    ['entry-count', { confidence: 0.88, source: data.entryCount ? 'Пакет' : undefined, value: data.entryCount }],
    ['arrival-date', { confidence: 0.84, source: data.tripDates ? sourceName(draft, 'booking') : undefined, value: tripDates.arrival }],
    ['departure-date', { confidence: 0.84, source: data.tripDates ? sourceName(draft, 'booking') : undefined, value: tripDates.departure }],
    ['hotel-name', { confidence: 0.92, source: sourceName(draft, 'booking'), value: data.hotelName }],
    ['hotel-address', { confidence: 0.88, source: sourceName(draft, 'booking'), value: data.hotelAddress }],
    ['cost-covered-by', { source: data.financeType ? sourceName(draft, 'bank') : undefined, value: data.financeType }],
  ]);
}

function buildSectionsFromDraft(draft: ProductIntakeDraft, applicantId?: string): QuestionnaireSection[] {
  const applicant = draft.applicants.find((item) => item.id === applicantId) ?? draft.applicants[0];
  if (!applicant) return buildFallbackSections();

  const values = draftFieldValues(draft, applicant);
  const canonical = createQuestionnaireSections(applicant.id, applicant.fullName, 'empty').map((section) => ({
    ...section,
    fields: section.fields.map((fieldItem) => {
      const mapped = values.get(fieldItem.id);
      if (!mapped) return fieldItem;
      return {
        ...fieldItem,
        reviewSource: mapped.source ? 'passport_ocr' as const : fieldItem.reviewSource,
        reviewState: mapped.value.trim() ? 'needs_review' as const : fieldItem.reviewState,
        value: mapped.value,
      };
    }),
  }));

  return [
    fileSection(draft.files),
    ...canonical.map((section) => {
      const screenSection = screenSectionFromCanonical(section);
      return recalcSection({
        ...screenSection,
        fields: screenSection.fields.map((fieldItem) => {
          const mapped = values.get(fieldItem.key);
          if (!mapped) return fieldItem;
          return {
            ...fieldItem,
            confidence: mapped.confidence,
            source: mapped.source,
            state: fieldSourceState(mapped.source, mapped.value),
          };
        }),
      });
    }),
  ];
}

function iconForSubmissionSection(sectionId: string): ComponentType<{ className?: string }> {
  if (sectionId.includes('files')) return FileText;
  if (sectionId.includes('passport')) return FileText;
  if (sectionId.includes('employment') || sectionId.includes('work')) return Briefcase;
  if (sectionId.includes('payment') || sectionId.includes('finance')) return CreditCard;
  if (sectionId.includes('trip') || sectionId.includes('hotel') || sectionId.includes('appointment')) return Plane;
  if (sectionId.includes('history')) return History;
  return User;
}

function submissionFieldState(fieldItem: SubmissionQuestionnaireField): FieldState {
  if (fieldItem.reviewState === 'needs_review' || fieldItem.error) return 'warning';
  if (fieldItem.required && !fieldItem.value.trim()) return 'empty';
  return fieldItem.value.trim() ? 'ok' : 'empty';
}

function submissionFieldSource(fieldItem: SubmissionQuestionnaireField) {
  if (fieldItem.reviewSource === 'passport_ocr') return 'Паспорт OCR';
  if (fieldItem.reviewSource === 'family_shared') return 'Общее поле семьи';
  if (fieldItem.reviewSource === 'pdf_reconciliation') return 'PDF-сверка';
  if (fieldItem.reviewSource === 'manual') return 'Ручное редактирование';
  return undefined;
}

function submissionFieldConfidence(fieldItem: SubmissionQuestionnaireField) {
  if (fieldItem.reviewState === 'confirmed') return 1;
  if (fieldItem.reviewState === 'needs_review') return 0.82;
  return undefined;
}

function sectionDescriptionFromSubmission(section: SubmissionQuestionnaireSection) {
  const firstError = section.fields.find((fieldItem) => fieldItem.error);
  const firstMissing = section.fields.find((fieldItem) => fieldItem.required && !fieldItem.value.trim());
  if (firstError?.error) return firstError.error;
  if (firstMissing) return `Нужно заполнить: ${firstMissing.label}`;
  return section.stepLabel ? `${section.stepLabel} · ${section.title}` : `${section.title}: поля анкеты текущей подачи.`;
}

function buildSectionsFromSubmission(
  submission: Submission,
  applicantId?: string,
): QuestionnaireSection[] {
  const applicant =
    submission.applicants.find((item) => item.id === applicantId) ?? submission.applicants[0];
  if (!applicant) return buildFallbackSections();

  return [
    fileSection(submission.files),
    ...applicant.sections.map(screenSectionFromCanonical),
  ];
}

function applicantRoleLabel(role?: ScreenApplicant['role']) {
  if (role === 'main') return 'основной';
  if (role === 'spouse') return 'супруг/супруга';
  if (role === 'child') return 'ребёнок';
  return role ?? 'заявитель';
}

function applicantFieldValue(applicant: ScreenApplicant | undefined, keys: string[], fallback: string) {
  if (!applicant) return fallback;
  if ('fields' in applicant) {
    const fields = applicant.fields as Record<string, string | undefined>;
    return keys.map((key) => fields[key]?.trim()).find(Boolean) ?? fallback;
  }

  for (const section of applicant.sections) {
    for (const fieldItem of section.fields) {
      const haystack = `${fieldItem.id} ${fieldItem.label}`.toLowerCase();
      if (keys.some((key) => haystack.includes(key.toLowerCase()))) {
        const value = fieldItem.value.trim();
        if (value) return value;
      }
    }
  }

  return fallback;
}

function FieldStateIcon({ state }: { state?: FieldState }) {
  if (state === 'warning') return <AlertCircle className="w-3.5 h-3.5 text-white/62" />;
  if (state === 'empty') return <div className="w-3.5 h-3.5 rounded-full border border-white/20" />;
  return <CheckCircle2 className="w-3.5 h-3.5 text-[#b8baff]" />;
}

function computeReadiness(sections: QuestionnaireSection[]) {
  const fields = sections.flatMap((section) => section.fields);
  const score = fields.reduce((sum, item) => sum + (item.state === 'ok' ? 1 : item.state === 'warning' ? 0.55 : 0), 0);
  const warnings = fields.filter((item) => item.state === 'warning').length;
  const empties = fields.filter((item) => item.state === 'empty').length;
  return {
    percent: fields.length ? Math.round((score / fields.length) * 100) : 0,
    risks: warnings + empties,
    warnings,
    empties,
  };
}

function initialSectionId(sections: QuestionnaireSection[]) {
  return sections.find((section) => section.status === 'attention')?.id ?? sections.find((section) => section.status === 'active')?.id ?? sections[0]?.id ?? 'personal';
}

function patchSectionField(
  sections: QuestionnaireSection[],
  sectionId: string,
  fieldKey: string,
  patch: Partial<QuestionnaireField>,
) {
  return sections.map((section) => {
    if (section.id !== sectionId) return section;
    return recalcSection({
      ...section,
      fields: section.fields.map((item) => (item.key === fieldKey ? { ...item, ...patch } : item)),
    });
  });
}

export function QuestionnaireScreen({ submissionId, onBack, draft, submission, onSaveDraft, onSubmitForReview }: QuestionnaireScreenProps) {
  const bridge = useVisaflowBusinessBridge();
  const [activeApplicantId, setActiveApplicantId] = useState(() => submission?.applicants[0]?.id ?? draft?.applicants[0]?.id);
  const [sections, setSections] = useState<QuestionnaireSection[]>(() =>
    submission ? buildSectionsFromSubmission(submission, activeApplicantId) : draft ? buildSectionsFromDraft(draft, activeApplicantId) : buildFallbackSections(),
  );
  const [activeSection, setActiveSection] = useState(() => initialSectionId(sections));
  const [fieldQuery, setFieldQuery] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [sentForReview, setSentForReview] = useState(false);

  useEffect(() => {
    const nextApplicantId = submission?.applicants[0]?.id ?? draft?.applicants[0]?.id;
    setActiveApplicantId(nextApplicantId);
  }, [draft?.id, submission?.id]);

  useEffect(() => {
    const nextSections = submission ? buildSectionsFromSubmission(submission, activeApplicantId) : draft ? buildSectionsFromDraft(draft, activeApplicantId) : buildFallbackSections();
    setSections(nextSections);
    setActiveSection(initialSectionId(nextSections));
    setSentForReview(false);
  }, [activeApplicantId, draft?.id, submission]);

  const active = sections.find((section) => section.id === activeSection) ?? sections[0];
  const readiness = useMemo(() => computeReadiness(sections), [sections]);
  const activeApplicant = submission?.applicants.find((item) => item.id === activeApplicantId) ?? draft?.applicants.find((item) => item.id === activeApplicantId) ?? submission?.applicants[0] ?? draft?.applicants[0];
  const applicants = submission?.applicants ?? draft?.applicants ?? [];
  const visibleSections = useMemo(() => {
    const query = fieldQuery.trim().toLowerCase();
    if (!query) return sections;
    return sections.filter((section) =>
      [section.title, section.description, ...section.fields.map((item) => `${item.label} ${item.value}`)]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [fieldQuery, sections]);
  const visibleFields = useMemo(() => {
    const query = fieldQuery.trim().toLowerCase();
    if (!active) return [];
    if (!query) return active.fields;
    return active.fields.filter((item) => `${item.label} ${item.value}`.toLowerCase().includes(query));
  }, [active, fieldQuery]);

  const handleConfirmField = (sectionId: string, fieldKey: string) => {
    setSections((current) => patchSectionField(current, sectionId, fieldKey, { state: 'ok' }));
  };

  const handleFieldValueChange = (sectionId: string, fieldKey: string, value: string) => {
    setSections((current) =>
      patchSectionField(current, sectionId, fieldKey, {
        value,
        state: value.trim() ? 'ok' : 'empty',
        source: 'Ручное редактирование',
        confidence: 1,
      }),
    );
  };

  const handleSave = () => {
    setSavedAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    void onSaveDraft?.(submissionId);
    const payload = { submissionId, action: 'save_progress' as const, source: 'agent' as const };
    void bridge.onSubmissionAction?.(payload);
    emitVisaflowUiEvent(bridge, { type: 'submission.action', payload });
  };

  const handleSubmit = () => {
    if (readiness.empties > 0) return;
    setSentForReview(true);
    void onSubmitForReview?.(submissionId);
    const payload = { submissionId, action: 'submit_for_review' as const, source: 'agent' as const };
    void bridge.onSubmissionAction?.(payload);
    emitVisaflowUiEvent(bridge, { type: 'submission.action', payload });
  };

  const title = submission ? `${submission.title} · ${submission.country}` : draft ? `${draft.title} · Schengen ${draft.country}` : 'Анкета подачи';
  const canSubmit = readiness.empties === 0;
  const nextAction = submission?.issues.find((issue) => issue.status === 'open')?.comment ?? draft?.nextAction ?? 'Подтвердить поля анкеты и отправить пакет на проверку.';
  const contextEmployer = applicantFieldValue(activeApplicant, ['employer', 'работодатель', 'occupation', 'професс'], 'Работа не указана');
  const contextEmail = applicantFieldValue(activeApplicant, ['email', 'почт'], 'Email не указан');
  const contextPhone = applicantFieldValue(activeApplicant, ['phone', 'телефон'], 'Телефон не указан');
  const readinessCard = (
    <div className="p-4 rounded-2xl border border-[#242529] bg-gradient-to-br from-[#1a1a1d] to-[#141416]">
      <div className="flex items-center gap-2 text-[11px] text-white/40 uppercase tracking-wider font-medium mb-3">
        <Sparkles className="w-3.5 h-3.5 text-[#b8baff]" /> AI readiness
      </div>
      <div className="flex items-end justify-between mb-2">
        <motion.div key={readiness.percent} initial={{ opacity: 0.6, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-[26px] md:text-3xl font-semibold text-white">
          {readiness.percent}%
        </motion.div>
        <div className="text-[12px] text-white/62 font-medium">{readiness.risks} риска</div>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <motion.div initial={false} animate={{ width: `${readiness.percent}%` }} transition={{ duration: 0.32 }} className="h-full bg-[#6f64ff] rounded-full" />
      </div>
      <p className="text-[12px] text-white/45 leading-relaxed mt-3">
        {readiness.risks > 0 ? 'Подтвердите предупреждения и заполните пустые поля перед отправкой.' : 'Все обязательные поля подтверждены. Пакет готов к проверке.'}
      </p>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.992 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.992 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-50 bg-[#101011] text-white flex flex-col overflow-hidden"
    >
      <header className="h-[52px] md:h-[64px] shrink-0 border-b border-[#202124] bg-[#141416]/95 backdrop-blur-md flex items-center px-3 md:px-4 lg:px-6 gap-3 md:gap-4">
        <button
          onClick={onBack}
          aria-label="Назад"
          className="w-10 h-10 rounded-xl border border-transparent bg-transparent hover:bg-white/[0.04] md:bg-[#1e1e21] md:hover:bg-[#27272b] md:border-[#242529] flex items-center justify-center text-white/70 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="hidden md:block min-w-0">
          <h1 className="text-[18px] font-semibold tracking-tight text-white leading-tight truncate">
            {title}
          </h1>
        </div>
        <div className="ml-auto hidden md:flex items-center gap-2">
          {savedAt && <span className="text-[11px] font-medium text-white/42">Сохранено {savedAt}</span>}
          {sentForReview && <span className="text-[12px] text-[#b8baff]">Отправлено на проверку</span>}
          <button onClick={handleSave} className="h-10 px-4 rounded-[8px] bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] text-[13px] font-medium text-white/80 flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]">
            <Save className="w-4 h-4" /> Сохранить
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || sentForReview}
            className="h-10 px-4 rounded-[8px] bg-[#6f64ff] hover:bg-[#4855d4] disabled:bg-white/10 disabled:text-white/35 disabled:cursor-not-allowed text-[13px] font-medium text-white flex items-center gap-2 shadow-[0_0_20px_rgba(58,69,180,0.25)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Send className="w-4 h-4" /> {sentForReview ? 'На проверке' : canSubmit ? 'Отправить на проверку' : 'Заполнить пустые поля'}
          </button>
        </div>
      </header>

      <main className="flex flex-1 min-h-0 flex-col overflow-hidden bg-[#101011]">
        <div className="shrink-0 border-b border-[#202124] bg-[#141416] p-3 md:p-4 lg:p-5">
          <div className="mx-auto flex max-w-[1480px] flex-col gap-3">
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  value={fieldQuery}
                  onChange={(event) => setFieldQuery(event.currentTarget.value)}
                  placeholder="Найти поле..."
                  className="h-10 w-full rounded-xl border border-[#242529] bg-[#1e1e21] pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#6f64ff] focus:ring-1 focus:ring-[#3a45b4]/30"
                />
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-white/10">
              {(applicants.length ? applicants : activeApplicant ? [activeApplicant] : []).map((applicant) => {
                const selected = applicant.id === activeApplicantId;
                return (
                  <button
                    key={applicant.id}
                    onClick={() => setActiveApplicantId(applicant.id)}
                    className={`min-w-[210px] rounded-xl border px-3 py-2 text-left transition-colors ${selected ? 'border-[#6f64ff]/40 bg-[#6f64ff]/12' : 'border-[#242529] bg-[#161617] hover:border-[#2e2f34]'}`}
                  >
                    <div className="truncate text-[13px] font-semibold text-white">{applicant.fullName}</div>
                    <div className="mt-0.5 text-[11px] text-white/42">
                      {'confidence' in applicant ? `${Math.round(applicant.confidence * 100)}% · ` : ''}
                      {applicantRoleLabel(applicant.role)}
                    </div>
                  </button>
                );
              })}
            </div>

            <nav className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-white/10">
              {visibleSections.map((section) => {
                const Icon = section.icon;
                const meta = statusMeta[section.status];
                const selected = section.id === activeSection;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`min-w-[190px] rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${selected ? 'border-[#6f64ff]/45 bg-[#202024]' : 'border-[#242529] bg-[#161617] hover:border-[#2e2f34]'}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${meta.className}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[12px] font-semibold text-white">{section.title}</span>
                          <span className="shrink-0 text-[10px] font-mono text-white/45">{section.progressLabel}</span>
                        </div>
                        <div className="mt-1 text-[10.5px] text-white/38">{section.stepLabel ?? 'Раздел'}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        <section className="min-h-0 min-w-0 flex flex-col bg-[#101011] overflow-visible lg:overflow-hidden">
          <div className="hidden md:block p-4 lg:p-6 border-b border-[#202124] bg-[#141416]">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,1fr)] lg:items-stretch">
              <div className="min-w-0 rounded-2xl border border-[#242529] bg-[#161617] p-4">
                <div className="flex items-center gap-2 text-[12px] font-medium text-white/45 uppercase tracking-wider mb-2">
                  <span className={`w-2 h-2 rounded-full ${statusMeta[active.status].dot}`} />
                  {statusMeta[active.status].label}
                </div>
                <h2 className="text-[24px] lg:text-[30px] font-semibold tracking-tight text-white leading-tight">{active.title}</h2>
                <p className="text-[13px] text-white/50 mt-2 max-w-2xl leading-relaxed">{active.description}</p>
              </div>
              <div className="hidden lg:block min-w-0">
                {readinessCard}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 lg:p-6 scrollbar-thin scrollbar-thumb-white/10">
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {visibleFields.map((fieldItem, index) => {
                  const isLongField = fieldItem.span === 'full' || /адрес|данные|сведения|примечание|заведение|комментар/i.test(fieldItem.label);
                  return (
                    <motion.div
                      layout
                      key={fieldItem.key}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className={`p-4 rounded-2xl border bg-[#161617] transition-colors ${fieldItem.span === 'full' || isLongField ? 'md:col-span-2' : ''} ${fieldItem.state === 'warning' ? 'border-white/10 bg-white/[0.035]' : 'border-[#242529] hover:border-[#2e2f34]'}`}
                    >
                      <div className="flex flex-col gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <FieldStateIcon state={fieldItem.state} />
                            <span className="text-[12px] text-white/65 uppercase tracking-wider font-medium">{fieldItem.label}</span>
                            {fieldItem.confidence !== undefined && (
                              <span className="rounded-full border border-white/10 bg-white/[0.035] px-1.5 py-0.5 text-[10px] text-[#b8baff]">{Math.round(fieldItem.confidence * 100)}%</span>
                            )}
                          </div>
                          {fieldItem.control === 'select' && fieldItem.options?.length ? (
                            <select
                              value={fieldItem.value}
                              onChange={(event) => handleFieldValueChange(active.id, fieldItem.key, event.currentTarget.value)}
                              className="mt-2 h-11 w-full rounded-xl border border-[#2e2f34] bg-[#141416] px-3 text-[14px] font-medium text-white outline-none focus:border-[#6f64ff]/60 focus:ring-2 focus:ring-[#3a45b4]/35"
                            >
                              <option value="">{fieldItem.placeholder ?? 'Выберите значение'}</option>
                              {fieldItem.options.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          ) : isLongField ? (
                            <textarea
                              value={fieldItem.value}
                              onChange={(event) => handleFieldValueChange(active.id, fieldItem.key, event.currentTarget.value)}
                              placeholder={fieldItem.placeholder ?? fieldItem.label}
                              rows={3}
                              className="mt-2 w-full resize-y rounded-xl border border-[#2e2f34] bg-[#141416] px-3 py-2.5 text-[14px] font-medium text-white outline-none placeholder:text-white/35 focus:border-[#6f64ff]/60 focus:ring-2 focus:ring-[#3a45b4]/35"
                            />
                          ) : (
                            <input
                              value={fieldItem.value}
                              onChange={(event) => handleFieldValueChange(active.id, fieldItem.key, event.currentTarget.value)}
                              placeholder={fieldItem.placeholder ?? fieldItem.label}
                              className="mt-2 h-11 w-full rounded-xl border border-[#2e2f34] bg-[#141416] px-3 text-[14px] font-medium text-white outline-none placeholder:text-white/35 focus:border-[#6f64ff]/60 focus:ring-2 focus:ring-[#3a45b4]/35"
                            />
                          )}
                          {fieldItem.source && <div className="mt-1 text-[11px] text-white/50 truncate">Источник: {fieldItem.source}</div>}
                        </div>
                        <button
                          onClick={() => handleConfirmField(active.id, fieldItem.key)}
                          disabled={!fieldItem.value.trim() || fieldItem.state === 'ok'}
                          className="self-start h-9 px-3 rounded-[8px] bg-white/[0.045] hover:bg-[#202126]/15 border border-white/10 text-[12px] font-medium text-[#b8baff] disabled:text-white/30 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
                        >
                          Подтвердить
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <aside className="space-y-4">
                <div className="p-5 rounded-2xl bg-[#161617] border border-[#242529]">
                  <h3 className="text-[13px] font-semibold text-white mb-3">Контекст заявителя</h3>
                  <div className="space-y-3 text-[13px]">
                    <div className="flex items-center gap-3 text-white/70"><User className="w-4 h-4 text-white/35" /> {activeApplicant?.fullName ?? 'Заявитель'}, {applicantRoleLabel(activeApplicant?.role)}</div>
                    <div className="flex items-center gap-3 text-white/70"><Building2 className="w-4 h-4 text-white/35" /> {contextEmployer}</div>
                    <div className="flex items-center gap-3 text-white/70"><Mail className="w-4 h-4 text-white/35" /> {contextEmail}</div>
                    <div className="flex items-center gap-3 text-white/70"><Phone className="w-4 h-4 text-white/35" /> {contextPhone}</div>
                  </div>
                </div>

                {(draft || submission) && (
                  <div className="p-5 rounded-2xl bg-[#161617] border border-[#242529]">
                    <h3 className="text-[13px] font-semibold text-white mb-3">{draft ? 'Источник prefill' : 'Файлы подачи'}</h3>
                    <div className="space-y-2">
                      {(draft?.files.filter((file) => ['recognized', 'needs_review'].includes(file.status)) ?? submission?.files ?? []).slice(0, 5).map((file) => (
                        <div key={file.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2">
                          <span className="min-w-0 truncate text-[12px] text-white/65">{'name' in file ? file.name : (file.originalFileName ?? file.generatedFileName ?? file.type)}</span>
                          <span className="shrink-0 text-[10px] text-white/35">{'extractedFieldKeys' in file ? `${file.extractedFieldKeys.length} fields` : file.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-5 rounded-2xl bg-gradient-to-br from-[#1a1a1d] to-[#141416] border border-[#242529]">
                  <h3 className="text-[13px] font-semibold text-white mb-2">Следующее лучшее действие</h3>
                  <p className="text-[12px] text-white/50 leading-relaxed mb-4">
                    {readiness.warnings > 0 ? 'Подтвердить поля с предупреждениями: банк, работа или биометрия.' : readiness.empties > 0 ? 'Заполнить пустые обязательные значения перед отправкой.' : nextAction}
                  </p>
                  <button
                    onClick={() => {
                      const nextWarning = sections.flatMap((section) => section.fields.map((item) => ({ sectionId: section.id, item }))).find(({ item }) => item.state === 'warning');
                      if (nextWarning) {
                        setActiveSection(nextWarning.sectionId);
                        handleConfirmField(nextWarning.sectionId, nextWarning.item.key);
                      }
                    }}
                    className="w-full h-10 rounded-xl bg-[#6f64ff] hover:bg-[#4855d4] text-[13px] font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    {readiness.warnings > 0 ? 'Подтвердить следующий риск' : 'Создать запрос клиенту'}
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>
    </motion.div>
  );
}
