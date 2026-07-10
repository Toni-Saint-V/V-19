import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
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
  ShieldCheck,
  UploadCloud,
  User,
  Users,
  XCircle,
} from "lucide-react";
import {
  emitVisaflowUiEvent,
  useVisaflowBusinessBridge,
} from "../integration/visaflowBusinessBridge";
import { getSupabaseClient } from "../lib/supabase/client";
import { applyExportStateToSelection } from "../modules/submissions/submissionActions";
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
  AdminMetricCard,
  AdminQueueToolbar,
  AdminToolbarSelect,
} from "./AdminSurfaceCommon";
import { agentDisplayName } from "../modules/submissions/agentDirectory";

interface ExportItem {
  id: string;
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

type ExportQueueTab = "all" | "selected" | "blocked";
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
    green: "bg-white/[0.045] text-[#b8baff] border-white/10",
    orange: "bg-white/[0.045] text-white/62 border-white/10",
    blue: "bg-[#6f64ff]/15 text-[#b8baff] border-[#6f64ff]/25",
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
      ? "text-[#b8baff]"
      : state === "warn"
        ? "text-white/62"
        : "text-white/45";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={`h-4 w-4 shrink-0 ${stateClass}`} />
        <span className="truncate text-[12px] text-white/55">{label}</span>
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
      if (
        submission.status !== "ready_for_export" ||
        submission.completeness.total !== 100 ||
        !summary.ready
      ) {
        return [];
      }

