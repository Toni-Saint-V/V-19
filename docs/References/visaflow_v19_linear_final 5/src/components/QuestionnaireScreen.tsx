import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft, CheckCircle2, AlertCircle, Save, Send, User, FileText,
  Briefcase, CreditCard, Plane, History, ShieldCheck, ChevronRight, Search,
  Calendar, MapPin, Building2, Mail, Phone, Sparkles, Info, X
} from 'lucide-react';

interface QuestionnaireScreenProps {
  submissionId: string;
  onBack: () => void;
}

type SectionStatus = 'complete' | 'active' | 'attention' | 'locked';

interface QuestionnaireSection {
  id: string;
  title: string;
  description: string;
  progressLabel: string;
  status: SectionStatus;
  icon: React.ComponentType<{ className?: string }>;
  fields: Array<{ label: string; value: string; state?: 'ok' | 'warning' | 'empty' }>;
}

const sections: QuestionnaireSection[] = [
  {
    id: 'personal',
    title: 'Личные данные',
    description: 'ФИО, дата рождения, контакты и базовая идентификация.',
    progressLabel: '100%',
    status: 'complete',
    icon: User,
    fields: [
      { label: 'Фамилия', value: 'PETROV', state: 'ok' },
      { label: 'Имя', value: 'IVAN', state: 'ok' },
      { label: 'Телефон', value: '+7 921 000-41-12', state: 'ok' },
      { label: 'Email', value: 'ivan.petrov@example.com', state: 'ok' },
    ],
  },
  {
    id: 'passport',
    title: 'Паспорт',
    description: 'Загранпаспорт, внутренний паспорт и машинная сверка OCR.',
    progressLabel: '92%',
    status: 'attention',
    icon: FileText,
    fields: [
      { label: 'Номер загранпаспорта', value: '75 1234567', state: 'ok' },
      { label: 'Дата выдачи', value: '15.06.2020', state: 'ok' },
      { label: 'Место рождения', value: 'MOSCOW', state: 'warning' },
      { label: 'Срок действия', value: '15.06.2030', state: 'ok' },
    ],
  },
  {
    id: 'work',
    title: 'Работа / учёба',
    description: 'Должность, работодатель, адрес и подтверждающие документы.',
    progressLabel: '64%',
    status: 'active',
    icon: Briefcase,
    fields: [
      { label: 'Работодатель', value: 'ООО «Северный маршрут»', state: 'ok' },
      { label: 'Должность', value: 'Руководитель проекта', state: 'ok' },
      { label: 'Адрес работодателя', value: 'Нужно уточнить индекс', state: 'warning' },
      { label: 'Телефон работодателя', value: 'Не заполнено', state: 'empty' },
    ],
  },
  {
    id: 'finance',
    title: 'Финансы',
    description: 'Выписки, спонсорство, доход и подтверждение средств.',
    progressLabel: '40%',
    status: 'active',
    icon: CreditCard,
    fields: [
      { label: 'Тип финансирования', value: 'Собственные средства', state: 'ok' },
      { label: 'Выписка банка', value: 'Загружена, OCR обрабатывает', state: 'warning' },
      { label: 'Сумма на счёте', value: 'Не подтверждено', state: 'empty' },
      { label: 'Спонсор', value: 'Не требуется', state: 'ok' },
    ],
  },
  {
    id: 'trip',
    title: 'Поездка',
    description: 'Маршрут, даты, бронирования, цель поездки.',
    progressLabel: '100%',
    status: 'complete',
    icon: Plane,
    fields: [
      { label: 'Страна', value: 'Франция / Шенген', state: 'ok' },
      { label: 'Даты поездки', value: '18 авг – 02 сен 2026', state: 'ok' },
      { label: 'Отель', value: 'Mercure Paris Centre', state: 'ok' },
      { label: 'Цель поездки', value: 'Туризм', state: 'ok' },
    ],
  },
  {
    id: 'history',
    title: 'Визовая история',
    description: 'Предыдущие визы, отказы, биометрия.',
    progressLabel: '100%',
    status: 'complete',
    icon: History,
    fields: [
      { label: 'Биометрия', value: 'Сдана 18.09.2023', state: 'ok' },
      { label: 'Предыдущие визы', value: 'Schengen C, 2023–2025', state: 'ok' },
      { label: 'Отказы', value: 'Нет', state: 'ok' },
      { label: 'Доп. комментарии', value: 'Не требуется', state: 'ok' },
    ],
  },
];

