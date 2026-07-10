import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeftRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Menu,
  Plus,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { Drawer } from './Drawer';
import { QuestionnaireScreen } from './QuestionnaireScreen';
import { ApplicantsScreen } from './ApplicantsScreen';
import { AgentReturnPackagesPanel } from './AgentReturnPackagesPanel';
import { DraftsScreen } from './DraftsScreen';
import { PreUploadScreen } from './PreUploadScreen';
import { CreateSubmissionDrawer } from '../modules/submissions/components/CreateSubmissionDrawer';
import { FigmaSubmissionDrawer as OperationalSubmissionDrawer } from '../modules/submissions/components/adminAiAssistance';
import visaflowLogo from '../assets/v-logo-premium-black-style.png';
import {
  emitVisaflowUiEvent,
  useVisaflowBusinessBridge,
  type AgentNavSection,
} from '../integration/visaflowBusinessBridge';
import { createDraft } from '../modules/submissions/domainEngine';
import type {
  City,
  PassportUploadDraft,
  PreliminaryIntakeDraft,
  Submission,
  SubmissionAction,
} from '../modules/submissions/types';
import {
  listItemsFromSubmissions,
  type LegacyAgentNavSection,
  type LegacySubmissionListItem,
} from './v19BusinessScreenAdapter';
import { updateQuestionnaireField } from '../modules/submissions/questionnaire';
import {
  loadProductIntakeDrafts,
  saveProductIntakeDrafts,
  type ProductIntakeDraft,
} from '../modules/submissions/productIntakeFlow';
import { productIntakeDraftToSubmission } from '../modules/submissions/productIntakeSubmissionAdapter';
import {
  agentActionQueue,
  searchAgentActions,
  type AgentActionDue,
  type AgentActionItem,
} from '../modules/submissions/agentActions';
import {
  agentAgencyLabel,
  agentDisplayName,
  agentInitials,
} from '../modules/submissions/agentDirectory';
import {
  generatedCockpitMediaFileName,
  mediaSlotTypeForSubmissionFileType,
  uploadRequiredFile,
} from '../modules/submissions/submissionActions';
import {
  buildMediaStoragePath,
  mediaMimeTypeForFile,
  uploadMediaToStorage,
} from '../modules/submissions/mediaStorage';
import { V19SummaryTile, V19SummaryTileGrid } from '../shared/ui/v19-design-system';
import { applySubmissionActionResult, canReplaceDocument } from '../modules/submissions/status';

export type SubmissionListItem = LegacySubmissionListItem;

type ViewState = 'main' | 'questionnaire' | 'upload';
type AgentShellNavSection = Extract<
  LegacyAgentNavSection,
  'actions' | 'documents' | 'submissions' | 'settings'
>;
type ActionSummaryFilter = 'open' | 'today' | 'week' | 'completed';

type CommandCenterProps = {
  agentId?: Submission['agentId'];
  onSubmissionsChange?: (submissions: Submission[]) => void | Promise<void>;
  submissions?: Submission[];
  onSignOut?: () => void | Promise<void>;
  onSwitchWorkspace?: () => void;
  onNavigateSettings?: () => void;
  usesSupabase?: boolean;
};

const fallbackSubmissions: SubmissionListItem[] = [
  {
    id: 'SUB-1042',
    title: 'Семья Петровых',
    type: 'family',
    applicantsCount: 4,
    city: 'Санкт-Петербург',
    tripDates: '18–23 июл 2026',
    status: 'returned',
    completeness: 92,
    updated: '12 мин назад',
    owner: 'Татьяна Н.',
    issueCount: 2,
    nextAction: 'Исправить замечания администратора',
  },
  {
    id: 'SUB-1057',
    title: 'Алина Смирнова',
    type: 'single',
    applicantsCount: 1,
    city: 'Москва',
    tripDates: '02–09 авг 2026',
    status: 'in_progress',
    completeness: 64,
    updated: '34 мин назад',
    owner: 'Татьяна Н.',
    issueCount: 0,
    nextAction: 'Дособрать обязательные документы',
  },
  {
    id: 'SUB-1061',
    title: 'Семья Орловых',
    type: 'family',
    applicantsCount: 4,
    city: 'Москва',
    tripDates: '11–21 авг 2026',
    status: 'submitted_for_review',
    completeness: 100,
    updated: '1 ч назад',
    owner: 'Татьяна Н.',
    issueCount: 0,
    nextAction: 'Ожидать проверки администратора',
  },
  {
    id: 'SUB-1078',
    title: 'Дмитрий Волков',
    type: 'single',
    applicantsCount: 1,
    city: 'Москва',
    tripDates: '06–12 сен 2026',
    status: 'ready_for_export',
    completeness: 100,
    updated: '2 ч назад',
    owner: 'Марина К.',
    issueCount: 0,
    nextAction: 'Готово к Excel-выгрузке',
  },
];

