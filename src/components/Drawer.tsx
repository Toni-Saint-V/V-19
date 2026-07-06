import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  BadgeCheck,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  CreditCard,
  Download,
  Edit3,
  FileDigit,
  FileText,
  FileWarning,
  History,
  ListChecks,
  MapPin,
  Plane,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  User,
  Users,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react';

// --- Public contract ---
export type SubmissionStatus =
  | 'draft'
  | 'in_progress'
  | 'submitted_for_review'
  | 'returned'
  | 'corrections_received'
  | 'ready_for_export'
  | 'exported';

export type DrawerTabId = 'overview' | 'questionnaire' | 'documents' | 'issues' | 'history';
export type AgentDrawerTab = DrawerTabId | 'files' | 'applicants';

type ApplicantStatus = 'ready' | 'in_progress' | 'needs_fix' | 'missing_docs' | 'review';
type DocumentStatus = 'accepted' | 'uploaded' | 'processing' | 'missing' | 'needs_replacement';
type DocumentCategory = 'identity' | 'photo' | 'finance' | 'travel' | 'employment' | 'family' | 'other';
type IssueSeverity = 'blocking' | 'warning' | 'note';
type IssueStatus = 'open' | 'fixed' | 'closed';
type IssueAction = 'questionnaire' | 'upload' | 'review' | 'confirm';
type HistoryTone = 'success' | 'warning' | 'info' | 'neutral';
type DrawerState = 'idle' | 'loading' | 'success' | 'error';

export interface DrawerApplicant {
  id: string;
  name: string;
  role: string;
  status: ApplicantStatus;
  completeness: number;
  formProgress: number;
  mediaProgress: number;
  blockers: number;
  nextStep: string;
}

export interface DrawerDocument {
  id: string;
  label: string;
  category: DocumentCategory;
  applicant: string;
  status: DocumentStatus;
  required: boolean;
  ocrConfidence?: number;
  updatedAt?: string;
  note?: string;
}

export interface DrawerQuestionnaireSection {
  id: string;
  title: string;
  icon: LucideIcon;
  owner: string;
  progress: number;
  completedFields: number;
  totalFields: number;
  missingFields: string[];
  risk?: string;
}

export interface DrawerIssue {
  id: string;
  title: string;
  target: string;
  description: string;
  severity: IssueSeverity;
  status: IssueStatus;
  action: IssueAction;
  actionText: string;
  source: 'admin' | 'ocr' | 'rules' | 'agent';
  createdAt: string;
}

export interface DrawerHistoryEvent {
  id: string;
  title: string;
  description: string;
  time: string;
  user: string;
  tone: HistoryTone;
}

export interface SubmissionDetail {
  id: string;
  title: string;
  type: 'single' | 'family';
  applicantsCount: number;
  applicants: DrawerApplicant[];
  city: string;
  country: string;
  visaType: string;
  tripDates: string;
  status: SubmissionStatus;
  completeness: number;
  updated: string;
  owner: string;
  priority: 'Высокий' | 'Средний' | 'Низкий';
  nextDeadline: string;
  riskScore: number;
  documents: DrawerDocument[];
  questionnaire: DrawerQuestionnaireSection[];
  issues: DrawerIssue[];
  history: DrawerHistoryEvent[];
}

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  submissionId: string | null;
  initialTab?: AgentDrawerTab;
  onOpenQuestionnaire?: () => void;
  onOpenUpload?: () => void;
  onSubmissionUpdate?: (submission: Pick<SubmissionDetail, 'id' | 'status' | 'completeness' | 'updated'>) => void;
}

function normalizeDrawerTab(tab: AgentDrawerTab): DrawerTabId {
  if (tab === 'files') return 'documents';
  if (tab === 'applicants') return 'overview';
  return tab;
}

// --- Data model / resolver -------------------------------------------------
// Временный in-memory resolver закрывает все агентские входы: список действий,
// сбор документов, заявители, медиа и замечания. При подключении API этот слой
// можно заменить одним вызовом repository/service без переписывания UI drawer.
const aliasMap: Record<string, string> = {
  'FAM-001': 'SUB-1042',
  'FAM-002': 'SUB-1061',
  'IND-001': 'SUB-1057',
  'IND-002': 'SUB-1078',
};

const profileLabelMap: Record<string, string> = {
  'FAM-001': 'Профиль семьи · связан с SUB-1042',
  'FAM-002': 'Профиль семьи · связан с SUB-1061',
  'IND-001': 'Профиль заявителя · связан с SUB-1057',
  'IND-002': 'Профиль заявителя · связан с SUB-1078',
};

const applicants = {
  petrov: { id: 'APP-PETROV-I', name: 'Иван Петров', role: 'Основной', status: 'needs_fix' as const, completeness: 88, formProgress: 94, mediaProgress: 82, blockers: 1, nextStep: 'Сверить дату рождения в анкете' },
  petrova: { id: 'APP-PETROVA-A', name: 'Анна Петрова', role: 'Супруга', status: 'needs_fix' as const, completeness: 86, formProgress: 100, mediaProgress: 72, blockers: 1, nextStep: 'Заменить финансовую гарантию' },
  petrovMax: { id: 'APP-PETROV-M', name: 'Максим Петров', role: 'Ребенок', status: 'ready' as const, completeness: 100, formProgress: 100, mediaProgress: 100, blockers: 0, nextStep: 'Готов к проверке' },
  petrovaMaria: { id: 'APP-PETROVA-M', name: 'Мария Петрова', role: 'Ребенок', status: 'ready' as const, completeness: 100, formProgress: 100, mediaProgress: 100, blockers: 0, nextStep: 'Готова к проверке' },
  smirnova: { id: 'APP-SMIRNOVA-A', name: 'Алина Смирнова', role: 'Основной', status: 'in_progress' as const, completeness: 64, formProgress: 68, mediaProgress: 60, blockers: 0, nextStep: 'Заполнить работу и финансы' },
  orlov: { id: 'APP-ORLOV-S', name: 'Сергей Орлов', role: 'Основной', status: 'review' as const, completeness: 100, formProgress: 100, mediaProgress: 100, blockers: 0, nextStep: 'Ожидает решения администратора' },
  orlova: { id: 'APP-ORLOVA-M', name: 'Марина Орлова', role: 'Супруга', status: 'review' as const, completeness: 100, formProgress: 100, mediaProgress: 100, blockers: 0, nextStep: 'Ожидает решения администратора' },
  orlovChild: { id: 'APP-ORLOV-D', name: 'Дмитрий Орлов', role: 'Ребенок', status: 'review' as const, completeness: 100, formProgress: 100, mediaProgress: 100, blockers: 0, nextStep: 'Ожидает решения администратора' },
  volkov: { id: 'APP-VOLKOV-D', name: 'Дмитрий Волков', role: 'Основной', status: 'ready' as const, completeness: 100, formProgress: 100, mediaProgress: 100, blockers: 0, nextStep: 'Готов к выгрузке' },
  ivanov: { id: 'APP-IVANOV-A', name: 'Алексей Иванов', role: 'Основной', status: 'ready' as const, completeness: 100, formProgress: 100, mediaProgress: 100, blockers: 0, nextStep: 'Готов' },
  ivanova: { id: 'APP-IVANOVA-E', name: 'Елена Иванова', role: 'Супруга', status: 'needs_fix' as const, completeness: 68, formProgress: 74, mediaProgress: 62, blockers: 1, nextStep: 'Перезагрузить селфи и финансы' },
  ivanovChild: { id: 'APP-IVANOV-E', name: 'Егор Иванов', role: 'Ребенок', status: 'missing_docs' as const, completeness: 38, formProgress: 40, mediaProgress: 28, blockers: 2, nextStep: 'Загрузить паспорт и анкету' },
  sokolov: { id: 'APP-SOKOLOV-M', name: 'Михаил Соколов', role: 'Основной', status: 'missing_docs' as const, completeness: 52, formProgress: 58, mediaProgress: 46, blockers: 1, nextStep: 'Добавить финансы и бронирования' },
};

