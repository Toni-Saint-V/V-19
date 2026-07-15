import {
  type ChangeEvent,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
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
  blsStayDurationFromDates,
  isBlsQuestionnaireFieldBlockingIssue,
  isBlsQuestionnaireFieldReady,
  isBlsQuestionnaireFieldRequired,
  isBlsQuestionnaireInvitingCompanySelected,
  isBlsQuestionnaireMinorApplicant,
  validateBlsQuestionnaireField,
  type BlsFormData,
} from "../questionnaireBlsRules";
import {
  passportScanUploadAccept,
  passportScanUploadFormatLabel,
  selfieUploadAccept,
  selfieUploadFormatLabel,
} from "../mediaStorage";
import {
  agentQuestionnaireCompletionDecision,
  canAgentEditSubmissionContent,
  canReplaceDocument,
} from "../status";
import {
  passportGateIssues,
  type PassportGateIssue,
} from "../passportExtractionGuards";
import {
  QuestionnaireProgressBadge,
  QuestionnaireWorkspaceShell,
} from "./QuestionnaireWorkspacePrimitives";

type FieldState = "normal" | "needs_review" | "invalid";
type ApplicantTabStatus = "complete" | "issue" | "pending";
type ApplicantTab = {
  completed: number;
  id: string;
  index: number;
  name: string;
  status: ApplicantTabStatus;
  total: number;
};
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
  {
    canonicalId: "files",
    id: "files",
    meta: "0 файлов",
    status: "pending",
    title: "Файлы",
  },
  {
    canonicalId: "appointment",
    id: "appointment",
    meta: "0 из 0",
    status: "pending",
    title: "Запись",
  },
  {
    canonicalId: "personal",
    id: "personal",
    meta: "0 из 0",
    status: "pending",
    title: "Личные данные",
  },
  {
    canonicalId: "passport",
    id: "passport",
    meta: "0 из 0",
    status: "pending",
    title: "Паспорт",
  },
  {
    canonicalId: "euRelative",
    id: "euRelative",
    meta: "0 из 0",
    status: "pending",
    title: "Родственник ЕС",
  },
  {
    canonicalId: "contacts",
    id: "contact",
    meta: "0 из 0",
    status: "pending",
    title: "Адрес и контакты",
  },
  {
    canonicalId: "employment",
    id: "employment",
    meta: "0 из 0",
    status: "pending",
    title: "Работа / учеба",
  },
  {
    canonicalId: "trip",
    id: "trip",
    meta: "0 из 0",
    status: "pending",
    title: "Поездка",
  },
  {
    canonicalId: "hotel",
    id: "hotel",
    meta: "0 из 0",
    status: "pending",
    title: "Отель / приглашение",
  },
  {
    canonicalId: "payment",
    id: "payment",
    meta: "0 из 0",
    status: "pending",
    title: "Оплата поездки",
  },
  {
    canonicalId: "filler",
    id: "filler",
    meta: "0 из 0",
    status: "pending",
    title: "Кто заполнил",
  },
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
    "email",
    "contact-number",
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
    "hotel-country",
    "hotel-city",
    "hotel-postal-code",
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
  compact?: boolean;
  excelMap?: string;
  errorMessage?: string;
  focused?: boolean;
  fullWidth?: boolean;
  hint?: string;
  label: string;
  modelFieldId: string;
  number?: string;
  onBlur?: () => void;
  onChange?: (value: string) => void;
  options?: string[];
  phonePrefix?: "+7" | "+34";
  placeholder?: string;
  readOnly?: boolean;
  reviewSource?: string;
  suggestions?: readonly string[];
  state?: FieldState;
  type?: "email" | "input" | "number" | "tel" | "textarea";
  value: string;
};

type QuestionnaireFieldUiContract = {
  confirmReview: (fieldId: string) => void;
  errorMessage: (fieldId: string, label: string) => string | undefined;
  focused: (fieldId: string) => boolean;
  revealRequiredErrors: boolean;
  required: (fieldId: string) => boolean;
  reviewSource: (fieldId: string, label: string) => string | undefined;
  state: (fieldId: string, label: string) => FieldState;
};

const QuestionnaireFieldUiContext = createContext<QuestionnaireFieldUiContract | null>(
  null,
);

type FigmaQuestionnaireScreenProps = {
  initialFocus?: QuestionnaireInitialFocus;
  onBack: () => void;
  onComplete: (values: QuestionnaireCommitPayload) => void | Promise<void>;
  onConfirmPassportReview?: (applicantId: string) => void | Promise<void>;
  onFieldChange?: (update: QuestionnaireFieldUpdate) => void;
  onMarkIssueFixed?: (issueId: string) => void | Promise<void>;
  onUploadFile?: (fileId: string, file: File) => void | Promise<void>;
  onSaveDraft?: (values: QuestionnaireCommitPayload) => void | Promise<void>;
  submission: Submission;
};

type QuestionnaireCommitPayload = {
  fieldUpdates: QuestionnaireFieldUpdate[];
  focusedUpdate?: QuestionnaireFieldUpdate;
  reviewConfirmations: QuestionnaireReviewConfirmation[];
  saveIntent: QuestionnaireSaveIntent;
  travelEnd: string;
  travelStart: string;
};

type QuestionnaireReviewConfirmation = {
  applicantId: string;
  fieldId: string;
  sectionId: string;
};

type QuestionnaireSaveIntent = "autosave" | "completion" | "manual" | "navigation";

type QuestionnaireSaveWaiter = {
  reject: (reason?: unknown) => void;
  resolve: () => void;
};

type QuestionnaireSaveRequest = {
  payload: QuestionnaireCommitPayload;
  revision: number;
  waiters: QuestionnaireSaveWaiter[];
};

type FamilyCopyPreview = {
  affectedApplicants: number;
  firstTarget?: {
    applicantId: string;
    label?: string;
    sectionId: SectionId;
  };
  updates: QuestionnaireFieldUpdate[];
};

