import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowUpDown,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Download,
  FolderCheck,
  IdCard,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Shapes,
  UploadCloud,
  User,
  X,
  XCircle,
} from "lucide-react";
import { useExperienceReducedMotion } from "../shared/ui/experiencePreferences";
import { workspaceSurfaceMotion } from "./workspaceSurfaceMotion";
import { useModalSheetFocus } from "../shared/ui/useModalSheetFocus";
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
import {
  adminDocumentPackageExportEnabled,
  assertAdminDocumentPackageExportEnabled,
} from "../modules/submissions/adminExportActions";
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
  | "authority"
  | "workbook"
  | "archive_documents"
  | "archive_stale"
  | "archive_link"
  | "commit";

function exportActionFailureNextStep(kind: ExportFailureKind) {
  if (kind === "authority") {
    return "Сформируйте Excel. ZIP станет доступен после включения серверного контракта выгрузки.";
  }
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

const opaqueAgentIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function exportAgentName(agentId: string) {
  if (opaqueAgentIdPattern.test(agentId.trim())) return "—";

  const displayName = agentDisplayName(agentId);
  if (displayName === "Агент не указан") return "—";

  return displayName
    .replace(/^Агент\s+/u, "")
    .replace(/^Local Agent\s+/u, "")
    .replace(/^Agent\s+/u, "");
}

export function AdminExportScreen({
  submissions = [],
}: {
  submissions?: Submission[];
}) {
  const prefersReducedMotion = useExperienceReducedMotion();
  const surfaceMotion = workspaceSurfaceMotion(Boolean(prefersReducedMotion));
  const bridge = useVisaflowBusinessBridge();
  const realItems = useMemo(
    () => exportItemsFromSubmissions(submissions),
    [submissions],
  );
  const [selectedRealIds, setSelectedRealIds] = useState<string[]>([]);
  const [activeQueueTab, setActiveQueueTab] = useState<ExportQueueTab>("ready");
  const [activeId, setActiveId] = useState("");
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
  const [archiveDownloadStarted, setArchiveDownloadStarted] = useState(false);
  const [mobileControlOpen, setMobileControlOpen] = useState(false);
  const mobileControlSheetRef = useRef<HTMLElement>(null);
  const closeMobileControl = useCallback(() => setMobileControlOpen(false), []);
  const mobileControlModalOpen = useModalSheetFocus({
    mediaQuery: "(max-width: 1279px)",
    onClose: closeMobileControl,
    open: mobileControlOpen,
    sheetRef: mobileControlSheetRef,
  });
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
    setSelectedRealIds((current) => {
      const selectableItems = realItems.filter((item) => item.blockers === 0);
      const available = new Set(selectableItems.map((item) => item.id));
      return current.filter((id) => available.has(id));
    });
    setActiveId((current) => {
      if (realItems.some((item) => item.id === current)) return current;
      return "";
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
  const baseFilteredItems = useMemo(() => {
    const searchNeedle = searchQuery.trim().toLowerCase();
    return enrichedItems
      .filter((item) => {
        const cityMatches = cityFilter === "Все города" || item.city === cityFilter;
        const typeMatches = typeFilter === "all" || item.type === typeFilter;
        const searchMatches =
          !searchNeedle ||
          [item.id, item.applicantName, item.title, item.agent, item.city]
            .join(" ")
            .toLowerCase()
            .includes(searchNeedle);
        return cityMatches && typeMatches && searchMatches;
      })
      .sort((left, right) => {
        if (sortBy === "createdAt") {
          return dateValue(right.approvedDate) - dateValue(left.approvedDate);
        }
        return dateValue(left.appointmentDate) - dateValue(right.appointmentDate);
      });
  }, [cityFilter, enrichedItems, searchQuery, sortBy, typeFilter]);
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
  const hasExplicitActiveItem =
    activeId.length > 0 && displayItems.some((item) => item.id === activeId);
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
  const excelDownloadCompleted =
    !adminDocumentPackageExportEnabled &&
    Boolean(preparedExport) &&
    exportNotice.startsWith("Excel скачан:");
  const activeBlockerReasons = activeItem?.blockerReasons ?? [];
  const selectedDiagnosticReasons = hasExportBlockers
    ? selectedPlan.blockers.map((blocker) => blocker.reason)
    : [];
  const diagnosticTargetsSelection =
    activeQueueTab !== "blocked" && selectedDiagnosticReasons.length > 0;
  const diagnosticReasons = diagnosticTargetsSelection
    ? selectedDiagnosticReasons
    : activeBlockerReasons;
  const railHasUsefulContext =
    selectedCount > 0 ||
    hasExplicitActiveItem ||
    (activeQueueTab === "blocked" && diagnosticReasons.length > 0) ||
    Boolean(exportError) ||
    Boolean(exportNotice);
  const showBlockedPackageFocus =
    !diagnosticTargetsSelection && activeBlockerReasons.length > 0;
  const diagnosticTitle = showBlockedPackageFocus
    ? `${activeItem?.publicId ?? "Пакет"} нельзя выгрузить`
    : selectedCount > 1
      ? `${selectedCount} ${packageCountLabel(selectedCount)} нельзя выгрузить`
      : "Выбранный пакет нельзя выгрузить";
  const railSummaryTargetsSelection = selectedCount > 0;
  const railSummaryTitle = railSummaryTargetsSelection
    ? `${selectedCount} ${packageCountLabel(selectedCount)}`
    : (activeItem?.title ?? "Пакет не выбран");
  const railSummaryDiagnosticReasons = railSummaryTargetsSelection
    ? selectedDiagnosticReasons
    : activeBlockerReasons;
  const railSummaryStatusTone: "danger" | "green" | "neutral" =
    railSummaryDiagnosticReasons.length
      ? "danger"
      : railSummaryTargetsSelection || activeItem
        ? "green"
        : "neutral";
  const railSummaryStatusLabel = railSummaryDiagnosticReasons.length
    ? "есть блокеры"
    : railSummaryTargetsSelection
      ? "готово"
      : activeItem
        ? "готов к выбору"
        : "нет пакета";
  const railSummaryMetrics: Array<{
    label: string;
    value: number | string;
    wide?: boolean;
  }> = railSummaryTargetsSelection
    ? [
        { label: "Пакеты", value: selectedCount },
        { label: "Заявители", value: selectedApplicants },
        { label: "Файлы", value: selectedFiles },
        { label: "Строки Excel", value: selectedPlan.rowCount },
        {
          label: "Город",
          value: [...new Set(selectedItems.map((item) => item.city))].join(", "),
          wide: true,
        },
      ]
    : activeItem
      ? [
          { label: "Готовность", value: `${activeItem.readiness}%` },
          { label: "Заявители", value: activeItem.applicantsCount },
          { label: "Файлы", value: activeItem.files },
          { label: "Ограничения", value: activeItem.blockers },
          { label: "Даты поездки", value: activeItem.appointmentDate, wide: true },
          { label: "Город", value: activeItem.city, wide: true },
        ]
      : [];
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
  const revealBlockedPackage = () => {
    setActiveQueueTab("blocked");
    setCityFilter("Все города");
    setSearchQuery("");
    setSortBy("tripDate");
    setTypeFilter("all");
    closeMobileControl();
  };
  useEffect(() => {
    if (!railHasUsefulContext) closeMobileControl();
  }, [closeMobileControl, railHasUsefulContext]);
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

  const prepareArchiveForCurrentSelection =
    async (): Promise<PreparedExportArchive | null> => {
      if (selectedCount === 0 || hasExportBlockers) return null;
      setExportError("");
      setExportNotice("");
      try {
        assertAdminDocumentPackageExportEnabled();
        const prepared =
          preparedExport?.archiveInputSignature === selectedArchiveInputSignature
            ? preparedExport
            : await prepareWorkbookForCurrentSelection();
        if (!prepared) return null;
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
            return null;
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
          return null;
        }
        if (
          selectedArchiveInputSignatureRef.current !== prepared.archiveInputSignature
        ) {
          clearPreparedExport();
          setExportFailureKind("archive_stale");
          setExportError("Данные изменились. Сформируйте ZIP заново.");
          return null;
        }
        setPreparedExport(prepared);
        const archive = {
          artifact: zipArtifactResult.artifact,
          prepared,
        };
        return archive;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Действие недоступно в текущем статусе"
        ) {
          setExportFailureKind("authority");
          setExportError(error.message);
          return null;
        }
        setExportFailureKind("archive_documents");
        setExportError(
          "Не удалось сформировать ZIP. Проверьте обязательные документы и повторите действие.",
        );
        return null;
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

  const handleDownloadBundle = async () => {
    if (preparedArchive && archiveDownloadStarted) {
      const currentIdentity = buildExportPackageIdentity(selectedSubmissions);
      if (
        !currentIdentity ||
        preparedArchive.prepared.archiveInputSignature !==
          selectedArchiveInputSignature ||
        !exportPackageIdentityMatches(
          preparedArchive.artifact.packageIdentity,
          currentIdentity,
        )
      ) {
        clearPreparedExport();
        setExportFailureKind("archive_stale");
        setExportError("Выбор изменился. Подготовьте выгрузку заново.");
        return;
      }
      await commitPreparedArchive(preparedArchive);
      return;
    }

    if (selectedCount === 0 || hasExportBlockers || !beginExportOperation()) return;
    let downloadUrl = "";
    try {
      if (!adminDocumentPackageExportEnabled) {
        const prepared = await prepareWorkbookForCurrentSelection();
        if (!prepared) return;
        const { downloadPreparedExportWorkbookArtifact } =
          await import("../modules/submissions/exportWorkbook");
        const result = downloadPreparedExportWorkbookArtifact(
          prepared.workbookArtifact,
        );
        if (!result.ok) {
          setExportFailureKind("workbook");
          setExportError(result.safeMessage);
          return;
        }
        setPreparedExport(prepared);
        setExportError("");
        setExportNotice(`Excel скачан: ${result.fileName}`);
        return;
      }

      const archive = await prepareArchiveForCurrentSelection();
      if (!archive) return;
      const currentIdentity = buildExportPackageIdentity(selectedSubmissions);
      if (
        !currentIdentity ||
        archive.prepared.archiveInputSignature !== selectedArchiveInputSignature ||
        !exportPackageIdentityMatches(archive.artifact.packageIdentity, currentIdentity)
      ) {
        setExportFailureKind("archive_stale");
        setExportError("Выбор изменился. Подготовьте выгрузку заново.");
        return;
      }

      downloadUrl = URL.createObjectURL(archive.artifact.blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = archive.artifact.fileName;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      setPreparedArchive(archive);
      setArchiveDownloadStarted(true);
      setExportError("");
      setExportNotice(
        "ZIP с Excel передан браузеру. Подтвердите скачивание отдельным нажатием.",
      );
    } catch {
      setExportFailureKind(
        adminDocumentPackageExportEnabled ? "archive_link" : "workbook",
      );
      setExportError(
        adminDocumentPackageExportEnabled
          ? "Не удалось подготовить скачивание. Повторите действие."
          : "Не удалось подготовить Excel. Проверьте пакет и повторите действие.",
      );
    } finally {
      if (exportOperationLockedRef.current) finishExportOperation();
      if (downloadUrl) {
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
      }
    }
  };

  return (
    <motion.div
      {...surfaceMotion}
      className={`v19-admin-screen v19-admin-export-screen-v2 ${railHasUsefulContext ? "has-context-rail" : "without-context-rail"}`}
      data-has-export-context={railHasUsefulContext ? "true" : "false"}
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

        {railHasUsefulContext ? (
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
        ) : null}

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
            cityFilter={cityFilter}
            cityOptions={cityOptions}
            onCityFilterChange={setCityFilter}
            onSearchChange={setSearchQuery}
            searchAction={
              <div
                aria-label="Фильтры выгрузки"
                className="v19-inline-filter-buttons"
                role="group"
              >
                <AdminToolbarSelect<ExportSort>
                  className={`v19-admin-export-toolbar-control v19-admin-export-toolbar-control--sort ${sortBy !== "tripDate" ? "is-active" : ""}`}
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
                  className={`v19-admin-export-toolbar-control ${typeFilter !== "all" ? "is-active" : ""}`}
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
                  className={`v19-admin-export-toolbar-control ${cityFilter !== "Все города" ? "is-active" : ""}`}
                  icon={MapPin}
                  label="Город"
                  value={cityFilter}
                  onChange={setCityFilter}
                  options={cityOptions.map((city) => ({
                    value: city,
                    label: city === "Все города" ? "Города" : city,
                  }))}
                />
              </div>
            }
            searchPlaceholder="ID, семья или агент"
            searchValue={searchQuery}
            showCityFilter={false}
          />

          <OperationalTableHeader
            className="v19-admin-export-table-head-v2"
            columns={[
              { key: "applicant", label: "ID / имя и фамилия" },
              { key: "dates", label: "Даты поездки" },
              { key: "city", label: "Город" },
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

                    <div
                      aria-label={`Даты поездки: ${item.appointmentDate}`}
                      className="v19-admin-export-row-dates-v2"
                      role="group"
                    >
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

                    <div
                      aria-label={`Город: ${item.city}`}
                      className="v19-admin-export-row-city-v2"
                      role="group"
                    >
                      <span aria-hidden="true" className="v19-admin-export-row-icon-v2">
                        <MapPin />
                      </span>
                      <small className="v19-admin-export-row-label-v2">Город</small>
                      <span className="v19-admin-export-row-value-v2">{item.city}</span>
                    </div>

                    <div
                      aria-label={`Агент: ${exportAgentName(item.agent)}`}
                      className="v19-admin-export-row-agent-v2"
                      role="group"
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

      {railHasUsefulContext ? (
        <aside
          aria-label="Контроль пакета"
          aria-modal={mobileControlModalOpen ? "true" : undefined}
          className={`v19-admin-export-rail-v2 ${mobileControlOpen ? "is-mobile-open" : ""}`}
          ref={mobileControlSheetRef}
          role={mobileControlModalOpen ? "dialog" : undefined}
          tabIndex={-1}
        >
          <button
            aria-label="Закрыть контроль пакета"
            className="v19-admin-export-rail-close-v2 v19-admin-export-rail-close-floating-v2"
            type="button"
            onClick={closeMobileControl}
          >
            <X aria-hidden="true" />
          </button>

          <div
            aria-label="Панель контроля выгрузки"
            className="v19-admin-export-rail-content-v2 min-h-0 flex-1 overflow-y-auto p-5 space-y-5"
            role="region"
            tabIndex={0}
          >
            <AdminExportDiagnosticsPanel
              onShowPackage={showBlockedPackageFocus ? revealBlockedPackage : undefined}
              reasons={diagnosticReasons}
              title={diagnosticTitle}
            />

            <section
              aria-label="Текущая выгрузка"
              className="v19-admin-export-summary-v2 rounded-2xl border border-[#242529] bg-[#141416] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[12px] text-white/45">
                    {railSummaryTargetsSelection
                      ? "Текущая выгрузка"
                      : "Пакет в фокусе"}
                  </div>
                  <div className="mt-1 flex min-w-0 items-center gap-2">
                    <div className="truncate text-[15px] font-semibold text-white">
                      {railSummaryTitle}
                    </div>
                    {!railSummaryTargetsSelection && activeItem ? (
                      <span className="shrink-0 rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] font-medium text-white/60">
                        {activeItem.publicId}
                      </span>
                    ) : null}
                  </div>
                </div>
                <StatusPill tone={railSummaryStatusTone}>
                  {railSummaryStatusLabel}
                </StatusPill>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
                {railSummaryMetrics.map((metric) => (
                  <div
                    className={`${metric.wide ? "col-span-2" : ""} rounded-xl bg-white/[0.03] p-3`}
                    key={metric.label}
                  >
                    <div className="text-white/35">{metric.label}</div>
                    <div className="mt-1 truncate font-semibold text-white">
                      {metric.value}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-white/45">
                {railSummaryTargetsSelection
                  ? "Excel и обязательные документы будут подготовлены автоматически при скачивании."
                  : railSummaryDiagnosticReasons.length > 0
                    ? "Исправьте ограничения выше, затем добавьте пакет в выгрузку."
                    : "Отметьте пакет в списке, чтобы добавить его в текущую выгрузку."}
              </p>
              {selectedWarnings > 0 ? (
                <div className="mt-3 text-[11px] text-[var(--vf-amber-text)]">
                  Предупреждения: {selectedWarnings}
                </div>
              ) : null}
            </section>

            {exportError ? (
              <section
                className="v19-admin-export-action-error-v2 rounded-2xl border border-[#3a2c1c] bg-[#18140f] p-4"
                role="alert"
              >
                <div className="flex items-start gap-2.5">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--vf-amber-text)]" />
                  <div>
                    <div className="text-[12px] font-semibold text-white">
                      Выгрузка не выполнена
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-white/70">
                      {exportError}
                    </p>
                    <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/50">
                      {exportActionFailureNextStep(exportFailureKind)}
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            <div className="v19-admin-export-download-action-v2 sticky bottom-0 pt-2">
              <button
                aria-describedby="export-action-hint"
                className="linear-product-action linear-product-action--primary flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--v19-depth-accent)] text-[14px] font-semibold text-[var(--v19-depth-text-strong)] shadow-[var(--v19-depth-inner-highlight)] transition-colors hover:bg-[var(--v19-depth-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--v19-depth-control)] disabled:text-[var(--v19-depth-text-faint)] disabled:shadow-none"
                data-testid="export-download"
                disabled={
                  selectedCount === 0 ||
                  isExporting ||
                  hasExportBlockers ||
                  excelDownloadCompleted
                }
                type="button"
                onClick={() => void handleDownloadBundle()}
              >
                {isExporting ? (
                  <UploadCloud className="h-4 w-4 animate-pulse" />
                ) : excelDownloadCompleted ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {isExporting
                  ? "Готовим выгрузку…"
                  : excelDownloadCompleted
                    ? "Excel скачан"
                    : archiveDownloadStarted
                      ? "Подтвердить скачивание"
                      : adminDocumentPackageExportEnabled
                        ? "Скачать ZIP + Excel"
                        : "Скачать Excel"}
                {!isExporting && !excelDownloadCompleted && (
                  <ArrowRight className="h-4 w-4" />
                )}
              </button>
              <p
                className="sr-only"
                data-testid="export-action-feedback"
                id="export-action-hint"
                role="status"
              >
                {exportNotice ||
                  (selectedCount
                    ? hasExportBlockers
                      ? "Устраните блокирующие ошибки выше"
                      : "Excel и обязательные документы будут подготовлены автоматически"
                    : "Выберите хотя бы одну подачу")}
              </p>
            </div>
          </div>
        </aside>
      ) : null}
      {railHasUsefulContext && mobileControlOpen ? (
        <button
          aria-label="Закрыть контроль пакета"
          className="v19-admin-export-backdrop-v2"
          type="button"
          onClick={closeMobileControl}
        />
      ) : null}
    </motion.div>
  );
}