const baseSubmissions: Record<string, SubmissionDetail> = {
  'SUB-1042': {
    id: 'SUB-1042',
    title: 'Семья Петровых',
    type: 'family',
    applicantsCount: 4,
    applicants: [applicants.petrov, applicants.petrova, applicants.petrovMax, applicants.petrovaMaria],
    city: 'Санкт-Петербург · VFS Global',
    country: 'Испания',
    visaType: 'Schengen · Tourism',
    tripDates: '18–23 июл 2026',
    status: 'returned',
    completeness: 92,
    updated: '12 мин назад',
    owner: 'Татьяна Н.',
    priority: 'Высокий',
    nextDeadline: 'Сегодня до 18:00',
    riskScore: 68,
    documents: [
      { id: 'doc-1042-pass-i', label: 'Загранпаспорт', category: 'identity', applicant: 'Иван Петров', status: 'accepted', required: true, ocrConfidence: 98, updatedAt: 'Сегодня, 10:45' },
      { id: 'doc-1042-pass-a', label: 'Загранпаспорт', category: 'identity', applicant: 'Анна Петрова', status: 'accepted', required: true, ocrConfidence: 97, updatedAt: 'Сегодня, 10:48' },
      { id: 'doc-1042-selfie-i', label: 'Селфи / биометрия', category: 'photo', applicant: 'Иван Петров', status: 'accepted', required: true, ocrConfidence: 96, updatedAt: 'Сегодня, 10:51' },
      { id: 'doc-1042-bank-a', label: 'Банковская выписка', category: 'finance', applicant: 'Анна Петрова', status: 'needs_replacement', required: true, ocrConfidence: 61, updatedAt: 'Сегодня, 11:20', note: 'Дата старше допустимого окна' },
      { id: 'doc-1042-marriage', label: 'Свидетельство о браке', category: 'family', applicant: 'Семья Петровых', status: 'processing', required: true, ocrConfidence: 74, updatedAt: 'Сегодня, 11:25' },
      { id: 'doc-1042-booking', label: 'Бронирование отеля и билеты', category: 'travel', applicant: 'Семья Петровых', status: 'accepted', required: true, ocrConfidence: 95, updatedAt: 'Вчера, 18:10' },
    ],
    questionnaire: [
      { id: 'q-1042-personal', title: 'Личные данные', icon: User, owner: 'Все заявители', progress: 94, completedFields: 47, totalFields: 50, missingFields: ['Дата рождения Ивана требует сверки'], risk: 'Есть расхождение с OCR' },
      { id: 'q-1042-passport', title: 'Паспортные данные', icon: FileDigit, owner: 'Иван Петров', progress: 86, completedFields: 19, totalFields: 22, missingFields: ['Дата рождения', 'Место выдачи'], risk: 'Блокирует повторную отправку' },
      { id: 'q-1042-finance', title: 'Спонсоры и финансы', icon: CreditCard, owner: 'Анна Петрова', progress: 72, completedFields: 13, totalFields: 18, missingFields: ['Свежая выписка', 'Подтверждение остатка'], risk: 'Нужен новый документ' },
      { id: 'q-1042-trip', title: 'Детали поездки', icon: Plane, owner: 'Семья', progress: 100, completedFields: 16, totalFields: 16, missingFields: [] },
      { id: 'q-1042-family', title: 'Семейные связи', icon: Users, owner: 'Семья', progress: 100, completedFields: 10, totalFields: 10, missingFields: [] },
      { id: 'q-1042-history', title: 'Визовая история', icon: History, owner: 'Все заявители', progress: 100, completedFields: 24, totalFields: 24, missingFields: [] },
    ],
    issues: [
      { id: 'iss-1042-dob', title: 'Несоответствие даты рождения', target: 'Иван Петров · Паспортные данные', description: 'В анкете указано 12.05.1985, а в загруженном скане паспорта OCR распознал 15.05.1985. Нужно подтвердить правильную дату и синхронизировать анкету.', severity: 'blocking', status: 'open', action: 'questionnaire', actionText: 'Открыть анкету', source: 'ocr', createdAt: 'Сегодня, 14:30' },
      { id: 'iss-1042-bank', title: 'Финансовая гарантия устарела', target: 'Анна Петрова · Банковская выписка', description: 'Выписка старше допустимого окна для Schengen-пакета. Нужна свежая версия с видимой датой, ФИО и остатком.', severity: 'blocking', status: 'open', action: 'upload', actionText: 'Заменить файл', source: 'admin', createdAt: 'Сегодня, 14:34' },
    ],
    history: [
      { id: 'h-1042-1', title: 'Возвращено с замечаниями', description: 'Администратор открыл 2 блокера: дата рождения и финансовая гарантия.', time: 'Сегодня, 14:30', user: 'Admin Review', tone: 'warning' },
      { id: 'h-1042-2', title: 'Отправлено на проверку', description: 'Пакет достиг 92% готовности и был передан в очередь ревью.', time: 'Вчера, 18:45', user: 'Татьяна Н.', tone: 'info' },
      { id: 'h-1042-3', title: 'Загружены сканы паспортов', description: 'OCR связал документы с четырьмя заявителями.', time: 'Вчера, 15:10', user: 'Татьяна Н.', tone: 'success' },
      { id: 'h-1042-4', title: 'Создан семейный пакет', description: 'Добавлены 4 заявителя и базовый маршрут.', time: 'Вчера, 12:00', user: 'Татьяна Н.', tone: 'neutral' },
    ],
  },
  'SUB-1057': {
    id: 'SUB-1057',
    title: 'Алина Смирнова',
    type: 'single',
    applicantsCount: 1,
    applicants: [applicants.smirnova],
    city: 'Москва · VFS Global',
    country: 'Испания',
    visaType: 'Schengen · Tourism',
    tripDates: '02–09 авг 2026',
    status: 'in_progress',
    completeness: 64,
    updated: '34 мин назад',
    owner: 'Татьяна Н.',
    priority: 'Средний',
    nextDeadline: 'До 09 июл 2026',
    riskScore: 41,
    documents: [
      { id: 'doc-1057-pass', label: 'Загранпаспорт', category: 'identity', applicant: 'Алина Смирнова', status: 'accepted', required: true, ocrConfidence: 99, updatedAt: 'Вчера, 16:30' },
      { id: 'doc-1057-booking', label: 'Бронирование отеля', category: 'travel', applicant: 'Алина Смирнова', status: 'accepted', required: true, ocrConfidence: 94, updatedAt: 'Вчера, 16:32' },
      { id: 'doc-1057-photo', label: 'Фото / селфи', category: 'photo', applicant: 'Алина Смирнова', status: 'missing', required: true, note: 'Нужно фото на белом фоне' },
      { id: 'doc-1057-bank', label: 'Финансовая гарантия', category: 'finance', applicant: 'Алина Смирнова', status: 'missing', required: true, note: 'Выписка или спонсорское письмо' },
      { id: 'doc-1057-work', label: 'Справка с работы', category: 'employment', applicant: 'Алина Смирнова', status: 'missing', required: true },
    ],
    questionnaire: [
      { id: 'q-1057-personal', title: 'Личные данные', icon: User, owner: 'Алина Смирнова', progress: 100, completedFields: 18, totalFields: 18, missingFields: [] },
      { id: 'q-1057-passport', title: 'Паспортные данные', icon: FileDigit, owner: 'Алина Смирнова', progress: 100, completedFields: 14, totalFields: 14, missingFields: [] },
      { id: 'q-1057-work', title: 'Работа / учеба', icon: Briefcase, owner: 'Алина Смирнова', progress: 40, completedFields: 4, totalFields: 10, missingFields: ['Должность', 'Адрес работодателя', 'Телефон работодателя'], risk: 'Нужна справка' },
      { id: 'q-1057-finance', title: 'Спонсоры и финансы', icon: WalletCards, owner: 'Алина Смирнова', progress: 0, completedFields: 0, totalFields: 8, missingFields: ['Тип финансирования', 'Источник средств', 'Остаток на счете'], risk: 'Блокирует проверку' },
      { id: 'q-1057-trip', title: 'Детали поездки', icon: Plane, owner: 'Алина Смирнова', progress: 100, completedFields: 12, totalFields: 12, missingFields: [] },
    ],
    issues: [],
    history: [
      { id: 'h-1057-1', title: 'Черновик обновлен', description: 'Добавлены паспорт и бронирование отеля.', time: '34 мин назад', user: 'Татьяна Н.', tone: 'info' },
      { id: 'h-1057-2', title: 'OCR завершен', description: 'Паспорт распознан с высокой уверенностью.', time: 'Вчера, 16:36', user: 'Система', tone: 'success' },
      { id: 'h-1057-3', title: 'Создан пакет', description: 'Индивидуальная подача на Schengen.', time: 'Вчера, 16:20', user: 'Татьяна Н.', tone: 'neutral' },
    ],
  },
  'SUB-1061': {
    id: 'SUB-1061',
    title: 'Семья Орловых',
    type: 'family',
    applicantsCount: 3,
    applicants: [applicants.orlov, applicants.orlova, applicants.orlovChild],
    city: 'Москва · VFS Global',
    country: 'Франция',
    visaType: 'Schengen · Tourism',
    tripDates: '11–21 авг 2026',
    status: 'submitted_for_review',
    completeness: 100,
    updated: '1 ч назад',
    owner: 'Татьяна Н.',
    priority: 'Средний',
    nextDeadline: 'Ожидает администратора',
    riskScore: 18,
    documents: [
      { id: 'doc-1061-pass-s', label: 'Загранпаспорт', category: 'identity', applicant: 'Сергей Орлов', status: 'accepted', required: true, ocrConfidence: 99, updatedAt: 'Сегодня, 09:10' },
      { id: 'doc-1061-pass-m', label: 'Загранпаспорт', category: 'identity', applicant: 'Марина Орлова', status: 'accepted', required: true, ocrConfidence: 98, updatedAt: 'Сегодня, 09:12' },
      { id: 'doc-1061-pass-d', label: 'Загранпаспорт', category: 'identity', applicant: 'Дмитрий Орлов', status: 'accepted', required: true, ocrConfidence: 97, updatedAt: 'Сегодня, 09:14' },
      { id: 'doc-1061-insurance', label: 'Страховка', category: 'travel', applicant: 'Семья Орловых', status: 'processing', required: true, ocrConfidence: 82, updatedAt: 'Сегодня, 09:45' },
      { id: 'doc-1061-finance', label: 'Финансовые гарантии', category: 'finance', applicant: 'Сергей Орлов', status: 'accepted', required: true, ocrConfidence: 96, updatedAt: 'Сегодня, 09:35' },
    ],
    questionnaire: [
      { id: 'q-1061-personal', title: 'Личные данные', icon: User, owner: 'Все заявители', progress: 100, completedFields: 54, totalFields: 54, missingFields: [] },
      { id: 'q-1061-passport', title: 'Паспортные данные', icon: FileDigit, owner: 'Все заявители', progress: 100, completedFields: 36, totalFields: 36, missingFields: [] },
      { id: 'q-1061-finance', title: 'Финансы', icon: CreditCard, owner: 'Сергей Орлов', progress: 100, completedFields: 12, totalFields: 12, missingFields: [] },
      { id: 'q-1061-trip', title: 'Детали поездки', icon: Plane, owner: 'Семья', progress: 100, completedFields: 18, totalFields: 18, missingFields: [] },
      { id: 'q-1061-history', title: 'Визовая история', icon: History, owner: 'Все заявители', progress: 100, completedFields: 21, totalFields: 21, missingFields: [] },
    ],
    issues: [],
    history: [
      { id: 'h-1061-1', title: 'Отправлено на проверку', description: 'Все обязательные блоки заполнены, пакет ушел администратору.', time: '1 ч назад', user: 'Татьяна Н.', tone: 'info' },
      { id: 'h-1061-2', title: 'Документы собраны', description: '5 файлов привязаны к заявителям и маршруту.', time: 'Сегодня, 09:50', user: 'Система', tone: 'success' },
      { id: 'h-1061-3', title: 'Создан семейный пакет', description: 'Добавлены 3 заявителя.', time: 'Сегодня, 09:00', user: 'Татьяна Н.', tone: 'neutral' },
    ],
  },
  'SUB-1078': {
    id: 'SUB-1078',
    title: 'Дмитрий Волков',
    type: 'single',
    applicantsCount: 1,
    applicants: [applicants.volkov],
    city: 'Москва · VFS Global',
    country: 'Италия',
    visaType: 'Schengen · Tourism',
    tripDates: '06–12 сен 2026',
    status: 'ready_for_export',
    completeness: 100,
    updated: '2 ч назад',
    owner: 'Марина К.',
    priority: 'Низкий',
    nextDeadline: 'Готов к Excel / PDF',
    riskScore: 9,
    documents: [
      { id: 'doc-1078-pass', label: 'Загранпаспорт', category: 'identity', applicant: 'Дмитрий Волков', status: 'accepted', required: true, ocrConfidence: 99, updatedAt: 'Сегодня, 12:00' },
      { id: 'doc-1078-photo', label: 'Фото', category: 'photo', applicant: 'Дмитрий Волков', status: 'accepted', required: true, ocrConfidence: 98, updatedAt: 'Сегодня, 12:05' },
      { id: 'doc-1078-finance', label: 'Финансовая гарантия', category: 'finance', applicant: 'Дмитрий Волков', status: 'accepted', required: true, ocrConfidence: 96, updatedAt: 'Сегодня, 12:10' },
      { id: 'doc-1078-booking', label: 'Бронь отеля / билеты', category: 'travel', applicant: 'Дмитрий Волков', status: 'accepted', required: true, ocrConfidence: 97, updatedAt: 'Сегодня, 12:15' },
    ],
    questionnaire: [
      { id: 'q-1078-personal', title: 'Личные данные', icon: User, owner: 'Дмитрий Волков', progress: 100, completedFields: 18, totalFields: 18, missingFields: [] },
      { id: 'q-1078-passport', title: 'Паспортные данные', icon: FileDigit, owner: 'Дмитрий Волков', progress: 100, completedFields: 14, totalFields: 14, missingFields: [] },
      { id: 'q-1078-work', title: 'Работа / финансы', icon: Briefcase, owner: 'Дмитрий Волков', progress: 100, completedFields: 18, totalFields: 18, missingFields: [] },
      { id: 'q-1078-trip', title: 'Детали поездки', icon: Plane, owner: 'Дмитрий Волков', progress: 100, completedFields: 12, totalFields: 12, missingFields: [] },
    ],
    issues: [],
    history: [
      { id: 'h-1078-1', title: 'Готово к выгрузке', description: 'Пакет прошел проверку и доступен для экспорта.', time: '2 ч назад', user: 'Admin Review', tone: 'success' },
      { id: 'h-1078-2', title: 'Принято администратором', description: 'Замечаний по анкете и медиа нет.', time: 'Сегодня, 12:40', user: 'Admin Review', tone: 'success' },
      { id: 'h-1078-3', title: 'Отправлено на проверку', description: 'Агент подтвердил готовность.', time: 'Сегодня, 12:20', user: 'Марина К.', tone: 'info' },
    ],
  },
  'SUB-1088': {
    id: 'SUB-1088',
    title: 'Семья Ивановых',
    type: 'family',
    applicantsCount: 3,
    applicants: [applicants.ivanov, applicants.ivanova, applicants.ivanovChild],
    city: 'Москва · VFS Global',
    country: 'Испания',
    visaType: 'Schengen · Family tourism',
    tripDates: '18 авг – 02 сен 2026',
    status: 'in_progress',
    completeness: 61,
    updated: '8 мин назад',
    owner: 'Татьяна Н.',
    priority: 'Высокий',
    nextDeadline: 'Через 2 дня',
    riskScore: 74,
    documents: [
      { id: 'doc-1088-pass-a', label: 'Загранпаспорт', category: 'identity', applicant: 'Алексей Иванов', status: 'accepted', required: true, ocrConfidence: 98, updatedAt: 'Сегодня, 13:20' },
      { id: 'doc-1088-selfie-a', label: 'Селфи', category: 'photo', applicant: 'Алексей Иванов', status: 'accepted', required: true, ocrConfidence: 94, updatedAt: 'Сегодня, 13:22' },
      { id: 'doc-1088-selfie-e', label: 'Селфи', category: 'photo', applicant: 'Елена Иванова', status: 'needs_replacement', required: true, ocrConfidence: 42, updatedAt: 'Сегодня, 13:25', note: 'Лицо перекрыто бликом' },
      { id: 'doc-1088-finance-e', label: 'Финансовая гарантия', category: 'finance', applicant: 'Елена Иванова', status: 'missing', required: true },
      { id: 'doc-1088-pass-child', label: 'Загранпаспорт', category: 'identity', applicant: 'Егор Иванов', status: 'missing', required: true },
      { id: 'doc-1088-questionnaire-child', label: 'Анкета ребенка', category: 'other', applicant: 'Егор Иванов', status: 'missing', required: true },
      { id: 'doc-1088-booking', label: 'Бронирования', category: 'travel', applicant: 'Семья Ивановых', status: 'accepted', required: true, ocrConfidence: 96, updatedAt: 'Сегодня, 13:40' },
      { id: 'doc-1088-insurance', label: 'Страховка', category: 'travel', applicant: 'Семья Ивановых', status: 'accepted', required: true, ocrConfidence: 95, updatedAt: 'Сегодня, 13:41' },
    ],
    questionnaire: [
      { id: 'q-1088-personal', title: 'Личные данные', icon: User, owner: 'Все заявители', progress: 82, completedFields: 44, totalFields: 54, missingFields: ['Данные ребенка', 'Контакты супруги'] },
      { id: 'q-1088-passport', title: 'Паспортные данные', icon: FileDigit, owner: 'Егор Иванов', progress: 62, completedFields: 22, totalFields: 36, missingFields: ['Номер паспорта ребенка', 'Дата выдачи', 'Срок действия'], risk: 'Нужен паспорт ребенка' },
      { id: 'q-1088-finance', title: 'Финансы', icon: CreditCard, owner: 'Елена Иванова', progress: 55, completedFields: 6, totalFields: 11, missingFields: ['Тип финансирования', 'Выписка', 'Сумма'], risk: 'Блокирует отправку' },
      { id: 'q-1088-trip', title: 'Детали поездки', icon: Plane, owner: 'Семья', progress: 100, completedFields: 16, totalFields: 16, missingFields: [] },
      { id: 'q-1088-family', title: 'Семейные связи', icon: Users, owner: 'Семья', progress: 70, completedFields: 7, totalFields: 10, missingFields: ['Свидетельство о рождении', 'Согласие родителя'] },
    ],
    issues: [
      { id: 'iss-1088-selfie', title: 'Плохое качество селфи', target: 'Елена Иванова · Селфи', description: 'Файл отклонен автоматической проверкой: блик закрывает часть лица, контур не проходит биометрический контроль.', severity: 'blocking', status: 'open', action: 'upload', actionText: 'Заменить файл', source: 'rules', createdAt: 'Сегодня, 13:30' },
      { id: 'iss-1088-child-pass', title: 'Нет паспорта ребенка', target: 'Егор Иванов · Загранпаспорт', description: 'Без паспорта ребенка нельзя завершить семейный пакет и отправить его администратору.', severity: 'blocking', status: 'open', action: 'upload', actionText: 'Загрузить паспорт', source: 'agent', createdAt: 'Сегодня, 13:32' },
      { id: 'iss-1088-finance', title: 'Не заполнен финансовый блок', target: 'Елена Иванова · Финансы', description: 'Укажите тип финансирования и приложите выписку или спонсорское письмо.', severity: 'warning', status: 'open', action: 'questionnaire', actionText: 'Открыть анкету', source: 'rules', createdAt: 'Сегодня, 13:34' },
    ],
    history: [
      { id: 'h-1088-1', title: 'Автопроверка нашла блокеры', description: 'Открыты задачи по селфи, паспорту ребенка и финансовому блоку.', time: 'Сегодня, 13:34', user: 'Система', tone: 'warning' },
      { id: 'h-1088-2', title: 'Файлы разложены по заявителям', description: '5 из 8 обязательных файлов готовы к ревью.', time: 'Сегодня, 13:25', user: 'Система', tone: 'info' },
      { id: 'h-1088-3', title: 'Создан семейный пакет', description: 'Добавлены 3 заявителя.', time: 'Сегодня, 13:10', user: 'Татьяна Н.', tone: 'neutral' },
    ],
  },
  'SUB-1092': {
    id: 'SUB-1092',
    title: 'Михаил Соколов',
    type: 'single',
    applicantsCount: 1,
    applicants: [applicants.sokolov],
    city: 'Москва · China Visa Center',
    country: 'Китай',
    visaType: 'Business · M',
    tripDates: '21–29 авг 2026',
    status: 'in_progress',
    completeness: 52,
    updated: 'Сегодня',
    owner: 'Татьяна Н.',
    priority: 'Высокий',
    nextDeadline: 'Сегодня',
    riskScore: 63,
    documents: [
      { id: 'doc-1092-pass', label: 'Загранпаспорт', category: 'identity', applicant: 'Михаил Соколов', status: 'accepted', required: true, ocrConfidence: 97, updatedAt: 'Сегодня, 09:00', note: 'Срок действия пограничный' },
      { id: 'doc-1092-invite', label: 'Приглашение от партнера', category: 'employment', applicant: 'Михаил Соколов', status: 'uploaded', required: true, ocrConfidence: 89, updatedAt: 'Сегодня, 09:12' },
      { id: 'doc-1092-bank', label: 'Финансовая гарантия', category: 'finance', applicant: 'Михаил Соколов', status: 'needs_replacement', required: true, ocrConfidence: 53, updatedAt: 'Сегодня, 09:20', note: 'Не видна сумма' },
      { id: 'doc-1092-booking', label: 'Бронирование отеля', category: 'travel', applicant: 'Михаил Соколов', status: 'missing', required: true },
      { id: 'doc-1092-insurance', label: 'Страховка', category: 'travel', applicant: 'Михаил Соколов', status: 'missing', required: false },
    ],
    questionnaire: [
      { id: 'q-1092-personal', title: 'Личные данные', icon: User, owner: 'Михаил Соколов', progress: 100, completedFields: 18, totalFields: 18, missingFields: [] },
      { id: 'q-1092-passport', title: 'Паспортные данные', icon: FileDigit, owner: 'Михаил Соколов', progress: 90, completedFields: 13, totalFields: 14, missingFields: ['Подтвердить срок действия'], risk: 'Пограничный запас паспорта' },
      { id: 'q-1092-business', title: 'Работа / бизнес', icon: Briefcase, owner: 'Михаил Соколов', progress: 72, completedFields: 13, totalFields: 18, missingFields: ['Адрес принимающей стороны', 'Контакт партнера'] },
      { id: 'q-1092-finance', title: 'Финансы', icon: WalletCards, owner: 'Михаил Соколов', progress: 28, completedFields: 3, totalFields: 11, missingFields: ['Остаток', 'Источник средств', 'Свежая выписка'], risk: 'Блокирует отправку' },
    ],
    issues: [
      { id: 'iss-1092-passport-expiry', title: 'Срок действия паспорта на границе допуска', target: 'Михаил Соколов · Загранпаспорт', description: 'Паспорт истекает через 6.5 месяцев. Для Китая это проходит по нижней границе, но лучше подтвердить риск с клиентом.', severity: 'warning', status: 'open', action: 'confirm', actionText: 'Подтвердить риск', source: 'rules', createdAt: 'Вчера' },
      { id: 'iss-1092-finance', title: 'Не читается сумма в выписке', target: 'Михаил Соколов · Финансы', description: 'OCR не смог подтвердить остаток на счете. Нужна новая выписка или ручное подтверждение.', severity: 'blocking', status: 'open', action: 'upload', actionText: 'Заменить файл', source: 'ocr', createdAt: 'Сегодня, 09:20' },
    ],
    history: [
      { id: 'h-1092-1', title: 'Открыты задачи по документам', description: 'Нужны финансы, бронирование и подтверждение риска паспорта.', time: 'Сегодня, 09:22', user: 'Система', tone: 'warning' },
      { id: 'h-1092-2', title: 'Распознано бизнес-приглашение', description: 'Файл привязан к блоку работа / бизнес.', time: 'Сегодня, 09:14', user: 'Система', tone: 'success' },
      { id: 'h-1092-3', title: 'Создан пакет Китай Business', description: 'Индивидуальная деловая поездка.', time: 'Сегодня, 08:50', user: 'Татьяна Н.', tone: 'neutral' },
    ],
  },
};

