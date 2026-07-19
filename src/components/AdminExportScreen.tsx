import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  ArrowUpDown,
  ArrowRight,
  Bot,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clock3,
  Download,
  FileArchive,
  FileSpreadsheet,
  FolderCheck,
  History,
  Lock,
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
import {
  buildExportPackageIdentity,
  exportSummary,
} from "../modules/submissions/exportRules";
import { buildSubmissionAiHelperSurface } from "../modules/submissions/aiHelperSurface";
import type {
  ExportPackageIdentity,
  Submission,
} from "../modules/submissions/types";
import type { ExportWorkbookArtifact } from "../modules/submissions/exportWorkbook";
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
import { agentDisplayName } from "../modules/submissions/agentDirectory";
import {
  cityFilterValuesForSubmissions,
  questionnaireCityForSubmission,
} from "../modules/submissions/selectors";
import { ExportWorkbookPreview } from "./ExportWorkbookPreview";

interface ExportItem {
  id: string;
  publicId: string;
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
  identity: ExportPackageIdentity;
  submissionIds: string[];
  submissions: Submission[];
  workbookArtifact: ExportWorkbookArtifact;
}

type ExportQueueTab = "ready" | "selected" | "blocked";
type ExportSort = "tripDate" | "createdAt";
type ExportTypeFilter = "all" | "family" | "single";

