import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Info,
  Users,
} from "lucide-react";
import type { Submission } from "../types";

type FieldState = "normal" | "needs_review" | "invalid";
type ApplicantTab = { hasIssue?: boolean; id: string; index: number; name: string };
type SectionTab = {
  id: string;
  meta: string;
  status: "complete" | "issue" | "pending";
  title: string;
};
type SectionId =
  | "personal"
  | "passport"
  | "contact"
  | "employment"
  | "trip"
  | "hotel"
  | "payment";

type FormFieldProps = {
  excelMap?: string;
  fullWidth?: boolean;
  label: string;
  number?: string;
  onChange?: (value: string) => void;
  options?: string[];
  required?: boolean;
  reviewSource?: string;
  state?: FieldState;
  type?: "input" | "textarea";
  value: string;
};

type FigmaQuestionnaireScreenProps = {
  onBack: () => void;
  submission: Submission;
};

function FormField({
  excelMap,
  fullWidth,
  label,
  number,
  onChange,
  options,
  required,
  reviewSource,
  state = "normal",
  type = "input",
  value,
}: FormFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const baseClasses =
    "w-full h-[46px] rounded-[10px] px-3.5 text-[13px] text-white outline-none transition-colors";
  const stateClasses =
    state === "needs_review"
      ? "bg-orange-500/5 border border-orange-500/50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
      : state === "invalid"
        ? "bg-red-500/5 border border-red-500/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/30"
        : "bg-[#1e1e21] border border-[#242529] focus:border-[#3a45b4] focus:ring-1 focus:ring-[#3a45b4]/30 hover:border-[#2e2f34]";

  return (
    <div
      className={`flex flex-col gap-1.5 ${
        fullWidth ? "col-span-1 md:col-span-2" : "col-span-1"
      }`}
    >
      <label className="flex items-start gap-2 text-[12px] text-white/70 leading-snug">
        {number ? (
          <span className="shrink-0 flex items-center justify-center min-w-[25px] h-5 rounded-md bg-[#1e1e21] border border-[#242529] text-[9.5px] font-mono text-white/50">
            {number}
          </span>
        ) : null}
        <span className="flex-1 mt-[3px]">
          {label}
          {required ? <span className="text-red-400 ml-1">*</span> : null}
        </span>
      </label>

      {options ? (
        <div className="relative" ref={dropdownRef}>
          <button
            className={`flex items-center justify-between text-left ${baseClasses} ${stateClasses}`}
            type="button"
            onClick={() => setIsOpen(!isOpen)}
          >
            <span className="truncate">
              {value || <span className="text-white/30">Выберите...</span>}
            </span>
            <ChevronDown className="w-4 h-4 text-white/40 shrink-0 ml-2" />
          </button>

          <AnimatePresence>
            {isOpen ? (
              <motion.div
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="absolute z-50 top-[calc(100%+6px)] left-0 w-full bg-[#1a1a1d] border border-[#242529] rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.4)] overflow-hidden py-1.5 max-h-[220px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10"
                exit={{ opacity: 0, scale: 0.98, y: -4 }}
                initial={{ opacity: 0, scale: 0.98, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                {options.map((option) => (
                  <button
                    className={`w-full text-left px-3.5 py-2.5 text-[13px] transition-colors ${
                      value === option
                        ? "bg-[#3a45b4]/10 text-[#4855d4] font-medium"
                        : "text-white/80 hover:text-white hover:bg-white/[0.04]"
                    }`}
                    key={option}
                    type="button"
                    onClick={() => {
                      onChange?.(option);
                      setIsOpen(false);
                    }}
                  >
                    {option}
                  </button>
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : type === "textarea" ? (
        <textarea
          className={`${baseClasses.replace("h-[46px]", "h-24 py-3 resize-none")} ${stateClasses}`}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
        />
      ) : (
        <input
          className={`${baseClasses} ${stateClasses}`}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
        />
      )}

      <div className="flex items-start gap-1.5 min-h-[18px] text-[10.5px] text-white/40 mt-1">
        {state === "needs_review" ? (
          <span className="text-orange-400 flex items-center gap-1.5 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            Требует проверки ({reviewSource})
          </span>
        ) : null}
        {state === "invalid" ? (
          <span className="text-red-400 flex items-center gap-1.5 font-medium">
            <AlertCircle className="w-3.5 h-3.5" />
            Несоответствие с PDF
          </span>
        ) : null}
        {excelMap ? (
          <span className="ml-auto inline-flex items-center px-2 h-[22px] rounded-full border border-[#242529] bg-[#161617] whitespace-nowrap overflow-hidden text-ellipsis max-w-[50%]">
            <span className="font-medium text-white/60 tracking-wide text-[10px]">
              {excelMap}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function applicantTabs(submission: Submission): ApplicantTab[] {
  if (!submission.applicants.length) {
    return [{ id: "app-1", index: 1, name: "Иван Петров" }];
  }

  return submission.applicants.map((applicant, index) => ({
    hasIssue: index === 0 && submission.issues.some((issue) => issue.status !== "closed_by_admin"),
    id: applicant.id ?? `app-${index + 1}`,
    index: index + 1,
    name: applicant.fullName || (index === 0 ? "Иван Петров" : `Заявитель ${index + 1}`),
  }));
}

export function FigmaQuestionnaireScreen({
  onBack,
  submission,
}: FigmaQuestionnaireScreenProps) {
  const applicants = applicantTabs(submission);
  const [activeApplicant, setActiveApplicant] = useState(applicants[0]?.id ?? "app-1");
  const [activeSection, setActiveSection] = useState<SectionId>("personal");
  const [formData, setFormData] = useState({
    birthCountry: "USSR",
    birthPlace: "MOSCOW",
    citizenship: "RUSSIAN FEDERATION",
    contactAddress: "LENINSKY PROSPECT 10-24",
    contactEmail: "petrov@example.com",
    contactPhone: "+7 921 555-44-33",
    currentJob: "TECHNICAL DIRECTOR",
    dob: "12.05.1985",
    employerAddress: "MOSCOW, TVERSKAYA 7",
    employerName: "OOO VECTOR",
    firstEntryCountry: "SPAIN",
    firstName: applicants[0]?.name.split(" ")[1]?.toUpperCase() || "IVAN",
    hotelAddress: "BARCELONA, CARRER DE MALLORCA 401",
    hotelName: "HOTEL DIAGONAL",
    maritalStatus: "Женат / Замужем (Married)",
    passportExpiry: "18.09.2032",
    passportIssued: "18.09.2022",
    passportNumber: "751234567",
    passportType: "Обычный паспорт (Ordinary passport)",
    paymentSponsor: "Сам заявитель",
    paymentType: "Кредитная карта",
    sex: "Мужской (Male)",
    stayPurpose: "Туризм",
    stayRoute: "MADRID - BARCELONA",
    surname: applicants[0]?.name.split(" ")[0]?.toUpperCase() || "PETROV",
    travelEnd: "31.07.2026",
    travelStart: "22.07.2026",
  });

  const sections: Array<SectionTab & { id: SectionId }> = [
    { id: "personal", meta: "11 полей", status: "issue", title: "Личные данные" },
    { id: "passport", meta: "6 полей", status: "complete", title: "Паспорт" },
    { id: "contact", meta: "10 полей", status: "complete", title: "Адрес и контакты" },
    { id: "employment", meta: "4 поля", status: "pending", title: "Работа / учеба" },
    { id: "trip", meta: "Shared", status: "complete", title: "Поездка" },
    { id: "hotel", meta: "Shared", status: "complete", title: "Отель / Приглашение" },
    { id: "payment", meta: "Shared", status: "complete", title: "Оплата поездки" },
  ];

  const sectionDescriptions: Record<SectionId, string> = {
    contact: "Проверьте адрес проживания, телефон и email для связи по заявке.",
    employment: "Укажите текущую занятость и данные работодателя или учебного заведения.",
    hotel: "Сверьте размещение, приглашение и адрес принимающей стороны.",
    passport: "Сверьте номер паспорта, тип документа, даты выдачи и срок действия.",
    payment: "Проверьте, кто оплачивает поездку и какие подтверждения приложены.",
    personal:
      "Убедитесь, что все данные в точности совпадают с паспортом. Особое внимание обратите на транслитерацию.",
    trip: "Проверьте маршрут, даты, цель поездки и страну первого въезда.",
  };

  function updateField(key: keyof typeof formData, value: string) {
    setFormData((current) => ({ ...current, [key]: value }));
  }

  function goToNextSection() {
    const currentIndex = sections.findIndex((section) => section.id === activeSection);
    const nextSection = sections[(currentIndex + 1) % sections.length];
    setActiveSection(nextSection.id);
  }

  const cities = [
    "MOSCOW",
    "ST. PETERSBURG",
    "NOVOSIBIRSK",
    "YEKATERINBURG",
    "KAZAN",
    "NIZHNY NOVGOROD",
    "CHELYABINSK",
    "SAMARA",
    "OTHER",
  ];
  const countries = [
    "USSR",
    "RUSSIAN FEDERATION",
    "UKRAINE",
    "BELARUS",
    "KAZAKHSTAN",
    "OTHER",
  ];
  const sexes = ["Мужской (Male)", "Женский (Female)"];
  const maritalStatuses = [
    "Холост / Не замужем (Single)",
    "Женат / Замужем (Married)",
    "В разводе (Divorced)",
    "Вдовец / Вдова (Widowed)",
  ];

  function renderSectionFields() {
    if (activeSection === "passport") {
      return (
        <>
          <FormField
            excelMap="Cell: C2"
            label="Тип проездного документа"
            number="12"
            options={["Обычный паспорт (Ordinary passport)", "Служебный паспорт", "Дипломатический паспорт"]}
            required
            value={formData.passportType}
            onChange={(value) => updateField("passportType", value)}
          />
          <FormField
            excelMap="Cell: C3"
            label="Номер паспорта"
            number="13"
            required
            value={formData.passportNumber}
            onChange={(value) => updateField("passportNumber", value)}
          />
          <FormField
            excelMap="Cell: C4"
            label="Дата выдачи"
            number="14"
            required
            value={formData.passportIssued}
            onChange={(value) => updateField("passportIssued", value)}
          />
          <FormField
            excelMap="Cell: C5"
            label="Действителен до"
            number="15"
            required
            value={formData.passportExpiry}
            onChange={(value) => updateField("passportExpiry", value)}
          />
          <FormField excelMap="Cell: C6" fullWidth label="Кем выдан" number="16" value="FMS 770-001" />
        </>
      );
    }

    if (activeSection === "contact") {
      return (
        <>
          <FormField
            excelMap="Cell: D2"
            fullWidth
            label="Домашний адрес"
            number="17"
            required
            value={formData.contactAddress}
            onChange={(value) => updateField("contactAddress", value)}
          />
          <FormField
            excelMap="Cell: D3"
            label="Телефон"
            number="18"
            required
            value={formData.contactPhone}
            onChange={(value) => updateField("contactPhone", value)}
          />
          <FormField
            excelMap="Cell: D4"
            label="Email"
            number="19"
            required
            value={formData.contactEmail}
            onChange={(value) => updateField("contactEmail", value)}
          />
          <FormField label="Страна проживания" number="20" value="RUSSIAN FEDERATION" />
        </>
      );
    }

    if (activeSection === "employment") {
      return (
        <>
          <FormField
            excelMap="Cell: E2"
            label="Профессия / должность"
            number="21"
            required
            reviewSource="employment_doc"
            state="needs_review"
            value={formData.currentJob}
            onChange={(value) => updateField("currentJob", value)}
          />
          <FormField
            excelMap="Cell: E3"
            label="Работодатель / учебное заведение"
            number="22"
            required
            value={formData.employerName}
            onChange={(value) => updateField("employerName", value)}
          />
          <FormField
            excelMap="Cell: E4"
            fullWidth
            label="Адрес работодателя"
            number="23"
            value={formData.employerAddress}
            onChange={(value) => updateField("employerAddress", value)}
          />
        </>
      );
    }

    if (activeSection === "trip") {
      return (
        <>
          <FormField
            excelMap="Cell: F2"
            label="Основная цель поездки"
            number="24"
            options={["Туризм", "Бизнес", "Посещение семьи", "Культура", "Другое"]}
            required
            value={formData.stayPurpose}
            onChange={(value) => updateField("stayPurpose", value)}
          />
          <FormField
            excelMap="Cell: F3"
            label="Дата въезда"
            number="25"
            required
            value={formData.travelStart}
            onChange={(value) => updateField("travelStart", value)}
          />
          <FormField
            excelMap="Cell: F4"
            label="Дата выезда"
            number="26"
            required
            value={formData.travelEnd}
            onChange={(value) => updateField("travelEnd", value)}
          />
          <FormField
            excelMap="Cell: F5"
            label="Страна первого въезда"
            number="27"
            options={["SPAIN", "FRANCE", "ITALY", "GERMANY", "OTHER"]}
            value={formData.firstEntryCountry}
            onChange={(value) => updateField("firstEntryCountry", value)}
          />
          <FormField
            fullWidth
            label="Маршрут поездки"
            number="28"
            value={formData.stayRoute}
            onChange={(value) => updateField("stayRoute", value)}
          />
        </>
      );
    }

    if (activeSection === "hotel") {
      return (
        <>
          <FormField
            excelMap="Cell: G2"
            label="Название отеля / приглашающая сторона"
            number="29"
            required
            value={formData.hotelName}
            onChange={(value) => updateField("hotelName", value)}
          />
          <FormField
            excelMap="Cell: G3"
            fullWidth
            label="Адрес размещения"
            number="30"
            required
            value={formData.hotelAddress}
            onChange={(value) => updateField("hotelAddress", value)}
          />
          <FormField label="Телефон отеля / приглашающей стороны" number="31" value="+34 900 111 222" />
        </>
      );
    }

    if (activeSection === "payment") {
      return (
        <>
          <FormField
            excelMap="Cell: H2"
            label="Кто оплачивает поездку"
            number="32"
            options={["Сам заявитель", "Спонсор", "Работодатель", "Приглашающая сторона"]}
            required
            value={formData.paymentSponsor}
            onChange={(value) => updateField("paymentSponsor", value)}
          />
          <FormField
            excelMap="Cell: H3"
            label="Средство оплаты"
            number="33"
            options={["Кредитная карта", "Наличные", "Предоплата", "Иное"]}
            required
            value={formData.paymentType}
            onChange={(value) => updateField("paymentType", value)}
          />
          <FormField
            fullWidth
            label="Подтверждающие документы"
            number="34"
            value="Bank statement, booking confirmation"
          />
        </>
      );
    }

    return (
      <>
        <FormField
          excelMap="Cell: B2"
          label="Фамилия"
          number="1"
          required
          value={formData.surname}
          onChange={(value) => updateField("surname", value)}
        />
        <FormField label="Фамилия при рождении / предыдущая" number="2" value="" />
        <FormField
          excelMap="Cell: B3"
          label="Имя"
          number="3"
          required
          value={formData.firstName}
          onChange={(value) => updateField("firstName", value)}
        />
        <FormField
          excelMap="Cell: B4"
          label="Дата рождения"
          number="4"
          required
          state={activeApplicant === applicants[0]?.id ? "invalid" : "normal"}
          value={formData.dob}
          onChange={(value) => updateField("dob", value)}
        />
        <FormField
          excelMap="Cell: B5"
          label="Место рождения"
          number="5"
          options={cities}
          required
          reviewSource="passport_ocr"
          state="needs_review"
          value={formData.birthPlace}
          onChange={(value) => updateField("birthPlace", value)}
        />
        <FormField
          excelMap="Cell: B6"
          label="Страна рождения"
          number="6"
          options={countries}
          required
          value={formData.birthCountry}
          onChange={(value) => updateField("birthCountry", value)}
        />
        <FormField
          excelMap="Cell: B7"
          label="Текущее гражданство"
          number="7"
          options={countries}
          required
          value={formData.citizenship}
          onChange={(value) => updateField("citizenship", value)}
        />
        <FormField
          excelMap="Cell: B8"
          label="Пол"
          number="8"
          options={sexes}
          required
          value={formData.sex}
          onChange={(value) => updateField("sex", value)}
        />
        <FormField
          excelMap="Cell: B9"
          fullWidth
          label="Семейное положение"
          number="9"
          options={maritalStatuses}
          required
          value={formData.maritalStatus}
          onChange={(value) => updateField("maritalStatus", value)}
        />
      </>
    );
  }

  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="vf-figma-surface fixed inset-0 z-[60] bg-[#101011] flex flex-col overflow-hidden"
      exit={{ opacity: 0, x: -20 }}
      initial={{ opacity: 0, x: 20 }}
      transition={{ damping: 25, stiffness: 250, type: "spring" }}
    >
      <header className="h-[60px] lg:h-16 shrink-0 border-b border-[#202124] flex items-center px-3 lg:px-6 gap-3 lg:gap-4 bg-[#141416]">
        <button
          aria-label="Назад"
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-[10px] hover:bg-white/5 text-white/70 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
          type="button"
          onClick={onBack}
        >
          <ArrowLeft className="w-[18px] h-[18px]" />
        </button>

        <div className="flex-1 min-w-0 flex items-center gap-2 lg:gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-[6px] bg-[#27272b] text-white/70 text-xs font-mono">
            {submission.id}
          </div>
          <h1 className="text-[15px] lg:text-[18px] font-semibold tracking-tight text-white m-0 truncate">
            Анкета: {submission.title || "Семья Петровых"}
          </h1>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] text-white/40 hidden md:inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
            Сохранено только что
          </span>
          <button className="h-[36px] lg:h-10 px-3 lg:px-4 bg-[#3a45b4] hover:bg-[#4855d4] text-white rounded-[10px] text-[13px] lg:text-sm font-medium transition-colors shadow-[0_0_20px_rgba(58,69,180,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <span className="hidden sm:inline">Готово к проверке</span>
            <span className="sm:hidden">Готово</span>
          </button>
        </div>
      </header>

      <div className="h-[3px] w-full bg-[#161617] shrink-0">
        <motion.div
          animate={{ width: "68%" }}
          className="h-full bg-[#3a45b4] relative overflow-hidden"
          initial={{ width: 0 }}
          transition={{ delay: 0.1, duration: 1.2, ease: "easeOut" }}
        >
          <motion.div
            animate={{ x: ["-100%", "200%"] }}
            className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
            transition={{ duration: 2.5, ease: "linear", repeat: Infinity }}
          />
        </motion.div>
      </div>

      <div className="flex-1 overflow-auto p-3 lg:p-6 bg-[#101011]">
        <div className="max-w-[1240px] mx-auto flex flex-col min-h-full gap-3 lg:gap-4 pb-[env(safe-area-inset-bottom)]">
          <div className="min-h-[56px] lg:min-h-[62px] p-2 lg:p-2.5 rounded-xl lg:rounded-2xl bg-[#161617] border border-[#242529] shadow-[0_8px_22px_rgba(0,0,0,0.16)] flex flex-col md:flex-row md:items-center gap-3 shrink-0">
            <div className="flex overflow-x-auto scrollbar-hide gap-1.5 lg:gap-2 flex-1 w-full snap-x pb-1 md:pb-0">
              {applicants.map((applicant) => (
                <button
                  aria-selected={activeApplicant === applicant.id}
                  className={`relative h-10 px-3 rounded-[10px] flex shrink-0 items-center gap-2 text-[12px] font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] snap-start ${
                    activeApplicant === applicant.id
                      ? "bg-[#27272b] text-white border border-[#2e2f34] shadow-sm"
                      : "bg-[#1e1e21] text-white/60 border border-[#242529] hover:bg-[#232326] hover:text-white/90"
                  }`}
                  key={applicant.id}
                  type="button"
                  onClick={() => setActiveApplicant(applicant.id)}
                >
                  <span className="w-5 h-5 rounded-[6px] bg-[#161617] border border-[#242529] flex items-center justify-center text-[10px] text-white/50 shadow-inner">
                    {applicant.index}
                  </span>
                  {applicant.name}
                  {applicant.hasIssue ? (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-[#161617]" />
                  ) : null}
                </button>
              ))}
            </div>

            <div className="hidden md:flex shrink-0 items-center gap-2 text-[12px] text-white/50 px-3 border-l border-white/5">
              <Users className="w-4 h-4" />
              <span>
                {submission.type === "family"
                  ? `Семья, ${Math.max(submission.applicants.length, 1)} чел.`
                  : "Один заявитель"}
              </span>
            </div>
          </div>

          <div className="flex-1 flex flex-col lg:flex-row gap-3 lg:gap-4 min-h-0">
            <aside className="shrink-0 flex lg:flex-col gap-1.5 lg:w-[188px] bg-[#161617] border border-[#242529] rounded-xl lg:rounded-2xl p-2 overflow-x-auto lg:overflow-y-auto scrollbar-hide snap-x">
              {sections.map((section) => (
                <button
                  className={`w-[160px] shrink-0 lg:w-full min-h-[50px] p-2.5 flex items-center gap-3 rounded-[10px] transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] snap-start ${
                    activeSection === section.id
                      ? "bg-[#27272b] border border-[#2e2f34] text-white shadow-sm"
                      : "border border-transparent text-white/60 hover:bg-[#202024] hover:text-white"
                  }`}
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold truncate">
                      {section.title}
                    </div>
                    <div className="text-[10px] text-white/40 mt-0.5 truncate tracking-wide">
                      {section.meta}
                    </div>
                  </div>

                  <div
                    className={`min-w-[24px] h-[22px] rounded-[6px] border flex items-center justify-center text-[10px] shrink-0 ${
                      section.status === "complete"
                        ? "border-emerald-500/25 text-emerald-400 bg-emerald-500/5"
                        : section.status === "issue"
                          ? "border-red-500/30 text-red-400 bg-red-500/10"
                          : "border-[#242529] text-white/30 bg-black/20"
                    }`}
                  >
                    {section.status === "complete" ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : section.status === "issue" ? (
                      <AlertCircle className="w-3.5 h-3.5" />
                    ) : (
                      "-"
                    )}
                  </div>
                </button>
              ))}
            </aside>

            <div className="flex-1 min-w-0 bg-[#161617] border border-[#242529] rounded-xl lg:rounded-2xl overflow-y-auto overflow-x-hidden flex flex-col relative shadow-[0_4px_24px_rgba(0,0,0,0.15)]">
              <div className="min-h-[66px] px-4 md:px-6 py-4 md:py-5 border-b border-[#242529] sticky top-0 bg-[#161617]/90 backdrop-blur-md z-10 flex flex-col justify-center">
                <h3 className="text-[15px] lg:text-[16px] font-semibold text-white leading-snug">
                  {sections.find((section) => section.id === activeSection)?.title}
                </h3>
                <p className="text-[11.5px] text-white/50 mt-1.5 leading-relaxed max-w-xl">
                  {sectionDescriptions[activeSection]}
                </p>
              </div>

              {activeSection === "personal" && activeApplicant === applicants[0]?.id ? (
                <div className="mx-4 md:mx-6 mt-4 p-4 bg-red-500/5 border border-red-500/20 rounded-xl flex items-start gap-3.5 relative overflow-hidden shadow-sm">
                  <div className="absolute left-0 top-0 w-1 h-full bg-red-500" />
                  <div className="w-8 h-8 shrink-0 rounded-[8px] bg-red-500/10 text-red-500 flex items-center justify-center">
                    <AlertCircle className="w-[18px] h-[18px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold text-white">
                      Несоответствие даты рождения
                    </div>
                    <p className="text-[12px] text-white/60 mt-1.5 leading-relaxed">
                      В загруженном приложении PDF дата рождения{" "}
                      <strong className="text-white/90 font-medium">15.05.1985</strong>,
                      а в анкете указано{" "}
                      <strong className="text-white/90 font-medium">12.05.1985</strong>.
                      Подтвердите правильное значение.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-6">
                {renderSectionFields()}
              </div>

              <div className="mt-auto p-4 md:p-5 border-t border-[#242529] bg-[#1a1a1d]/90 backdrop-blur-md sticky bottom-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-[11px] text-white/40 font-medium">
                    <Info className="w-4 h-4" />
                    <span>Автосохранение включено</span>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 text-[11px] font-medium px-2 py-1 rounded-md bg-white/5 text-white/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#3a45b4]" />
                    Заполнено 8 из 12 (68%)
                  </div>
                </div>
                <button
                  className="w-full sm:w-auto px-6 h-11 bg-white/10 hover:bg-white/15 text-white rounded-xl text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
                  type="button"
                  onClick={goToNextSection}
                >
                  Следующий раздел
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