function cloneSubmissionWithAlias(detail: SubmissionDetail, requestedId: string): SubmissionDetail {
  return {
    ...detail,
    id: requestedId,
    documents: detail.documents.map((document) => ({ ...document })),
    questionnaire: detail.questionnaire.map((section) => ({ ...section, missingFields: [...section.missingFields] })),
    issues: detail.issues.map((issue) => ({ ...issue })),
    history: detail.history.map((event) => ({ ...event })),
    applicants: detail.applicants.map((applicant) => ({ ...applicant })),
  };
}

function fallbackSubmission(submissionId: string): SubmissionDetail {
  return {
    ...baseSubmissions['SUB-1057'],
    id: submissionId,
    title: submissionId.startsWith('FAM') ? 'Семейный профиль' : 'Новая подача',
    type: submissionId.startsWith('FAM') ? 'family' : 'single',
    updated: 'Только что',
  };
}

function resolveSubmissionDetail(submissionId: string): SubmissionDetail {
  const normalizedId = aliasMap[submissionId] ?? submissionId;
  const source = baseSubmissions[normalizedId] ?? fallbackSubmission(submissionId);
  return cloneSubmissionWithAlias(source, submissionId);
}

// --- Utility hooks / helpers ----------------------------------------------
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : true,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

function getDocumentStatus(document: DrawerDocument, uploadedDocumentIds: Set<string>): DocumentStatus {
  if (uploadedDocumentIds.has(document.id) && (document.status === 'missing' || document.status === 'needs_replacement')) {
    return 'processing';
  }
  return document.status;
}

