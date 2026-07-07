import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
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
  PackageCheck,
  ShieldCheck,
  UploadCloud,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import { emitVisaflowUiEvent, useVisaflowBusinessBridge } from '../integration/visaflowBusinessBridge';
import { applyExportStateToSelection } from '../modules/submissions/submissionActions';
import { buildExportPackageIdentity, exportSummary } from '../modules/submissions/exportRules';
import type { Submission } from '../modules/submissions/types';
import { AdminMetricCard, AdminQueueToolbar } from './AdminSurfaceCommon';

interface ExportItem {
  id: string;
  title: string;
  type: 'single' | 'family';
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

type ExportQueueTab = 'all' | 'selected' | 'blocked';

function StatusPill({ tone, children }: { tone: 'green' | 'orange' | 'blue' | 'neutral'; children: React.ReactNode }) {
  const toneClass = {
    green: 'bg-white/[0.045] text-[#b8baff] border-white/10',
    orange: 'bg-white/[0.045] text-white/62 border-white/10',
    blue: 'bg-[#6f64ff]/15 text-[#b8baff] border-[#6f64ff]/25',
    neutral: 'bg-white/5 text-white/55 border-white/10',
  }[tone];

  return <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-medium ${toneClass}`}>{children}</span>;
}

function ManifestRow({ icon: Icon, label, value, state = 'ok' }: { icon: React.ElementType; label: string; value: string; state?: 'ok' | 'warn' | 'neutral' }) {
  const stateClass = state === 'ok' ? 'text-[#b8baff]' : state === 'warn' ? 'text-white/62' : 'text-white/45';
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={`h-4 w-4 shrink-0 ${stateClass}`} />
        <span className="truncate text-[12px] text-white/55">{label}</span>
      </div>
      <span className="shrink-0 text-[12px] font-medium text-white/85">{value}</span>
    </div>
  );
}

function exportItemsFromSubmissions(submissions: Submission[]): ExportItem[] {
  return submissions
    .filter((submission) => submission.status === 'ready_for_export')
    .map((submission) => {
      const summary = exportSummary([submission]);
      return {
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
      };
    });
}

export function AdminExportScreen({ submissions = [] }: { submissions?: Submission[] }) {
  const bridge = useVisaflowBusinessBridge();
  const realItems = useMemo(() => exportItemsFromSubmissions(submissions), [submissions]);
  const [selectedRealIds, setSelectedRealIds] = useState<string[]>([]);
  const [activeQueueTab, setActiveQueueTab] = useState<ExportQueueTab>('all');
  const [activeId, setActiveId] = useState('');
  const [cityFilter, setCityFilter] = useState('Все города');
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    setSelectedRealIds((current) => {
      const available = new Set(realItems.map((item) => item.id));
      const kept = current.filter((id) => available.has(id));
      if (kept.length) return kept;
      const firstUnblocked = realItems.find((item) => item.blockers === 0);
      return [(firstUnblocked ?? realItems[0])?.id].filter(Boolean) as string[];
    });
    setActiveId((current) => {
      if (realItems.some((item) => item.id === current)) return current;
      return realItems.find((item) => item.blockers === 0)?.id ?? realItems[0]?.id ?? '';
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
    () => ['Все города', ...Array.from(new Set(enrichedItems.map((item) => item.city)))],
    [enrichedItems],
  );
  const baseFilteredItems = useMemo(() => {
    const searchNeedle = searchQuery.trim().toLowerCase();
    return enrichedItems.filter((item) => {
      const cityMatches = cityFilter === 'Все города' || item.city === cityFilter;
      const searchMatches =
        !searchNeedle ||
        [item.id, item.title, item.agent, item.city]
          .join(' ')
          .toLowerCase()
          .includes(searchNeedle);
      return cityMatches && searchMatches;
    });
  }, [cityFilter, enrichedItems, searchQuery]);
  const displayItems = useMemo(() => {
    if (activeQueueTab === 'selected') return baseFilteredItems.filter((item) => item.selected);
    if (activeQueueTab === 'blocked') return baseFilteredItems.filter((item) => item.blockers > 0);
    return baseFilteredItems;
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
  const activeItem = displayItems.find((item) => item.id === activeId) ?? selectedItems[0] ?? displayItems[0];
  const selectedCount = selectedItems.length;
  const selectedApplicants = selectedItems.reduce((sum, item) => sum + item.applicantsCount, 0);
  const selectedFiles = selectedItems.reduce((sum, item) => sum + item.files, 0);
  const selectedWarnings = selectedPlan.warnings.length;
  const selectedBlockers = selectedPlan.blockers.length;
  const hasExportBlockers = selectedBlockers > 0;
  const selectedHistory = selectedSubmissions
    .flatMap((submission) => submission.history.map((item) => ({ ...item, submissionId: submission.id })))
    .slice(0, 3);
  const toggleAll = () => {
    setExportError('');
    const allSelected = displayItems.every((item) => item.selected);
    setSelectedRealIds(allSelected ? [] : displayItems.map((item) => item.id));
  };

  const toggleItem = (id: string) => {
    setExportError('');
    setSelectedRealIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
    setActiveId(id);
  };

  const handleExport = async () => {
    if (selectedCount === 0 || hasExportBlockers) return;
    setExportError('');
    const submissionIds = selectedItems.map((item) => item.id);
    setIsExporting(true);
    try {
      const [
        {
          createExportWorkbookArtifact,
        },
        { verifyExportWorkbookArtifact },
        { prepareExportMediaZip, downloadPreparedExportMediaZip },
      ] = await Promise.all([
        import('../modules/submissions/exportWorkbook'),
        import('../modules/submissions/exportWorkbookVerification'),
        import('../modules/submissions/exportMediaZip'),
      ]);
      const generated = applyExportStateToSelection(
        submissions,
        submissionIds,
        'file_generated',
      );
      const selectedGenerated = generated.filter((submission) =>
        submissionIds.includes(submission.id),
      );
      const identity = buildExportPackageIdentity(selectedGenerated);
      const plan = exportSummary(selectedGenerated);
      if (!identity || !plan.downloadPackageIdentity) {
        setExportError('Пакет выгрузки не готов: есть блокеры или устаревший preview.');
        return;
      }
      const workbookArtifact = createExportWorkbookArtifact(plan.rows, identity);
      if (!(await verifyExportWorkbookArtifact(workbookArtifact))) {
        setExportError('Excel preview не совпал с XLSX. Файл не скачан.');
        return;
      }
      const zipArtifactResult = await prepareExportMediaZip(selectedGenerated, identity);
      if (!zipArtifactResult.ok) {
        setExportError(zipArtifactResult.safeMessage);
        return;
      }
      if (!bridge.onExportPackages) {
        setExportError('Пакет выгрузки не завершен: нет защищенного обработчика выгрузки.');
        return;
      }
      await bridge.onExportPackages(submissionIds);
      const zipResult = downloadPreparedExportMediaZip(zipArtifactResult.artifact);
      if (!zipResult.ok) {
        setExportError(zipResult.safeMessage);
        return;
      }
      emitVisaflowUiEvent(bridge, { type: 'export.start', submissionIds });
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Не удалось завершить выгрузку.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="grid h-full min-h-[760px] grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_390px]"
    >
      <section className="flex min-w-0 flex-col gap-5">
        <div className="grid shrink-0 grid-cols-4 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
          <AdminMetricCard icon={CheckCircle2} label="Готовы" value={displayItems.length} tone="green" detail="пакетов в очереди" />
          <AdminMetricCard icon={PackageCheck} label="Выбрано" value={selectedCount} tone="green" detail={`${selectedApplicants} заявителей`} />
          <AdminMetricCard icon={FileArchive} label="Документы" value={selectedFiles} detail="файлов в ZIP-пакете" />
          <AdminMetricCard
            icon={hasExportBlockers ? XCircle : ShieldCheck}
            label="Pre-flight"
            value={hasExportBlockers ? 'STOP' : 'OK'}
            tone={hasExportBlockers ? 'red' : 'green'}
            detail={`${selectedWarnings} предупреждений`}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#242529] bg-[#161617] shadow-[0_4px_24px_rgba(0,0,0,0.15)]">
          <AdminQueueToolbar
            activeTab={activeQueueTab}
            cityFilter={cityFilter}
            cityOptions={cityOptions}
            filterLabel="Сбросить фильтры выгрузки"
            onCityFilterChange={setCityFilter}
            onFilterClick={() => {
              setActiveQueueTab('all');
              setCityFilter('Все города');
              setSearchQuery('');
            }}
            onSearchChange={setSearchQuery}
            onTabChange={setActiveQueueTab}
            searchPlaceholder="Поиск по ID, семье, агенту"
            searchValue={searchQuery}
            tabs={[
              { id: 'all', label: 'Все', count: baseFilteredItems.length },
              { id: 'selected', label: 'Выбрано', count: baseFilteredItems.filter((item) => item.selected).length },
              { id: 'blocked', label: 'Блокеры', count: baseFilteredItems.filter((item) => item.blockers > 0).length, tone: 'border-[#d59aa3]/45 bg-[#d59aa3]/10 text-[#e3b5bd]' },
            ]}
          />

          <div className="grid shrink-0 grid-cols-[44px_minmax(220px,1fr)_150px_130px_110px] gap-3 border-b border-[#242529] bg-[#141416] px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-white/35 max-lg:hidden">
            <button
              onClick={toggleAll}
              className={`flex h-5 w-5 items-center justify-center rounded-md border ${displayItems.every((item) => item.selected) && displayItems.length > 0 ? 'border-[#6f64ff] bg-[#6f64ff]' : 'border-[#242529] bg-[#161617]'}`}
            >
              {displayItems.every((item) => item.selected) && displayItems.length > 0 && <CheckSquare className="h-3.5 w-3.5 text-white" />}
            </button>
            <div>Пакет</div>
            <div>Слот</div>
            <div>Готовность</div>
            <div className="text-right">Размер</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {displayItems.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-4 py-20 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/5 bg-white/5">
                  <CheckCircle2 className="h-5 w-5 text-white/35" />
                </div>
                <h3 className="mb-1 text-[15px] font-semibold text-white">Все досье выгружены</h3>
                <p className="text-[13px] text-white/40">Очередь на экспорт пуста.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {displayItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={`grid w-full grid-cols-1 gap-3 rounded-xl border px-3 py-3 text-left transition-colors lg:grid-cols-[32px_minmax(220px,1fr)_150px_130px_110px] lg:items-center ${item.selected ? 'border-[#6f64ff]/35 bg-[#6f64ff]/10' : activeId === item.id ? 'border-white/10 bg-white/[0.035]' : 'border-transparent bg-transparent hover:border-white/5 hover:bg-white/5'}`}
                  >
                    <div className={`hidden h-5 w-5 shrink-0 items-center justify-center rounded-md border lg:flex ${item.selected ? 'border-[#6f64ff] bg-[#6f64ff]' : 'border-[#242529] bg-[#161617]'}`}>
                      {item.selected && <CheckSquare className="h-3.5 w-3.5 text-white" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {item.type === 'family' ? <Users className="h-3.5 w-3.5 text-white/50" /> : <User className="h-3.5 w-3.5 text-white/50" />}
                        <span className="truncate text-[14px] font-medium text-white">{item.title}</span>
                        <span className="hidden rounded-md border border-white/5 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/40 lg:inline-flex">{item.id}</span>
                        <span className="ml-auto shrink-0 text-[12px] text-white/65 lg:hidden">{item.appointmentDate}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-white/40">
                        <span>{item.agent}</span>
                        <span className="h-1 w-1 rounded-full bg-white/20" />
                        <span>{item.city}</span>
                        <span className="h-1 w-1 rounded-full bg-white/20" />
                        <span>{item.files} файлов</span>
                      </div>
                    </div>

                    <div className="hidden text-[12px] text-white/65 lg:block lg:text-[13px]">{item.appointmentDate}</div>

                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded-md border border-white/5 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/40 lg:hidden">{item.id}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5 lg:w-20 lg:flex-none">
                        <div className="h-full rounded-full bg-[#7c73ff]" style={{ width: `${item.readiness}%` }} />
                      </div>
                      <span className="text-[12px] font-medium text-white/70">{item.readiness}%</span>
                    </div>

                    <div className="flex items-center justify-between gap-3 lg:justify-end">
                      {item.warnings > 0 ? <StatusPill tone="orange">{item.warnings} warning</StatusPill> : <StatusPill tone="green">чисто</StatusPill>}
                      <span className="hidden text-[12px] font-medium text-white/55 lg:inline">{item.packageSize}</span>
                    </div>
                  </button>
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
              <div className="text-[11px] font-medium uppercase tracking-wider text-[#b8baff]">Export cockpit</div>
              <h3 className="mt-1 text-[20px] font-semibold tracking-tight text-white">Правая панель</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-white/45">Контроль состава, блокеров, Excel preview и истории перед финальной выгрузкой.</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.045] text-[#b8baff]">
              <FolderCheck className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5">
          <div className="rounded-2xl border border-[#242529] bg-[#141416] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[12px] text-white/45">Активный пакет</div>
                <div className="mt-1 text-[15px] font-semibold text-white">{activeItem?.title ?? 'Не выбран'}</div>
              </div>
              {activeItem && <StatusPill tone={activeItem.warnings > 0 ? 'orange' : 'green'}>{activeItem.warnings > 0 ? 'есть предупреждения' : 'готов'}</StatusPill>}
            </div>
            {activeItem && (
              <div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-xl bg-white/[0.03] p-3">
                  <div className="text-white/35">Заявители</div>
                  <div className="mt-1 font-semibold text-white">{activeItem.applicantsCount}</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] p-3">
                  <div className="text-white/35">Город</div>
                  <div className="mt-1 font-semibold text-white">{activeItem.city}</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] p-3">
                  <div className="text-white/35">Файлы</div>
                  <div className="mt-1 font-semibold text-white">{activeItem.files}</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] p-3">
                  <div className="text-white/35">Размер</div>
                  <div className="mt-1 font-semibold text-white">{activeItem.packageSize}</div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#242529] bg-[#141416] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[14px] font-semibold text-white">Pre-flight checks</h4>
              <StatusPill tone={hasExportBlockers ? 'orange' : 'green'}>{hasExportBlockers ? 'нужна правка' : 'можно выгружать'}</StatusPill>
            </div>
            <div className="space-y-2">
              <ManifestRow icon={ShieldCheck} label="Открытые блокеры" value={`${selectedBlockers}`} state={selectedBlockers ? 'warn' : 'ok'} />
              <ManifestRow icon={FileSpreadsheet} label="Excel preview" value={selectedCount ? 'готов' : 'нет выбора'} state={selectedCount ? 'ok' : 'neutral'} />
              <ManifestRow icon={FileSpreadsheet} label="Excel rows" value={`${selectedPlan.rowCount} строк`} state={selectedCount ? 'ok' : 'neutral'} />
              <ManifestRow icon={FileArchive} label="ZIP медиа" value={`${selectedFiles} файлов`} state={selectedCount ? 'ok' : 'neutral'} />
              <ManifestRow icon={Lock} label="Состояние экспорта" value={selectedPlan.exportState} state={selectedCount ? 'ok' : 'neutral'} />
              <ManifestRow icon={AlertTriangle} label="Warnings" value={`${selectedWarnings}`} state={selectedWarnings ? 'warn' : 'ok'} />
            </div>
            {(selectedPlan.blockers.length > 0 || selectedPlan.warnings.length > 0) && (
              <div className="mt-3 space-y-1.5">
                {[...selectedPlan.blockers, ...selectedPlan.warnings].map((item) => (
                  <div key={item.reason} className="rounded-lg border border-white/5 bg-white/[0.025] px-3 py-2 text-[11px] leading-snug text-white/55">
                    {item.reason}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#242529] bg-[#141416] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[14px] font-semibold text-white">Состав выгрузки</h4>
              <span className="text-[12px] text-white/40">{selectedCount} пак.</span>
            </div>
            <div className="space-y-2">
              {selectedItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-[12px] text-white/35">Выберите пакеты слева</div>
              ) : (
                selectedItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.025] p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#6f64ff]/15 text-[#b8baff]">
                      {item.type === 'family' ? <Users className="h-4 w-4" /> : <User className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium text-white/85">{item.title}</div>
                      <div className="mt-0.5 text-[11px] text-white/35">{item.id} · {item.applicantsCount} чел.</div>
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
              <h4 className="text-[14px] font-semibold text-white">История сегодня</h4>
            </div>
            <div className="space-y-3 border-l border-white/10 pl-4">
              {selectedHistory.length === 0 ? (
                <div>
                  <div className="text-[12px] font-medium text-white/75">История появится после действия</div>
                  <div className="text-[11px] text-white/35">Только реальные события выбранных подач</div>
                </div>
              ) : (
                selectedHistory.map((item) => (
                  <div key={`${item.submissionId}-${item.id}`}>
                    <div className="text-[12px] font-medium text-white/75">{item.text}</div>
                    <div className="text-[11px] text-white/35">{item.at} · {item.source ?? 'system'}</div>
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
            {isExporting ? <UploadCloud className="h-4 w-4 animate-pulse" /> : <Download className="h-4 w-4" />}
            {isExporting ? 'Формируем пакет…' : 'Скачать ZIP с Excel'}
            {!isExporting && <ArrowRight className="h-4 w-4" />}
          </button>
          <div className={`mt-2 flex items-center justify-center gap-2 text-[11px] ${exportError ? 'text-[#d59aa3]' : 'text-white/35'}`}>
            <Clock3 className="h-3.5 w-3.5" /> {exportError || 'ZIP с Excel формируется fail-closed'}
          </div>
        </div>
      </aside>
    </motion.div>
  );
}