const statusMeta: Record<SectionStatus, { label: string; className: string; dot: string }> = {
  complete: {
    label: 'Готово',
    className: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    dot: 'bg-emerald-400',
  },
  active: {
    label: 'В работе',
    className: 'bg-[#3a45b4]/15 border-[#3a45b4]/25 text-[#8fa3ff]',
    dot: 'bg-[#8fa3ff]',
  },
  attention: {
    label: 'Проверить',
    className: 'bg-[#f59e0b]/10 border-[#f59e0b]/20 text-[#fbbf24]',
    dot: 'bg-[#f59e0b]',
  },
  locked: {
    label: 'Закрыто',
    className: 'bg-white/5 border-white/10 text-white/40',
    dot: 'bg-white/30',
  },
};

function ProgressBar({ progressLabel, status }: { progressLabel: string; status: SectionStatus }) {
  const widthClass = progressLabel === '100%' ? 'w-full' : progressLabel === '92%' ? 'w-[92%]' : progressLabel === '64%' ? 'w-[64%]' : progressLabel === '40%' ? 'w-[40%]' : 'w-0';
  const colorClass = status === 'complete' ? 'bg-emerald-500' : status === 'attention' ? 'bg-[#f59e0b]' : 'bg-[#3a45b4]';

  return (
    <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
      <div className={`h-full rounded-full ${widthClass} ${colorClass}`} />
    </div>
  );
}

function FieldStateIcon({ state }: { state?: 'ok' | 'warning' | 'empty' }) {
  if (state === 'warning') return <AlertCircle className="w-3.5 h-3.5 text-[#f59e0b]" />;
  if (state === 'empty') return <div className="w-3.5 h-3.5 rounded-full border border-white/20" />;
  return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
}