export type QuestionnaireInitialFocus = {
  applicantId?: string;
  fileId?: string;
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

const commonEmailDomains = [
  "gmail.com",
  "yandex.ru",
  "mail.ru",
  "icloud.com",
  "outlook.com",
];

const optionSearchAliases: Record<string, string[]> = {
  "Санкт-Петербург": ["спб", "питер", "санкт петербург"],
  Самара: ["с"],
  "Нижний Новгород": ["нижний", "нн"],
  "Ростов-на-Дону": ["ростов"],
  Екатеринбург: ["екат", "екб"],
  Новосибирск: ["новосиб"],
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

  const localDigits = digits
    .slice(prefixDigits.length)
    .slice(0, prefix === "+7" ? 10 : 9);
  const groups =
    prefix === "+7"
      ? [
          localDigits.slice(0, 3),
          localDigits.slice(3, 6),
          localDigits.slice(6, 8),
          localDigits.slice(8, 10),
        ]
      : [localDigits.slice(0, 3), localDigits.slice(3, 6), localDigits.slice(6, 9)];
  const separator = prefix === "+7" ? [" ", "-", "-"] : [" ", " "];

  return groups.reduce(
    (formatted, group, index) =>
      group
        ? `${formatted}${index === 0 ? " " : separator[index - 1]}${group}`
        : formatted,
    prefix,
  );
}

function normalizeRussianAddress(value: string) {
  return value
    .trim()
    .replace(/(^|[\s,])ул\.?(?=\s|,|$)\s*/giu, "$1улица ")
    .replace(/(^|[\s,])пр(?:-?т)?\.?(?=\s|,|$)\s*/giu, "$1проспект ")
    .replace(/(^|[\s,])д\.?(?=\s|\d|,|$)\s*/giu, "$1дом ")
    .replace(/(^|[\s,])кв\.?(?=\s|\d|,|$)\s*/giu, "$1квартира ")
    .replace(/(^|[\s,])корп\.?(?=\s|\d|,|$)\s*/giu, "$1корпус ")
    .replace(/(^|[\s,])стр\.?(?=\s|\d|,|$)\s*/giu, "$1строение ")
    .replace(/(^|[\s,])оф\.?(?=\s|\d|,|$)\s*/giu, "$1офис ")
    .replace(/\s{2,}/g, " ")
    .trim();
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
  if (type === "email" || label.toLocaleLowerCase("ru-RU").includes("email"))
    return "email";
  if (type === "tel" || label.toLocaleLowerCase("ru-RU").includes("телефон"))
    return "tel";
  if (label === "Фамилия") return "family-name";
  if (label === "Имя") return "given-name";
  if (label.toLocaleLowerCase("ru-RU").includes("адрес")) return "street-address";
  if (label.toLocaleLowerCase("ru-RU").includes("город")) return "address-level2";
  if (label.toLocaleLowerCase("ru-RU").includes("индекс")) return "postal-code";
  return "off";
}

function FormField({
  compact,
  errorMessage,
  focused,
  fullWidth,
  hint,
  label,
  modelFieldId,
  number,
  onBlur,
  onChange,
  options,
  phonePrefix,
  placeholder,
  readOnly,
  reviewSource,
  state = "normal",
  suggestions,
  type = "input",
  value,
}: FormFieldProps) {
  const fieldContract = useContext(QuestionnaireFieldUiContext);
  const [isOpen, setIsOpen] = useState(false);
  const [quickOptionsExpanded, setQuickOptionsExpanded] = useState(() => !value);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [optionQuery, setOptionQuery] = useState("");
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionSearchRef = useRef<HTMLInputElement>(null);
  const optionTriggerRef = useRef<HTMLButtonElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const generatedFieldId = useId();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveOptionIndex(-1);
        setOptionQuery("");
      }
    };

    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const usesQuickOptions = Boolean(options && options.length <= 3);
  const collapsesQuickOptions = Boolean(
    options && options.length === 3 && label !== "Тип принимающей стороны",
  );
  const usesOptionSearch = Boolean(options && options.length > 8);
  const filteredOptions = useMemo(() => {
    if (!options) return [];
    const query = optionQuery.trim().toLocaleLowerCase("ru-RU");
    return query
      ? options.filter((option) => optionMatchesSearch(option, query))
      : options;
  }, [optionQuery, options]);
  const dateField = isDateFieldLabel(label);
  const emailField =
    type === "email" || label.toLocaleLowerCase("ru-RU").includes("email");
  const fieldId = `questionnaire-${generatedFieldId.replace(/:/g, "")}`;
  const fieldLabelId = `${fieldId}-label`;
  const fieldErrorId = `${fieldId}-error`;
  const optionsListboxId = `${fieldId}-options`;
  const suggestionsId = `${fieldId}-suggestions`;
  const fieldEmailSuggestions = useMemo(
    () => (emailField ? emailSuggestions(value) : []),
    [emailField, value],
  );
  const inputSuggestions = useMemo(
    () => (emailField ? fieldEmailSuggestions : (suggestions ?? [])),
    [emailField, fieldEmailSuggestions, suggestions],
  );
  const visibleInputSuggestions = useMemo(() => {
    const query = value.trim().toLocaleLowerCase("ru-RU");
    return inputSuggestions
      .filter((option) => !query || optionMatchesSearch(option, query))
      .slice(0, 10);
  }, [inputSuggestions, value]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveOptionIndex((current) => {
      if (!filteredOptions.length) return -1;
      if (current < 0) return 0;
      return Math.min(current, filteredOptions.length - 1);
    });
  }, [filteredOptions, isOpen]);

  useEffect(() => {
    if (!value) setQuickOptionsExpanded(true);
  }, [value]);

  const canonicalRequired = fieldContract?.required(modelFieldId) ?? false;
  const canonicalFocused = fieldContract?.focused(modelFieldId) ?? focused;
  const canonicalState = fieldContract?.state(modelFieldId, label) ?? state;
  const canonicalReviewSource =
    fieldContract?.reviewSource(modelFieldId, label) ?? reviewSource;
  const canonicalErrorMessage =
    fieldContract?.errorMessage(modelFieldId, label) ?? errorMessage;
  const validationMessage = validateFormFieldValue({
    label,
    required: canonicalRequired,
    type,
    value,
  });
  const isEmptyRequiredField =
    validationMessage === "Обязательное поле" && !value.trim();
  const shouldRevealRequiredError =
    isEmptyRequiredField && Boolean(fieldContract?.revealRequiredErrors);
  const effectiveState: FieldState =
    (validationMessage && (!isEmptyRequiredField || shouldRevealRequiredError)) ||
    canonicalState === "invalid"
      ? "invalid"
      : canonicalState;
  const effectiveErrorMessage =
    canonicalErrorMessage ??
    validationMessage ??
    canonicalReviewSource ??
    "Нужно исправить значение";
  const shouldShowError =
    effectiveState === "invalid" &&
    (!isEmptyRequiredField || Boolean(errorMessage) || shouldRevealRequiredError);
  const baseClasses = "v19-questionnaire-field-control";
  const stateClasses =
    effectiveState === "needs_review"
      ? "is-review"
      : effectiveState === "invalid"
        ? "is-invalid"
        : "is-normal";
  const visibleQuickOptions =
    collapsesQuickOptions && value && !quickOptionsExpanded
      ? options?.filter((option) => option === value)
      : options;
  const activeOptionId =
    isOpen && activeOptionIndex >= 0 && activeOptionIndex < filteredOptions.length
      ? `${optionsListboxId}-option-${activeOptionIndex}`
      : undefined;
  const activeSuggestionId =
    isSuggestionsOpen &&
    activeSuggestionIndex >= 0 &&
    activeSuggestionIndex < visibleInputSuggestions.length
      ? `${suggestionsId}-option-${activeSuggestionIndex}`
      : undefined;

  function closeOptions({ returnFocus = false } = {}) {
    setIsOpen(false);
    setActiveOptionIndex(-1);
    setOptionQuery("");
    if (returnFocus) optionTriggerRef.current?.focus();
  }

  function openOptions(edge: "first" | "last" = "first") {
    setIsOpen(true);
    setActiveOptionIndex(edge === "last" ? Math.max(filteredOptions.length - 1, 0) : 0);
  }

  function selectOptionAt(index: number) {
    const option = filteredOptions[index];
    if (!option) return;
    onChange?.(option);
    closeOptions({ returnFocus: true });
  }

  function moveOptionFocus(direction: 1 | -1) {
    if (!filteredOptions.length) return;
    setActiveOptionIndex((current) => {
      if (current < 0) return direction > 0 ? 0 : filteredOptions.length - 1;
      return (current + direction + filteredOptions.length) % filteredOptions.length;
    });
  }

  function handleOptionKeyboard(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        openOptions(event.key === "ArrowDown" ? "first" : "last");
      } else {
        moveOptionFocus(event.key === "ArrowDown" ? 1 : -1);
      }
      return;
    }

    if (
      event.key === "Home" &&
      isOpen &&
      event.currentTarget === optionTriggerRef.current
    ) {
      event.preventDefault();
      setActiveOptionIndex(0);
      return;
    }

    if (
      event.key === "End" &&
      isOpen &&
      event.currentTarget === optionTriggerRef.current
    ) {
      event.preventDefault();
      setActiveOptionIndex(Math.max(filteredOptions.length - 1, 0));
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && !usesOptionSearch) {
      event.preventDefault();
      if (isOpen) selectOptionAt(activeOptionIndex);
      else openOptions();
      return;
    }

    if (event.key === "Enter" && usesOptionSearch && isOpen) {
      event.preventDefault();
      selectOptionAt(activeOptionIndex);
      return;
    }

    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closeOptions({ returnFocus: true });
    }
  }

  function selectSuggestionAt(index: number) {
    const suggestion = visibleInputSuggestions[index];
    if (!suggestion) return;
    onChange?.(suggestion);
    setIsSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
  }

  function handleSuggestionKeyboard(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!inputSuggestions.length) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsSuggestionsOpen(true);
      setActiveSuggestionIndex((current) => {
        if (!visibleInputSuggestions.length) return -1;
        if (current < 0) {
          return event.key === "ArrowDown" ? 0 : visibleInputSuggestions.length - 1;
        }
        const direction = event.key === "ArrowDown" ? 1 : -1;
        return (
          (current + direction + visibleInputSuggestions.length) %
          visibleInputSuggestions.length
        );
      });
      return;
    }

    if (event.key === "Enter" && isSuggestionsOpen && activeSuggestionIndex >= 0) {
      event.preventDefault();
      selectSuggestionAt(activeSuggestionIndex);
      return;
    }

    if (event.key === "Escape" && isSuggestionsOpen) {
      event.preventDefault();
      setIsSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
    }
  }

  return (
    <div
      data-field-focused={canonicalFocused ? "true" : undefined}
      data-field-label={label}
      className={`flex flex-col gap-1.5 ${
        fullWidth ? "col-span-1 md:col-span-2" : "col-span-1"
      }`}
    >
      <label
        className="flex items-start gap-2 text-[var(--v19b-size-12)] text-white/70 leading-snug"
        htmlFor={usesQuickOptions ? undefined : fieldId}
      >
        {number ? (
          <span className="v19-questionnaire-field-number">{number}</span>
        ) : null}
        <span className="flex-1 mt-[var(--v19b-size-3)]" id={fieldLabelId}>
          {label}
          {canonicalRequired ? (
            <span className="v19-questionnaire-required-mark">*</span>
          ) : null}
        </span>
      </label>

      {options && usesQuickOptions ? (
        <div
          aria-describedby={shouldShowError ? fieldErrorId : undefined}
          aria-invalid={effectiveState === "invalid" ? "true" : undefined}
          aria-labelledby={fieldLabelId}
          aria-required={canonicalRequired ? "true" : undefined}
          className={`v19-questionnaire-quick-options${
            collapsesQuickOptions && value ? " has-selection" : ""
          }${
            collapsesQuickOptions && value && !quickOptionsExpanded
              ? " is-collapsed"
              : ""
          }`}
          role="group"
        >
          {visibleQuickOptions?.map((option) => (
            <button
              aria-expanded={
                collapsesQuickOptions && value === option
                  ? quickOptionsExpanded
                  : undefined
              }
              aria-pressed={value === option}
              className={`v19-questionnaire-field-control v19-questionnaire-quick-option ${
                value === option ? "is-selected" : stateClasses
              }`}
              key={option}
              title={
                collapsesQuickOptions && value === option && !quickOptionsExpanded
                  ? "Изменить выбор"
                  : undefined
              }
              type="button"
              onClick={() => {
                if (collapsesQuickOptions && value === option) {
                  setQuickOptionsExpanded((current) => !current);
                  return;
                }
                onChange?.(option);
                if (collapsesQuickOptions) setQuickOptionsExpanded(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      ) : options ? (
        <div
          className="relative"
          ref={dropdownRef}
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null))
              return;
            closeOptions();
          }}
        >
          <button
            aria-activedescendant={activeOptionId}
            aria-controls={optionsListboxId}
            aria-describedby={shouldShowError ? fieldErrorId : undefined}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-invalid={effectiveState === "invalid" ? "true" : undefined}
            aria-labelledby={fieldLabelId}
            aria-required={canonicalRequired ? "true" : undefined}
            className={`flex items-center justify-between text-left ${baseClasses} ${stateClasses}`}
            id={fieldId}
            ref={optionTriggerRef}
            role="combobox"
            type="button"
            onClick={() => {
              if (isOpen) closeOptions();
              else openOptions();
            }}
            onKeyDown={handleOptionKeyboard}
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
                    aria-activedescendant={activeOptionId}
                    aria-controls={optionsListboxId}
                    aria-label={`Поиск: ${label}`}
                    className="v19-questionnaire-field-control"
                    placeholder="Начните вводить"
                    ref={optionSearchRef}
                    type="search"
                    value={optionQuery}
                    onChange={(event) => {
                      setOptionQuery(event.target.value);
                      setActiveOptionIndex(0);
                    }}
                    onKeyDown={handleOptionKeyboard}
                  />
                ) : null}
                <div id={optionsListboxId} role="listbox">
                  {filteredOptions.map((option, index) => (
                    <button
                      aria-selected={value === option}
                      className={`v19-questionnaire-dropdown-option ${
                        value === option ? "is-selected" : ""
                      } ${activeOptionIndex === index ? "is-active" : ""}`}
                      id={`${optionsListboxId}-option-${index}`}
                      key={option}
                      role="option"
                      tabIndex={-1}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveOptionIndex(index)}
                      onClick={() => selectOptionAt(index)}
                    >
                      {option}
                    </button>
                  ))}
                  {!filteredOptions.length ? (
                    <p className="v19-questionnaire-dropdown-empty">Нет совпадений</p>
                  ) : null}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : type === "textarea" ? (
        <textarea
          aria-describedby={shouldShowError ? fieldErrorId : undefined}
          aria-invalid={effectiveState === "invalid" ? "true" : undefined}
          aria-label={label}
          aria-required={canonicalRequired ? "true" : undefined}
          className={`${baseClasses} is-textarea ${compact ? "is-compact-address" : ""} ${stateClasses}`}
          id={fieldId}
          name={modelFieldId}
          onBlur={onBlur}
          placeholder={placeholder}
          readOnly={readOnly ?? !onChange}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
        />
      ) : (
        <div
          className="relative"
          ref={inputSuggestions.length ? suggestionsRef : undefined}
        >
          <input
            aria-describedby={shouldShowError ? fieldErrorId : undefined}
            aria-invalid={effectiveState === "invalid" ? "true" : undefined}
            aria-label={label}
            aria-required={canonicalRequired ? "true" : undefined}
            aria-activedescendant={activeSuggestionId}
            aria-autocomplete={inputSuggestions.length ? "list" : undefined}
            aria-controls={inputSuggestions.length ? suggestionsId : undefined}
            aria-expanded={inputSuggestions.length ? isSuggestionsOpen : undefined}
            autoComplete={inputAutocomplete(label, type)}
            className={`${baseClasses} ${compact ? "is-compact-address" : ""} ${stateClasses}`}
            inputMode={dateField ? "numeric" : phonePrefix ? "tel" : undefined}
            id={fieldId}
            maxLength={phonePrefix ? (phonePrefix === "+7" ? 17 : 15) : undefined}
            name={modelFieldId}
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
            role={inputSuggestions.length ? "combobox" : undefined}
            type={
              type === "email" || type === "number" || type === "tel" ? type : "text"
            }
            value={value}
            onBlur={(event) => {
              onBlur?.();
              if (suggestionsRef.current?.contains(event.relatedTarget as Node | null))
                return;
              setIsSuggestionsOpen(false);
              setActiveSuggestionIndex(-1);
            }}
            onChange={(event) => {
              const nextValue = phonePrefix
                ? formatPhoneInput(event.target.value, phonePrefix)
                : dateField
                  ? formatDateInput(event.target.value)
                  : event.target.value;
              onChange?.(nextValue);
              if (inputSuggestions.length) {
                setIsSuggestionsOpen(true);
                setActiveSuggestionIndex(0);
              }
            }}
            onFocus={() => {
              if (phonePrefix && !value) onChange?.(phonePrefix);
              if (inputSuggestions.length) {
                setIsSuggestionsOpen(true);
                setActiveSuggestionIndex(0);
              }
            }}
            onKeyDown={handleSuggestionKeyboard}
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
              {visibleInputSuggestions.map((suggestion, index) => (
                <button
                  aria-selected={value === suggestion}
                  className={`v19-questionnaire-dropdown-option ${
                    value === suggestion ? "is-selected" : ""
                  } ${activeSuggestionIndex === index ? "is-active" : ""}`}
                  id={`${suggestionsId}-option-${index}`}
                  key={suggestion}
                  role="option"
                  tabIndex={-1}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveSuggestionIndex(index)}
                  onClick={() => selectSuggestionAt(index)}
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

      {canonicalState === "needs_review" ? (
        <div className="v19-questionnaire-review-confirmation">
          <span>{canonicalReviewSource ?? "Сверьте значение с документом"}</span>
          <button
            aria-label={`Подтвердить поле: ${label}`}
            type="button"
            onClick={() => fieldContract?.confirmReview(modelFieldId)}
          >
            Подтвердить
          </button>
        </div>
      ) : null}

      {shouldShowError ? (
        <div
          className="flex items-start gap-1.5 text-[var(--v19b-size-10-5)] text-white/40 mt-1"
          id={fieldErrorId}
        >
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
    return [
      {
        completed: 0,
        id: "app-1",
        index: 1,
        name: "Иван Петров",
        status: "pending",
        total: 0,
      },
    ];
  }

  return submission.applicants.map((applicant, index) => {
    const formData = questionnaireFormDataFromSubmission(
      submission,
      applicant.id,
    ) as unknown as BlsFormData;
    const fields = applicant.sections.flatMap((section) => section.fields);
    const requiredFields = fields.filter((field) =>
      isBlsQuestionnaireFieldRequired({
        applicantRole: applicant.role,
        field,
        formData,
      }),
    );
    const completedFields = requiredFields.filter((field) =>
      isBlsQuestionnaireFieldReady({
        applicantRole: applicant.role,
        field,
        formData,
      }),
    ).length;
    const completedFiles = requiredQuestionnaireFileTypes.filter((type) =>
      fileIsReadyForQuestionnaire(
        submission.files.find(
          (file) => file.applicantId === applicant.id && file.type === type,
        ),
      ),
    ).length;
    const completed = completedFields + completedFiles;
    const total = requiredFields.length + requiredQuestionnaireFileTypes.length;
    const hasRisk =
      fields.some((field) =>
        isBlsQuestionnaireFieldBlockingIssue({
          applicantRole: applicant.role,
          field,
          formData,
        }),
      ) ||
      submission.issues.some(
        (issue) =>
          issue.status === "open" && issue.target.applicantId === applicant.id,
      );

    return {
      completed,
      id: applicant.id ?? `app-${index + 1}`,
      index: index + 1,
      name:
        applicant.fullName ||
        (index === 0 ? "Иван Петров" : `Заявитель ${index + 1}`),
      status: hasRisk
        ? "issue"
        : total > 0 && completed === total
          ? "complete"
          : "pending",
      total,
    };
  });
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

type QuestionnaireModelField = NonNullable<ReturnType<typeof questionnaireField>>;

const requiredQuestionnaireFileTypes = ["passport_scan", "selfie", "selfie_2"] as const;
type RequiredQuestionnaireFileType = (typeof requiredQuestionnaireFileTypes)[number];

type QuestionnaireBlockerTarget = {
  applicantId: string;
  comment?: string;
  fileId?: string;
  fileType?: RequiredQuestionnaireFileType;
  label?: string;
  reason?: string;
  sectionId: SectionId;
};

const requiredQuestionnaireFileLabels: Record<
  RequiredQuestionnaireFileType,
  string
> = {
  passport_scan: "Загранпаспорт",
  selfie: "Селфи 1",
  selfie_2: "Селфи 2",
};

function requiredQuestionnaireFileTypeForIssue(
  issue: Submission["issues"][number],
): RequiredQuestionnaireFileType | undefined {
  const fileType = issue.target.fileType;
  if (
    fileType === "passport_scan" ||
    fileType === "selfie" ||
    fileType === "selfie_2"
  ) {
    return fileType;
  }

  const target = `${issue.target.field ?? ""}`
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е");
  if (
    target.includes("скан пасп") ||
    target.includes("passport scan") ||
    target.includes("passport_scan")
  ) {
    return "passport_scan";
  }
  if (target.includes("селфи 2") || target.includes("профил")) return "selfie_2";
  if (target.includes("селфи") || target.includes("selfie")) return "selfie";
  return undefined;
}

function questionnaireFileIssue(
  issues: Submission["issues"],
  applicantId: string,
  file: Submission["files"][number] | undefined,
  fileType: RequiredQuestionnaireFileType,
) {
  return issues.find(
    (issue) =>
      (issue.status === "open" || issue.status === "fixed_by_agent") &&
      issue.target.applicantId === applicantId &&
      (file?.linkedIssueId === issue.id ||
        requiredQuestionnaireFileTypeForIssue(issue) === fileType),
  );
}

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

function passportExpiryFromIssueDate(value: string, validityYears = 10) {
  const issuedAt = parseQuestionnaireDate(value);
  if (!issuedAt) return "";

  const expiryYear = issuedAt.getFullYear() + validityYears;
  const month = issuedAt.getMonth();
  const lastDayOfExpiryMonth = new Date(expiryYear, month + 1, 0).getDate();
  const day = Math.min(issuedAt.getDate(), lastDayOfExpiryMonth);

  return [day, month + 1, expiryYear]
    .map((part, index) => (index === 2 ? String(part) : String(part).padStart(2, "0")))
    .join(".");
}

function defaultBirthCountryForDate(value: string) {
  const birthDate = parseQuestionnaireDate(value);
  if (!birthDate) return undefined;
  const ussrDissolution = new Date(1991, 11, 26);
  return birthDate < ussrDissolution ? "USSR" : "Russian Federation";
}

function historicalBirthPlaceForDate(value: string, birthDateValue: string) {
  const birthDate = parseQuestionnaireDate(birthDateValue);
  if (!birthDate || birthDate >= new Date(1991, 8, 6)) return value;

  const normalized = value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/[.-]/g, " ")
    .replace(/\s+/g, " ");
  const saintPetersburgAliases = new Set([
    "санкт петербург",
    "saint petersburg",
    "st petersburg",
    "sankt peterburg",
    "спб",
  ]);
  return saintPetersburgAliases.has(normalized) ? "LENINGRAD" : value;
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
}: {
  label: string;
  required: boolean;
  type?: FormFieldProps["type"];
  value: string;
}) {
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
    return digits.length >= 7 && digits.length <= 18
      ? undefined
      : "Проверьте номер телефона";
  }

  if (normalizedLabel.includes("дата") || normalizedLabel.includes("действител")) {
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
  const requiredButEmpty =
    validationMessage === "Обязательное поле" && !field.value.trim();

  return Boolean(
    (field.error && !(field.error === "Обязательное поле" && !field.value.trim())) ||
    (validationMessage && !requiredButEmpty),
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
  return fileType === "passport_scan"
    ? passportScanUploadFormatLabel
    : selfieUploadFormatLabel;
}

function questionnaireFileStatus(file: Submission["files"][number] | undefined) {
  if (!file) return "Слот файла не создан";
  if (file.status === "needs_replacement") return "Нужна замена";
  if (file.status === "missing") return "Нужно добавить";
  if (
    file.reviewStatus === "replace_required" ||
    file.reviewStatus === "poor_quality"
  ) {
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
  focused,
  issue,
  label,
  onUploadFile,
  submission,
}: {
  description: string;
  file?: Submission["files"][number];
  fileType: RequiredQuestionnaireFileType;
  focused?: boolean;
  issue?: Submission["issues"][number];
  label: string;
  onUploadFile?: (fileId: string, file: File) => void | Promise<void>;
  submission: Submission;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const needsUpload =
    file?.status === "missing" || file?.status === "needs_replacement";
  const canUpload = Boolean(
    file && needsUpload && onUploadFile && canReplaceDocument(submission, file),
  );
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
    <article
      className={`v19-questionnaire-file-slot${focused ? " is-focus-target" : ""}`}
      data-file-focused={focused ? "true" : undefined}
      data-file-id={file?.id}
      data-file-slot={fileType}
      tabIndex={focused ? -1 : undefined}
    >
      <span className="v19-questionnaire-file-icon" aria-hidden="true">
        <FileText />
      </span>
      <span className="v19-questionnaire-file-copy">
        <strong>{label}</strong>
        <span>{fileName || description}</span>
        <small>{fileFormatHint(fileType)}</small>
      </span>
      <span
        className={`v19-questionnaire-file-status ${fileIsReadyForQuestionnaire(file) ? "is-ready" : ""}`}
      >
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
      {issue ? (
        <div
          aria-live={issue.status === "fixed_by_agent" ? "polite" : undefined}
          className={`v19-questionnaire-file-issue${
            issue.status === "fixed_by_agent" ? " is-awaiting" : ""
          }`}
          data-file-issue={issue.id}
          role={issue.status === "open" ? "alert" : "status"}
        >
          <strong>
            {issue.status === "fixed_by_agent"
              ? `Исправление отправлено: ${issue.reason}`
              : `Что исправить: ${issue.reason}`}
          </strong>
          {issue.comment && issue.comment !== issue.reason ? (
            <span>{issue.comment}</span>
          ) : null}
        </div>
      ) : null}
      {uploadError ? (
        <span className="v19-questionnaire-file-error" role="alert">
          {uploadError}
        </span>
      ) : null}
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
      submission.city || fallback.appointmentCity,
    ),
    appointmentNote: submissionFieldValue(
      applicant,
      "appointment-note",
      fallback.appointmentNote,
    ),
    birthCountry: submissionFieldValue(
      applicant,
      "birth-country",
      fallback.birthCountry,
    ),
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
    hotelAddress: submissionFieldValue(
      applicant,
      "hotel-address",
      fallback.hotelAddress,
    ),
    hotelCity: submissionFieldValue(applicant, "hotel-city", fallback.hotelCity),
    hotelContact: submissionFieldValue(
      applicant,
      "hotel-contact",
      fallback.hotelContact,
    ),
    hotelCountry: submissionFieldValue(
      applicant,
      "hotel-country",
      fallback.hotelCountry,
    ),
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
    nationalId: submissionFieldValueAny(
      applicant,
      ["national-id"],
      fallback.nationalId,
    ),
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
    passportNumber: submissionFieldValue(
      applicant,
      "passport-no",
      fallback.passportNumber,
    ),
    passportType: submissionFieldValue(
      applicant,
      "passport-type",
      fallback.passportType,
    ),
    paymentSponsor: submissionFieldValue(
      applicant,
      "cost-covered-by",
      fallback.paymentSponsor,
    ),
    paymentType: submissionFieldValue(
      applicant,
      "means-of-support",
      fallback.paymentType,
    ),
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
    stayDuration: submissionFieldValue(
      applicant,
      "stay-duration",
      fallback.stayDuration,
    ),
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
    fieldId: "appointment-note",
    formKey: "appointmentNote",
    labels: ["Примечание"],
    sectionId: "appointment",
  },
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
  {
    fieldId: "passport-issue-country",
    formKey: "passportIssueCountry",
    sectionId: "passport",
  },
  {
    fieldId: "passport-issue-place",
    formKey: "passportIssuePlace",
    sectionId: "passport",
  },
  {
    fieldId: "eu-relative-details",
    formKey: "euRelativeDetails",
    sectionId: "euRelative",
  },
  { fieldId: "eu-relationship", formKey: "euRelationship", sectionId: "euRelative" },
  { fieldId: "home-address", formKey: "contactAddress", sectionId: "contacts" },
  { fieldId: "email", formKey: "contactEmail", sectionId: "contacts" },
  { fieldId: "contact-number", formKey: "contactPhone", sectionId: "contacts" },
  { fieldId: "home-country", formKey: "homeCountry", sectionId: "contacts" },
  { fieldId: "home-city", formKey: "residenceCity", sectionId: "contacts" },
  { fieldId: "postal-code", formKey: "residencePostalCode", sectionId: "contacts" },
  {
    fieldId: "lives-outside-citizenship",
    formKey: "livesOutsideCitizenship",
    sectionId: "contacts",
  },
  {
    fieldId: "residence-permit-type",
    formKey: "residencePermitType",
    sectionId: "contacts",
  },
  {
    fieldId: "residence-permit-number",
    formKey: "residencePermitNumber",
    sectionId: "contacts",
  },
  {
    fieldId: "residence-permit-valid-until",
    formKey: "residencePermitValidUntil",
    sectionId: "contacts",
  },
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
  {
    fieldId: "previous-biometrics-date",
    formKey: "previousBiometricsDate",
    sectionId: "trip",
  },
  { fieldId: "previous-visa-number", formKey: "previousVisaNumber", sectionId: "trip" },
  { fieldId: "final-entry-permit", formKey: "finalEntryPermit", sectionId: "trip" },
  {
    fieldId: "final-entry-permit-issued-by",
    formKey: "finalEntryPermitIssuedBy",
    sectionId: "trip",
  },
  {
    fieldId: "final-entry-permit-valid-from",
    formKey: "finalEntryPermitValidFrom",
    sectionId: "trip",
  },
  {
    fieldId: "final-entry-permit-valid-to",
    formKey: "finalEntryPermitValidTo",
    sectionId: "trip",
  },
  { fieldId: "inviting-party-type", formKey: "invitingPartyType", sectionId: "hotel" },
  { fieldId: "hotel-name", formKey: "hotelName", sectionId: "hotel" },
  { fieldId: "hotel-address", formKey: "hotelAddress", sectionId: "hotel" },
  { fieldId: "hotel-country", formKey: "hotelCountry", sectionId: "hotel" },
  { fieldId: "hotel-city", formKey: "hotelCity", sectionId: "hotel" },
  { fieldId: "hotel-postal-code", formKey: "hotelPostalCode", sectionId: "hotel" },
  { fieldId: "hotel-email", formKey: "hotelEmail", sectionId: "hotel" },
  { fieldId: "hotel-contact", formKey: "hotelContact", sectionId: "hotel" },
  { fieldId: "company-org-details", formKey: "companyOrgDetails", sectionId: "hotel" },
  {
    fieldId: "company-contact-person",
    formKey: "companyContactPerson",
    sectionId: "hotel",
  },
  { fieldId: "company-phone", formKey: "companyPhone", sectionId: "hotel" },
  { fieldId: "cost-covered-by", formKey: "paymentSponsor", sectionId: "payment" },
  { fieldId: "means-of-support", formKey: "paymentType", sectionId: "payment" },
  {
    fieldId: "sponsor-in-host-fields",
    formKey: "sponsorInHostFields",
    sectionId: "payment",
  },
  { fieldId: "other-sponsor", formKey: "otherSponsor", sectionId: "payment" },
  { fieldId: "sponsor-means", formKey: "sponsorMeans", sectionId: "payment" },
  { fieldId: "form-filler-name", formKey: "formFillerName", sectionId: "filler" },
  { fieldId: "form-filler-contact", formKey: "formFillerContact", sectionId: "filler" },
  { fieldId: "form-filler-phone", formKey: "formFillerPhone", sectionId: "filler" },
];

const questionnaireFieldAliasesByFormKey: Partial<
  Record<keyof QuestionnaireFormData, readonly string[]>
> = {
  previousBiometrics: ["fingerprints-collected"],
  previousBiometricsDate: ["fingerprints-date"],
};

function questionnaireFieldBindingForApplicant(
  applicant: Submission["applicants"][number] | undefined,
  formKey: keyof QuestionnaireFormData,
) {
  const binding = questionnaireFieldBindings.find((item) => item.formKey === formKey);
  if (!binding || !applicant) return binding;

  const candidateIds = [
    binding.fieldId,
    ...(questionnaireFieldAliasesByFormKey[formKey] ?? []),
  ];
  for (const section of applicant.sections) {
    const field = section.fields.find((candidate) => candidateIds.includes(candidate.id));
    if (field) {
      return {
        ...binding,
        fieldId: field.id,
      };
    }
  }

  return binding;
}

function dependentFieldKeysFor(
  key: keyof QuestionnaireFormData,
  value: string,
  applicantRole: Submission["applicants"][number]["role"] | undefined,
  formData: QuestionnaireFormData,
): Array<keyof QuestionnaireFormData> {
  if (key === "livesOutsideCitizenship" && value !== "Да") {
    return [
      "residencePermitType",
      "residencePermitNumber",
      "residencePermitValidUntil",
    ];
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
  // Changing the host type must not discard an already entered company contact.
  // The company-only controls are hidden outside the company type and appear again
  // if the user switches back, so the draft remains recoverable while comparing
  // hotel, private-host, and company options.
  if (
    key === "dob" &&
    !isBlsQuestionnaireMinorApplicant(applicantRole, {
      ...formData,
      dob: value,
    } as unknown as BlsFormData)
  ) {
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
    dependentFieldKeysFor(
      parentKey,
      formData[parentKey],
      applicant?.role,
      formData,
    ).flatMap((fieldKey) => {
      const binding = questionnaireFieldBindingForApplicant(
        applicant,
        fieldKey,
      );
      if (!binding || !questionnaireField(applicant, binding.fieldId)) return [];

      return [
        {
          applicantId,
          fieldId: binding.fieldId,
          sectionId: binding.sectionId,
          value: "",
        } satisfies QuestionnaireFieldUpdate,
      ];
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
    (candidate) =>
      normalizeFocusLabel(candidate).replace(/ё/g, "е") === normalizedTarget,
  );
}

function focusableFieldFor(
  field: string | undefined,
  applicant?: Submission["applicants"][number],
) {
  const explicitTarget = focusableQuestionnaireFields.find(
    (target) =>
      sameFieldLabel(target.fieldId, field) ||
      target.labels.some((label) => sameFieldLabel(label, field)),
  );
  if (explicitTarget) return explicitTarget;

  const binding = questionnaireFieldBindings.find((candidate) =>
    issueFieldMatches(
      candidate.fieldId,
      questionnaireField(applicant, candidate.fieldId)?.label ?? "",
      field,
    ),
  );
  if (!binding) return undefined;

  const section = sectionDefinitions.find(
    (definition) => definition.canonicalId === binding.sectionId,
  );
  if (!section) return undefined;

  const label = questionnaireField(applicant, binding.fieldId)?.label;
  return {
    fieldId: binding.fieldId,
    formKey: binding.formKey,
    labels: [label, ...(questionnaireFieldLabelAliases[binding.fieldId] ?? [])].filter(
      (candidate): candidate is string => Boolean(candidate?.trim()),
    ),
    sectionId: section.id,
  } satisfies FocusableQuestionnaireField;
}

function sectionForFocus(
  focus: QuestionnaireInitialFocus | undefined,
  target: FocusableQuestionnaireField | undefined,
): SectionId {
  if (target) return target.sectionId;
  const section = normalizeFocusLabel(focus?.section);
  if (
    section.includes("файл") ||
    section.includes("медиа") ||
    section.includes("документ")
  )
    return "files";
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

function questionnaireTargetForPassportIssue(issue: PassportGateIssue): {
  applicantId: string;
  label?: string;
  sectionId: SectionId;
} {
  if (issue.code === "passport_not_confirmed") {
    return { applicantId: issue.applicantId, sectionId: "files" };
  }
  if (issue.code === "passport_type_not_ordinary") {
    return {
      applicantId: issue.applicantId,
      label: "Тип документа",
      sectionId: "passport",
    };
  }
  if (issue.code === "passport_issued_after_expiry") {
    return {
      applicantId: issue.applicantId,
      label: "Дата выдачи",
      sectionId: "passport",
    };
  }
  if (
    issue.code === "passport_expired" ||
    issue.code === "passport_expires_before_trip"
  ) {
    return {
      applicantId: issue.applicantId,
      label: "Действителен до",
      sectionId: "passport",
    };
  }

  return {
    applicantId: issue.applicantId,
    label: "Номер паспорта",
    sectionId: "passport",
  };
}

function sectionIdMatches(sectionId: string, canonicalId: string) {
  return sectionId === canonicalId || sectionId.endsWith(`-${canonicalId}`);
}

export function FigmaQuestionnaireScreen({
  initialFocus,
  onBack,
  onComplete,
  onConfirmPassportReview,
  onFieldChange,
  onMarkIssueFixed,
  onUploadFile,
  onSaveDraft,
  submission,
}: FigmaQuestionnaireScreenProps) {
  const [passportReviewPending, setPassportReviewPending] = useState(false);
  const [pendingFieldUpdates, setPendingFieldUpdates] = useState<
    Record<string, QuestionnaireFieldUpdate>
  >({});
  const pendingFieldUpdatesRef = useRef<Record<string, QuestionnaireFieldUpdate>>({});
  const pendingUpdates = useMemo(
    () => Object.values(pendingFieldUpdates),
    [pendingFieldUpdates],
  );
  const draftSubmission = useMemo(
    () => applyQuestionnaireUpdates(submission, pendingUpdates),
    [pendingUpdates, submission],
  );
  const isEditable = canAgentEditSubmissionContent(draftSubmission);
  const applicants = useMemo(() => applicantTabs(draftSubmission), [draftSubmission]);
  const initialApplicantId = initialFocus?.applicantId ?? applicants[0]?.id ?? "app-1";
  const initialFocusApplicant =
    draftSubmission.applicants.find((applicant) => applicant.id === initialApplicantId) ??
    draftSubmission.applicants[0];
  const initialFieldTarget = focusableFieldFor(
    initialFocus?.field,
    initialFocusApplicant,
  );
  const isCorrectionResubmission = draftSubmission.status === "returned";
  const completeActionLabel = isCorrectionResubmission
    ? "Отправить исправления"
    : "Отправить на проверку";
  const completeActionMobileLabel = completeActionLabel;
  const [activeApplicant, setActiveApplicant] = useState(initialApplicantId);
  const [activeSection, setActiveSection] = useState<SectionId>(
    sectionForFocus(initialFocus, initialFieldTarget),
  );
  const [focusedFileTarget, setFocusedFileTarget] = useState<
    Pick<QuestionnaireBlockerTarget, "fileId" | "fileType"> | undefined
  >(() =>
    initialFocus?.fileId ? { fileId: initialFocus.fileId } : undefined,
  );
  const [euRelativeApplicantIds, setEuRelativeApplicantIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showPreviousSurnameForMale, setShowPreviousSurnameForMale] = useState(false);
  const [fieldSearchQuery, setFieldSearchQuery] = useState("");
  const [familyCopyMessage, setFamilyCopyMessage] = useState<string>();
  const [familyCopyPreview, setFamilyCopyPreview] =
    useState<FamilyCopyPreview>();
  const [lastFamilyCopyTarget, setLastFamilyCopyTarget] =
    useState<FamilyCopyPreview["firstTarget"]>();
  const [revealRequiredErrors, setRevealRequiredErrors] = useState(false);
  const [issueResolutionError, setIssueResolutionError] = useState("");
  const [pendingIssueResolutionId, setPendingIssueResolutionId] = useState<
    string | null
  >(null);
  const [saveMessage, setSaveMessage] = useState("Изменений нет");
  const [saveStatus, setSaveStatus] = useState<
    "dirty" | "error" | "idle" | "saved" | "saving"
  >("idle");
  const familyCopyStatusId = useId();
  const prefersReducedMotion = useReducedMotion();
  const autosaveRevisionRef = useRef(0);
  const autosaveTimerRef = useRef<number | undefined>(undefined);
  const completionInFlightRef = useRef(false);
  const issueResolutionPendingRef = useRef(false);
  const inFlightSaveRef = useRef<QuestionnaireSaveRequest | undefined>(undefined);
  const queuedSaveRef = useRef<QuestionnaireSaveRequest | undefined>(undefined);
  const onSaveDraftRef = useRef(onSaveDraft);
  const canSaveDraft = Boolean(onSaveDraft);
  const initialFocusAppliedRef = useRef(false);
  const saveRequestRunnerRef = useRef<(request: QuestionnaireSaveRequest) => void>(
    () => undefined,
  );
  const baseFormData = useMemo(
    () => questionnaireFormDataFromSubmission(submission, activeApplicant),
    [activeApplicant, submission],
  );
  const sourceFormData = useMemo(
    () => questionnaireFormDataFromSubmission(draftSubmission, activeApplicant),
    [activeApplicant, draftSubmission],
  );
  const [formData, setFormData] = useState<QuestionnaireFormData>(() => sourceFormData);
  const screenRef = useRef<HTMLDivElement>(null);
  const activeApplicantTabRef = useRef<HTMLButtonElement>(null);
  const activePinnedSectionTabRef = useRef<HTMLButtonElement>(null);
  const activeSidebarSectionTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    pendingFieldUpdatesRef.current = {};
    setPendingFieldUpdates({});
    setFamilyCopyMessage(undefined);
    setFamilyCopyPreview(undefined);
    setLastFamilyCopyTarget(undefined);
    setRevealRequiredErrors(false);
    setSaveStatus("idle");
    setSaveMessage("Изменений нет");
  }, [submission.id]);

  useEffect(() => {
    onSaveDraftRef.current = onSaveDraft;
  }, [onSaveDraft]);

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

  useEffect(() => {
    activeApplicantTabRef.current?.scrollIntoView?.({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeApplicant]);

  useEffect(() => {
    setFocusedFileTarget(
      initialFocus?.fileId ? { fileId: initialFocus.fileId } : undefined,
    );
  }, [initialFocus?.fileId, initialFocus?.section]);

  useEffect(() => {
    for (const element of [
      activePinnedSectionTabRef.current,
      activeSidebarSectionTabRef.current,
    ]) {
      element?.scrollIntoView?.({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeSection]);

  const activeApplicantModel = useMemo(
    () =>
      draftSubmission.applicants.find(
        (applicant) => applicant.id === activeApplicant,
      ) ?? draftSubmission.applicants[0],
    [activeApplicant, draftSubmission.applicants],
  );

  useEffect(() => {
    if (initialFocusAppliedRef.current) return;
    let attempt = 0;
    let timer: number | undefined;
    const applyInitialFocus = () => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement !== document.body &&
        screenRef.current?.contains(activeElement)
      ) {
        initialFocusAppliedRef.current = true;
        return;
      }
      const fieldLabel = initialFieldTarget
        ? (questionnaireField(activeApplicantModel, initialFieldTarget.fieldId)?.label ??
          initialFieldTarget.labels[0])
        : undefined;
      const focusedFile = screenRef.current?.querySelector<HTMLElement>(
        '[data-file-focused="true"]',
      );
      if (focusedFile) {
        focusedFile.focus({ preventScroll: true });
        focusedFile.scrollIntoView?.({ behavior: "smooth", block: "center" });
        initialFocusAppliedRef.current = true;
        return;
      }
      if (fieldLabel) {
        const element =
          screenRef.current?.querySelector<HTMLElement>('[data-field-focused="true"]') ??
          screenRef.current?.querySelector<HTMLElement>(
            `[data-field-label="${CSS.escape(fieldLabel)}"]`,
          );
        const target = element?.querySelector<HTMLElement>(
          "input, textarea, button, [tabindex]",
        );
        if (target) {
          target.focus({ preventScroll: true });
          element?.scrollIntoView?.({ behavior: "smooth", block: "center" });
          initialFocusAppliedRef.current = true;
          return;
        }
      }

      if (attempt < 4) {
        attempt += 1;
        timer = window.setTimeout(applyInitialFocus, 16);
        return;
      }

      screenRef.current
        ?.querySelector<HTMLButtonElement>('button[aria-label="Назад"]')
        ?.focus({ preventScroll: true });
      initialFocusAppliedRef.current = true;
    };

    timer = window.setTimeout(applyInitialFocus, 0);

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [activeApplicantModel, activeSection, initialFieldTarget]);

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
      category: submissionFieldOptions(activeApplicantModel, "category", [
        "Premium",
        "Normal",
      ]),
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
      occupation: submissionFieldOptions(
        activeApplicantModel,
        "occupation",
        BLS_OCCUPATION_OPTIONS,
      ),
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

  const activeBlockingIssues = useMemo(
    () =>
      draftSubmission.issues.filter(
        (issue) =>
          (issue.status === "open" || issue.status === "fixed_by_agent") &&
          issue.target.applicantId === activeApplicant,
      ),
    [activeApplicant, draftSubmission.issues],
  );
  const activeBlockingFieldIssues = useMemo(
    () => activeBlockingIssues.filter((issue) => issue.target.field),
    [activeBlockingIssues],
  );
  const openFieldIssues = useMemo(
    () => activeBlockingFieldIssues.filter((issue) => issue.status === "open"),
    [activeBlockingFieldIssues],
  );

  const readinessStats = useMemo(() => {
    const fieldSlots = draftSubmission.applicants.flatMap((applicant) => {
      const applicantFormData = questionnaireFormDataFromSubmission(
        draftSubmission,
        applicant.id,
      ) as unknown as BlsFormData;
      return applicant.sections.flatMap((section) =>
        section.fields.map((field) => ({
          applicant,
          field,
          formData: applicantFormData,
        })),
      );
    });
    const requiredFields = fieldSlots.filter((slot) =>
      isBlsQuestionnaireFieldRequired({
        applicantRole: slot.applicant.role,
        field: slot.field,
        formData: slot.formData,
      }),
    );
    const completedFields = requiredFields.filter((slot) =>
      isBlsQuestionnaireFieldReady({
        applicantRole: slot.applicant.role,
        field: slot.field,
        formData: slot.formData,
      }),
    );
    const validationRisks = fieldSlots.filter((slot) =>
      isBlsQuestionnaireFieldBlockingIssue({
        applicantRole: slot.applicant.role,
        field: slot.field,
        formData: slot.formData,
      }),
    ).length;
    const openIssueRisks = draftSubmission.issues.filter(
      (issue) => issue.status === "open",
    ).length;
    const passportRisks = passportGateIssues(draftSubmission);
    const completionDecision = agentQuestionnaireCompletionDecision(draftSubmission);
    const requiredFileSlots = draftSubmission.applicants.flatMap((applicant) =>
      requiredQuestionnaireFileTypes.map((type) => ({
        applicantId: applicant.id,
        type,
      })),
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
    const risks = validationRisks + openIssueRisks + passportRisks.length;

    return {
      canSubmit: completionDecision.ok,
      completionReason: completionDecision.reason,
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
                    (file) =>
                      file.applicantId === activeApplicantModel.id &&
                      file.type === type,
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

          const activeFormData = questionnaireFormDataFromSubmission(
            draftSubmission,
            activeApplicantModel.id,
          ) as unknown as BlsFormData;
          const requiredFields = sourceSection.fields.filter((field) =>
            isBlsQuestionnaireFieldRequired({
              applicantRole: activeApplicantModel.role,
              field,
              formData: activeFormData,
            }),
          );
          const total = requiredFields.length;
          const completed = requiredFields.filter((field) =>
            isBlsQuestionnaireFieldReady({
              applicantRole: activeApplicantModel.role,
              field,
              formData: activeFormData,
            }),
          ).length;
          const hasRisk = sourceSection.fields.some((field) =>
            isBlsQuestionnaireFieldBlockingIssue({
              applicantRole: activeApplicantModel.role,
              field,
              formData: activeFormData,
            }),
          );

          return {
            ...definition,
            meta: `${completed} из ${total}`,
            status: hasRisk
              ? "issue"
              : total > 0 && completed === total
                ? "complete"
                : "pending",
          } satisfies SectionTab & { id: SectionId };
        }),
    [activeApplicantModel, draftSubmission, showEuRelativeSection],
  );
  const activeApplicantContext = applicants.find(
    (applicant) => applicant.id === activeApplicant,
  );
  const activeSectionContext = sections.find((section) => section.id === activeSection);
  const showResidencePermitFields = formData.livesOutsideCitizenship === "Да";
  const showPurposeDetails = formData.stayPurpose === "OTHER";
  const showPreviousBiometricsDetails = formData.previousBiometrics === "Да";
  const showPreviousSurname =
    formData.sex !== "Мужской" ||
    Boolean(formData.previousSurname.trim()) ||
    showPreviousSurnameForMale;
  const showSponsorFields = formData.paymentSponsor === "Спонсор";
  const showGuardianInfo =
    isBlsQuestionnaireMinorApplicant(
      activeApplicantModel?.role,
      formData as unknown as BlsFormData,
    ) || Boolean(formData.guardianInfo.trim());
  const showCompanyInviteFields = isBlsQuestionnaireInvitingCompanySelected(formData);
  const primaryApplicant = draftSubmission.applicants[0];
  const canCopyFamilyWide =
    draftSubmission.type === "family" &&
    Boolean(primaryApplicant) &&
    draftSubmission.applicants.length > 1;

  const currentSectionIssue = useMemo(() => {
    const currentSection = sections.find((section) => section.id === activeSection);
    if (!currentSection) return undefined;
    const currentCanonicalSection = sectionDefinitions.find(
      (definition) => definition.id === activeSection,
    )?.canonicalId;

    return activeBlockingIssues.find((issue) => {
      const issueFileType = requiredQuestionnaireFileTypeForIssue(issue);
      if (
        currentSection.id === "files" &&
        (issue.type === "file" ||
          issue.type === "media" ||
          Boolean(issueFileType) ||
          sectionForFocus({ section: issue.target.section }, undefined) === "files")
      ) {
        return true;
      }
      if (!issue.target.field) return false;
      if (issue.target.section === currentSection.title) return true;

      return questionnaireFieldBindings
        .filter((binding) => binding.sectionId === currentCanonicalSection)
        .some((binding) => {
          const field = questionnaireField(activeApplicantModel, binding.fieldId);
          return issueFieldMatches(
            binding.fieldId,
            field?.label ?? issue.target.field ?? "",
            issue.target.field,
          );
        });
    });
  }, [activeApplicantModel, activeBlockingIssues, activeSection, sections]);

  const clearAutosaveTimer = useCallback(() => {
    if (autosaveTimerRef.current === undefined) return;
    window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = undefined;
  }, []);

  const replacePendingFieldUpdates = useCallback(
    (next: Record<string, QuestionnaireFieldUpdate>) => {
      pendingFieldUpdatesRef.current = next;
      setPendingFieldUpdates(next);
    },
    [],
  );

  function updateDirtyState(next: Record<string, QuestionnaireFieldUpdate>) {
    autosaveRevisionRef.current += 1;
    if (Object.keys(next).length > 0) {
      setSaveStatus("dirty");
      setSaveMessage("Есть несохранённые изменения");
      return;
    }

    clearAutosaveTimer();
    setSaveStatus("idle");
    setSaveMessage("Изменений нет");
  }

  function updateField(key: keyof QuestionnaireFormData, value: string) {
    if (!isEditable || completionInFlightRef.current) return;
    const dependentKeys = dependentFieldKeysFor(
      key,
      value,
      activeApplicantModel?.role,
      formData,
    );
    const buildUpdate = (fieldKey: keyof QuestionnaireFormData, fieldValue: string) => {
      const binding = questionnaireFieldBindingForApplicant(
        activeApplicantModel,
        fieldKey,
      );
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
          reviewOriginSource:
            modelField?.reviewOriginSource ?? modelField?.reviewSource,
          reviewSource:
            modelField?.reviewState === "needs_review" ? "manual" : undefined,
          reviewState:
            modelField?.reviewState === "needs_review" ? "confirmed" : undefined,
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

    if (updates.length) {
      const next = { ...pendingFieldUpdatesRef.current };
      for (const { binding, update } of updates) {
        const updateKey = questionnaireUpdateKey(update);
        const baseApplicant = submission.applicants.find(
          (applicant) => applicant.id === update.applicantId,
        );
        const confirmsPendingReview =
          update.reviewState === "confirmed" &&
          questionnaireField(baseApplicant, update.fieldId)?.reviewState === "needs_review";
        if (update.value === baseFormData[binding.formKey] && !confirmsPendingReview) {
          delete next[updateKey];
        } else {
          next[updateKey] = update;
        }
      }
      replacePendingFieldUpdates(next);
      updateDirtyState(next);
    }

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

  function applyPassportValidityYears(validityYears: 5 | 10) {
    const expiry = passportExpiryFromIssueDate(
      formData.passportIssued,
      validityYears,
    );
    if (expiry) updateField("passportExpiry", expiry);
  }

  function updateBirthDate(value: string) {
    const suggestedBirthCountry = defaultBirthCountryForDate(value);
    const birthCountryIsUntouchedDefault =
      formData.birthCountry === baseFormData.birthCountry &&
      ["", "USSR", "Russian Federation"].includes(baseFormData.birthCountry);

    updateField("dob", value);
    if (suggestedBirthCountry && birthCountryIsUntouchedDefault) {
      updateField("birthCountry", suggestedBirthCountry);
    }
  }

  function normalizeBirthPlaceField() {
    const normalized = historicalBirthPlaceForDate(
      formData.birthPlace,
      formData.dob,
    );
    if (normalized !== formData.birthPlace) updateField("birthPlace", normalized);
  }

  function updateTravelDate(key: "travelStart" | "travelEnd", value: string) {
    const travelStart = key === "travelStart" ? value : formData.travelStart;
    const travelEnd = key === "travelEnd" ? value : formData.travelEnd;

    updateField(key, value);
    updateField(
      "stayDuration",
      blsStayDurationFromDates(travelStart, travelEnd),
    );
  }

  function normalizeAddressField(key: "contactAddress" | "employerAddress") {
    const normalized = normalizeRussianAddress(formData[key]);
    if (normalized !== formData[key]) updateField(key, normalized);
  }

  function copySharedDataToFamily() {
    if (
      !isEditable ||
      completionInFlightRef.current ||
      !primaryApplicant ||
      !canCopyFamilyWide
    ) {
      return;
    }

    const allowlistedFields = (
      Object.keys(familySharedFieldIds) as SectionId[]
    ).flatMap((sectionId) => {
      const canonicalSectionId = sectionDefinitions.find(
        (definition) => definition.id === sectionId,
      )?.canonicalId;
      if (!canonicalSectionId) return [];

      return (familySharedFieldIds[sectionId] ?? []).map((fieldId) => ({
        canonicalSectionId,
        fieldId,
      }));
    });
    const updates = draftSubmission.applicants.slice(1).flatMap((applicant) =>
      allowlistedFields.flatMap(({ canonicalSectionId, fieldId }) => {
        const sourceField = questionnaireField(primaryApplicant, fieldId);
        const targetField = questionnaireField(applicant, fieldId);
        const binding = questionnaireFieldBindings.find(
          (item) => item.fieldId === fieldId,
        );
        if (
          !sourceField?.value.trim() ||
          !targetField ||
          targetField.value.trim() ||
          !binding ||
          binding.sectionId !== canonicalSectionId
        ) {
          return [];
        }

        return [
          {
            applicantId: applicant.id,
            error: validationMessageForQuestionnaireField(
              targetField,
              sourceField.value,
            ),
            fieldId,
            reviewOriginSource: "family_shared" as const,
            reviewSource: "family_shared" as const,
            reviewState: "confirmed" as const,
            sectionId: binding.sectionId,
            value: sourceField.value,
          } satisfies QuestionnaireFieldUpdate,
        ];
      }),
    );
    if (!updates.length) {
      setFamilyCopyMessage(
        "Общие поля уже заполнены или у первого заявителя нет данных для копирования.",
      );
      return;
    }

    const affectedApplicants = new Set(updates.map((update) => update.applicantId)).size;
    const firstUpdate = updates[0];
    const firstTarget = firstUpdate
      ? {
          applicantId: firstUpdate.applicantId,
          label: questionnaireField(
            draftSubmission.applicants.find(
              (applicant) => applicant.id === firstUpdate.applicantId,
            ),
            firstUpdate.fieldId,
          )?.label,
          sectionId: sectionIdForQuestionnaireField(
            firstUpdate.sectionId,
            firstUpdate.fieldId,
          ),
        }
      : undefined;
    setFamilyCopyPreview({ affectedApplicants, firstTarget, updates });
    setFamilyCopyMessage(
      `Предпросмотр: ${updates.length} пустых полей у ${affectedApplicants} заявителей. Заполненные значения и личные/паспортные данные не изменятся.`,
    );
  }

  function confirmFamilyCopy() {
    if (!familyCopyPreview || !isEditable) return;
    const next = { ...pendingFieldUpdatesRef.current };
    for (const update of familyCopyPreview.updates) {
      next[questionnaireUpdateKey(update)] = update;
      onFieldChange?.(update);
    }
    replacePendingFieldUpdates(next);
    updateDirtyState(next);
    setLastFamilyCopyTarget(familyCopyPreview.firstTarget);
    setFamilyCopyMessage(
      `Скопировано и подтверждено после предпросмотра: ${familyCopyPreview.updates.length} полей · заявителей: ${familyCopyPreview.affectedApplicants}.`,
    );
    setFamilyCopyPreview(undefined);
  }

  function cancelFamilyCopy() {
    setFamilyCopyPreview(undefined);
    setFamilyCopyMessage("Копирование отменено; данные не изменены.");
  }

  function reviewLastFamilyCopy() {
    if (lastFamilyCopyTarget) focusQuestionnaireTarget(lastFamilyCopyTarget);
  }

  function fieldIssue(fieldId: string, label: string) {
    return openFieldIssues.find((issue) =>
      issueFieldMatches(fieldId, label, issue.target.field),
    );
  }

  function fieldReviewState(fieldId: string, label: string): FieldState {
    if (fieldIssue(fieldId, label)) return "invalid";

    const field = questionnaireField(activeApplicantModel, fieldId);
    const validationMessage = field
      ? validateBlsQuestionnaireField({
          applicantRole: activeApplicantModel?.role,
          field,
          formData: formData as unknown as BlsFormData,
        })
      : undefined;
    if (
      validationMessage &&
      (field?.value.trim() || validationMessage !== "Обязательное поле")
    ) {
      return "invalid";
    }
    if (field && hasActionableFieldProblem(field)) return "invalid";
    if (field?.reviewState === "needs_review") return "needs_review";

    return "normal";
  }

  function fieldIsRequired(fieldId: string) {
    const field = questionnaireField(activeApplicantModel, fieldId);
    if (!field) return false;

    return isBlsQuestionnaireFieldRequired({
      applicantRole: activeApplicantModel?.role,
      field,
      formData: formData as unknown as BlsFormData,
    });
  }

  function confirmFieldReview(fieldId: string) {
    if (!isEditable || completionInFlightRef.current) return;
    const field = questionnaireField(activeApplicantModel, fieldId);
    const binding = questionnaireFieldBindings.find((item) => item.fieldId === fieldId);
    if (!field || !binding || field.reviewState !== "needs_review") return;

    const update = {
      applicantId: activeApplicant,
      error: validateBlsQuestionnaireField({
        applicantRole: activeApplicantModel?.role,
        field,
        formData: formData as unknown as BlsFormData,
      }),
      fieldId,
      reviewOriginSource: field.reviewOriginSource ?? field.reviewSource,
      reviewSource: "manual" as const,
      reviewState: "confirmed" as const,
      sectionId: binding.sectionId,
      value: field.value,
    } satisfies QuestionnaireFieldUpdate;
    const next = {
      ...pendingFieldUpdatesRef.current,
      [questionnaireUpdateKey(update)]: update,
    };
    replacePendingFieldUpdates(next);
    updateDirtyState(next);
    onFieldChange?.(update);
  }

  function openEuRelativeSection() {
    if (!isEditable) return;
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
    return (
      field?.error ??
      (field
        ? (validateBlsQuestionnaireField({
            applicantRole: activeApplicantModel?.role,
            field,
            formData: formData as unknown as BlsFormData,
          }) ?? validationMessageForQuestionnaireField(field, field.value))
        : undefined)
    );
  }

  function fieldReviewSource(fieldId: string, label: string) {
    if (fieldReviewState(fieldId, label) !== "needs_review") return undefined;
    const field = questionnaireField(activeApplicantModel, fieldId);
    const source = field?.reviewOriginSource ?? field?.reviewSource;
    if (source === "family_shared") {
      return "скопировано из анкеты основного заявителя — проверьте";
    }
    if (source === "passport_ocr") return "требует сверки OCR";
    if (source === "pdf_reconciliation") return "требует сверки с PDF";
    return source ? "требует ручной проверки" : undefined;
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
    if (
      !initialFieldTarget ||
      focusedApplicantId === undefined ||
      focusedApplicantId !== activeApplicant
    ) {
      return undefined;
    }

    const focusedField = questionnaireField(
      activeApplicantModel,
      initialFieldTarget.fieldId,
    );
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
  }, [
    activeApplicant,
    activeApplicantModel,
    focusedApplicantId,
    formData,
    initialFieldTarget,
  ]);

  const completionPayload = useCallback(
    (saveIntent: QuestionnaireSaveIntent): QuestionnaireCommitPayload => {
    const conditionalClears = conditionalFieldClearsFor(
      activeApplicantModel,
      activeApplicant,
      formData,
    );
    const updates = new Map<string, QuestionnaireFieldUpdate>();
    for (const update of [
      ...Object.values(pendingFieldUpdates),
      ...conditionalClears,
    ]) {
      updates.set(questionnaireUpdateKey(update), update);
    }

    const fieldUpdates = [...updates.values()];
    return {
      fieldUpdates,
      focusedUpdate: focusedUpdatePayload,
      reviewConfirmations: fieldUpdates
        .filter((update) => update.reviewState === "confirmed")
        .map((update) => ({
          applicantId: update.applicantId,
          fieldId: update.fieldId,
          sectionId: update.sectionId,
        })),
      saveIntent,
      travelEnd: formData.travelEnd,
      travelStart: formData.travelStart,
    };
    },
    [
      activeApplicant,
      activeApplicantModel,
      focusedUpdatePayload,
      formData,
      pendingFieldUpdates,
    ],
  );

  const searchMatches = useMemo(() => {
    const query = fieldSearchQuery.trim().toLocaleLowerCase("ru-RU");
    if (!query) return [];

    return draftSubmission.applicants.flatMap((applicant) =>
      applicant.sections.flatMap((section) =>
        section.fields
          .filter((field) =>
            [field.id, field.label, field.value].some((value) =>
              value.toLocaleLowerCase("ru-RU").includes(query),
            ),
          )
          .map((field) => ({
            applicantId: applicant.id,
            label: field.label,
            sectionId: sectionIdForQuestionnaireField(section.id, field.id),
          })),
      ),
    );
  }, [draftSubmission.applicants, fieldSearchQuery]);

  const runSaveRequest = useCallback(
    async (request: QuestionnaireSaveRequest) => {
      inFlightSaveRef.current = request;
      if (autosaveRevisionRef.current === request.revision) {
        setSaveStatus("saving");
        setSaveMessage("Сохраняем...");
      }

      try {
        await onSaveDraftRef.current?.(request.payload);
        if (autosaveRevisionRef.current === request.revision) {
          clearAutosaveTimer();
          replacePendingFieldUpdates({});
          setSaveStatus("saved");
          setSaveMessage("Сохранено");
        }
        for (const waiter of request.waiters) waiter.resolve();
      } catch (error) {
        if (autosaveRevisionRef.current === request.revision) {
          setSaveStatus("error");
          setSaveMessage(
            error instanceof Error ? error.message : "Не удалось сохранить анкету",
          );
        }
        for (const waiter of request.waiters) waiter.reject(error);
      } finally {
        inFlightSaveRef.current = undefined;
        const nextRequest = queuedSaveRef.current;
        queuedSaveRef.current = undefined;
        if (nextRequest) saveRequestRunnerRef.current(nextRequest);
      }
    },
    [clearAutosaveTimer, replacePendingFieldUpdates],
  );
  saveRequestRunnerRef.current = (request) => {
    void runSaveRequest(request);
  };

  const enqueueDraftSave = useCallback(
    (payload: QuestionnaireCommitPayload, revision: number) =>
      new Promise<void>((resolve, reject) => {
        const waiter = { reject, resolve } satisfies QuestionnaireSaveWaiter;
        const inFlight = inFlightSaveRef.current;
        if (inFlight?.revision === revision) {
          inFlight.waiters.push(waiter);
          return;
        }

        const queued = queuedSaveRef.current;
        if (queued) {
          queuedSaveRef.current = {
            payload,
            revision,
            waiters: [...queued.waiters, waiter],
          };
          return;
        }

        const request = { payload, revision, waiters: [waiter] };
        if (inFlight) {
          queuedSaveRef.current = request;
          return;
        }

        saveRequestRunnerRef.current(request);
      }),
    [],
  );

  useEffect(() => {
    clearAutosaveTimer();
    if (!pendingUpdates.length || !canSaveDraft) return;
    const revision = autosaveRevisionRef.current;
    const payload = completionPayload("autosave");
    const timer = window.setTimeout(() => {
      if (autosaveTimerRef.current === timer) autosaveTimerRef.current = undefined;
      void enqueueDraftSave(payload, revision).catch(() => undefined);
    }, 900);
    autosaveTimerRef.current = timer;

    return () => {
      if (autosaveTimerRef.current !== timer) return;
      window.clearTimeout(timer);
      autosaveTimerRef.current = undefined;
    };
  }, [
    clearAutosaveTimer,
    canSaveDraft,
    completionPayload,
    enqueueDraftSave,
    pendingUpdates.length,
  ]);

  useEffect(() => {
    if (!pendingUpdates.length) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [pendingUpdates.length]);

  useEffect(() => {
    if (!pendingUpdates.length || !onSaveDraft) return;

    const flushPendingWork = () => {
      clearAutosaveTimer();
      const revision = autosaveRevisionRef.current;
      void enqueueDraftSave(completionPayload("autosave"), revision).catch(
        () => undefined,
      );
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushPendingWork();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", flushPendingWork);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flushPendingWork);
    };
  }, [
    clearAutosaveTimer,
    completionPayload,
    enqueueDraftSave,
    onSaveDraft,
    pendingUpdates.length,
  ]);

  function sectionIdForQuestionnaireField(
    sectionId: string,
    fieldId: string,
  ): SectionId {
    const binding = questionnaireFieldBindings.find((item) => item.fieldId === fieldId);
    const bindingSection = binding
      ? sectionDefinitions.find(
          (definition) => definition.canonicalId === binding.sectionId,
        )
      : undefined;
    if (bindingSection) return bindingSection.id;

    const section = sectionDefinitions.find((definition) =>
      sectionIdMatches(sectionId, definition.canonicalId),
    );
    return section?.id ?? "personal";
  }

  function focusFieldLabel(label: string | undefined) {
    if (!label) return;
    window.setTimeout(() => {
      const element = screenRef.current?.querySelector<HTMLElement>(
        `[data-field-label="${CSS.escape(label)}"]`,
      );
      const target = element?.querySelector<HTMLElement>(
        "input, textarea, button, [tabindex]",
      );
      target?.focus({ preventScroll: true });
      element?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    }, 0);
  }

  function focusFileTarget(
    fileId: string | undefined,
    fileType: RequiredQuestionnaireFileType | undefined,
  ) {
    if (!fileId && !fileType) return;
    setFocusedFileTarget({ fileId, fileType });

    let attempt = 0;
    const applyFocus = () => {
      const byId = fileId
        ? screenRef.current?.querySelector<HTMLElement>(
            `[data-file-id="${CSS.escape(fileId)}"]`,
          )
        : undefined;
      const slot =
        byId ??
        (fileType
          ? screenRef.current?.querySelector<HTMLElement>(
              `[data-file-slot="${fileType}"]`,
            )
          : undefined);
      if (slot) {
        slot.focus({ preventScroll: true });
        slot.scrollIntoView?.({ behavior: "smooth", block: "center" });
        return;
      }
      if (attempt < 4) {
        attempt += 1;
        window.setTimeout(applyFocus, 16);
      }
    };

    window.setTimeout(applyFocus, 0);
  }

  function focusQuestionnaireTarget(target: QuestionnaireBlockerTarget) {
    setActiveApplicant(target.applicantId);
    setActiveSection(target.sectionId);
    if (target.sectionId === "files" && (target.fileId || target.fileType)) {
      focusFileTarget(target.fileId, target.fileType);
      return;
    }
    setFocusedFileTarget(undefined);
    focusFieldLabel(target.label);
  }

  function focusFirstSearchMatch() {
    const target = searchMatches[0];
    if (!target) return;
    focusQuestionnaireTarget(target);
  }

  function firstQuestionnaireBlockerTarget(
    applicantId?: string,
  ): QuestionnaireBlockerTarget | undefined {
    const scopedApplicants = applicantId
      ? draftSubmission.applicants.filter((applicant) => applicant.id === applicantId)
      : draftSubmission.applicants;
    const fieldSlots = scopedApplicants.flatMap((applicant) => {
      const applicantFormData = questionnaireFormDataFromSubmission(
        draftSubmission,
        applicant.id,
      ) as unknown as BlsFormData;

      return applicant.sections.flatMap((section) =>
        section.fields.map((field) => ({
          applicant,
          field,
          formData: applicantFormData,
          section,
        })),
      );
    });
    const validationRisk = fieldSlots.find((slot) =>
      isBlsQuestionnaireFieldBlockingIssue({
        applicantRole: slot.applicant.role,
        field: slot.field,
        formData: slot.formData,
      }),
    );
    if (validationRisk) {
      return {
        applicantId: validationRisk.applicant.id,
        label: validationRisk.field.label,
        reason:
          validateBlsQuestionnaireField({
            applicantRole: validationRisk.applicant.role,
            field: validationRisk.field,
            formData: validationRisk.formData,
          }) ?? "Исправьте значение поля",
        sectionId: sectionIdForQuestionnaireField(
          validationRisk.section.id,
          validationRisk.field.id,
        ),
      };
    }

    const requiredEmpty = fieldSlots.find(
      (slot) =>
        !slot.field.value.trim() &&
        isBlsQuestionnaireFieldRequired({
          applicantRole: slot.applicant.role,
          field: slot.field,
          formData: slot.formData,
        }),
    );
    if (requiredEmpty) {
      const quickOptions = requiredEmpty.field.options?.filter((option) =>
        option.trim(),
      );
      return {
        applicantId: requiredEmpty.applicant.id,
        label: requiredEmpty.field.label,
        reason:
          quickOptions && quickOptions.length >= 2 && quickOptions.length <= 3
            ? `Выберите ${quickOptions.map((option) => `«${option}»`).join(" или ")}`
            : "Заполните обязательное поле",
        sectionId: sectionIdForQuestionnaireField(
          requiredEmpty.section.id,
          requiredEmpty.field.id,
        ),
      };
    }

    for (const applicant of scopedApplicants) {
      for (const fileType of requiredQuestionnaireFileTypes) {
        const file = draftSubmission.files.find(
          (candidate) =>
            candidate.applicantId === applicant.id && candidate.type === fileType,
        );
        if (!fileIsReadyForQuestionnaire(file)) {
          const issue = questionnaireFileIssue(
            draftSubmission.issues,
            applicant.id,
            file,
            fileType,
          );
          return {
            applicantId: applicant.id,
            comment: issue?.comment,
            fileId: file?.id,
            fileType,
            label: requiredQuestionnaireFileLabels[fileType],
            reason:
              issue?.reason ??
              (file?.status === "needs_replacement" ||
              file?.reviewStatus === "replace_required" ||
              file?.reviewStatus === "poor_quality"
                ? "Замените этот файл"
                : "Добавьте этот файл"),
            sectionId: "files" as const,
          } satisfies QuestionnaireBlockerTarget;
        }
      }
    }

    const passportIssue = passportGateIssues(draftSubmission).find(
      (candidate) => !applicantId || candidate.applicantId === applicantId,
    );
    if (passportIssue) return questionnaireTargetForPassportIssue(passportIssue);

    const issue = draftSubmission.issues.find(
      (candidate) =>
        candidate.status === "open" &&
        candidate.target.applicantId &&
        (!applicantId || candidate.target.applicantId === applicantId),
    );
    if (!issue?.target.applicantId) return undefined;

    const issueFileType = requiredQuestionnaireFileTypeForIssue(issue);
    if (issueFileType) {
      const file = draftSubmission.files.find(
        (candidate) =>
          candidate.applicantId === issue.target.applicantId &&
          candidate.type === issueFileType,
      );
      return {
        applicantId: issue.target.applicantId,
        comment: issue.comment,
        fileId: file?.id,
        fileType: issueFileType,
        label: requiredQuestionnaireFileLabels[issueFileType],
        reason: issue.reason,
        sectionId: "files" as const,
      } satisfies QuestionnaireBlockerTarget;
    }

    const issueApplicant = draftSubmission.applicants.find(
      (applicant) => applicant.id === issue.target.applicantId,
    );
    const hasIssueSection = Boolean(issue.target.section?.trim());
    const issueSectionId = sectionForFocus(
      { section: issue.target.section },
      undefined,
    );
    const issueCanonicalSection = sectionDefinitions.find(
      (definition) => definition.id === issueSectionId,
    )?.canonicalId;
    const matchingBindings = questionnaireFieldBindings.filter((binding) => {
      const field = questionnaireField(issueApplicant, binding.fieldId);
      return issueFieldMatches(binding.fieldId, field?.label ?? "", issue.target.field);
    });
    const normalizedIssueField = normalizeFocusLabel(issue.target.field).replace(
      /ё/g,
      "е",
    );
    const exactIdBinding = matchingBindings.find(
      (binding) =>
        normalizeFocusLabel(binding.fieldId).replace(/ё/g, "е") ===
        normalizedIssueField,
    );
    const sectionBinding =
      hasIssueSection && issueCanonicalSection
        ? matchingBindings.find(
            (binding) => binding.sectionId === issueCanonicalSection,
          )
        : undefined;
    const issueBinding = exactIdBinding ?? sectionBinding ?? matchingBindings[0];
    const issueField = issueBinding
      ? questionnaireField(issueApplicant, issueBinding.fieldId)
      : undefined;

    return {
      applicantId: issue.target.applicantId,
      label: issueField?.label ?? issue.target.field,
      sectionId: issueBinding
        ? sectionIdForQuestionnaireField(issueBinding.sectionId, issueBinding.fieldId)
        : issueSectionId,
    } satisfies QuestionnaireBlockerTarget;
  }

  function focusNextIncomplete() {
    focusFirstBlocker();
  }

  function focusApplicantNextIncomplete(applicantId: string) {
    const target = firstQuestionnaireBlockerTarget(applicantId);
    if (target) {
      setRevealRequiredErrors(true);
      focusQuestionnaireTarget(target);
      return;
    }

    setActiveApplicant(applicantId);
  }

  function focusFirstBlocker() {
    const target = firstQuestionnaireBlockerTarget();
    if (!target) return;
    setRevealRequiredErrors(true);
    setSaveStatus("idle");
    setSaveMessage(
      target.label
        ? `Сначала: ${target.label}`
        : target.sectionId === "files"
          ? "Сначала: добавьте обязательный файл"
          : "Сначала: устраните блокер",
    );
    focusQuestionnaireTarget(target);
  }

  async function saveDraftFromButton() {
    if (!isEditable || completionInFlightRef.current) return;
    clearAutosaveTimer();
    const revision = autosaveRevisionRef.current;
    await enqueueDraftSave(completionPayload("manual"), revision);
  }

  async function confirmPassportReviewFromButton(applicantId: string) {
    if (!onConfirmPassportReview || passportReviewPending) return;

    setPassportReviewPending(true);
    setSaveStatus("saving");
    setSaveMessage("Сохраняем проверку паспорта...");
    try {
      await saveDraftFromButton();
      await onConfirmPassportReview(applicantId);
      setSaveStatus("saved");
      setSaveMessage("Паспорт проверен");
    } catch (error) {
      setSaveStatus("error");
      setSaveMessage(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить проверку паспорта.",
      );
    } finally {
      setPassportReviewPending(false);
    }
  }

  async function resolveCurrentIssue() {
    if (
      !currentSectionIssue ||
      currentSectionIssue.status !== "open" ||
      !onMarkIssueFixed ||
      issueResolutionPendingRef.current
    ) {
      return;
    }

    issueResolutionPendingRef.current = true;
    setPendingIssueResolutionId(currentSectionIssue.id);
    setIssueResolutionError("");
    try {
      await saveDraftFromButton();
      await onMarkIssueFixed(currentSectionIssue.id);
      setSaveStatus("saved");
      setSaveMessage("Исправление отмечено и готово к отправке");
    } catch (error) {
      setIssueResolutionError(
        error instanceof Error
          ? error.message
          : "Не удалось отметить замечание исправленным.",
      );
    } finally {
      issueResolutionPendingRef.current = false;
      setPendingIssueResolutionId(null);
    }
  }

  async function completeFromButton() {
    if (!isEditable || completionInFlightRef.current) return;
    if (!readinessStats.canSubmit) {
      focusFirstBlocker();
      return;
    }
    completionInFlightRef.current = true;
    clearAutosaveTimer();
    const revision = autosaveRevisionRef.current;
    const payload = completionPayload("completion");
    setSaveStatus("saving");
    setSaveMessage("Сохраняем перед отправкой...");
    try {
      const hasDraftWork =
        Object.keys(pendingFieldUpdatesRef.current).length > 0 ||
        Boolean(inFlightSaveRef.current) ||
        Boolean(queuedSaveRef.current);
      if (hasDraftWork && onSaveDraftRef.current) {
        await enqueueDraftSave(payload, revision);
      }
      setSaveStatus("saving");
      setSaveMessage(
        isCorrectionResubmission
          ? "Отправляем исправления..."
          : "Отправляем на проверку...",
      );
      await onComplete(payload);
      if (autosaveRevisionRef.current === revision) {
        replacePendingFieldUpdates({});
        setSaveStatus("saved");
        setSaveMessage(
          isCorrectionResubmission
            ? "Исправления отправлены"
            : "Отправлено на проверку",
        );
      }
    } catch (error) {
      setSaveStatus("error");
      setSaveMessage(
        error instanceof Error
          ? error.message
          : isCorrectionResubmission
            ? "Не удалось отправить исправления"
            : "Не удалось отправить анкету",
      );
      throw error;
    } finally {
      completionInFlightRef.current = false;
    }
  }

  async function requestBack() {
    if (completionInFlightRef.current) return;
    clearAutosaveTimer();
    const hasDraftWork =
      Object.keys(pendingFieldUpdatesRef.current).length > 0 ||
      Boolean(inFlightSaveRef.current) ||
      Boolean(queuedSaveRef.current);
    if (hasDraftWork && onSaveDraftRef.current) {
      const revision = autosaveRevisionRef.current;
      try {
        await enqueueDraftSave(completionPayload("navigation"), revision);
      } catch (error) {
        setSaveStatus("error");
        setSaveMessage(
          error instanceof Error ? error.message : "Не удалось сохранить анкету",
        );
      }
    }

    onBack();
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
            focused={
              focusedFileTarget?.fileId ===
                requiredFileForActiveApplicant("passport_scan")?.id ||
              focusedFileTarget?.fileType === "passport_scan"
            }
            issue={questionnaireFileIssue(
              draftSubmission.issues,
              activeApplicant,
              requiredFileForActiveApplicant("passport_scan"),
              "passport_scan",
            )}
            label="Загранпаспорт"
            onUploadFile={onUploadFile}
            submission={draftSubmission}
          />
          <QuestionnaireFileSlot
            description="Фото анфас"
            file={requiredFileForActiveApplicant("selfie")}
            fileType="selfie"
            focused={
              focusedFileTarget?.fileId === requiredFileForActiveApplicant("selfie")?.id ||
              focusedFileTarget?.fileType === "selfie"
            }
            issue={questionnaireFileIssue(
              draftSubmission.issues,
              activeApplicant,
              requiredFileForActiveApplicant("selfie"),
              "selfie",
            )}
            label="Селфи 1"
            onUploadFile={onUploadFile}
            submission={draftSubmission}
          />
          <QuestionnaireFileSlot
            description="Фото в профиль"
            file={requiredFileForActiveApplicant("selfie_2")}
            fileType="selfie_2"
            focused={
              focusedFileTarget?.fileId ===
                requiredFileForActiveApplicant("selfie_2")?.id ||
              focusedFileTarget?.fileType === "selfie_2"
            }
            issue={questionnaireFileIssue(
              draftSubmission.issues,
              activeApplicant,
              requiredFileForActiveApplicant("selfie_2"),
              "selfie_2",
            )}
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
            modelFieldId="appointment-city"
            number="A1"
            options={selectOptions.appointmentCity}
            value={formData.appointmentCity}
            onChange={(value) => updateField("appointmentCity", value)}
          />
          <FormField
            excelMap="Анкета: visa-type"
            label="Тип визы"
            modelFieldId="visa-type"
            number="A2"
            options={selectOptions.visaType}
            value={formData.visaType}
            onChange={(value) => updateField("visaType", value)}
          />
          <FormField
            excelMap="Анкета: category"
            label="Категория обслуживания"
            modelFieldId="category"
            number="A3"
            options={selectOptions.category}
            value={formData.category}
            onChange={(value) => updateField("category", value)}
          />
          <FormField
            label="Желаемая дата 1"
            modelFieldId="desired-date-1"
            number="A4"
            value={formData.desiredDate1}
            onChange={(value) => updateField("desiredDate1", value)}
          />
          <FormField
            label="Желаемая дата 2"
            modelFieldId="desired-date-2"
            number="A5"
            value={formData.desiredDate2}
            onChange={(value) => updateField("desiredDate2", value)}
          />
          <FormField
            label="Желаемая дата 3"
            modelFieldId="desired-date-3"
            number="A6"
            value={formData.desiredDate3}
            onChange={(value) => updateField("desiredDate3", value)}
          />
          <FormField
            fullWidth
            label="Примечание"
            modelFieldId="appointment-note"
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
            focused={
              fieldReviewState("passport-type", "Тип документа") === "needs_review"
            }
            label="Тип документа"
            modelFieldId="passport-type"
            number="1"
            options={selectOptions.passportType}
            reviewSource={fieldReviewSource("passport-type", "Тип документа")}
            state={fieldReviewState("passport-type", "Тип документа")}
            value={formData.passportType}
            onChange={(value) => updateField("passportType", value)}
          />
          <FormField
            excelMap="Cell: C3"
            errorMessage={fieldErrorMessage("passport-no", "Номер паспорта")}
            focused={
              fieldReviewState("passport-no", "Номер паспорта") === "needs_review"
            }
            label="Номер паспорта"
            modelFieldId="passport-no"
            number="2"
            reviewSource={fieldReviewSource("passport-no", "Номер паспорта")}
            state={fieldReviewState("passport-no", "Номер паспорта")}
            value={formData.passportNumber}
            onChange={(value) => updateField("passportNumber", value)}
          />
          <FormField
            excelMap="Cell: C4"
            errorMessage={fieldErrorMessage("passport-issue-date", "Дата выдачи")}
            focused={
              fieldReviewState("passport-issue-date", "Дата выдачи") === "needs_review"
            }
            label="Дата выдачи"
            modelFieldId="passport-issue-date"
            number="3"
            reviewSource={fieldReviewSource("passport-issue-date", "Дата выдачи")}
            state={fieldReviewState("passport-issue-date", "Дата выдачи")}
            value={formData.passportIssued}
            onChange={updatePassportIssueDate}
          />
          <div className="v19-questionnaire-passport-validity-cell">
            <FormField
              excelMap="Cell: C5"
              errorMessage={fieldErrorMessage("passport-expiry-date", "Действителен до")}
              focused={
                fieldReviewState("passport-expiry-date", "Действителен до") ===
                "needs_review"
              }
              label="Действителен до"
              modelFieldId="passport-expiry-date"
              number="4"
              reviewSource={fieldReviewSource("passport-expiry-date", "Действителен до")}
              state={fieldReviewState("passport-expiry-date", "Действителен до")}
              value={formData.passportExpiry}
              onChange={(value) => updateField("passportExpiry", value)}
            />
            {passportExpiryFromIssueDate(formData.passportIssued) ? (
              <div aria-label="Срок действия паспорта" role="group">
                {[5, 10].map((validityYears) => {
                  const expiry = passportExpiryFromIssueDate(
                    formData.passportIssued,
                    validityYears,
                  );
                  return (
                    <button
                      aria-pressed={formData.passportExpiry === expiry}
                      className="v19-questionnaire-draft-button v19-questionnaire-passport-validity-option"
                      disabled={!isEditable}
                      key={validityYears}
                      type="button"
                      onClick={() => applyPassportValidityYears(validityYears as 5 | 10)}
                    >
                      {validityYears} лет
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <FormField
            excelMap="Анкета: passport-issue-country"
            label="Страна выдачи"
            modelFieldId="passport-issue-country"
            number="5"
            options={selectOptions.passportIssueCountry}
            value={formData.passportIssueCountry}
            onChange={(value) => updateField("passportIssueCountry", value)}
          />
          <FormField
            excelMap="Cell: C6"
            label="Место выдачи"
            modelFieldId="passport-issue-place"
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
            modelFieldId="eu-relative-details"
            number="1"
            type="textarea"
            value={formData.euRelativeDetails}
            onChange={(value) => updateField("euRelativeDetails", value)}
          />
          <FormField
            excelMap="Анкета: eu-relationship"
            label="Родственная связь"
            modelFieldId="eu-relationship"
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
            hint="Можно без заглавных и знаков: ул ленина д 5 кв 12 — расшифруем после ввода."
            label="Домашний адрес"
            modelFieldId="home-address"
            number="1"
            placeholder="ул ленина д 5 кв 12"
            compact
            value={formData.contactAddress}
            onBlur={() => normalizeAddressField("contactAddress")}
            onChange={(value) => updateField("contactAddress", value)}
          />
          <FormField
            excelMap="Cell: D4"
            label="Email"
            modelFieldId="email"
            number="2"
            type="email"
            value={formData.contactEmail}
            onChange={(value) => updateField("contactEmail", value)}
          />
          <FormField
            excelMap="Cell: D3"
            label="Телефон"
            modelFieldId="contact-number"
            number="3"
            phonePrefix="+7"
            placeholder="900 000-00-00"
            value={formData.contactPhone}
            onChange={(value) => updateField("contactPhone", value)}
          />
          <FormField
            label="Страна проживания"
            modelFieldId="home-country"
            number="4"
            options={selectOptions.homeCountry}
            value={formData.homeCountry}
            onChange={(value) => updateField("homeCountry", value)}
          />
          <FormField
            excelMap="Анкета: residence-city"
            label="Город проживания"
            modelFieldId="home-city"
            number="5"
            placeholder="Начните: с"
            suggestions={POPULAR_RUSSIAN_CITY_OPTIONS}
            value={formData.residenceCity}
            onChange={(value) => updateField("residenceCity", value)}
          />
          <FormField
            excelMap="Анкета: residence-postal-code"
            label="Почтовый индекс"
            modelFieldId="postal-code"
            number="6"
            value={formData.residencePostalCode}
            onChange={(value) => updateField("residencePostalCode", value)}
          />
          <FormField
            excelMap="Анкета: lives-outside-citizenship"
            label="Проживание не в стране гражданства"
            modelFieldId="lives-outside-citizenship"
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
                modelFieldId="residence-permit-type"
                number="8"
                value={formData.residencePermitType}
                onChange={(value) => updateField("residencePermitType", value)}
              />
              <FormField
                excelMap="Анкета: residence-permit-number"
                label="Номер документа"
                modelFieldId="residence-permit-number"
                number="9"
                value={formData.residencePermitNumber}
                onChange={(value) => updateField("residencePermitNumber", value)}
              />
              <FormField
                excelMap="Анкета: residence-permit-valid-until"
                label="Действителен до"
                modelFieldId="residence-permit-valid-until"
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
            modelFieldId="occupation"
            number="1"
            options={selectOptions.occupation}
            reviewSource={fieldReviewSource("occupation", "Профессия")}
            state={fieldReviewState("occupation", "Профессия")}
            value={formData.occupation}
            onChange={(value) => updateField("occupation", value)}
          />
          <FormField
            excelMap="Анкета: occupation-specify"
            label="Уточнение профессии"
            modelFieldId="occupation-specify"
            number="2"
            value={formData.currentJob}
            onChange={(value) => updateField("currentJob", value)}
          />
          <FormField
            excelMap="Cell: E3"
            fullWidth
            label="Работодатель / учебное заведение"
            modelFieldId="employer-name"
            number="3"
            type="textarea"
            value={formData.employerName}
            onChange={(value) => updateField("employerName", value)}
          />
          <FormField
            excelMap="Анкета: employer-contact"
            label="Телефон работодателя / учебного заведения"
            modelFieldId="employer-contact"
            number="4"
            phonePrefix="+7"
            value={formData.employerContact}
            onChange={(value) => updateField("employerContact", value)}
          />
          <FormField
            excelMap="Cell: E4"
            fullWidth
            hint="Можно без заглавных и знаков: пр мира д 10 оф 4 — расшифруем после ввода."
            label="Адрес работодателя / учебного заведения"
            modelFieldId="employer-address"
            number="5"
            placeholder="пр мира д 10 оф 4"
            compact
            value={formData.employerAddress}
            onBlur={() => normalizeAddressField("employerAddress")}
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
            modelFieldId="purpose"
            number="1"
            options={selectOptions.purpose}
            value={formData.stayPurpose}
            onChange={(value) => updateField("stayPurpose", value)}
          />
          {showPurposeDetails ? (
            <FormField
              excelMap="Анкета: stay-purpose-details"
              fullWidth
              label="Дополнительные сведения о цели"
              modelFieldId="stay-purpose-details"
              number="2"
              type="textarea"
              value={formData.stayPurposeDetails}
              onChange={(value) => updateField("stayPurposeDetails", value)}
            />
          ) : null}
          <FormField
            excelMap="Анкета: main-destination"
            label="Основная страна назначения"
            modelFieldId="main-destination"
            number="3"
            options={selectOptions.country}
            value={formData.mainDestination}
            onChange={(value) => updateField("mainDestination", value)}
          />
          <FormField
            excelMap="Cell: F5"
            label="Страна первого въезда"
            modelFieldId="first-entry-country"
            number="4"
            options={selectOptions.country}
            value={formData.firstEntryCountry}
            onChange={(value) => updateField("firstEntryCountry", value)}
          />
          <FormField
            excelMap="Анкета: entry-count"
            label="Количество въездов"
            modelFieldId="entry-count"
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
            modelFieldId="arrival-date"
            number="6"
            reviewSource={fieldReviewSource("arrival-date", "Дата въезда")}
            state={fieldReviewState("arrival-date", "Дата въезда")}
            value={formData.travelStart}
            onChange={(value) => updateTravelDate("travelStart", value)}
          />
          <FormField
            excelMap="Cell: F4"
            errorMessage={fieldErrorMessage("departure-date", "Дата выезда")}
            focused={
              fieldReviewState("departure-date", "Дата выезда") === "needs_review"
            }
            label="Дата выезда"
            modelFieldId="departure-date"
            number="7"
            reviewSource={fieldReviewSource("departure-date", "Дата выезда")}
            state={fieldReviewState("departure-date", "Дата выезда")}
            value={formData.travelEnd}
            onChange={(value) => updateTravelDate("travelEnd", value)}
          />
          <FormField
            excelMap="Анкета: stay-duration"
            label="Длительность пребывания"
            modelFieldId="stay-duration"
            number="8"
            hint="Рассчитывается автоматически по датам въезда и выезда"
            readOnly
            type="number"
            value={formData.stayDuration}
          />
          <FormField
            excelMap="Анкета: previous-biometrics"
            label="Отпечатки ранее сдавались"
            modelFieldId="previous-biometrics"
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
                modelFieldId="previous-biometrics-date"
                number="10"
                value={formData.previousBiometricsDate}
                onChange={(value) => updateField("previousBiometricsDate", value)}
              />
              <FormField
                excelMap="Анкета: previous-visa-number"
                label="Номер визы"
                modelFieldId="previous-visa-number"
                number="11"
                value={formData.previousVisaNumber}
                onChange={(value) => updateField("previousVisaNumber", value)}
              />
            </>
          ) : null}
          <FormField
            excelMap="Анкета: final-entry-permit"
            label="Разрешение на въезд в конечную страну"
            modelFieldId="final-entry-permit"
            number="12"
            value={formData.finalEntryPermit}
            onChange={(value) => updateField("finalEntryPermit", value)}
          />
          <FormField
            excelMap="Анкета: final-entry-permit-issued-by"
            label="Кем выдано"
            modelFieldId="final-entry-permit-issued-by"
            number="13"
            value={formData.finalEntryPermitIssuedBy}
            onChange={(value) => updateField("finalEntryPermitIssuedBy", value)}
          />
          <FormField
            excelMap="Анкета: final-entry-permit-valid-from"
            label="Действительно с"
            modelFieldId="final-entry-permit-valid-from"
            number="14"
            value={formData.finalEntryPermitValidFrom}
            onChange={(value) => updateField("finalEntryPermitValidFrom", value)}
          />
          <FormField
            excelMap="Анкета: final-entry-permit-valid-to"
            label="Действительно до"
            modelFieldId="final-entry-permit-valid-to"
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
            modelFieldId="inviting-party-type"
            number="1"
            options={selectOptions.invitingPartyType}
            value={formData.invitingPartyType}
            onChange={(value) => updateField("invitingPartyType", value)}
          />
          <FormField
            excelMap="Cell: G2"
            label="ФИО приглашающего лица или название отеля"
            modelFieldId="hotel-name"
            number="2"
            value={formData.hotelName}
            onChange={(value) => updateField("hotelName", value)}
          />
          <FormField
            excelMap="Cell: G3"
            fullWidth
            label="Адрес"
            modelFieldId="hotel-address"
            number="3"
            type="textarea"
            value={formData.hotelAddress}
            onChange={(value) => updateField("hotelAddress", value)}
          />
          <FormField
            label="Страна"
            modelFieldId="hotel-country"
            number="4"
            options={selectOptions.hotelCountry}
            value={formData.hotelCountry}
            onChange={(value) => updateField("hotelCountry", value)}
          />
          <FormField
            label="Город"
            modelFieldId="hotel-city"
            number="5"
            value={formData.hotelCity}
            onChange={(value) => updateField("hotelCity", value)}
          />
          <FormField
            label="Почтовый индекс"
            modelFieldId="hotel-postal-code"
            number="6"
            value={formData.hotelPostalCode}
            onChange={(value) => updateField("hotelPostalCode", value)}
          />
          <FormField
            label="Email"
            modelFieldId="hotel-email"
            number="7"
            type="email"
            value={formData.hotelEmail}
            onChange={(value) => updateField("hotelEmail", value)}
          />
          <FormField
            label="Телефон"
            modelFieldId="hotel-contact"
            number="8"
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
                modelFieldId="company-org-details"
                number="9"
                type="textarea"
                value={formData.companyOrgDetails}
                onChange={(value) => updateField("companyOrgDetails", value)}
              />
              <FormField
                excelMap="Анкета: company-contact-person"
                fullWidth
                label="Контактное лицо компании"
                modelFieldId="company-contact-person"
                number="10"
                type="textarea"
                value={formData.companyContactPerson}
                onChange={(value) => updateField("companyContactPerson", value)}
              />
              <FormField
                excelMap="Анкета: company-phone"
                label="Телефон компании"
                modelFieldId="company-phone"
                number="11"
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
            modelFieldId="cost-covered-by"
            number="1"
            options={selectOptions.costCoveredBy}
            value={formData.paymentSponsor}
            onChange={(value) => updateField("paymentSponsor", value)}
          />
          <FormField
            excelMap="Cell: H3"
            label="Средства заявителя"
            modelFieldId="means-of-support"
            number="2"
            options={selectOptions.meansOfSupport}
            value={formData.paymentType}
            onChange={(value) => updateField("paymentType", value)}
          />
          {showSponsorFields ? (
            <>
              <FormField
                excelMap="Анкета: sponsor-in-host-fields"
                label="Спонсор указан в полях 30/31"
                modelFieldId="sponsor-in-host-fields"
                number="3"
                options={selectOptions.sponsorInHostFields}
                value={formData.sponsorInHostFields}
                onChange={(value) => updateField("sponsorInHostFields", value)}
              />
              <FormField
                excelMap="Анкета: other-sponsor"
                label="Другой спонсор"
                modelFieldId="other-sponsor"
                number="4"
                value={formData.otherSponsor}
                onChange={(value) => updateField("otherSponsor", value)}
              />
              <FormField
                excelMap="Анкета: sponsor-means"
                fullWidth
                label="Средства спонсора"
                modelFieldId="sponsor-means"
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
            modelFieldId="form-filler-name"
            number="1"
            value={formData.formFillerName}
            onChange={(value) => updateField("formFillerName", value)}
          />
          <FormField
            excelMap="Анкета: form-filler-contact"
            fullWidth
            label="Адрес/email заполнившего"
            modelFieldId="form-filler-contact"
            number="2"
            type="textarea"
            value={formData.formFillerContact}
            onChange={(value) => updateField("formFillerContact", value)}
          />
          <FormField
            excelMap="Анкета: form-filler-phone"
            label="Телефон заполнившего"
            modelFieldId="form-filler-phone"
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
            modelFieldId="surname"
            number="1"
            value={formData.surname}
            onChange={(value) => updateField("surname", value)}
          />
          {showPreviousSurname ? (
            <FormField
              excelMap="Анкета: previous-surname"
              label="Фамилия при рождении / предыдущая"
              modelFieldId="previous-surname"
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
            modelFieldId="first-name"
            number="3"
            value={formData.firstName}
            onChange={(value) => updateField("firstName", value)}
          />
          <FormField
            excelMap="Cell: B4"
            errorMessage={fieldErrorMessage("birth-date", "Дата рождения")}
            label="Дата рождения"
            modelFieldId="birth-date"
            number="4"
            state={fieldReviewState("birth-date", "Дата рождения")}
            value={formData.dob}
            onChange={updateBirthDate}
          />
          <FormField
            excelMap="Cell: B5"
            errorMessage={fieldErrorMessage("birth-place", "Место рождения")}
            hint="Для рождения до 06.09.1991 Санкт-Петербург подставляется как LENINGRAD; сверяйте с загранпаспортом"
            label="Место рождения"
            modelFieldId="birth-place"
            number="5"
            onBlur={normalizeBirthPlaceField}
            reviewSource={fieldReviewSource("birth-place", "Место рождения")}
            state={fieldReviewState("birth-place", "Место рождения")}
            value={formData.birthPlace}
            onChange={(value) => updateField("birthPlace", value)}
          />
          <FormField
            excelMap="Cell: B6"
            label="Страна рождения"
            modelFieldId="birth-country"
            number="6"
            options={selectOptions.birthCountry}
            value={formData.birthCountry}
            onChange={(value) => updateField("birthCountry", value)}
          />
          <FormField
            excelMap="Cell: B7"
            label="Текущее гражданство"
            modelFieldId="nationality"
            number="7"
            options={selectOptions.citizenship}
            value={formData.citizenship}
            onChange={(value) => updateField("citizenship", value)}
          />
          <FormField
            excelMap="Анкета: birth-citizenship"
            label="Гражданство при рождении, если отличается"
            modelFieldId="birth-citizenship"
            number="8"
            options={selectOptions.birthCitizenship}
            value={formData.birthCitizenship}
            onChange={(value) => updateField("birthCitizenship", value)}
          />
          <FormField
            excelMap="Анкета: other-citizenship"
            label="Иное гражданство"
            modelFieldId="other-citizenship"
            number="9"
            options={selectOptions.otherCitizenship}
            value={formData.otherCitizenship}
            onChange={(value) => updateField("otherCitizenship", value)}
          />
          <FormField
            excelMap="Cell: B8"
            label="Пол"
            modelFieldId="gender"
            number="10"
            options={selectOptions.gender}
            value={formData.sex}
            onChange={(value) => updateField("sex", value)}
          />
          <FormField
            excelMap="Cell: B9"
            fullWidth
            label="Семейное положение"
            modelFieldId="marital-status"
            number="11"
            options={selectOptions.maritalStatus}
            value={formData.maritalStatus}
            onChange={(value) => updateField("maritalStatus", value)}
          />
          {showGuardianInfo ? (
            <FormField
              excelMap="Анкета: guardian-info"
              fullWidth
              label="Родитель/опекун несовершеннолетнего"
              modelFieldId="guardian-info"
              number="12"
              type="textarea"
              value={formData.guardianInfo}
              onChange={(value) => updateField("guardianInfo", value)}
            />
          ) : null}
          <FormField
            excelMap="Анкета: national-id"
            label="Национальный ID"
            modelFieldId="national-id"
            number="13"
            value={formData.nationalId}
            onChange={(value) => updateField("nationalId", value)}
          />
        </>
      );
    }

    return null;
  }

  const questionnaireFieldUiContract: QuestionnaireFieldUiContract = {
    confirmReview: confirmFieldReview,
    errorMessage: fieldErrorMessage,
    focused: (fieldId) =>
      initialFieldTarget?.fieldId === fieldId &&
      (initialFocus?.applicantId ?? activeApplicant) === activeApplicant,
    revealRequiredErrors,
    required: fieldIsRequired,
    reviewSource: fieldReviewSource,
    state: fieldReviewState,
  };
  const mobileBlockerTarget = readinessStats.canSubmit
    ? undefined
    : firstQuestionnaireBlockerTarget();
  const activePassportReviewIssue = passportGateIssues(draftSubmission).find(
    (issue) =>
      issue.applicantId === activeApplicant &&
      (issue.code === "passport_not_confirmed" ||
        issue.code === "passport_extraction_not_reviewed"),
  );
  const mobileBlockerLabel =
    mobileBlockerTarget?.label ??
    readinessStats.completionReason ??
    sections.find((section) => section.id === mobileBlockerTarget?.sectionId)?.title ??
    "Следующее обязательное поле";
  const mobileBlockerReason = mobileBlockerTarget?.reason?.trim();

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="vf-figma-surface vf-figma-questionnaire-screen v19-questionnaire-screen-shell"
      data-submission-id={draftSubmission.id}
      exit={{ opacity: 0 }}
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      ref={screenRef}
      transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
    >
      <header className="v19-questionnaire-screen-header">
        <button
          aria-label="Назад"
          className="v19-questionnaire-back-button"
          type="button"
          onClick={() => void requestBack()}
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
            {readinessStats.percent}% · {readinessStats.completed}/
            {readinessStats.total}
            <span aria-live="polite" role="status">
              · {saveMessage}
            </span>
          </span>
          <button
            className="v19-questionnaire-draft-button"
            disabled={!isEditable || saveStatus === "saving"}
            type="button"
            onClick={() => void saveDraftFromButton().catch(() => undefined)}
          >
            {saveStatus === "saving" ? "Сохраняем" : "Черновик"}
          </button>
          <button
            aria-label={completeActionLabel}
            className={`v19-questionnaire-complete-button ${readinessStats.canSubmit ? "is-ready" : "is-blocked"}${isCorrectionResubmission ? " is-correction-submit" : ""}`}
            disabled={!isEditable || saveStatus === "saving"}
            type="button"
            onClick={() => void completeFromButton().catch(() => undefined)}
          >
            <span className="hidden sm:inline">{completeActionLabel}</span>
            <span className="sm:hidden">{completeActionMobileLabel}</span>
          </button>
        </div>
      </header>

      <div className="v19-questionnaire-progress-track">
        <motion.div
          animate={{ width: `${readinessStats.percent}%` }}
          className="v19-questionnaire-progress-fill"
          initial={prefersReducedMotion ? false : { width: 0 }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { delay: 0.1, duration: 1.2, ease: "easeOut" }
          }
        >
          {!prefersReducedMotion ? (
            <motion.div
              animate={{ x: ["-100%", "200%"] }}
              className="v19-questionnaire-progress-shimmer absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
              transition={{ duration: 2.5, ease: "linear", repeat: Infinity }}
            />
          ) : null}
        </motion.div>
      </div>

      <div className="v19-questionnaire-mobile-status">
        <span className="v19-questionnaire-mobile-progress">
          {readinessStats.percent}% · {readinessStats.completed}/{readinessStats.total}
        </span>
        <span aria-live="polite" className="v19-questionnaire-mobile-save" role="status">
          {saveMessage}
        </span>
        {!readinessStats.canSubmit ? (
          <button
            aria-label={`Перейти к блокеру: ${mobileBlockerLabel}`}
            type="button"
            onClick={focusFirstBlocker}
          >
            К блокеру
          </button>
        ) : null}
      </div>

      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        Контекст анкеты: заявитель {activeApplicantContext?.name ?? "не выбран"}; раздел{" "}
        {activeSectionContext?.title ?? "не выбран"}.
      </p>

      <div className="v19-questionnaire-scroll">
        <div className="v19-questionnaire-scroll-frame max-w-[var(--v19b-size-1240)] mx-auto flex flex-col h-full min-h-0 gap-3 lg:gap-4 pb-[env(safe-area-inset-bottom)]">
          <div className="v19-questionnaire-applicant-bar">
            <div
              aria-label="Заявители"
              className="flex overflow-x-auto scrollbar-hide gap-1.5 lg:gap-2 flex-1 w-full snap-x pb-1 md:pb-0"
              role="group"
            >
              {applicants.map((applicant) => {
                const statusLabel =
                  applicant.status === "complete"
                    ? "готов"
                    : applicant.status === "issue"
                      ? "есть блокер"
                      : "не завершён";

                return (
                  <div
                    className="flex shrink-0 items-stretch gap-1 snap-start"
                    key={applicant.id}
                  >
                    <button
                      aria-label={`${applicant.name}: ${applicant.completed} из ${applicant.total}, ${statusLabel}`}
                      aria-pressed={activeApplicant === applicant.id}
                      className={`v19-questionnaire-applicant-tab ${
                        activeApplicant === applicant.id ? "is-active" : ""
                      }`}
                      ref={
                        activeApplicant === applicant.id
                          ? activeApplicantTabRef
                          : undefined
                      }
                      type="button"
                      onClick={() => setActiveApplicant(applicant.id)}
                    >
                      <span className="v19-questionnaire-applicant-index">
                        {applicant.index}
                      </span>
                      {applicant.name}
                      <QuestionnaireProgressBadge
                        aria-hidden="true"
                        className={`v19-questionnaire-progress-badge status-${applicant.status}`}
                      >
                        {applicant.status === "complete" ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : applicant.status === "issue" ? (
                          <AlertCircle className="w-3.5 h-3.5" />
                        ) : (
                          `${applicant.completed}/${applicant.total}`
                        )}
                      </QuestionnaireProgressBadge>
                    </button>
                    {applicant.status !== "complete" ? (
                      <button
                        aria-label={`Следующее незаполненное: ${applicant.name}`}
                        className="v19-questionnaire-draft-button min-w-[var(--v19b-size-40)] min-h-[var(--v19b-size-40)] shrink-0 px-0"
                        title={`Перейти к следующему незаполненному полю: ${applicant.name}`}
                        type="button"
                        onClick={() => focusApplicantNextIncomplete(applicant.id)}
                      >
                        <ArrowRight className="w-[var(--v19b-size-16)] h-[var(--v19b-size-16)]" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
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

          <div
            aria-label="Разделы анкеты"
            className="v19-questionnaire-section-list v19-questionnaire-section-list--pinned"
            role="group"
          >
            {sections.map((section) => (
              <button
                aria-pressed={activeSection === section.id}
                className={`v19-questionnaire-section-tab ${
                  activeSection === section.id ? "is-active" : ""
                }`}
                key={`pinned-${section.id}`}
                ref={
                  activeSection === section.id ? activePinnedSectionTabRef : undefined
                }
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
                disabled={!isEditable}
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

              <div className="flex flex-col gap-2">
                <V19SearchField
                  label="Поиск поля анкеты"
                  placeholder="Найти поле..."
                  value={fieldSearchQuery}
                  onChange={(event) => setFieldSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    focusFirstSearchMatch();
                  }}
                />
                <div
                  aria-live="polite"
                  className="v19-questionnaire-sidebar-status"
                  role="status"
                >
                  {fieldSearchQuery.trim()
                    ? `${searchMatches.length} совпадений`
                    : saveStatus === "error"
                      ? saveMessage
                      : "Поиск по полям и значениям"}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="v19-questionnaire-draft-button v19-questionnaire-sidebar-action"
                    type="button"
                    onClick={focusNextIncomplete}
                  >
                    Следующее поле
                  </button>
                  <button
                    className="v19-questionnaire-draft-button v19-questionnaire-sidebar-action"
                    disabled={readinessStats.canSubmit}
                    type="button"
                    onClick={focusFirstBlocker}
                  >
                    Блокер
                  </button>
                </div>
              </div>

              <div
                aria-label="Разделы анкеты"
                className="v19-questionnaire-section-list v19-questionnaire-section-list--sidebar"
                role="group"
              >
                {sections.map((section) => (
                  <button
                    aria-pressed={activeSection === section.id}
                    className={`v19-questionnaire-section-tab ${
                      activeSection === section.id ? "is-active" : ""
                    }`}
                    key={section.id}
                    ref={
                      activeSection === section.id
                        ? activeSidebarSectionTabRef
                        : undefined
                    }
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
                    disabled={!isEditable}
                    type="button"
                    onClick={openEuRelativeSection}
                  >
                    Добавить родственника ЕС
                  </button>
                ) : null}
              </div>
            </aside>

            <div className="v19-questionnaire-work-panel">
              {activePassportReviewIssue && onConfirmPassportReview ? (
                <button
                  className="v19-questionnaire-passport-review-button"
                  data-testid="questionnaire-confirm-passport-review"
                  disabled={!isEditable || passportReviewPending}
                  type="button"
                  onClick={() =>
                    void confirmPassportReviewFromButton(
                      activePassportReviewIssue.applicantId,
                    )
                  }
                >
                  <CheckCircle2 aria-hidden="true" />
                  <span>
                    {passportReviewPending ? "Сохраняем..." : "Паспорт проверен"}
                  </span>
                </button>
              ) : null}
              {!readinessStats.canSubmit && !currentSectionIssue ? (
                <button
                  aria-label={`Перейти к следующему обязательному действию: ${mobileBlockerLabel}${
                    mobileBlockerReason ? `. ${mobileBlockerReason}` : ""
                  }`}
                  className="v19-questionnaire-next-blocker"
                  data-testid="questionnaire-next-blocker"
                  type="button"
                  onClick={focusFirstBlocker}
                >
                  <AlertCircle aria-hidden="true" className="w-4 h-4" />
                  <span>
                    Заполните: <strong>{mobileBlockerLabel}</strong>
                  </span>
                  <ArrowRight aria-hidden="true" className="w-4 h-4" />
                </button>
              ) : null}
              {currentSectionIssue ? (
                <div
                  aria-atomic={
                    currentSectionIssue.status === "fixed_by_agent" ? "true" : undefined
                  }
                  aria-live={
                    currentSectionIssue.status === "fixed_by_agent"
                      ? "polite"
                      : undefined
                  }
                  className={`v19-questionnaire-review-alert ${
                    currentSectionIssue.status === "fixed_by_agent" ? "is-awaiting" : ""
                  }`}
                  role={
                    currentSectionIssue.status === "fixed_by_agent"
                      ? "status"
                      : undefined
                  }
                >
                  <div className="v19-questionnaire-review-strip" />
                  <div className="v19-questionnaire-review-icon">
                    {currentSectionIssue.status === "fixed_by_agent" ? (
                      <CheckCircle2 className="w-[var(--v19b-size-18)] h-[var(--v19b-size-18)]" />
                    ) : (
                      <AlertCircle className="w-[var(--v19b-size-18)] h-[var(--v19b-size-18)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[var(--v19b-size-13-5)] font-semibold text-white">
                      {currentSectionIssue.status === "fixed_by_agent"
                        ? `Исправление${
                            currentSectionIssue.target.field
                              ? ` по полю «${currentSectionIssue.target.field}»`
                              : ""
                          } отправлено, ожидает проверки администратора`
                        : currentSectionIssue.target.field
                          ? `${currentSectionIssue.target.field}: ${currentSectionIssue.reason}`
                          : currentSectionIssue.reason}
                    </div>
                    <p className="text-[var(--v19b-size-12)] text-white/60 mt-1.5 leading-relaxed">
                      {currentSectionIssue.status === "fixed_by_agent"
                        ? "Исправление сохранено и не блокирует повторную отправку. Администратор увидит его при проверке."
                        : currentSectionIssue.comment}
                    </p>
                  </div>
                  {currentSectionIssue.status === "open" && onMarkIssueFixed ? (
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <button
                        aria-busy={
                          pendingIssueResolutionId === currentSectionIssue.id
                        }
                        className="v19-questionnaire-draft-button"
                        disabled={pendingIssueResolutionId !== null}
                        type="button"
                        onClick={() => void resolveCurrentIssue()}
                      >
                        {pendingIssueResolutionId === currentSectionIssue.id
                          ? "Сохраняем…"
                          : "Пометить исправленным"}
                      </button>
                      {issueResolutionError ? (
                        <span
                          className="max-w-[var(--v19b-size-220)] text-right text-[var(--v19b-size-11)] text-[var(--v19b-dot-danger)]"
                          role="alert"
                        >
                          {issueResolutionError}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="v19-questionnaire-work-grid">
                {canCopyFamilyWide ? (
                  <div className="col-span-1 md:col-span-2 flex flex-wrap items-center gap-2">
                    <button
                      aria-describedby={familyCopyMessage ? familyCopyStatusId : undefined}
                      className="v19-questionnaire-draft-button"
                      disabled={!isEditable || Boolean(familyCopyPreview)}
                      type="button"
                      onClick={copySharedDataToFamily}
                    >
                      Заполнить общие поля семьи
                    </button>
                    {familyCopyPreview ? (
                      <>
                        <button
                          className="v19-questionnaire-complete-button is-ready"
                          type="button"
                          onClick={confirmFamilyCopy}
                        >
                          Подтвердить копирование
                        </button>
                        <button
                          className="v19-questionnaire-draft-button"
                          type="button"
                          onClick={cancelFamilyCopy}
                        >
                          Отмена
                        </button>
                      </>
                    ) : null}
                    {!familyCopyPreview && lastFamilyCopyTarget ? (
                      <button
                        className="v19-questionnaire-draft-button"
                        type="button"
                        onClick={reviewLastFamilyCopy}
                      >
                        Проверить скопированные поля
                      </button>
                    ) : null}
                    {familyCopyMessage ? (
                      <p
                        aria-live="polite"
                        className="v19-questionnaire-family-copy-status"
                        id={familyCopyStatusId}
                        role="status"
                      >
                        {familyCopyMessage}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <QuestionnaireFieldUiContext.Provider value={questionnaireFieldUiContract}>
                  <fieldset
                    aria-label={
                      isEditable ? "Поля анкеты" : "Поля анкеты — только просмотр"
                    }
                    className="v19-questionnaire-fields-grid"
                    disabled={!isEditable}
                  >
                    {renderSectionFields()}
                  </fieldset>
                </QuestionnaireFieldUiContext.Provider>
              </div>

              <button
                className="v19-questionnaire-next-button v19-questionnaire-next-button--simple"
                type="button"
                onClick={focusNextIncomplete}
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
