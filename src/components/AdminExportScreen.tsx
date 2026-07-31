import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  ArrowUpDown,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clock3,
  Download,
  FileArchive,
  FileSpreadsheet,
  FolderCheck,
  History,
  IdCard,
  MapPin,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  Shapes,
  UploadCloud,
  User,
  Users,
  X,
  XCircle,
} from "lucide-react";
import {
  emitVisaflowUiEvent,
  useVisaflowBusinessBridge,
} from "../integration/visaflowBusinessBridge";
import { getSupabaseClient } from "../lib/supabase/client";
import { applyExportStateToSelection } from "../modules/submissions/submissionActions";
import { submissionPublicId } from "../modules/submissions/submissionIdentity";
import { requiredPassportReviewMediaSlots } from "../modules/submissions/passportReviewContract";
import {
  buildExportArchiveInputSignature,
  buildExportPackageIdentity,
  exportPackageIdentityMatches,
  exportSummary,
} from "../modules/submissions/exportRules";
import type { ExportPackageIdentity, Submission } from "../modules/submissions/types";
import type { ExportWorkbookArtifact } from "../modules/submissions/exportWorkbook";
import type { ExportMediaZipArtifact } from "../modules/submissions/exportMediaZip";
import {
  AdminContextToggle,
  AdminListHeader,
  AdminQueueToolbar,
  AdminToolbarSelect,
} from "./AdminSurfaceCommon";
import {
  V19MetricCard,
  V19MetricStrip,
  V19QueueCard,
} from "../shared/ui/v19-design-system";
import { OperationalTableHeader } from "../shared/ui/OperationalTableHeader";
import { agentDisplayName } from "../modules/submissions/agentDirectory";
import { cityFilterValuesForSubmissions } from "../modules/submissions/selectors";
import { ExportWorkbookPreview } from "./ExportWorkbookPreview";
import { AdminExportDiagnosticsPanel } from "../modules/submissions/components/AdminExportDiagnosticsPanel";

interface ExportItem {
  id: string;
  publicId: string;
  applicantName: string;
  title: string;
  type: "single" | "family";
  applicantsCount: number;
  country: string;
  city: string;
  appointmentDate: string;
  approvedDate: string;
  selected: boolean;
  readiness: number;
  warnings: number;
  blockers: number;
  files: number;
  agent: string;
  packageSize: string;
  blockerReasons: string[];
  warningReasons: string[];
}

interface PreparedExportPackage {
  archiveInputSignature: string;
  identity: ExportPackageIdentity;
  submissionIds: string[];
  submissions: Submission[];
  workbookArtifact: ExportWorkbookArtifact;
}

interface PreparedExportArchive {
  artifact: ExportMediaZipArtifact;
  prepared: PreparedExportPackage;
}

type ExportQueueTab = "ready" | "selected" | "blocked";
type ExportSort = "tripDate" | "createdAt";
type ExportTypeFilter = "all" | "family" | "single";
type ExportFailureKind =
  | "selection"
  | "workbook"
  | "archive_documents"
  | "archive_stale"
  | "archive_link"
  | "commit";

const opaqueAgentIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isOpaqueAgentId(agentId: string) {
  return opaqueAgentIdPattern.test(agentId.trim());
}

function exportActionFailureNextStep(kind: ExportFailureKind) {
  if (kind === "workbook") {
    return "Проверьте текущий состав пакета и сформируйте Excel заново.";
  }
  if (kind === "archive_documents") {
    return "Проверьте обязательные документы и повторите формирование ZIP.";
  }
  if (kind === "archive_stale") {
    return "Проверьте текущий выбор и сформируйте ZIP заново.";
  }
  if (kind === "archive_link") {
    return "Сформируйте ZIP заново. Если ссылка снова недоступна, обновите страницу.";
  }
  if (kind === "commit") {
    return "Повторите только подтверждение скачивания. Статус подач не изменён.";
  }
  return "Проверьте выбранные подачи и повторите действие.";
}

function safeArchiveFailureMessage(message: string) {
  if (
    !message.trim() ||
    /(supabase|storage|bucket|rls|postgres|pgrst|service[ -]?role|token|https?:\/\/)/iu.test(
      message,
    )
  ) {
    return "Обязательные документы сейчас недоступны для выгрузки.";
  }
  return message;
}

function StatusPill({
  tone,
  children,
}: {
  tone: "green" | "danger" | "blue" | "neutral";
  children: React.ReactNode;
}) {
  const toneClass = {
    green:
      "bg-[var(--v19b-status-success-bg)] text-[var(--v19b-dot-success)] border-[var(--v19b-status-success-border)]",
    danger: "tone-danger",
    blue: "bg-[var(--v19b-color-primary-soft-20)] text-[var(--v19b-color-primary-text)] border-[var(--v19b-color-primary-soft-30)]",
    neutral: "bg-white/5 text-white/55 border-white/10",
  }[tone];

  return (
    <span
      className={`v19-admin-export-status-pill-v2 inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-medium ${toneClass}`}
    >
      {children}
    </span>
  );
}

function ManifestRow({
  icon: Icon,
  label,
  value,
  state = "ok",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  state?: "ok" | "warn" | "neutral";
}) {
  const stateClass =
    state === "ok"
      ? "text-[var(--v19b-dot-success)]"
      : state === "warn"
        ? "text-white/62"
        : "text-white/45";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={`h-4 w-4 shrink-0 ${stateClass}`} />
        <span className="text-[12px] text-white/55">{label}</span>
      </div>
      <span className="shrink-0 text-[12px] font-medium text-white/85">{value}</span>
    </div>
  );
}

function exportItemsFromSubmissions(submissions: Submission[]): ExportItem[] {
  return submissions.flatMap((submission) => {
    const summary = exportSummary([submission]);
    if (submission.status !== "ready_for_export") {
      return [];
    }
    const mainApplicant =
      submission.applicants.find((applicant) => applicant.role === "main") ??
      submission.applicants[0];

    return [
      {
        id: submission.id,
        publicId: submissionPublicId(submission),
        applicantName: mainApplicant?.fullName ?? submission.title,
        title: submission.listTitle ?? submission.title,
        type: submission.type,
        applicantsCount: submission.applicants.length,
        country: submission.country,
        city: submission.city.trim(),
        appointmentDate: `${submission.tripDateFrom} – ${submission.tripDateTo}`,
        approvedDate: submission.updatedAt,
        selected: false,
        readiness: submission.completeness.total,
        warnings: summary.warnings.length,
        blockers: summary.blockers.length,
        files: requiredPassportReviewMediaSlots(submission).length,
        agent: submission.agentId,
        packageSize: `${summary.rowCount} ${rowCountLabel(summary.rowCount)}`,
        blockerReasons: summary.blockers.map((blocker) => blocker.reason),
        warningReasons: summary.warnings.map((warning) => warning.reason),
      },
    ];
  });
}