function intakeDraftToListItem(draft: ProductIntakeDraft): SubmissionListItem {
  return {
    id: draft.id,
    title: draft.title,
    type: draft.type,
    applicantsCount: draft.applicants.length,
    city: draft.city,
    tripDates: draft.tripDates.replace(/\.2026/g, '').replace(/\s+–\s+/g, '–'),
    status: draft.issues.some((issue) => issue.severity === 'blocker') ? 'returned' : 'in_progress',
    completeness: draft.readyPercent,
    updated: 'только что',
    owner: 'Татьяна Н.',
    issueCount: draft.issues.length,
    nextAction: draft.nextAction,
  };
}

function canonicalBridgeNav(section: LegacyAgentNavSection): AgentNavSection | null {
  if (section === 'actions' || section === 'documents' || section === 'submissions' || section === 'settings') return section;
  return null;
}

function navLabel(section: AgentShellNavSection) {
  switch (section) {
    case 'actions':
      return 'Мои действия';
    case 'documents':
      return 'Сбор документов';
    case 'submissions':
      return 'Мои подачи';
    case 'settings':
      return 'Настройки';
  }
}

function normalizeAgentNav(section: LegacyAgentNavSection): AgentShellNavSection {
  if (section === 'applicants') return 'submissions';
  if (section === 'drafts') return 'submissions';
  if (section === 'files' || section === 'media') return 'documents';
  if (section === 'issues') return 'actions';
  return section;
}