      return [{
        id: submission.id,
        title: submission.listTitle ?? submission.title,
        type: submission.type,
        applicantsCount: submission.applicants.length,
        country: submission.country,
        city: submission.city,
        appointmentDate: `${submission.tripDateFrom} – ${submission.tripDateTo}`,
        approvedDate: submission.updatedAt,
        selected: false,
        readiness: submission.completeness.total,
        warnings: summary.warnings.length,
        blockers: summary.blockers.length,
        files: submission.files.length,
        agent: submission.agentId,
        packageSize: `${summary.rowCount} строк`,
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
  const [activeQueueTab, setActiveQueueTab] = useState<ExportQueueTab>("all");
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

  const clearPreparedExport = () => {
    setPreparedExport(null);
    setExportNotice("");
  };

  useEffect(() => {
    setSelectedRealIds((current) => {
      const available = new Set(realItems.map((item) => item.id));
      const kept = current.filter((id) => available.has(id));
      if (kept.length) return kept;
      const preferred = realItems.find((item) =>
        item.title.includes("Дмитрий Орлов"),
      );
      if (preferred) return [preferred.id];
      const firstUnblocked = realItems.find((item) => item.blockers === 0);
      return [(firstUnblocked ?? realItems[0])?.id].filter(Boolean) as string[];
    });
    setActiveId((current) => {
      if (realItems.some((item) => item.id === current)) return current;
      const preferred = realItems.find((item) =>
        item.title.includes("Дмитрий Орлов"),
      );
      if (preferred) return preferred.id;
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
    () => [
      "Все города",
      ...Array.from(new Set(enrichedItems.map((item) => item.city))),
    ],
    [enrichedItems],
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
    return baseFilteredItems;
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
    setExportNotice("");
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
  const selectedApplicants = selectedItems.reduce(
    (sum, item) => sum + item.applicantsCount,
    0,
  );
  const selectedFiles = selectedItems.reduce(
    (sum, item) => sum + item.files,
    0,
  );
  const selectedWarnings = selectedPlan.warnings.length;
  const selectedBlockers = selectedPlan.blockers.length;
  const hasExportBlockers = selectedBlockers > 0;
  const selectedExportStateLabel = preparedExport
    ? "file_generated"
    : selectedPlan.exportState;
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
    const allSelected = displayItems.every((item) => item.selected);
    setSelectedRealIds(allSelected ? [] : displayItems.map((item) => item.id));
  };

  const toggleItem = (id: string) => {
    setExportError("");
    clearPreparedExport();
    setSelectedRealIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
    setActiveId(id);
  };

  const prepareWorkbookForCurrentSelection =
    async (): Promise<PreparedExportPackage | null> => {
      if (selectedCount === 0) {
        setExportError("Выберите хотя бы одну подачу для выгрузки.");
        return null;
      }

      if (hasExportBlockers) {
        setExportError(
          "Пакет заблокирован pre-flight правилами. Уберите блокеры перед выгрузкой.",
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
          "Пакет выгрузки не готов: есть блокеры или устаревший preview.",
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
        buildLocalDemoExportMediaZipOptions,
        commitExportMediaZipArtifact,
        downloadPreparedExportMediaZip,
        prepareExportMediaZip,
      } = await import("../modules/submissions/exportMediaZip");
      const supabaseClient = getSupabaseClient();
      const zipOptions = supabaseClient
        ? {}
        : buildLocalDemoExportMediaZipOptions(prepared.submissions);
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

      if (supabaseClient) {
        const commitResult = await commitExportMediaZipArtifact(
          zipArtifactResult.artifact,
        );
        if (!commitResult.ok) {
          setExportError(commitResult.safeMessage);
          return;
        }
      }

      try {
        await bridge.onExportPackages?.(prepared.submissionIds);
      } catch (error) {
        setExportError(
          error instanceof Error
            ? `ZIP скачан, но статус выгрузки не обновлён: ${error.message}`
            : "ZIP скачан, но статус выгрузки не обновлён.",
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
      className="v19-admin-screen grid h-full min-h-[760px] grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_390px]"
    >
      <section className="flex min-w-0 flex-col gap-5">
        <div className="grid shrink-0 grid-cols-4 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
          <AdminMetricCard
            active={activeQueueTab === "all"}
            detail="пакетов в очереди"
            icon={CheckCircle2}
            label="Готовы"
            value={displayItems.length}
            tone="green"
            onClick={() => setActiveQueueTab("all")}
          />
          <AdminMetricCard
            active={activeQueueTab === "selected"}
            detail={`${selectedApplicants} заявителей`}
            icon={PackageCheck}
            label="Выбрано"
            value={selectedCount}
            tone="green"
            onClick={() => setActiveQueueTab("selected")}
          />
          <AdminMetricCard
            active={activeQueueTab === "selected"}
            detail="файлов в ZIP-пакете"
            icon={FileArchive}
            label="Документы"
            value={selectedFiles}
            onClick={() => setActiveQueueTab("selected")}
          />
          <AdminMetricCard
            active={activeQueueTab === "blocked"}
            icon={hasExportBlockers ? XCircle : ShieldCheck}
            label="Pre-flight"
            value={hasExportBlockers ? "STOP" : "OK"}
            tone={hasExportBlockers ? "red" : "green"}
            detail={`${selectedWarnings} предупреждений`}
            onClick={() => setActiveQueueTab("blocked")}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#242529] bg-[#161617] shadow-[0_4px_24px_rgba(0,0,0,0.15)]">
          <AdminQueueToolbar
            cityFilter={cityFilter}
            cityOptions={cityOptions}
            filterLabel="Сбросить фильтры выгрузки"
            controls={
              <>
                <AdminToolbarSelect<ExportSort>
                  label="Сортировка"
                  value={sortBy}
                  onChange={setSortBy}
                  options={[
                    { value: "tripDate", label: "Дата поездки" },
                    { value: "createdAt", label: "Дата создания" },
                  ]}
                />
                <AdminToolbarSelect<ExportTypeFilter>
                  label="Тип"
                  value={typeFilter}
                  onChange={setTypeFilter}
                  options={[
                    { value: "all", label: "Семьи и заявители" },
                    { value: "family", label: "Семьи" },
                    { value: "single", label: "Заявители" },
                  ]}
                />
                <AdminToolbarSelect<string>
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
              setActiveQueueTab("all");
              setAgentFilter("Все агенты");
              setCityFilter("Все города");
              setSearchQuery("");
              setSortBy("tripDate");
              setTypeFilter("all");
            }}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Поиск по ID, семье, агенту"
            searchValue={searchQuery}
          />

          <div className="grid shrink-0 grid-cols-[32px_minmax(140px,0.9fr)_minmax(190px,1.3fr)_minmax(120px,0.7fr)_minmax(140px,0.8fr)] gap-3 border-b border-[#242529] bg-[#141416] px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-white/35 max-lg:hidden">
            <button
              aria-label={
                displayItems.every((item) => item.selected) && displayItems.length > 0
                  ? "Снять выбор со всех подач"
                  : "Выбрать все подачи"
              }
              aria-pressed={displayItems.every((item) => item.selected) && displayItems.length > 0}
              onClick={toggleAll}
              className={`flex h-5 w-5 items-center justify-center rounded-md border ${displayItems.every((item) => item.selected) && displayItems.length > 0 ? "border-[#6f64ff] bg-[#6f64ff]" : "border-[#242529] bg-[#161617]"}`}
            >
              {displayItems.every((item) => item.selected) &&
                displayItems.length > 0 && (
                  <CheckSquare className="h-3.5 w-3.5 text-white" />
                )}
            </button>
            <div>Подача</div>
            <div>Заявитель</div>
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
                  Все досье выгружены
                </h3>
                <p className="text-[13px] text-white/40">
                  Очередь на экспорт пуста.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {displayItems.map((item) => (
                  <label
                    key={item.id}
                    className={`export-row grid w-full cursor-pointer grid-cols-1 gap-3 rounded-xl border px-3 py-3 text-left transition-colors lg:grid-cols-[32px_minmax(140px,0.9fr)_minmax(190px,1.3fr)_minmax(120px,0.7fr)_minmax(140px,0.8fr)] lg:items-center ${item.selected ? "border-[#6f64ff]/35 bg-[#6f64ff]/10" : activeId === item.id ? "border-white/10 bg-white/[0.035]" : "border-transparent bg-transparent hover:border-white/5 hover:bg-white/5"}`}
                  >
                    <input
                      aria-label={`Выбрать ${item.title}`}
                      checked={item.selected}
                      className="h-5 w-5 shrink-0 accent-[#3a45b4]"
                      type="checkbox"
                      onChange={() => toggleItem(item.id)}
                    />

                    <div className="flex min-w-0 items-center gap-2 text-[12px] text-white/55">
                      <span className="shrink-0 rounded-md border border-white/5 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/55">
                        {item.id}
                      </span>
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-white/40" />
                      <span className="truncate">{item.city}</span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {item.type === "family" ? (
                          <Users className="h-3.5 w-3.5 shrink-0 text-[#8fa3ff]" />
                        ) : (
                          <User className="h-3.5 w-3.5 shrink-0 text-[#8fa3ff]" />
                        )}
                        <span className="truncate text-[14px] font-medium text-white">
                          {item.title}
                        </span>
                      </div>
                    </div>

                    <div className="text-[12px] text-white/65 lg:text-[13px]">
                      {item.appointmentDate}
                    </div>

                    <div className="flex items-center gap-2 text-[12px] text-white/65 lg:text-[13px]">
                      <User className="h-3.5 w-3.5 shrink-0 text-white/40" />
                      <span className="truncate">{agentDisplayName(item.agent)}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#242529] bg-[#161617] shadow-[0_4px_24px_rgba(0,0,0,0.18)]">
        <div className="border-b border-[#242529] bg-[#1a1a1d] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-[#b8baff]">
                Export cockpit
              </div>
              <h3 className="mt-1 text-[20px] font-semibold tracking-tight text-white">
                Правая панель
              </h3>
              <p className="mt-2 text-[12px] leading-relaxed text-white/45">
                Контроль состава, блокеров, Excel preview и истории перед
                финальной выгрузкой.
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.045] text-[#b8baff]">
              <FolderCheck className="h-5 w-5" />
            </div>
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
                <StatusPill tone={activeItem.warnings > 0 ? "orange" : "green"}>
                  {activeItem.warnings > 0 ? "есть предупреждения" : "готов"}
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
          </div>

          {exportHelper ? (
            <div className="rounded-2xl border border-[#242529] bg-[#141416] p-4">
              <div className="mb-3 flex items-center gap-2">
                <Bot className="h-4 w-4 text-[#b8baff]" />
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
              <StatusPill tone={hasExportBlockers ? "orange" : "green"}>
                {hasExportBlockers ? "нужна правка" : "можно выгружать"}
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
                label="Открытые блокеры"
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
                value={`${selectedPlan.rowCount} строк`}
                state={selectedCount ? "ok" : "neutral"}
              />
              <ManifestRow
                icon={FileArchive}
                label="ZIP медиа"
                value={`${selectedFiles} файлов`}
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
            {(selectedPlan.blockers.length > 0 ||
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
          </div>

          <div className="rounded-2xl border border-[#242529] bg-[#141416] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[14px] font-semibold text-white">
                Состав выгрузки
              </h4>
              <span className="text-[12px] text-white/40">
                {selectedCount} пак.
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
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#6f64ff]/15 text-[#b8baff]">
                      {item.type === "family" ? (
                        <Users className="h-4 w-4" />
                      ) : (
                        <User className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium text-white/85">
                        {item.title}
                      </div>
                      <div className="mt-0.5 text-[11px] text-white/35">
                        {item.id} · {item.applicantsCount} чел.
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
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#202126] text-[14px] font-semibold text-white shadow-[0_0_28px_rgba(111,100,255,0.16)] transition-colors hover:bg-[#2a2b32] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none"
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
            className={`mt-2 flex items-center justify-center gap-2 text-[11px] ${exportError ? "text-[#d59aa3]" : exportNotice ? "text-[#b8baff]" : "text-white/35"}`}
            id="export-action-hint"
          >
            <Clock3 className="h-3.5 w-3.5" />{" "}
            {exportError ||
              exportNotice ||
              (selectedCount
                ? preparedExport
                  ? "Excel готов, можно скачать ZIP"
                  : "Можно сформировать Excel и ZIP"
                : "Выберите хотя бы одну подачу")}
          </div>
        </div>
      </aside>
    </motion.div>
  );
}