function dateValue(value: string) {
  const normalized = value.trim();
  const ruDate = normalized.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (ruDate) {
    return Date.parse(`${ruDate[3]}-${ruDate[2]}-${ruDate[1]}T00:00:00.000Z`);
  }
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function countLabel(
  count: number,
  forms: [singular: string, few: string, many: string],
) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return forms[2];
  if (lastDigit === 1) return forms[0];
  if (lastDigit >= 2 && lastDigit <= 4) return forms[1];
  return forms[2];
}

function packageCountLabel(count: number) {
  return countLabel(count, ["пакет", "пакета", "пакетов"]);
}

function applicantCountLabel(count: number) {
  return countLabel(count, ["заявитель", "заявителя", "заявителей"]);
}

function rowCountLabel(count: number) {
  return countLabel(count, ["строка", "строки", "строк"]);
}

function fileCountLabel(count: number) {
  return countLabel(count, ["файл", "файла", "файлов"]);
}

function exportAgentName(agentId: string) {
  const normalizedAgentId = agentId.trim();
  if (isOpaqueAgentId(normalizedAgentId)) {
    return normalizedAgentId.slice(0, 4).toUpperCase();
  }

  const displayName = agentDisplayName(agentId);
  if (displayName === "Агент не указан") return "Не указан";

  return displayName.replace(/^Агент\s+/u, "").replace(/^Local Agent\s+/u, "");
}

function exportAgentFilterLabel(agentId: string) {
  if (agentId === "Все агенты") {
    return agentId;
  }

  return `Агент ${exportAgentName(agentId)}`;
}