function StatusPill({
  tone,
  children,
}: {
  tone: "green" | "orange" | "blue" | "neutral";
  children: React.ReactNode;
}) {
  const toneClass = {
    green:
      "bg-[var(--v19b-status-success-bg)] text-[var(--v19b-dot-success)] border-[var(--v19b-status-success-border)]",
    orange: "bg-white/[0.045] text-white/62 border-white/10",
    blue:
      "bg-[var(--v19b-color-primary-soft-20)] text-[var(--v19b-color-primary-text)] border-[var(--v19b-color-primary-soft-30)]",
    neutral: "bg-white/5 text-white/55 border-white/10",
  }[tone];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-medium ${toneClass}`}
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
      <span className="shrink-0 text-[12px] font-medium text-white/85">
        {value}
      </span>
    </div>
  );
}

function exportItemsFromSubmissions(submissions: Submission[]): ExportItem[] {
  return submissions
    .flatMap((submission) => {
      const summary = exportSummary([submission]);
      if (submission.status !== "ready_for_export") {
        return [];
      }

      return [{
        id: submission.id,
        publicId: submissionPublicId(submission),
        title: submission.listTitle ?? submission.title,
        type: submission.type,
        applicantsCount: submission.applicants.length,
        country: submission.country,
        city: questionnaireCityForSubmission(submission),
        appointmentDate: `${submission.tripDateFrom} – ${submission.tripDateTo}`,
        approvedDate: submission.updatedAt,
        selected: false,
        readiness: submission.completeness.total,
        warnings: summary.warnings.length,
        blockers: summary.blockers.length,
        files: submission.files.length,
        agent: submission.agentId,
        packageSize: `${summary.rowCount} ${rowCountLabel(summary.rowCount)}`,
        blockerReasons: summary.blockers.map((blocker) => blocker.reason),
        warningReasons: summary.warnings.map((warning) => warning.reason),
      }];
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

function exportPackageMediaCount(
  item: Pick<ExportItem, "applicantsCount" | "type">,
) {
  return item.type === "single" ? 3 : item.applicantsCount + 2;
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
  const [exportNotice, setExportNotice] = useState("");
  const [preparedExport, setPreparedExport] =
    useState<PreparedExportPackage | null>(null);
  const [mobileControlOpen, setMobileControlOpen] = useState(false);

  const clearPreparedExport = () => {
    setPreparedExport(null);
    setExportNotice("");
  };

  useEffect(() => {
    setSelectedRealIds((current) => {
      const selectableItems = realItems.filter((item) => item.blockers === 0);
      const available = new Set(selectableItems.map((item) => item.id));
      return current.filter((id) => available.has(id));
    });
    setActiveId((current) => {
      if (realItems.some((item) => item.id === current)) return current;
      return (
        realItems.find((item) => item.blockers === 0)?.id ??
        realItems[0]?.id ??
        ""
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
        const agentMatches =
          agentFilter === "Все агенты" || item.agent === agentFilter;
        const cityMatches =
          cityFilter === "Все города" || item.city === cityFilter;
        const typeMatches = typeFilter === "all" || item.type === typeFilter;
        const searchMatches =
          !searchNeedle ||
          [item.id, item.title, item.agent, item.city]
            .join(" ")
            .toLowerCase()
            .includes(searchNeedle);
        return agentMatches && cityMatches && typeMatches && searchMatches;
      })
      .sort((left, right) => {
        if (sortBy === "createdAt") {
          return dateValue(right.approvedDate) - dateValue(left.approvedDate);
        }
        return (
          dateValue(left.appointmentDate) - dateValue(right.appointmentDate)
        );
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
    () =>
      submissions.filter((submission) =>
        selectedRealIds.includes(submission.id),
      ),
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

  useEffect(() => {
    setPreparedExport(null);
    setExportError("");
  }, [selectedSignature, submissions]);

  const activeItem =
    displayItems.find((item) => item.id === activeId) ??
    selectedItems[0] ??
    displayItems[0];
  const activeSubmission = useMemo(
    () => submissions.find((submission) => submission.id === activeItem?.id),
    [activeItem?.id, submissions],
  );
  const exportHelper = useMemo(
    () =>
      activeSubmission
        ? buildSubmissionAiHelperSurface({
            role: "admin",
            submission: activeSubmission,
            surface: "export",
          })
        : null,
    [activeSubmission],
  );
  const selectedCount = selectedItems.length;
  const availableCount = enrichedItems.filter((item) => item.blockers === 0).length;
  const blockedCount = enrichedItems.filter((item) => item.blockers > 0).length;
  const selectedApplicants = selectedItems.reduce(
    (sum, item) => sum + item.applicantsCount,
    0,
  );
  const selectedFiles = selectedItems.reduce(
    (sum, item) => sum + item.files,
    0,
  );
  const selectedWarnings = selectedCount ? selectedPlan.warnings.length : 0;
  const selectedBlockers = selectedCount ? selectedPlan.blockers.length : 0;
  const hasExportBlockers = selectedCount > 0 && selectedBlockers > 0;
  const selectedExportStateLabel = !selectedCount
    ? "Не выбран"
    : preparedExport
      ? "Excel готов"
      : selectedPlan.exportState === "not_ready"
        ? "Не готов"
        : selectedPlan.exportState === "ready"
          ? "Готов"
          : selectedPlan.exportState === "file_generated"
            ? "Excel готов"
            : "Скачан";
  const hasActiveFilters =
    activeQueueTab !== "ready" ||
    agentFilter !== "Все агенты" ||
    cityFilter !== "Все города" ||
    searchQuery.length > 0 ||
    sortBy !== "tripDate" ||
    typeFilter !== "all";
  const selectableDisplayItems = displayItems.filter(
    (item) => item.blockers === 0,
  );
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
  const toggleAll = () => {
    setExportError("");
    clearPreparedExport();
    const selectableItems = displayItems.filter((item) => item.blockers === 0);
    const allSelected =
      selectableItems.length > 0 && selectableItems.every((item) => item.selected);
    setSelectedRealIds(
      allSelected ? [] : selectableItems.map((item) => item.id),
    );
  };

  const toggleItem = (id: string) => {
    const item = enrichedItems.find((candidate) => candidate.id === id);
    setActiveId(id);
    if (!item || item.blockers > 0) return;
    setExportError("");
    clearPreparedExport();
    setSelectedRealIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const prepareWorkbookForCurrentSelection =
    async (): Promise<PreparedExportPackage | null> => {
      if (selectedCount === 0) {
        setExportError("Выберите хотя бы одну подачу для выгрузки.");
        return null;
      }

      if (hasExportBlockers) {
        setExportError(
          "Пакет ограничен pre-flight правилами. Уберите ограничения перед выгрузкой.",
        );
        return null;
      }

      const submissionIds = selectedItems.map((item) => item.id);
      const [
        { createExportWorkbookArtifact },
        { verifyExportWorkbookArtifact },
      ] = await Promise.all([
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
        setExportError(
          "Excel не сформирован: выборка не прошла доменные правила выгрузки.",
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
          setExportError(
            "Excel не сформирован: выборка не прошла доменные правила выгрузки.",
          );
          return null;
        }

        selectedGenerated = selectedSubmissions;
      }

      const identity = buildExportPackageIdentity(selectedGenerated);
      const plan = exportSummary(selectedGenerated);
      const hasDownloadableState =
        plan.exportState === "file_generated" ||
        plan.exportState === "file_downloaded";

      if (!identity || !plan.ready || !hasDownloadableState) {
        setExportError(
          "Пакет выгрузки не готов: есть ограничения или устаревший preview.",
        );
        return null;
      }

      const workbookArtifact = createExportWorkbookArtifact(
        plan.rows,
        identity,
      );
      if (!(await verifyExportWorkbookArtifact(workbookArtifact))) {
        setExportError("Excel preview не совпал с XLSX. Файл не скачан.");
        return null;
      }

      return {
        identity,
        submissionIds,
        submissions: selectedGenerated,
        workbookArtifact,
      };
    };

  const handlePrepareExcel = async () => {
    setExportError("");
    setExportNotice("");
    setIsExporting(true);
    try {
      const prepared = await prepareWorkbookForCurrentSelection();
      if (!prepared) return;
      setPreparedExport(prepared);
      setExportNotice(`Excel сформирован: ${prepared.identity.fileName}`);
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Не удалось сформировать Excel.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadExcel = async () => {
    setExportError("");
    setExportNotice("");
    setIsExporting(true);
    try {
      const prepared =
        preparedExport ?? (await prepareWorkbookForCurrentSelection());
      if (!prepared) return;
      const { downloadPreparedExportWorkbookArtifact } =
        await import("../modules/submissions/exportWorkbook");
      const downloadResult = downloadPreparedExportWorkbookArtifact(
        prepared.workbookArtifact,
      );
      if (!downloadResult.ok) {
        setExportError(downloadResult.safeMessage);
        return;
      }
      setPreparedExport(prepared);
      setExportNotice(`Excel скачан: ${downloadResult.fileName}`);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Не удалось скачать Excel.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleExport = async () => {
    if (selectedCount === 0 || hasExportBlockers) return;
    setExportError("");
    setExportNotice("");
    setIsExporting(true);
    try {
      const prepared =
        preparedExport ?? (await prepareWorkbookForCurrentSelection());
      if (!prepared) return;
      const {
        downloadPreparedExportMediaZip,
        prepareExportMediaZip,
        toExportPackageDocumentCommit,
      } = await import("../modules/submissions/exportMediaZip");
      const supabaseClient = getSupabaseClient();
      let zipOptions = {};
      if (!supabaseClient) {
        if (!__V19_LOCAL_DEMO_BUILD__) {
          setExportError(
            "Supabase Storage недоступен. Production ZIP не может использовать локальные файлы.",
          );
          return;
        }
        const { buildLocalDemoExportMediaZipOptions } = await import(
          "../modules/submissions/exportMediaZipLocalDemo"
        );
        zipOptions = buildLocalDemoExportMediaZipOptions(prepared.submissions);
      }
      const zipArtifactResult = await prepareExportMediaZip(
        prepared.submissions,
        prepared.identity,
        zipOptions,
      );
      if (!zipArtifactResult.ok) {
        setExportError(zipArtifactResult.safeMessage);
        return;
      }
      const zipResult = downloadPreparedExportMediaZip(
        zipArtifactResult.artifact,
      );
      if (!zipResult.ok) {
        setExportError(zipResult.safeMessage);
        return;
      }

      try {
        if (!bridge.onExportPackages) {
          throw new Error("Обработчик фиксации выгрузки недоступен.");
        }
        await bridge.onExportPackages({
          documentExport: toExportPackageDocumentCommit(
            zipArtifactResult.artifact,
          ),
          packageIdentity: zipArtifactResult.artifact.packageIdentity,
          submissionIds: prepared.submissionIds,
        });
      } catch (error) {
        setExportError(
          error instanceof Error
            ? `ZIP скачан, но терминальная фиксация не подтверждена: ${error.message}`
            : "ZIP скачан, но терминальная фиксация не подтверждена.",
        );
        return;
      }

      setPreparedExport(prepared);
      setExportNotice(`ZIP скачан: ${zipResult.fileName}`);
      emitVisaflowUiEvent(bridge, {
        type: "export.start",
        submissionIds: prepared.submissionIds,
      });
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Не удалось завершить выгрузку.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="v19-admin-screen v19-admin-export-screen-v2"
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
          badge={hasExportBlockers || (activeItem?.blockers ?? 0) > 0 ? "Стоп" : selectedCount ? "Готов" : "—"}
          badgeClassName={hasExportBlockers || (activeItem?.blockers ?? 0) > 0 ? "tone-danger" : "tone-ready"}
          className="v19-admin-export-context-toggle-v2"
          detail={selectedCount
            ? `${selectedCount} ${packageCountLabel(selectedCount)} · ${selectedApplicants} ${applicantCountLabel(selectedApplicants)}`
            : activeItem?.title ?? "Пакет не выбран"}
          expanded={mobileControlOpen}
          icon={FolderCheck}
          onClick={() => setMobileControlOpen(true)}
          title="Контроль пакета"
        />

        <div className="v19-admin-export-workspace-v2">
          <AdminListHeader
            actionDisabled={activeQueueTab !== "ready" || selectableDisplayItems.length === 0}
            actionLabel={allDisplaySelected ? "Снять" : "Все"}
            className="v19-admin-export-list-head-v2"
            countLabel={`${displayItems.length} ${packageCountLabel(displayItems.length)}`}
            onAction={toggleAll}
            title={activeQueueTab === "ready"
              ? "Пакеты к выгрузке"
              : activeQueueTab === "selected"
                ? "Выбранные пакеты"
                : "Требуют решения"}
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
                    label: agent,
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

          <div className="grid shrink-0 grid-cols-[32px_minmax(140px,0.9fr)_minmax(190px,1.3fr)_minmax(120px,0.7fr)_minmax(140px,0.8fr)] gap-3 border-b border-[#242529] bg-[#141416] px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-white/35 max-lg:hidden">
            <button
              aria-label={
                allDisplaySelected
                  ? "Снять выбор со всех подач"
                  : "Выбрать все подачи"
              }
              aria-pressed={allDisplaySelected}
              onClick={toggleAll}
              className={`flex h-5 w-5 items-center justify-center rounded-md border ${allDisplaySelected ? "border-[var(--v19b-color-primary)] bg-[var(--v19b-color-primary)]" : "border-[#242529] bg-[#161617]"}`}
            >
              {allDisplaySelected && (
                  <CheckSquare className="h-3.5 w-3.5 text-white" />
                )}
            </button>
            <div>Подача</div>
            <div>Заявитель / пакет</div>
            <div>Даты поездки</div>
            <div>Агент</div>
          </div>

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
                    key={item.id}
                    className={`export-row v19-admin-export-row-v2 ${item.selected ? "is-selected" : ""} ${activeId === item.id ? "is-active" : ""} ${item.blockers > 0 ? "is-blocked" : ""}`}
                    onClick={() => setActiveId(item.id)}
                  >
                    <input
                      aria-label={`Выбрать ${item.title}`}
                      checked={item.selected}
                      disabled={item.blockers > 0}
                      className="h-5 w-5 shrink-0 accent-[#3a45b4]"
                      type="checkbox"
                      onChange={() => toggleItem(item.id)}
                    />

                    <div className="v19-admin-export-row-submission-v2 flex min-w-0 items-center gap-2 text-[12px] text-white/55">
                      <span className="shrink-0 rounded-md border border-white/5 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/55">
                        {item.publicId}
                      </span>
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-white/40" />
                      <span>{item.city}</span>
                    </div>

                    <div className="v19-admin-export-row-applicant-v2 min-w-0">
                      <div className="flex items-center gap-2">
                        {item.type === "family" ? (
                          <Users className="h-3.5 w-3.5 shrink-0 text-[#8fa3ff]" />
                        ) : (
                          <User className="h-3.5 w-3.5 shrink-0 text-[#8fa3ff]" />
                        )}
                        <span className="text-[14px] font-medium text-white">
                          {item.title}
                        </span>
                      </div>
                      <div className="v19-admin-export-row-package-v2">
                        <span>
                          {item.applicantsCount}{" "}
                          {applicantCountLabel(item.applicantsCount)}
                        </span>
                        <i aria-hidden="true" />
                        <span>
                          Excel + {exportPackageMediaCount(item)}{" "}
                          {fileCountLabel(exportPackageMediaCount(item))}
                        </span>
                      </div>
                      {item.blockerReasons[0] ? (
                        <div className="v19-admin-export-row-reason-v2">
                          {item.blockerReasons[0]}
                        </div>
                      ) : null}
                    </div>

                    <div className="v19-admin-export-row-dates-v2 text-[12px] text-white/65 lg:text-[13px]">
                      {item.appointmentDate}
                    </div>

                    <div className="v19-admin-export-row-agent-v2 flex items-center gap-2 text-[12px] text-white/65 lg:text-[13px]">
                      <User className="h-3.5 w-3.5 shrink-0 text-white/40" />
                      <span>{agentDisplayName(item.agent)}</span>
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
                Состав, проверки, Excel и история перед скачиванием.
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
                      ? "orange"
                      : activeItem.warnings > 0
                        ? "blue"
                        : "green"
                  }
                >
                  {activeItem.blockers > 0
                    ? "заблокирован"
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
                  <div className="mt-1 font-semibold text-white">
                    {activeItem.city}
                  </div>
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
            {activeItem?.blockerReasons.length ? (
              <div className="v19-admin-export-active-blockers-v2">
                {activeItem.blockerReasons.map((reason) => (
                  <div key={reason}>{reason}</div>
                ))}
              </div>
            ) : null}
          </div>

          {exportHelper ? (
            <div className="rounded-2xl border border-[#242529] bg-[#141416] p-4">
              <div className="mb-3 flex items-center gap-2">
                <Bot className="h-4 w-4 text-[var(--v19b-color-primary-text)]" />
                <h4 className="text-[14px] font-semibold text-white">
                  Тихая AI-помощь
                </h4>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.025] p-3">
                <div className="text-[12px] font-semibold text-white/82">
                  {exportHelper.title}
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-white/46">
                  {exportHelper.nextStep}
                </p>
              </div>
              <div className="mt-3 space-y-2">
                {exportHelper.highlights.slice(0, 2).map((highlight) => (
                  <div
                    className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                    key={`${highlight.source}-${highlight.label}`}
                  >
                    <div className="text-[11px] font-semibold text-white/65">
                      {highlight.label}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-white/38">
                      {highlight.detail}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[10.5px] leading-relaxed text-white/32">
                Только подсказка: выгрузку всё равно блокируют реальные
                pre-flight правила.
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-[#242529] bg-[#141416] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[14px] font-semibold text-white">
                Pre-flight checks
              </h4>
              <StatusPill
                tone={
                  selectedCount === 0
                    ? "neutral"
                    : hasExportBlockers
                      ? "orange"
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
                disabled={
                  selectedCount === 0 || hasExportBlockers || isExporting
                }
                type="button"
                onClick={handlePrepareExcel}
              >
                {preparedExport ? "Excel готов" : "Сформировать Excel"}
              </button>
              <button
                className="h-9 rounded-[9px] border border-[#242529] bg-[#1e1e21] px-3 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:text-white/45"
                disabled={
                  selectedCount === 0 || hasExportBlockers || isExporting
                }
                type="button"
                onClick={handleDownloadExcel}
              >
                Скачать Excel
              </button>
            </div>
            <div className="space-y-2">
              <ManifestRow
                icon={ShieldCheck}
                label="Открытые ограничения"
                value={`${selectedBlockers}`}
                state={selectedBlockers ? "warn" : "ok"}
              />
              <ManifestRow
                icon={FileSpreadsheet}
                label="Excel preview"
                value={selectedCount ? "готов" : "нет выбора"}
                state={selectedCount ? "ok" : "neutral"}
              />
              <ManifestRow
                icon={FileSpreadsheet}
                label="Excel rows"
                value={`${selectedPlan.rowCount} ${rowCountLabel(selectedPlan.rowCount)}`}
                state={selectedCount ? "ok" : "neutral"}
              />
              <ManifestRow
                icon={FileArchive}
                label="ZIP медиа"
                value={`${selectedFiles} ${fileCountLabel(selectedFiles)}`}
                state={selectedCount ? "ok" : "neutral"}
              />
              <ManifestRow
                icon={Lock}
                label="Состояние экспорта"
                value={selectedExportStateLabel}
                state={selectedCount ? "ok" : "neutral"}
              />
              <ManifestRow
                icon={AlertTriangle}
                label="Warnings"
                value={`${selectedWarnings}`}
                state={selectedWarnings ? "warn" : "ok"}
              />
            </div>
            {selectedCount > 0 &&
              (selectedPlan.blockers.length > 0 ||
                selectedPlan.warnings.length > 0) && (
              <div className="mt-3 space-y-1.5">
                {[...selectedPlan.blockers, ...selectedPlan.warnings].map(
                  (item) => (
                    <div
                      key={item.reason}
                      className="rounded-lg border border-white/5 bg-white/[0.025] px-3 py-2 text-[11px] leading-snug text-white/55"
                    >
                      {item.reason}
                    </div>
                  ),
                )}
              </div>
            )}
            {selectedCount > 0 && !hasExportBlockers ? (
              <div className="mt-3">
                <ExportWorkbookPreview preview={selectedPlan.preview} />
              </div>
            ) : null}
          </div>

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

          <div className="rounded-2xl border border-[#242529] bg-[#141416] p-4">
            <div className="mb-3 flex items-center gap-2">
              <History className="h-4 w-4 text-white/40" />
              <h4 className="text-[14px] font-semibold text-white">
                История сегодня
              </h4>
            </div>
            <div className="space-y-3 border-l border-white/10 pl-4">
              {selectedHistory.length === 0 ? (
                <div>
                  <div className="text-[12px] font-medium text-white/75">
                    История появится после действия
                  </div>
                  <div className="text-[11px] text-white/35">
                    Только реальные события выбранных подач
                  </div>
                </div>
              ) : (
                selectedHistory.map((item) => (
                  <div key={`${item.submissionId}-${item.id}`}>
                    <div className="text-[12px] font-medium text-white/75">
                      {item.text}
                    </div>
                    <div className="text-[11px] text-white/35">
                      {item.at} · {item.source ?? "system"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-[#242529] bg-[#1a1a1d] p-4">
          <button
            onClick={handleExport}
            disabled={selectedCount === 0 || isExporting || hasExportBlockers}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--v19b-color-primary)] text-[14px] font-semibold text-white shadow-[0_0_28px_var(--v19b-color-primary-soft-20)] transition-colors hover:bg-[var(--v19b-color-primary-hover)] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none"
          >
            {isExporting ? (
              <UploadCloud className="h-4 w-4 animate-pulse" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting ? "Формируем пакет…" : "Скачать ZIP с Excel"}
            {!isExporting && <ArrowRight className="h-4 w-4" />}
          </button>
          <div
            className={`mt-2 flex items-center justify-center gap-2 text-[11px] ${exportError ? "text-[#d59aa3]" : exportNotice ? "text-[var(--v19b-color-primary-text)]" : "text-white/35"}`}
            id="export-action-hint"
          >
            <Clock3 className="h-3.5 w-3.5" />{" "}
            {exportError ||
              exportNotice ||
              (selectedCount
                ? hasExportBlockers
                  ? selectedPlan.blockers[0]?.reason ??
                    "Уберите ограничения перед выгрузкой"
                  : preparedExport
                    ? "Excel готов, можно скачать ZIP"
                    : "Можно сформировать Excel и ZIP"
                : "Выберите хотя бы одну подачу")}
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
