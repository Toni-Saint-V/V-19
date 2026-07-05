import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronDown,
  Info,
  Mail,
  Phone,
  User,
  Users,
} from "lucide-react";
import { V19ReadinessCard, V19SearchField } from "../../../shared/ui/v19-design-system";
import type { Submission } from "../types";
import {
  QuestionnaireProgressBadge,
  QuestionnaireWorkspaceShell,
} from "./QuestionnaireWorkspacePrimitives";

type FieldState = "normal" | "needs_review" | "invalid";
type ApplicantTab = { hasIssue?: boolean; id: string; index: number; name: string };
type SectionTab = {
  id: string;
  meta: string;
  status: "complete" | "issue" | "pending";
  title: string;
};
type SectionId =
  | "appointment"
  | "personal"
  | "passport"
  | "contact"
  | "employment"
  | "trip"
  | "hotel"
  | "payment";

type FormFieldProps = {
  excelMap?: string;
  focused?: boolean;
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
  initialFocus?: QuestionnaireInitialFocus;
  onBack: () => void;
  onComplete: (values: {
    focusedUpdate?: {
      applicantId: string;
      fieldId: string;
      sectionId: string;
      value: string;
    };
    travelEnd: string;
    travelStart: string;
  }) => void;
  submission: Submission;
};

type QuestionnaireInitialFocus = {
  applicantId?: string;
  field?: string;
  section?: string;
};

type QuestionnaireFormData = {
  appointmentCity: string;
  appointmentNote: string;
  birthCountry: string;
  birthPlace: string;
  category: string;
  citizenship: string;
  contactAddress: string;
  contactEmail: string;
  contactPhone: string;
  currentJob: string;
  desiredDate1: string;
  desiredDate2: string;
  desiredDate3: string;
  dob: string;
  employerAddress: string;
  employerContact: string;
  employerName: string;
  entryCount: string;
  firstEntryCountry: string;
  firstName: string;
  hotelAddress: string;
  hotelCity: string;
  hotelContact: string;
  hotelCountry: string;
  hotelEmail: string;
  hotelName: string;
  hotelPostalCode: string;
  homeCountry: string;
  invitingPartyType: string;
  maritalStatus: string;
  occupation: string;
  passportExpiry: string;
  passportIssued: string;
  passportIssueCountry: string;
  passportIssuePlace: string;
  passportNumber: string;
  passportType: string;
  paymentSponsor: string;
  paymentType: string;
  sex: string;
  stayDuration: string;
  stayPurpose: string;
  stayRoute: string;
  surname: string;
  travelEnd: string;
  travelStart: string;
  visaType: string;
};

type FocusableQuestionnaireField = {
  fieldId: string;
  formKey: keyof QuestionnaireFormData;
  labels: string[];
  sectionId: SectionId;
};

