import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  FileText,
  Upload,
  Users,
} from "lucide-react";
import { V19ReadinessCard, V19SearchField } from "../../../shared/ui/v19-design-system";
import type { Submission } from "../types";
import {
  BLS_CITY_OPTIONS,
  POPULAR_RUSSIAN_CITY_OPTIONS,
  updateQuestionnaireField,
  validateQuestionnaireFieldValue,
  type QuestionnaireFieldUpdate,
} from "../questionnaire";
import {
  passportScanUploadAccept,
  passportScanUploadFormatLabel,
  selfieUploadAccept,
  selfieUploadFormatLabel,
} from "../mediaStorage";
import { canReplaceDocument } from "../status";
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
  | "files"
  | "appointment"
  | "personal"
  | "passport"
  | "euRelative"
  | "contact"
  | "employment"
  | "trip"
  | "hotel"
  | "payment"
  | "filler";

const sectionDefinitions: Array<SectionTab & { canonicalId: string; id: SectionId }> = [
  { canonicalId: "files", id: "files", meta: "0 файлов", status: "pending", title: "Файлы" },
  { canonicalId: "appointment", id: "appointment", meta: "0 из 0", status: "pending", title: "Запись" },
  { canonicalId: "personal", id: "personal", meta: "0 из 0", status: "pending", title: "Личные данные" },
  { canonicalId: "passport", id: "passport", meta: "0 из 0", status: "pending", title: "Паспорт" },
  { canonicalId: "euRelative", id: "euRelative", meta: "0 из 0", status: "pending", title: "Родственник ЕС" },
  { canonicalId: "contacts", id: "contact", meta: "0 из 0", status: "pending", title: "Адрес и контакты" },
  { canonicalId: "employment", id: "employment", meta: "0 из 0", status: "pending", title: "Работа / учеба" },
  { canonicalId: "trip", id: "trip", meta: "0 из 0", status: "pending", title: "Поездка" },
  { canonicalId: "hotel", id: "hotel", meta: "0 из 0", status: "pending", title: "Отель / приглашение" },
  { canonicalId: "payment", id: "payment", meta: "0 из 0", status: "pending", title: "Оплата поездки" },
  { canonicalId: "filler", id: "filler", meta: "0 из 0", status: "pending", title: "Кто заполнил" },
];

const familySharedFieldIds: Partial<Record<SectionId, string[]>> = {
  appointment: [
    "appointment-city",
    "visa-type",
    "category",
    "desired-date-1",
    "desired-date-2",
    "desired-date-3",
    "appointment-note",
  ],
  contact: [
    "home-address",
    "home-country",
    "home-city",
    "postal-code",
    "lives-outside-citizenship",
    "residence-permit-type",
    "residence-permit-number",
    "residence-permit-valid-until",
  ],
  hotel: [
    "inviting-party-type",
    "hotel-name",
    "hotel-address",
    "hotel-email",
    "hotel-contact",
    "company-org-details",
    "company-contact-person",
    "company-phone",
  ],
  payment: [
    "cost-covered-by",
    "means-of-support",
    "sponsor-in-host-fields",
    "other-sponsor",
    "sponsor-means",
  ],
  trip: [
    "purpose",
    "stay-purpose-details",
    "main-destination",
    "first-entry-country",
    "entry-count",
    "arrival-date",
    "departure-date",
    "stay-duration",
  ],
};

type FormFieldProps = {
  excelMap?: string;
  errorMessage?: string;
  focused?: boolean;
  fullWidth?: boolean;
  hint?: string;
  label: string;
  number?: string;
  onAcknowledgeReview?: () => void;
  onChange?: (value: string) => void;
  options?: string[];
  phonePrefix?: "+7" | "+34";
  placeholder?: string;
  readOnly?: boolean;
  required?: boolean;
  reviewSource?: string;
  suggestions?: readonly string[];
  state?: FieldState;
  type?: "email" | "input" | "number" | "tel" | "textarea";
  value: string;
};

type FigmaQuestionnaireScreenProps = {
  initialFocus?: QuestionnaireInitialFocus;
  onBack: () => void;
  onComplete: (values: QuestionnaireCommitPayload) => void;
  onFieldChange?: (update: QuestionnaireFieldUpdate) => void;
  onUploadFile?: (fileId: string, file: File) => void | Promise<void>;
  onSaveDraft?: (values: QuestionnaireCommitPayload) => void;
  submission: Submission;
};

type QuestionnaireCommitPayload = {
  fieldUpdates: QuestionnaireFieldUpdate[];
  focusedUpdate?: QuestionnaireFieldUpdate;
  travelEnd: string;
  travelStart: string;
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
  birthCitizenship: string;
  birthPlace: string;
  category: string;
  citizenship: string;
  companyContactPerson: string;
  companyOrgDetails: string;
  companyPhone: string;
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
  euRelationship: string;
  euRelativeDetails: string;
  firstEntryCountry: string;
  firstName: string;
  finalEntryPermit: string;
  finalEntryPermitIssuedBy: string;
  finalEntryPermitValidFrom: string;
  finalEntryPermitValidTo: string;
  formFillerContact: string;
  formFillerName: string;
  formFillerPhone: string;
  guardianInfo: string;
  hotelAddress: string;
  hotelCity: string;
  hotelContact: string;
  hotelCountry: string;
  hotelEmail: string;
  hotelName: string;
  hotelPostalCode: string;
  homeCountry: string;
  invitingPartyType: string;
  livesOutsideCitizenship: string;
  maritalStatus: string;
  mainDestination: string;
  nationalId: string;
  occupation: string;
  otherCitizenship: string;
  otherSponsor: string;
  passportExpiry: string;
  passportIssued: string;
  passportIssueCountry: string;
  passportIssuePlace: string;
  passportNumber: string;
  passportType: string;
  previousSurname: string;
  previousVisaNumber: string;
  previousBiometrics: string;
  previousBiometricsDate: string;
  residenceCity: string;
  residencePermitNumber: string;
  residencePermitType: string;
  residencePermitValidUntil: string;
  residencePostalCode: string;
  paymentSponsor: string;
  paymentType: string;
  sex: string;
  sponsorInHostFields: string;
  sponsorMeans: string;
  stayDuration: string;
  stayPurposeDetails: string;
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

type QuestionnaireFieldBinding = {
  fieldId: string;
  formKey: keyof QuestionnaireFormData;
  sectionId: string;
};

const BLS_COUNTRY_OPTIONS = [
  "Russian Federation",
  "USSR",
  "Belarus",
  "Kazakhstan",
  "Armenia",
  "Azerbaijan",
  "Georgia",
  "Kyrgyzstan",
  "Tajikistan",
  "Turkmenistan",
  "Uzbekistan",
  "Ukraine",
  "Moldova",
  "Spain",
  "France",
  "Germany",
  "Italy",
  "Portugal",
  "Netherlands",
  "Belgium",
  "Austria",
  "Switzerland",
  "Greece",
  "Czech Republic",
  "Poland",
  "Hungary",
  "Sweden",
  "Norway",
  "Finland",
  "Denmark",
  "United Kingdom",
  "United States",
  "Turkey",
  "China",
  "India",
  "Israel",
  "United Arab Emirates",
  "Other",
];

const BLS_OCCUPATION_OPTIONS = [
  "UNEMPLOYED",
  "ACCOUNTANT",
  "ACTOR",
  "ARCHITECT",
  "ARTISAN",
  "ARTIST",
  "BANKER",
  "BUSINESSMAN",
  "CHEF",
  "CIVIL SERVANT",
  "COMPANY DIRECTOR",
  "CONSULTANT",
  "DENTIST",
  "DESIGNER",
  "DOCTOR",
  "DRIVER",
  "ECONOMIST",
  "ENGINEER",
  "FARMER",
  "FINANCIER",
  "FISHERMAN",
  "HOUSEWIFE",
  "IT PROFESSIONAL",
  "JOURNALIST",
  "JUDGE",
  "LABOURER",
  "LAWYER",
  "MANAGER",
  "MILITARY",
  "MINOR",
  "NURSE",
  "PENSIONER",
  "PHARMACIST",
  "PHOTOGRAPHER",
  "PILOT",
  "POLICE OFFICER",
  "PROFESSOR",
  "RETIRED",
  "SAILOR",
  "SALESPERSON",
  "SCIENTIST",
  "SECRETARY",
  "SELF EMPLOYED",
  "STAGIAIRE (STUDENT/INTERN)",
  "STUDENT",
  "TEACHER",
  "TECHNICIAN (OTHER)",
  "TRADER",
  "TRANSLATOR",
  "WRITER",
  "OTHER",
];

const YES_NO_OPTIONS = ["Нет", "Да"];

const commonEmailDomains = ["gmail.com", "yandex.ru", "mail.ru", "icloud.com", "outlook.com"];

const optionSearchAliases: Record<string, string[]> = {
  "Санкт-Петербург": ["спб", "питер", "санкт петербург"],
  "Нижний Новгород": ["нижний", "нн"],
  "Ростов-на-Дону": ["ростов"],
  "Екатеринбург": ["екат", "екб"],
  "Новосибирск": ["новосиб"],
  "Russian Federation": ["россия", "рф"],
  Spain: ["испания"],
  "United Kingdom": ["великобритания", "англия"],
  "United States": ["сша", "америка"],
};

function isDateFieldLabel(label: string) {
  const normalized = label.toLocaleLowerCase("ru-RU");
  return normalized.includes("дата") || normalized.includes("действител");
}

function formatDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 1) return digits;
  if (digits.length <= 3) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2, 4)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

