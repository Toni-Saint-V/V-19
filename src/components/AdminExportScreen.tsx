import React, { useMemo, useState } from 'react';
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
}

const initialMockData: ExportItem[] = [
  {
    id: 'SUB-1061',
    title: 'Семья Орловых',
    type: 'family',
    applicantsCount: 4,
    country: 'Испания',
    city: 'Москва',
    appointmentDate: '18 июля, 09:40',
    approvedDate: 'Сегодня, 10:45',
    selected: true,
    readiness: 100,
    warnings: 1,
    blockers: 0,
    files: 18,
    agent: 'Мария Климова',
    packageSize: '42 МБ',
  },
  {
    id: 'SUB-1078',
    title: 'Дмитрий Волков',
    type: 'single',
    applicantsCount: 1,
    country: 'Испания',
    city: 'Санкт-Петербург',
    appointmentDate: '19 июля, 12:10',
    approvedDate: 'Вчера, 16:20',
    selected: false,
    readiness: 100,
    warnings: 0,
    blockers: 0,
    files: 7,
    agent: 'Игорь Сафонов',
    packageSize: '14 МБ',
  },
  {
    id: 'SUB-1082',
    title: 'Елена Смирнова',
    type: 'single',
    applicantsCount: 1,
    country: 'Испания',
    city: 'Москва',
    appointmentDate: '20 июля, 10:30',
    approvedDate: 'Вчера, 11:15',
    selected: false,
    readiness: 98,
    warnings: 2,
    blockers: 0,
    files: 8,
    agent: 'Анна Ветрова',
    packageSize: '17 МБ',
  },
  {
    id: 'FAM-005',
    title: 'Семья Кузнецовых',
    type: 'family',
    applicantsCount: 3,
    country: 'Испания',
    city: 'Екатеринбург',
    appointmentDate: '22 июля, 08:50',
    approvedDate: '12 авг, 09:30',
    selected: false,
    readiness: 100,
    warnings: 0,
    blockers: 0,
    files: 15,
    agent: 'Олег Морозов',
    packageSize: '36 МБ',
  },
];

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
  const [items, setItems] = useState<ExportItem[]>(initialMockData);
  const [activeId, setActiveId] = useState(initialMockData[0]?.id ?? '');
  const [isExporting, setIsExporting] = useState(false);

  const selectedItems = useMemo(() => items.filter((item) => item.selected), [items]);
  const activeItem = items.find((item) => item.id === activeId) ?? selectedItems[0] ?? items[0];
  const selectedCount = selectedItems.length;
  const selectedApplicants = selectedItems.reduce((sum, item) => sum + item.applicantsCount, 0);
  const selectedFiles = selectedItems.reduce((sum, item) => sum + item.files, 0);
  const selectedWarnings = selectedItems.reduce((sum, item) => sum + item.warnings, 0);
  const hasExportBlockers = selectedItems.some((item) => item.blockers > 0);

  const toggleAll = () => {
    const allSelected = items.every((item) => item.selected);
    setItems(items.map((item) => ({ ...item, selected: !allSelected })));
  };

  const toggleItem = (id: string) => {
    setItems(items.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item)));
    setActiveId(id);
  };

  const handleExport = () => {
    if (selectedCount === 0 || hasExportBlockers) return;
    const submissionIds = selectedItems.map((item) => item.id);
    void bridge.onExportPackages?.(submissionIds);
    emitVisaflowUiEvent(bridge, { type: 'export.start', submissionIds });
    setIsExporting(true);
    setTimeout(() => {
      const remaining = items.filter((item) => !item.selected);
      setItems(remaining);
      setActiveId(remaining[0]?.id ?? '');
      setIsExporting(false);
    }, 1200);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="grid h-full min-h-[760px] grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_390px]"
    >
      <section className="flex min-w-0 flex-col gap-5">
        <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[#242529] bg-gradient-to-br from-[#1a1a1d] to-[#141416] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[#b8baff]/75">Готовы</span>
              <CheckCircle2 className="h-4 w-4 text-[#b8baff]" />
            </div>
            <div className="mt-5 text-2xl font-semibold text-white">{items.length}</div>
            <div className="mt-1 text-[11px] text-white/40">пакетов в очереди</div>
          </div>

          <div className="rounded-2xl border border-[#242529] bg-gradient-to-br from-[#1a1a1d] to-[#141416] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-white/50">Выбрано</span>
              <PackageCheck className="h-4 w-4 text-[#b8baff]" />
            </div>
            <div className="mt-5 text-2xl font-semibold text-white">{selectedCount}</div>
            <div className="mt-1 text-[11px] text-white/40">{selectedApplicants} заявителей</div>
          </div>

          <div className="rounded-2xl border border-[#242529] bg-gradient-to-br from-[#1a1a1d] to-[#141416] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-white/50">Документы</span>
              <FileArchive className="h-4 w-4 text-white/45" />
            </div>
            <div className="mt-5 text-2xl font-semibold text-white">{selectedFiles}</div>
            <div className="mt-1 text-[11px] text-white/40">PDF/JPG/XLSX в manifest</div>
          </div>

          <div className="rounded-2xl border border-[#242529] bg-gradient-to-br from-[#1a1a1d] to-[#141416] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-white/55">Pre-flight</span>
              {hasExportBlockers ? <XCircle className="h-4 w-4 text-[#d59aa3]" /> : <ShieldCheck className="h-4 w-4 text-[#b8baff]" />}
            </div>
            <div className="mt-5 text-2xl font-semibold text-white">{hasExportBlockers ? 'STOP' : 'OK'}</div>
            <div className="mt-1 text-[11px] text-white/40">{selectedWarnings} предупреждений</div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#242529] bg-[#161617] shadow-[0_4px_24px_rgba(0,0,0,0.15)]">
          <div className="shrink-0 border-b border-[#242529] bg-[#1a1a1d] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-[18px] font-semibold text-white">Пакеты к выгрузке</h2>
                <p className="mt-1 text-[12px] text-white/45">Формирование Excel + ZIP, контроль manifest и экспортных блокеров.</p>
              </div>
              <div className="flex flex-1 items-center gap-2 lg:ml-auto lg:max-w-[520px]">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                  <input
                    placeholder="Поиск по ID, семье, агенту"
                    className="h-10 w-full rounded-xl border border-[#242529] bg-[#111113] pl-9 pr-3 text-[13px] text-white placeholder:text-white/30 outline-none focus:border-[#6f64ff]/70"
                  />
                </div>
                <button className="h-10 rounded-xl border border-[#242529] bg-[#111113] px-3 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/5">
                  <Filter className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-[44px_minmax(220px,1fr)_150px_130px_110px] gap-3 border-b border-[#242529] bg-[#141416] px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-white/35 max-lg:hidden">
            <button
              onClick={toggleAll}
              className={`flex h-5 w-5 items-center justify-center rounded-md border ${items.every((item) => item.selected) && items.length > 0 ? 'border-[#6f64ff] bg-[#6f64ff]' : 'border-[#242529] bg-[#161617]'}`}
            >
              {items.every((item) => item.selected) && items.length > 0 && <CheckSquare className="h-3.5 w-3.5 text-white" />}
            </button>
            <div>Пакет</div>
            <div>Слот</div>
            <div>Готовность</div>
            <div className="text-right">Размер</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-4 py-20 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/5 bg-white/5">
                  <CheckCircle2 className="h-5 w-5 text-white/35" />
                </div>
                <h3 className="mb-1 text-[15px] font-semibold text-white">Все досье выгружены</h3>
                <p className="text-[13px] text-white/40">Очередь на экспорт пуста.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {items.map((item) => (
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
                        <span className="rounded-md border border-white/5 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/40">{item.id}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-white/40">
                        <span>{item.agent}</span>
                        <span className="h-1 w-1 rounded-full bg-white/20" />
                        <span>{item.city}</span>
                        <span className="h-1 w-1 rounded-full bg-white/20" />
                        <span>{item.files} файлов</span>
                      </div>
                    </div>

                    <div className="text-[12px] text-white/65 lg:text-[13px]">{item.appointmentDate}</div>

                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5 lg:w-20 lg:flex-none">
                        <div className="h-full rounded-full bg-[#7c73ff]" style={{ width: `${item.readiness}%` }} />
                      </div>
                      <span className="text-[12px] font-medium text-white/70">{item.readiness}%</span>
                    </div>

                    <div className="flex items-center justify-between gap-3 lg:justify-end">
                      {item.warnings > 0 ? <StatusPill tone="orange">{item.warnings} warning</StatusPill> : <StatusPill tone="green">чисто</StatusPill>}
                      <span className="text-[12px] font-medium text-white/55">{item.packageSize}</span>
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
              <p className="mt-2 text-[12px] leading-relaxed text-white/45">Контроль состава, блокеров, manifest и истории перед финальным архивом.</p>
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
              <ManifestRow icon={ShieldCheck} label="Открытые блокеры" value="0" />
              <ManifestRow icon={FileSpreadsheet} label="Excel preview" value="готов" />
              <ManifestRow icon={FileArchive} label="ZIP manifest" value={`${selectedFiles} файлов`} state={selectedCount ? 'ok' : 'neutral'} />
              <ManifestRow icon={Lock} label="Дубликаты экспорта" value="нет" />
              <ManifestRow icon={AlertTriangle} label="Warnings" value={`${selectedWarnings}`} state={selectedWarnings ? 'warn' : 'ok'} />
            </div>
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
              <div>
                <div className="text-[12px] font-medium text-white/75">12 пакетов выгружено</div>
                <div className="text-[11px] text-white/35">14:25 · Excel + ZIP</div>
              </div>
              <div>
                <div className="text-[12px] font-medium text-white/75">2 пакета возвращены в проверку</div>
                <div className="text-[11px] text-white/35">12:10 · mismatch по датам</div>
              </div>
              <div>
                <div className="text-[12px] font-medium text-white/75">Manifest обновлён</div>
                <div className="text-[11px] text-white/35">09:05 · авто-проверка</div>
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
            {isExporting ? 'Формируем архив…' : 'Сформировать Excel + ZIP'}
            {!isExporting && <ArrowRight className="h-4 w-4" />}
          </button>
          <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-white/35">
            <Clock3 className="h-3.5 w-3.5" /> Audit log будет записан автоматически
          </div>
        </div>
      </aside>
    </motion.div>
  );
}
