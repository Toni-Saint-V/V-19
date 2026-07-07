import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Filter,
  FolderCheck,
  History,
  Lock,
  PackageCheck,
  Search,
  ShieldCheck,
  UploadCloud,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import { emitVisaflowUiEvent, useVisaflowBusinessBridge } from '../integration/visaflowBusinessBridge';
import { createStoredZipBlob, safeZipSegment } from '../lib/export/exportZipCore';
import { loadLocalSubmissions, saveLocalSubmissions } from '../services/localRepository';
import { applyExportPackageDraft, buildExportPackageDraftsByCity, exportBlockers, type ExportCityPackageDraft } from '../services/exportService';
import type { Applicant, Submission } from '../types/domain';

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
  blockerMessages: string[];
  files: number;
  agent: string;
  packageSize: string;
  submission: Submission;
}

interface CityGroup {
  city: string;
  items: ExportItem[];
  applicantsCount: number;
  familyCount: number;
  filesCount: number;
  blockersCount: number;
}

interface ReturnUploadFile {
  id: string;
  file: File;
  name: string;
  kind: 'appointment-list' | 'application-form';
  matchedTo: string;
  status: 'matched' | 'waiting';
}

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

export function AdminExportScreen() {
  const bridge = useVisaflowBusinessBridge();
  const [submissions, setSubmissions] = useState<Submission[]>(() => loadLocalSubmissions());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [returnFiles, setReturnFiles] = useState<ReturnUploadFile[]>([]);
  const [handoffReady, setHandoffReady] = useState(false);
  const [isBuildingHandoff, setIsBuildingHandoff] = useState(false);
  const seededSelection = useRef(false);

  const exportItems = useMemo(
    () =>
      submissions
        .filter((submission) => ['accepted', 'ready_for_excel'].includes(submission.status))
        .map((submission) => exportItemFromSubmission(submission, selectedIds.has(submission.id)))
        .sort(sortExportItems),
    [submissions, selectedIds],
  );

  const cityOptions = useMemo(
    () => Array.from(new Set<string>(exportItems.map((item) => item.city))).sort((left, right) => left.localeCompare(right, 'ru')),
    [exportItems],
  );

  const visibleItems = useMemo(() => {
    const query = normalizeText(searchQuery).toLowerCase();
    return exportItems.filter((item) => {
      const cityMatches = cityFilter === 'all' || item.city === cityFilter;
      if (!cityMatches) return false;
      if (!query) return true;
      return [item.id, item.title, item.city, item.country, item.agent]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [cityFilter, exportItems, searchQuery]);

  const visibleCityGroups = useMemo(() => groupExportItemsByCity(visibleItems), [visibleItems]);
  const selectedItems = useMemo(() => exportItems.filter((item) => item.selected), [exportItems]);
  const selectedCityGroups = useMemo(() => groupExportItemsByCity(selectedItems), [selectedItems]);
  const visibleSelectableItems = visibleItems.filter((item) => item.blockers === 0);
  const allVisibleSelected = visibleSelectableItems.length > 0 && visibleSelectableItems.every((item) => item.selected);

  const activeItem = exportItems.find((item) => item.id === activeId) ?? selectedItems[0] ?? exportItems[0];
  const selectedCount = selectedItems.length;
  const selectedApplicants = selectedItems.reduce((sum, item) => sum + item.applicantsCount, 0);
  const selectedFiles = selectedItems.reduce((sum, item) => sum + item.files, 0);
  const selectedWarnings = selectedItems.reduce((sum, item) => sum + item.warnings, 0);
  const selectedBlockers = selectedItems.reduce((sum, item) => sum + item.blockers, 0);
  const hasExportBlockers = selectedBlockers > 0;
  const selectedCityCount = selectedCityGroups.length;
  const readyDraftCount = selectedCityGroups.filter((group) => group.blockersCount === 0).length;
  const exportedToday = submissions.filter((submission) => submission.status === 'exported' && isToday(submission.exportedAt ?? submission.updated)).length;
  const appointmentListFiles = returnFiles.filter((file) => file.kind === 'appointment-list');
  const applicationFormFiles = returnFiles.filter((file) => file.kind === 'application-form');
  const unmatchedApplicationForms = applicationFormFiles.filter((file) => file.status === 'waiting').length;
  const canBuildAgentHandoff = appointmentListFiles.length > 0 && applicationFormFiles.length > 0 && unmatchedApplicationForms === 0;

  useEffect(() => {
    if (seededSelection.current || exportItems.length === 0) return;
    seededSelection.current = true;
    setSelectedIds(new Set(exportItems.filter((item) => item.blockers === 0).map((item) => item.id)));
  }, [exportItems]);

  useEffect(() => {
    if (!exportItems.some((item) => item.id === activeId)) {
      setActiveId(exportItems[0]?.id ?? '');
    }
  }, [activeId, exportItems]);

  const toggleAll = () => {
    const visibleIds = visibleSelectableItems.map((item) => item.id);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleItem = (item: ExportItem) => {
    setActiveId(item.id);
    if (item.blockers > 0) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const handleExport = async () => {
    if (selectedCount === 0 || hasExportBlockers) return;

    const selectedSubmissions = selectedItems.map((item) => item.submission);
    const submissionIds = selectedItems.map((item) => item.id);
    setIsExporting(true);

    try {
      const cityDrafts = buildExportPackageDraftsByCity(selectedSubmissions, {
        createdAt: new Date().toISOString(),
        createdBy: 'admin-local',
        format: 'xlsx',
      });
      const blockers = cityDrafts.flatMap(({ draft }) =>
        draft.status === 'blocked' ? draft.blockers : [],
      );

      if (cityDrafts.length === 0 || blockers.length > 0) {
        console.warn('[VisaFlow export screen] Export blocked', blockers);
        return;
      }

      emitVisaflowUiEvent(bridge, { type: 'export.start', submissionIds });

      const artifact = await buildCombinedCityExportArtifact(cityDrafts);
      downloadBlob(artifact.blob, artifact.fileName);

      let nextSubmissions = submissions;
      let changed = false;
      for (const { draft } of cityDrafts) {
        if (draft.status === 'ready') {
          nextSubmissions = applyExportPackageDraft(nextSubmissions, draft);
          changed = true;
        }
      }

      if (changed) {
        saveLocalSubmissions(nextSubmissions);
        setSubmissions(nextSubmissions);
      } else {
        setSubmissions(loadLocalSubmissions());
      }
      setSelectedIds(new Set());
    } catch (error) {
      console.error('[VisaFlow export screen] Export failed', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleReturnFiles = (kind: ReturnUploadFile['kind']) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []) as File[];
    if (files.length === 0) return;

    setReturnFiles((current) => [
      ...current,
      ...files.map((file) => createReturnUploadFile(file, kind, submissions)),
    ]);
    setHandoffReady(false);
    event.currentTarget.value = '';
  };

  const handleBuildAgentHandoff = async () => {
    if (!canBuildAgentHandoff || isBuildingHandoff) return;

    setIsBuildingHandoff(true);
    try {
      const createdAt = new Date().toISOString();
      const zipFiles: Record<string, string | Uint8Array> = {
        'manifest.json': JSON.stringify(
          {
            createdAt,
            type: 'agent-pdf-return',
            appointmentLists: appointmentListFiles.map((file) => ({
              fileName: file.name,
              matchedTo: file.matchedTo,
            })),
            applicationForms: applicationFormFiles.map((file) => ({
              fileName: file.name,
              matchedTo: file.matchedTo,
              status: file.status,
            })),
          },
          null,
          2,
        ),
      };

      for (const file of returnFiles) {
        const folder = file.kind === 'appointment-list' ? 'appointment-lists' : 'application-forms';
        const owner = file.kind === 'appointment-list' ? 'BLS-lists' : safeZipSegment(file.matchedTo, 'applicant');
        const path = `${owner}/${folder}/${safeZipSegment(file.name, 'document.pdf')}`;
        zipFiles[path] = new Uint8Array(await file.file.arrayBuffer());
      }

      downloadBlob(
        createStoredZipBlob(zipFiles),
        `agent-pdf-return-${createdAt.slice(0, 10)}.zip`,
      );
      setHandoffReady(true);
    } finally {
      setIsBuildingHandoff(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="grid h-full min-h-[760px] grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_410px]"
    >
      <section className="flex min-w-0 flex-col gap-5">
        <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[#242529] bg-gradient-to-br from-[#1a1a1d] to-[#141416] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[#b8baff]/75">Готовы</span>
              <CheckCircle2 className="h-4 w-4 text-[#b8baff]" />
            </div>
            <div className="mt-5 text-2xl font-semibold text-white">{exportItems.length}</div>
            <div className="mt-1 text-[11px] text-white/40">анкет в очереди Excel</div>
          </div>

          <div className="rounded-2xl border border-[#242529] bg-gradient-to-br from-[#1a1a1d] to-[#141416] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-white/50">Выбрано</span>
              <PackageCheck className="h-4 w-4 text-[#b8baff]" />
            </div>
            <div className="mt-5 text-2xl font-semibold text-white">{selectedCount}</div>
            <div className="mt-1 text-[11px] text-white/40">{selectedApplicants} заявителей · {selectedCityCount} город.</div>
          </div>

          <div className="rounded-2xl border border-[#242529] bg-gradient-to-br from-[#1a1a1d] to-[#141416] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-white/50">Файлы</span>
              <FileArchive className="h-4 w-4 text-white/45" />
            </div>
            <div className="mt-5 text-2xl font-semibold text-white">{selectedFiles}</div>
            <div className="mt-1 text-[11px] text-white/40">анкеты / паспорта / медиа</div>
          </div>

          <div className="rounded-2xl border border-[#242529] bg-gradient-to-br from-[#1a1a1d] to-[#141416] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-white/55">Pre-flight</span>
              {hasExportBlockers ? <XCircle className="h-4 w-4 text-[#d59aa3]" /> : <ShieldCheck className="h-4 w-4 text-[#b8baff]" />}
            </div>
            <div className="mt-5 text-2xl font-semibold text-white">{hasExportBlockers ? 'STOP' : 'OK'}</div>
            <div className="mt-1 text-[11px] text-white/40">{selectedWarnings} предупрежд. · {selectedBlockers} блок.</div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#242529] bg-[#161617] shadow-[0_4px_24px_rgba(0,0,0,0.15)]">
          <div className="shrink-0 border-b border-[#242529] bg-[#1a1a1d] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-[18px] font-semibold text-white">Экран выгрузки BLS</h2>
                <p className="mt-1 text-[12px] text-white/45">Excel по городам: семьи идут первыми, каждая семья маркируется отдельным цветом.</p>
              </div>
              <div className="flex flex-1 items-center gap-2 lg:ml-auto lg:max-w-[620px]">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Поиск по ID, семье, городу, агенту"
                    className="h-10 w-full rounded-xl border border-[#242529] bg-[#111113] pl-9 pr-3 text-[13px] text-white placeholder:text-white/30 outline-none focus:border-[#6f64ff]/70"
                  />
                </div>
                <div className="relative">
                  <select
                    value={cityFilter}
                    onChange={(event) => setCityFilter(event.target.value)}
                    className="h-10 max-w-[190px] appearance-none rounded-xl border border-[#242529] bg-[#111113] px-3 pr-9 text-[13px] font-medium text-white/70 outline-none focus:border-[#6f64ff]/70"
                  >
                    <option value="all">Все города</option>
                    {cityOptions.map((city) => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                  <Filter className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-[44px_minmax(220px,1fr)_150px_130px_110px] gap-3 border-b border-[#242529] bg-[#141416] px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-white/35 max-lg:hidden">
            <button
              onClick={toggleAll}
              disabled={visibleSelectableItems.length === 0}
              className={`flex h-5 w-5 items-center justify-center rounded-md border disabled:cursor-not-allowed disabled:opacity-40 ${allVisibleSelected ? 'border-[#6f64ff] bg-[#6f64ff]' : 'border-[#242529] bg-[#161617]'}`}
            >
              {allVisibleSelected && <CheckSquare className="h-3.5 w-3.5 text-white" />}
            </button>
            <div>Пакет</div>
            <div>Дата / город</div>
            <div>Готовность</div>
            <div className="text-right">Размер</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {visibleItems.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-4 py-20 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/5 bg-white/5">
                  <CheckCircle2 className="h-5 w-5 text-white/35" />
                </div>
                <h3 className="mb-1 text-[15px] font-semibold text-white">Нет пакетов под фильтр</h3>
                <p className="text-[13px] text-white/40">Очередь выгрузки пуста или город/поиск скрыли записи.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleCityGroups.map((group) => (
                  <div key={group.city} className="space-y-1">
                    <div className="sticky top-0 z-10 flex items-center justify-between rounded-xl border border-white/5 bg-[#111113]/95 px-3 py-2 backdrop-blur">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#b8baff]">{group.city}</div>
                      <div className="text-[11px] text-white/35">{group.items.length} пак. · {group.applicantsCount} чел. · {group.familyCount} семей</div>
                    </div>
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => toggleItem(item)}
                        className={`grid w-full grid-cols-1 gap-3 rounded-xl border px-3 py-3 text-left transition-colors lg:grid-cols-[32px_minmax(220px,1fr)_150px_130px_110px] lg:items-center ${item.selected ? 'border-[#6f64ff]/35 bg-[#6f64ff]/10' : activeId === item.id ? 'border-white/10 bg-white/[0.035]' : item.blockers > 0 ? 'border-[#5d3038]/35 bg-[#2a1518]/20' : 'border-transparent bg-transparent hover:border-white/5 hover:bg-white/5'}`}
                      >
                        <div className={`hidden h-5 w-5 shrink-0 items-center justify-center rounded-md border lg:flex ${item.selected ? 'border-[#6f64ff] bg-[#6f64ff]' : item.blockers > 0 ? 'border-[#5d3038] bg-[#2a1518]' : 'border-[#242529] bg-[#161617]'}`}>
                          {item.selected && <CheckSquare className="h-3.5 w-3.5 text-white" />}
                          {!item.selected && item.blockers > 0 && <Lock className="h-3 w-3 text-[#d59aa3]" />}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {item.type === 'family' ? <Users className="h-3.5 w-3.5 text-white/50" /> : <User className="h-3.5 w-3.5 text-white/50" />}
                            <span className="truncate text-[14px] font-medium text-white">{item.title}</span>
                            <span className="rounded-md border border-white/5 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/40">{item.id}</span>
                            {item.type === 'family' && <StatusPill tone="blue">family first</StatusPill>}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-white/40">
                            <span>{item.agent}</span>
                            <span className="h-1 w-1 rounded-full bg-white/20" />
                            <span>{item.country}</span>
                            <span className="h-1 w-1 rounded-full bg-white/20" />
                            <span>{item.files} файлов</span>
                          </div>
                          {item.blockers > 0 && <div className="mt-1 text-[11px] text-[#d59aa3]">{item.blockerMessages[0]}</div>}
                        </div>

                        <div className="text-[12px] text-white/65 lg:text-[13px]">
                          <div>{item.appointmentDate}</div>
                          <div className="mt-0.5 text-[11px] text-white/35">{item.city}</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5 lg:w-20 lg:flex-none">
                            <div className="h-full rounded-full bg-[#7c73ff]" style={{ width: `${item.readiness}%` }} />
                          </div>
                          <span className="text-[12px] font-medium text-white/70">{item.readiness}%</span>
                        </div>

                        <div className="flex items-center justify-between gap-3 lg:justify-end">
                          {item.blockers > 0 ? <StatusPill tone="orange">blocked</StatusPill> : item.warnings > 0 ? <StatusPill tone="orange">{item.warnings} warning</StatusPill> : <StatusPill tone="green">чисто</StatusPill>}
                          <span className="text-[12px] font-medium text-white/55">{item.packageSize}</span>
                        </div>
                      </button>
                    ))}
                  </div>
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
              <h3 className="mt-1 text-[20px] font-semibold tracking-tight text-white">Выгрузка и возврат</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-white/45">Контроль Excel, городов, семейных цветов и обратной загрузки PDF для агентов.</p>
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
              {activeItem && <StatusPill tone={activeItem.blockers > 0 ? 'orange' : activeItem.warnings > 0 ? 'orange' : 'green'}>{activeItem.blockers > 0 ? 'blocked' : activeItem.warnings > 0 ? 'warnings' : 'готов'}</StatusPill>}
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
              <ManifestRow icon={FileSpreadsheet} label="Excel preview" value={selectedCount ? `${readyDraftCount}/${selectedCityCount} город.` : 'нет выбора'} state={selectedCount ? 'ok' : 'neutral'} />
              <ManifestRow icon={FileArchive} label="Состав файлов" value={`${selectedFiles} файлов`} state={selectedCount ? 'ok' : 'neutral'} />
              <ManifestRow icon={Lock} label="Разделение" value={selectedCityCount > 1 ? 'по городам' : selectedCityCount === 1 ? '1 город' : 'нет'} state={selectedCityCount ? 'ok' : 'neutral'} />
              <ManifestRow icon={AlertTriangle} label="Warnings" value={`${selectedWarnings}`} state={selectedWarnings ? 'warn' : 'ok'} />
            </div>
          </div>

          <div className="rounded-2xl border border-[#242529] bg-[#141416] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[14px] font-semibold text-white">Города выгрузки</h4>
              <span className="text-[12px] text-white/40">{selectedCityCount} Excel</span>
            </div>
            <div className="space-y-2">
              {selectedCityGroups.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-[12px] text-white/35">Выберите пакеты слева</div>
              ) : (
                selectedCityGroups.map((group) => (
                  <div key={group.city} className="rounded-xl border border-white/5 bg-white/[0.025] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[13px] font-semibold text-white/85">{group.city}</div>
                      <StatusPill tone={group.blockersCount ? 'orange' : 'blue'}>{group.blockersCount ? 'blocked' : 'отдельный Excel'}</StatusPill>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/35">
                      <span>{group.items.length} пак.</span>
                      <span>·</span>
                      <span>{group.applicantsCount} строк</span>
                      <span>·</span>
                      <span>{group.familyCount} семей</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#242529] bg-[#141416] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[14px] font-semibold text-white">Возврат PDF после записи</h4>
              <StatusPill tone={canBuildAgentHandoff ? 'green' : 'neutral'}>{canBuildAgentHandoff ? 'готово' : 'ожидание'}</StatusPill>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-white/10 bg-white/[0.025] px-3 py-3 transition-colors hover:border-[#6f64ff]/35 hover:bg-[#6f64ff]/10">
                <div>
                  <div className="text-[12px] font-medium text-white/80">Загрузить список BLS / PDF записи</div>
                  <div className="mt-0.5 text-[11px] text-white/35">общий PDF по группе или городу</div>
                </div>
                <UploadCloud className="h-4 w-4 text-[#b8baff]" />
                <input type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={handleReturnFiles('appointment-list')} />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-white/10 bg-white/[0.025] px-3 py-3 transition-colors hover:border-[#6f64ff]/35 hover:bg-[#6f64ff]/10">
                <div>
                  <div className="text-[12px] font-medium text-white/80">Загрузить анкеты PDF</div>
                  <div className="mt-0.5 text-[11px] text-white/35">сопоставление по паспорту / имени файла</div>
                </div>
                <UploadCloud className="h-4 w-4 text-[#b8baff]" />
                <input type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={handleReturnFiles('application-form')} />
              </label>
            </div>

            <div className="mt-3 space-y-2">
              {returnFiles.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-[12px] text-white/35">Файлы ещё не загружены.</div>
              ) : (
                returnFiles.map((file) => (
                  <div key={file.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.025] p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#6f64ff]/15 text-[#b8baff]">
                      {file.kind === 'appointment-list' ? <FileArchive className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium text-white/85">{file.name}</div>
                      <div className="mt-0.5 truncate text-[11px] text-white/35">{file.matchedTo}</div>
                    </div>
                    <StatusPill tone={file.status === 'matched' ? 'green' : 'orange'}>{file.status === 'matched' ? 'matched' : 'manual'}</StatusPill>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={handleBuildAgentHandoff}
              disabled={!canBuildAgentHandoff || isBuildingHandoff}
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] text-[13px] font-semibold text-white/80 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-white/30"
            >
              <PackageCheck className="h-4 w-4" />
              {isBuildingHandoff ? 'Собираем ZIP…' : 'Собрать PDF-пакеты агентам'}
            </button>
            {handoffReady && <div className="mt-2 rounded-xl border border-[#6f64ff]/20 bg-[#6f64ff]/10 p-3 text-[12px] text-[#d8d7ff]">ZIP готов к возврату агентам: список записи + анкеты PDF связаны и упакованы.</div>}
          </div>

          <div className="rounded-2xl border border-[#242529] bg-[#141416] p-4">
            <div className="mb-3 flex items-center gap-2">
              <History className="h-4 w-4 text-white/40" />
              <h4 className="text-[14px] font-semibold text-white">История сегодня</h4>
            </div>
            <div className="space-y-3 border-l border-white/10 pl-4">
              <div>
                <div className="text-[12px] font-medium text-white/75">{exportedToday} пакетов выгружено</div>
                <div className="text-[11px] text-white/35">Excel по городам · автоматический audit log</div>
              </div>
              <div>
                <div className="text-[12px] font-medium text-white/75">{returnFiles.length} PDF загружено обратно</div>
                <div className="text-[11px] text-white/35">списки BLS и анкеты для агентов</div>
              </div>
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
            {isExporting ? 'Формируем Excel…' : selectedCityCount > 1 ? `Сформировать ${selectedCityCount} Excel по городам` : 'Сформировать Excel'}
            {!isExporting && <ArrowRight className="h-4 w-4" />}
          </button>
          <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-white/35">
            <Clock3 className="h-3.5 w-3.5" /> Семьи идут первыми; цвета и merge BC ставятся автоматически
          </div>
        </div>
      </aside>
    </motion.div>
  );
}

function exportItemFromSubmission(submission: Submission, selected: boolean): ExportItem {
  const blockerMessages = exportBlockers(submission);
  const files = countSubmissionFiles(submission);
  const warnings = submission.notes.filter((note) => note.severity !== 'blocking').length;
  const readiness = blockerMessages.length > 0 ? Math.min(95, Math.round((submission.fields + mediaReadiness(submission)) / 2)) : 100;

  return {
    id: submission.id,
    title: submission.title,
    type: submission.type,
    applicantsCount: submission.applicants.length,
    country: submission.country,
    city: normalizeText(submission.city) || 'Без города',
    appointmentDate: formatTravelDate(submission.travelDate),
    approvedDate: formatShortDate(submission.acceptedAt ?? submission.updated),
    selected,
    readiness,
    warnings,
    blockers: blockerMessages.length,
    blockerMessages,
    files,
    agent: submission.agentName,
    packageSize: `${Math.max(6, files * 2 + submission.applicants.length * 4)} МБ`,
    submission,
  };
}

function sortExportItems(left: ExportItem, right: ExportItem): number {
  const cityCompare = left.city.localeCompare(right.city, 'ru', { sensitivity: 'base' });
  if (cityCompare !== 0) return cityCompare;

  const typeCompare = (left.type === 'family' ? 0 : 1) - (right.type === 'family' ? 0 : 1);
  if (typeCompare !== 0) return typeCompare;

  return left.id.localeCompare(right.id);
}

function groupExportItemsByCity(items: ExportItem[]): CityGroup[] {
  const groups = new Map<string, ExportItem[]>();
  for (const item of items) {
    const group = groups.get(item.city);
    if (group) group.push(item);
    else groups.set(item.city, [item]);
  }

  return [...groups.entries()].map(([city, groupItems]) => ({
    city,
    items: groupItems,
    applicantsCount: groupItems.reduce((sum, item) => sum + item.applicantsCount, 0),
    familyCount: groupItems.filter((item) => item.type === 'family').length,
    filesCount: groupItems.reduce((sum, item) => sum + item.files, 0),
    blockersCount: groupItems.reduce((sum, item) => sum + item.blockers, 0),
  }));
}

function countSubmissionFiles(submission: Submission): number {
  const applicantFiles = submission.applicants.reduce((sum, applicant) => sum + Math.max(applicant.mediaSlots?.length ?? 0, applicant.mediaRequired ?? 0), 0);
  return Math.max(submission.media, applicantFiles, submission.mediaRows.length);
}

function mediaReadiness(submission: Submission): number {
  if (submission.mediaRequired <= 0) return 100;
  return Math.round((submission.media / submission.mediaRequired) * 100);
}

function createReturnUploadFile(file: File, kind: ReturnUploadFile['kind'], submissions: Submission[]): ReturnUploadFile {
  const match = kind === 'application-form' ? matchFileToApplicant(file.name, submissions) : undefined;
  return {
    id: `${kind}-${file.name}-${file.lastModified}-${file.size}`,
    file,
    name: file.name,
    kind,
    matchedTo:
      kind === 'appointment-list'
        ? 'BLS appointment list · общий PDF для группы/города'
        : match?.label ?? 'Нужно ручное сопоставление: паспорт не найден в имени файла',
    status: kind === 'appointment-list' || match ? 'matched' : 'waiting',
  };
}

function matchFileToApplicant(fileName: string, submissions: Submission[]): { applicant: Applicant; label: string } | undefined {
  const fileDigits = digitsOnly(fileName);
  const candidates = submissions.flatMap((submission) =>
    submission.applicants.map((applicant) => ({ applicant, submission })),
  );

  if (fileDigits.length >= 3) {
    const digitMatch = candidates.find(({ applicant }) => {
      const passport = digitsOnly(applicant.passport);
      return passport.length >= 3 && (fileDigits.includes(passport) || fileDigits.endsWith(passport.slice(-3)) || passport.endsWith(fileDigits.slice(-3)));
    });
    if (digitMatch) {
      return {
        applicant: digitMatch.applicant,
        label: `${digitMatch.submission.title} · ${digitMatch.applicant.name} · ${digitMatch.submission.city}`,
      };
    }
  }

  const normalizedFileName = normalizeText(fileName).toLowerCase();
  const nameMatch = candidates.find(({ applicant }) =>
    applicant.name
      .split(/\s+/)
      .filter((part) => part.length >= 3)
      .some((part) => normalizedFileName.includes(part.toLowerCase())),
  );

  return nameMatch
    ? {
        applicant: nameMatch.applicant,
        label: `${nameMatch.submission.title} · ${nameMatch.applicant.name} · ${nameMatch.submission.city}`,
      }
    : undefined;
}


async function buildCombinedCityExportArtifact(
  cityDrafts: ExportCityPackageDraft[],
): Promise<{ blob: Blob; fileName: string }> {
  const downloadable = cityDrafts.filter(({ draft }) => draft.status !== 'blocked');
  if (downloadable.length === 1) {
    const [{ draft }] = downloadable;
    if (draft.status !== 'blocked') {
      return { blob: draft.artifact.blob, fileName: draft.artifact.fileName };
    }
  }

  const exportKey = downloadable
    .map(({ draft }) => (draft.status === 'blocked' ? '' : draft.idempotencyKey))
    .filter(Boolean)
    .join('-')
    .slice(0, 48) || String(Date.now());
  const zipFiles: Record<string, string | Uint8Array> = {
    'manifest.json': JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        type: 'city-export-package',
        cityCount: downloadable.length,
        files: downloadable.map(({ city, draft }) =>
          draft.status === 'blocked'
            ? { city, status: 'blocked' }
            : {
                city,
                status: draft.status,
                fileName: draft.artifact.fileName,
                rowCount: draft.batch.rowCount,
                submissionIds: draft.batch.submissionIds,
              },
        ),
      },
      null,
      2,
    ),
  };

  let index = 0;
  for (const { city, draft } of downloadable) {
    if (draft.status === 'blocked') continue;
    index += 1;
    const folder = `${String(index).padStart(2, '0')}_${safeZipSegment(city, 'city')}`;
    const fileName = safeZipSegment(draft.artifact.fileName, 'export.xlsx');
    zipFiles[`cities/${folder}/${fileName}`] = new Uint8Array(await draft.artifact.blob.arrayBuffer());
  }

  return {
    blob: createStoredZipBlob(zipFiles),
    fileName: `visaflow-export-${exportKey}.zip`,
  };
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function formatTravelDate(value: string): string {
  const dates = [...value.matchAll(/\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}/g)].map((match) => match[0]);
  if (dates.length >= 2) return `${formatShortDate(dates[0])} - ${formatShortDate(dates[1])}`;
  return formatShortDate(dates[0] ?? value);
}

function formatShortDate(value: string): string {
  const normalized = value.includes('.') ? value.split('.').reverse().join('-') : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value || '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(date);
}

function isToday(value: string): boolean {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  return date.toDateString() === today.toDateString();
}
