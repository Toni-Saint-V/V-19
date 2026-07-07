import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { emitVisaflowUiEvent, useVisaflowBusinessBridge } from '../integration/visaflowBusinessBridge';
import { motion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileText,
  History,
  Mail,
  MapPin,
  Phone,
  Plane,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { type ProductFileKind, type ProductIntakeDraft } from '../modules/submissions/productIntakeFlow';

interface QuestionnaireScreenProps {
  submissionId: string;
  onBack: () => void;
  draft?: ProductIntakeDraft;
  onSaveDraft?: (submissionId: string) => void | Promise<void>;
  onSubmitForReview?: (submissionId: string) => void | Promise<void>;
}

type SectionStatus = 'complete' | 'active' | 'attention' | 'locked';
type FieldState = 'ok' | 'warning' | 'empty';

interface QuestionnaireField {
  key: string;
  label: string;
  value: string;
  state: FieldState;
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
): QuestionnaireField {
  return { key, label, value, state, source, confidence };
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

function stateFromSource(draft: ProductIntakeDraft, kind: ProductFileKind, value: string): FieldState {
  if (!value.trim()) return 'empty';
  const file = draft.files.find((item) => item.kind === kind && ['recognized', 'needs_review', 'failed'].includes(item.status));
  if (!file) return 'warning';
  return file.status === 'needs_review' ? 'warning' : file.status === 'failed' ? 'empty' : 'ok';
}

function buildFallbackSections(): QuestionnaireSection[] {
  return [
    recalcSection({
      id: 'personal',
      title: 'Личные данные',
      description: 'ФИО, дата рождения, контакты и базовая идентификация.',
      icon: User,
      fields: [
        field('surname', 'Фамилия', 'PETROV'),
        field('firstName', 'Имя', 'IVAN'),
        field('phone', 'Телефон', '+7 921 000-41-12'),
        field('email', 'Email', 'ivan.petrov@example.com'),
      ],
    }),
    recalcSection({
      id: 'passport',
      title: 'Паспорт',
      description: 'Загранпаспорт, внутренний паспорт и машинная сверка OCR.',
      icon: FileText,
      fields: [
        field('passportNo', 'Номер загранпаспорта', '75 1234567'),
        field('passportIssuedAt', 'Дата выдачи', '15.06.2020'),
        field('birthPlace', 'Место рождения', 'MOSCOW', 'warning'),
        field('passportExpiresAt', 'Срок действия', '15.06.2030'),
      ],
    }),
    recalcSection({
      id: 'work',
      title: 'Работа / учёба',
      description: 'Должность, работодатель, адрес и подтверждающие документы.',
      icon: Briefcase,
      fields: [
        field('employerName', 'Работодатель', 'ООО «Северный маршрут»'),
        field('occupation', 'Должность', 'Руководитель проекта'),
        field('employerAddress', 'Адрес работодателя', 'Нужно уточнить индекс', 'warning'),
        field('employerPhone', 'Телефон работодателя', '', 'empty'),
      ],
    }),
    recalcSection({
      id: 'finance',
      title: 'Финансы',
      description: 'Выписки, спонсорство, доход и подтверждение средств.',
      icon: CreditCard,
      fields: [
        field('financeType', 'Тип финансирования', 'Собственные средства'),
        field('bankStatement', 'Выписка банка', 'Загружена, OCR обрабатывает', 'warning'),
        field('bankBalance', 'Сумма на счёте', '', 'empty'),
        field('sponsor', 'Спонсор', 'Не требуется'),
      ],
    }),
    recalcSection({
      id: 'trip',
      title: 'Поездка',
      description: 'Маршрут, даты, бронирования, цель поездки.',
      icon: Plane,
      fields: [
        field('country', 'Страна', 'Франция / Шенген'),
        field('tripDates', 'Даты поездки', '18 авг – 02 сен 2026'),
        field('hotelName', 'Отель', 'Mercure Paris Centre'),
        field('purpose', 'Цель поездки', 'Туризм'),
      ],
    }),
    recalcSection({
      id: 'history',
      title: 'Визовая история',
      description: 'Предыдущие визы, отказы, биометрия.',
      icon: History,
      fields: [
        field('biometrics', 'Биометрия', 'Сдана 18.09.2023'),
        field('previousVisas', 'Предыдущие визы', 'Schengen C, 2023–2025'),
        field('refusals', 'Отказы', 'Нет'),
        field('historyNote', 'Доп. комментарии', 'Не требуется'),
      ],
    }),
  ];
}

function buildSectionsFromDraft(draft: ProductIntakeDraft, applicantId?: string): QuestionnaireSection[] {
  const applicant = draft.applicants.find((item) => item.id === applicantId) ?? draft.applicants[0];
  if (!applicant) return buildFallbackSections();

  const passportSource = sourceName(draft, 'passport');
  const bankSource = sourceName(draft, 'bank');
  const bookingSource = sourceName(draft, 'booking');
  const photoSource = sourceName(draft, 'photo');
  const employmentSource = sourceName(draft, 'employment') ?? 'Профиль клиента';
  const data = applicant.fields;

  return [
    recalcSection({
      id: 'personal',
      title: 'Личные данные',
      description: 'ФИО, дата рождения, контакты и базовая идентификация из паспорта и профиля.',
      icon: User,
      fields: [
        field('surname', 'Фамилия', data.surname, stateFromSource(draft, 'passport', data.surname), passportSource, 0.98),
        field('firstName', 'Имя', data.firstName, stateFromSource(draft, 'passport', data.firstName), passportSource, 0.98),
        field('birthDate', 'Дата рождения', data.birthDate, stateFromSource(draft, 'passport', data.birthDate), passportSource, 0.96),
        field('birthPlace', 'Место рождения', data.birthPlace, stateFromSource(draft, 'passport', data.birthPlace), passportSource, 0.9),
        field('nationality', 'Гражданство', data.nationality, stateFromSource(draft, 'passport', data.nationality), passportSource, 0.94),
        field('gender', 'Пол', data.gender, stateFromSource(draft, 'passport', data.gender), passportSource, 0.91),
        field('phone', 'Телефон', data.phone, 'ok', 'Профиль клиента', 0.88),
        field('email', 'Email', data.email, 'ok', 'Профиль клиента', 0.88),
      ],
    }),
    recalcSection({
      id: 'passport',
      title: 'Паспорт',
      description: 'Паспортные поля, извлечённые с OCR/MRZ и подготовленные для BLS формы.',
      icon: FileText,
      fields: [
        field('passportType', 'Тип документа', data.passportType, stateFromSource(draft, 'passport', data.passportType), passportSource, 0.92),
        field('passportNo', 'Номер загранпаспорта', data.passportNo, stateFromSource(draft, 'passport', data.passportNo), passportSource, 0.97),
        field('passportIssuedAt', 'Дата выдачи', data.passportIssuedAt, stateFromSource(draft, 'passport', data.passportIssuedAt), passportSource, 0.95),
        field('passportExpiresAt', 'Срок действия', data.passportExpiresAt, stateFromSource(draft, 'passport', data.passportExpiresAt), passportSource, 0.96),
        field('passportIssueCountry', 'Страна выдачи', data.passportIssueCountry, stateFromSource(draft, 'passport', data.passportIssueCountry), passportSource, 0.92),
        field('passportIssuePlace', 'Место выдачи', data.passportIssuePlace, stateFromSource(draft, 'passport', data.passportIssuePlace), passportSource, 0.87),
      ],
    }),
    recalcSection({
      id: 'work',
      title: 'Работа / учёба',
      description: 'Занятость, работодатель, адрес и контактная информация.',
      icon: Briefcase,
      fields: [
        field('occupation', 'Профессия', data.occupation, stateFromSource(draft, 'employment', data.occupation), employmentSource, 0.84),
        field('employerName', 'Работодатель / учебное заведение', data.employerName, stateFromSource(draft, 'employment', data.employerName), employmentSource, 0.84),
        field('employerAddress', 'Адрес работодателя', data.employerAddress, stateFromSource(draft, 'employment', data.employerAddress), employmentSource, 0.78),
        field('employerPhone', 'Телефон работодателя', data.employerPhone, stateFromSource(draft, 'employment', data.employerPhone), employmentSource, 0.74),
      ],
    }),
    recalcSection({
      id: 'finance',
      title: 'Финансы',
      description: 'Оплата поездки, баланс и финансовое обеспечение.',
      icon: CreditCard,
      fields: [
        field('financeType', 'Тип финансирования', data.financeType, stateFromSource(draft, 'bank', data.financeType), bankSource, 0.82),
        field('bankBalance', 'Сумма на счёте', data.bankBalance, stateFromSource(draft, 'bank', data.bankBalance), bankSource, 0.76),
        field('bankStatement', 'Выписка банка', bankSource ? 'Загружена и связана' : '', bankSource ? stateFromSource(draft, 'bank', bankSource) : 'empty', bankSource, 0.76),
        field('sponsor', 'Спонсор', data.financeType === 'Собственные средства' ? 'Не требуется' : data.financeType, 'ok', 'Правило пакета', 0.9),
      ],
    }),
    recalcSection({
      id: 'trip',
      title: 'Поездка',
      description: 'Маршрут, страна первого въезда, отель, даты и цель поездки.',
      icon: Plane,
      fields: [
        field('mainDestination', 'Основная страна назначения', data.mainDestination, stateFromSource(draft, 'booking', data.mainDestination), bookingSource, 0.94),
        field('firstEntryCountry', 'Страна первого въезда', data.firstEntryCountry, stateFromSource(draft, 'booking', data.firstEntryCountry), bookingSource, 0.92),
        field('tripDates', 'Даты поездки', data.tripDates, stateFromSource(draft, 'booking', data.tripDates), bookingSource, 0.94),
        field('hotelName', 'Отель', data.hotelName, stateFromSource(draft, 'booking', data.hotelName), bookingSource, 0.92),
        field('hotelAddress', 'Адрес проживания', data.hotelAddress, stateFromSource(draft, 'booking', data.hotelAddress), bookingSource, 0.88),
        field('purpose', 'Цель поездки', data.purpose, stateFromSource(draft, 'booking', data.purpose), bookingSource, 0.86),
        field('entryCount', 'Количество въездов', data.entryCount, 'ok', 'Правило подачи', 0.88),
      ],
    }),
    recalcSection({
      id: 'history',
      title: 'Визовая история',
      description: 'Предыдущие визы, отказы и биометрия.',
      icon: History,
      fields: [
        field('biometrics', 'Биометрия', data.biometrics, data.biometrics.includes('Не найдена') ? 'warning' : stateFromSource(draft, 'photo', data.biometrics), photoSource, 0.82),
        field('previousVisas', 'Предыдущие визы', data.previousVisas, 'ok', 'Профиль клиента', 0.8),
        field('refusals', 'Отказы', data.refusals, 'ok', 'Анкета клиента', 0.86),
        field('historyNote', 'Доп. комментарии', 'Не требуется', 'ok', 'Правило пакета', 0.9),
      ],
    }),
  ];
}

function ProgressBar({ progress, status }: { progress: number; status: SectionStatus }) {
  const colorClass = status === 'complete' ? 'bg-[#202126]' : status === 'attention' ? 'bg-[#24242a]' : 'bg-[#6f64ff]';

  return (
    <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
      <motion.div
        initial={false}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className={`h-full rounded-full ${colorClass}`}
      />
    </div>
  );
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

export function QuestionnaireScreen({ submissionId, onBack, draft, onSaveDraft, onSubmitForReview }: QuestionnaireScreenProps) {
  const bridge = useVisaflowBusinessBridge();
  const [activeApplicantId, setActiveApplicantId] = useState(() => draft?.applicants[0]?.id);
  const [sections, setSections] = useState<QuestionnaireSection[]>(() =>
    draft ? buildSectionsFromDraft(draft, activeApplicantId) : buildFallbackSections(),
  );
  const [activeSection, setActiveSection] = useState(() => initialSectionId(sections));
  const [fieldQuery, setFieldQuery] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [sentForReview, setSentForReview] = useState(false);

  useEffect(() => {
    const nextApplicantId = draft?.applicants[0]?.id;
    setActiveApplicantId(nextApplicantId);
  }, [draft?.id]);

  useEffect(() => {
    const nextSections = draft ? buildSectionsFromDraft(draft, activeApplicantId) : buildFallbackSections();
    setSections(nextSections);
    setActiveSection(initialSectionId(nextSections));
    setEditingField(null);
    setSentForReview(false);
  }, [activeApplicantId, draft?.id]);

  const active = sections.find((section) => section.id === activeSection) ?? sections[0];
  const readiness = useMemo(() => computeReadiness(sections), [sections]);
  const activeApplicant = draft?.applicants.find((item) => item.id === activeApplicantId) ?? draft?.applicants[0];
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

  const title = draft ? `${draft.title} · Schengen ${draft.country}` : 'Семья Петровых · Schengen France';
  const city = draft?.city ?? 'Москва';
  const riskLabel = readiness.risks === 0 ? 'Низкий' : readiness.risks <= 2 ? 'Средний' : 'Высокий';
  const canSubmit = readiness.empties === 0;
  const nextAction = draft?.nextAction ?? 'Запросить у клиента обновлённую банковскую выписку и подтвердить место рождения по паспорту.';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.992 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.992 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-50 bg-[#101011] text-white flex flex-col overflow-hidden"
    >
      <header className="h-[64px] shrink-0 border-b border-[#202124] bg-[#141416]/95 backdrop-blur-md flex items-center px-4 lg:px-6 gap-4">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-xl bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] flex items-center justify-center text-white/70 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-white/40 uppercase tracking-wider">
            <span className="font-mono text-white/60">{submissionId}</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>{draft ? 'prefilled questionnaire' : 'Редактирование анкеты'}</span>
          </div>
          <h1 className="text-[18px] lg:text-[21px] font-semibold tracking-tight text-white leading-tight truncate">
            {title}
          </h1>
        </div>
        <div className="ml-auto hidden md:flex items-center gap-2">
          {savedAt && <span className="text-[12px] text-white/42">Сохранено {savedAt}</span>}
          {sentForReview && <span className="text-[12px] text-[#b8baff]">Отправлено на проверку</span>}
          <button onClick={handleSave} className="h-10 px-4 rounded-xl bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] text-[13px] font-medium text-white/80 flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]">
            <Save className="w-4 h-4" /> Сохранить
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || sentForReview}
            className="h-10 px-4 rounded-xl bg-[#6f64ff] hover:bg-[#4855d4] disabled:bg-white/10 disabled:text-white/35 disabled:cursor-not-allowed text-[13px] font-medium text-white flex items-center gap-2 shadow-[0_0_20px_rgba(58,69,180,0.25)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Send className="w-4 h-4" /> {sentForReview ? 'На проверке' : canSubmit ? 'Отправить на проверку' : 'Заполнить пустые поля'}
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] overflow-hidden">
        <aside className="border-r border-[#202124] bg-[#141416] p-4 lg:p-5 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
          <div className="mb-5 p-4 rounded-2xl border border-[#242529] bg-gradient-to-br from-[#1a1a1d] to-[#141416]">
            <div className="flex items-center gap-2 text-[11px] text-white/40 uppercase tracking-wider font-medium mb-3">
              <Sparkles className="w-3.5 h-3.5 text-[#b8baff]" /> AI readiness
            </div>
            <div className="flex items-end justify-between mb-2">
              <motion.div key={readiness.percent} initial={{ opacity: 0.6, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-semibold text-white">
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

          {draft && (
            <div className="mb-5 p-3 rounded-2xl border border-[#242529] bg-[#161617]">
              <div className="text-[11px] text-white/40 uppercase tracking-wider font-medium mb-2">Заявители</div>
              <div className="space-y-1.5">
                {draft.applicants.map((applicant) => {
                  const selected = applicant.id === activeApplicantId;
                  return (
                    <button
                      key={applicant.id}
                      onClick={() => setActiveApplicantId(applicant.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${selected ? 'border-[#6f64ff]/35 bg-[#6f64ff]/10' : 'border-white/5 bg-white/[0.025] hover:bg-white/[0.045]'}`}
                    >
                      <div className="text-[12px] font-medium text-white truncate">{applicant.fullName}</div>
                      <div className="text-[10.5px] text-white/38 mt-0.5">{Math.round(applicant.confidence * 100)}% confidence · {applicant.role}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              value={fieldQuery}
              onChange={(event) => setFieldQuery(event.currentTarget.value)}
              placeholder="Найти поле..."
              className="w-full h-10 bg-[#1e1e21] border border-[#242529] rounded-xl pl-9 pr-3 text-sm text-white placeholder-white/35 outline-none focus:border-[#6f64ff] focus:ring-1 focus:ring-[#3a45b4]/30"
            />
          </div>

          <nav className="space-y-2">
            {visibleSections.map((section) => {
              const Icon = section.icon;
              const meta = statusMeta[section.status];
              const selected = section.id === activeSection;
              return (
                <motion.button
                  layout
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full p-3 rounded-2xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${selected ? 'bg-[#202024] border-[#6f64ff]/40' : 'bg-[#161617] border-[#242529] hover:border-[#2e2f34]'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${meta.className}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-white truncate">{section.title}</span>
                        <span className="text-[11px] font-mono text-white/50">{section.progressLabel}</span>
                      </div>
                      <div className="mt-2">
                        <ProgressBar progress={section.progress} status={section.status} />
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/30" />
                  </div>
                </motion.button>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 flex flex-col bg-[#101011] overflow-hidden">
          <div className="p-4 lg:p-6 border-b border-[#202124] bg-[#141416]">
            <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[12px] font-medium text-white/45 uppercase tracking-wider mb-2">
                  <span className={`w-2 h-2 rounded-full ${statusMeta[active.status].dot}`} />
                  {statusMeta[active.status].label}
                </div>
                <h2 className="text-[24px] lg:text-[30px] font-semibold tracking-tight text-white leading-tight">{active.title}</h2>
                <p className="text-[13px] text-white/50 mt-2 max-w-2xl leading-relaxed">{active.description}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 w-full xl:w-auto">
                <div className="p-3 rounded-xl bg-[#161617] border border-[#242529]">
                  <Calendar className="w-4 h-4 text-white/40 mb-2" />
                  <div className="text-[11px] text-white/40">Срок</div>
                  <div className="text-[13px] font-medium text-white">24 часа</div>
                </div>
                <div className="p-3 rounded-xl bg-[#161617] border border-[#242529]">
                  <MapPin className="w-4 h-4 text-white/40 mb-2" />
                  <div className="text-[11px] text-white/40">Подача</div>
                  <div className="text-[13px] font-medium text-white">{city}</div>
                </div>
                <div className="p-3 rounded-xl bg-[#161617] border border-[#242529]">
                  <ShieldCheck className="w-4 h-4 text-[#b8baff] mb-2" />
                  <div className="text-[11px] text-white/40">Риск</div>
                  <div className="text-[13px] font-medium text-white">{riskLabel}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 lg:p-6 scrollbar-thin scrollbar-thumb-white/10">
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5">
              <div className="space-y-3">
                {visibleFields.map((fieldItem, index) => {
                  const editKey = `${active.id}:${fieldItem.key}`;
                  const editing = editingField === editKey;
                  return (
                    <motion.div
                      layout
                      key={fieldItem.key}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className={`p-4 rounded-2xl border bg-[#161617] transition-colors ${fieldItem.state === 'warning' ? 'border-white/10 bg-white/[0.035]' : 'border-[#242529] hover:border-[#2e2f34]'}`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <FieldStateIcon state={fieldItem.state} />
                            <span className="text-[11px] text-white/40 uppercase tracking-wider font-medium">{fieldItem.label}</span>
                            {fieldItem.confidence !== undefined && (
                              <span className="rounded-full border border-white/10 bg-white/[0.035] px-1.5 py-0.5 text-[10px] text-[#b8baff]">{Math.round(fieldItem.confidence * 100)}%</span>
                            )}
                          </div>
                          {editing ? (
                            <input
                              autoFocus
                              value={fieldItem.value}
                              onChange={(event) => handleFieldValueChange(active.id, fieldItem.key, event.currentTarget.value)}
                              onBlur={() => setEditingField(null)}
                              onKeyDown={(event) => { if (event.key === 'Enter') setEditingField(null); }}
                              className="w-full h-10 rounded-xl border border-[#6f64ff]/35 bg-[#101011] px-3 text-[14px] font-medium text-white outline-none focus:ring-2 focus:ring-[#3a45b4]/40"
                            />
                          ) : (
                            <div className="text-[15px] font-medium text-white truncate">{fieldItem.value || 'Не заполнено'}</div>
                          )}
                          {fieldItem.source && <div className="mt-1 text-[11px] text-white/35 truncate">Источник: {fieldItem.source}</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEditingField(editKey)} className="h-9 px-3 rounded-lg bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] text-[12px] font-medium text-white/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]">Изменить</button>
                          <button
                            onClick={() => handleConfirmField(active.id, fieldItem.key)}
                            disabled={!fieldItem.value.trim() || fieldItem.state === 'ok'}
                            className="h-9 px-3 rounded-lg bg-white/[0.045] hover:bg-[#202126]/15 border border-white/10 text-[12px] font-medium text-[#b8baff] disabled:text-white/30 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
                          >
                            Подтвердить
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <aside className="space-y-4">
                <div className="p-5 rounded-2xl bg-[#161617] border border-[#242529]">
                  <h3 className="text-[13px] font-semibold text-white mb-3">Контекст заявителя</h3>
                  <div className="space-y-3 text-[13px]">
                    <div className="flex items-center gap-3 text-white/70"><User className="w-4 h-4 text-white/35" /> {activeApplicant?.fullName ?? 'Иван Петров'}, {activeApplicant?.role === 'main' ? 'основной' : activeApplicant?.role ?? 'основной'}</div>
                    <div className="flex items-center gap-3 text-white/70"><Building2 className="w-4 h-4 text-white/35" /> {activeApplicant?.fields.employerName ?? 'ООО «Северный маршрут»'}</div>
                    <div className="flex items-center gap-3 text-white/70"><Mail className="w-4 h-4 text-white/35" /> {activeApplicant?.fields.email ?? 'ivan.petrov@example.com'}</div>
                    <div className="flex items-center gap-3 text-white/70"><Phone className="w-4 h-4 text-white/35" /> {activeApplicant?.fields.phone ?? '+7 921 000-41-12'}</div>
                  </div>
                </div>

                {draft && (
                  <div className="p-5 rounded-2xl bg-[#161617] border border-[#242529]">
                    <h3 className="text-[13px] font-semibold text-white mb-3">Источник prefill</h3>
                    <div className="space-y-2">
                      {draft.files.filter((file) => ['recognized', 'needs_review'].includes(file.status)).slice(0, 5).map((file) => (
                        <div key={file.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2">
                          <span className="min-w-0 truncate text-[12px] text-white/65">{file.name}</span>
                          <span className="shrink-0 text-[10px] text-white/35">{file.extractedFieldKeys.length} fields</span>
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