function getIssueStatus(issue: DrawerIssue, resolvedIssueIds: Set<string>): IssueStatus {
  if (resolvedIssueIds.has(issue.id) && issue.status === 'open') return 'fixed';
  return issue.status;
}

function getDocumentScore(status: DocumentStatus): number {
  switch (status) {
    case 'accepted': return 100;
    case 'uploaded': return 82;
    case 'processing': return 68;
    case 'needs_replacement': return 28;
    case 'missing': return 0;
  }
}

function getOperationalSummary(data: SubmissionDetail, resolvedIssueIds: Set<string>, uploadedDocumentIds: Set<string>) {
  const requiredDocuments = data.documents.filter((document) => document.required);
  const documentScores = requiredDocuments.map((document) => getDocumentScore(getDocumentStatus(document, uploadedDocumentIds)));
  const documentReadiness = documentScores.length
    ? clampPercent(documentScores.reduce((total, score) => total + score, 0) / documentScores.length)
    : 100;
  const questionnaireReadiness = data.questionnaire.length
    ? clampPercent(data.questionnaire.reduce((total, section) => total + section.progress, 0) / data.questionnaire.length)
    : 100;
  const openIssues = data.issues.filter((issue) => getIssueStatus(issue, resolvedIssueIds) === 'open');
  const blockingIssues = openIssues.filter((issue) => issue.severity === 'blocking');
  const requiredDocumentGaps = requiredDocuments.filter((document) => {
    const status = getDocumentStatus(document, uploadedDocumentIds);
    return status === 'missing' || status === 'needs_replacement';
  });
  const gateReadiness = clampPercent((documentReadiness * 0.42) + (questionnaireReadiness * 0.42) + (Math.max(0, 100 - openIssues.length * 18) * 0.16));
  const canSendToReview = blockingIssues.length === 0 && requiredDocumentGaps.length === 0 && gateReadiness >= 80;
  const canSendCorrections = data.status === 'returned' && blockingIssues.length === 0 && requiredDocumentGaps.length === 0;

  return {
    requiredDocuments,
    documentReadiness,
    questionnaireReadiness,
    openIssues,
    blockingIssues,
    requiredDocumentGaps,
    gateReadiness,
    canSendToReview,
    canSendCorrections,
  };
}

const Skeleton = ({ className }: { className?: string }) => (
  <div className={`bg-white/5 animate-pulse rounded-[10px] ${className ?? ''}`} />
);