function formatPhoneInput(value: string, prefix: "+7" | "+34") {
  const prefixDigits = prefix.replace(/\D/g, "");
  let digits = value.replace(/\D/g, "");
  if (!digits) return "";

  if (prefix === "+7" && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (!digits.startsWith(prefixDigits)) digits = `${prefixDigits}${digits}`;

  const localDigits = digits.slice(prefixDigits.length).slice(0, prefix === "+7" ? 10 : 9);
  const groups = prefix === "+7"
    ? [localDigits.slice(0, 3), localDigits.slice(3, 6), localDigits.slice(6, 8), localDigits.slice(8, 10)]
    : [localDigits.slice(0, 3), localDigits.slice(3, 6), localDigits.slice(6, 9)];
  const separator = prefix === "+7" ? [" ", "-", "-"] : [" ", " "];

  return groups.reduce(
    (formatted, group, index) =>
      group ? `${formatted}${index === 0 ? " " : separator[index - 1]}${group}` : formatted,
    prefix,
  );
}

function emailSuggestions(value: string) {
  const [localPart = "", domainPart = ""] = value.trim().split("@", 2);
  if (!localPart) return [];

  return commonEmailDomains
    .filter((domain) => domain.startsWith(domainPart.toLocaleLowerCase("en-US")))
    .map((domain) => `${localPart}@${domain}`);
}

function optionMatchesSearch(option: string, query: string) {
  const normalizedOption = option.toLocaleLowerCase("ru-RU");
  if (normalizedOption.includes(query)) return true;
  return (optionSearchAliases[option] ?? []).some((alias) => alias.includes(query));
}

function inputAutocomplete(label: string, type: FormFieldProps["type"]) {
  if (type === "email" || label.toLocaleLowerCase("ru-RU").includes("email")) return "email";
  if (label === "Фамилия") return "family-name";
  if (label === "Имя") return "given-name";
  if (label.toLocaleLowerCase("ru-RU").includes("адрес")) return "street-address";
  if (label.toLocaleLowerCase("ru-RU").includes("город")) return "address-level2";
  if (label.toLocaleLowerCase("ru-RU").includes("индекс")) return "postal-code";
  return "off";
}

function FormField({
  errorMessage,
  focused,
  fullWidth,
  hint,
  label,
  number,
  onAcknowledgeReview,
  onChange,
  options,
  phonePrefix,
  placeholder,
  readOnly,
  required,
  reviewSource,
  state = "normal",
  suggestions,
  type = "input",
  value,
}: FormFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [optionQuery, setOptionQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const usesQuickOptions = Boolean(options && options.length <= 3);
  const usesOptionSearch = Boolean(options && options.length > 8);
  const filteredOptions = useMemo(() => {
    if (!options) return [];
    const query = optionQuery.trim().toLocaleLowerCase("ru-RU");
    return query
      ? options.filter((option) => optionMatchesSearch(option, query))
      : options;
  }, [optionQuery, options]);
  const dateField = isDateFieldLabel(label);
  const emailField = type === "email" || label.toLocaleLowerCase("ru-RU").includes("email");
  const fieldId = `questionnaire-${number ?? "field"}-${label}`.replace(/\s+/g, "-");
  const suggestionsId = `${fieldId}-suggestions`;
  const fieldEmailSuggestions = useMemo(
    () => (emailField ? emailSuggestions(value) : []),
    [emailField, value],
  );
  const inputSuggestions = useMemo(
    () => (emailField ? fieldEmailSuggestions : suggestions ?? []),
    [emailField, fieldEmailSuggestions, suggestions],
  );
  const visibleInputSuggestions = useMemo(() => {
    const query = value.trim().toLocaleLowerCase("ru-RU");
    return inputSuggestions
      .filter((option) => !query || optionMatchesSearch(option, query))
      .slice(0, 10);
  }, [inputSuggestions, value]);

  useEffect(() => {
    if (!isOpen || !usesOptionSearch) return;
    optionSearchRef.current?.focus();
  }, [isOpen, usesOptionSearch]);

  const validationMessage = validateFormFieldValue({ label, required, type, value });
  const isEmptyRequiredField = validationMessage === "Обязательное поле" && !value.trim();
  const effectiveState: FieldState =
    (validationMessage && !isEmptyRequiredField) || state === "invalid"
    ? "invalid"
    : state;
  const effectiveErrorMessage =
    errorMessage ?? validationMessage ?? reviewSource ?? "Нужно исправить значение";
  const shouldShowError =
    effectiveState === "invalid" && (!isEmptyRequiredField || Boolean(errorMessage));
  const baseClasses = "v19-questionnaire-field-control";
  const stateClasses =
    effectiveState === "needs_review"
      ? "is-review"
      : effectiveState === "invalid"
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
          {required ? <span className="v19-questionnaire-required-mark">*</span> : null}
        </span>
      </label>

      {options && usesQuickOptions ? (
        <div aria-label={label} className="v19-questionnaire-quick-options" role="group">
          {options.map((option) => (
            <button
              aria-pressed={value === option}
              className={`v19-questionnaire-field-control v19-questionnaire-quick-option ${
                value === option ? "is-selected" : stateClasses
              }`}
              key={option}
              type="button"
              onClick={() => onChange?.(option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : options ? (
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
                {usesOptionSearch ? (
                  <input
                    aria-label={`Поиск: ${label}`}
                    className="v19-questionnaire-field-control"
                    placeholder="Начните вводить"
                    ref={optionSearchRef}
                    value={optionQuery}
                    onChange={(event) => setOptionQuery(event.target.value)}
                  />
                ) : null}
                {filteredOptions.map((option) => (
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
                {!filteredOptions.length ? (
                  <p className="v19-questionnaire-dropdown-empty">Нет совпадений</p>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : type === "textarea" ? (
        <textarea
          aria-label={label}
          className={`${baseClasses} is-textarea ${stateClasses}`}
          placeholder={placeholder}
          readOnly={readOnly ?? !onChange}
          value={value}
          onFocus={onAcknowledgeReview}
          onChange={(event) => onChange?.(event.target.value)}
        />
      ) : (
        <div className={inputSuggestions.length ? "relative" : undefined}>
          <input
            aria-label={label}
            aria-autocomplete={inputSuggestions.length ? "list" : undefined}
            aria-expanded={inputSuggestions.length ? isSuggestionsOpen : undefined}
            autoComplete={inputAutocomplete(label, type)}
            className={`${baseClasses} ${stateClasses}`}
            inputMode={dateField ? "numeric" : phonePrefix ? "tel" : undefined}
            maxLength={phonePrefix ? (phonePrefix === "+7" ? 17 : 15) : undefined}
            placeholder={
              placeholder ??
              (dateField
                ? "ДД.ММ.ГГГГ"
                : phonePrefix
                  ? `${phonePrefix} ${phonePrefix === "+7" ? "900 000-00-00" : "600 000 000"}`
                  : emailField
                    ? "name@example.com"
                    : undefined)
            }
            readOnly={readOnly ?? !onChange}
            type={type === "email" || type === "number" || type === "tel" ? type : "text"}
            value={value}
            onChange={(event) => {
              const nextValue = phonePrefix
                ? formatPhoneInput(event.target.value, phonePrefix)
                : dateField
                  ? formatDateInput(event.target.value)
                  : event.target.value;
              onChange?.(nextValue);
              if (inputSuggestions.length) setIsSuggestionsOpen(true);
            }}
            onFocus={() => {
              onAcknowledgeReview?.();
              if (phonePrefix && !value) onChange?.(phonePrefix);
              if (inputSuggestions.length) setIsSuggestionsOpen(true);
            }}
          />
          {inputSuggestions.length && isSuggestionsOpen ? (
            <motion.div
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="v19-questionnaire-dropdown"
              exit={{ opacity: 0, scale: 0.98, y: -4 }}
              id={suggestionsId}
              initial={{ opacity: 0, scale: 0.98, y: -4 }}
              role="listbox"
              transition={{ duration: 0.15 }}
            >
              {visibleInputSuggestions.map((suggestion) => (
                <button
                  aria-selected={value === suggestion}
                  className={`v19-questionnaire-dropdown-option ${
                    value === suggestion ? "is-selected" : ""
                  }`}
                  key={suggestion}
                  role="option"
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange?.(suggestion);
                    setIsSuggestionsOpen(false);
                  }}
                >
                  {suggestion}
                </button>
              ))}
              {!visibleInputSuggestions.length ? (
                <p className="v19-questionnaire-dropdown-empty">Нет совпадений</p>
              ) : null}
            </motion.div>
          ) : null}
        </div>
      )}

      {shouldShowError ? (
      <div className="flex items-start gap-1.5 text-[var(--v19b-size-10-5)] text-white/40 mt-1">
        <span className="v19-questionnaire-field-error flex items-center gap-1.5 font-medium">
          <AlertCircle className="v19-questionnaire-field-error-icon w-3.5 h-3.5" />
          {effectiveErrorMessage}
        </span>
      </div>
      ) : null}

      {hint ? <p className="v19-questionnaire-field-hint">{hint}</p> : null}
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

function fallbackQuestionnaireFormData(): QuestionnaireFormData {
  return {
    appointmentCity: "",
    appointmentNote: "",
    birthCountry: "",
    birthCitizenship: "",
    birthPlace: "",
    category: "",
    citizenship: "",
    companyContactPerson: "",
    companyOrgDetails: "",
    companyPhone: "",
    contactAddress: "",
    contactEmail: "",
    contactPhone: "",
    currentJob: "",
    desiredDate1: "",
    desiredDate2: "",
    desiredDate3: "",
    dob: "",
    employerAddress: "",
    employerContact: "",
    employerName: "",
    entryCount: "",
    euRelationship: "",
    euRelativeDetails: "",
    firstEntryCountry: "",
    firstName: "",
    finalEntryPermit: "",
    finalEntryPermitIssuedBy: "",
    finalEntryPermitValidFrom: "",
    finalEntryPermitValidTo: "",
    formFillerContact: "",
    formFillerName: "",
    formFillerPhone: "",
    guardianInfo: "",
    hotelAddress: "",
    hotelCity: "",
    hotelContact: "",
    hotelCountry: "",
    hotelEmail: "",
    hotelName: "",
    hotelPostalCode: "",
    homeCountry: "",
    invitingPartyType: "",
    livesOutsideCitizenship: "",
    mainDestination: "",
    maritalStatus: "",
    nationalId: "",
    occupation: "",
    otherCitizenship: "",
    otherSponsor: "",
    passportExpiry: "",
    passportIssued: "",
    passportIssueCountry: "",
    passportIssuePlace: "",
    passportNumber: "",
    passportType: "",
    paymentSponsor: "",
    paymentType: "",
    previousSurname: "",
    previousVisaNumber: "",
    previousBiometrics: "",
    previousBiometricsDate: "",
    residenceCity: "",
    residencePermitNumber: "",
    residencePermitType: "",
    residencePermitValidUntil: "",
    residencePostalCode: "",
    sex: "",
    sponsorInHostFields: "",
    sponsorMeans: "",
    stayDuration: "",
    stayPurposeDetails: "",
    stayPurpose: "",
    stayRoute: "",
    surname: "",
    travelEnd: "",
    travelStart: "",
    visaType: "",
  };
}

function submissionFieldValue(
  applicant: Submission["applicants"][number] | undefined,
  fieldId: string,
  fallback: string,
) {
  const value = questionnaireField(applicant, fieldId)?.value;

  return value?.trim() ? value : fallback;
}

function submissionFieldValueAny(
  applicant: Submission["applicants"][number] | undefined,
  fieldIds: string[],
  fallback: string,
) {
  for (const fieldId of fieldIds) {
    const value = questionnaireField(applicant, fieldId)?.value;
    if (value?.trim()) return value;
  }

  return fallback;
}

function questionnaireField(
  applicant: Submission["applicants"][number] | undefined,
  fieldId: string,
) {
  return applicant?.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === fieldId);
}

type QuestionnaireModelField = NonNullable<
  ReturnType<typeof questionnaireField>
>;

const requiredQuestionnaireFileTypes = ["passport_scan", "selfie", "selfie_2"] as const;
type RequiredQuestionnaireFileType = (typeof requiredQuestionnaireFileTypes)[number];

function questionnaireUpdateKey(
  update: Pick<QuestionnaireFieldUpdate, "applicantId" | "fieldId" | "sectionId">,
) {
  return `${update.applicantId}:${update.sectionId}:${update.fieldId}`;
}

function applyQuestionnaireUpdates(
  submission: Submission,
  updates: QuestionnaireFieldUpdate[],
) {
  return updates.reduce(
    (nextSubmission, update) => updateQuestionnaireField(nextSubmission, update),
    submission,
  );
}

function parseQuestionnaireDate(value: string) {
  const trimmed = value.trim();
  const dotted = /^(\d{2})[.-](\d{2})[.-](\d{4})$/.exec(trimmed);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!dotted && !iso) return null;

  const year = Number(iso ? iso[1] : dotted?.[3]);
  const month = Number(iso ? iso[2] : dotted?.[2]);
  const day = Number(iso ? iso[3] : dotted?.[1]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function passportExpiryFromIssueDate(value: string) {
  const issuedAt = parseQuestionnaireDate(value);
  if (!issuedAt) return "";

  const expiryYear = issuedAt.getFullYear() + 10;
  const month = issuedAt.getMonth();
  const lastDayOfExpiryMonth = new Date(expiryYear, month + 1, 0).getDate();
  const day = Math.min(issuedAt.getDate(), lastDayOfExpiryMonth);

  return [day, month + 1, expiryYear]
    .map((part, index) => (index === 2 ? String(part) : String(part).padStart(2, "0")))
    .join(".");
}

function isQuestionnaireMinor(value: string) {
  const birthDate = parseQuestionnaireDate(value);
  if (!birthDate) return false;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const birthdayHasPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!birthdayHasPassed) age -= 1;

  return age < 18;
}

function validationMessageForQuestionnaireField(
  field: Pick<QuestionnaireModelField, "id" | "label" | "required">,
  value: string,
) {
  return validateQuestionnaireFieldValue(field, value);
}


function validateFormFieldValue({
  label,
  required,
  type,
  value,
}: Pick<FormFieldProps, "label" | "required" | "type" | "value">) {
  if (required && !value.trim()) return "Обязательное поле";
  if (!value.trim()) return undefined;

  const normalizedLabel = label.toLocaleLowerCase("ru-RU");

  if (type === "email" || normalizedLabel.includes("email")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
      ? undefined
      : "Проверьте формат email";
  }

  if (normalizedLabel.includes("телефон")) {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 18 ? undefined : "Проверьте номер телефона";
  }

  if (
    normalizedLabel.includes("дата") ||
    normalizedLabel.includes("действител")
  ) {
    return parseQuestionnaireDate(value.trim())
      ? undefined
      : "Дата должна быть в формате ДД.ММ.ГГГГ";
  }

  if (type === "number" && Number.isNaN(Number(value))) {
    return "Введите число";
  }

  return undefined;
}

function hasActionableFieldProblem(field: QuestionnaireModelField) {
  const validationMessage = validationMessageForQuestionnaireField(field, field.value);
  const requiredButEmpty = validationMessage === "Обязательное поле" && !field.value.trim();

  return Boolean(
    (field.error && !(field.error === "Обязательное поле" && !field.value.trim())) ||
      (validationMessage && !requiredButEmpty),
  );
}

function fieldIsReady(field: QuestionnaireModelField) {
  return (
    !field.required ||
    Boolean(
      field.value.trim() &&
        !field.error &&
        !validationMessageForQuestionnaireField(field, field.value),
    )
  );
}

function fileIsReadyForQuestionnaire(file: Submission["files"][number] | undefined) {
  if (!file) return false;
  if (file.status === "missing" || file.status === "needs_replacement") return false;
  if (file.uploadStatus && file.uploadStatus !== "uploaded") return false;
  if (
    file.reviewStatus === "replace_required" ||
    file.reviewStatus === "poor_quality"
  ) {
    return false;
  }
  return true;
}

function fileAcceptForQuestionnaire(fileType: RequiredQuestionnaireFileType) {
  return fileType === "passport_scan" ? passportScanUploadAccept : selfieUploadAccept;
}

function fileFormatHint(fileType: RequiredQuestionnaireFileType) {
  return fileType === "passport_scan" ? passportScanUploadFormatLabel : selfieUploadFormatLabel;
}

function questionnaireFileStatus(file: Submission["files"][number] | undefined) {
  if (!file) return "Слот файла не создан";
  if (file.status === "needs_replacement") return "Нужна замена";
  if (file.status === "missing") return "Нужно добавить";
  if (file.reviewStatus === "replace_required" || file.reviewStatus === "poor_quality") {
    return "Нужна замена";
  }
  if (file.status === "pending_review") return "На проверке";
  if (file.status === "accepted") return "Принято";
  return "Загружено";
}

function QuestionnaireFileSlot({
  description,
  file,
  fileType,
  label,
  onUploadFile,
  submission,
}: {
  description: string;
  file?: Submission["files"][number];
  fileType: RequiredQuestionnaireFileType;
  label: string;
  onUploadFile?: (fileId: string, file: File) => void | Promise<void>;
  submission: Submission;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const needsUpload = file?.status === "missing" || file?.status === "needs_replacement";
  const canUpload = Boolean(file && needsUpload && onUploadFile && canReplaceDocument(submission, file));
  const fileName = file?.originalFileName || file?.generatedFileName;
  const status = questionnaireFileStatus(file);
  const actionLabel = file?.status === "needs_replacement" ? "Заменить" : "Загрузить";

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!selectedFile || !file || !onUploadFile) return;

    setUploadError("");
    setIsUploading(true);
    try {
      await onUploadFile(file.id, selectedFile);
    } catch {
      setUploadError("Не удалось загрузить файл. Попробуйте ещё раз.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <article className="v19-questionnaire-file-slot" data-file-slot={fileType}>
      <span className="v19-questionnaire-file-icon" aria-hidden="true">
        <FileText />
      </span>
      <span className="v19-questionnaire-file-copy">
        <strong>{label}</strong>
        <span>{fileName || description}</span>
        <small>{fileFormatHint(fileType)}</small>
      </span>
      <span className={`v19-questionnaire-file-status ${fileIsReadyForQuestionnaire(file) ? "is-ready" : ""}`}>
        {status}
      </span>
      {canUpload ? (
        <label className="v19-questionnaire-file-upload">
          <Upload aria-hidden="true" />
          {isUploading ? "Загружаем…" : actionLabel}
          <input
            accept={fileAcceptForQuestionnaire(fileType)}
            aria-label={`${actionLabel} ${label}`}
            className="sr-only"
            disabled={isUploading}
            type="file"
            onChange={handleFileChange}
          />
        </label>
      ) : null}
      {uploadError ? <span className="v19-questionnaire-file-error" role="alert">{uploadError}</span> : null}
    </article>
  );
}

function riskLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) return `${count} риск`;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
    return `${count} риска`;
  }

  return `${count} рисков`;
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
  const fallback = fallbackQuestionnaireFormData();

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
    birthCitizenship: submissionFieldValueAny(
      applicant,
      ["birth-citizenship", "birth-nationality", "nationality-at-birth"],
      fallback.birthCitizenship,
    ),
    birthPlace: submissionFieldValue(applicant, "birth-place", fallback.birthPlace),
    category: submissionFieldValue(applicant, "category", fallback.category),
    citizenship: submissionFieldValue(applicant, "nationality", fallback.citizenship),
    companyContactPerson: submissionFieldValueAny(
      applicant,
      ["company-contact-person", "organization-contact-person"],
      fallback.companyContactPerson,
    ),
    companyOrgDetails: submissionFieldValueAny(
      applicant,
      ["company-org-details", "organization-details"],
      fallback.companyOrgDetails,
    ),
    companyPhone: submissionFieldValueAny(
      applicant,
      ["company-phone", "organization-phone"],
      fallback.companyPhone,
    ),
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
    euRelationship: submissionFieldValueAny(
      applicant,
      ["eu-relationship", "eu-relative-relationship"],
      fallback.euRelationship,
    ),
    euRelativeDetails: submissionFieldValueAny(
      applicant,
      ["eu-relative-details", "eu-citizen-relative-details"],
      fallback.euRelativeDetails,
    ),
    firstEntryCountry: submissionFieldValue(
      applicant,
      "first-entry-country",
      fallback.firstEntryCountry,
    ),
    firstName: submissionFieldValue(applicant, "first-name", fallback.firstName),
    finalEntryPermit: submissionFieldValueAny(
      applicant,
      ["final-entry-permit", "entry-permit-final-country"],
      fallback.finalEntryPermit,
    ),
    finalEntryPermitIssuedBy: submissionFieldValueAny(
      applicant,
      ["final-entry-permit-issued-by", "entry-permit-issued-by"],
      fallback.finalEntryPermitIssuedBy,
    ),
    finalEntryPermitValidFrom: submissionFieldValueAny(
      applicant,
      ["final-entry-permit-valid-from", "entry-permit-valid-from"],
      fallback.finalEntryPermitValidFrom,
    ),
    finalEntryPermitValidTo: submissionFieldValueAny(
      applicant,
      ["final-entry-permit-valid-to", "entry-permit-valid-to"],
      fallback.finalEntryPermitValidTo,
    ),
    formFillerContact: submissionFieldValueAny(
      applicant,
      ["form-filler-contact", "filler-contact"],
      fallback.formFillerContact,
    ),
    formFillerName: submissionFieldValueAny(
      applicant,
      ["form-filler-name", "filler-name"],
      fallback.formFillerName,
    ),
    formFillerPhone: submissionFieldValueAny(
      applicant,
      ["form-filler-phone", "filler-phone"],
      fallback.formFillerPhone,
    ),
    guardianInfo: submissionFieldValueAny(
      applicant,
      ["guardian-info", "minor-guardian"],
      fallback.guardianInfo,
    ),
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
    livesOutsideCitizenship: submissionFieldValueAny(
      applicant,
      ["lives-outside-citizenship", "residence-not-nationality"],
      fallback.livesOutsideCitizenship,
    ),
    mainDestination: submissionFieldValueAny(
      applicant,
      ["main-destination", "destination-country"],
      fallback.mainDestination,
    ),
    maritalStatus: submissionFieldValue(
      applicant,
      "marital-status",
      fallback.maritalStatus,
    ),
    nationalId: submissionFieldValueAny(applicant, ["national-id"], fallback.nationalId),
    occupation: submissionFieldValue(applicant, "occupation", fallback.occupation),
    otherCitizenship: submissionFieldValueAny(
      applicant,
      ["other-citizenship", "additional-nationality"],
      fallback.otherCitizenship,
    ),
    otherSponsor: submissionFieldValueAny(
      applicant,
      ["other-sponsor", "sponsor-name"],
      fallback.otherSponsor,
    ),
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
    previousSurname: submissionFieldValueAny(
      applicant,
      ["previous-surname", "surname-at-birth", "maiden-name"],
      fallback.previousSurname,
    ),
    previousVisaNumber: submissionFieldValueAny(
      applicant,
      ["previous-visa-number", "visa-number"],
      fallback.previousVisaNumber,
    ),
    previousBiometrics: submissionFieldValueAny(
      applicant,
      ["previous-biometrics", "fingerprints-collected"],
      fallback.previousBiometrics,
    ),
    previousBiometricsDate: submissionFieldValueAny(
      applicant,
      ["previous-biometrics-date", "fingerprints-date"],
      fallback.previousBiometricsDate,
    ),
    residenceCity: submissionFieldValueAny(
      applicant,
      ["residence-city", "home-city"],
      fallback.residenceCity,
    ),
    residencePermitNumber: submissionFieldValueAny(
      applicant,
      ["residence-permit-number", "residence-document-number"],
      fallback.residencePermitNumber,
    ),
    residencePermitType: submissionFieldValueAny(
      applicant,
      ["residence-permit-type", "residence-document-type"],
      fallback.residencePermitType,
    ),
    residencePermitValidUntil: submissionFieldValueAny(
      applicant,
      ["residence-permit-valid-until", "residence-document-valid-until"],
      fallback.residencePermitValidUntil,
    ),
    residencePostalCode: submissionFieldValueAny(
      applicant,
      ["residence-postal-code", "postal-code"],
      fallback.residencePostalCode,
    ),
    sex: submissionFieldValue(applicant, "gender", fallback.sex),
    sponsorInHostFields: submissionFieldValueAny(
      applicant,
      ["sponsor-in-host-fields", "sponsor-fields-30-31"],
      fallback.sponsorInHostFields,
    ),
    sponsorMeans: submissionFieldValueAny(
      applicant,
      ["sponsor-means", "means-of-sponsor-support"],
      fallback.sponsorMeans,
    ),
    stayDuration: submissionFieldValue(applicant, "stay-duration", fallback.stayDuration),
    stayPurposeDetails: submissionFieldValueAny(
      applicant,
      ["stay-purpose-details", "purpose-details"],
      fallback.stayPurposeDetails,
    ),
    stayPurpose: submissionFieldValue(applicant, "purpose", fallback.stayPurpose),
    stayRoute: submissionFieldValueAny(
      applicant,
      ["first-entry-country", "route"],
      fallback.stayRoute,
    ),
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
    labels: ["Тип паспорта", "Тип документа", "Тип проездного документа"],
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
    fieldId: "first-entry-country",
    formKey: "firstEntryCountry",
    labels: ["Маршрут поездки", "Страна первого въезда"],
    sectionId: "trip",
  },
];

const questionnaireFieldBindings: QuestionnaireFieldBinding[] = [
  { fieldId: "appointment-city", formKey: "appointmentCity", sectionId: "appointment" },
  { fieldId: "visa-type", formKey: "visaType", sectionId: "appointment" },
  { fieldId: "category", formKey: "category", sectionId: "appointment" },
  { fieldId: "desired-date-1", formKey: "desiredDate1", sectionId: "appointment" },
  { fieldId: "desired-date-2", formKey: "desiredDate2", sectionId: "appointment" },
  { fieldId: "desired-date-3", formKey: "desiredDate3", sectionId: "appointment" },
  { fieldId: "appointment-note", formKey: "appointmentNote", sectionId: "appointment" },
  { fieldId: "surname", formKey: "surname", sectionId: "personal" },
  { fieldId: "previous-surname", formKey: "previousSurname", sectionId: "personal" },
  { fieldId: "first-name", formKey: "firstName", sectionId: "personal" },
  { fieldId: "birth-date", formKey: "dob", sectionId: "personal" },
  { fieldId: "birth-place", formKey: "birthPlace", sectionId: "personal" },
  { fieldId: "birth-country", formKey: "birthCountry", sectionId: "personal" },
  { fieldId: "nationality", formKey: "citizenship", sectionId: "personal" },
  { fieldId: "birth-citizenship", formKey: "birthCitizenship", sectionId: "personal" },
  { fieldId: "other-citizenship", formKey: "otherCitizenship", sectionId: "personal" },
  { fieldId: "gender", formKey: "sex", sectionId: "personal" },
  { fieldId: "marital-status", formKey: "maritalStatus", sectionId: "personal" },
  { fieldId: "guardian-info", formKey: "guardianInfo", sectionId: "personal" },
  { fieldId: "national-id", formKey: "nationalId", sectionId: "personal" },
  { fieldId: "passport-type", formKey: "passportType", sectionId: "passport" },
  { fieldId: "passport-no", formKey: "passportNumber", sectionId: "passport" },
  { fieldId: "passport-issue-date", formKey: "passportIssued", sectionId: "passport" },
  { fieldId: "passport-expiry-date", formKey: "passportExpiry", sectionId: "passport" },
  { fieldId: "passport-issue-country", formKey: "passportIssueCountry", sectionId: "passport" },
  { fieldId: "passport-issue-place", formKey: "passportIssuePlace", sectionId: "passport" },
  { fieldId: "eu-relative-details", formKey: "euRelativeDetails", sectionId: "euRelative" },
  { fieldId: "eu-relationship", formKey: "euRelationship", sectionId: "euRelative" },
  { fieldId: "home-address", formKey: "contactAddress", sectionId: "contacts" },
  { fieldId: "email", formKey: "contactEmail", sectionId: "contacts" },
  { fieldId: "contact-number", formKey: "contactPhone", sectionId: "contacts" },
  { fieldId: "home-country", formKey: "homeCountry", sectionId: "contacts" },
  { fieldId: "home-city", formKey: "residenceCity", sectionId: "contacts" },
  { fieldId: "postal-code", formKey: "residencePostalCode", sectionId: "contacts" },
  { fieldId: "lives-outside-citizenship", formKey: "livesOutsideCitizenship", sectionId: "contacts" },
  { fieldId: "residence-permit-type", formKey: "residencePermitType", sectionId: "contacts" },
  { fieldId: "residence-permit-number", formKey: "residencePermitNumber", sectionId: "contacts" },
  { fieldId: "residence-permit-valid-until", formKey: "residencePermitValidUntil", sectionId: "contacts" },
  { fieldId: "occupation", formKey: "occupation", sectionId: "employment" },
  { fieldId: "occupation-specify", formKey: "currentJob", sectionId: "employment" },
  { fieldId: "employer-name", formKey: "employerName", sectionId: "employment" },
  { fieldId: "employer-contact", formKey: "employerContact", sectionId: "employment" },
  { fieldId: "employer-address", formKey: "employerAddress", sectionId: "employment" },
  { fieldId: "purpose", formKey: "stayPurpose", sectionId: "trip" },
  { fieldId: "stay-purpose-details", formKey: "stayPurposeDetails", sectionId: "trip" },
  { fieldId: "main-destination", formKey: "mainDestination", sectionId: "trip" },
  { fieldId: "first-entry-country", formKey: "firstEntryCountry", sectionId: "trip" },
  { fieldId: "entry-count", formKey: "entryCount", sectionId: "trip" },
  { fieldId: "arrival-date", formKey: "travelStart", sectionId: "trip" },
  { fieldId: "departure-date", formKey: "travelEnd", sectionId: "trip" },
  { fieldId: "stay-duration", formKey: "stayDuration", sectionId: "trip" },
  { fieldId: "previous-biometrics", formKey: "previousBiometrics", sectionId: "trip" },
  { fieldId: "previous-biometrics-date", formKey: "previousBiometricsDate", sectionId: "trip" },
  { fieldId: "previous-visa-number", formKey: "previousVisaNumber", sectionId: "trip" },
  { fieldId: "final-entry-permit", formKey: "finalEntryPermit", sectionId: "trip" },
  { fieldId: "final-entry-permit-issued-by", formKey: "finalEntryPermitIssuedBy", sectionId: "trip" },
  { fieldId: "final-entry-permit-valid-from", formKey: "finalEntryPermitValidFrom", sectionId: "trip" },
  { fieldId: "final-entry-permit-valid-to", formKey: "finalEntryPermitValidTo", sectionId: "trip" },
  { fieldId: "inviting-party-type", formKey: "invitingPartyType", sectionId: "hotel" },
  { fieldId: "hotel-name", formKey: "hotelName", sectionId: "hotel" },
  { fieldId: "hotel-address", formKey: "hotelAddress", sectionId: "hotel" },
  { fieldId: "hotel-email", formKey: "hotelEmail", sectionId: "hotel" },
  { fieldId: "hotel-contact", formKey: "hotelContact", sectionId: "hotel" },
  { fieldId: "company-org-details", formKey: "companyOrgDetails", sectionId: "hotel" },
  { fieldId: "company-contact-person", formKey: "companyContactPerson", sectionId: "hotel" },
  { fieldId: "company-phone", formKey: "companyPhone", sectionId: "hotel" },
  { fieldId: "cost-covered-by", formKey: "paymentSponsor", sectionId: "payment" },
  { fieldId: "means-of-support", formKey: "paymentType", sectionId: "payment" },
  { fieldId: "sponsor-in-host-fields", formKey: "sponsorInHostFields", sectionId: "payment" },
  { fieldId: "other-sponsor", formKey: "otherSponsor", sectionId: "payment" },
  { fieldId: "sponsor-means", formKey: "sponsorMeans", sectionId: "payment" },
  { fieldId: "form-filler-name", formKey: "formFillerName", sectionId: "filler" },
  { fieldId: "form-filler-contact", formKey: "formFillerContact", sectionId: "filler" },
  { fieldId: "form-filler-phone", formKey: "formFillerPhone", sectionId: "filler" },
];

function dependentFieldKeysFor(
  key: keyof QuestionnaireFormData,
  value: string,
): Array<keyof QuestionnaireFormData> {
  if (key === "livesOutsideCitizenship" && value !== "Да") {
    return ["residencePermitType", "residencePermitNumber", "residencePermitValidUntil"];
  }
  if (key === "stayPurpose" && value !== "OTHER") {
    return ["stayPurposeDetails"];
  }
  if (key === "previousBiometrics" && value !== "Да") {
    return ["previousBiometricsDate"];
  }
  if (key === "paymentSponsor" && value !== "Спонсор") {
    return ["sponsorInHostFields", "otherSponsor", "sponsorMeans"];
  }
  if (key === "invitingPartyType" && value !== "Приглашающая компания/организация") {
    return ["companyOrgDetails", "companyContactPerson", "companyPhone"];
  }
  if (key === "dob" && !isQuestionnaireMinor(value)) {
    return ["guardianInfo"];
  }
  return [];
}

function conditionalFieldClearsFor(
  applicant: Submission["applicants"][number] | undefined,
  applicantId: string,
  formData: QuestionnaireFormData,
): QuestionnaireFieldUpdate[] {
  const parentKeys = [
    "livesOutsideCitizenship",
    "stayPurpose",
    "previousBiometrics",
    "paymentSponsor",
    "invitingPartyType",
    "dob",
  ] as const satisfies Array<keyof QuestionnaireFormData>;

  return parentKeys.flatMap((parentKey) =>
    dependentFieldKeysFor(parentKey, formData[parentKey]).flatMap((fieldKey) => {
      const binding = questionnaireFieldBindings.find((item) => item.formKey === fieldKey);
      if (!binding || !questionnaireField(applicant, binding.fieldId)) return [];

      return [{
        applicantId,
        fieldId: binding.fieldId,
        sectionId: binding.sectionId,
        value: "",
      } satisfies QuestionnaireFieldUpdate];
    }),
  );
}

function normalizeFocusLabel(value?: string) {
  return (value ?? "").trim().toLocaleLowerCase("ru-RU");
}

function sameFieldLabel(left?: string, right?: string) {
  return normalizeFocusLabel(left) === normalizeFocusLabel(right);
}

const questionnaireFieldLabelAliases: Record<string, string[]> = {
  "birth-date": ["Дата рождения"],
  "birth-place": ["Место рождения"],
  "company-contact-person": ["Контакт компании"],
  "company-org-details": ["Компания и адрес"],
  "cost-covered-by": ["Кто оплачивает"],
  "employer-address": ["Адрес работодателя"],
  "employer-contact": ["Телефон работодателя"],
  "employer-name": ["Работа / учеба"],
  "eu-relative-details": ["Родственник ЕС / ЕЭЗ"],
  "final-entry-permit": ["Разрешение на въезд"],
  "form-filler-contact": ["Адрес или email"],
  "form-filler-name": ["Кто заполнил"],
  "guardian-info": ["Родитель / опекун"],
  "hotel-name": ["Отель / приглашающий"],
  "inviting-party-type": ["Принимающая сторона"],
  "lives-outside-citizenship": ["Живет не в стране гражданства"],
  "main-destination": ["Страна назначения"],
  "passport-expiry-date": ["Дата окончания паспорта", "Действителен до"],
  "passport-issue-date": ["Дата выдачи паспорта", "Дата выдачи"],
  "passport-issue-country": ["Страна выдачи паспорта"],
  "passport-no": ["Номер паспорта"],
  "passport-type": ["Тип паспорта", "Тип документа", "Тип проездного документа"],
  "previous-biometrics": ["Биометрия уже сдавалась"],
  "previous-biometrics-date": ["Дата биометрии"],
  "previous-surname": ["Прежняя фамилия"],
  "residence-permit-type": ["ВНЖ / документ"],
  "sponsor-in-host-fields": ["Спонсор из 30/31"],
  "stay-purpose-details": ["Уточнение цели"],
};

function issueFieldMatches(fieldId: string, label: string, target?: string) {
  const normalizedTarget = normalizeFocusLabel(target).replace(/ё/g, "е");
  if (!normalizedTarget) return false;

  return [fieldId, label, ...(questionnaireFieldLabelAliases[fieldId] ?? [])].some(
    (candidate) => normalizeFocusLabel(candidate).replace(/ё/g, "е") === normalizedTarget,
  );
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
  if (section.includes("файл") || section.includes("медиа") || section.includes("документ")) return "files";
  if (section.includes("запис")) return "appointment";
  if (section.includes("паспорт")) return "passport";
  if (section.includes("родствен")) return "euRelative";
  if (section.includes("поезд") || section.includes("маршрут")) return "trip";
  if (section.includes("адрес") || section.includes("контакт")) return "contact";
  if (section.includes("работ")) return "employment";
  if (section.includes("отел") || section.includes("приглаш")) return "hotel";
  if (section.includes("оплат")) return "payment";
  if (section.includes("заполн")) return "filler";
  return "personal";
}

function sectionIdMatches(sectionId: string, canonicalId: string) {
  return sectionId === canonicalId || sectionId.endsWith(`-${canonicalId}`);
}

export function FigmaQuestionnaireScreen({
  initialFocus,
  onBack,
  onComplete,
  onFieldChange,
  onUploadFile,
  onSaveDraft,
  submission,
}: FigmaQuestionnaireScreenProps) {
  const initialFieldTarget = focusableFieldFor(initialFocus?.field);
  const [pendingFieldUpdates, setPendingFieldUpdates] = useState<
    Record<string, QuestionnaireFieldUpdate>
  >({});
  const pendingUpdates = useMemo(
    () => Object.values(pendingFieldUpdates),
    [pendingFieldUpdates],
  );
  const draftSubmission = useMemo(
    () => applyQuestionnaireUpdates(submission, pendingUpdates),
    [pendingUpdates, submission],
  );
  const applicants = useMemo(() => applicantTabs(draftSubmission), [draftSubmission]);
  const initialApplicantId = initialFocus?.applicantId ?? applicants[0]?.id ?? "app-1";
  const [activeApplicant, setActiveApplicant] = useState(initialApplicantId);
  const [activeSection, setActiveSection] = useState<SectionId>(
    sectionForFocus(initialFocus, initialFieldTarget),
  );
  const [acknowledgedReviewFields, setAcknowledgedReviewFields] = useState<Set<string>>(
    () => new Set(),
  );
  const [euRelativeApplicantIds, setEuRelativeApplicantIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showPreviousSurnameForMale, setShowPreviousSurnameForMale] = useState(false);
  const baseFormData = useMemo(
    () => questionnaireFormDataFromSubmission(submission, activeApplicant),
    [activeApplicant, submission],
  );
  const sourceFormData = useMemo(
    () => questionnaireFormDataFromSubmission(draftSubmission, activeApplicant),
    [activeApplicant, draftSubmission],
  );
  const [formData, setFormData] = useState<QuestionnaireFormData>(() => sourceFormData);

  useEffect(() => {
    setPendingFieldUpdates({});
  }, [submission.id]);

  useEffect(() => {
    if (applicants.some((applicant) => applicant.id === activeApplicant)) return;
    setActiveApplicant(applicants[0]?.id ?? "app-1");
  }, [activeApplicant, applicants]);

  useEffect(() => {
    setShowPreviousSurnameForMale(false);
  }, [activeApplicant]);

  useEffect(() => {
    setFormData(sourceFormData);
  }, [sourceFormData]);

  const activeApplicantModel = useMemo(
    () =>
      draftSubmission.applicants.find((applicant) => applicant.id === activeApplicant) ??
      draftSubmission.applicants[0],
    [activeApplicant, draftSubmission.applicants],
  );

  const selectOptions = useMemo(
    () => ({
      appointmentCity: submissionFieldOptions(
        activeApplicantModel,
        "appointment-city",
        BLS_CITY_OPTIONS,
      ),
      birthCountry: submissionFieldOptions(
        activeApplicantModel,
        "birth-country",
        BLS_COUNTRY_OPTIONS,
      ),
      birthCitizenship: BLS_COUNTRY_OPTIONS,
      category: submissionFieldOptions(activeApplicantModel, "category", ["Premium", "Normal"]),
      citizenship: submissionFieldOptions(
        activeApplicantModel,
        "nationality",
        BLS_COUNTRY_OPTIONS,
      ),
      country: BLS_COUNTRY_OPTIONS,
      costCoveredBy: submissionFieldOptions(activeApplicantModel, "cost-covered-by", [
        "Сам заявитель",
        "Спонсор",
      ]),
      entryCount: submissionFieldOptions(activeApplicantModel, "entry-count", [
        "Однократная",
        "Двукратная",
        "Многократная",
      ]),
      euRelationship: [
        "Супруг(а)",
        "Ребенок",
        "Внук/внучка",
        "Иждивенец по восходящей линии",
        "Зарегистрированный партнер",
        "Иное",
      ],
      gender: submissionFieldOptions(activeApplicantModel, "gender", [
        "Мужской",
        "Женский",
      ]).filter((option) => option !== "Другое" && option !== "OTHER"),
      homeCountry: submissionFieldOptions(
        activeApplicantModel,
        "home-country",
        BLS_COUNTRY_OPTIONS,
      ),
      hotelCountry: submissionFieldOptions(
        activeApplicantModel,
        "hotel-country",
        BLS_COUNTRY_OPTIONS,
      ),
      invitingPartyType: submissionFieldOptions(
        activeApplicantModel,
        "inviting-party-type",
        [
          "Приглашающая компания/организация",
          "Гостиница/временное жилье",
          "Приглашающее лицо",
        ],
      ),
      maritalStatus: submissionFieldOptions(activeApplicantModel, "marital-status", [
        "Холост/не замужем",
        "Женат/замужем",
        "Зарегистрированное партнерство",
        "Раздельно",
        "Разведен(а)",
        "Вдовец/вдова",
        "Иное",
      ]),
      meansOfSupport: submissionFieldOptions(activeApplicantModel, "means-of-support", [
        "Наличные",
        "Дорожные чеки",
        "Кредитная карта",
        "Жилье предоплачено",
        "Транспорт предоплачен",
        "Иное",
      ]),
      occupation: submissionFieldOptions(activeApplicantModel, "occupation", BLS_OCCUPATION_OPTIONS),
      otherCitizenship: BLS_COUNTRY_OPTIONS,
      passportIssueCountry: submissionFieldOptions(
        activeApplicantModel,
        "passport-issue-country",
        BLS_COUNTRY_OPTIONS,
      ),
      passportType: submissionFieldOptions(activeApplicantModel, "passport-type", [
        "Ordinary Passport",
        "Diplomatic Passport",
        "Service Passport",
        "Official Passport",
        "Special Passport",
        "Travel Document",
        "Other",
      ]),
      purpose: submissionFieldOptions(activeApplicantModel, "purpose", [
        "TOURISM",
        "BUSINESS",
        "VISITING FAMILY OR FRIENDS",
        "STUDY",
        "MEDICAL TREATMENT",
        "OFFICIAL VISIT",
        "CULTURAL",
        "SPORTS",
        "TRANSIT",
        "OTHER",
      ]),
      sponsorInHostFields: YES_NO_OPTIONS,
      sponsorMeans: [
        "Наличные",
        "Жилье предоставляется",
        "Все расходы оплачиваются",
        "Транспорт предоплачен",
        "Иное",
      ],
      visaType: submissionFieldOptions(activeApplicantModel, "visa-type", [
        "Национальная",
        "Шенгенская",
      ]),
      yesNo: YES_NO_OPTIONS,
    }),
    [activeApplicantModel],
  );

  const openFieldIssues = useMemo(
    () =>
      draftSubmission.issues.filter(
        (issue) =>
          issue.status === "open" &&
          issue.target.applicantId === activeApplicant &&
          issue.target.field,
      ),
    [activeApplicant, draftSubmission.issues],
  );

  const readinessStats = useMemo(() => {
    const fields = draftSubmission.applicants.flatMap((applicant) =>
      applicant.sections.flatMap((section) => section.fields),
    );
    const requiredFields = fields.filter((field) => field.required);
    const completedFields = requiredFields.filter(fieldIsReady);
    const validationRisks = fields.filter(hasActionableFieldProblem).length;
    const openIssueRisks = draftSubmission.issues.filter(
      (issue) => issue.status === "open" || issue.status === "fixed_by_agent",
    ).length;
    const requiredFileSlots = draftSubmission.applicants.flatMap((applicant) =>
      requiredQuestionnaireFileTypes.map((type) => ({ applicantId: applicant.id, type })),
    );
    const readyFiles = requiredFileSlots.filter((slot) =>
      fileIsReadyForQuestionnaire(
        draftSubmission.files.find(
          (file) => file.applicantId === slot.applicantId && file.type === slot.type,
        ),
      ),
    );
    const total = requiredFields.length + requiredFileSlots.length;
    const completed = completedFields.length + readyFiles.length;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    const risks = validationRisks + openIssueRisks;

    return {
      canSubmit: total > 0 && completed === total && risks === 0,
      completed,
      completedFields: completedFields.length,
      completedFiles: readyFiles.length,
      fieldTotal: requiredFields.length,
      fileTotal: requiredFileSlots.length,
      percent,
      risks,
      total,
    };
  }, [draftSubmission]);

  const hasEuRelativeData = Boolean(
    formData.euRelativeDetails.trim() || formData.euRelationship.trim(),
  );
  const showEuRelativeSection =
    activeSection === "euRelative" ||
    hasEuRelativeData ||
    euRelativeApplicantIds.has(activeApplicant);

  const sections = useMemo(
    () =>
      sectionDefinitions
      .filter((definition) => definition.id !== "euRelative" || showEuRelativeSection)
      .map(({ canonicalId, ...definition }) => {
        if (definition.id === "files") {
          const applicantFiles = activeApplicantModel
            ? requiredQuestionnaireFileTypes.map((type) =>
                draftSubmission.files.find(
                  (file) => file.applicantId === activeApplicantModel.id && file.type === type,
                ),
              )
            : [];
          const completed = applicantFiles.filter(fileIsReadyForQuestionnaire).length;
          const total = requiredQuestionnaireFileTypes.length;

          return {
            ...definition,
            meta: `${completed} из ${total}`,
            status: completed === total ? "complete" : "pending",
          } satisfies SectionTab & { id: SectionId };
        }

        const sourceSection = activeApplicantModel?.sections.find((section) =>
          sectionIdMatches(section.id, canonicalId),
        );

        if (!sourceSection) return definition;

        const requiredFields = sourceSection.fields.filter((field) => field.required);
        const total = requiredFields.length;
        const completed = requiredFields.filter(fieldIsReady).length;
        const hasRisk = sourceSection.fields.some(hasActionableFieldProblem);

        return {
          ...definition,
          meta: `${completed} из ${total}`,
          status:
            hasRisk ? "issue" : total > 0 && completed === total ? "complete" : "pending",
        } satisfies SectionTab & { id: SectionId };
      }),
    [activeApplicantModel, draftSubmission.files, showEuRelativeSection],
  );
  const isCompleteButtonDisabled = !readinessStats.canSubmit;
  const showResidencePermitFields = formData.livesOutsideCitizenship === "Да";
  const showPurposeDetails = formData.stayPurpose === "OTHER";
  const showPreviousBiometricsDetails = formData.previousBiometrics === "Да";
  const showPreviousSurname =
    formData.sex !== "Мужской" ||
    Boolean(formData.previousSurname.trim()) ||
    showPreviousSurnameForMale;
  const showSponsorFields = formData.paymentSponsor === "Спонсор";
  const showGuardianInfo =
    isQuestionnaireMinor(formData.dob) || Boolean(formData.guardianInfo.trim());
  const showCompanyInviteFields =
    formData.invitingPartyType === "Приглашающая компания/организация" ||
    Boolean(
      formData.companyOrgDetails.trim() ||
        formData.companyContactPerson.trim() ||
        formData.companyPhone.trim(),
    );
  const primaryApplicant = draftSubmission.applicants[0];
  const sharedFieldIds = familySharedFieldIds[activeSection] ?? [];
  const canCopyFamilySection =
    draftSubmission.type === "family" &&
    Boolean(primaryApplicant) &&
    primaryApplicant?.id !== activeApplicant &&
    sharedFieldIds.length > 0;

  const currentSectionIssue = useMemo(() => {
    const currentSection = sections.find((section) => section.id === activeSection);
    if (!currentSection) return undefined;

    return openFieldIssues.find((issue) => {
      if (issue.target.section === currentSection.title) return true;

      return questionnaireFieldBindings
        .filter((binding) => binding.sectionId === activeSection)
        .some((binding) => {
          const field = questionnaireField(activeApplicantModel, binding.fieldId);
          return issueFieldMatches(
            binding.fieldId,
            field?.label ?? issue.target.field ?? "",
            issue.target.field,
          );
        });
    });
  }, [activeApplicantModel, activeSection, openFieldIssues, sections]);

  function updateField(key: keyof QuestionnaireFormData, value: string) {
    const dependentKeys = dependentFieldKeysFor(key, value);
    const buildUpdate = (fieldKey: keyof QuestionnaireFormData, fieldValue: string) => {
      const binding = questionnaireFieldBindings.find((item) => item.formKey === fieldKey);
      if (!binding) return undefined;

      const modelField = questionnaireField(activeApplicantModel, binding.fieldId);
      return {
        binding,
        update: {
          applicantId: activeApplicant,
          error: modelField
            ? validationMessageForQuestionnaireField(modelField, fieldValue)
            : undefined,
          fieldId: binding.fieldId,
          sectionId: binding.sectionId,
          value: fieldValue,
        } satisfies QuestionnaireFieldUpdate,
      };
    };

    const updates = [
      buildUpdate(key, value),
      ...dependentKeys.map((dependentKey) => buildUpdate(dependentKey, "")),
    ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    setFormData((current) => {
      const next = { ...current, [key]: value };
      for (const dependentKey of dependentKeys) next[dependentKey] = "";
      return next;
    });

    setPendingFieldUpdates((current) => {
      const next = { ...current };
      for (const { binding, update } of updates) {
        const updateKey = questionnaireUpdateKey(update);
        if (update.value === baseFormData[binding.formKey]) {
          delete next[updateKey];
        } else {
          next[updateKey] = update;
        }
      }
      return next;
    });

    for (const { binding, update } of updates) {
      if (update.value !== baseFormData[binding.formKey]) onFieldChange?.(update);
    }
  }

  function updatePassportIssueDate(value: string) {
    updateField("passportIssued", value);

    const suggestedExpiry = passportExpiryFromIssueDate(value);
    if (formData.passportExpiry || !suggestedExpiry) return;

    updateField("passportExpiry", suggestedExpiry);
  }

  function copyFamilySectionFromPrimaryApplicant() {
    if (!primaryApplicant || !canCopyFamilySection) return;

    const updates = sharedFieldIds.flatMap((fieldId) => {
      const sourceField = questionnaireField(primaryApplicant, fieldId);
      const targetField = questionnaireField(activeApplicantModel, fieldId);
      const binding = questionnaireFieldBindings.find((item) => item.fieldId === fieldId);
      if (!sourceField?.value.trim() || !targetField || !binding) return [];

      return [{
        applicantId: activeApplicant,
        error: validationMessageForQuestionnaireField(targetField, sourceField.value),
        fieldId,
        reviewOriginSource: "family_shared" as const,
        reviewSource: "family_shared" as const,
        reviewState: "needs_review" as const,
        sectionId: binding.sectionId,
        value: sourceField.value,
      } satisfies QuestionnaireFieldUpdate];
    });
    if (!updates.length) return;

    setPendingFieldUpdates((current) => {
      const next = { ...current };
      for (const update of updates) next[questionnaireUpdateKey(update)] = update;
      return next;
    });
    for (const update of updates) onFieldChange?.(update);
  }

  function fieldIssue(fieldId: string, label: string) {
    return openFieldIssues.find((issue) =>
      issueFieldMatches(fieldId, label, issue.target.field),
    );
  }

  function fieldReviewState(fieldId: string, label: string): FieldState {
    if (fieldIssue(fieldId, label)) return "invalid";

    if (acknowledgedReviewFields.has(`${activeApplicant}:${fieldId}`)) return "normal";

    const field = questionnaireField(activeApplicantModel, fieldId);
    if (field && hasActionableFieldProblem(field)) return "invalid";
    if (field?.reviewState === "needs_review") return "needs_review";

    return initialFieldTarget?.fieldId === fieldId ||
      initialFieldTarget?.labels.some((candidate) => sameFieldLabel(candidate, label))
      ? "needs_review"
      : "normal";
  }

  function acknowledgeFieldReview(fieldId: string) {
    setAcknowledgedReviewFields((current) => {
      const key = `${activeApplicant}:${fieldId}`;
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
  }

  function openEuRelativeSection() {
    setEuRelativeApplicantIds((current) => {
      if (current.has(activeApplicant)) return current;
      const next = new Set(current);
      next.add(activeApplicant);
      return next;
    });
    setActiveSection("euRelative");
  }

  function fieldErrorMessage(fieldId: string, label: string) {
    const issue = fieldIssue(fieldId, label);
    if (issue) return issue.comment ?? issue.reason;
    const field = questionnaireField(activeApplicantModel, fieldId);
    return field?.error ?? (field ? validationMessageForQuestionnaireField(field, field.value) : undefined);
  }

  function fieldReviewSource(fieldId: string, label: string) {
    if (fieldReviewState(fieldId, label) !== "needs_review") return undefined;
    return questionnaireField(activeApplicantModel, fieldId)?.reviewSource
      ? "требует сверки OCR"
      : undefined;
  }

  function requiredFileForActiveApplicant(
    type: (typeof requiredQuestionnaireFileTypes)[number],
  ) {
    if (!activeApplicantModel) return undefined;
    return draftSubmission.files.find(
      (file) => file.applicantId === activeApplicantModel.id && file.type === type,
    );
  }

  const focusedApplicantId = initialFocus?.applicantId ?? activeApplicant;
  const focusedUpdatePayload = useMemo(() => {
    if (!initialFieldTarget || focusedApplicantId === undefined) return undefined;

    const focusedField = questionnaireField(activeApplicantModel, initialFieldTarget.fieldId);
    const value = formData[initialFieldTarget.formKey];

    return {
      applicantId: focusedApplicantId,
      error: focusedField
        ? validationMessageForQuestionnaireField(focusedField, value)
        : undefined,
      fieldId: initialFieldTarget.fieldId,
      sectionId: initialFieldTarget.sectionId,
      value,
    } satisfies QuestionnaireFieldUpdate;
  }, [activeApplicantModel, focusedApplicantId, formData, initialFieldTarget]);

  function completionPayload(): QuestionnaireCommitPayload {
    const conditionalClears = conditionalFieldClearsFor(
      activeApplicantModel,
      activeApplicant,
      formData,
    );
    const updates = new Map<string, QuestionnaireFieldUpdate>();
    for (const update of [...Object.values(pendingFieldUpdates), ...conditionalClears]) {
      updates.set(questionnaireUpdateKey(update), update);
    }

    return {
      fieldUpdates: [...updates.values()],
      focusedUpdate: focusedUpdatePayload,
      travelEnd: formData.travelEnd,
      travelStart: formData.travelStart,
    };
  }

  function goToNextSection() {
    const currentIndex = sections.findIndex((section) => section.id === activeSection);
    const nextSection = sections[(currentIndex + 1) % sections.length];
    setActiveSection(nextSection.id);
  }

  function renderSectionFields() {
    if (activeSection === "files") {
      return (
        <section aria-label="Файлы заявителя" className="v19-questionnaire-file-list">
          <p className="v19-questionnaire-file-intro">
            {onUploadFile
              ? "Три файла на заявителя. Выберите нужный слот — статус обновится после загрузки."
              : "Три файла на заявителя. Статусы доступны здесь; загрузка — в рабочем пространстве."}
          </p>
          <QuestionnaireFileSlot
            description="Главная страница загранпаспорта с фото"
            file={requiredFileForActiveApplicant("passport_scan")}
            fileType="passport_scan"
            label="Загранпаспорт"
            onUploadFile={onUploadFile}
            submission={draftSubmission}
          />
          <QuestionnaireFileSlot
            description="Фото анфас"
            file={requiredFileForActiveApplicant("selfie")}
            fileType="selfie"
            label="Селфи 1"
            onUploadFile={onUploadFile}
            submission={draftSubmission}
          />
          <QuestionnaireFileSlot
            description="Фото в профиль"
            file={requiredFileForActiveApplicant("selfie_2")}
            fileType="selfie_2"
            label="Селфи 2"
            onUploadFile={onUploadFile}
            submission={draftSubmission}
          />
        </section>
      );
    }

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
            label="Категория обслуживания"
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
            errorMessage={fieldErrorMessage("passport-type", "Тип документа")}
            focused={fieldReviewState("passport-type", "Тип документа") === "needs_review"}
            label="Тип документа"
            number="1"
            options={selectOptions.passportType}
            required
            reviewSource={fieldReviewSource("passport-type", "Тип документа")}
            state={fieldReviewState("passport-type", "Тип документа")}
            value={formData.passportType}
            onChange={(value) => updateField("passportType", value)}
          />
          <FormField
            excelMap="Cell: C3"
            errorMessage={fieldErrorMessage("passport-no", "Номер паспорта")}
            focused={fieldReviewState("passport-no", "Номер паспорта") === "needs_review"}
            label="Номер паспорта"
            number="2"
            required
            reviewSource={fieldReviewSource("passport-no", "Номер паспорта")}
            state={fieldReviewState("passport-no", "Номер паспорта")}
            value={formData.passportNumber}
            onChange={(value) => updateField("passportNumber", value)}
          />
          <FormField
            excelMap="Cell: C4"
            errorMessage={fieldErrorMessage("passport-issue-date", "Дата выдачи")}
            focused={fieldReviewState("passport-issue-date", "Дата выдачи") === "needs_review"}
            label="Дата выдачи"
            number="3"
            required
            reviewSource={fieldReviewSource("passport-issue-date", "Дата выдачи")}
            state={fieldReviewState("passport-issue-date", "Дата выдачи")}
            value={formData.passportIssued}
            onChange={updatePassportIssueDate}
          />
          <FormField
            excelMap="Cell: C5"
            errorMessage={fieldErrorMessage("passport-expiry-date", "Действителен до")}
            focused={fieldReviewState("passport-expiry-date", "Действителен до") === "needs_review"}
            hint="Если дата окончания не считалась: введите дату выдачи — подставим +10 лет. Для 5-летнего паспорта исправьте дату."
            label="Действителен до"
            number="4"
            required
            reviewSource={fieldReviewSource("passport-expiry-date", "Действителен до")}
            state={fieldReviewState("passport-expiry-date", "Действителен до")}
            value={formData.passportExpiry}
            onChange={(value) => updateField("passportExpiry", value)}
          />
          <FormField
            excelMap="Анкета: passport-issue-country"
            label="Страна выдачи"
            number="5"
            options={selectOptions.passportIssueCountry}
            value={formData.passportIssueCountry}
            onChange={(value) => updateField("passportIssueCountry", value)}
          />
          <FormField
            excelMap="Cell: C6"
            label="Место выдачи"
            number="6"
            value={formData.passportIssuePlace}
            onChange={(value) => updateField("passportIssuePlace", value)}
          />
        </>
      );
    }

    if (activeSection === "euRelative") {
      return (
        <>
          <FormField
            excelMap="Анкета: eu-relative-details"
            fullWidth
            label="Данные родственника-гражданина ЕС / ЕЭЗ / Швейцарии"
            number="1"
            type="textarea"
            value={formData.euRelativeDetails}
            onChange={(value) => updateField("euRelativeDetails", value)}
          />
          <FormField
            excelMap="Анкета: eu-relationship"
            label="Родственная связь"
            number="2"
            options={selectOptions.euRelationship}
            value={formData.euRelationship}
            onChange={(value) => updateField("euRelationship", value)}
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
            number="1"
            required
            type="textarea"
            value={formData.contactAddress}
            onChange={(value) => updateField("contactAddress", value)}
          />
          <FormField
            excelMap="Cell: D4"
            label="Email"
            number="2"
            required
            type="email"
            value={formData.contactEmail}
            onChange={(value) => updateField("contactEmail", value)}
          />
          <FormField
            excelMap="Cell: D3"
            label="Телефон"
            number="3"
            phonePrefix="+7"
            required
            value={formData.contactPhone}
            onChange={(value) => updateField("contactPhone", value)}
          />
          <FormField
            label="Страна проживания"
            number="4"
            options={selectOptions.homeCountry}
            value={formData.homeCountry}
            onChange={(value) => updateField("homeCountry", value)}
          />
          <FormField
            excelMap="Анкета: residence-city"
            label="Город проживания"
            number="5"
            suggestions={POPULAR_RUSSIAN_CITY_OPTIONS}
            value={formData.residenceCity}
            onChange={(value) => updateField("residenceCity", value)}
          />
          <FormField
            excelMap="Анкета: residence-postal-code"
            label="Почтовый индекс"
            number="6"
            value={formData.residencePostalCode}
            onChange={(value) => updateField("residencePostalCode", value)}
          />
          <FormField
            excelMap="Анкета: lives-outside-citizenship"
            label="Проживание не в стране гражданства"
            number="7"
            options={selectOptions.yesNo}
            value={formData.livesOutsideCitizenship}
            onChange={(value) => updateField("livesOutsideCitizenship", value)}
          />
          {showResidencePermitFields ? (
            <>
              <FormField
                excelMap="Анкета: residence-permit-type"
                label="Вид на жительство / документ"
                number="8"
                value={formData.residencePermitType}
                onChange={(value) => updateField("residencePermitType", value)}
              />
              <FormField
                excelMap="Анкета: residence-permit-number"
                label="Номер документа"
                number="9"
                value={formData.residencePermitNumber}
                onChange={(value) => updateField("residencePermitNumber", value)}
              />
              <FormField
                excelMap="Анкета: residence-permit-valid-until"
                label="Действителен до"
                number="10"
                value={formData.residencePermitValidUntil}
                onChange={(value) => updateField("residencePermitValidUntil", value)}
              />
            </>
          ) : null}
        </>
      );
    }

    if (activeSection === "employment") {
      return (
        <>
          <FormField
            excelMap="Cell: E2"
            errorMessage={fieldErrorMessage("occupation", "Профессия")}
            label="Профессия"
            number="1"
            options={selectOptions.occupation}
            required
            reviewSource={fieldReviewSource("occupation", "Профессия")}
            state={fieldReviewState("occupation", "Профессия")}
            value={formData.occupation}
            onChange={(value) => updateField("occupation", value)}
          />
          <FormField
            excelMap="Анкета: occupation-specify"
            label="Уточнение профессии"
            number="2"
            value={formData.currentJob}
            onChange={(value) => updateField("currentJob", value)}
          />
          <FormField
            excelMap="Cell: E3"
            fullWidth
            label="Работодатель / учебное заведение"
            number="3"
            required
            type="textarea"
            value={formData.employerName}
            onChange={(value) => updateField("employerName", value)}
          />
          <FormField
            excelMap="Анкета: employer-contact"
            label="Телефон работодателя / учебного заведения"
            number="4"
            phonePrefix="+7"
            value={formData.employerContact}
            onChange={(value) => updateField("employerContact", value)}
          />
          <FormField
            excelMap="Cell: E4"
            fullWidth
            label="Адрес работодателя / учебного заведения"
            number="5"
            type="textarea"
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
            label="Цель поездки"
            number="1"
            options={selectOptions.purpose}
            required
            value={formData.stayPurpose}
            onChange={(value) => updateField("stayPurpose", value)}
          />
          {showPurposeDetails ? (
            <FormField
              excelMap="Анкета: stay-purpose-details"
              fullWidth
              label="Дополнительные сведения о цели"
              number="2"
              type="textarea"
              value={formData.stayPurposeDetails}
              onChange={(value) => updateField("stayPurposeDetails", value)}
            />
          ) : null}
          <FormField
            excelMap="Анкета: main-destination"
            label="Основная страна назначения"
            number="3"
            options={selectOptions.country}
            value={formData.mainDestination}
            onChange={(value) => updateField("mainDestination", value)}
          />
          <FormField
            excelMap="Cell: F5"
            label="Страна первого въезда"
            number="4"
            options={selectOptions.country}
            value={formData.firstEntryCountry}
            onChange={(value) => updateField("firstEntryCountry", value)}
          />
          <FormField
            excelMap="Анкета: entry-count"
            label="Количество въездов"
            number="5"
            options={selectOptions.entryCount}
            value={formData.entryCount}
            onChange={(value) => updateField("entryCount", value)}
          />
          <FormField
            excelMap="Cell: F3"
            errorMessage={fieldErrorMessage("arrival-date", "Дата въезда")}
            focused={fieldReviewState("arrival-date", "Дата въезда") === "needs_review"}
            label="Дата въезда"
            number="6"
            required
            reviewSource={fieldReviewSource("arrival-date", "Дата въезда")}
            state={fieldReviewState("arrival-date", "Дата въезда")}
            value={formData.travelStart}
            onChange={(value) => updateField("travelStart", value)}
          />
          <FormField
            excelMap="Cell: F4"
            errorMessage={fieldErrorMessage("departure-date", "Дата выезда")}
            focused={fieldReviewState("departure-date", "Дата выезда") === "needs_review"}
            label="Дата выезда"
            number="7"
            required
            reviewSource={fieldReviewSource("departure-date", "Дата выезда")}
            state={fieldReviewState("departure-date", "Дата выезда")}
            value={formData.travelEnd}
            onChange={(value) => updateField("travelEnd", value)}
          />
          <FormField
            excelMap="Анкета: stay-duration"
            label="Длительность пребывания"
            number="8"
            type="number"
            value={formData.stayDuration}
            onChange={(value) => updateField("stayDuration", value)}
          />
          <FormField
            excelMap="Анкета: previous-biometrics"
            label="Отпечатки ранее сдавались"
            number="9"
            options={selectOptions.yesNo}
            value={formData.previousBiometrics}
            onChange={(value) => updateField("previousBiometrics", value)}
          />
          {showPreviousBiometricsDetails ? (
            <>
              <FormField
                excelMap="Анкета: previous-biometrics-date"
                label="Дата сдачи отпечатков"
                number="10"
                value={formData.previousBiometricsDate}
                onChange={(value) => updateField("previousBiometricsDate", value)}
              />
              <FormField
                excelMap="Анкета: previous-visa-number"
                label="Номер визы"
                number="11"
                value={formData.previousVisaNumber}
                onChange={(value) => updateField("previousVisaNumber", value)}
              />
            </>
          ) : null}
          <FormField
            excelMap="Анкета: final-entry-permit"
            label="Разрешение на въезд в конечную страну"
            number="12"
            value={formData.finalEntryPermit}
            onChange={(value) => updateField("finalEntryPermit", value)}
          />
          <FormField
            excelMap="Анкета: final-entry-permit-issued-by"
            label="Кем выдано"
            number="13"
            value={formData.finalEntryPermitIssuedBy}
            onChange={(value) => updateField("finalEntryPermitIssuedBy", value)}
          />
          <FormField
            excelMap="Анкета: final-entry-permit-valid-from"
            label="Действительно с"
            number="14"
            value={formData.finalEntryPermitValidFrom}
            onChange={(value) => updateField("finalEntryPermitValidFrom", value)}
          />
          <FormField
            excelMap="Анкета: final-entry-permit-valid-to"
            label="Действительно до"
            number="15"
            value={formData.finalEntryPermitValidTo}
            onChange={(value) => updateField("finalEntryPermitValidTo", value)}
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
            number="1"
            options={selectOptions.invitingPartyType}
            value={formData.invitingPartyType}
            onChange={(value) => updateField("invitingPartyType", value)}
          />
          <FormField
            excelMap="Cell: G2"
            label="ФИО приглашающего лица или название отеля"
            number="2"
            required
            value={formData.hotelName}
            onChange={(value) => updateField("hotelName", value)}
          />
          <FormField
            excelMap="Cell: G3"
            fullWidth
            label="Адрес"
            number="3"
            required
            type="textarea"
            value={formData.hotelAddress}
            onChange={(value) => updateField("hotelAddress", value)}
          />
          <FormField
            label="Email"
            number="4"
            type="email"
            value={formData.hotelEmail}
            onChange={(value) => updateField("hotelEmail", value)}
          />
          <FormField
            label="Телефон"
            number="5"
            phonePrefix="+34"
            value={formData.hotelContact}
            onChange={(value) => updateField("hotelContact", value)}
          />
          {showCompanyInviteFields ? (
            <>
              <FormField
                excelMap="Анкета: company-org-details"
                fullWidth
                label="Название и адрес компании/организации"
                number="6"
                type="textarea"
                value={formData.companyOrgDetails}
                onChange={(value) => updateField("companyOrgDetails", value)}
              />
              <FormField
                excelMap="Анкета: company-contact-person"
                fullWidth
                label="Контактное лицо компании"
                number="7"
                type="textarea"
                value={formData.companyContactPerson}
                onChange={(value) => updateField("companyContactPerson", value)}
              />
              <FormField
                excelMap="Анкета: company-phone"
                label="Телефон компании"
                number="8"
                phonePrefix="+34"
                value={formData.companyPhone}
                onChange={(value) => updateField("companyPhone", value)}
              />
            </>
          ) : null}
        </>
      );
    }

    if (activeSection === "payment") {
      return (
        <>
          <FormField
            excelMap="Cell: H2"
            label="Кто оплачивает поездку"
            number="1"
            options={selectOptions.costCoveredBy}
            required
            value={formData.paymentSponsor}
            onChange={(value) => updateField("paymentSponsor", value)}
          />
          <FormField
            excelMap="Cell: H3"
            label="Средства заявителя"
            number="2"
            options={selectOptions.meansOfSupport}
            required
            value={formData.paymentType}
            onChange={(value) => updateField("paymentType", value)}
          />
          {showSponsorFields ? (
            <>
              <FormField
                excelMap="Анкета: sponsor-in-host-fields"
                label="Спонсор указан в полях 30/31"
                number="3"
                options={selectOptions.sponsorInHostFields}
                value={formData.sponsorInHostFields}
                onChange={(value) => updateField("sponsorInHostFields", value)}
              />
              <FormField
                excelMap="Анкета: other-sponsor"
                label="Другой спонсор"
                number="4"
                value={formData.otherSponsor}
                onChange={(value) => updateField("otherSponsor", value)}
              />
              <FormField
                excelMap="Анкета: sponsor-means"
                fullWidth
                label="Средства спонсора"
                number="5"
                options={selectOptions.sponsorMeans}
                value={formData.sponsorMeans}
                onChange={(value) => updateField("sponsorMeans", value)}
              />
            </>
          ) : null}
        </>
      );
    }

    if (activeSection === "filler") {
      return (
        <>
          <FormField
            excelMap="Анкета: form-filler-name"
            label="ФИО заполнившего, если не заявитель"
            number="1"
            value={formData.formFillerName}
            onChange={(value) => updateField("formFillerName", value)}
          />
          <FormField
            excelMap="Анкета: form-filler-contact"
            fullWidth
            label="Адрес/email заполнившего"
            number="2"
            type="textarea"
            value={formData.formFillerContact}
            onChange={(value) => updateField("formFillerContact", value)}
          />
          <FormField
            excelMap="Анкета: form-filler-phone"
            label="Телефон заполнившего"
            number="3"
            phonePrefix="+7"
            value={formData.formFillerPhone}
            onChange={(value) => updateField("formFillerPhone", value)}
          />
        </>
      );
    }

    if (activeSection === "personal") {
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
        {showPreviousSurname ? (
          <FormField
            excelMap="Анкета: previous-surname"
            label="Фамилия при рождении / предыдущая"
            number="2"
            value={formData.previousSurname}
            onChange={(value) => updateField("previousSurname", value)}
          />
        ) : (
          <button
            className="v19-questionnaire-optional-reveal"
            type="button"
            onClick={() => setShowPreviousSurnameForMale(true)}
          >
            Указать предыдущую фамилию
          </button>
        )}
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
            errorMessage={fieldErrorMessage("birth-date", "Дата рождения")}
            label="Дата рождения"
            number="4"
            onAcknowledgeReview={() => acknowledgeFieldReview("birth-date")}
            required
          state={fieldReviewState("birth-date", "Дата рождения")}
          value={formData.dob}
          onChange={(value) => updateField("dob", value)}
        />
        <FormField
          excelMap="Cell: B5"
          errorMessage={fieldErrorMessage("birth-place", "Место рождения")}
          label="Место рождения"
          number="5"
          required
          reviewSource={fieldReviewSource("birth-place", "Место рождения")}
          state={fieldReviewState("birth-place", "Место рождения")}
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
          excelMap="Анкета: birth-citizenship"
          label="Гражданство при рождении, если отличается"
          number="8"
          options={selectOptions.birthCitizenship}
          value={formData.birthCitizenship}
          onChange={(value) => updateField("birthCitizenship", value)}
        />
        <FormField
          excelMap="Анкета: other-citizenship"
          label="Иное гражданство"
          number="9"
          options={selectOptions.otherCitizenship}
          value={formData.otherCitizenship}
          onChange={(value) => updateField("otherCitizenship", value)}
        />
        <FormField
          excelMap="Cell: B8"
          label="Пол"
          number="10"
          options={selectOptions.gender}
          required
          value={formData.sex}
          onChange={(value) => updateField("sex", value)}
        />
        <FormField
          excelMap="Cell: B9"
          fullWidth
          label="Семейное положение"
          number="11"
          options={selectOptions.maritalStatus}
          required
          value={formData.maritalStatus}
          onChange={(value) => updateField("maritalStatus", value)}
        />
        {showGuardianInfo ? (
          <FormField
            excelMap="Анкета: guardian-info"
            fullWidth
            label="Родитель/опекун несовершеннолетнего"
            number="12"
            type="textarea"
            value={formData.guardianInfo}
            onChange={(value) => updateField("guardianInfo", value)}
          />
        ) : null}
        <FormField
          excelMap="Анкета: national-id"
          label="Национальный ID"
          number="13"
          value={formData.nationalId}
          onChange={(value) => updateField("nationalId", value)}
        />
      </>
      );
    }

    return null;
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="vf-figma-surface vf-figma-questionnaire-screen v19-questionnaire-screen-shell"
      data-submission-id={draftSubmission.id}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
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
          <h1
            aria-label={`Анкета: ${draftSubmission.title || "Семья Петровых"}`}
            className="v19-questionnaire-title"
          >
            <span className="v19-questionnaire-title-mobile">Анкета</span>
            <span className="v19-questionnaire-title-desktop">
              Анкета: {draftSubmission.title || "Семья Петровых"}
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[var(--v19b-size-11)] text-white/40 hidden md:inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
            {readinessStats.percent}% · {readinessStats.completed}/{readinessStats.total}
          </span>
          <button
            className="v19-questionnaire-draft-button"
            type="button"
            onClick={() => onSaveDraft?.(completionPayload())}
          >
            Черновик
          </button>
          <button
            className={`v19-questionnaire-complete-button ${readinessStats.canSubmit ? "is-ready" : "is-blocked"}`}
            disabled={isCompleteButtonDisabled}
            type="button"
            onClick={() => onComplete(completionPayload())}
          >
            <span className="hidden sm:inline">Готово к проверке</span>
            <span className="sm:hidden">Готово</span>
          </button>
        </div>
      </header>

      <div className="v19-questionnaire-progress-track">
        <motion.div
          animate={{ width: `${readinessStats.percent}%` }}
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
        <div className="v19-questionnaire-scroll-frame max-w-[var(--v19b-size-1240)] mx-auto flex flex-col h-full min-h-0 gap-3 lg:gap-4 pb-[env(safe-area-inset-bottom)]">
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
                {draftSubmission.type === "family"
                  ? `Семья, ${Math.max(draftSubmission.applicants.length, 1)} чел.`
                  : "Один заявитель"}
              </span>
            </div>
          </div>

          <div className="v19-questionnaire-section-list v19-questionnaire-section-list--pinned">
            {sections.map((section) => (
              <button
                aria-selected={activeSection === section.id}
                className={`v19-questionnaire-section-tab ${
                  activeSection === section.id ? "is-active" : ""
                }`}
                key={`pinned-${section.id}`}
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
            {!showEuRelativeSection ? (
              <button
                className="v19-questionnaire-optional-reveal v19-questionnaire-section-optional"
                type="button"
                onClick={openEuRelativeSection}
              >
                Добавить родственника ЕС
              </button>
            ) : null}
          </div>

          <QuestionnaireWorkspaceShell className="v19-questionnaire-workspace-shell flex-1 flex flex-col lg:flex-row gap-3 lg:gap-4 min-h-0">
            <aside className="v19-questionnaire-section-nav">
              <V19ReadinessCard
                description="Пакет можно отправлять, когда обязательные поля и файлы готовы без ошибок."
                detail={riskLabel(readinessStats.risks)}
                scoreLabel={`${readinessStats.percent}%`}
                value={readinessStats.percent}
              />

              <V19SearchField label="Поиск поля анкеты" placeholder="Найти поле..." />

              <div className="v19-questionnaire-section-list v19-questionnaire-section-list--sidebar">
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
                {!showEuRelativeSection ? (
                  <button
                    className="v19-questionnaire-optional-reveal v19-questionnaire-section-optional"
                    type="button"
                    onClick={openEuRelativeSection}
                  >
                    Добавить родственника ЕС
                  </button>
                ) : null}
              </div>
            </aside>

            <div className="v19-questionnaire-work-panel">
              {currentSectionIssue ? (
                <div className="v19-questionnaire-review-alert">
                  <div className="v19-questionnaire-review-strip" />
                  <div className="v19-questionnaire-review-icon">
                    <AlertCircle className="w-[var(--v19b-size-18)] h-[var(--v19b-size-18)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[var(--v19b-size-13-5)] font-semibold text-white">
                      {currentSectionIssue.target.field
                        ? `${currentSectionIssue.target.field}: ${currentSectionIssue.reason}`
                        : currentSectionIssue.reason}
                    </div>
                    <p className="text-[var(--v19b-size-12)] text-white/60 mt-1.5 leading-relaxed">
                      {currentSectionIssue.comment}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="v19-questionnaire-work-grid">
                {canCopyFamilySection ? (
                  <button
                    className="v19-questionnaire-draft-button"
                    type="button"
                    onClick={copyFamilySectionFromPrimaryApplicant}
                  >
                    Скопировать общие данные от {primaryApplicant?.fullName || "первого заявителя"}
                  </button>
                ) : null}
                <div className="v19-questionnaire-fields-grid">
                  {renderSectionFields()}
                </div>
              </div>

              <button
                className="v19-questionnaire-next-button v19-questionnaire-next-button--simple"
                type="button"
                onClick={goToNextSection}
              >
                Продолжить
              </button>
            </div>
          </QuestionnaireWorkspaceShell>
        </div>
      </div>
    </motion.div>
  );
}