export function CommandCenter({
  agentId,
  onSubmissionsChange,
  submissions: canonicalSubmissions,
  onSignOut,
  onSwitchWorkspace,
  onNavigateSettings,
  usesSupabase = false,
}: CommandCenterProps) {
  const bridge = useVisaflowBusinessBridge();
  const [activeNav, setActiveNav] = useState<AgentShellNavSection>('actions');
  const [currentView, setCurrentView] = useState<ViewState>('main');
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [actionSummaryFilter, setActionSummaryFilter] = useState<ActionSummaryFilter>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [settingsDigest, setSettingsDigest] = useState<'instant' | 'daily'>('instant');
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [intakeDrafts, setIntakeDrafts] = useState<ProductIntakeDraft[]>(() =>
    usesSupabase ? [] : loadProductIntakeDrafts(),
  );
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [createCity, setCreateCity] = useState<City>('Москва');
  const [createFamilyCount, setCreateFamilyCount] = useState(2);
  const [createType, setCreateType] = useState<Submission['type']>('single');
  const [canonicalOverrides, setCanonicalOverrides] = useState<Record<string, Submission>>({});

  const effectiveCanonicalSubmissions = useMemo(() => {
    const byId = new Map(
      (canonicalSubmissions ?? []).map((submission) => [submission.id, submission]),
    );
    for (const submission of Object.values(canonicalOverrides)) {
      byId.set(submission.id, submission);
    }
    return [...byId.values()];
  }, [canonicalOverrides, canonicalSubmissions]);

  useEffect(() => {
    if (!canonicalSubmissions?.length || !Object.keys(canonicalOverrides).length) return;
    setCanonicalOverrides((current) => {
      const next = { ...current };
      let changed = false;
      for (const [id, override] of Object.entries(current)) {
        if (canonicalSubmissions.find((submission) => submission.id === id) === override) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [canonicalOverrides, canonicalSubmissions]);

  const canonicalRows = useMemo(() => listItemsFromSubmissions(effectiveCanonicalSubmissions), [effectiveCanonicalSubmissions]);
  const intakeRows = useMemo(() => intakeDrafts.map(intakeDraftToListItem), [intakeDrafts]);
  const rows = useMemo(
    () =>
      usesSupabase
        ? canonicalRows
        : [...intakeRows, ...(canonicalRows.length ? canonicalRows : fallbackSubmissions)],
    [canonicalRows, intakeRows, usesSupabase],
  );
  const actionQueue = useMemo(() => agentActionQueue(effectiveCanonicalSubmissions), [effectiveCanonicalSubmissions]);
  const visibleActions = useMemo(() => {
    const matchesFilter = (due: AgentActionDue) => {
      if (actionSummaryFilter === 'open') return true;
      if (actionSummaryFilter === 'today') return due === 'today';
      if (actionSummaryFilter === 'week') return due === 'today' || due === 'week';
      return due === 'completed';
    };
    const source = actionSummaryFilter === 'completed' ? actionQueue.completed : actionQueue.open;
    return searchAgentActions(source.filter((action) => matchesFilter(action.due)), searchQuery);
  }, [actionQueue.completed, actionQueue.open, actionSummaryFilter, searchQuery]);
  const agentName = agentDisplayName(agentId);
  const agentAgency = agentAgencyLabel(agentId);
  const agentAvatar = agentInitials(agentId);
  const selectedCanonicalSubmission = useMemo(
    () => effectiveCanonicalSubmissions.find((submission) => submission.id === selectedRow),
    [effectiveCanonicalSubmissions, selectedRow],
  );
  const selectedIntakeDraft = useMemo(
    () => intakeDrafts.find((draft) => draft.id === selectedRow),
    [intakeDrafts, selectedRow],
  );
  const intakeSubmissionsForCards = useMemo(
    () =>
      intakeDrafts.map((draft) =>
        productIntakeDraftToSubmission(draft, {
          agentId,
          useIntakeFilesAsLocalDemoUploads: true,
        }),
      ),
    [agentId, intakeDrafts],
  );
  const submissionCards = useMemo(
    () =>
      usesSupabase
        ? effectiveCanonicalSubmissions
        : [...intakeSubmissionsForCards, ...effectiveCanonicalSubmissions],
    [effectiveCanonicalSubmissions, intakeSubmissionsForCards, usesSupabase],
  );

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileNavOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (usesSupabase) return;
    saveProductIntakeDrafts(intakeDrafts);
  }, [intakeDrafts, usesSupabase]);

  const navigateTo = (nav: LegacyAgentNavSection) => {
    const normalizedNav = normalizeAgentNav(nav);
    const canonicalNav = canonicalBridgeNav(normalizedNav);
    if (canonicalNav) {
      bridge.onAgentNavChange?.(canonicalNav);
      emitVisaflowUiEvent(bridge, { type: 'agent.nav', section: canonicalNav });
      if (canonicalNav === 'settings') onNavigateSettings?.();
    }
    setActiveNav(normalizedNav);
    setMobileNavOpen(false);
  };

  const handleRowClick = (id: string) => {
    if (intakeDrafts.some((draft) => draft.id === id)) {
      bridge.onQuestionnaireOpen?.(id);
      emitVisaflowUiEvent(bridge, { type: 'questionnaire.open', submissionId: id });
      setSelectedRow(id);
      setDrawerOpen(false);
      setCurrentView('questionnaire');
      return;
    }

    bridge.onSubmissionOpen?.(id);
    emitVisaflowUiEvent(bridge, { type: 'submission.open', submissionId: id });
    setSelectedRow(id);
    setDrawerOpen(true);
  };

  const handleOpenQuestionnaire = (id: string) => {
    bridge.onQuestionnaireOpen?.(id);
    emitVisaflowUiEvent(bridge, { type: 'questionnaire.open', submissionId: id });
    setSelectedRow(id);
    setDrawerOpen(false);
    setCurrentView('questionnaire');
  };

  const handleActionOpen = (action: AgentActionItem) => {
    if (action.tab === 'questionnaire') {
      handleOpenQuestionnaire(action.submission.id);
      return;
    }
    handleRowClick(action.submission.id);
  };

  const createPackage = () => {
    bridge.onCreatePackage?.();
    emitVisaflowUiEvent(bridge, { type: 'package.create' });
    if (usesSupabase) {
      setCreateDrawerOpen(true);
      return;
    }
    setCurrentView('upload');
  };

  const createCanonicalDraft = async (
    passportUploads: PassportUploadDraft[] = [],
    preliminaryIntake?: PreliminaryIntakeDraft,
    options?: { openQuestionnaire?: boolean },
  ) => {
    const applicantNames = passportUploads.map((upload) => {
      const firstName = upload.extractedFields.find((field) => field.key === 'firstName')?.value.trim();
      const surname = upload.extractedFields.find((field) => field.key === 'surname')?.value.trim();
      return [firstName, surname].filter(Boolean).join(' ');
    });
    const result = createDraft({
      agentId,
      applicantNames,
      city: createCity,
      familyCount: createFamilyCount,
      idScheme: 'supabase',
      preliminaryIntake,
      submissions: canonicalSubmissions ?? [],
      type: createType,
    });
    if (!result.ok) throw new Error(result.error.message);

    const passportFieldIds: Record<string, string> = {
      birthCountry: 'birth-country',
      birthDate: 'birth-date',
      birthPlace: 'birth-place',
      citizenship: 'nationality',
      firstName: 'first-name',
      gender: 'gender',
      passportExpiresAt: 'passport-expiry-date',
      passportIssueCountry: 'passport-issue-country',
      passportIssuePlace: 'passport-issue-place',
      passportIssuedAt: 'passport-issue-date',
      passportNumber: 'passport-no',
      passportType: 'passport-type',
      surname: 'surname',
    };
    const nowIso = new Date().toISOString();
    let nextSubmission = result.data;
    for (const upload of passportUploads) {
      const applicant = nextSubmission.applicants[upload.applicantIndex];
      if (!applicant) continue;
      const passportFile = nextSubmission.files.find(
        (file) => file.applicantId === applicant.id && file.type === 'passport_scan',
      );
      if (!passportFile || !upload.file) {
        throw new Error(`Не удалось подготовить файл паспорта для ${applicant.fullName}.`);
      }

      const generatedFileName = generatedCockpitMediaFileName({
        applicantId: applicant.id,
        fileType: passportFile.type,
        mimeType: upload.file.type,
        submissionId: nextSubmission.id,
        uploadNonce: upload.id,
      });
      const storageTarget = buildMediaStoragePath(
        nextSubmission.id,
        applicant.id,
        mediaSlotTypeForSubmissionFileType(passportFile.type),
        generatedFileName,
      );
      const storedFile = await uploadMediaToStorage(storageTarget, upload.file);
      if (!storedFile) {
        throw new Error('Supabase Storage недоступен для сохранения паспорта.');
      }
      nextSubmission = uploadRequiredFile(nextSubmission, passportFile.id, {
        generatedFileName,
        mimeType: upload.file.type,
        originalFileName: upload.file.name,
        sizeBytes: upload.file.size,
        storageAdapter: 'supabase-private',
        storageBucket: storageTarget.bucket,
        storagePath: storedFile.path,
        uploadedAtIso: new Date().toISOString(),
      });

      nextSubmission = {
        ...nextSubmission,
        applicants: nextSubmission.applicants.map((candidate) =>
          candidate.id === applicant.id
            ? {
                ...candidate,
                passportExtraction: {
                  appliedFieldKeys: upload.extractedFields.map((field) => field.key),
                  attemptCount: 1,
                  extractedFields: upload.extractedFields,
                  lastAttemptAtIso: nowIso,
                  sourceFileId: passportFile?.id,
                  sourceFileName: upload.fileName,
                  status: upload.status,
                  summary:
                    upload.status === 'ready'
                      ? 'Паспортные данные перенесены в анкету.'
                      : 'Паспорт принят, понадобится ручная проверка.',
                },
              }
            : candidate,
        ),
      };
      for (const field of upload.extractedFields) {
        const fieldId = passportFieldIds[field.key];
        if (!fieldId || !field.value.trim()) continue;
        const section = applicant.sections.find((candidate) =>
          candidate.fields.some((candidateField) => candidateField.id === fieldId),
        );
        if (!section) continue;
        nextSubmission = updateQuestionnaireField(nextSubmission, {
          applicantId: applicant.id,
          fieldId,
          reviewOriginSource: 'passport_ocr',
          reviewSource: 'passport_ocr',
          reviewState: 'needs_review',
          sectionId: section.id,
          value: field.value,
        });
      }
    }

    await onSubmissionsChange?.([nextSubmission]);
    setCanonicalOverrides((current) => ({ ...current, [nextSubmission.id]: nextSubmission }));
    setCreateDrawerOpen(false);
    setActiveNav('submissions');
    setSearchQuery('');
    if (options?.openQuestionnaire) {
      setSelectedRow(nextSubmission.id);
      setDrawerOpen(false);
      setCurrentView('questionnaire');
    }
  };

  const uploadCanonicalFile = async (fileId: string, file: File) => {
    const submission = effectiveCanonicalSubmissions.find((candidate) => candidate.id === selectedRow);
    const targetFile = submission?.files.find((candidate) => candidate.id === fileId);
    if (!submission || !targetFile) {
      throw new Error('Не удалось определить слот файла для загрузки.');
    }
    if (!canReplaceDocument(submission, targetFile)) {
      throw new Error('Файл нельзя загрузить в текущем статусе подачи.');
    }
    const mimeType = mediaMimeTypeForFile(file);
    if (!mimeType) {
      throw new Error('Не удалось определить тип выбранного файла.');
    }

    const generatedFileName = generatedCockpitMediaFileName({
      applicantId: targetFile.applicantId,
      fileType: targetFile.type,
      mimeType,
      submissionId: submission.id,
      uploadNonce: `${Date.now()}`,
    });
    const target = buildMediaStoragePath(
      submission.id,
      targetFile.applicantId,
      mediaSlotTypeForSubmissionFileType(targetFile.type),
      generatedFileName,
    );
    const uploaded = await uploadMediaToStorage(target, file, { contentType: mimeType });
    if (!uploaded) {
      throw new Error('Supabase Storage недоступен для загрузки файла.');
    }

    const uploadedSubmission = uploadRequiredFile(submission, fileId, {
      generatedFileName,
      mimeType,
      originalFileName: file.name,
      sizeBytes: file.size,
      storageAdapter: 'supabase-private',
      storageBucket: target.bucket,
      storagePath: uploaded.path,
      uploadedAtIso: new Date().toISOString(),
    });
    if (uploadedSubmission === submission) {
      throw new Error('Файл нельзя загрузить в текущем статусе подачи.');
    }

    const nextSubmission =
      targetFile.type === 'passport_scan' && targetFile.status !== 'needs_replacement'
        ? {
            ...uploadedSubmission,
            applicants: uploadedSubmission.applicants.map((applicant) =>
              applicant.id === targetFile.applicantId
                ? {
                    ...applicant,
                    passportExtraction: submission.applicants.find(
                      (candidate) => candidate.id === applicant.id,
                    )?.passportExtraction,
                  }
                : applicant,
            ),
          }
        : uploadedSubmission;

    await onSubmissionsChange?.([nextSubmission]);
    setCanonicalOverrides((current) => ({ ...current, [nextSubmission.id]: nextSubmission }));
  };

  const executeAgentSubmissionAction = async (action: SubmissionAction) => {
    if (!selectedCanonicalSubmission) return;

    const result = applySubmissionActionResult(
      selectedCanonicalSubmission,
      action,
      'agent',
      agentId ?? selectedCanonicalSubmission.agentId,
    );
    if (!result.ok) throw new Error(result.error.message);

    await onSubmissionsChange?.([result.data]);
    setCanonicalOverrides((current) => ({ ...current, [result.data.id]: result.data }));
  };

  const handleUploadComplete = (draft: ProductIntakeDraft) => {
    bridge.onQuestionnaireOpen?.(draft.id);
    emitVisaflowUiEvent(bridge, { type: 'questionnaire.open', submissionId: draft.id });
    setIntakeDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)].slice(0, 8));
    setSelectedRow(draft.id);
    setDrawerOpen(false);
    setActiveNav('submissions');
    setSearchQuery('');
    setCurrentView('questionnaire');
  };

  const handleUploadDraftSave = (draft: ProductIntakeDraft) => {
    setIntakeDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)].slice(0, 8));
    setSelectedRow(draft.id);
    setDrawerOpen(false);
    setActiveNav('submissions');
    setSearchQuery('');
    setCurrentView('main');
  };

  const persistQuestionnaireSubmission = (nextSubmission: Submission) => {
    setIntakeDrafts((current) => current.filter((draft) => draft.id !== nextSubmission.id));
    return onSubmissionsChange?.([nextSubmission]);
  };

  const renderNavButton = (section: LegacyAgentNavSection, icon: ReactNode, count?: number, warning?: boolean) => (
    <button
      aria-label={navLabel(normalizeAgentNav(section))}
      onClick={() => navigateTo(section)}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${activeNav === section ? 'bg-[#27272b] text-white' : 'hover:bg-white/5 text-white/70 hover:text-white'}`}
    >
      {icon}
      <span className="flex-1 text-left">{navLabel(normalizeAgentNav(section))}</span>
      {typeof count === 'number' && <span className="px-1.5 py-0.5 rounded-full bg-[#18181b] border border-white/5 text-[11px] font-medium text-white/80">{count}</span>}
      {warning && <span className="w-2 h-2 rounded-full bg-[#a35f69]" />}
    </button>
  );

  const actionStatusTagClass = (action: AgentActionItem) => `tone-${action.severity}`;

  const actionPeopleCount = (action: AgentActionItem) =>
    action.submission.type === 'family'
      ? action.submission.applicants.length
      : null;

  const renderNavContent = () => (
    <>
      <div className="flex items-center gap-2.5 px-2 pb-4 mb-2">
        <img
          src={visaflowLogo}
          alt="VisaFlow"
          className="h-8 w-8 shrink-0 rounded-lg object-cover"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold tracking-tight">VisaFlow V-19</div>
          <div className="text-[11px] text-white/50">Agent workspace</div>
        </div>
        <button onClick={() => setMobileNavOpen(false)} className="md:hidden p-2 text-white/50 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      <button className="h-10 mb-4 bg-white/5 hover:bg-white/10 border border-[#242529] rounded-[10px] text-white/50 flex items-center gap-2 px-3 text-sm transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] mx-2">
        <Search className="w-4 h-4" />
        <span>Поиск...</span>
        <kbd className="ml-auto px-1.5 py-0.5 rounded bg-black/40 border border-[#242529] text-[10px] font-sans">⌘K</kbd>
      </button>

      <div className="flex-1 overflow-y-auto px-2 space-y-5 scrollbar-hide">
        <nav className="space-y-0.5">
          <div className="px-2 pb-1 text-[11px] text-white/40 font-medium tracking-wide uppercase">Работа</div>
          {renderNavButton('actions', <Menu className="w-4 h-4" />, actionQueue.summary.open)}
          {renderNavButton('documents', <FileText className="w-4 h-4" />, rows.filter((item) => item.completeness < 100 || item.status === 'returned').length)}
          {renderNavButton('submissions', <Users className="w-4 h-4" />, rows.length)}
          {renderNavButton('settings', <Settings className="w-4 h-4" />)}
        </nav>
      </div>

      {onSwitchWorkspace ? (
        <div className="mt-auto border-t border-[#202124] p-3 mx-2 space-y-2">
          <button
            onClick={onSwitchWorkspace}
            className="w-full h-10 px-3 bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] rounded-xl text-[13px] font-medium text-white transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
          >
            <ArrowLeftRight className="w-4 h-4 text-white/50" />
            В админскую зону
          </button>
        </div>
      ) : onSignOut ? (
        <div className="mt-auto border-t border-[#202124] p-3 mx-2 space-y-2">
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#242529] bg-white text-[12px] font-bold text-[#0a0a0b]">
              {agentAvatar}
            </span>
            <div className="min-w-0 text-left">
              <div className="truncate text-[13px] font-medium leading-5 text-white">{agentName}</div>
              <div className="truncate text-[11px] leading-4 text-white/50">{agentAgency}</div>
            </div>
          </div>
          <button
            onClick={() => void onSignOut()}
            className="w-full h-10 px-3 bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] rounded-xl text-[13px] font-medium text-white transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
          >
            Выйти
          </button>
        </div>
      ) : null}
    </>
  );

  const renderActionsList = () => (
    <section
      aria-label="Мои действия"
      className="v19-legacy-actions-screen"
      data-testid="agent-actions-screen"
    >
      <V19SummaryTileGrid className="v19-legacy-actions-summary">
        <V19SummaryTile
          active={actionSummaryFilter === 'open'}
          detail="в работе"
          icon={FileText}
          label="Открыто"
          tone="neutral"
          value={actionQueue.summary.open}
          onClick={() => setActionSummaryFilter('open')}
        />
        <V19SummaryTile
          active={actionSummaryFilter === 'today'}
          detail="сегодня"
          icon={Clock}
          label="Сегодня"
          tone="amber"
          value={actionQueue.summary.today}
          onClick={() => setActionSummaryFilter('today')}
        />
        <V19SummaryTile
          active={actionSummaryFilter === 'week'}
          detail="до недели"
          icon={CalendarDays}
          label="На неделе"
          tone="indigo"
          value={actionQueue.summary.week}
          onClick={() => setActionSummaryFilter('week')}
        />
        <V19SummaryTile
          active={actionSummaryFilter === 'completed'}
          detail="закрыто"
          icon={CheckCircle2}
          label="Закрыто"
          tone="green"
          value={actionQueue.summary.completed}
          onClick={() => setActionSummaryFilter('completed')}
        />
      </V19SummaryTileGrid>

      <div className="v19-legacy-actions-searchbar">
        <div className="v19-legacy-actions-search-field">
          <Search className="v19-legacy-actions-search-icon" />
          <input
            aria-label="Поиск по действиям"
            className="v19-legacy-actions-search-input"
            data-testid="agent-action-search"
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            placeholder="Поиск по действиям..."
          />
        </div>
      </div>

      <div className="v19-legacy-actions-list">
        <AnimatePresence mode="popLayout">
          {visibleActions.length === 0 ? (
            <motion.div key="empty-actions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="v19-legacy-actions-empty">
              Нет открытых действий по текущим подачам.
            </motion.div>
          ) : (
            visibleActions.map((action, index) => (
              <motion.div
                layout
                key={action.id}
                initial={{ opacity: 0, y: 14, scale: 0.992 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.992 }}
                transition={{ duration: 0.2, delay: index * 0.018 }}
                onClick={() => handleActionOpen(action)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleActionOpen(action);
                  }
                }}
                className={`v19-legacy-action-row severity-${action.severity}`}
                data-testid="agent-action-row"
              >
                <div className="v19-legacy-action-main">
                  <div className="v19-legacy-action-title-line">
                    <span className="v19-legacy-action-labels">
                      <span className="v19-legacy-action-id">{action.submission.id}</span>
                      {actionPeopleCount(action) ? (
                        <span
                          aria-label={`Семья: ${actionPeopleCount(action)} человек`}
                          className="v19-legacy-action-family-tag"
                        >
                          <Users aria-hidden="true" />
                          <span>{actionPeopleCount(action)}</span>
                        </span>
                      ) : null}
                    </span>
                    <strong className="v19-legacy-action-title">{action.title}</strong>
                  </div>
                </div>
                <div className="v19-legacy-action-meta">
                  <span
                    className={`v19-legacy-action-status ${actionStatusTagClass(action)}`}
                    data-testid="agent-action-status"
                  >
                    <span aria-hidden="true" className="v19-legacy-action-status-dot" />
                    <span className="truncate">{action.dueLabel}</span>
                  </span>
                </div>
                <div className="v19-legacy-action-city-column">
                  <span className="v19-legacy-action-city">
                    <span aria-hidden="true" />
                    {action.submission.city}
                  </span>
                </div>
                <div className="v19-legacy-action-badges">
                  {action.badges.slice(0, 2).map((badge) => (
                    <span
                      key={`${action.id}-${badge.label}`}
                      className="v19-legacy-action-badge is-desktop-badge"
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
                <div className="v19-legacy-action-cta-wrap">
                  <button
                    className="v19-legacy-action-cta"
                    data-testid="agent-action-cta"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleActionOpen(action);
                    }}
                  >
                    {action.cta}
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </section>
  );

  const renderSettings = () => (
    <section
      aria-labelledby="agent-settings-title"
      className="grid max-w-3xl gap-5 rounded-2xl border border-[#242529] bg-[#161617] p-6"
    >
      <div>
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-white/62">
          <Settings className="w-3.5 h-3.5" /> Canonical V19
        </div>
        <h2
          className="m-0 text-[24px] font-semibold tracking-tight text-white"
          id="agent-settings-title"
        >
          Настройки рабочего места
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-white/60">
          Основные параметры рабочего места агента сохраняются в этом контуре.
        </p>
      </div>

      <label className="grid max-w-sm gap-2">
        <h2 className="m-0 text-[18px] font-semibold text-white">Уведомления</h2>
        <span className="text-[13px] font-semibold text-white">Сводка по действиям</span>
        <select
          aria-label="Сводка по действиям"
          className="h-10 rounded-[10px] border border-[#242529] bg-[#1e1e21] px-3 text-[13px] font-medium text-white outline-none focus:border-[#6f64ff]/55"
          value={settingsDigest}
          onChange={(event) => {
            setSettingsDigest(event.currentTarget.value as 'instant' | 'daily');
            setSettingsDirty(true);
            setSettingsSaved(false);
          }}
        >
          <option value="instant">Сразу</option>
          <option value="daily">Раз в день</option>
        </select>
      </label>

      <label className="flex max-w-sm items-center justify-between gap-3 rounded-[12px] border border-[#242529] bg-[#1e1e21] p-3">
        <span className="text-[13px] font-semibold text-white">Возврат подачи</span>
        <input
          aria-label="Возврат подачи"
          className="h-5 w-9 accent-[#3a45b4]"
          defaultChecked
          role="switch"
          type="checkbox"
        />
      </label>

      {settingsDirty ? (
        <div
          className="flex flex-col gap-3 rounded-[12px] border border-[#3b321d] bg-[#221d13] p-4 text-[13px] font-medium text-[#f6c66b] sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <span>Есть несохранённые изменения</span>
          <button
            className="h-10 rounded-[10px] border border-[#4450c5] bg-[#3a45b4] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#4855d4]"
            type="button"
            onClick={() => {
              setSettingsDirty(false);
              setSettingsSaved(true);
            }}
          >
            Сохранить
          </button>
        </div>
      ) : (
        <div className="text-[13px] font-medium text-white/60" role="status">
          {settingsSaved ? 'Настройки сохранены' : 'Изменений нет'}
        </div>
      )}
    </section>
  );

  const title = navLabel(activeNav);

  return (
    <div className="flex h-full w-full bg-[#101011] relative overflow-hidden">
      <AnimatePresence mode="wait">
        {currentView === 'questionnaire' && selectedRow && (
          <QuestionnaireScreen
            key={`questionnaire-${selectedRow}`}
            agentId={agentId}
            submissionId={selectedRow}
            draft={selectedIntakeDraft}
            submission={selectedCanonicalSubmission}
            onBack={() => setCurrentView('main')}
            onSubmissionChange={persistQuestionnaireSubmission}
            onUploadFile={usesSupabase ? uploadCanonicalFile : undefined}
          />
        )}
        {currentView === 'upload' && (
          <PreUploadScreen key="upload" onBack={() => setCurrentView('main')} onSaveDraft={handleUploadDraftSave} onComplete={handleUploadComplete} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mobileNavOpen && (
          <div className="md:hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileNavOpen(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
            <motion.aside initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 25, stiffness: 250 }} className="fixed inset-y-0 left-0 w-[280px] bg-[#141416] border-r border-[#202124] z-50 flex flex-col py-3 font-medium shadow-[0_0_40px_rgba(0,0,0,0.5)]">
              {renderNavContent()}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <aside className="hidden md:flex w-[288px] shrink-0 bg-[#161617] border-r border-[#202124] flex-col py-3 z-20">{renderNavContent()}</aside>

      <main className="flex-1 min-w-0 flex flex-col bg-[#141416]">
        <header className="h-[60px] lg:h-16 shrink-0 border-b border-[#202124] flex items-center px-4 lg:px-6 gap-4 bg-[#141416] z-10 sticky top-0">
          <div className="flex items-center gap-3">
            <button aria-label="Меню" onClick={() => setMobileNavOpen(true)} className="md:hidden w-10 h-10 -ml-2 rounded-lg hover:bg-white/5 flex items-center justify-center text-white/70">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-[19px] lg:text-[21px] font-semibold tracking-tight text-white m-0 leading-none">{title}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              aria-label="Новая подача"
              onClick={createPackage}
              className="h-[36px] lg:h-10 px-3.5 bg-[#3a45b4] hover:bg-[#4855d4] text-white rounded-[10px] text-[13px] lg:text-sm font-medium transition-colors flex items-center gap-2 shadow-[0_0_20px_rgba(58,69,180,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Создать пакет</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 lg:p-6 pb-[max(24px,env(safe-area-inset-bottom))]">
          <div className="max-w-[1460px] mx-auto h-full">
            {activeNav === 'documents' && (
              <div>
                <AgentReturnPackagesPanel enabled={usesSupabase} />
                <DraftsScreen
                  onOpenDrawer={handleRowClick}
                  onSubmissionsChange={onSubmissionsChange}
                  submissions={canonicalSubmissions}
                />
              </div>
            )}
            {activeNav === 'settings' && renderSettings()}
            {activeNav === 'actions' && renderActionsList()}
            {activeNav === 'submissions' && <ApplicantsScreen onOpenDrawer={handleRowClick} submissions={submissionCards} />}
          </div>
        </div>
      </main>

      {usesSupabase ? (
        drawerOpen && selectedCanonicalSubmission ? (
          <OperationalSubmissionDrawer
            activeTab="overview"
            onAction={executeAgentSubmissionAction}
            onClose={() => setDrawerOpen(false)}
            onOpenQuestionnaireWorkspace={() => handleOpenQuestionnaire(selectedCanonicalSubmission.id)}
            onUploadFile={uploadCanonicalFile}
            role="agent"
            submission={selectedCanonicalSubmission}
            surface="agent"
          />
        ) : null
      ) : (
        <Drawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          submissionId={selectedRow}
          submission={selectedCanonicalSubmission}
          onOpenQuestionnaire={() => selectedRow && handleOpenQuestionnaire(selectedRow)}
        />
      )}

      <AnimatePresence>
        {usesSupabase && createDrawerOpen && (
          <CreateSubmissionDrawer
            city={createCity}
            familyCount={createFamilyCount}
            onCity={setCreateCity}
            onClose={() => setCreateDrawerOpen(false)}
            onCreate={createCanonicalDraft}
            onFamilyCount={setCreateFamilyCount}
            onPassportFilesSelected={() => undefined}
            onType={setCreateType}
            type={createType}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