const statusConfig: Record<SubmissionStatus, { label: string; icon: LucideIcon; className: string }> = {
  draft: { label: 'Черновик', icon: FileText, className: 'bg-white/5 border-white/10 text-white/70' },
  in_progress: { label: 'В работе', icon: Clock, className: 'bg-white/[0.045] border-white/10 text-[#b8baff]' },
  submitted_for_review: { label: 'На проверке', icon: ShieldAlert, className: 'bg-[#6f64ff]/20 border-[#6f64ff]/30 text-[#b8baff]' },
  returned: { label: 'Возвращено', icon: AlertCircle, className: 'bg-[#24191b]/60 border-[#5b2b32]/55 text-[#d59aa3]' },
  corrections_received: { label: 'Исправления получены', icon: RefreshCw, className: 'bg-white/[0.045] border-white/10 text-[#b8baff]' },
  ready_for_export: { label: 'Готово к выгрузке', icon: CheckCircle2, className: 'bg-white/[0.045] border-white/10 text-[#b8baff]' },
  exported: { label: 'Выгружено', icon: Download, className: 'bg-white/[0.045] border-white/10 text-white/70' },
};

const documentStatusConfig: Record<DocumentStatus, { label: string; icon: LucideIcon; className: string; dotClassName: string }> = {
  accepted: { label: 'Принято', icon: CheckCircle2, className: 'bg-white/[0.045] border-white/10 text-[#b8baff]', dotClassName: 'bg-[#7c73ff]' },
  uploaded: { label: 'Загружено', icon: UploadCloud, className: 'bg-white/[0.045] border-white/10 text-[#b8baff]', dotClassName: 'bg-[#8fa3ff]' },
  processing: { label: 'Проверяется', icon: RefreshCw, className: 'bg-white/[0.045] border-white/10 text-[#b8baff]', dotClassName: 'bg-[#8fa3ff]' },
  missing: { label: 'Нет файла', icon: Circle, className: 'bg-white/5 border-dashed border-white/20 text-white/45', dotClassName: 'bg-white/25' },
  needs_replacement: { label: 'Заменить', icon: AlertCircle, className: 'bg-[#24191b]/60 border-[#5b2b32]/55 text-[#d59aa3]', dotClassName: 'bg-[#d59aa3]' },
};

const categoryLabel: Record<DocumentCategory, string> = {
  identity: 'Личность',
  photo: 'Фото',
  finance: 'Финансы',
  travel: 'Поездка',
  employment: 'Работа',
  family: 'Семья',
  other: 'Другое',
};

const issueSeverityConfig: Record<IssueSeverity, { label: string; className: string; icon: LucideIcon }> = {
  blocking: { label: 'Blocker', className: 'bg-[#2a1d20]/70 text-[#d59aa3] border-[#5b2b32]/50', icon: AlertCircle },
  warning: { label: 'Warning', className: 'bg-white/[0.045] text-white/62 border-white/10', icon: FileWarning },
  note: { label: 'Note', className: 'bg-white/[0.045] text-white/55 border-white/10', icon: FileText },
};

function StatusBadge({ status }: { status: SubmissionStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium uppercase tracking-wide ${config.className}`}>
      <Icon className="w-3.5 h-3.5" /> {config.label}
    </span>
  );
}

function ProgressBar({ value, className = '', tone = 'default' }: { value: number; className?: string; tone?: 'default' | 'risk' | 'muted' }) {
  const fillClassName = tone === 'risk' ? 'bg-[#a35f69]' : tone === 'muted' ? 'bg-white/25' : 'bg-[#6f64ff]';
  return (
    <div className={`h-1.5 bg-white/5 rounded-full overflow-hidden ${className}`}>
      <div className={`h-full rounded-full ${fillClassName}`} style={{ width: `${clampPercent(value)}%` }} />
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, hint, tone = 'default' }: { icon: LucideIcon; label: string; value: string | number; hint: string; tone?: 'default' | 'risk' | 'success' }) {
  const iconClassName = tone === 'risk' ? 'text-[#d59aa3] bg-[#24191b]/60' : tone === 'success' ? 'text-[#b8baff] bg-white/[0.045]' : 'text-white/55 bg-white/5';
  return (
    <div className={`rounded-2xl border p-4 bg-gradient-to-br from-[#1a1a1d] to-[#141416] ${tone === 'risk' ? 'border-[#5b2b32]/45' : 'border-[#242529]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-white/40 font-medium">{label}</div>
          <div className="text-2xl font-semibold text-white mt-2">{value}</div>
        </div>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconClassName}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
      </div>
      <div className="text-[11px] text-white/40 mt-3 leading-relaxed">{hint}</div>
    </div>
  );
}

function EmptyState({ title, text, icon: Icon = CheckCircle2 }: { title: string; text: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.015]">
      <div className="w-16 h-16 bg-white/[0.045] rounded-full flex items-center justify-center mb-4 border border-white/10">
        <Icon className="w-8 h-8 text-[#b8baff]" />
      </div>
      <h4 className="text-[16px] font-semibold text-white mb-2">{title}</h4>
      <p className="text-[13px] text-white/50 max-w-sm leading-relaxed">{text}</p>
    </div>
  );
}