export function QuestionnaireScreen({ submissionId, onBack }: QuestionnaireScreenProps) {
  const [activeSection, setActiveSection] = useState(sections[1].id);
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);
  const [mobileSectionsOpen, setMobileSectionsOpen] = useState(false);
  const active = sections.find((section) => section.id === activeSection) ?? sections[0];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#101011] text-white flex flex-col overflow-hidden vf-questionnaire-screen"
    >
      <header className="h-[64px] shrink-0 border-b border-[#202124] bg-[#141416]/95 backdrop-blur-md flex items-center px-4 lg:px-6 gap-4">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-xl bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] flex items-center justify-center text-white/70 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <div className="vf-questionnaire-kicker flex items-center gap-2 text-[11px] text-white/40 uppercase tracking-wider">
            <span className="font-mono text-white/60">{submissionId}</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>Редактирование анкеты</span>
          </div>
          <h1 className="text-[18px] lg:text-[21px] font-semibold tracking-tight text-white leading-tight truncate">
            Семья Петровых · Schengen France
          </h1>
        </div>
        <div className="ml-auto hidden md:flex items-center gap-2">
          <button className="h-10 px-4 rounded-xl bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] text-[13px] font-medium text-white/80 flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]">
            <Save className="w-4 h-4" /> Сохранить
          </button>
          <button className="h-10 px-4 rounded-xl bg-[#3a45b4] hover:bg-[#4855d4] text-[13px] font-medium text-white flex items-center gap-2 shadow-[0_0_20px_rgba(58,69,180,0.25)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <Send className="w-4 h-4" /> Отправить на проверку
          </button>
        </div>
        <button className="vf-questionnaire-mobile-done" type="button" onClick={onBack}>
          Готово
        </button>
      </header>

      <main className="vf-questionnaire-layout flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] overflow-hidden">
        <aside className="vf-questionnaire-sidebar border-r border-[#202124] bg-[#141416] p-4 lg:p-5 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
          <div className="vf-questionnaire-readiness mb-5 p-4 rounded-2xl border border-[#242529] bg-gradient-to-br from-[#1a1a1d] to-[#141416]">
            <div className="flex items-center gap-2 text-[11px] text-white/40 uppercase tracking-wider font-medium mb-3">
              <Sparkles className="w-3.5 h-3.5 text-[#8fa3ff]" /> AI readiness
            </div>
            <div className="flex items-end justify-between mb-2">
              <div className="text-3xl font-semibold text-white">86%</div>
              <div className="text-[12px] text-[#f59e0b] font-medium">2 риска</div>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full w-[86%] bg-[#3a45b4] rounded-full" />
            </div>
            <p className="text-[12px] text-white/45 leading-relaxed mt-3">
              Пакет можно отправлять после уточнения места рождения и банковской выписки.
            </p>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              placeholder="Найти поле..."
              className="w-full h-10 bg-[#1e1e21] border border-[#242529] rounded-xl pl-9 pr-3 text-sm text-white placeholder-white/35 outline-none focus:border-[#3a45b4] focus:ring-1 focus:ring-[#3a45b4]/30"
            />
          </div>

          <nav className="vf-questionnaire-sections space-y-2">
            {sections.map((section) => {
              const Icon = section.icon;
              const meta = statusMeta[section.status];
              const selected = section.id === activeSection;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full p-3 rounded-2xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${selected ? 'bg-[#202024] border-[#3a45b4]/40' : 'bg-[#161617] border-[#242529] hover:border-[#2e2f34]'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${meta.className}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="vf-questionnaire-section-title text-[13px] font-semibold text-white truncate">{section.title}</span>
                        <span className="vf-questionnaire-section-progress text-[11px] font-mono text-white/50">{section.progressLabel}</span>
                      </div>
                      <div className="mt-2">
                        <ProgressBar progressLabel={section.progressLabel} status={section.status} />
                      </div>
                    </div>
                    <ChevronRight className="vf-questionnaire-section-chevron w-4 h-4 text-white/30" />
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="vf-questionnaire-stage min-w-0 flex flex-col bg-[#101011] overflow-hidden">
          <div className="p-4 lg:p-6 border-b border-[#202124] bg-[#141416]">
            <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[12px] font-medium text-white/45 uppercase tracking-wider mb-2">
                  <span className={`w-2 h-2 rounded-full ${statusMeta[active.status].dot}`} />
                  {statusMeta[active.status].label}
                </div>
                <h2 className="text-[24px] lg:text-[30px] font-semibold tracking-tight text-white leading-tight">{active.title}</h2>
                <p className="vf-questionnaire-section-description text-[13px] text-white/50 mt-2 max-w-2xl leading-relaxed">{active.description}</p>
              </div>
              <div className="vf-questionnaire-metrics grid grid-cols-3 gap-2 w-full xl:w-auto">
                <div className="p-3 rounded-xl bg-[#161617] border border-[#242529]">
                  <Calendar className="w-4 h-4 text-white/40 mb-2" />
                  <div className="text-[11px] text-white/40">Срок</div>
                  <div className="text-[13px] font-medium text-white">24 часа</div>
                </div>
                <div className="p-3 rounded-xl bg-[#161617] border border-[#242529]">
                  <MapPin className="w-4 h-4 text-white/40 mb-2" />
                  <div className="text-[11px] text-white/40">Подача</div>
                  <div className="text-[13px] font-medium text-white">Москва</div>
                </div>
                <div className="p-3 rounded-xl bg-[#161617] border border-[#242529]">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 mb-2" />
                  <div className="text-[11px] text-white/40">Риск</div>
                  <div className="text-[13px] font-medium text-white">Низкий</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 lg:p-6 scrollbar-thin scrollbar-thumb-white/10">
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5">
              <div className="space-y-3">
                {active.fields.map((field) => (
                  <div key={field.label} className={`p-4 rounded-2xl border bg-[#161617] transition-colors ${field.state === 'warning' ? 'border-orange-500/30 bg-orange-500/5' : 'border-[#242529] hover:border-[#2e2f34]'}`}>
                    <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <FieldStateIcon state={field.state} />
                          <span className="text-[11px] text-white/40 uppercase tracking-wider font-medium">{field.label}</span>
                        </div>
                        <div className="text-[15px] font-medium text-white truncate">{field.value}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="h-9 px-3 rounded-lg bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] text-[12px] font-medium text-white/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]">Изменить</button>
                        <button className="h-9 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 text-[12px] font-medium text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">Подтвердить</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <aside className="vf-questionnaire-context-rail space-y-4">
                <div className="p-5 rounded-2xl bg-[#161617] border border-[#242529]">
                  <h3 className="text-[13px] font-semibold text-white mb-3">Контекст заявителя</h3>
                  <div className="space-y-3 text-[13px]">
                    <div className="flex items-center gap-3 text-white/70"><User className="w-4 h-4 text-white/35" /> Иван Петров, основной</div>
                    <div className="flex items-center gap-3 text-white/70"><Building2 className="w-4 h-4 text-white/35" /> ООО «Северный маршрут»</div>
                    <div className="flex items-center gap-3 text-white/70"><Mail className="w-4 h-4 text-white/35" /> ivan.petrov@example.com</div>
                    <div className="flex items-center gap-3 text-white/70"><Phone className="w-4 h-4 text-white/35" /> +7 921 000-41-12</div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-gradient-to-br from-[#1a1a1d] to-[#141416] border border-[#242529]">
                  <h3 className="text-[13px] font-semibold text-white mb-2">Следующее лучшее действие</h3>
                  <p className="text-[12px] text-white/50 leading-relaxed mb-4">
                    Запросить у клиента обновлённую банковскую выписку и подтвердить место рождения по паспорту.
                  </p>
                  <button className="w-full h-10 rounded-xl bg-[#3a45b4] hover:bg-[#4855d4] text-[13px] font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                    Создать запрос клиенту
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>

      <div className="vf-questionnaire-mobile-dock" aria-label="Дополнения анкеты">
        <button type="button" onClick={() => setMobileSectionsOpen(true)}>
          <FileText className="w-4 h-4" />
          Разделы
        </button>
        <button type="button" onClick={() => setMobileInfoOpen(true)}>
          <Info className="w-4 h-4" />
          Инфо
        </button>
      </div>

      <AnimatePresence>
        {mobileSectionsOpen && (
          <>
            <motion.button
              aria-label="Закрыть разделы анкеты"
              className="vf-questionnaire-info-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              type="button"
              onClick={() => setMobileSectionsOpen(false)}
            />
            <motion.aside
              aria-label="Разделы анкеты"
              className="vf-questionnaire-info-sheet vf-questionnaire-sections-sheet"
              initial={{ y: 32, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 32, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <div className="vf-questionnaire-info-sheet-head">
                <div>
                  <span>Разделы анкеты</span>
                  <strong>{active.title}</strong>
                </div>
                <button type="button" onClick={() => setMobileSectionsOpen(false)} aria-label="Закрыть">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="vf-questionnaire-sheet-sections">
                {sections.map((section) => {
                  const Icon = section.icon;
                  const meta = statusMeta[section.status];
                  const selected = section.id === activeSection;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      className={selected ? 'is-active' : ''}
                      onClick={() => {
                        setActiveSection(section.id);
                        setMobileSectionsOpen(false);
                      }}
                    >
                      <span className={`vf-questionnaire-sheet-section-icon ${meta.className}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span>
                        <strong>{section.title}</strong>
                        <em>{statusMeta[section.status].label}</em>
                      </span>
                      <b>{section.progressLabel}</b>
                    </button>
                  );
                })}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mobileInfoOpen && (
          <>
            <motion.button
              aria-label="Закрыть контекст анкеты"
              className="vf-questionnaire-info-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              type="button"
              onClick={() => setMobileInfoOpen(false)}
            />
            <motion.aside
              aria-label="Контекст анкеты"
              className="vf-questionnaire-info-sheet"
              initial={{ y: 28, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 28, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <div className="vf-questionnaire-info-sheet-head">
                <div>
                  <span>Контекст анкеты</span>
                  <strong>{active.title}</strong>
                </div>
                <button type="button" onClick={() => setMobileInfoOpen(false)} aria-label="Закрыть">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="vf-questionnaire-info-grid">
                <div>
                  <span>Готовность</span>
                  <strong>86%</strong>
                  <em>2 риска</em>
                </div>
                <div>
                  <span>Подача</span>
                  <strong>Москва</strong>
                  <em>24 часа</em>
                </div>
                <div>
                  <span>Заявитель</span>
                  <strong>Иван Петров</strong>
                  <em>Основной</em>
                </div>
              </div>
              <div className="vf-questionnaire-info-note">
                Запросить обновленную банковскую выписку и подтвердить место рождения по паспорту.
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
