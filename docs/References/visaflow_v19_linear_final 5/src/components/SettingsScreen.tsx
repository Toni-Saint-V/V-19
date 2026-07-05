import React from 'react';
import { motion } from 'motion/react';
import {
  Bell,
  Building2,
  ChevronRight,
  Database,
  Eye,
  FileArchive,
  Fingerprint,
  Globe2,
  KeyRound,
  Lock,
  Mail,
  Palette,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserCog,
  Users,
} from 'lucide-react';

const automationRules = [
  { title: 'OCR после загрузки паспорта', detail: 'Запускать локальный MRZ/OCR и ставить тихий AI-label.', state: 'Включено' },
  { title: 'Pre-flight перед выгрузкой', detail: 'Блокировать Excel/ZIP при разных городах, датах или категориях.', state: 'Strict' },
  { title: 'Возврат агенту', detail: 'Группировать замечания по заявителю и месту исправления.', state: 'Включено' },
];

const team = [
  { initials: 'ТН', name: 'Татьяна Николаева', role: 'Старший агент', zone: 'Сбор документов' },
  { initials: 'МК', name: 'Марина Климова', role: 'Администратор', zone: 'Проверка / экспорт' },
  { initials: 'АВ', name: 'Антон Волков', role: 'Owner', zone: 'Полный доступ' },
];

function SettingCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[22px] bg-gradient-to-b from-[#18181b] to-[#111113] border border-[#25262b] shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_18px_45px_rgba(0,0,0,0.24)] overflow-hidden">
      <div className="h-14 px-5 border-b border-[#242529] flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-[#202024] border border-white/6 flex items-center justify-center text-[#9aa7ff]">
          {icon}
        </div>
        <h2 className="text-[14px] font-semibold tracking-tight text-white">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Row({ icon, title, value, muted }: { icon: React.ReactNode; title: string; value: string; muted?: string }) {
  return (
    <div className="min-h-[58px] flex items-center gap-3 border-b border-white/[0.055] last:border-b-0 py-3">
      <div className="w-9 h-9 rounded-xl bg-[#202024] border border-white/[0.06] flex items-center justify-center text-white/55 shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-medium text-white truncate">{title}</div>
        {muted && <div className="text-[11.5px] text-white/42 mt-0.5 truncate">{muted}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="px-2.5 py-1 rounded-full bg-[#202024] border border-white/[0.07] text-[11.5px] font-medium text-white/68">{value}</span>
        <ChevronRight className="w-4 h-4 text-white/28" />
      </div>
    </div>
  );
}

export function SettingsScreen() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5"
    >
      <div className="space-y-5">
        <div className="rounded-[24px] bg-[radial-gradient(circle_at_20%_0%,rgba(88,101,242,0.14),transparent_34%),linear-gradient(180deg,#1a1a1d,#111113)] border border-[#26272d] p-5 lg:p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_18px_60px_rgba(0,0,0,0.26)]">
          <div className="flex flex-col lg:flex-row lg:items-center gap-5">
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#22232a] border border-[#34364a] text-[#a8b2ff] text-[11px] font-medium mb-4">
                <Sparkles className="w-3.5 h-3.5" /> LinearStyle workspace
              </div>
              <h1 className="text-[23px] lg:text-[28px] font-semibold tracking-[-0.035em] text-white leading-tight m-0">
                Настройки рабочего контура
              </h1>
              <p className="text-[13.5px] text-white/50 mt-2 max-w-[720px] leading-relaxed">
                Управление ролями, экспортом, OCR, уведомлениями и визуальным режимом без лишней разноцветности. Акценты остаются только там, где есть действие или риск.
              </p>
            </div>
            <button className="h-11 px-4 rounded-[12px] bg-gradient-to-b from-[#2a2b31] to-[#191a1d] border border-[#34353c] text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_30px_rgba(0,0,0,0.22)] hover:border-[#5963d8]/45 transition-colors flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 text-[#a8b2ff]" /> Синхронизировать
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SettingCard icon={<Building2 className="w-4 h-4" />} title="Организация">
            <Row icon={<Globe2 className="w-4 h-4" />} title="Страна подачи" muted="Испания зафиксирована для V-19" value="Испания" />
            <Row icon={<Database className="w-4 h-4" />} title="Хранилище документов" muted="Supabase Storage · приватный bucket" value="Private" />
            <Row icon={<FileArchive className="w-4 h-4" />} title="Экспортный пакет" muted="Excel + ZIP + manifest.json" value="Стандарт" />
          </SettingCard>

          <SettingCard icon={<Palette className="w-4 h-4" />} title="Визуальный режим">
            <Row icon={<Eye className="w-4 h-4" />} title="Цветовая модель" muted="Монохром + редкий фиолетовый акцент" value="Linear" />
            <Row icon={<SlidersHorizontal className="w-4 h-4" />} title="Статусы" muted="Красный/жёлтый только для blocker/warning" value="Muted" />
            <Row icon={<Sparkles className="w-4 h-4" />} title="Кнопки" muted="Чёрно-серый перелив, фиолетовый label" value="Premium" />
          </SettingCard>

          <SettingCard icon={<ShieldCheck className="w-4 h-4" />} title="Безопасность">
            <Row icon={<Lock className="w-4 h-4" />} title="PII режим" muted="Не показывать сырые OCR-логи в UI" value="Strict" />
            <Row icon={<Fingerprint className="w-4 h-4" />} title="Аудит действий" muted="Каждая проверка и выгрузка попадает в timeline" value="On" />
            <Row icon={<KeyRound className="w-4 h-4" />} title="Доступ админов" muted="Owner / Admin / Agent без CRM-drift" value="Roles" />
          </SettingCard>

          <SettingCard icon={<Bell className="w-4 h-4" />} title="Уведомления">
            <Row icon={<Mail className="w-4 h-4" />} title="Возврат агенту" muted="Письмо + задача в “Мои действия”" value="On" />
            <Row icon={<Bell className="w-4 h-4" />} title="SLA проверки" muted="Тихий warning после 4 часов без действия" value="4 ч" />
            <Row icon={<Users className="w-4 h-4" />} title="Семейные пакеты" muted="Уведомлять по одному семейному bundle" value="Bundle" />
          </SettingCard>
        </div>

        <SettingCard icon={<Sparkles className="w-4 h-4" />} title="Автоматизация">
          <div className="space-y-2">
            {automationRules.map((rule) => (
              <div key={rule.title} className="p-3.5 rounded-2xl bg-[#151518] border border-[#25262b] flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#202024] border border-white/[0.06] flex items-center justify-center text-[#a8b2ff]">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-white truncate">{rule.title}</div>
                  <div className="text-[11.5px] text-white/45 mt-0.5 truncate">{rule.detail}</div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-[#22232a] border border-[#34364a] text-[#a8b2ff] text-[11px] font-semibold">{rule.state}</span>
              </div>
            ))}
          </div>
        </SettingCard>
      </div>

      <aside className="space-y-5">
        <section className="rounded-[24px] bg-gradient-to-b from-[#18181b] to-[#111113] border border-[#25262b] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_18px_45px_rgba(0,0,0,0.22)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-[#202024] border border-white/[0.06] flex items-center justify-center text-[#a8b2ff]"><UserCog className="w-4 h-4" /></div>
            <div>
              <h2 className="text-[14px] font-semibold text-white m-0">Команда</h2>
              <p className="text-[11.5px] text-white/42 m-0">Роли и зоны ответственности</p>
            </div>
          </div>
          <div className="space-y-2">
            {team.map((person) => (
              <div key={person.name} className="p-3 rounded-2xl bg-[#151518] border border-[#25262b]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-b from-[#2a2b31] to-[#1a1b1f] border border-white/[0.09] flex items-center justify-center text-[12px] font-semibold text-white/75">{person.initials}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-white truncate">{person.name}</div>
                    <div className="text-[11.5px] text-white/42 truncate">{person.role}</div>
                  </div>
                </div>
                <div className="mt-3 text-[11.5px] text-white/48 bg-[#1c1c20] border border-white/[0.05] rounded-xl px-3 py-2">{person.zone}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] bg-[radial-gradient(circle_at_30%_0%,rgba(88,101,242,0.15),transparent_36%),linear-gradient(180deg,#18181b,#111113)] border border-[#25262b] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_18px_45px_rgba(0,0,0,0.22)]">
          <h2 className="text-[14px] font-semibold text-white m-0">Экспортная готовность</h2>
          <p className="text-[12px] text-white/45 mt-1 leading-relaxed">Текущий workspace готов к тихому pre-flight: меньше цвета, больше уверенности и контроля.</p>
          <div className="mt-4 space-y-3">
            {['RLS enabled', 'No raw OCR logs', 'Excel bundle manifest', 'Family color mapping'].map((item) => (
              <div key={item} className="flex items-center gap-2 text-[12px] text-white/62">
                <span className="w-1.5 h-1.5 rounded-full bg-[#a8b2ff] shadow-[0_0_14px_rgba(168,178,255,0.45)]" />
                {item}
              </div>
            ))}
          </div>
        </section>
      </aside>
    </motion.div>
  );
}