// --- Tabs ------------------------------------------------------------------
function OverviewTab({ data, summary, onOpenTab }: { data: SubmissionDetail; summary: ReturnType<typeof getOperationalSummary>; onOpenTab: (tab: DrawerTabId) => void }) {
  const nextActions = [
    ...summary.blockingIssues.slice(0, 2).map((issue) => ({ id: issue.id, label: issue.title, hint: issue.target, tab: 'issues' as DrawerTabId, tone: 'risk' as const })),
    ...summary.requiredDocumentGaps.slice(0, Math.max(0, 3 - summary.blockingIssues.length)).map((document) => ({ id: document.id, label: document.label, hint: document.applicant, tab: 'documents' as DrawerTabId, tone: 'default' as const })),
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard icon={ShieldCheck} label="Готовность" value={`${summary.gateReadiness}%`} hint="Анкета + документы + замечания" tone={summary.gateReadiness >= 90 ? 'success' : 'default'} />
        <MetricCard icon={UploadCloud} label="Документы" value={`${summary.documentReadiness}%`} hint={`${summary.requiredDocumentGaps.length} обязательных пробелов`} tone={summary.requiredDocumentGaps.length ? 'risk' : 'success'} />
        <MetricCard icon={ListChecks} label="Анкета" value={`${summary.questionnaireReadiness}%`} hint="Средний прогресс по блокам" />
        <MetricCard icon={ShieldAlert} label="Риски" value={data.riskScore} hint={summary.blockingIssues.length ? 'Есть блокеры' : 'Критичных блокеров нет'} tone={summary.blockingIssues.length ? 'risk' : 'success'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
        <section className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-colors">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Маршрут и операционный контекст</h3>
              <p className="text-[13px] text-white/50 mt-2">Ключевые параметры подачи и дедлайна для агента.</p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-white/[0.045] border border-white/10 text-[11px] text-white/60">{data.priority}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="flex gap-4 rounded-xl bg-[#161617] border border-[#242529] p-4">
              <Calendar className="w-5 h-5 text-white/30 shrink-0" />
              <div>
                <div className="text-white/90 font-medium">{data.tripDates}</div>
                <div className="text-white/40 text-[11px] mt-0.5">Даты поездки</div>
              </div>
            </div>
            <div className="flex gap-4 rounded-xl bg-[#161617] border border-[#242529] p-4">
              <MapPin className="w-5 h-5 text-white/30 shrink-0" />
              <div>
                <div className="text-white/90 font-medium">{data.city}</div>
                <div className="text-white/40 text-[11px] mt-0.5">Визовый центр</div>
              </div>
            </div>
            <div className="flex gap-4 rounded-xl bg-[#161617] border border-[#242529] p-4">
              <Plane className="w-5 h-5 text-white/30 shrink-0" />
              <div>
                <div className="text-white/90 font-medium">{data.country}</div>
                <div className="text-white/40 text-[11px] mt-0.5">Страна подачи</div>
              </div>
            </div>
            <div className="flex gap-4 rounded-xl bg-[#161617] border border-[#242529] p-4">
              <Clock className="w-5 h-5 text-white/30 shrink-0" />
              <div>
                <div className="text-white/90 font-medium">{data.nextDeadline}</div>
                <div className="text-white/40 text-[11px] mt-0.5">Следующий SLA</div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-colors">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Следующие действия</h3>
              <p className="text-[12px] text-white/45 mt-1">Очередь собрана из блокеров и пробелов.</p>
            </div>
            <Sparkles className="w-4 h-4 text-[#b8baff]" />
          </div>

          {nextActions.length ? (
            <div className="space-y-2.5">
              {nextActions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => onOpenTab(action.tab)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${action.tone === 'risk' ? 'bg-[#24191b]/35 border-[#5b2b32]/45 hover:bg-[#24191b]/55' : 'bg-[#161617] border-[#242529] hover:border-[#6f64ff]/35'}`}
                >
                  <div className="w-8 h-8 rounded-lg bg-white/[0.045] border border-white/10 flex items-center justify-center shrink-0">
                    {action.tone === 'risk' ? <AlertCircle className="w-4 h-4 text-[#d59aa3]" /> : <UploadCloud className="w-4 h-4 text-[#b8baff]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-white truncate">{action.label}</div>
                    <div className="text-[11px] text-white/45 mt-0.5 truncate">{action.hint}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30" />
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 text-[13px] text-white/60 leading-relaxed">
              Блокеров нет. Пакет можно передавать дальше по workflow.
            </div>
          )}
        </section>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Заявители ({data.applicantsCount})</h3>
          <button onClick={() => onOpenTab('questionnaire')} className="text-[12px] text-[#b8baff] hover:text-white transition-colors">Проверить анкету</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.applicants.map((applicant) => (
            <div key={applicant.id} className="flex items-center p-3 bg-white/[0.02] border border-white/5 hover:border-white/10 rounded-xl transition-all group">
              <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-[#2a2a30] to-[#1a1a20] border border-white/10 flex items-center justify-center text-xs font-semibold text-white/70 shadow-inner mr-3">
                {initials(applicant.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-[14px] text-white font-medium truncate group-hover:text-[#b8baff] transition-colors">{applicant.name}</div>
                  {applicant.blockers > 0 && <span className="px-1.5 py-0.5 rounded-md bg-[#2a1d20]/70 text-[#d59aa3] text-[10px]">{applicant.blockers}</span>}
                </div>
                <div className="text-[11px] text-white/50 mt-0.5">{applicant.role} · {applicant.nextStep}</div>
                <ProgressBar value={applicant.completeness} className="mt-2" tone={applicant.blockers ? 'risk' : 'default'} />
              </div>
              <div className="text-right ml-3">
                <div className="text-[12px] font-mono font-medium text-[#b8baff]">{applicant.completeness}%</div>
                <div className="text-[10px] text-white/35 mt-1">готово</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function QuestionnaireTab({ data, onOpenQuestionnaire }: { data: SubmissionDetail; onOpenQuestionnaire?: () => void }) {
  const totalMissing = data.questionnaire.reduce((total, section) => total + section.missingFields.length, 0);
  const averageProgress = data.questionnaire.length
    ? clampPercent(data.questionnaire.reduce((total, section) => total + section.progress, 0) / data.questionnaire.length)
    : 100;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl bg-[#161617] border border-[#242529] p-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ListChecks className="w-4 h-4 text-[#b8baff]" />
            <h3 className="text-[16px] font-semibold text-white">Анкета и контроль полей</h3>
          </div>
          <p className="text-[12px] text-white/50 leading-relaxed">
            Готовность {averageProgress}%. Незакрытых полей: {totalMissing}. Логика подсвечивает блоки, которые реально мешают отправке.
          </p>
        </div>
        <button
          onClick={onOpenQuestionnaire}
          className="h-10 px-4 bg-white/10 hover:bg-white/15 text-white text-[13px] font-medium rounded-xl transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
        >
          <Edit3 className="w-4 h-4" /> Открыть полную анкету
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.questionnaire.map((section) => {
          const Icon = section.icon;
          const isDone = section.progress >= 100;
          const isRisk = Boolean(section.risk || section.missingFields.length);
          return (
            <button
              type="button"
              key={section.id}
              onClick={onOpenQuestionnaire}
              className={`p-4 rounded-xl border text-left flex items-start gap-4 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${isRisk ? 'bg-[#1a1a1d] border-[#5b2b32]/35 hover:border-[#5b2b32]/65' : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10'}`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${isDone ? 'bg-white/[0.045] border-white/10 text-[#b8baff]' : isRisk ? 'bg-[#24191b]/60 border-[#5b2b32]/50 text-[#d59aa3]' : 'bg-[#6f64ff]/10 border-[#6f64ff]/20 text-[#b8baff]'}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="text-[13px] font-semibold text-white truncate">{section.title}</span>
                  <span className="text-[11px] font-mono text-white/50">{section.progress}%</span>
                </div>
                <ProgressBar value={section.progress} tone={isRisk && !isDone ? 'risk' : 'default'} />
                <div className="flex items-center justify-between gap-3 mt-2 text-[11px] text-white/40">
                  <span className="truncate">{section.owner}</span>
                  <span>{section.completedFields}/{section.totalFields} полей</span>
                </div>
                {section.missingFields.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {section.missingFields.slice(0, 3).map((field) => (
                      <span key={field} className="px-2 py-1 rounded-md bg-white/[0.045] border border-white/10 text-[10.5px] text-white/55">
                        {field}
                      </span>
                    ))}
                    {section.missingFields.length > 3 && (
                      <span className="px-2 py-1 rounded-md bg-white/[0.045] border border-white/10 text-[10.5px] text-white/55">+{section.missingFields.length - 3}</span>
                    )}
                  </div>
                )}
                {section.risk && <div className="mt-2 text-[11px] text-[#d59aa3]">{section.risk}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DocumentsTab({ data, uploadedDocumentIds, onUploadDocument }: { data: SubmissionDetail; uploadedDocumentIds: Set<string>; onUploadDocument: (documentId: string) => void }) {
  const grouped = data.documents.reduce<Record<DocumentCategory, DrawerDocument[]>>((acc, document) => {
    if (!acc[document.category]) acc[document.category] = [];
    acc[document.category].push(document);
    return acc;
  }, {} as Record<DocumentCategory, DrawerDocument[]>);

  const categories = Object.keys(grouped) as DocumentCategory[];
  const gaps = data.documents.filter((document) => {
    const status = getDocumentStatus(document, uploadedDocumentIds);
    return document.required && (status === 'missing' || status === 'needs_replacement');
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl bg-[#161617] border border-[#242529] p-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <UploadCloud className="w-4 h-4 text-[#b8baff]" />
            <h3 className="text-[16px] font-semibold text-white">Файлы, OCR и требования пакета</h3>
          </div>
          <p className="text-[12px] text-white/50 leading-relaxed">
            {gaps.length ? `Нужно закрыть ${gaps.length} обязательных файла перед отправкой.` : 'Все обязательные файлы загружены или находятся на проверке.'}
          </p>
        </div>
        <button
          onClick={() => gaps[0] && onUploadDocument(gaps[0].id)}
          disabled={!gaps.length}
          className="h-10 px-4 bg-[#6f64ff] hover:bg-[#4855d4] disabled:bg-white/5 disabled:text-white/30 disabled:cursor-not-allowed text-white text-[13px] font-medium rounded-xl transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <UploadCloud className="w-4 h-4" /> Закрыть следующий пробел
        </button>
      </div>

      <div className="space-y-5">
        {categories.map((category) => (
          <section key={category} className="rounded-2xl bg-[#161617] border border-[#242529] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#242529] bg-[#1a1a1d] flex items-center justify-between">
              <div>
                <h4 className="text-[13px] font-semibold text-white">{categoryLabel[category]}</h4>
                <p className="text-[11px] text-white/40 mt-0.5">{grouped[category].length} файла / требования</p>
              </div>
            </div>
            <div className="divide-y divide-[#242529]">
              {grouped[category].map((document) => {
                const status = getDocumentStatus(document, uploadedDocumentIds);
                const config = documentStatusConfig[status];
                const Icon = config.icon;
                const needsAction = status === 'missing' || status === 'needs_replacement';
                return (
                  <div key={document.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-white/[0.025] transition-colors">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${config.className}`}>
                        <Icon className={`w-5 h-5 ${status === 'processing' ? 'animate-spin' : ''}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h5 className="text-[14px] font-semibold text-white truncate">{document.label}</h5>
                          {document.required && <span className="px-1.5 py-0.5 rounded-md bg-white/[0.045] border border-white/10 text-[10px] text-white/45">required</span>}
                        </div>
                        <div className="text-[12px] text-white/45 mt-1 truncate">{document.applicant}</div>
                        {document.note && <div className="text-[11px] text-[#d59aa3] mt-1.5">{document.note}</div>}
                      </div>
                    </div>

                    <div className="sm:w-[160px]">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${config.className}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${config.dotClassName}`} />
                        {config.label}
                      </div>
                      <div className="text-[10.5px] text-white/35 mt-1.5">{document.updatedAt ?? 'Не загружено'}</div>
                    </div>

                    <div className="sm:w-[145px]">
                      {typeof document.ocrConfidence === 'number' ? (
                        <div>
                          <div className="flex items-center justify-between text-[10.5px] text-white/40 mb-1">
                            <span>OCR</span>
                            <span>{document.ocrConfidence}%</span>
                          </div>
                          <ProgressBar value={document.ocrConfidence} tone={document.ocrConfidence < 70 ? 'risk' : 'default'} />
                        </div>
                      ) : (
                        <div className="text-[11px] text-white/30">OCR после загрузки</div>
                      )}
                    </div>

                    <button
                      onClick={() => onUploadDocument(document.id)}
                      className={`h-10 px-4 rounded-xl border text-[13px] font-medium transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${needsAction ? 'bg-[#6f64ff] hover:bg-[#4855d4] border-[#6f64ff] text-white' : 'bg-[#1a1a1d] hover:bg-[#202024] border-[#242529] text-white/70'}`}
                    >
                      {needsAction ? <UploadCloud className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                      {needsAction ? (status === 'missing' ? 'Загрузить' : 'Заменить') : 'Открыть'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function IssuesTab({ data, resolvedIssueIds, onResolveIssue, onUploadIssue, onOpenQuestionnaire }: { data: SubmissionDetail; resolvedIssueIds: Set<string>; onResolveIssue: (issueId: string) => void; onUploadIssue: (issue: DrawerIssue) => void; onOpenQuestionnaire?: () => void }) {
  const visibleIssues = data.issues.map((issue) => ({ ...issue, status: getIssueStatus(issue, resolvedIssueIds) }));
  const openIssues = visibleIssues.filter((issue) => issue.status === 'open');

  const handleIssueAction = (issue: DrawerIssue) => {
    if (issue.action === 'questionnaire') {
      onOpenQuestionnaire?.();
      return;
    }
    if (issue.action === 'upload') {
      onUploadIssue(issue);
      return;
    }
    onResolveIssue(issue.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h3 className="text-[16px] font-semibold text-white">Замечания и задачи исправления</h3>
          <p className="text-[12px] text-white/50 mt-1">Ошибки сведены в actionable-очередь: анкета, файл, ручное подтверждение.</p>
        </div>
        <div className="px-3 py-1 bg-white/[0.045] text-white/62 rounded-lg text-[12px] font-medium border border-white/10">
          Открыто: {openIssues.length}
        </div>
      </div>

      {visibleIssues.length > 0 ? (
        <div className="space-y-4">
          {visibleIssues.map((issue) => {
            const config = issueSeverityConfig[issue.severity];
            const Icon = config.icon;
            const isFixed = issue.status !== 'open';
            return (
              <div key={issue.id} className={`p-4 border rounded-xl relative overflow-hidden flex flex-col sm:flex-row gap-4 transition-colors ${isFixed ? 'bg-[#161617] border-white/5 opacity-80' : 'bg-[#1a1a1d] border-white/10'}`}>
                <div className={`absolute top-0 left-0 w-1 h-full ${issue.severity === 'blocking' ? 'bg-[#a35f69]' : 'bg-white/20'}`} />
                <div className="w-10 h-10 rounded-full bg-white/[0.045] flex items-center justify-center shrink-0 border border-white/10">
                  {isFixed ? <CheckCircle2 className="w-5 h-5 text-[#b8baff]" /> : <Icon className={issue.severity === 'blocking' ? 'w-5 h-5 text-[#d59aa3]' : 'w-5 h-5 text-white/62'} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h4 className="text-[14px] font-semibold text-white">{issue.title}</h4>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] border font-medium ${config.className}`}>{isFixed ? 'Fixed' : config.label}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.035] border border-white/10 text-white/35 uppercase">{issue.source}</span>
                  </div>
                  <div className="text-[11px] font-medium text-white/55 uppercase tracking-wider mb-2">{issue.target} · {issue.createdAt}</div>
                  <p className="text-[13px] text-white/60 leading-relaxed max-w-2xl">{issue.description}</p>
                </div>
                <div className="sm:w-[190px] shrink-0 flex items-center">
                  <button
                    onClick={() => handleIssueAction(issue)}
                    disabled={isFixed}
                    className="w-full h-10 bg-white/5 hover:bg-white/10 disabled:bg-white/[0.025] disabled:text-white/30 disabled:cursor-not-allowed border border-white/10 rounded-xl text-[13px] font-medium text-white transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
                  >
                    {isFixed ? <CheckCircle2 className="w-4 h-4" /> : issue.action === 'upload' ? <UploadCloud className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                    {isFixed ? 'Закрыто' : issue.actionText}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Замечаний не найдено" text="Все данные проходят текущие проверки. Можно продолжать workflow без ручных исправлений." icon={BadgeCheck} />
      )}
    </div>
  );
}

function HistoryTab({ data, optimisticEvents }: { data: SubmissionDetail; optimisticEvents: DrawerHistoryEvent[] }) {
  const events = [...optimisticEvents, ...data.history];
  const toneConfig: Record<HistoryTone, { icon: LucideIcon; className: string }> = {
    success: { icon: CheckCircle2, className: 'border-[#6f64ff]/50 text-[#b8baff]' },
    warning: { icon: AlertCircle, className: 'border-[#5b2b32]/55 text-[#d59aa3]' },
    info: { icon: UploadCloud, className: 'border-[#6f64ff]/50 text-[#b8baff]' },
    neutral: { icon: FileText, className: 'border-white/10 text-white/45' },
  };

  return (
    <div className="relative pl-6 space-y-8 before:absolute before:inset-y-2 before:left-[31px] before:w-px before:bg-white/10">
      {events.map((event) => {
        const config = toneConfig[event.tone];
        const Icon = config.icon;
        return (
          <div key={event.id} className="relative flex gap-5">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 bg-[#111113] z-10 ${config.className}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="pt-1.5 min-w-0">
              <div className="text-[14px] font-medium text-white/90">{event.title}</div>
              <p className="text-[12px] text-white/50 leading-relaxed mt-1 max-w-2xl">{event.description}</p>
              <div className="flex items-center gap-2 mt-1.5 text-[12px] text-white/40">
                <span>{event.time}</span>
                <span className="w-1 h-1 rounded-full bg-white/20" />
                <span>{event.user}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Main Drawer Component -------------------------------------------------
export function Drawer({ isOpen, onClose, submissionId, initialTab = 'overview', onOpenQuestionnaire, onOpenUpload, onSubmissionUpdate }: DrawerProps) {
  const normalizedInitialTab = normalizeDrawerTab(initialTab);
  const [activeTab, setActiveTab] = useState<DrawerTabId>(normalizedInitialTab);
  const [status, setStatus] = useState<DrawerState>('idle');
  const [data, setData] = useState<SubmissionDetail | null>(null);
  const [resolvedIssueIds, setResolvedIssueIds] = useState<Set<string>>(() => new Set());
  const [uploadedDocumentIds, setUploadedDocumentIds] = useState<Set<string>>(() => new Set());
  const [optimisticEvents, setOptimisticEvents] = useState<DrawerHistoryEvent[]>([]);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) onClose();
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && submissionId) {
      setStatus('loading');
      setActiveTab(normalizeDrawerTab(initialTab));
      setResolvedIssueIds(new Set());
      setUploadedDocumentIds(new Set());
      setOptimisticEvents([]);
      setActionNotice(null);

      const timer = window.setTimeout(() => {
        setData(resolveSubmissionDetail(submissionId));
        setStatus('success');
      }, 240);

      return () => window.clearTimeout(timer);
    }

    if (!isOpen) {
      const resetTimer = window.setTimeout(() => setStatus('idle'), 260);
      return () => window.clearTimeout(resetTimer);
    }

    return undefined;
  }, [isOpen, submissionId, initialTab]);

  const summary = useMemo(() => {
    if (!data) return null;
    return getOperationalSummary(data, resolvedIssueIds, uploadedDocumentIds);
  }, [data, resolvedIssueIds, uploadedDocumentIds]);

  const pushEvent = (event: Omit<DrawerHistoryEvent, 'id' | 'time' | 'user'>) => {
    setOptimisticEvents((current) => [
      {
        ...event,
        id: `optimistic-${Date.now()}-${current.length}`,
        time: 'Только что',
        user: 'Вы',
      },
      ...current,
    ]);
  };

  const resolveIssue = (issueId: string) => {
    const issue = data?.issues.find((item) => item.id === issueId);
    setResolvedIssueIds((current) => new Set(current).add(issueId));
    setActionNotice(issue ? `Задача «${issue.title}» отмечена как исправленная.` : 'Задача отмечена как исправленная.');
    pushEvent({ title: 'Задача исправлена агентом', description: issue?.title ?? 'Замечание закрыто локально.', tone: 'success' });
  };

  const uploadDocument = (documentId: string) => {
    const document = data?.documents.find((item) => item.id === documentId);
    setUploadedDocumentIds((current) => new Set(current).add(documentId));
    setActionNotice(document ? `Файл «${document.label}» поставлен в очередь OCR.` : 'Файл поставлен в очередь OCR.');
    pushEvent({ title: 'Файл отправлен на OCR', description: document ? `${document.label} · ${document.applicant}` : 'Документ обновлен.', tone: 'info' });

    if (document) {
      const relatedIssues = data?.issues.filter((issue) =>
        issue.action === 'upload' &&
        issue.status === 'open' &&
        (issue.target.includes(document.applicant) || issue.target.includes(document.label.split(' ')[0])),
      ) ?? [];
      if (relatedIssues.length) {
        setResolvedIssueIds((current) => {
          const next = new Set(current);
          relatedIssues.forEach((issue) => next.add(issue.id));
          return next;
        });
      }
    }
  };

  const uploadFromIssue = (issue: DrawerIssue) => {
    const targetDocument = data?.documents.find((document) =>
      issue.target.includes(document.applicant) || issue.target.toLowerCase().includes(document.label.toLowerCase().split(' ')[0]),
    );
    if (targetDocument) uploadDocument(targetDocument.id);
    else onOpenUpload?.();
    resolveIssue(issue.id);
    setActiveTab('documents');
  };

  const handleFooterAction = () => {
    if (!data || !summary) return;

    if (data.status === 'returned') {
      if (summary.canSendCorrections) {
        const nextSubmission = {
          ...data,
          status: 'corrections_received' as SubmissionStatus,
          updated: 'Только что',
          completeness: Math.max(data.completeness, summary.gateReadiness),
        };
        setData(nextSubmission);
        onSubmissionUpdate?.(nextSubmission);
        setActionNotice('Исправления готовы к повторной отправке администратору.');
        pushEvent({ title: 'Исправления отправлены', description: 'Пакет повторно передан администратору.', tone: 'success' });
      } else {
        setActiveTab(summary.blockingIssues.length ? 'issues' : 'documents');
        setActionNotice('Сначала закройте блокеры и обязательные документы.');
      }
      return;
    }

    if (data.status === 'in_progress' || data.status === 'draft') {
      if (summary.canSendToReview) {
        const nextSubmission = {
          ...data,
          status: 'submitted_for_review' as SubmissionStatus,
          updated: 'Только что',
          completeness: Math.max(data.completeness, summary.gateReadiness),
        };
        setData(nextSubmission);
        onSubmissionUpdate?.(nextSubmission);
        setActionNotice('Пакет готов к отправке на проверку.');
        pushEvent({ title: 'Пакет отправлен на проверку', description: 'Агент подтвердил готовность по всем обязательным условиям.', tone: 'success' });
      } else {
        setActiveTab(summary.blockingIssues.length ? 'issues' : 'documents');
        setActionNotice('До отправки нужно закрыть обязательные пробелы.');
      }
      return;
    }

    setActionNotice('Текущее состояние не требует действия агента.');
  };

  const tabs: { id: DrawerTabId; label: string; getCount?: (d: SubmissionDetail) => number; isWarning?: boolean }[] = [
    { id: 'overview', label: 'Обзор' },
    { id: 'questionnaire', label: 'Анкета', getCount: (detail) => detail.questionnaire.reduce((total, section) => total + section.missingFields.length, 0) },
    { id: 'documents', label: 'Файлы', getCount: (detail) => detail.documents.filter((document) => {
      const documentStatus = getDocumentStatus(document, uploadedDocumentIds);
      return document.required && (documentStatus === 'missing' || documentStatus === 'needs_replacement');
    }).length, isWarning: true },
    { id: 'issues', label: 'Замечания', getCount: (detail) => detail.issues.filter((issue) => getIssueStatus(issue, resolvedIssueIds) === 'open').length, isWarning: true },
    { id: 'history', label: 'История' },
  ];

  const profileContext = submissionId ? profileLabelMap[submissionId] : undefined;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={data ? `Подача ${data.title}` : 'Карточка подачи'}
            initial={{ x: isDesktop ? '100%' : 0, y: isDesktop ? 0 : '100%', opacity: 0.5 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={{ x: isDesktop ? '100%' : 0, y: isDesktop ? 0 : '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 240, mass: 0.8 }}
            className="fixed z-50 flex flex-col bg-[#111113] border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.6)] lg:inset-y-2 lg:right-2 lg:w-[900px] lg:rounded-2xl lg:border lg:overflow-hidden inset-x-0 bottom-0 top-12 rounded-t-[28px] border-t border-x overflow-y-auto"
          >
            <div className="lg:hidden sticky top-0 z-30 w-full flex items-center justify-center py-3 bg-[#111113]/90 backdrop-blur-md">
              <div className="w-12 h-1.5 rounded-full bg-white/20" />
            </div>

            {status === 'loading' && (
              <div className="flex-1 p-6 lg:p-8 flex flex-col pointer-events-none">
                <Skeleton className="w-48 h-5 mb-4" />
                <Skeleton className="w-3/4 max-w-[400px] h-8 mb-8" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                  <Skeleton className="h-[160px] w-full rounded-xl" />
                  <Skeleton className="h-[160px] w-full rounded-xl" />
                </div>
                <Skeleton className="h-[240px] w-full rounded-xl" />
              </div>
            )}

            {status === 'success' && data && summary && (
              <>
                <header className="px-5 lg:px-8 pt-4 pb-0 bg-[#111113]/95 backdrop-blur-md relative lg:sticky lg:top-0 z-20 shrink-0 border-b border-white/5">
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] lg:text-xs text-white/50 mb-2">
                        <span className="font-mono font-medium tracking-wider text-white/70">{data.id}</span>
                        <span className="w-1 h-1 rounded-full bg-white/20" />
                        <span className="uppercase tracking-wider">{data.type === 'family' ? 'Семейная' : 'Индивидуальная'}</span>
                        {profileContext && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-white/20" />
                            <span className="text-[#b8baff]">{profileContext}</span>
                          </>
                        )}
                      </div>
                      <h2 className="text-[24px] font-semibold text-white leading-tight tracking-tight mb-4">
                        {data.title}
                      </h2>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <StatusBadge status={data.status} />
                        <span className="text-[12px] text-white/40 flex items-center gap-1.5"><Clock className="w-3 h-3" /> Обновлено {data.updated}</span>
                        <span className="text-[12px] text-white/40 flex items-center gap-1.5"><User className="w-3 h-3" /> {data.owner}</span>
                      </div>
                    </div>

                    <button
                      onClick={onClose}
                      className="hidden lg:flex w-10 h-10 items-center justify-center bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl transition-colors border border-white/5 hover:border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
                      aria-label="Закрыть подачу"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="mb-4 grid grid-cols-[1fr_auto] gap-3 items-center rounded-xl bg-white/[0.025] border border-white/5 p-3">
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-white/45 mb-1.5">
                        <span>Gate readiness</span>
                        <span className="font-mono text-white/65">{summary.gateReadiness}%</span>
                      </div>
                      <ProgressBar value={summary.gateReadiness} tone={summary.blockingIssues.length ? 'risk' : 'default'} />
                    </div>
                    <div className="hidden sm:flex items-center gap-2 text-[11px] text-white/45">
                      <span>{summary.openIssues.length} замеч.</span>
                      <span className="w-1 h-1 rounded-full bg-white/20" />
                      <span>{summary.requiredDocumentGaps.length} файлов</span>
                    </div>
                  </div>

                  {actionNotice && (
                    <div className="mb-4 rounded-xl border border-[#6f64ff]/25 bg-[#6f64ff]/10 px-4 py-3 text-[13px] text-[#d7d9ff] flex items-start gap-2">
                      <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{actionNotice}</span>
                    </div>
                  )}

                  <div className="w-full overflow-x-auto scrollbar-hide -mx-5 px-5 lg:mx-0 lg:px-0">
                    <div className="flex items-center gap-1.5 w-max mb-[-1px]">
                      {tabs.map((tab) => {
                        const count = tab.getCount ? tab.getCount(data) : 0;
                        const isActive = activeTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            role="tab"
                            aria-selected={isActive}
                            className={`relative min-h-[44px] px-4 text-[13px] font-medium transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] whitespace-nowrap ${isActive ? 'text-white' : 'text-white/50 hover:text-white/80'}`}
                          >
                            <span>{tab.label}</span>
                            {count > 0 && (
                              <span className={`px-1.5 py-0.5 rounded-md text-[10px] leading-none ml-1 ${tab.isWarning ? 'bg-[#2a1d20]/70 text-[#d59aa3]' : 'bg-white/10 text-white/70'}`}>
                                {count}
                              </span>
                            )}
                            {isActive && (
                              <motion.div
                                layoutId="drawerAgentActiveTab"
                                className="absolute bottom-0 inset-x-0 h-0.5 bg-white"
                                initial={false}
                                transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </header>

                <div className="lg:flex-1 lg:overflow-y-auto p-5 lg:p-8 scrollbar-thin scrollbar-thumb-white/10">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeTab}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      {activeTab === 'overview' && <OverviewTab data={data} summary={summary} onOpenTab={setActiveTab} />}
                      {activeTab === 'questionnaire' && <QuestionnaireTab data={data} onOpenQuestionnaire={onOpenQuestionnaire} />}
                      {activeTab === 'documents' && <DocumentsTab data={data} uploadedDocumentIds={uploadedDocumentIds} onUploadDocument={uploadDocument} />}
                      {activeTab === 'issues' && <IssuesTab data={data} resolvedIssueIds={resolvedIssueIds} onResolveIssue={resolveIssue} onUploadIssue={uploadFromIssue} onOpenQuestionnaire={onOpenQuestionnaire} />}
                      {activeTab === 'history' && <HistoryTab data={data} optimisticEvents={optimisticEvents} />}
                    </motion.div>
                  </AnimatePresence>
                </div>

                <footer className="p-4 lg:px-8 lg:py-5 border-t border-white/10 bg-[#111113]/95 backdrop-blur-md shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4 pb-[max(16px,env(safe-area-inset-bottom))] lg:sticky lg:bottom-0 z-20">
                  <div className="text-[12px] text-white/40 hidden sm:block max-w-[430px]">
                    {summary.blockingIssues.length > 0
                      ? `Сначала закройте блокеры: ${summary.blockingIssues.length}.`
                      : summary.requiredDocumentGaps.length > 0
                        ? `Остались обязательные файлы: ${summary.requiredDocumentGaps.length}.`
                        : data.status === 'returned'
                          ? 'Исправления можно повторно отправить администратору.'
                          : 'Пакет проходит gate-check для следующего шага.'}
                  </div>
                  <div className="flex gap-3 w-full sm:w-auto">
                    <button onClick={onClose} className="flex-1 sm:flex-none h-11 px-5 bg-transparent hover:bg-white/5 text-white/70 hover:text-white font-medium text-[14px] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]">
                      Закрыть
                    </button>
                    <button
                      onClick={handleFooterAction}
                      className="flex-1 sm:flex-none h-11 px-7 bg-[#6f64ff] hover:bg-[#4855d4] text-white font-medium text-[14px] rounded-xl shadow-[0_0_20px_rgba(58,69,180,0.25)] transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      {data.status === 'returned' ? <Send className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      {data.status === 'returned' ? 'Отправить исправления' : data.status === 'in_progress' || data.status === 'draft' ? 'Отправить на проверку' : 'Проверить следующий шаг'}
                    </button>
                  </div>
                </footer>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