export function AdminExportScreen({
  submissions = [],
}: {
  submissions?: Submission[];
}) {
  const bridge = useVisaflowBusinessBridge();
  const realItems = useMemo(
    () => exportItemsFromSubmissions(submissions),
    [submissions],
  );
  const [selectedRealIds, setSelectedRealIds] = useState<string[]>([]);
  const [activeQueueTab, setActiveQueueTab] = useState<ExportQueueTab>("ready");
  const [activeId, setActiveId] = useState("");
  const [agentFilter, setAgentFilter] = useState("Все агенты");
  const [cityFilter, setCityFilter] = useState("Все города");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<ExportSort>("tripDate");
  const [typeFilter, setTypeFilter] = useState<ExportTypeFilter>("all");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportFailureKind, setExportFailureKind] =
    useState<ExportFailureKind>("selection");
  const [exportNotice, setExportNotice] = useState("");
  const [preparedExport, setPreparedExport] = useState<PreparedExportPackage | null>(
    null,
  );
  const [preparedArchive, setPreparedArchive] = useState<PreparedExportArchive | null>(
    null,
  );
  const [workbookDownloadUrl, setWorkbookDownloadUrl] = useState("");
  const [archiveDownloadUrl, setArchiveDownloadUrl] = useState("");
  const [archiveDownloadStarted, setArchiveDownloadStarted] = useState(false);
  const [mobileControlOpen, setMobileControlOpen] = useState(false);
  const exportOperationLockedRef = useRef(false);
  const terminalNoticeSelectionRef = useRef<string | null>(null);

  const beginExportOperation = () => {
    if (exportOperationLockedRef.current) return false;
    exportOperationLockedRef.current = true;
    setIsExporting(true);
    return true;
  };

  const finishExportOperation = () => {
    exportOperationLockedRef.current = false;
    setIsExporting(false);
  };

  const clearPreparedExport = (preserveNotice = false) => {
    setPreparedExport(null);
    setPreparedArchive(null);
    setArchiveDownloadStarted(false);
    if (!preserveNotice) {
      terminalNoticeSelectionRef.current = null;
      setExportNotice("");
    }
  };

  useEffect(() => {
    if (!preparedExport) {
      setWorkbookDownloadUrl("");
      return;
    }
    try {
      const url = URL.createObjectURL(preparedExport.workbookArtifact.blob);
      setWorkbookDownloadUrl(url);
      return () => {
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      };
    } catch {
      setWorkbookDownloadUrl("");
      setExportFailureKind("workbook");
      setExportError("Не удалось подготовить ссылку Excel. Сформируйте файл заново.");
    }
  }, [preparedExport]);

  useEffect(() => {
    if (!preparedArchive) {
      setArchiveDownloadUrl("");
      return;
    }
    try {
      const url = URL.createObjectURL(preparedArchive.artifact.blob);
      setArchiveDownloadUrl(url);
      return () => {
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      };
    } catch {
      setArchiveDownloadUrl("");
      setExportFailureKind("archive_link");
      setExportError("Не удалось подготовить ссылку ZIP. Сформируйте пакет заново.");
    }
  }, [preparedArchive]);

  useEffect(() => {
    setSelectedRealIds((current) => {
      const selectableItems = realItems.filter((item) => item.blockers === 0);
      const available = new Set(selectableItems.map((item) => item.id));
      return current.filter((id) => available.has(id));
    });
    setActiveId((current) => {
      if (realItems.some((item) => item.id === current)) return current;
      return (
        realItems.find((item) => item.blockers === 0)?.id ?? realItems[0]?.id ?? ""
      );
    });
  }, [realItems]);

  const enrichedItems = useMemo(
    () =>
      realItems.map((item) => ({
        ...item,
        selected: selectedRealIds.includes(item.id),
      })),
    [realItems, selectedRealIds],
  );
  const cityOptions = useMemo(
    () => cityFilterValuesForSubmissions(submissions),
    [submissions],
  );
  const agentOptions = useMemo(
    () => [
      "Все агенты",
      ...Array.from(new Set(enrichedItems.map((item) => item.agent))),
    ],
    [enrichedItems],
  );
  const baseFilteredItems = useMemo(() => {
    const searchNeedle = searchQuery.trim().toLowerCase();
    return enrichedItems
      .filter((item) => {
        const agentMatches = agentFilter === "Все агенты" || item.agent === agentFilter;
        const cityMatches = cityFilter === "Все города" || item.city === cityFilter;
        const typeMatches = typeFilter === "all" || item.type === typeFilter;
        const searchMatches =
          !searchNeedle ||
          [item.id, item.applicantName, item.title, item.agent, item.city]
            .join(" ")
            .toLowerCase()
            .includes(searchNeedle);
        return agentMatches && cityMatches && typeMatches && searchMatches;
      })
      .sort((left, right) => {
        if (sortBy === "createdAt") {
          return dateValue(right.approvedDate) - dateValue(left.approvedDate);
        }
        return dateValue(left.appointmentDate) - dateValue(right.appointmentDate);
      });
  }, [agentFilter, cityFilter, enrichedItems, searchQuery, sortBy, typeFilter]);
  const displayItems = useMemo(() => {
    if (activeQueueTab === "selected")
      return baseFilteredItems.filter((item) => item.selected);
    if (activeQueueTab === "blocked")
      return baseFilteredItems.filter((item) => item.blockers > 0);
    return baseFilteredItems.filter((item) => item.blockers === 0);
  }, [activeQueueTab, baseFilteredItems]);
  const selectedItems = useMemo(
    () => enrichedItems.filter((item) => item.selected),
    [enrichedItems],
  );
  const selectedSubmissions = useMemo(
    () => submissions.filter((submission) => selectedRealIds.includes(submission.id)),
    [selectedRealIds, submissions],
  );
  const selectedPlan = useMemo(
    () => exportSummary(selectedSubmissions),
    [selectedSubmissions],
  );
  const selectedSignature = useMemo(
    () => selectedRealIds.slice().sort().join("|"),
    [selectedRealIds],
  );
  const selectedArchiveInputSignature = useMemo(
    () => buildExportArchiveInputSignature(selectedSubmissions),
    [selectedSubmissions],
  );
  const selectedArchiveInputSignatureRef = useRef(selectedArchiveInputSignature);
  selectedArchiveInputSignatureRef.current = selectedArchiveInputSignature;

  useEffect(() => {
    const preserveTerminalNotice =
      terminalNoticeSelectionRef.current !== null &&
      (terminalNoticeSelectionRef.current === selectedSignature ||
        selectedSignature === "");
    setPreparedExport(null);
    setPreparedArchive(null);
    setArchiveDownloadStarted(false);
    setExportError("");
    if (!preserveTerminalNotice) {
      terminalNoticeSelectionRef.current = null;
      setExportNotice("");
    }
  }, [selectedArchiveInputSignature, selectedSignature]);

  const activeItem =
    displayItems.find((item) => item.id === activeId) ??
    displayItems[0] ??
    selectedItems[0];
  const selectedCount = selectedItems.length;
  const availableCount = enrichedItems.filter((item) => item.blockers === 0).length;
  const blockedCount = enrichedItems.filter((item) => item.blockers > 0).length;
  const selectedApplicants = selectedItems.reduce(
    (sum, item) => sum + item.applicantsCount,
    0,
  );
  const selectedFiles = selectedItems.reduce((sum, item) => sum + item.files, 0);
  const selectedWarnings = selectedCount ? selectedPlan.warnings.length : 0;
  const selectedBlockers = selectedCount ? selectedPlan.blockers.length : 0;
  const hasExportBlockers = selectedCount > 0 && selectedBlockers > 0;
  const activeBlockerReasons = activeItem?.blockerReasons ?? [];
  const selectedDiagnosticReasons = hasExportBlockers
    ? selectedPlan.blockers.map((blocker) => blocker.reason)
    : [];
  const diagnosticTargetsSelection =
    activeQueueTab !== "blocked" && selectedDiagnosticReasons.length > 0;
  const diagnosticReasons = diagnosticTargetsSelection
    ? selectedDiagnosticReasons
    : activeBlockerReasons;
  const showBlockedPackageFocus =
    !diagnosticTargetsSelection && activeBlockerReasons.length > 0;
  const diagnosticTitle = showBlockedPackageFocus
    ? `${activeItem?.publicId ?? "Пакет"} нельзя выгрузить`
    : selectedCount > 1
      ? `${selectedCount} ${packageCountLabel(selectedCount)} нельзя выгрузить`
      : "Выбранный пакет нельзя выгрузить";
  const hasActiveFilters =
    activeQueueTab !== "ready" ||
    agentFilter !== "Все агенты" ||
    cityFilter !== "Все города" ||
    searchQuery.length > 0 ||
    sortBy !== "tripDate" ||
    typeFilter !== "all";
  const selectableDisplayItems = displayItems.filter((item) => item.blockers === 0);
  const allDisplaySelected =
    selectableDisplayItems.length > 0 &&
    selectableDisplayItems.every((item) => item.selected);
  const emptyStateCopy =
    activeQueueTab === "selected"
      ? {
          title: "Пакеты не выбраны",
          description: "Вернитесь в «Доступно» и отметьте нужные пакеты.",
        }
      : activeQueueTab === "blocked"
        ? {
            title: "Пакетов с ограничениями нет",
            description: "Все пакеты прошли обязательные проверки.",
          }
        : blockedCount > 0
          ? {
              title: "Нет пакетов без ограничений",
              description: "Откройте «Стоп», чтобы увидеть причины блокировки.",
            }
          : {
              title: "Очередь выгрузки пуста",
              description: "Новые пакеты появятся после принятия проверки.",
            };
  const selectedHistory = selectedSubmissions
    .flatMap((submission) =>
      submission.history.map((item) => ({
        ...item,
        submissionId: submission.id,
      })),
    )
    .slice(0, 3);
  const revealBlockedPackage = () => {
    setActiveQueueTab("blocked");
    setAgentFilter("Все агенты");
    setCityFilter("Все города");
    setSearchQuery("");
    setSortBy("tripDate");
    setTypeFilter("all");
    setMobileControlOpen(false);
  };
  const toggleAll = () => {
    setExportError("");
    clearPreparedExport();
    const selectableItems = displayItems.filter((item) => item.blockers === 0);
    const allSelected =
      selectableItems.length > 0 && selectableItems.every((item) => item.selected);
    setSelectedRealIds(allSelected ? [] : selectableItems.map((item) => item.id));
  };

  const toggleItem = (id: string) => {
    const item = enrichedItems.find((candidate) => candidate.id === id);
    if (!item || item.blockers > 0) return;
    setExportError("");
    clearPreparedExport();
    if (selectedRealIds.includes(id)) {
      const remainingIds = selectedRealIds.filter((selectedId) => selectedId !== id);
      setSelectedRealIds(remainingIds);
      if (activeId === id) {
        setActiveId(remainingIds[0] ?? id);
      }
      return;
    }

    setSelectedRealIds((current) => [...current, id]);
    setActiveId(id);
  };

  const prepareWorkbookForCurrentSelection =
    async (): Promise<PreparedExportPackage | null> => {
      if (selectedCount === 0) {
        setExportFailureKind("selection");
        setExportError("Выберите хотя бы одну подачу для выгрузки.");
        return null;
      }

      if (hasExportBlockers) {
        setExportFailureKind("selection");
        setExportError(
          "Выбранные подачи содержат блокирующие ошибки. Исправьте их перед выгрузкой.",
        );
        return null;
      }

      const submissionIds = selectedItems.map((item) => item.id);
      const [{ createExportWorkbookArtifact }, { verifyExportWorkbookArtifact }] =
        await Promise.all([
          import("../modules/submissions/exportWorkbook"),
          import("../modules/submissions/exportWorkbookVerification"),
        ]);
      const generated = applyExportStateToSelection(
        submissions,
        submissionIds,
        "file_generated",
      );
      let selectedGenerated = generated.filter((submission) =>
        submissionIds.includes(submission.id),
      );

      if (selectedGenerated.length === 0) {
        setExportFailureKind("workbook");
        setExportError(
          "Excel не сформирован: выбранные подачи ещё не готовы к выгрузке.",
        );
        return null;
      }

      if (generated === submissions) {
        const currentPlan = exportSummary(selectedSubmissions);
        const currentIdentity = buildExportPackageIdentity(selectedSubmissions);
        const canReuseGeneratedPackage =
          Boolean(currentIdentity) &&
          currentPlan.ready &&
          (currentPlan.exportState === "file_generated" ||
            currentPlan.exportState === "file_downloaded") &&
          selectedSubmissions.every((submission) => submission.exportPackage);

        if (!canReuseGeneratedPackage) {
          setExportFailureKind("workbook");
          setExportError(
            "Excel не сформирован: выбранные подачи ещё не готовы к выгрузке.",
          );
          return null;
        }

        selectedGenerated = selectedSubmissions;
      }

      const identity = buildExportPackageIdentity(selectedGenerated);
      const archiveInputSignature = buildExportArchiveInputSignature(selectedGenerated);
      const plan = exportSummary(selectedGenerated);
      const hasDownloadableState =
        plan.exportState === "file_generated" || plan.exportState === "file_downloaded";

      if (!identity || !archiveInputSignature || !plan.ready || !hasDownloadableState) {
        setExportFailureKind("workbook");
        setExportError(
          "Пакет изменился или содержит блокирующие ошибки. Проверьте состав и сформируйте Excel заново.",
        );
        return null;
      }

      const workbookArtifact = createExportWorkbookArtifact(plan.rows, identity);
      if (!(await verifyExportWorkbookArtifact(workbookArtifact))) {
        setExportFailureKind("workbook");
        setExportError("Excel не прошёл внутреннюю проверку. Файл не скачан.");
        return null;
      }

      return {
        archiveInputSignature,
        identity,
        submissionIds,
        submissions: selectedGenerated,
        workbookArtifact,
      };
    };

  const handlePrepareExcel = async () => {
    if (!beginExportOperation()) return;
    setExportError("");
    setExportNotice("");
    try {
      const prepared = await prepareWorkbookForCurrentSelection();
      if (!prepared) return;
      if (selectedArchiveInputSignatureRef.current !== prepared.archiveInputSignature) {
        clearPreparedExport();
        setExportFailureKind("workbook");
        setExportError("Данные изменились. Сформируйте Excel заново.");
        return;
      }
      setPreparedArchive(null);
      setArchiveDownloadStarted(false);
      setPreparedExport(prepared);
      setExportNotice(`Excel сформирован: ${prepared.identity.fileName}`);
    } catch {
      setExportFailureKind("workbook");
      setExportError(
        "Не удалось сформировать Excel. Проверьте выбранные подачи и повторите действие.",
      );
    } finally {
      finishExportOperation();
    }
  };

  const handleWorkbookDownloadClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const currentIdentity = buildExportPackageIdentity(selectedSubmissions);
    if (
      !preparedExport ||
      !currentIdentity ||
      preparedExport.archiveInputSignature !== selectedArchiveInputSignature ||
      !exportPackageIdentityMatches(preparedExport.identity, currentIdentity)
    ) {
      event.preventDefault();
      setExportNotice("");
      setExportFailureKind("workbook");
      setExportError("Выбор изменился. Сформируйте Excel заново.");
      return;
    }
    setExportError("");
    setExportNotice(
      `Скачивание Excel начато: ${preparedExport.workbookArtifact.fileName}`,
    );
  };

  const handlePrepareArchive = async () => {
    if (selectedCount === 0 || hasExportBlockers) return;
    if (!beginExportOperation()) return;
    setExportError("");
    setExportNotice("");
    try {
      const prepared =
        preparedExport?.archiveInputSignature === selectedArchiveInputSignature
          ? preparedExport
          : await prepareWorkbookForCurrentSelection();
      if (!prepared) return;
      const { prepareExportMediaZip } =
        await import("../modules/submissions/exportMediaZip");
      const supabaseClient = getSupabaseClient();
      let zipOptions = {};
      if (!supabaseClient) {
        if (!__V19_LOCAL_DEMO_BUILD__) {
          setExportFailureKind("archive_documents");
          setExportError(
            "Обязательные документы сейчас недоступны для выгрузки. Обновите страницу; если ошибка повторится, обратитесь к администратору.",
          );
          return;
        }
        const { buildLocalDemoExportMediaZipOptions } =
          await import("../modules/submissions/exportMediaZipLocalDemo");
        zipOptions = buildLocalDemoExportMediaZipOptions(prepared.submissions);
      }
      const zipArtifactResult = await prepareExportMediaZip(
        prepared.submissions,
        prepared.identity,
        zipOptions,
      );
      if (!zipArtifactResult.ok) {
        setExportFailureKind("archive_documents");
        setExportError(safeArchiveFailureMessage(zipArtifactResult.safeMessage));
        return;
      }
      if (selectedArchiveInputSignatureRef.current !== prepared.archiveInputSignature) {
        clearPreparedExport();
        setExportFailureKind("archive_stale");
        setExportError("Данные изменились. Сформируйте ZIP заново.");
        return;
      }
      setPreparedExport(prepared);
      setArchiveDownloadStarted(false);
      setPreparedArchive({
        artifact: zipArtifactResult.artifact,
        prepared,
      });
      setExportNotice(
        `ZIP проверен: ${zipArtifactResult.artifact.fileName}. Нажмите «Скачать ZIP».`,
      );
    } catch {
      setExportFailureKind("archive_documents");
      setExportError(
        "Не удалось сформировать ZIP. Проверьте обязательные документы и повторите действие.",
      );
    } finally {
      finishExportOperation();
    }
  };

  const commitPreparedArchive = async (archive: PreparedExportArchive) => {
    if (!beginExportOperation()) return;
    terminalNoticeSelectionRef.current = selectedSignature;
    setExportError("");
    setExportNotice("Подтверждаем скачивание и фиксируем пакет…");
    try {
      const { toExportPackageDocumentCommit } =
        await import("../modules/submissions/exportMediaZip");
      if (!bridge.onExportPackages) {
        throw new Error("Обработчик фиксации выгрузки недоступен.");
      }
      await bridge.onExportPackages({
        archiveInputSignature: archive.prepared.archiveInputSignature,
        documentExport: toExportPackageDocumentCommit(archive.artifact),
        packageIdentity: archive.artifact.packageIdentity,
        submissionIds: archive.prepared.submissionIds,
      });
      setExportError("");
      clearPreparedExport(true);
      setExportNotice(
        `Скачивание подтверждено, пакет зафиксирован: ${archive.artifact.fileName}`,
      );
      emitVisaflowUiEvent(bridge, {
        type: "export.start",
        submissionIds: archive.prepared.submissionIds,
      });
    } catch {
      terminalNoticeSelectionRef.current = null;
      setExportFailureKind("commit");
      setExportError("Скачивание ZIP начато, но выгрузка не зафиксирована.");
    } finally {
      finishExportOperation();
    }
  };

  const handleArchiveDownloadClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (exportOperationLockedRef.current) {
      event.preventDefault();
      return;
    }
    const currentIdentity = buildExportPackageIdentity(selectedSubmissions);
    if (
      !preparedArchive ||
      !currentIdentity ||
      preparedArchive.prepared.archiveInputSignature !==
        selectedArchiveInputSignature ||
      !exportPackageIdentityMatches(
        preparedArchive.artifact.packageIdentity,
        currentIdentity,
      )
    ) {
      event.preventDefault();
      setExportNotice("");
      setExportFailureKind("archive_stale");
      setExportError("Выбор изменился. Сформируйте ZIP заново.");
      return;
    }
    setExportError("");
    setExportNotice(
      `ZIP передан браузеру: ${preparedArchive.artifact.fileName}. После сохранения подтвердите скачивание.`,
    );
    setArchiveDownloadStarted(true);
  };

  const handleConfirmArchiveDownload = () => {
    if (exportOperationLockedRef.current || !archiveDownloadStarted) return;
    const currentIdentity = buildExportPackageIdentity(selectedSubmissions);
    if (
      !preparedArchive ||
      !currentIdentity ||
      preparedArchive.prepared.archiveInputSignature !==
        selectedArchiveInputSignature ||
      !exportPackageIdentityMatches(
        preparedArchive.artifact.packageIdentity,
        currentIdentity,
      )
    ) {
      setExportNotice("");
      setExportFailureKind("archive_stale");
      setExportError("Выбор изменился. Сформируйте ZIP заново.");
      return;
    }
    void commitPreparedArchive(preparedArchive);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="v19-admin-screen v19-admin-export-screen-v2"
      data-ui-pattern="operational-table-with-context"
    >
      <section className="v19-admin-export-main-v2">
        <V19MetricStrip>
          <V19MetricCard
            active={activeQueueTab === "ready"}
            detail={packageCountLabel(availableCount)}
            icon={CheckCircle2}
            label="Доступно"
            value={availableCount}
            tone="green"
            onClick={() => setActiveQueueTab("ready")}
          />
          <V19MetricCard
            active={activeQueueTab === "selected"}
            detail={packageCountLabel(selectedCount)}
            icon={PackageCheck}
            label="Выбрано"
            value={selectedCount}
            tone="blue"
            onClick={() => setActiveQueueTab("selected")}
          />
          <V19MetricCard
            active={activeQueueTab === "blocked"}
            detail={packageCountLabel(blockedCount)}
            icon={blockedCount ? XCircle : ShieldCheck}
            label="Стоп"
            value={blockedCount}
            tone={blockedCount ? "red" : "green"}
            onClick={() => setActiveQueueTab("blocked")}
          />
        </V19MetricStrip>

        <AdminContextToggle
          badge={
            hasExportBlockers || (activeItem?.blockers ?? 0) > 0
              ? "Стоп"
              : selectedCount
                ? "Готов"
                : "—"
          }
          badgeClassName={
            hasExportBlockers || (activeItem?.blockers ?? 0) > 0
              ? "tone-danger"
              : "tone-ready"
          }
          className="v19-admin-export-context-toggle-v2"
          detail={
            selectedCount
              ? `${selectedCount} ${packageCountLabel(selectedCount)} · ${selectedApplicants} ${applicantCountLabel(selectedApplicants)}`
              : (activeItem?.title ?? "Пакет не выбран")
          }
          expanded={mobileControlOpen}
          icon={FolderCheck}
          onClick={() => setMobileControlOpen(true)}
          title="Контроль пакета"
        />

        <div className="v19-admin-export-workspace-v2">
          <AdminListHeader
            actionDisabled={
              activeQueueTab !== "ready" || selectableDisplayItems.length === 0
            }
            actionLabel={allDisplaySelected ? "Снять" : "Все"}
            className="v19-admin-export-list-head-v2"
            countLabel={`${displayItems.length} ${packageCountLabel(displayItems.length)}`}
            onAction={toggleAll}
            title={
              activeQueueTab === "ready"
                ? "Пакеты к выгрузке"
                : activeQueueTab === "selected"
                  ? "Выбранные пакеты"
                  : "Требуют решения"
            }
          />

          <AdminQueueToolbar
            actionDisabled={!hasActiveFilters}
            actionIcon={RotateCcw}
            cityFilter={cityFilter}
            cityOptions={cityOptions}
            filterLabel="Сбросить фильтры выгрузки"
            controls={
              <>
                <AdminToolbarSelect<ExportSort>
                  icon={ArrowUpDown}
                  label="Сортировка"
                  value={sortBy}
                  onChange={setSortBy}
                  options={[
                    { value: "tripDate", label: "По дате вылета" },
                    { value: "createdAt", label: "По дате создания" },
                  ]}
                />
                <AdminToolbarSelect<ExportTypeFilter>
                  icon={Shapes}
                  label="Тип"
                  value={typeFilter}
                  onChange={setTypeFilter}
                  options={[
                    { value: "all", label: "Все типы" },
                    { value: "family", label: "Семьи" },
                    { value: "single", label: "Заявители" },
                  ]}
                />
                <AdminToolbarSelect<string>
                  icon={User}
                  label="Агент"
                  value={agentFilter}
                  onChange={setAgentFilter}
                  options={agentOptions.map((agent) => ({
                    value: agent,
                    label: exportAgentFilterLabel(agent),
                  }))}
                />
              </>
            }
            onCityFilterChange={setCityFilter}
            onFilterClick={() => {
              setActiveQueueTab("ready");
              setAgentFilter("Все агенты");
              setCityFilter("Все города");
              setSearchQuery("");
              setSortBy("tripDate");
              setTypeFilter("all");
            }}
            onSearchChange={setSearchQuery}
            searchPlaceholder="ID, семья или агент"
            searchValue={searchQuery}
          />

          <OperationalTableHeader
            className="v19-admin-export-table-head-v2"
            columns={[
              { key: "applicant", label: "ID / имя и фамилия" },
              { key: "dates", label: "Даты поездки" },
              { key: "city", label: "Город" },
              { key: "agent", label: "Агент" },
            ]}
            leadingControl={
              <button
                aria-label={
                  allDisplaySelected
                    ? "Снять выбор со всех подач"
                    : "Выбрать все подачи"
                }
                aria-pressed={allDisplaySelected}
                onClick={toggleAll}
                className={`v19-admin-export-select-all-v2 ${allDisplaySelected ? "is-selected" : ""}`}
                type="button"
              >
                {allDisplaySelected ? <CheckSquare aria-hidden="true" /> : null}
              </button>
            }
          />

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {displayItems.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-4 py-20 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/5 bg-white/5">
                  <CheckCircle2 className="h-5 w-5 text-white/35" />
                </div>
                <h3 className="mb-1 text-[15px] font-semibold text-white">
                  {emptyStateCopy.title}
                </h3>
                <p className="text-[13px] text-white/40">
                  {emptyStateCopy.description}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {displayItems.map((item) => (
                  <V19QueueCard
                    as="label"
                    aria-label={
                      item.blockers > 0
                        ? `Показать причины для ${item.title}`
                        : undefined
                    }
                    key={item.id}
                    className={`export-row v19-admin-export-row-v2 ${item.selected ? "is-selected" : ""} ${activeId === item.id ? "is-active" : ""} ${item.blockers > 0 ? "is-blocked" : ""}`}
                    data-testid={`admin-export-row-${item.id}`}
                    onClick={() => setActiveId(item.id)}
                    onKeyDown={(event) => {
                      if (
                        item.blockers > 0 &&
                        (event.key === "Enter" || event.key === " ")
                      ) {
                        event.preventDefault();
                        setActiveId(item.id);
                      }
                    }}
                    role={item.blockers > 0 ? "button" : undefined}
                    tabIndex={item.blockers > 0 ? 0 : undefined}
                  >
                    <input
                      aria-label={`Выбрать ${item.title}`}
                      checked={item.selected}
                      disabled={item.blockers > 0}
                      className="h-5 w-5 shrink-0 accent-[var(--v19-depth-accent)]"
                      type="checkbox"
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => toggleItem(item.id)}
                    />

                    <div className="v19-admin-export-row-identity-v2 min-w-0">
                      <span aria-hidden="true" className="v19-admin-export-row-icon-v2">
                        <IdCard />
                      </span>
                      <div className="v19-admin-export-row-copy-v2">
                        <span className="v19-admin-export-row-public-id-v2">
                          {item.publicId}
                        </span>
                        <strong className="v19-admin-export-row-title-v2">
                          {item.applicantName}
                        </strong>
                      </div>
                    </div>

                    <div className="v19-admin-export-row-dates-v2">
                      <span aria-hidden="true" className="v19-admin-export-row-icon-v2">
                        <CalendarDays />
                      </span>
                      <small className="v19-admin-export-row-label-v2">
                        Даты поездки
                      </small>
                      <span className="v19-admin-export-row-value-v2">
                        {item.appointmentDate}
                      </span>
                    </div>

                    <div className="v19-admin-export-row-city-v2">
                      <span aria-hidden="true" className="v19-admin-export-row-icon-v2">
                        <MapPin />
                      </span>
                      <small className="v19-admin-export-row-label-v2">Город</small>
                      <span className="v19-admin-export-row-value-v2">{item.city}</span>
                    </div>

                    <div
                      className={
                        isOpaqueAgentId(item.agent)
                          ? "v19-admin-export-row-agent-v2 is-opaque-agent"
                          : "v19-admin-export-row-agent-v2"
                      }
                    >
                      <span aria-hidden="true" className="v19-admin-export-row-icon-v2">
                        <User />
                      </span>
                      <small className="v19-admin-export-row-label-v2">Агент</small>
                      <span className="v19-admin-export-row-value-v2">
                        {exportAgentName(item.agent)}
                      </span>
                    </div>
                  </V19QueueCard>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <aside
        aria-label="Контроль пакета"
        className={`v19-admin-export-rail-v2 ${mobileControlOpen ? "is-mobile-open" : ""}`}
      >
        <div className="v19-admin-export-rail-head-v2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--v19b-color-primary-text)]">
                Выгрузка
              </div>
              <h3 className="mt-1 text-[20px] font-semibold tracking-tight text-white">
                Контроль пакета
              </h3>
              <p className="mt-2 text-[12px] leading-relaxed text-white/45">
                Состав, проверки, Excel и обязательные документы перед скачиванием.
              </p>
            </div>
            <div className="v19-admin-export-rail-icon-v2">
              <FolderCheck className="h-5 w-5" />
            </div>
            <button
              aria-label="Закрыть контроль пакета"
              className="v19-admin-export-rail-close-v2"
              type="button"
              onClick={() => setMobileControlOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
          </div>
        </div>

        <div
          aria-label="Панель контроля выгрузки"
          className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5"
          role="region"
          tabIndex={0}
        >
          <AdminExportDiagnosticsPanel
            onShowPackage={showBlockedPackageFocus ? revealBlockedPackage : undefined}
            reasons={diagnosticReasons}
            title={diagnosticTitle}
          />

          <div className="rounded-2xl border border-[#242529] bg-[#141416] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[12px] text-white/45">Активный пакет</div>
                <div className="mt-1 text-[15px] font-semibold text-white">
                  {activeItem?.title ?? "Не выбран"}
                </div>
              </div>
              {activeItem && (
                <StatusPill
                  tone={
                    activeItem.blockers > 0
                      ? "danger"
                      : activeItem.warnings > 0
                        ? "blue"
                        : "green"
                  }
                >
                  {activeItem.blockers > 0
                    ? "заблокирован"
                    : diagnosticTargetsSelection
                      ? "сам пакет готов"
                      : activeItem.warnings > 0
                        ? "есть предупреждения"
                        : "готов"}
                </StatusPill>
              )}
            </div>
            {activeItem && (
              <div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-xl bg-white/[0.03] p-3">
                  <div className="text-white/35">Заявители</div>
                  <div className="mt-1 font-semibold text-white">
                    {activeItem.applicantsCount}
                  </div>
                </div>
                <div className="rounded-xl bg-white/[0.03] p-3">
                  <div className="text-white/35">Город</div>
                  <div className="mt-1 font-semibold text-white">{activeItem.city}</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] p-3">
                  <div className="text-white/35">Файлы</div>
                  <div className="mt-1 font-semibold text-white">
                    {activeItem.files}
                  </div>
                </div>
                <div className="rounded-xl bg-white/[0.03] p-3">
                  <div className="text-white/35">Размер</div>
                  <div className="mt-1 font-semibold text-white">
                    {activeItem.packageSize}
                  </div>
                </div>
              </div>
            )}
          </div>

          {selectedCount > 0 && diagnosticReasons.length === 0 ? (
            <div className="rounded-2xl border border-[#242529] bg-[#141416] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-[14px] font-semibold text-white">
                  Проверка перед выгрузкой
                </h4>
                <StatusPill
                  tone={
                    selectedCount === 0
                      ? "neutral"
                      : hasExportBlockers
                        ? "danger"
                        : "green"
                  }
                >
                  {selectedCount === 0
                    ? "нет выбора"
                    : hasExportBlockers
                      ? "нужна правка"
                      : "можно выгружать"}
                </StatusPill>
              </div>
              <div className="export-preview mb-3 rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2 text-[12px] font-medium text-white/70">
                {selectedCount ? "Пакет выбран" : "Пакет не выбран"}
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <button
                  className="h-9 rounded-[9px] border border-[#242529] bg-[#1e1e21] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:text-white/45"
                  disabled={selectedCount === 0 || hasExportBlockers || isExporting}
                  type="button"
                  onClick={handlePrepareExcel}
                >
                  {preparedExport ? "Excel готов" : "Сформировать Excel"}
                </button>
                {preparedExport && workbookDownloadUrl ? (
                  <a
                    className="flex h-9 items-center justify-center rounded-[9px] border border-[#242529] bg-[#1e1e21] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#27272b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19-depth-focus)]"
                    download={preparedExport.workbookArtifact.fileName}
                    href={workbookDownloadUrl}
                    onClick={handleWorkbookDownloadClick}
                  >
                    Скачать Excel
                  </a>
                ) : (
                  <button
                    className="h-9 rounded-[9px] border border-[#242529] bg-[#1e1e21] px-3 text-[12px] font-semibold text-white/45 disabled:cursor-not-allowed"
                    disabled
                    type="button"
                    title="Сначала сформируйте Excel"
                  >
                    Скачать Excel
                  </button>
                )}
              </div>
              <div className="space-y-2">
                <ManifestRow
                  icon={ShieldCheck}
                  label="Блокирующие ошибки"
                  value={`${selectedBlockers}`}
                  state={selectedBlockers ? "warn" : "ok"}
                />
                <ManifestRow
                  icon={FileSpreadsheet}
                  label="Строки Excel"
                  value={`${selectedPlan.rowCount} ${rowCountLabel(selectedPlan.rowCount)}`}
                  state={selectedCount ? "ok" : "neutral"}
                />
                <ManifestRow
                  icon={FileArchive}
                  label="Обязательные документы"
                  value={`${selectedFiles} ${fileCountLabel(selectedFiles)}`}
                  state={selectedCount ? "ok" : "neutral"}
                />
              </div>
              {selectedWarnings > 0 ? (
                <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.025] p-3">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-white/72">
                    <AlertTriangle className="h-3.5 w-3.5 text-[var(--v19b-color-primary-text)]" />
                    Можно выгрузить, но стоит проверить
                  </div>
                  <div className="space-y-1.5">
                    {selectedPlan.warnings.map((item) => (
                      <div
                        key={item.reason}
                        className="text-[11px] leading-snug text-white/55"
                      >
                        {item.reason}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedCount > 0 && !hasExportBlockers ? (
                <div className="mt-3">
                  <ExportWorkbookPreview preview={selectedPlan.preview} />
                </div>
              ) : null}
            </div>
          ) : null}

          {selectedCount > 0 && diagnosticReasons.length === 0 ? (
            <div className="rounded-2xl border border-[#242529] bg-[#141416] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-[14px] font-semibold text-white">
                  Состав выгрузки
                </h4>
                <span className="text-[12px] text-white/40">
                  {selectedCount} {packageCountLabel(selectedCount)}
                </span>
              </div>
              <div className="space-y-2">
                {selectedItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-[12px] text-white/35">
                    Выберите пакеты слева
                  </div>
                ) : (
                  selectedItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.025] p-3"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--v19b-color-primary-soft-20)] text-[var(--v19b-color-primary-text)]">
                        {item.type === "family" ? (
                          <Users className="h-4 w-4" />
                        ) : (
                          <User className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium text-white/85">
                          {item.title}
                        </div>
                        <div className="mt-0.5 text-[11px] text-white/35">
                          {item.publicId} · {item.applicantsCount}{" "}
                          {applicantCountLabel(item.applicantsCount)}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-white/25" />
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {selectedHistory.length > 0 && diagnosticReasons.length === 0 ? (
            <div className="rounded-2xl border border-[#242529] bg-[#141416] p-4">
              <div className="mb-3 flex items-center gap-2">
                <History className="h-4 w-4 text-white/40" />
                <h4 className="text-[14px] font-semibold text-white">
                  История сегодня
                </h4>
              </div>
              <div className="space-y-3 border-l border-white/10 pl-4">
                {selectedHistory.map((item) => (
                  <div key={`${item.submissionId}-${item.id}`}>
                    <div className="text-[12px] font-medium text-white/75">
                      {item.text}
                    </div>
                    <div className="text-[11px] text-white/35">
                      {item.at} · {item.source ?? "system"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-[#242529] bg-[#1a1a1d] p-4">
          {preparedArchive && archiveDownloadUrl && archiveDownloadStarted ? (
            <div className="space-y-2">
              <button
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#202126] text-[14px] font-semibold text-white shadow-[0_0_28px_rgba(111,100,255,0.16)] transition-colors hover:bg-[#2a2b32] disabled:cursor-wait disabled:opacity-60"
                data-testid="confirm-export-download"
                disabled={isExporting}
                onClick={handleConfirmArchiveDownload}
                type="button"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isExporting ? "Фиксируем выгрузку…" : "Подтвердить скачивание"}
              </button>
              <a
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#242529] bg-[#1e1e21] text-[12px] font-semibold text-white/75 transition-colors hover:bg-[#27272b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19-depth-focus)]"
                data-testid="repeat-export-download"
                download={preparedArchive.artifact.fileName}
                href={archiveDownloadUrl}
                onClick={handleArchiveDownloadClick}
              >
                <Download className="h-4 w-4" />
                Скачать ZIP повторно
              </a>
            </div>
          ) : preparedArchive && archiveDownloadUrl ? (
            <a
              aria-disabled={isExporting}
              className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--v19-depth-accent)] text-[14px] font-semibold text-[var(--v19-depth-text-strong)] shadow-[var(--v19-depth-inner-highlight)] transition-colors hover:bg-[var(--v19-depth-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19-depth-focus)] ${isExporting ? "cursor-wait opacity-60" : ""}`}
              data-testid="export-download"
              download={preparedArchive.artifact.fileName}
              href={archiveDownloadUrl}
              onClick={handleArchiveDownloadClick}
            >
              <Download className="h-4 w-4" />
              Скачать ZIP
              <ArrowRight className="h-4 w-4" />
            </a>
          ) : (
            <button
              onClick={handlePrepareArchive}
              disabled={selectedCount === 0 || isExporting || hasExportBlockers}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--v19-depth-accent)] text-[14px] font-semibold text-[var(--v19-depth-text-strong)] shadow-[var(--v19-depth-inner-highlight)] transition-colors hover:bg-[var(--v19-depth-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--v19-depth-control)] disabled:text-[var(--v19-depth-text-faint)] disabled:shadow-none"
            >
              {isExporting ? (
                <UploadCloud className="h-4 w-4 animate-pulse" />
              ) : (
                <FileArchive className="h-4 w-4" />
              )}
              {isExporting ? "Формируем пакет…" : "Сформировать ZIP с Excel"}
              {!isExporting && <ArrowRight className="h-4 w-4" />}
            </button>
          )}
          <div
            aria-atomic="true"
            aria-live={exportError ? "assertive" : "polite"}
            className={`mt-2 ${exportError ? "rounded-xl border border-[var(--v19b-admin-red-border)] bg-[var(--v19b-admin-red-soft)] p-3 text-left" : "flex items-center justify-center gap-2 text-[11px]"} ${exportError ? "text-[var(--vf-red-soft-text)]" : exportNotice ? "text-[var(--v19b-color-primary-text)]" : "text-white/35"}`}
            data-testid="export-action-feedback"
            id="export-action-hint"
            role={exportError ? "alert" : "status"}
          >
            {exportError ? (
              <div className="flex items-start gap-2.5">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="text-[12px] font-semibold text-white">
                    Выгрузка не выполнена
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed">{exportError}</p>
                  <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/55">
                    {exportActionFailureNextStep(exportFailureKind)}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <Clock3 className="h-3.5 w-3.5" />{" "}
                {exportNotice ||
                  (selectedCount
                    ? hasExportBlockers
                      ? "Устраните блокирующие ошибки выше"
                      : preparedArchive
                        ? "ZIP проверен, можно скачивать"
                        : preparedExport
                          ? "Excel готов и будет добавлен в ZIP"
                          : "ZIP включает Excel и обязательные документы"
                    : showBlockedPackageFocus
                      ? "Исправьте пакет перед выгрузкой"
                      : "Выберите хотя бы одну подачу")}
              </>
            )}
          </div>
        </div>
      </aside>
      {mobileControlOpen ? (
        <button
          aria-label="Закрыть контроль пакета"
          className="v19-admin-export-backdrop-v2"
          type="button"
          onClick={() => setMobileControlOpen(false)}
        />
      ) : null}
    </motion.div>
  );
}