function FormField({
  excelMap,
  focused,
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

  const baseClasses = "v19-questionnaire-field-control";
  const stateClasses =
    state === "needs_review"
      ? "is-review"
      : state === "invalid"
        ? "is-invalid"
        : "is-normal";

  return (
    <div
      data-field-focused={focused ? "true" : undefined}
      data-field-label={label}
      className={`flex flex-col gap-1.5 ${
        fullWidth ? "col-span-1 md:col-span-2" : "col-span-1"
      }`}
    >
      <label className="flex items-start gap-2 text-[var(--v19b-size-12)] text-white/70 leading-snug">
        {number ? (
          <span className="v19-questionnaire-field-number">
            {number}
          </span>
        ) : null}
        <span className="flex-1 mt-[var(--v19b-size-3)]">
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
                className="v19-questionnaire-dropdown"
                exit={{ opacity: 0, scale: 0.98, y: -4 }}
                initial={{ opacity: 0, scale: 0.98, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                {options.map((option) => (
                  <button
                    className={`v19-questionnaire-dropdown-option ${
                      value === option ? "is-selected" : ""
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
          className={`${baseClasses} is-textarea ${stateClasses}`}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
        />
      ) : (
        <input
          aria-label={label}
          className={`${baseClasses} ${stateClasses}`}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
        />
      )}

      <div className="flex items-start gap-1.5 min-h-[var(--v19b-size-18)] text-[var(--v19b-size-10-5)] text-white/40 mt-1">
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
          <span className="v19-questionnaire-excel-map">
            <span className="font-medium text-white/60 tracking-wide text-[var(--v19b-size-10)]">
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
    hasIssue: submission.issues.some(
      (issue) =>
        issue.status !== "closed_by_admin" &&
        issue.target.applicantId === applicant.id,
    ),
    id: applicant.id ?? `app-${index + 1}`,
    index: index + 1,
    name: applicant.fullName || (index === 0 ? "Иван Петров" : `Заявитель ${index + 1}`),
  }));
}

function applicantRoleLabel(role: Submission["applicants"][number]["role"] | undefined) {
  if (role === "main") return "основной";
  if (role === "spouse") return "супруга";
  if (role === "child") return "ребенок";
  return "заявитель";
}

function applicantNameParts(name: string | undefined) {
  const [surname = "", ...givenParts] = (name ?? "").trim().split(/\s+/);

  return {
    firstName: givenParts.join(" ").toUpperCase(),
    surname: surname.toUpperCase(),
  };
}

function fallbackQuestionnaireFormData(
  applicantName: string | undefined,
): QuestionnaireFormData {
  const nameParts = applicantNameParts(applicantName);

  return {
    appointmentCity: "Москва",
    appointmentNote: "",
    birthCountry: "USSR",
    birthPlace: "MOSCOW",
    category: "Normal (Нормал)",
    citizenship: "RUSSIAN FEDERATION",
    contactAddress: "LENINSKY PROSPECT 10-24",
    contactEmail: "petrov@example.com",
    contactPhone: "+7 921 555-44-33",
    currentJob: "TECHNICAL DIRECTOR",
    desiredDate1: "22.07.2026",
    desiredDate2: "24.07.2026",
    desiredDate3: "26.07.2026",
    dob: "12.05.1985",
    employerAddress: "MOSCOW, TVERSKAYA 7",
    employerContact: "+7 495 000-00-00",
    employerName: "OOO VECTOR",
    entryCount: "Multiple Entry - Многократный",
    firstEntryCountry: "SPAIN",
    firstName: nameParts.firstName || "IVAN",
    hotelAddress: "BARCELONA, CARRER DE MALLORCA 401",
    hotelCity: "BARCELONA",
    hotelContact: "+34 900 111 222",
    hotelCountry: "Spain",
    hotelEmail: "hotel@example.com",
    hotelName: "HOTEL DIAGONAL",
    hotelPostalCode: "08005",
    homeCountry: "RUSSIAN FEDERATION",
    invitingPartyType: "Гостиница/временное жильё",
    maritalStatus: "Женат / Замужем (Married)",
    occupation: "OTHER",
    passportExpiry: "18.09.2032",
    passportIssued: "18.09.2022",
    passportIssueCountry: "Russian Federation",
    passportIssuePlace: "FMS 770-001",
    passportNumber: "751234567",
    passportType: "Обычный паспорт (Ordinary passport)",
    paymentSponsor: "Сам заявитель",
    paymentType: "Кредитная карта",
    sex: "Мужской (Male)",
    stayDuration: "9",
    stayPurpose: "Туризм",
    stayRoute: "MADRID - BARCELONA",
    surname: nameParts.surname || "PETROV",
    travelEnd: "31.07.2026",
    travelStart: "22.07.2026",
    visaType: "Шенгенская",
  };
}

function submissionFieldValue(
  applicant: Submission["applicants"][number] | undefined,
  fieldId: string,
  fallback: string,
) {
  const value = questionnaireField(applicant, fieldId)?.value.trim();

  return value || fallback;
}

function questionnaireField(
  applicant: Submission["applicants"][number] | undefined,
  fieldId: string,
) {
  return applicant?.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === fieldId);
}

function submissionFieldOptions(
  applicant: Submission["applicants"][number] | undefined,
  fieldId: string,
  fallback: string[],
) {
  const options = questionnaireField(applicant, fieldId)?.options;
  return options?.length ? options : fallback;
}

function questionnaireFormDataFromSubmission(
  submission: Submission,
  applicantId: string,
): QuestionnaireFormData {
  const applicant =
    submission.applicants.find((candidate) => candidate.id === applicantId) ??
    submission.applicants[0];
  const fallback = fallbackQuestionnaireFormData(applicant?.fullName);

  return {
    ...fallback,
    appointmentCity: submissionFieldValue(
      applicant,
      "appointment-city",
      fallback.appointmentCity,
    ),
    appointmentNote: submissionFieldValue(
      applicant,
      "appointment-note",
      fallback.appointmentNote,
    ),
    birthCountry: submissionFieldValue(applicant, "birth-country", fallback.birthCountry),
    birthPlace: submissionFieldValue(applicant, "birth-place", fallback.birthPlace),
    category: submissionFieldValue(applicant, "category", fallback.category),
    citizenship: submissionFieldValue(applicant, "nationality", fallback.citizenship),
    contactAddress: submissionFieldValue(
      applicant,
      "home-address",
      fallback.contactAddress,
    ),
    contactEmail: submissionFieldValue(applicant, "email", fallback.contactEmail),
    contactPhone: submissionFieldValue(
      applicant,
      "contact-number",
      fallback.contactPhone,
    ),
    desiredDate1: submissionFieldValue(
      applicant,
      "desired-date-1",
      fallback.desiredDate1,
    ),
    desiredDate2: submissionFieldValue(
      applicant,
      "desired-date-2",
      fallback.desiredDate2,
    ),
    desiredDate3: submissionFieldValue(
      applicant,
      "desired-date-3",
      fallback.desiredDate3,
    ),
    currentJob: submissionFieldValue(
      applicant,
      "occupation-specify",
      submissionFieldValue(applicant, "occupation", fallback.currentJob),
    ),
    dob: submissionFieldValue(applicant, "birth-date", fallback.dob),
    employerAddress: submissionFieldValue(
      applicant,
      "employer-address",
      fallback.employerAddress,
    ),
    employerContact: submissionFieldValue(
      applicant,
      "employer-contact",
      fallback.employerContact,
    ),
    employerName: submissionFieldValue(
      applicant,
      "employer-name",
      fallback.employerName,
    ),
    entryCount: submissionFieldValue(applicant, "entry-count", fallback.entryCount),
    firstEntryCountry: submissionFieldValue(
      applicant,
      "first-entry-country",
      fallback.firstEntryCountry,
    ),
    firstName: submissionFieldValue(applicant, "first-name", fallback.firstName),
    hotelAddress: submissionFieldValue(applicant, "hotel-address", fallback.hotelAddress),
    hotelCity: submissionFieldValue(applicant, "hotel-city", fallback.hotelCity),
    hotelContact: submissionFieldValue(applicant, "hotel-contact", fallback.hotelContact),
    hotelCountry: submissionFieldValue(applicant, "hotel-country", fallback.hotelCountry),
    hotelEmail: submissionFieldValue(applicant, "hotel-email", fallback.hotelEmail),
    hotelName: submissionFieldValue(applicant, "hotel-name", fallback.hotelName),
    hotelPostalCode: submissionFieldValue(
      applicant,
      "hotel-postal-code",
      fallback.hotelPostalCode,
    ),
    homeCountry: submissionFieldValue(applicant, "home-country", fallback.homeCountry),
    invitingPartyType: submissionFieldValue(
      applicant,
      "inviting-party-type",
      fallback.invitingPartyType,
    ),
    maritalStatus: submissionFieldValue(
      applicant,
      "marital-status",
      fallback.maritalStatus,
    ),
    occupation: submissionFieldValue(applicant, "occupation", fallback.occupation),
    passportExpiry: submissionFieldValue(
      applicant,
      "passport-expiry-date",
      fallback.passportExpiry,
    ),
    passportIssued: submissionFieldValue(
      applicant,
      "passport-issue-date",
      fallback.passportIssued,
    ),
    passportIssueCountry: submissionFieldValue(
      applicant,
      "passport-issue-country",
      fallback.passportIssueCountry,
    ),
    passportIssuePlace: submissionFieldValue(
      applicant,
      "passport-issue-place",
      fallback.passportIssuePlace,
    ),
    passportNumber: submissionFieldValue(applicant, "passport-no", fallback.passportNumber),
    passportType: submissionFieldValue(applicant, "passport-type", fallback.passportType),
    paymentSponsor: submissionFieldValue(
      applicant,
      "cost-covered-by",
      fallback.paymentSponsor,
    ),
    paymentType: submissionFieldValue(applicant, "means-of-support", fallback.paymentType),
    sex: submissionFieldValue(applicant, "gender", fallback.sex),
    stayDuration: submissionFieldValue(applicant, "stay-duration", fallback.stayDuration),
    stayPurpose: submissionFieldValue(applicant, "purpose", fallback.stayPurpose),
    stayRoute: submissionFieldValue(applicant, "route", fallback.stayRoute),
    surname: submissionFieldValue(applicant, "surname", fallback.surname),
    travelEnd: submissionFieldValue(applicant, "departure-date", fallback.travelEnd),
    travelStart: submissionFieldValue(applicant, "arrival-date", fallback.travelStart),
    visaType: submissionFieldValue(applicant, "visa-type", fallback.visaType),
  };
}

const focusableQuestionnaireFields: FocusableQuestionnaireField[] = [
  {
    fieldId: "passport-type",
    formKey: "passportType",
    labels: ["Тип паспорта", "Тип проездного документа"],
    sectionId: "passport",
  },
  {
    fieldId: "passport-no",
    formKey: "passportNumber",
    labels: ["Номер паспорта"],
    sectionId: "passport",
  },
  {
    fieldId: "passport-issue-date",
    formKey: "passportIssued",
    labels: ["Дата выдачи паспорта", "Дата выдачи"],
    sectionId: "passport",
  },
  {
    fieldId: "passport-expiry-date",
    formKey: "passportExpiry",
    labels: ["Дата окончания паспорта", "Действителен до"],
    sectionId: "passport",
  },
  {
    fieldId: "arrival-date",
    formKey: "travelStart",
    labels: ["Дата въезда"],
    sectionId: "trip",
  },
  {
    fieldId: "departure-date",
    formKey: "travelEnd",
    labels: ["Дата выезда"],
    sectionId: "trip",
  },
  {
    fieldId: "route",
    formKey: "stayRoute",
    labels: ["Маршрут поездки"],
    sectionId: "trip",
  },
];

function normalizeFocusLabel(value?: string) {
  return (value ?? "").trim().toLocaleLowerCase("ru-RU");
}

function sameFieldLabel(left?: string, right?: string) {
  return normalizeFocusLabel(left) === normalizeFocusLabel(right);
}

function focusableFieldFor(field?: string) {
  return focusableQuestionnaireFields.find((target) =>
    sameFieldLabel(target.fieldId, field) ||
    target.labels.some((label) => sameFieldLabel(label, field)),
  );
}

function sectionForFocus(
  focus: QuestionnaireInitialFocus | undefined,
  target: FocusableQuestionnaireField | undefined,
): SectionId {
  if (target) return target.sectionId;
  const section = normalizeFocusLabel(focus?.section);
  if (section.includes("запис")) return "appointment";
  if (section.includes("паспорт")) return "passport";
  if (section.includes("поезд") || section.includes("маршрут")) return "trip";
  if (section.includes("адрес") || section.includes("контакт")) return "contact";
  if (section.includes("работ")) return "employment";
  return "personal";
}

export function FigmaQuestionnaireScreen({
  initialFocus,
  onBack,
  onComplete,
  submission,
}: FigmaQuestionnaireScreenProps) {
  const applicants = useMemo(() => applicantTabs(submission), [submission]);
  const initialFieldTarget = focusableFieldFor(initialFocus?.field);
  const initialApplicantId = initialFocus?.applicantId ?? applicants[0]?.id ?? "app-1";
  const [activeApplicant, setActiveApplicant] = useState(
    initialApplicantId,
  );
  const [activeSection, setActiveSection] = useState<SectionId>(
    sectionForFocus(initialFocus, initialFieldTarget),
  );
  const sourceFormData = useMemo(
    () => questionnaireFormDataFromSubmission(submission, activeApplicant),
    [activeApplicant, submission],
  );
  const [formData, setFormData] = useState<QuestionnaireFormData>(() => sourceFormData);

  useEffect(() => {
    if (applicants.some((applicant) => applicant.id === activeApplicant)) return;
    setActiveApplicant(applicants[0]?.id ?? "app-1");
  }, [activeApplicant, applicants]);

  useEffect(() => {
    setFormData(sourceFormData);
  }, [sourceFormData]);

  const activeApplicantModel = useMemo(
    () =>
      submission.applicants.find((applicant) => applicant.id === activeApplicant) ??
      submission.applicants[0],
    [activeApplicant, submission.applicants],
  );

  const selectOptions = useMemo(
    () => ({
      appointmentCity: submissionFieldOptions(activeApplicantModel, "appointment-city", [
        "Москва",
        "Санкт-Петербург",
        "Казань",
      ]),
      birthCountry: submissionFieldOptions(activeApplicantModel, "birth-country", [
        "Russian Federation",
        "USSR",
        "Spain",
      ]),
      category: submissionFieldOptions(activeApplicantModel, "category", [
        "Normal (Нормал)",
        "Premium",
        "Family",
      ]),
      citizenship: submissionFieldOptions(activeApplicantModel, "nationality", [
        "Russian Federation",
        "Spain",
        "Other",
      ]),
      costCoveredBy: submissionFieldOptions(activeApplicantModel, "cost-covered-by", [
        "By the applicant - Самим заявителем",
        "By a Sponsor - Спонсором",
      ]),
      entryCount: submissionFieldOptions(activeApplicantModel, "entry-count", [
        "Single Entry - Однократный",
        "Two Entry - Двукратный",
        "Multiple Entry - Многократный",
      ]),
      gender: submissionFieldOptions(activeApplicantModel, "gender", [
        "Male - Мужской",
        "Female - Женский",
      ]),
      homeCountry: submissionFieldOptions(activeApplicantModel, "home-country", [
        "Russian Federation",
        "Spain",
        "Other",
      ]),
      hotelCountry: submissionFieldOptions(activeApplicantModel, "hotel-country", [
        "Spain",
        "France",
        "Italy",
        "Other",
      ]),
      invitingPartyType: submissionFieldOptions(
        activeApplicantModel,
        "inviting-party-type",
        ["Гостиница/временное жильё", "Частное лицо", "Компания"],
      ),
      maritalStatus: submissionFieldOptions(activeApplicantModel, "marital-status", [
        "Single - Холост/не замужем",
        "Married - Женат/замужем",
        "Divorced - Разведен(а)",
      ]),
      meansOfSupport: submissionFieldOptions(activeApplicantModel, "means-of-support", [
        "Cash - Наличные",
        "Credit card - Кредитная карта",
        "Prepaid accommodation - Оплаченное жильё",
        "Other - Другое",
      ]),
      occupation: submissionFieldOptions(activeApplicantModel, "occupation", [
        "MANAGER",
        "ENGINEER",
        "STUDENT",
        "TEACHER",
        "SELF EMPLOYED",
        "OTHER",
      ]),
      passportIssueCountry: submissionFieldOptions(
        activeApplicantModel,
        "passport-issue-country",
        ["Russian Federation", "Spain", "Other"],
      ),
      passportType: submissionFieldOptions(activeApplicantModel, "passport-type", [
        "Ordinary Passport",
        "Diplomatic Passport",
        "Service Passport",
        "Official Passport",
        "Travel Document",
      ]),
      purpose: submissionFieldOptions(activeApplicantModel, "purpose", [
        "TOURISM",
        "BUSINESS",
        "VISIT FAMILY OR FRIENDS",
        "OTHER",
      ]),
      visaType: submissionFieldOptions(activeApplicantModel, "visa-type", [
        "Шенгенская",
        "Национальная",
      ]),
    }),
    [activeApplicantModel],
  );

  const sections: Array<SectionTab & { id: SectionId }> = [
    { id: "appointment", meta: "7 полей", status: "pending", title: "Запись" },
    { id: "personal", meta: "11 полей", status: "issue", title: "Личные данные" },
    { id: "passport", meta: "6 полей", status: "complete", title: "Паспорт" },
    { id: "contact", meta: "10 полей", status: "complete", title: "Адрес и контакты" },
    { id: "employment", meta: "4 поля", status: "pending", title: "Работа / учеба" },
    { id: "trip", meta: "Shared", status: "complete", title: "Поездка" },
    { id: "hotel", meta: "Shared", status: "complete", title: "Отель / Приглашение" },
    { id: "payment", meta: "Shared", status: "complete", title: "Оплата поездки" },
  ];

  const sectionDescriptions: Record<SectionId, string> = {
    appointment: "Проверьте город подачи, тип визы, категорию и желаемые даты записи.",
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

  function fieldReviewState(label: string): FieldState {
    return initialFieldTarget?.labels.some((candidate) => sameFieldLabel(candidate, label))
      ? "needs_review"
      : "normal";
  }

  function fieldReviewSource(label: string) {
    return fieldReviewState(label) === "needs_review"
      ? "замечание администратора"
      : undefined;
  }

  function goToNextSection() {
    const currentIndex = sections.findIndex((section) => section.id === activeSection);
    const nextSection = sections[(currentIndex + 1) % sections.length];
    setActiveSection(nextSection.id);
  }

  const focusedApplicantId = initialFocus?.applicantId ?? activeApplicant;
  const focusedUpdatePayload =
    initialFieldTarget && focusedApplicantId !== undefined
      ? {
          applicantId: focusedApplicantId,
          fieldId: initialFieldTarget.fieldId,
          sectionId: initialFieldTarget.sectionId,
          value: formData[initialFieldTarget.formKey],
        }
      : undefined;

  function renderSectionFields() {
    if (activeSection === "appointment") {
      return (
        <>
          <FormField
            excelMap="Анкета: appointment-city"
            label="Город подачи"
            number="A1"
            options={selectOptions.appointmentCity}
            required
            value={formData.appointmentCity}
            onChange={(value) => updateField("appointmentCity", value)}
          />
          <FormField
            excelMap="Анкета: visa-type"
            label="Тип визы"
            number="A2"
            options={selectOptions.visaType}
            required
            value={formData.visaType}
            onChange={(value) => updateField("visaType", value)}
          />
          <FormField
            excelMap="Анкета: category"
            label="Категория"
            number="A3"
            options={selectOptions.category}
            required
            value={formData.category}
            onChange={(value) => updateField("category", value)}
          />
          <FormField
            label="Желаемая дата 1"
            number="A4"
            required
            value={formData.desiredDate1}
            onChange={(value) => updateField("desiredDate1", value)}
          />
          <FormField
            label="Желаемая дата 2"
            number="A5"
            value={formData.desiredDate2}
            onChange={(value) => updateField("desiredDate2", value)}
          />
          <FormField
            label="Желаемая дата 3"
            number="A6"
            value={formData.desiredDate3}
            onChange={(value) => updateField("desiredDate3", value)}
          />
          <FormField
            fullWidth
            label="Примечание"
            number="A7"
            type="textarea"
            value={formData.appointmentNote}
            onChange={(value) => updateField("appointmentNote", value)}
          />
        </>
      );
    }

    if (activeSection === "passport") {
      return (
        <>
          <FormField
            excelMap="Cell: C2"
            focused={fieldReviewState("Тип проездного документа") === "needs_review"}
            label="Тип проездного документа"
            number="12"
            options={selectOptions.passportType}
            required
            reviewSource={fieldReviewSource("Тип проездного документа")}
            state={fieldReviewState("Тип проездного документа")}
            value={formData.passportType}
            onChange={(value) => updateField("passportType", value)}
          />
          <FormField
            excelMap="Cell: C3"
            focused={fieldReviewState("Номер паспорта") === "needs_review"}
            label="Номер паспорта"
            number="13"
            required
            reviewSource={fieldReviewSource("Номер паспорта")}
            state={fieldReviewState("Номер паспорта")}
            value={formData.passportNumber}
            onChange={(value) => updateField("passportNumber", value)}
          />
          <FormField
            excelMap="Cell: C4"
            focused={fieldReviewState("Дата выдачи") === "needs_review"}
            label="Дата выдачи"
            number="14"
            required
            reviewSource={fieldReviewSource("Дата выдачи")}
            state={fieldReviewState("Дата выдачи")}
            value={formData.passportIssued}
            onChange={(value) => updateField("passportIssued", value)}
          />
          <FormField
            excelMap="Cell: C5"
            focused={fieldReviewState("Действителен до") === "needs_review"}
            label="Действителен до"
            number="15"
            required
            reviewSource={fieldReviewSource("Действителен до")}
            state={fieldReviewState("Действителен до")}
            value={formData.passportExpiry}
            onChange={(value) => updateField("passportExpiry", value)}
          />
          <FormField
            excelMap="Cell: C6"
            label="Кем выдан"
            number="16"
            value={formData.passportIssuePlace}
            onChange={(value) => updateField("passportIssuePlace", value)}
          />
          <FormField
            excelMap="Анкета: passport-issue-country"
            label="Страна выдачи паспорта"
            number="17"
            options={selectOptions.passportIssueCountry}
            value={formData.passportIssueCountry}
            onChange={(value) => updateField("passportIssueCountry", value)}
          />
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
          <FormField
            label="Страна проживания"
            number="20"
            options={selectOptions.homeCountry}
            value={formData.homeCountry}
            onChange={(value) => updateField("homeCountry", value)}
          />
        </>
      );
    }

    if (activeSection === "employment") {
      return (
        <>
          <FormField
            excelMap="Cell: E2"
            label="Профессия"
            number="21"
            options={selectOptions.occupation}
            required
            reviewSource="employment_doc"
            state="needs_review"
            value={formData.occupation}
            onChange={(value) => updateField("occupation", value)}
          />
          <FormField
            excelMap="Анкета: occupation-specify"
            label="Уточнение профессии"
            number="22"
            value={formData.currentJob}
            onChange={(value) => updateField("currentJob", value)}
          />
          <FormField
            excelMap="Cell: E3"
            label="Работодатель / учебное заведение"
            number="23"
            required
            value={formData.employerName}
            onChange={(value) => updateField("employerName", value)}
          />
          <FormField
            excelMap="Анкета: employer-contact"
            label="Телефон работодателя"
            number="24"
            value={formData.employerContact}
            onChange={(value) => updateField("employerContact", value)}
          />
          <FormField
            excelMap="Cell: E4"
            fullWidth
            label="Адрес работодателя"
            number="25"
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
            options={selectOptions.purpose}
            required
            value={formData.stayPurpose}
            onChange={(value) => updateField("stayPurpose", value)}
          />
          <FormField
            excelMap="Анкета: stay-duration"
            label="Длительность, дней"
            number="24.1"
            value={formData.stayDuration}
            onChange={(value) => updateField("stayDuration", value)}
          />
          <FormField
            excelMap="Анкета: entry-count"
            label="Количество въездов"
            number="24.2"
            options={selectOptions.entryCount}
            value={formData.entryCount}
            onChange={(value) => updateField("entryCount", value)}
          />
          <FormField
            excelMap="Cell: F3"
            focused={fieldReviewState("Дата въезда") === "needs_review"}
            label="Дата въезда"
            number="25"
            required
            reviewSource={fieldReviewSource("Дата въезда")}
            state={fieldReviewState("Дата въезда")}
            value={formData.travelStart}
            onChange={(value) => updateField("travelStart", value)}
          />
          <FormField
            excelMap="Cell: F4"
            focused={fieldReviewState("Дата выезда") === "needs_review"}
            label="Дата выезда"
            number="26"
            required
            reviewSource={fieldReviewSource("Дата выезда")}
            state={fieldReviewState("Дата выезда")}
            value={formData.travelEnd}
            onChange={(value) => updateField("travelEnd", value)}
          />
          <FormField
            excelMap="Cell: F5"
            label="Страна первого въезда"
            number="27"
            options={selectOptions.hotelCountry}
            value={formData.firstEntryCountry}
            onChange={(value) => updateField("firstEntryCountry", value)}
          />
          <FormField
            focused={fieldReviewState("Маршрут поездки") === "needs_review"}
            fullWidth
            label="Маршрут поездки"
            number="28"
            reviewSource={fieldReviewSource("Маршрут поездки")}
            state={fieldReviewState("Маршрут поездки")}
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
            excelMap="Анкета: inviting-party-type"
            fullWidth
            label="Тип принимающей стороны"
            number="28.1"
            options={selectOptions.invitingPartyType}
            value={formData.invitingPartyType}
            onChange={(value) => updateField("invitingPartyType", value)}
          />
          <FormField
            excelMap="Cell: G2"
            label="Название отеля / приглашающая сторона"
            number="29"
            required
            value={formData.hotelName}
            onChange={(value) => updateField("hotelName", value)}
          />
          <FormField
            excelMap="Анкета: hotel-country"
            label="Страна отеля"
            number="29.1"
            options={selectOptions.hotelCountry}
            value={formData.hotelCountry}
            onChange={(value) => updateField("hotelCountry", value)}
          />
          <FormField
            excelMap="Анкета: hotel-city"
            label="Город отеля"
            number="29.2"
            value={formData.hotelCity}
            onChange={(value) => updateField("hotelCity", value)}
          />
          <FormField
            excelMap="Анкета: hotel-postal-code"
            label="Почтовый индекс отеля"
            number="29.3"
            value={formData.hotelPostalCode}
            onChange={(value) => updateField("hotelPostalCode", value)}
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
          <FormField
            label="Email отеля / приглашающей стороны"
            number="30.1"
            value={formData.hotelEmail}
            onChange={(value) => updateField("hotelEmail", value)}
          />
          <FormField
            label="Телефон отеля / приглашающей стороны"
            number="31"
            value={formData.hotelContact}
            onChange={(value) => updateField("hotelContact", value)}
          />
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
            options={selectOptions.costCoveredBy}
            required
            value={formData.paymentSponsor}
            onChange={(value) => updateField("paymentSponsor", value)}
          />
          <FormField
            excelMap="Cell: H3"
            label="Средство оплаты"
            number="33"
            options={selectOptions.meansOfSupport}
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
          options={selectOptions.birthCountry}
          required
          value={formData.birthCountry}
          onChange={(value) => updateField("birthCountry", value)}
        />
        <FormField
          excelMap="Cell: B7"
          label="Текущее гражданство"
          number="7"
          options={selectOptions.citizenship}
          required
          value={formData.citizenship}
          onChange={(value) => updateField("citizenship", value)}
        />
        <FormField
          excelMap="Cell: B8"
          label="Пол"
          number="8"
          options={selectOptions.gender}
          required
          value={formData.sex}
          onChange={(value) => updateField("sex", value)}
        />
        <FormField
          excelMap="Cell: B9"
          fullWidth
          label="Семейное положение"
          number="9"
          options={selectOptions.maritalStatus}
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
      className="vf-figma-surface vf-figma-questionnaire-screen v19-questionnaire-screen-shell"
      exit={{ opacity: 0, x: -20 }}
      initial={{ opacity: 0, x: 20 }}
      transition={{ damping: 25, stiffness: 250, type: "spring" }}
    >
      <header className="v19-questionnaire-screen-header">
        <button
          aria-label="Назад"
          className="v19-questionnaire-back-button"
          type="button"
          onClick={onBack}
        >
          <ArrowLeft className="w-[var(--v19b-size-18)] h-[var(--v19b-size-18)]" />
        </button>

        <div className="v19-questionnaire-title-wrap">
          <div className="v19-questionnaire-submission-id">
            {submission.id}
          </div>
          <h1
            aria-label={`Анкета: ${submission.title || "Семья Петровых"}`}
            className="v19-questionnaire-title"
          >
            <span className="v19-questionnaire-title-mobile">Анкета</span>
            <span className="v19-questionnaire-title-desktop">
              Анкета: {submission.title || "Семья Петровых"}
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[var(--v19b-size-11)] text-white/40 hidden md:inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
            Сохранено только что
          </span>
          <button
            className="v19-questionnaire-complete-button"
            type="button"
            onClick={() =>
              onComplete({
                focusedUpdate: focusedUpdatePayload,
                travelEnd: formData.travelEnd,
                travelStart: formData.travelStart,
              })
            }
          >
            <span className="hidden sm:inline">Готово к проверке</span>
            <span className="sm:hidden">Готово</span>
          </button>
        </div>
      </header>

      <div className="v19-questionnaire-progress-track">
        <motion.div
          animate={{ width: "68%" }}
          className="v19-questionnaire-progress-fill"
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

      <div className="v19-questionnaire-scroll">
        <div className="max-w-[var(--v19b-size-1240)] mx-auto flex flex-col min-h-full gap-3 lg:gap-4 pb-[env(safe-area-inset-bottom)]">
          <div className="v19-questionnaire-applicant-bar">
            <div className="flex overflow-x-auto scrollbar-hide gap-1.5 lg:gap-2 flex-1 w-full snap-x pb-1 md:pb-0">
              {applicants.map((applicant) => (
                <button
                  aria-selected={activeApplicant === applicant.id}
                  className={`v19-questionnaire-applicant-tab ${
                    activeApplicant === applicant.id ? "is-active" : ""
                  }`}
                  key={applicant.id}
                  type="button"
                  onClick={() => setActiveApplicant(applicant.id)}
                >
                  <span className="v19-questionnaire-applicant-index">
                    {applicant.index}
                  </span>
                  {applicant.name}
                  {applicant.hasIssue ? (
                    <span className="v19-questionnaire-applicant-issue" />
                  ) : null}
                </button>
              ))}
            </div>

            <div className="hidden md:flex shrink-0 items-center gap-2 text-[var(--v19b-size-12)] text-white/50 px-3 border-l border-white/5">
              <Users className="w-4 h-4" />
              <span>
                {submission.type === "family"
                  ? `Семья, ${Math.max(submission.applicants.length, 1)} чел.`
                  : "Один заявитель"}
              </span>
            </div>
          </div>

          <QuestionnaireWorkspaceShell className="v19-questionnaire-workspace-shell flex-1 flex flex-col lg:flex-row gap-3 lg:gap-4 min-h-0">
            <aside className="v19-questionnaire-section-nav">
              <V19ReadinessCard
                description="Пакет можно отправлять после сверки полей, отмеченных администратором."
                detail="2 риска"
                scoreLabel="68%"
                value={68}
              />

              <V19SearchField label="Поиск поля анкеты" placeholder="Найти поле..." />

              <div className="v19-questionnaire-section-list">
                {sections.map((section) => (
                  <button
                    aria-selected={activeSection === section.id}
                    className={`v19-questionnaire-section-tab ${
                      activeSection === section.id ? "is-active" : ""
                    }`}
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[var(--v19b-size-12)] font-semibold truncate">
                        {section.title}
                      </div>
                      <div className="text-[var(--v19b-size-10)] text-white/40 mt-0.5 truncate tracking-wide">
                        {section.meta}
                      </div>
                    </div>

                    <QuestionnaireProgressBadge
                      className={`v19-questionnaire-progress-badge status-${section.status}`}
                    >
                      {section.status === "complete" ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : section.status === "issue" ? (
                        <AlertCircle className="w-3.5 h-3.5" />
                      ) : (
                        "-"
                      )}
                    </QuestionnaireProgressBadge>
                  </button>
                ))}
              </div>
            </aside>

            <div className="v19-questionnaire-work-panel">
              <div className="v19-questionnaire-work-head">
                <h3 className="text-[var(--v19b-size-15)] lg:text-[var(--v19b-size-16)] font-semibold text-white leading-snug">
                  {sections.find((section) => section.id === activeSection)?.title}
                </h3>
                <p className="text-[var(--v19b-size-11-5)] text-white/50 mt-1.5 leading-relaxed max-w-xl">
                  {sectionDescriptions[activeSection]}
                </p>
              </div>

              {activeSection === "personal" && activeApplicant === applicants[0]?.id ? (
                <div className="v19-questionnaire-review-alert">
                  <div className="v19-questionnaire-review-strip" />
                  <div className="v19-questionnaire-review-icon">
                    <AlertCircle className="w-[var(--v19b-size-18)] h-[var(--v19b-size-18)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[var(--v19b-size-13-5)] font-semibold text-white">
                      Несоответствие даты рождения
                    </div>
                    <p className="text-[var(--v19b-size-12)] text-white/60 mt-1.5 leading-relaxed">
                      В загруженном приложении PDF дата рождения{" "}
                      <strong className="text-white/90 font-medium">15.05.1985</strong>,
                      а в анкете указано{" "}
                      <strong className="text-white/90 font-medium">12.05.1985</strong>.
                      Подтвердите правильное значение.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="v19-questionnaire-work-grid">
                <div className="v19-questionnaire-fields-grid">
                  {renderSectionFields()}
                </div>

                <aside className="v19-questionnaire-context-rail">
                  <section>
                    <h3>Контекст заявителя</h3>
                    <div className="v19-questionnaire-context-lines">
                      <span>
                        <User className="w-4 h-4" />
                        {activeApplicantModel?.fullName ?? "Заявитель"},{" "}
                        {applicantRoleLabel(activeApplicantModel?.role)}
                      </span>
                      <span>
                        <Building2 className="w-4 h-4" />
                        {formData.currentJob || formData.employerName || "Работа не указана"}
                      </span>
                      <span>
                        <Mail className="w-4 h-4" />
                        {formData.contactEmail || "Email не указан"}
                      </span>
                      <span>
                        <Phone className="w-4 h-4" />
                        {formData.contactPhone || "Телефон не указан"}
                      </span>
                    </div>
                  </section>

                  <section className="v19-questionnaire-next-action-card">
                    <h3>Следующее лучшее действие</h3>
                    <p>
                      Подтвердите текущий раздел и перейдите к следующему блоку анкеты.
                    </p>
                    <button type="button" onClick={goToNextSection}>
                      Следующий раздел
                    </button>
                  </section>
                </aside>
              </div>

              <div className="v19-questionnaire-panel-footer">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-[var(--v19b-size-11)] text-white/40 font-medium">
                    <Info className="w-4 h-4" />
                    <span>Автосохранение включено</span>
                  </div>
                  <div className="v19-questionnaire-completion-pill">
                    <span className="v19-questionnaire-completion-dot" />
                    Заполнено 8 из 12 (68%)
                  </div>
                </div>
                <button
                  className="v19-questionnaire-next-button"
                  type="button"
                  onClick={goToNextSection}
                >
                  Следующий раздел
                </button>
              </div>
            </div>
          </QuestionnaireWorkspaceShell>
        </div>
      </div>
    </motion.div>
  );
}
