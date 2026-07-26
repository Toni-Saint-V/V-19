// src/modules/submissions/components/FigmaQuestionnaireScreen.tsx
import {
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
  Copy,
  Plus,
  Save,
  UsersRound,
} from "lucide-react";
import { V19ReadinessCard, V19SearchField } from "../../../shared/ui/v19-design-system";
import type { Submission } from "../types";
import {
  BLS_CITY_OPTIONS,
  POPULAR_RUSSIAN_CITY_OPTIONS,
  isQuestionnaireDateField,
  questionnaireDateIntent,
  updateQuestionnaireField,
  validateQuestionnaireFieldValue,
  type QuestionnaireDateIntent,
  type QuestionnaireFieldUpdate,
} from "../questionnaire";
import {
  buildQuestionnaireFamilyCopyPlan,
  type QuestionnaireFamilyCopyPlan,
} from "../questionnaireFamilyCopy";
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
  agentQuestionnaireStatusPresentation,
  isAgentIssueCorrectionConfirmed,
} from "../status";
import { agentInteractionProps } from "../agentInteractionContract";
import {
  passportReviewMediaTypeForIssue,
  primaryApplicantIdForPassportReview,
} from "../passportReviewContract";
import { suggestedRussianAddress } from "../russianAddress";
import { questionnaireSaveFailureMessage } from "../questionnaireSaveError";
import {
  composeQuestionnaireHomeAddress,
  structuredQuestionnaireHomeAddressFromText,
} from "../questionnaireAddressFields";
import {
  QuestionnaireProgressBadge,
  QuestionnaireWorkspaceShell,
} from "./QuestionnaireWorkspacePrimitives";
import { AccessibleSelectMenu } from "../../../shared/ui/AccessibleSelectMenu";
import "./questionnaire-codex-polish-v1.css";

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

function applicantDropdownDescription(applicant: ApplicantTab) {
  const progress = `${applicant.completed} из ${applicant.total}`;
  if (applicant.status === "complete") return `Готово · ${progress}`;
  if (applicant.status === "issue") return `Есть замечание · ${progress}`;
  return `Заполнено ${progress}`;
}
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
  | "hotel";

const sectionDefinitions: Array<SectionTab & { canonicalId: string; id: SectionId }> = [
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
    canonicalId: "appointment",
    id: "appointment",
    meta: "0 из 0",
    status: "pending",
    title: "Запись",
  },
  {
    canonicalId: "hotel",
    id: "hotel",
    meta: "0 из 0",
    status: "pending",
    title: "Отель / приглашение",
  },
];

const familyCopyUnavailableMessage =
  "У основного заявителя нет введённых пользователем значений для копирования в этом разделе.";

const familyCopySectionIds = new Set<SectionId>([
  "appointment",
  "contact",
  "hotel",
  "trip",
]);

type FormFieldProps = {
  addressAssist?: boolean;
  compact?: boolean;
  excelMap?: string;
  errorMessage?: string;
  focused?: boolean;
  fullWidth?: boolean;
  hint?: string;
  label: string;
  modelFieldId: string;
  number?: string;
  onAddressSuggestionAccept?: (value: string) => void;
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
  copyPreview: (fieldId: string) => boolean;
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
  onSaveAndExit?: () => void | Promise<void>;
  onComplete: (values: QuestionnaireCommitPayload) => void | Promise<void>;
  onConfirmPassportReview?: (applicantId: string) => void | Promise<void>;
  onFieldChange?: (update: QuestionnaireFieldUpdate) => void;
  onMarkIssueFixed?: (
    issueId: string,
    values: QuestionnaireCommitPayload,
  ) => Submission | void | Promise<Submission | void>;
  onOpenDocuments?: (filter?: QuestionnaireDocumentsFilter) => void;
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

type QuestionnaireSaveFailureAction = "back" | "draft" | "save-exit";

const questionnaireSaveIntentPriority: Record<QuestionnaireSaveIntent, number> = {
  autosave: 0,
  navigation: 1,
  manual: 2,
  completion: 3,
};

function strongestQuestionnaireSaveIntent(
  current: QuestionnaireSaveIntent,
  incoming: QuestionnaireSaveIntent,
): QuestionnaireSaveIntent {
  return questionnaireSaveIntentPriority[incoming] >=
    questionnaireSaveIntentPriority[current]
    ? incoming
    : current;
}

type QuestionnaireSaveWaiter = {
  reject: (reason?: unknown) => void;
  resolve: () => void;
};

type QuestionnaireSaveRequest = {
  payload: QuestionnaireCommitPayload;
  revision: number;
  waiters: QuestionnaireSaveWaiter[];
};

export type QuestionnaireInitialFocus = {
  applicantId?: string;
  fileId?: string;
  field?: string;
  section?: string;
};

export type QuestionnaireDocumentsFilter = "error" | "missing";

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
  homeBuilding: string;
  homeHouse: string;
  homeStreet: string;
  homeUnit: string;
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

type StructuredHomeAddressKey =
  | "homeBuilding"
  | "homeHouse"
  | "homeStreet"
  | "homeUnit";

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

const RUSSIAN_STREET_TYPE_SUGGESTIONS = [
  "улица ",
  "проспект ",
  "переулок ",
  "набережная ",
  "шоссе ",
  "проезд ",
  "площадь ",
  "бульвар ",
];

const RUSSIAN_BUILDING_TYPE_SUGGESTIONS = ["корпус ", "строение "];

const RUSSIAN_UNIT_TYPE_SUGGESTIONS = ["квартира ", "офис ", "помещение "];

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

function formatDateInput(
  value: string,
  inputType: string | undefined,
  intent: QuestionnaireDateIntent,
) {
  const sanitized = value.replace(/[^\d.]/g, "").slice(0, 10);
  const digits = sanitized.replace(/\D/g, "").slice(0, 8);

  // Keep compact digit-only input untouched until blur so both DDMYY and
  // DDMMYY remain possible (for example 22626 and 221226).
  if (!sanitized.includes(".")) {
    return digits.length === 8 ? normalizeDateInput(digits, intent) : digits;
  }
  if (inputType?.startsWith("delete")) return sanitized;
  if (digits.length <= 1) return digits;
  if (digits.length <= 3) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}${
      digits.length === 4 ? "." : ""
    }`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

function normalizeDateInput(value: string, intent: QuestionnaireDateIntent) {
  const digits = value.replace(/\D/g, "");
  const expandYear = (twoDigitYear: string) => {
    const numericYear = Number(twoDigitYear);
    if (intent === "unknown") return undefined;
    if (intent === "future") return String(2000 + numericYear);
    const currentYear = new Date().getFullYear();
    const currentTwoDigitYear = currentYear % 100;
    return String(
      numericYear <= currentTwoDigitYear
        ? 2000 + numericYear
        : 1900 + numericYear,
    );
  };
  let day = "";
  let month = "";
  let year = "";

  if (digits.length === 5) {
    day = digits.slice(0, 2);
    month = digits.slice(2, 3).padStart(2, "0");
    year = expandYear(digits.slice(3)) ?? "";
  } else if (digits.length === 6) {
    day = digits.slice(0, 2);
    month = digits.slice(2, 4);
    year = expandYear(digits.slice(4)) ?? "";
  } else if (digits.length === 8) {
    day = digits.slice(0, 2);
    month = digits.slice(2, 4);
    year = digits.slice(4);
  } else {
    return value;
  }

  if (!year) return value;
  const normalized = `${day}.${month}.${year}`;
  return parseQuestionnaireDate(normalized) ? normalized : value;
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
  addressAssist,
  compact,
  errorMessage,
  focused,
  fullWidth,
  hint,
  label,
  modelFieldId,
  number,
  onAddressSuggestionAccept,
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
  const visiblePlaceholder = placeholder?.replace(/^Например,\s*/iu, "");
  const filteredOptions = useMemo(() => {
    if (!options) return [];
    const query = optionQuery.trim().toLocaleLowerCase("ru-RU");
    return query
      ? options.filter((option) => optionMatchesSearch(option, query))
      : options;
  }, [optionQuery, options]);
  const dateField = isQuestionnaireDateField({ id: modelFieldId, label });
  const dateIntent = questionnaireDateIntent({ id: modelFieldId, label });
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
  const addressSuggestion = useMemo(
    () => (addressAssist ? suggestedRussianAddress(value) : undefined),
    [addressAssist, value],
  );
  const inputSuggestionListOpen = Boolean(
    inputSuggestions.length &&
    isSuggestionsOpen &&
    !addressSuggestion &&
    visibleInputSuggestions.length,
  );

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
  const copyPreview = fieldContract?.copyPreview(modelFieldId) ?? false;
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
  const isFilled = Boolean(value.trim()) && effectiveState === "normal";
  const baseClasses = "v19-questionnaire-field-control";
  const stateClasses =
    effectiveState === "needs_review"
      ? "is-review"
      : effectiveState === "invalid"
        ? "is-invalid"
        : isFilled
          ? "is-normal is-filled"
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
    inputSuggestionListOpen &&
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

  function handleInputKeyboard(event: React.KeyboardEvent<HTMLInputElement>) {
    if (
      dateField &&
      event.currentTarget.selectionStart === event.currentTarget.selectionEnd
    ) {
      const caret = event.currentTarget.selectionStart;
      if (
        caret !== null &&
        event.key === "Backspace" &&
        caret > 0 &&
        value[caret - 1] === "."
      ) {
        event.preventDefault();
        const input = event.currentTarget;
        const deleteIndex = caret - 2;
        const nextValue =
          deleteIndex >= 0
            ? `${value.slice(0, deleteIndex)}${value.slice(deleteIndex + 1)}`
            : value.slice(caret);
        onChange?.(
          formatDateInput(nextValue, "deleteContentBackward", dateIntent),
        );
        window.requestAnimationFrame(() => {
          const nextCaret = Math.max(0, caret - 2);
          input.setSelectionRange(nextCaret, nextCaret);
        });
        return;
      }
      if (caret !== null && event.key === "Delete" && value[caret] === ".") {
        event.preventDefault();
        const input = event.currentTarget;
        const nextValue = `${value.slice(0, caret + 1)}${value.slice(caret + 2)}`;
        onChange?.(
          formatDateInput(nextValue, "deleteContentForward", dateIntent),
        );
        window.requestAnimationFrame(() =>
          input.setSelectionRange(caret + 1, caret + 1),
        );
        return;
      }
    }

    handleSuggestionKeyboard(event);
  }

  return (
    <div
      data-field-focused={canonicalFocused ? "true" : undefined}
      data-field-filled={isFilled ? "true" : undefined}
      data-field-label={label}
      data-model-field-id={modelFieldId}
      data-family-copy-preview={copyPreview ? "true" : undefined}
      className={`v19-questionnaire-field v19-questionnaire-field-cell flex flex-col ${
        canonicalState === "needs_review" ? "has-review-confirmation " : ""
      }${copyPreview ? "is-copy-preview " : ""}${
        fullWidth ? "col-span-1 md:col-span-2" : "col-span-1"
      }`}
    >
      <label
        className="v19-questionnaire-field-label"
        htmlFor={usesQuickOptions ? undefined : fieldId}
      >
        {number ? (
          <span className="v19-questionnaire-field-number">{number}</span>
        ) : null}
        <span className="v19-questionnaire-field-label-text" id={fieldLabelId}>
          {label}
          {canonicalRequired ? (
            <span className="v19-questionnaire-required-mark">*</span>
          ) : null}
        </span>
      </label>

      <div
        className={`v19-questionnaire-control-shell${
          canonicalState === "needs_review" ? " has-confirmation" : ""
        }`}
      >
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
            data-option-count={visibleQuickOptions?.length}
            data-wrap-options={label === "Тип принимающей стороны" ? "true" : undefined}
            role="group"
          >
            {visibleQuickOptions?.map((option) => (
              <button
                {...agentInteractionProps(
                  collapsesQuickOptions && value === option
                    ? "questionnaire.navigate"
                    : "questionnaire.update-field",
                )}
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
              {...agentInteractionProps("questionnaire.navigate")}
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
              <span className="v19-questionnaire-select-value">
                {value || (
                  <span className="v19-questionnaire-placeholder">
                    {visiblePlaceholder || "Выберите вариант"}
                  </span>
                )}
              </span>
              <ChevronDown className="w-4 h-4 text-white/40 shrink-0 ml-2" />
            </button>

            <AnimatePresence>
              {isOpen ? (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="v19-questionnaire-dropdown"
                  exit={{ opacity: 0, y: -4 }}
                  initial={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                >
                  {usesOptionSearch ? (
                    <input
                      {...agentInteractionProps("questionnaire.search")}
                      aria-activedescendant={activeOptionId}
                      aria-controls={optionsListboxId}
                      aria-label={`Поиск: ${label}`}
                      className="v19-questionnaire-field-control"
                      placeholder="Найти вариант"
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
                        {...agentInteractionProps("questionnaire.update-field")}
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
            {...(onChange ? agentInteractionProps("questionnaire.update-field") : {})}
            aria-describedby={shouldShowError ? fieldErrorId : undefined}
            aria-invalid={effectiveState === "invalid" ? "true" : undefined}
            aria-label={label}
            aria-required={canonicalRequired ? "true" : undefined}
            className={`${baseClasses} is-textarea ${compact ? "is-compact-address" : ""} ${stateClasses}`}
            id={fieldId}
            name={modelFieldId}
            onBlur={onBlur}
            placeholder={visiblePlaceholder}
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
              {...(onChange ? agentInteractionProps("questionnaire.update-field") : {})}
              aria-describedby={shouldShowError ? fieldErrorId : undefined}
              aria-invalid={effectiveState === "invalid" ? "true" : undefined}
              aria-label={label}
              aria-required={canonicalRequired ? "true" : undefined}
              aria-activedescendant={activeSuggestionId}
              aria-autocomplete={inputSuggestions.length ? "list" : undefined}
              aria-controls={inputSuggestions.length ? suggestionsId : undefined}
              aria-expanded={
                inputSuggestions.length ? inputSuggestionListOpen : undefined
              }
              autoComplete={
                inputSuggestions.length ? "off" : inputAutocomplete(label, type)
              }
              className={`${baseClasses} ${compact ? "is-compact-address" : ""} ${
                dateField ? "is-date" : ""
              } ${stateClasses}`}
              inputMode={dateField ? "numeric" : phonePrefix ? "tel" : undefined}
              id={fieldId}
              maxLength={
                dateField
                  ? 10
                  : phonePrefix
                    ? phonePrefix === "+7"
                      ? 17
                      : 15
                    : undefined
              }
              name={modelFieldId}
              placeholder={
                visiblePlaceholder ??
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
                if (dateField && onChange) {
                  const normalizedDate = normalizeDateInput(
                    event.currentTarget.value,
                    dateIntent,
                  );
                  if (normalizedDate !== value) onChange(normalizedDate);
                }
                onBlur?.();
                if (
                  suggestionsRef.current?.contains(event.relatedTarget as Node | null)
                )
                  return;
                setIsSuggestionsOpen(false);
                setActiveSuggestionIndex(-1);
              }}
              onChange={(event) => {
                const inputType = (event.nativeEvent as InputEvent).inputType;
                const nextValue = phonePrefix
                  ? formatPhoneInput(event.target.value, phonePrefix)
                  : dateField
                    ? formatDateInput(event.target.value, inputType, dateIntent)
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
              onKeyDown={handleInputKeyboard}
            />
            {inputSuggestionListOpen ? (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="v19-questionnaire-dropdown"
                exit={{ opacity: 0, y: -4 }}
                id={suggestionsId}
                initial={{ opacity: 0, y: -4 }}
                role="listbox"
                transition={{ duration: 0.15 }}
              >
                {visibleInputSuggestions.map((suggestion, index) => (
                  <button
                    {...agentInteractionProps("questionnaire.update-field")}
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
              {...agentInteractionProps("questionnaire.update-field")}
              aria-label={`Подтвердить поле: ${label}`}
              type="button"
              onClick={() => fieldContract?.confirmReview(modelFieldId)}
            >
              Подтвердить
            </button>
          </div>
        ) : null}
      </div>

      {addressSuggestion && onChange ? (
        <div className="v19-questionnaire-address-suggestion" role="status">
          <span>
            <small>Предлагаем записать</small>
            <strong>{addressSuggestion}</strong>
          </span>
          <button
            {...agentInteractionProps("questionnaire.update-field")}
            aria-label={`Подставить адрес: ${label}`}
            type="button"
            onClick={() => (onAddressSuggestionAccept ?? onChange)(addressSuggestion)}
          >
            Подставить
          </button>
        </div>
      ) : null}

      {shouldShowError ? (
        <div className="v19-questionnaire-field-message is-error" id={fieldErrorId}>
          <span className="v19-questionnaire-field-error">
            <AlertCircle className="v19-questionnaire-field-error-icon w-3.5 h-3.5" />
            {effectiveErrorMessage}
          </span>
        </div>
      ) : null}

      {hint ? <p className="v19-questionnaire-field-hint">{hint}</p> : null}
    </div>
  );
}

type QuestionnaireDateRangeProps = {
  endValue: string;
  onEndChange: (value: string) => void;
  onStartChange: (value: string) => void;
  startValue: string;
};

function QuestionnaireDateRange({
  endValue,
  onEndChange,
  onStartChange,
  startValue,
}: QuestionnaireDateRangeProps) {
  return (
    <div
      aria-label="Желаемый интервал"
      className="v19-questionnaire-date-range v19-questionnaire-field-cell col-span-1"
      role="group"
    >
      <div className="v19-questionnaire-date-range-heading">
        <span className="v19-questionnaire-field-number">A2</span>
        <span>Желаемый интервал</span>
      </div>
      <div className="v19-questionnaire-date-range-controls">
        <FormField
          label="С какого числа"
          modelFieldId="desired-date-1"
          value={startValue}
          onChange={onStartChange}
        />
        <FormField
          label="По какое число"
          modelFieldId="desired-date-2"
          value={endValue}
          onChange={onEndChange}
        />
      </div>
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
        name: "Заявитель 1",
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
    const completed = completedFields;
    const total = requiredFields.length;
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
          issue.status === "open" &&
          issue.target.applicantId === applicant.id &&
          isQuestionnaireFieldIssue(submission, issue),
      );

    const questionnaireName = [formData.firstName, formData.surname]
      .map((part) => (part ?? "").trim())
      .filter(Boolean)
      .join(" ");
    const sourceName = questionnaireName || applicant.fullName.trim();
    const hasActualName =
      Boolean(sourceName) && !/^(?:заявитель|applicant)\s*\d*$/iu.test(sourceName);
    const displayName = hasActualName
      ? sourceName
          .toLocaleLowerCase("ru-RU")
          .replace(
            /(^|[\s'-])(\p{L})/gu,
            (_, separator: string, letter: string) =>
              `${separator}${letter.toLocaleUpperCase("ru-RU")}`,
          )
      : `Заявитель ${index + 1}`;

    return {
      completed,
      id: applicant.id ?? `app-${index + 1}`,
      index: index + 1,
      name: displayName,
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
    homeBuilding: "",
    homeHouse: "",
    homeStreet: "",
    homeUnit: "",
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

type QuestionnaireBlockerTarget = {
  applicantId: string;
  deferredUntilSectionExit?: boolean;
  label?: string;
  reason?: string;
  sectionId: SectionId;
};

function questionnaireUpdateKey(
  update: Pick<QuestionnaireFieldUpdate, "applicantId" | "fieldId" | "sectionId">,
) {
  return `${update.applicantId}:${update.sectionId}:${update.fieldId}`;
}

function questionnaireCommitMutationFingerprint(
  payload: QuestionnaireCommitPayload,
) {
  const fieldUpdates = [...payload.fieldUpdates].sort((left, right) =>
    questionnaireUpdateKey(left).localeCompare(questionnaireUpdateKey(right)),
  );
  const reviewConfirmations = [...payload.reviewConfirmations].sort((left, right) =>
    `${left.applicantId}:${left.sectionId}:${left.fieldId}`.localeCompare(
      `${right.applicantId}:${right.sectionId}:${right.fieldId}`,
    ),
  );

  return JSON.stringify({
    fieldUpdates,
    focusedUpdate: payload.focusedUpdate,
    reviewConfirmations,
    travelEnd: payload.travelEnd,
    travelStart: payload.travelStart,
  });
}

function mergeQuestionnaireCommitPayloads(
  current: QuestionnaireCommitPayload,
  incoming: QuestionnaireCommitPayload,
): QuestionnaireCommitPayload {
  const fieldUpdates = new Map<string, QuestionnaireFieldUpdate>();
  for (const update of [...current.fieldUpdates, ...incoming.fieldUpdates]) {
    fieldUpdates.set(questionnaireUpdateKey(update), update);
  }
  const mergedFieldUpdates = [...fieldUpdates.values()];

  return {
    fieldUpdates: mergedFieldUpdates,
    focusedUpdate: incoming.focusedUpdate ?? current.focusedUpdate,
    reviewConfirmations: mergedFieldUpdates
      .filter((update) => update.reviewState === "confirmed")
      .map((update) => ({
        applicantId: update.applicantId,
        fieldId: update.fieldId,
        sectionId: update.sectionId,
      })),
    saveIntent: strongestQuestionnaireSaveIntent(
      current.saveIntent,
      incoming.saveIntent,
    ),
    travelEnd: incoming.travelEnd,
    travelStart: incoming.travelStart,
  };
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
    homeBuilding: submissionFieldValue(
      applicant,
      "home-building",
      fallback.homeBuilding,
    ),
    homeHouse: submissionFieldValue(applicant, "home-house", fallback.homeHouse),
    homeStreet: submissionFieldValue(applicant, "home-street", fallback.homeStreet),
    homeUnit: submissionFieldValue(applicant, "home-unit", fallback.homeUnit),
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
  { fieldId: "home-street", formKey: "homeStreet", sectionId: "contacts" },
  { fieldId: "home-house", formKey: "homeHouse", sectionId: "contacts" },
  { fieldId: "home-building", formKey: "homeBuilding", sectionId: "contacts" },
  { fieldId: "home-unit", formKey: "homeUnit", sectionId: "contacts" },
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
  { fieldId: "cost-covered-by", formKey: "paymentSponsor", sectionId: "trip" },
  { fieldId: "means-of-support", formKey: "paymentType", sectionId: "trip" },
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

// Exported only for the exhaustive blueprint/binding/rendering contract test.
// eslint-disable-next-line react-refresh/only-export-components
export const questionnaireUiNonRenderedFieldDispositions = {
  "birth-citizenship": "derived from country of birth",
  "category": "service-managed appointment value",
  "cost-covered-by": "service-managed payment value",
  "final-entry-permit": "reserved optional visa field",
  "final-entry-permit-issued-by": "reserved optional visa field",
  "final-entry-permit-valid-from": "reserved optional visa field",
  "final-entry-permit-valid-to": "reserved optional visa field",
  "home-address": "derived from structured address fields",
  "means-of-support": "service-managed payment value",
  "nationality": "derived from passport issue country",
  "visa-type": "service-managed appointment value",
} as const;

// Legacy form keys stay bound for previously saved submissions, but they are
// not part of the current seven-section questionnaire blueprint.
// eslint-disable-next-line react-refresh/only-export-components
export const questionnaireUiLegacyBindingDispositions = {
  "appointment-note": { reason: "legacy appointment note", sectionId: "appointment" },
  "desired-date-3": { reason: "legacy third appointment date", sectionId: "appointment" },
  "occupation-specify": { reason: "legacy free-form occupation", sectionId: "employment" },
  "eu-relationship": { reason: "legacy EU-relative relation", sectionId: "euRelative" },
  "eu-relative-details": { reason: "legacy EU-relative details", sectionId: "euRelative" },
  "form-filler-contact": { reason: "legacy form-filler contact", sectionId: "filler" },
  "form-filler-name": { reason: "legacy form-filler name", sectionId: "filler" },
  "form-filler-phone": { reason: "legacy form-filler phone", sectionId: "filler" },
  "other-sponsor": { reason: "legacy sponsor identity", sectionId: "payment" },
  "sponsor-in-host-fields": { reason: "legacy sponsor host data", sectionId: "payment" },
  "sponsor-means": { reason: "legacy sponsor means", sectionId: "payment" },
  "national-id": { reason: "legacy national identifier", sectionId: "personal" },
  "other-citizenship": { reason: "legacy additional citizenship", sectionId: "personal" },
} as const;

// eslint-disable-next-line react-refresh/only-export-components
export function questionnaireUiBindingContract() {
  return questionnaireFieldBindings.map(({ fieldId, sectionId }) => ({
    fieldId,
    sectionId,
  }));
}

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
    const field = section.fields.find((candidate) =>
      candidateIds.includes(candidate.id),
    );
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
      const binding = questionnaireFieldBindingForApplicant(applicant, fieldKey);
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
  "desired-date-1": ["Желаемый интервал — с", "С какого числа"],
  "desired-date-2": ["Желаемый интервал — по", "По какое число"],
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

function isQuestionnaireFieldIssue(
  submission: Submission,
  issue: Submission["issues"][number],
) {
  if (
    !issue.target.applicantId ||
    !issue.target.field ||
    passportReviewMediaTypeForIssue(issue)
  ) {
    return false;
  }

  const applicant = submission.applicants.find(
    (candidate) => candidate.id === issue.target.applicantId,
  );
  if (!applicant) return false;

  return questionnaireFieldBindings.some((binding) =>
    issueFieldMatches(
      binding.fieldId,
      questionnaireField(applicant, binding.fieldId)?.label ?? "",
      issue.target.field,
    ),
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
  if (section.includes("запис")) return "appointment";
  if (section.includes("паспорт")) return "passport";
  if (section.includes("личн")) return "personal";
  if (section.includes("поезд") || section.includes("маршрут")) return "trip";
  if (section.includes("адрес") || section.includes("контакт")) return "contact";
  if (section.includes("работ")) return "employment";
  if (section.includes("отел") || section.includes("приглаш")) return "hotel";
  if (section.includes("оплат")) return "trip";
  return "personal";
}

function sectionIdMatches(sectionId: string, canonicalId: string) {
  return sectionId === canonicalId || sectionId.endsWith(`-${canonicalId}`);
}

function departedSectionKey(applicantId: string, sectionId: SectionId) {
  return `${encodeURIComponent(applicantId)}::${sectionId}`;
}

function departedSectionContext(key: string) {
  const [encodedApplicantId, sectionId] = key.split("::", 2);
  return {
    applicantId: decodeURIComponent(encodedApplicantId ?? ""),
    sectionId: sectionId as SectionId,
  };
}

export function FigmaQuestionnaireScreen({
  initialFocus,
  onBack,
  onFieldChange,
  onMarkIssueFixed,
  onSaveDraft,
  onSaveAndExit,
  submission,
}: FigmaQuestionnaireScreenProps) {
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
  const questionnaireStatus = agentQuestionnaireStatusPresentation(
    draftSubmission.status,
  );
  const isEditable = questionnaireStatus.canEdit;
  const applicants = useMemo(() => applicantTabs(draftSubmission), [draftSubmission]);
  const touristSelectOptions = useMemo(
    () =>
      applicants.map((applicant) => ({
        description: applicantDropdownDescription(applicant),
        label: applicant.name,
        tone:
          applicant.status === "complete"
            ? ("muted" as const)
            : applicant.status === "issue"
              ? ("warning" as const)
              : ("default" as const),
        value: applicant.id,
      })),
    [applicants],
  );
  const initialApplicantId = initialFocus?.applicantId ?? applicants[0]?.id ?? "app-1";
  const initialFocusApplicant =
    draftSubmission.applicants.find(
      (applicant) => applicant.id === initialApplicantId,
    ) ?? draftSubmission.applicants[0];
  const initialFieldTarget = focusableFieldFor(
    initialFocus?.field,
    initialFocusApplicant,
  );
  const [activeApplicant, setActiveApplicant] = useState(initialApplicantId);
  const [activeSection, setActiveSection] = useState<SectionId>(
    sectionForFocus(initialFocus, initialFieldTarget),
  );
  const [showGuardianDetails, setShowGuardianDetails] = useState(false);
  const [fieldSearchQuery, setFieldSearchQuery] = useState("");
  const [familyCopyMessage, setFamilyCopyMessage] = useState<string>();
  const [familyCopyPreview, setFamilyCopyPreview] =
    useState<QuestionnaireFamilyCopyPlan>();
  const [departedSectionKeys, setDepartedSectionKeys] = useState<string[]>([]);
  const [revealRequiredErrors, setRevealRequiredErrors] = useState(false);
  const [issueResolutionError, setIssueResolutionError] = useState("");
  const [pendingIssueResolutionId, setPendingIssueResolutionId] = useState<
    string | null
  >(null);
  const [saveMessage, setSaveMessage] = useState("Изменений нет");
  const [saveStatus, setSaveStatus] = useState<
    "dirty" | "error" | "idle" | "saved" | "saving"
  >("idle");
  const [saveFailureAction, setSaveFailureAction] =
    useState<QuestionnaireSaveFailureAction>();
  const [discardExitArmed, setDiscardExitArmed] = useState(false);
  const [navigationPending, setNavigationPending] = useState(false);
  const familyCopyStatusId = useId();
  const prefersReducedMotion = useReducedMotion();
  const autosaveRevisionRef = useRef(0);
  const failedSaveRevisionRef = useRef<number | undefined>(undefined);
  const autosaveTimerRef = useRef<number | undefined>(undefined);
  const completionInFlightRef = useRef(false);
  const issueResolutionPendingRef = useRef(false);
  const issueResolutionPromiseRef = useRef<Promise<boolean> | undefined>(
    undefined,
  );
  const navigationPendingRef = useRef(false);
  const saveAndExitDraftReadyRef = useRef(false);
  const inFlightSaveRef = useRef<QuestionnaireSaveRequest | undefined>(undefined);
  const queuedSaveRef = useRef<QuestionnaireSaveRequest | undefined>(undefined);
  const onSaveDraftRef = useRef(onSaveDraft);
  const canSaveDraft = Boolean(onSaveDraft);
  const initialFocusAppliedRef = useRef(false);
  const [highlightedInitialFieldId, setHighlightedInitialFieldId] = useState<
    string | undefined
  >(initialFieldTarget?.fieldId);
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
  const formDataRef = useRef<QuestionnaireFormData>(sourceFormData);
  const screenRef = useRef<HTMLDivElement>(null);
  const workPanelRef = useRef<HTMLDivElement>(null);
  const activeApplicantTabRef = useRef<HTMLButtonElement>(null);
  const activePinnedSectionTabRef = useRef<HTMLButtonElement>(null);
  const activeSidebarSectionTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    pendingFieldUpdatesRef.current = {};
    setPendingFieldUpdates({});
    setFamilyCopyMessage(undefined);
    setFamilyCopyPreview(undefined);
    setDepartedSectionKeys([]);
    setRevealRequiredErrors(false);
    setSaveStatus("idle");
    setSaveMessage("Изменений нет");
    setSaveFailureAction(undefined);
    setDiscardExitArmed(false);
    navigationPendingRef.current = false;
    saveAndExitDraftReadyRef.current = false;
    failedSaveRevisionRef.current = undefined;
    issueResolutionPendingRef.current = false;
    issueResolutionPromiseRef.current = undefined;
    setNavigationPending(false);
  }, [submission.id]);

  useEffect(() => {
    onSaveDraftRef.current = onSaveDraft;
  }, [onSaveDraft]);

  useEffect(() => {
    if (applicants.some((applicant) => applicant.id === activeApplicant)) return;
    setActiveApplicant(applicants[0]?.id ?? "app-1");
  }, [activeApplicant, applicants]);

  useEffect(() => {
    setShowGuardianDetails(false);
  }, [activeApplicant]);

  useEffect(() => {
    setFamilyCopyMessage(undefined);
    setFamilyCopyPreview(undefined);
  }, [activeApplicant, activeSection]);

  useEffect(() => {
    formDataRef.current = sourceFormData;
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
    initialFocusAppliedRef.current = false;
    setHighlightedInitialFieldId(initialFieldTarget?.fieldId);
  }, [
    initialFieldTarget?.fieldId,
    initialFocus?.applicantId,
    initialFocus?.field,
    initialFocus?.fileId,
    initialFocus?.section,
    submission.id,
  ]);

  useEffect(() => {
    if (initialFocusAppliedRef.current) return;
    let attempt = 0;
    let timer: number | undefined;
    const finishInitialFocus = () => {
      initialFocusAppliedRef.current = true;
      setHighlightedInitialFieldId(undefined);
    };
    const applyInitialFocus = () => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement !== document.body &&
        screenRef.current?.contains(activeElement)
      ) {
        finishInitialFocus();
        return;
      }
      const fieldLabel = initialFieldTarget
        ? (questionnaireField(activeApplicantModel, initialFieldTarget.fieldId)
            ?.label ?? initialFieldTarget.labels[0])
        : undefined;
      const focusedFile = screenRef.current?.querySelector<HTMLElement>(
        '[data-file-focused="true"]',
      );
      if (focusedFile) {
        focusedFile.focus({ preventScroll: true });
        focusedFile.scrollIntoView?.({ behavior: "smooth", block: "center" });
        finishInitialFocus();
        return;
      }
      if (fieldLabel) {
        const element =
          screenRef.current?.querySelector<HTMLElement>(
            '[data-field-focused="true"]',
          ) ??
          screenRef.current?.querySelector<HTMLElement>(
            `[data-field-label="${CSS.escape(fieldLabel)}"]`,
          );
        const target = element?.querySelector<HTMLElement>(
          "input, textarea, button, [tabindex]",
        );
        if (target) {
          target.focus({ preventScroll: true });
          element?.scrollIntoView?.({ behavior: "smooth", block: "center" });
          finishInitialFocus();
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
      finishInitialFocus();
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
          issue.target.applicantId === activeApplicant &&
          isQuestionnaireFieldIssue(draftSubmission, issue),
      ),
    [activeApplicant, draftSubmission],
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
      (issue) =>
        issue.status === "open" &&
        isQuestionnaireFieldIssue(draftSubmission, issue),
    ).length;
    const total = requiredFields.length;
    const completed = completedFields.length;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    const risks = validationRisks + openIssueRisks;

    return {
      completed,
      completedFields: completedFields.length,
      fieldTotal: requiredFields.length,
      percent,
      risks,
      total,
    };
  }, [draftSubmission]);

  const sections = useMemo(
    () =>
      sectionDefinitions.map(({ canonicalId, ...definition }) => {
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
    [activeApplicantModel, draftSubmission],
  );
  const activeApplicantContext = applicants.find(
    (applicant) => applicant.id === activeApplicant,
  );
  const activeSectionContext = sections.find((section) => section.id === activeSection);
  const activeSectionIndex = sections.findIndex(
    (section) => section.id === activeSection,
  );
  const previousSection = sections[activeSectionIndex - 1];
  const nextSection = sections[activeSectionIndex + 1];
  const activeApplicantIndex = applicants.findIndex(
    (applicant) => applicant.id === activeApplicant,
  );
  const nextApplicant = applicants[activeApplicantIndex + 1];
  let continueActionLabel = "Готово — сохранить и выйти";
  if (nextSection) {
    continueActionLabel = `Далее: ${nextSection.title}`;
  } else if (nextApplicant) {
    continueActionLabel = `Далее: ${nextApplicant.name}`;
  }
  const showResidencePermitFields = formData.livesOutsideCitizenship === "Да";
  const showPurposeDetails = formData.stayPurpose === "OTHER";
  const showPreviousBiometricsDetails = formData.previousBiometrics === "Да";
  const applicantIsMinor = isBlsQuestionnaireMinorApplicant(
    activeApplicantModel?.role,
    formData as unknown as BlsFormData,
  );
  const guardianDetailsAreVisible =
    applicantIsMinor && (Boolean(formData.guardianInfo.trim()) || showGuardianDetails);
  const showCompanyInviteFields = isBlsQuestionnaireInvitingCompanySelected(formData);
  const primaryApplicantId = primaryApplicantIdForPassportReview(draftSubmission);
  const primaryApplicant = draftSubmission.applicants.find(
    (applicant) => applicant.id === primaryApplicantId,
  );
  const familyCopyRecipients = primaryApplicant
    ? draftSubmission.applicants.filter(
        (applicant) => applicant.id !== primaryApplicant.id,
      )
    : [];
  const canCopyFamilyWide =
    draftSubmission.type === "family" &&
    Boolean(primaryApplicant) &&
    familyCopyRecipients.length > 0;
  const canCopyCurrentSection = familyCopySectionIds.has(activeSection);
  const showFamilyCopyControl =
    isEditable &&
    canCopyFamilyWide &&
    canCopyCurrentSection &&
    activeApplicant === primaryApplicant?.id;

  const currentSectionIssue = useMemo(() => {
    const currentSection = sections.find((section) => section.id === activeSection);
    if (!currentSection) return undefined;
    const currentCanonicalSection = sectionDefinitions.find(
      (definition) => definition.id === activeSection,
    )?.canonicalId;

    return activeBlockingIssues.find((issue) => {
      if (!issue.target.field) return false;
      const declaredSection = sections.find((section) =>
        sameFieldLabel(section.title, issue.target.section),
      );
      if (declaredSection) return declaredSection.id === activeSection;

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
  const currentIssueCorrectionConfirmed = Boolean(
    currentSectionIssue &&
      currentSectionIssue.status === "open" &&
      isAgentIssueCorrectionConfirmed(draftSubmission, currentSectionIssue),
  );
  const currentIssueCompletesCorrectionSet = Boolean(
    currentSectionIssue &&
      currentSectionIssue.status === "open" &&
      draftSubmission.issues
        .filter(
          (issue) =>
            issue.status === "open" && issue.id !== currentSectionIssue.id,
        )
        .every((issue) =>
          isAgentIssueCorrectionConfirmed(draftSubmission, issue),
        ),
  );

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
    failedSaveRevisionRef.current = undefined;
    saveAndExitDraftReadyRef.current = false;
    setSaveFailureAction(undefined);
    setDiscardExitArmed(false);
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
    if (
      !isEditable ||
      completionInFlightRef.current ||
      navigationPendingRef.current ||
      issueResolutionPendingRef.current
    ) {
      return;
    }
    if (familyCopyPreview) {
      setFamilyCopyPreview(undefined);
      setFamilyCopyMessage(
        "Предпросмотр отменён: данные изменились. Откройте копирование заново.",
      );
    }
    const dependentKeys = dependentFieldKeysFor(
      key,
      value,
      activeApplicantModel?.role,
      formDataRef.current,
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
            modelField?.reviewOriginSource ?? modelField?.reviewSource ?? "manual",
          reviewSource: "manual",
          reviewState:
            modelField?.reviewState === "needs_review" ? "confirmed" : undefined,
          sectionId: binding.sectionId,
          value: fieldValue,
        } satisfies QuestionnaireFieldUpdate,
      };
    };

    const directUpdates = [
      buildUpdate(key, value),
      ...dependentKeys.map((dependentKey) => buildUpdate(dependentKey, "")),
    ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const updates = directUpdates;
    const nextFormData = { ...formDataRef.current, [key]: value };
    for (const dependentKey of dependentKeys) nextFormData[dependentKey] = "";
    formDataRef.current = nextFormData;
    setFormData(nextFormData);

    if (updates.length) {
      const next = { ...pendingFieldUpdatesRef.current };
      for (const { update } of updates) {
        const updateKey = questionnaireUpdateKey(update);
        const baseApplicant = submission.applicants.find(
          (applicant) => applicant.id === update.applicantId,
        );
        const baseField = questionnaireField(baseApplicant, update.fieldId);
        const confirmsPendingReview =
          update.reviewState === "confirmed" &&
          baseField?.reviewState === "needs_review";
        if (update.value === (baseField?.value ?? "") && !confirmsPendingReview) {
          delete next[updateKey];
        } else {
          next[updateKey] = update;
        }
      }
      replacePendingFieldUpdates(next);
      updateDirtyState(next);
    }

    for (const { update } of updates) {
      const baseApplicant = submission.applicants.find(
        (applicant) => applicant.id === update.applicantId,
      );
      if (
        update.value !==
        (questionnaireField(baseApplicant, update.fieldId)?.value ?? "")
      ) {
        onFieldChange?.(update);
      }
    }
  }

  function updateTravelDate(key: "travelStart" | "travelEnd", value: string) {
    const travelStart = key === "travelStart" ? value : formData.travelStart;
    const travelEnd = key === "travelEnd" ? value : formData.travelEnd;
    updateField(key, value);
    updateField("stayDuration", blsStayDurationFromDates(travelStart, travelEnd));
  }

  function updateStructuredAddressField(key: StructuredHomeAddressKey, value: string) {
    const nextAddressData = { ...formData, [key]: value };
    updateField(key, value);
    updateField("contactAddress", composeQuestionnaireHomeAddress(nextAddressData));
  }

  function applyHomeAddressSuggestion(value: string) {
    const structured = structuredQuestionnaireHomeAddressFromText(value);
    if (!structured) {
      updateStructuredAddressField("homeStreet", value);
      return;
    }

    updateField("homeStreet", structured.homeStreet);
    updateField("homeHouse", structured.homeHouse);
    updateField("homeBuilding", structured.homeBuilding);
    updateField("homeUnit", structured.homeUnit);
    updateField("contactAddress", composeQuestionnaireHomeAddress(structured));
  }

  function updatePassportIssueDate(value: string) {
    updateField("passportIssued", value);

    const suggestedExpiry = passportExpiryFromIssueDate(value);
    if (formData.passportExpiry || !suggestedExpiry) return;

    updateField("passportExpiry", suggestedExpiry);
  }

  function applyPassportValidityYears(validityYears: 5 | 10) {
    const expiry = passportExpiryFromIssueDate(formData.passportIssued, validityYears);
    if (expiry) updateField("passportExpiry", expiry);
  }

  function updateBirthDate(value: string) {
    const suggestedBirthCountry = defaultBirthCountryForDate(value);
    const birthCountryIsUntouchedDefault =
      formData.birthCountry === baseFormData.birthCountry &&
      ["", "USSR", "Russian Federation"].includes(baseFormData.birthCountry);

    updateField("dob", value);
    if (suggestedBirthCountry && birthCountryIsUntouchedDefault) {
      updateBirthCountry(suggestedBirthCountry);
    }
  }

  function updateBirthCountry(value: string) {
    updateField("birthCountry", value);
    updateField(
      "birthCitizenship",
      value.trim().toUpperCase() === "USSR" ? "USSR" : "Russian Federation",
    );
  }

  function updatePassportIssueCountry(value: string) {
    updateField("passportIssueCountry", value);
    updateField("citizenship", value);
  }

  function normalizeBirthPlaceField() {
    const normalized = historicalBirthPlaceForDate(formData.birthPlace, formData.dob);
    if (normalized !== formData.birthPlace) updateField("birthPlace", normalized);
  }

  function copySharedDataToFamily() {
    if (
      !isEditable ||
      completionInFlightRef.current ||
      navigationPendingRef.current ||
      issueResolutionPendingRef.current ||
      !primaryApplicant ||
      !canCopyFamilyWide ||
      activeApplicant !== primaryApplicant.id ||
      !familyCopySectionIds.has(activeSection)
    ) {
      return;
    }

    const canonicalSectionId = sectionDefinitions.find(
      (definition) => definition.id === activeSection,
    )?.canonicalId;
    if (!canonicalSectionId) return;

    const plan = buildQuestionnaireFamilyCopyPlan({
      bindings: questionnaireFieldBindings
        .filter((binding) => binding.sectionId === canonicalSectionId)
        .map((binding) => ({
          candidateFieldIds: [
            binding.fieldId,
            ...(questionnaireFieldAliasesByFormKey[binding.formKey] ?? []),
          ],
          canonicalFieldId: binding.fieldId,
          sectionId: binding.sectionId,
        })),
      recipients: familyCopyRecipients,
      sourceApplicant: primaryApplicant,
      validate: validationMessageForQuestionnaireField,
    });
    if (!plan.updates.length) {
      setFamilyCopyPreview(undefined);
      setFamilyCopyMessage(familyCopyUnavailableMessage);
      return;
    }

    setFamilyCopyPreview(plan);
    setFamilyCopyMessage(undefined);
  }

  function confirmFamilyCopy() {
    if (
      !familyCopyPreview ||
      !isEditable ||
      navigationPendingRef.current ||
      issueResolutionPendingRef.current
    ) {
      return;
    }
    const next = { ...pendingFieldUpdatesRef.current };
    for (const update of familyCopyPreview.updates) {
      next[questionnaireUpdateKey(update)] = update;
      onFieldChange?.(update);
    }
    replacePendingFieldUpdates(next);
    updateDirtyState(next);
    setFamilyCopyMessage(
      `Скопировано и подтверждено после предпросмотра: ${familyCopyPreview.updates.length} полей · заявителей: ${familyCopyPreview.affectedApplicants}.`,
    );
    setFamilyCopyPreview(undefined);
  }

  function cancelFamilyCopy() {
    if (navigationPendingRef.current || issueResolutionPendingRef.current) return;
    setFamilyCopyPreview(undefined);
    setFamilyCopyMessage("Копирование отменено; данные не изменены.");
  }

  function fieldIssue(fieldId: string, label: string) {
    return openFieldIssues.find((issue) =>
      issueFieldMatches(fieldId, label, issue.target.field),
    );
  }

  function fieldReviewState(fieldId: string, label: string): FieldState {
    if (fieldId === "stay-duration") return "normal";
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
    if (
      !isEditable ||
      completionInFlightRef.current ||
      navigationPendingRef.current ||
      issueResolutionPendingRef.current
    ) {
      return;
    }
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

  function fieldErrorMessage(fieldId: string, label: string) {
    if (fieldId === "stay-duration") return undefined;
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
      const currentFormData = formDataRef.current;
      const conditionalClears = conditionalFieldClearsFor(
        activeApplicantModel,
        activeApplicant,
        currentFormData,
      );
      const updates = new Map<string, QuestionnaireFieldUpdate>();
      for (const update of [
        ...Object.values(pendingFieldUpdatesRef.current),
        ...conditionalClears,
      ]) {
        updates.set(questionnaireUpdateKey(update), update);
      }

      const automaticStayDuration = blsStayDurationFromDates(
        currentFormData.travelStart,
        currentFormData.travelEnd,
      );
      const stayDurationBinding = questionnaireFieldBindingForApplicant(
        activeApplicantModel,
        "stayDuration",
      );
      const stayDurationField = stayDurationBinding
        ? questionnaireField(activeApplicantModel, stayDurationBinding.fieldId)
        : undefined;
      if (
        stayDurationBinding &&
        stayDurationField &&
        stayDurationField.value !== automaticStayDuration
      ) {
        const automaticStayDurationUpdate = {
          applicantId: activeApplicant,
          error: validationMessageForQuestionnaireField(
            stayDurationField,
            automaticStayDuration,
          ),
          fieldId: stayDurationBinding.fieldId,
          sectionId: stayDurationBinding.sectionId,
          value: automaticStayDuration,
        } satisfies QuestionnaireFieldUpdate;
        updates.set(
          questionnaireUpdateKey(automaticStayDurationUpdate),
          automaticStayDurationUpdate,
        );
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
        travelEnd: currentFormData.travelEnd,
        travelStart: currentFormData.travelStart,
      };
    },
    [activeApplicant, activeApplicantModel, focusedUpdatePayload],
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
      let failed = false;
      if (autosaveRevisionRef.current === request.revision) {
        setSaveStatus("saving");
        setSaveMessage("Сохраняем…");
      }

      try {
        await onSaveDraftRef.current?.(request.payload);
        if (autosaveRevisionRef.current === request.revision) {
          clearAutosaveTimer();
          failedSaveRevisionRef.current = undefined;
          replacePendingFieldUpdates({});
          setSaveStatus("saved");
          setSaveMessage("Сохранено");
          setSaveFailureAction(undefined);
          setDiscardExitArmed(false);
        }
        for (const waiter of request.waiters) waiter.resolve();
      } catch (error) {
        failed = true;
        if (autosaveRevisionRef.current === request.revision) {
          clearAutosaveTimer();
          failedSaveRevisionRef.current = request.revision;
          setSaveStatus("error");
          setSaveFailureAction("draft");
          setDiscardExitArmed(false);
          setSaveMessage(questionnaireSaveFailureMessage(error));
        }
        for (const waiter of request.waiters) waiter.reject(error);
      } finally {
        inFlightSaveRef.current = undefined;
        const nextRequest = queuedSaveRef.current;
        queuedSaveRef.current = undefined;
        if (nextRequest) {
          saveRequestRunnerRef.current(
            failed && nextRequest.revision === request.revision
              ? {
                  ...nextRequest,
                  payload: mergeQuestionnaireCommitPayloads(
                    request.payload,
                    nextRequest.payload,
                  ),
                }
              : nextRequest,
          );
        }
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
        const queued = queuedSaveRef.current;
        if (
          !queued &&
          inFlight?.revision === revision &&
          questionnaireCommitMutationFingerprint(inFlight.payload) ===
            questionnaireCommitMutationFingerprint(payload)
        ) {
          const strongestIntent = strongestQuestionnaireSaveIntent(
            inFlight.payload.saveIntent,
            payload.saveIntent,
          );
          if (strongestIntent !== inFlight.payload.saveIntent) {
            queuedSaveRef.current = {
              payload: {
                ...payload,
                fieldUpdates: [],
                focusedUpdate: undefined,
                reviewConfirmations: [],
                saveIntent: strongestIntent,
              },
              revision,
              waiters: [waiter],
            };
            return;
          }
          inFlight.waiters.push(waiter);
          return;
        }

        if (queued) {
          queuedSaveRef.current = {
            payload: mergeQuestionnaireCommitPayloads(queued.payload, payload),
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
    if (
      !pendingUpdates.length ||
      !canSaveDraft ||
      navigationPending ||
      pendingIssueResolutionId !== null
    ) {
      return;
    }
    const revision = autosaveRevisionRef.current;
    if (failedSaveRevisionRef.current === revision) return;
    const payload = completionPayload("autosave");
    const timer = window.setTimeout(() => {
      if (autosaveTimerRef.current === timer) autosaveTimerRef.current = undefined;
      if (failedSaveRevisionRef.current === revision) return;
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
    navigationPending,
    pendingUpdates.length,
    pendingIssueResolutionId,
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
      if (navigationPendingRef.current || issueResolutionPendingRef.current) return;
      clearAutosaveTimer();
      const revision = autosaveRevisionRef.current;
      if (failedSaveRevisionRef.current === revision) return;
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

  function focusQuestionnaireTarget(target: QuestionnaireBlockerTarget) {
    navigateQuestionnaire(target.applicantId, target.sectionId, {
      preserveRequiredErrors: true,
    });
    focusFieldLabel(target.label);
  }

  function focusFirstSearchMatch() {
    const target = searchMatches[0];
    if (!target) return;
    focusQuestionnaireTarget(target);
  }

  function firstQuestionnaireBlockerTarget(
    applicantId?: string,
    sectionId?: SectionId,
  ): QuestionnaireBlockerTarget | undefined {
    const scopedApplicants = applicantId
      ? draftSubmission.applicants.filter((applicant) => applicant.id === applicantId)
      : draftSubmission.applicants;
    const fieldSlots = scopedApplicants
      .flatMap((applicant) => {
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
      })
      .filter(
        (slot) =>
          !sectionId ||
          sectionIdForQuestionnaireField(slot.section.id, slot.field.id) === sectionId,
      );
    const validationRisk = fieldSlots.find((slot) =>
      isBlsQuestionnaireFieldBlockingIssue({
        applicantRole: slot.applicant.role,
        field: slot.field,
        formData: slot.formData,
      }),
    );
    let deferredRequiredTarget: QuestionnaireBlockerTarget | undefined;
    if (validationRisk) {
      const requiredButEmpty =
        !validationRisk.field.value.trim() &&
        isBlsQuestionnaireFieldRequired({
          applicantRole: validationRisk.applicant.role,
          field: validationRisk.field,
          formData: validationRisk.formData,
        });
      const target = {
        applicantId: validationRisk.applicant.id,
        deferredUntilSectionExit: requiredButEmpty,
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
      } satisfies QuestionnaireBlockerTarget;
      if (!requiredButEmpty) return target;
      deferredRequiredTarget = target;
    }

    const requiredEmpty = fieldSlots.find(
      (slot) =>
        isBlsQuestionnaireFieldRequired({
          applicantRole: slot.applicant.role,
          field: slot.field,
          formData: slot.formData,
        }) &&
        !isBlsQuestionnaireFieldReady({
          applicantRole: slot.applicant.role,
          field: slot.field,
          formData: slot.formData,
        }),
    );
    if (requiredEmpty && !deferredRequiredTarget) {
      const quickOptions = requiredEmpty.field.options?.filter((option) =>
        option.trim(),
      );
      deferredRequiredTarget = {
        applicantId: requiredEmpty.applicant.id,
        deferredUntilSectionExit: true,
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

    if (sectionId) return deferredRequiredTarget;

    const issue = draftSubmission.issues.find((candidate) => {
      if (
        candidate.status !== "open" ||
        !candidate.target.applicantId ||
        (applicantId && candidate.target.applicantId !== applicantId)
      ) {
        return false;
      }

      return isQuestionnaireFieldIssue(draftSubmission, candidate);
    });
    if (!issue?.target.applicantId) return deferredRequiredTarget;

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

  function rememberDepartedSection() {
    const key = departedSectionKey(activeApplicant, activeSection);
    const hasBlocker = Boolean(
      firstQuestionnaireBlockerTarget(activeApplicant, activeSection),
    );
    setDepartedSectionKeys((current) => {
      if (hasBlocker) return current.includes(key) ? current : [...current, key];
      return current.filter((item) => item !== key);
    });
  }

  function navigateQuestionnaire(
    applicantId: string,
    sectionId: SectionId,
    { preserveRequiredErrors = false } = {},
  ) {
    if (navigationPendingRef.current || issueResolutionPendingRef.current) return false;
    if (applicantId === activeApplicant && sectionId === activeSection) return false;
    rememberDepartedSection();
    if (!preserveRequiredErrors) setRevealRequiredErrors(false);
    setActiveApplicant(applicantId);
    setActiveSection(sectionId);
    return true;
  }

  function navigateToQuestionnaireSection(applicantId: string, sectionId: SectionId) {
    if (!navigateQuestionnaire(applicantId, sectionId)) return;

    window.setTimeout(() => {
      const firstField = workPanelRef.current?.querySelector<HTMLElement>(
        "[data-field-label] input, [data-field-label] textarea, [data-field-label] button",
      );
      firstField?.focus({ preventScroll: true });
      workPanelRef.current?.scrollIntoView?.({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    }, 0);
  }

  function continueSectionFlow() {
    if (nextSection) {
      navigateToQuestionnaireSection(activeApplicant, nextSection.id);
      return;
    }

    if (nextApplicant) {
      const firstSection = sections[0];
      if (!firstSection) return;

      navigateToQuestionnaireSection(nextApplicant.id, firstSection.id);
      return;
    }

    void saveAndExitFromButton().catch(() => undefined);
  }

  function previousSectionFlow() {
    if (!previousSection) return;
    navigateToQuestionnaireSection(activeApplicant, previousSection.id);
  }

  function nextSectionFlow() {
    if (!nextSection) return;
    navigateToQuestionnaireSection(activeApplicant, nextSection.id);
  }

  function focusFirstBlocker() {
    const target = mobileBlockerTarget ?? firstQuestionnaireBlockerTarget();
    if (!target) return;
    setRevealRequiredErrors(true);
    setSaveStatus("idle");
    setSaveMessage(
      target.label
        ? `Сначала: ${target.label}`
        : "Сначала: устраните блокер",
    );
    focusQuestionnaireTarget(target);
  }

  async function saveDraftFromButton() {
    if (!isEditable || completionInFlightRef.current) return;
    clearAutosaveTimer();
    const revision = autosaveRevisionRef.current;
    await enqueueDraftSave(completionPayload("manual"), revision);
    saveAndExitDraftReadyRef.current = true;
  }

  async function saveAndExitFromButton() {
    if (!isEditable || completionInFlightRef.current || navigationPendingRef.current) {
      return;
    }
    navigationPendingRef.current = true;
    setNavigationPending(true);
    try {
      const pendingIssueResolution = issueResolutionPromiseRef.current;
      if (pendingIssueResolution && !(await pendingIssueResolution)) return;
      const correctionSavedCurrentDraft = Boolean(pendingIssueResolution);
      const hasDraftWork =
        Object.keys(pendingFieldUpdatesRef.current).length > 0 ||
        Boolean(inFlightSaveRef.current) ||
        Boolean(queuedSaveRef.current);
      if (
        !correctionSavedCurrentDraft &&
        (hasDraftWork || !saveAndExitDraftReadyRef.current)
      ) {
        await saveDraftFromButton();
      }
      if (onSaveAndExit) {
        await onSaveAndExit();
        return;
      }
      onBack();
    } catch (error) {
      setSaveStatus("error");
      setSaveFailureAction("save-exit");
      setDiscardExitArmed(false);
      setSaveMessage(questionnaireSaveFailureMessage(error));
      throw error;
    } finally {
      navigationPendingRef.current = false;
      setNavigationPending(false);
    }
  }

  function resolveCurrentIssue(): Promise<boolean> | undefined {
    if (
      !isEditable ||
      !currentSectionIssue ||
      currentSectionIssue.status !== "open" ||
      !onMarkIssueFixed ||
      issueResolutionPendingRef.current ||
      navigationPendingRef.current
    ) {
      return issueResolutionPromiseRef.current;
    }

    const issueId = currentSectionIssue.id;
    issueResolutionPendingRef.current = true;
    setPendingIssueResolutionId(issueId);
    setIssueResolutionError("");
    const resolution = (async () => {
      try {
        clearAutosaveTimer();
        const nextSubmission = await onMarkIssueFixed(
          issueId,
          completionPayload("manual"),
        );
        replacePendingFieldUpdates({});
        saveAndExitDraftReadyRef.current = true;
        setSaveStatus("saved");
        setSaveMessage(
          nextSubmission?.status === "corrections_received"
            ? "Все исправления сохранены и отправлены на проверку"
            : "Исправление сохранено",
        );
        return true;
      } catch (error) {
        setIssueResolutionError(questionnaireSaveFailureMessage(error));
        return false;
      } finally {
        issueResolutionPendingRef.current = false;
        issueResolutionPromiseRef.current = undefined;
        setPendingIssueResolutionId(null);
      }
    })();
    issueResolutionPromiseRef.current = resolution;
    return resolution;
  }

  async function requestBack() {
    if (completionInFlightRef.current || navigationPendingRef.current) return;
    navigationPendingRef.current = true;
    setNavigationPending(true);
    clearAutosaveTimer();
    try {
      const pendingIssueResolution = issueResolutionPromiseRef.current;
      if (pendingIssueResolution && !(await pendingIssueResolution)) return;
      const hasDraftWork =
        Object.keys(pendingFieldUpdatesRef.current).length > 0 ||
        Boolean(inFlightSaveRef.current) ||
        Boolean(queuedSaveRef.current);
      if (hasDraftWork && onSaveDraftRef.current) {
        const revision = autosaveRevisionRef.current;
        await enqueueDraftSave(completionPayload("navigation"), revision);
      }
      onBack();
    } catch (error) {
      setSaveStatus("error");
      setSaveFailureAction("back");
      setDiscardExitArmed(false);
      setSaveMessage(questionnaireSaveFailureMessage(error));
    } finally {
      navigationPendingRef.current = false;
      setNavigationPending(false);
    }
  }

  async function retryFailedSave() {
    setDiscardExitArmed(false);
    if (saveFailureAction === "back") {
      await requestBack();
      return;
    }
    if (saveFailureAction === "save-exit") {
      await saveAndExitFromButton();
      return;
    }
    await saveDraftFromButton();
  }

  function continueAfterSaveFailure() {
    setDiscardExitArmed(false);
    setSaveFailureAction(undefined);
    if (Object.keys(pendingFieldUpdatesRef.current).length > 0) {
      setSaveStatus("dirty");
      setSaveMessage("Есть несохранённые изменения");
      return;
    }
    setSaveStatus("idle");
    setSaveMessage("Изменений нет");
  }

  function exitWithoutSaving() {
    clearAutosaveTimer();
    setDiscardExitArmed(false);
    onBack();
  }

  function renderSectionFields() {
    if (activeSection === "appointment") {
      return (
        <>
          <FormField
            excelMap="Анкета: appointment-city"
            label="Город подачи"
            modelFieldId="appointment-city"
            number="A1"
            options={selectOptions.appointmentCity}
            placeholder="Выберите город"
            value={formData.appointmentCity}
            onChange={(value) => updateField("appointmentCity", value)}
          />
          <QuestionnaireDateRange
            endValue={formData.desiredDate2}
            startValue={formData.desiredDate1}
            onEndChange={(value) => updateField("desiredDate2", value)}
            onStartChange={(value) => updateField("desiredDate1", value)}
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
            placeholder="Например, 76 1234567"
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
              errorMessage={fieldErrorMessage(
                "passport-expiry-date",
                "Действителен до",
              )}
              focused={
                fieldReviewState("passport-expiry-date", "Действителен до") ===
                "needs_review"
              }
              label="Действителен до"
              modelFieldId="passport-expiry-date"
              number="4"
              reviewSource={fieldReviewSource(
                "passport-expiry-date",
                "Действителен до",
              )}
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
                      {...agentInteractionProps("questionnaire.update-field")}
                      aria-pressed={formData.passportExpiry === expiry}
                      className="v19-questionnaire-draft-button v19-questionnaire-passport-validity-option"
                      disabled={!isEditable}
                      key={validityYears}
                      type="button"
                      onClick={() =>
                        applyPassportValidityYears(validityYears as 5 | 10)
                      }
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
            onChange={updatePassportIssueCountry}
          />
          <FormField
            excelMap="Cell: C6"
            label="Место выдачи"
            modelFieldId="passport-issue-place"
            number="6"
            placeholder="Например, МВД 780-001"
            value={formData.passportIssuePlace}
            onChange={(value) => updateField("passportIssuePlace", value)}
          />
        </>
      );
    }

    if (activeSection === "contact") {
      return (
        <>
          <FormField
            label="Страна проживания"
            modelFieldId="home-country"
            number="1"
            options={selectOptions.homeCountry}
            value={formData.homeCountry}
            onChange={(value) => updateField("homeCountry", value)}
          />
          <FormField
            excelMap="Анкета: residence-city"
            label="Город проживания"
            modelFieldId="home-city"
            number="2"
            placeholder="Например, Санкт-Петербург"
            suggestions={POPULAR_RUSSIAN_CITY_OPTIONS}
            value={formData.residenceCity}
            onChange={(value) => updateField("residenceCity", value)}
          />
          <FormField
            addressAssist
            fullWidth
            hint="Можно написать коротко — полный адрес появится как предложение после номера дома."
            label="Улица / проспект / переулок"
            modelFieldId="home-street"
            number="3"
            onAddressSuggestionAccept={applyHomeAddressSuggestion}
            placeholder="Улица Ленина"
            compact
            suggestions={RUSSIAN_STREET_TYPE_SUGGESTIONS}
            value={formData.homeStreet}
            onChange={(value) => updateStructuredAddressField("homeStreet", value)}
          />
          <FormField
            label="Дом"
            modelFieldId="home-house"
            number="4"
            placeholder="Например, 15"
            value={formData.homeHouse}
            onChange={(value) => updateStructuredAddressField("homeHouse", value)}
          />
          <FormField
            label="Корпус / строение"
            modelFieldId="home-building"
            number="5"
            placeholder="Например, Корпус 2"
            suggestions={RUSSIAN_BUILDING_TYPE_SUGGESTIONS}
            value={formData.homeBuilding}
            onChange={(value) => updateStructuredAddressField("homeBuilding", value)}
          />
          <FormField
            label="Квартира / офис / помещение"
            modelFieldId="home-unit"
            number="6"
            placeholder="Например, Квартира 12"
            suggestions={RUSSIAN_UNIT_TYPE_SUGGESTIONS}
            value={formData.homeUnit}
            onChange={(value) => updateStructuredAddressField("homeUnit", value)}
          />
          <FormField
            excelMap="Анкета: residence-postal-code"
            label="Почтовый индекс"
            modelFieldId="postal-code"
            number="7"
            placeholder="Например, 101000"
            value={formData.residencePostalCode}
            onChange={(value) => updateField("residencePostalCode", value)}
          />
          <FormField
            excelMap="Cell: D4"
            label="Email"
            modelFieldId="email"
            number="8"
            type="email"
            value={formData.contactEmail}
            onChange={(value) => updateField("contactEmail", value)}
          />
          <FormField
            excelMap="Cell: D3"
            label="Телефон"
            modelFieldId="contact-number"
            number="9"
            phonePrefix="+7"
            placeholder="900 000-00-00"
            value={formData.contactPhone}
            onChange={(value) => updateField("contactPhone", value)}
          />
          <FormField
            excelMap="Анкета: lives-outside-citizenship"
            label="Есть вид на жительство в другой стране"
            modelFieldId="lives-outside-citizenship"
            number="10"
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
                number="11"
                placeholder="Например, Вид на жительство"
                value={formData.residencePermitType}
                onChange={(value) => updateField("residencePermitType", value)}
              />
              <FormField
                excelMap="Анкета: residence-permit-number"
                label="Номер документа"
                modelFieldId="residence-permit-number"
                number="12"
                placeholder="Например, AB123456"
                value={formData.residencePermitNumber}
                onChange={(value) => updateField("residencePermitNumber", value)}
              />
              <FormField
                excelMap="Анкета: residence-permit-valid-until"
                label="Действителен до"
                modelFieldId="residence-permit-valid-until"
                number="13"
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
            errorMessage={fieldErrorMessage("occupation", "Должность")}
            label="Должность"
            modelFieldId="occupation"
            number="1"
            placeholder="Например, Менеджер"
            reviewSource={fieldReviewSource("occupation", "Должность")}
            state={fieldReviewState("occupation", "Должность")}
            value={formData.occupation}
            onChange={(value) => updateField("occupation", value)}
          />
          <FormField
            excelMap="Cell: E3"
            fullWidth
            label="Работодатель / учебное заведение"
            modelFieldId="employer-name"
            number="2"
            placeholder="Например, ООО «Спектр» или МГУ"
            type="textarea"
            value={formData.employerName}
            onChange={(value) => updateField("employerName", value)}
          />
          <FormField
            excelMap="Анкета: employer-contact"
            label="Телефон работодателя / учебного заведения"
            modelFieldId="employer-contact"
            number="3"
            phonePrefix="+7"
            value={formData.employerContact}
            onChange={(value) => updateField("employerContact", value)}
          />
          <FormField
            addressAssist
            excelMap="Cell: E4"
            fullWidth
            hint="Пишите коротко — полный вариант появится как предложение после номера дома."
            label="Адрес работодателя / учебного заведения"
            modelFieldId="employer-address"
            number="4"
            placeholder="Проспект Мира, 10, офис 4"
            compact
            value={formData.employerAddress}
            onChange={(value) => updateField("employerAddress", value)}
          />
        </>
      );
    }

    if (activeSection === "trip") {
      let visibleTripQuestionNumber = 0;
      const nextTripQuestionNumber = () => String(++visibleTripQuestionNumber);
      return (
        <>
          <FormField
            excelMap="Cell: F2"
            label="Цель поездки"
            modelFieldId="purpose"
            number={nextTripQuestionNumber()}
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
              number={nextTripQuestionNumber()}
              placeholder="Например, Участие в конференции"
              type="textarea"
              value={formData.stayPurposeDetails}
              onChange={(value) => updateField("stayPurposeDetails", value)}
            />
          ) : null}
          <FormField
            excelMap="Анкета: main-destination"
            label="Основная страна назначения"
            modelFieldId="main-destination"
            number={nextTripQuestionNumber()}
            options={selectOptions.country}
            value={formData.mainDestination}
            onChange={(value) => updateField("mainDestination", value)}
          />
          <FormField
            excelMap="Cell: F5"
            label="Страна первого въезда"
            modelFieldId="first-entry-country"
            number={nextTripQuestionNumber()}
            options={selectOptions.country}
            value={formData.firstEntryCountry}
            onChange={(value) => updateField("firstEntryCountry", value)}
          />
          <FormField
            excelMap="Анкета: entry-count"
            label="Количество въездов"
            modelFieldId="entry-count"
            number={nextTripQuestionNumber()}
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
            number={nextTripQuestionNumber()}
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
            number={nextTripQuestionNumber()}
            reviewSource={fieldReviewSource("departure-date", "Дата выезда")}
            state={fieldReviewState("departure-date", "Дата выезда")}
            value={formData.travelEnd}
            onChange={(value) => updateTravelDate("travelEnd", value)}
          />
          <FormField
            excelMap="Анкета: stay-duration"
            label="Длительность пребывания"
            modelFieldId="stay-duration"
            number={nextTripQuestionNumber()}
            readOnly
            type="number"
            value={blsStayDurationFromDates(formData.travelStart, formData.travelEnd)}
          />
          <FormField
            excelMap="Анкета: previous-biometrics"
            label="Отпечатки ранее сдавались"
            modelFieldId="previous-biometrics"
            number={nextTripQuestionNumber()}
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
                number={nextTripQuestionNumber()}
                value={formData.previousBiometricsDate}
                onChange={(value) => updateField("previousBiometricsDate", value)}
              />
              <FormField
                excelMap="Анкета: previous-visa-number"
                label="Номер визы"
                modelFieldId="previous-visa-number"
                number={nextTripQuestionNumber()}
                value={formData.previousVisaNumber}
                onChange={(value) => updateField("previousVisaNumber", value)}
              />
            </>
          ) : null}
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
            label="ФИО приглашающего лица или название отеля/компании"
            modelFieldId="hotel-name"
            number="2"
            placeholder="Например, Hotel Europa"
            value={formData.hotelName}
            onChange={(value) => updateField("hotelName", value)}
          />
          <FormField
            addressAssist
            excelMap="Cell: G3"
            fullWidth
            label="Адрес"
            modelFieldId="hotel-address"
            number="3"
            placeholder="Например, Calle de Atocha, 23"
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
            placeholder="Например, Madrid"
            value={formData.hotelCity}
            onChange={(value) => updateField("hotelCity", value)}
          />
          <FormField
            label="Почтовый индекс"
            modelFieldId="hotel-postal-code"
            number="6"
            placeholder="Например, 28001"
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
            placeholder="Номер с кодом страны"
            type="tel"
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
                placeholder="Например, Acme SL, Calle Mayor, 10"
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
                placeholder="Например, Maria Garcia"
                type="textarea"
                value={formData.companyContactPerson}
                onChange={(value) => updateField("companyContactPerson", value)}
              />
              <FormField
                excelMap="Анкета: company-phone"
                label="Телефон компании"
                modelFieldId="company-phone"
                number="11"
                placeholder="Номер с кодом страны"
                type="tel"
                value={formData.companyPhone}
                onChange={(value) => updateField("companyPhone", value)}
              />
            </>
          ) : null}
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
            placeholder="Например, Волков"
            value={formData.surname}
            onChange={(value) => updateField("surname", value)}
          />
          <FormField
            excelMap="Анкета: previous-surname"
            fullWidth
            label="Предыдущие фамилии"
            modelFieldId="previous-surname"
            number="1.1"
            placeholder="Например, Петрова или нет"
            value={formData.previousSurname}
            onChange={(value) => updateField("previousSurname", value)}
          />
          <FormField
            excelMap="Cell: B3"
            label="Имя"
            modelFieldId="first-name"
            number="2"
            placeholder="Например, Антон"
            value={formData.firstName}
            onChange={(value) => updateField("firstName", value)}
          />
          <FormField
            excelMap="Cell: B4"
            errorMessage={fieldErrorMessage("birth-date", "Дата рождения")}
            label="Дата рождения"
            modelFieldId="birth-date"
            number="3"
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
            number="4"
            onBlur={normalizeBirthPlaceField}
            placeholder="Например, Москва"
            reviewSource={fieldReviewSource("birth-place", "Место рождения")}
            state={fieldReviewState("birth-place", "Место рождения")}
            value={formData.birthPlace}
            onChange={(value) => updateField("birthPlace", value)}
          />
          <FormField
            excelMap="Cell: B6"
            label="Страна рождения"
            modelFieldId="birth-country"
            number="5"
            options={selectOptions.birthCountry}
            value={formData.birthCountry}
            onChange={updateBirthCountry}
          />
          <FormField
            excelMap="Cell: B8"
            label="Пол"
            modelFieldId="gender"
            number="6"
            options={selectOptions.gender}
            value={formData.sex}
            onChange={(value) => updateField("sex", value)}
          />
          <FormField
            excelMap="Cell: B9"
            fullWidth
            label="Семейное положение"
            modelFieldId="marital-status"
            number="7"
            options={selectOptions.maritalStatus}
            value={formData.maritalStatus}
            onChange={(value) => updateField("maritalStatus", value)}
          />
          {guardianDetailsAreVisible ? (
            <FormField
              excelMap="Анкета: guardian-info"
              fullWidth
              label="Родитель/опекун несовершеннолетнего"
              modelFieldId="guardian-info"
              number="8"
              placeholder="Например, Ivan Volkov, отец"
              type="textarea"
              value={formData.guardianInfo}
              onChange={(value) => updateField("guardianInfo", value)}
            />
          ) : applicantIsMinor ? (
            <button
              {...agentInteractionProps("questionnaire.navigate")}
              className="v19-questionnaire-optional-reveal"
              type="button"
              onClick={() => setShowGuardianDetails(true)}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Добавить родителя или опекуна
            </button>
          ) : null}
        </>
      );
    }

    return null;
  }

  const questionnaireFieldUiContract: QuestionnaireFieldUiContract = {
    confirmReview: confirmFieldReview,
    copyPreview: (fieldId) =>
      Boolean(
        familyCopyPreview?.previewFields.some(
          (previewField) =>
            previewField.applicantId === activeApplicant &&
            previewField.fieldId === fieldId,
        ),
      ),
    errorMessage: fieldErrorMessage,
    focused: (fieldId) =>
      highlightedInitialFieldId === fieldId &&
      (initialFocus?.applicantId ?? activeApplicant) === activeApplicant,
    revealRequiredErrors,
    required: fieldIsRequired,
    reviewSource: fieldReviewSource,
    state: fieldReviewState,
  };
  const immediateBlockerTarget = firstQuestionnaireBlockerTarget();
  const departedSectionBlockerTarget = departedSectionKeys
    .map(departedSectionContext)
    .map(({ applicantId, sectionId }) =>
      firstQuestionnaireBlockerTarget(applicantId, sectionId),
    )
    .find((target): target is QuestionnaireBlockerTarget => target !== undefined);
  const mobileBlockerTarget = immediateBlockerTarget?.deferredUntilSectionExit
    ? departedSectionBlockerTarget
    : immediateBlockerTarget;
  const mobileBlockerLabel =
    mobileBlockerTarget?.label ??
    sections.find((section) => section.id === mobileBlockerTarget?.sectionId)?.title ??
    "Следующее обязательное поле";
  const mobileBlockerReason = mobileBlockerTarget?.reason?.trim();
  const currentIssueCoversMobileBlocker = Boolean(
    currentSectionIssue &&
      mobileBlockerTarget &&
      currentSectionIssue.target.applicantId === mobileBlockerTarget.applicantId &&
      (!currentSectionIssue.target.section?.trim() ||
        sameFieldLabel(
          currentSectionIssue.target.section,
          activeSectionContext?.title,
        )) &&
      questionnaireFieldBindings.some((binding) => {
        const fieldLabel =
          questionnaireField(activeApplicantModel, binding.fieldId)?.label ??
          mobileBlockerLabel;
        return (
          issueFieldMatches(
            binding.fieldId,
            fieldLabel,
            currentSectionIssue.target.field,
          ) &&
          issueFieldMatches(binding.fieldId, fieldLabel, mobileBlockerLabel)
        );
      }),
  );
  const showWorkToolbar =
    showFamilyCopyControl ||
    Boolean(currentSectionIssue) ||
    (isEditable && Boolean(mobileBlockerTarget) && !currentIssueCoversMobileBlocker);
  const questionnaireInteractionPending =
    navigationPending || pendingIssueResolutionId !== null;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className={`vf-figma-surface vf-figma-questionnaire-screen v19-questionnaire-screen-shell questionnaire-screen codex-polish-v1${
        isEditable ? "" : " is-read-only"
      }`}
      data-submission-id={draftSubmission.id}
      exit={{ opacity: 0 }}
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      ref={screenRef}
      transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
    >
      <header className="v19-questionnaire-screen-header">
        <button
          {...agentInteractionProps("questionnaire.back")}
          aria-label="Назад"
          className="v19-questionnaire-back-button"
          disabled={navigationPending}
          type="button"
          onClick={() => void requestBack()}
        >
          <ArrowLeft className="w-[var(--v19b-size-18)] h-[var(--v19b-size-18)]" />
        </button>

        <div className="v19-questionnaire-title-wrap">
          <h1 className="sr-only">
            Анкета: {draftSubmission.title?.trim() || `Подача ${draftSubmission.id}`}
          </h1>
          <AccessibleSelectMenu
            ariaLabel="Выбрать туриста"
            className="v19-questionnaire-tourist-switcher"
            disabled={applicants.length < 2 || questionnaireInteractionPending}
            onValueChange={(applicantId) =>
              navigateQuestionnaire(applicantId, activeSection)
            }
            options={touristSelectOptions}
            triggerProps={agentInteractionProps("questionnaire.navigate")}
            value={activeApplicant}
            variant="questionnaire-tourist"
          />
        </div>

        <div className="v19-questionnaire-header-actions">
          <span aria-live="polite" className="sr-only" role="status">
            {saveMessage}
          </span>
          {isEditable ? (
            <button
              {...agentInteractionProps("questionnaire.save-exit")}
              aria-label={saveStatus === "saving" ? "Сохраняем" : "Сохранить и выйти"}
              aria-busy={navigationPending || saveStatus === "saving"}
              className="v19-questionnaire-complete-button v19-questionnaire-save-button is-ready"
              disabled={navigationPending || saveStatus === "saving"}
              type="button"
              onClick={() => void saveAndExitFromButton().catch(() => undefined)}
            >
              <span className="hidden sm:inline">
                {saveStatus === "saving" ? "Сохраняем" : "Сохранить и выйти"}
              </span>
              <span className="sm:hidden">
                {saveStatus === "saving" ? "Сохраняем" : "Сохранить и выйти"}
              </span>
            </button>
          ) : questionnaireStatus.readOnly ? (
            <span
              aria-label={questionnaireStatus.readOnly.label}
              className="v19-questionnaire-draft-button v19-questionnaire-read-only-status"
              data-testid="questionnaire-read-only-status"
              role="status"
            >
              <span className="hidden sm:inline">
                {questionnaireStatus.readOnly.label}
              </span>
              <span className="sm:hidden">
                {questionnaireStatus.readOnly.mobileLabel}
              </span>
            </span>
          ) : null}
        </div>
      </header>

      <div aria-hidden="true" className="v19-questionnaire-progress-track">
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

      <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        Контекст анкеты: заявитель {activeApplicantContext?.name ?? "не выбран"}; раздел{" "}
        {activeSectionContext?.title ?? "не выбран"}.
      </p>

      <div className="v19-questionnaire-scroll">
        <div className="v19-questionnaire-scroll-frame max-w-[var(--v19b-size-1240)] mx-auto flex flex-col h-full min-h-0 gap-3 lg:gap-4 pb-[env(safe-area-inset-bottom)]">
          {saveStatus === "error" ? (
            <div
              className="v19-questionnaire-save-error"
              data-testid="questionnaire-save-error"
              role="alert"
            >
              <AlertCircle aria-hidden="true" />
              <div className="v19-questionnaire-save-error-copy">
                <strong>Не удалось сохранить и выйти</strong>
                <span>{saveMessage}</span>
              </div>
              <div className="v19-questionnaire-save-error-actions">
                {discardExitArmed ? (
                  <>
                    <span className="v19-questionnaire-save-error-warning">
                      Последние несохранённые изменения будут потеряны. Уже
                      сохранённые данные останутся.
                    </span>
                    <button
                      {...agentInteractionProps("questionnaire.back")}
                      type="button"
                      onClick={exitWithoutSaving}
                    >
                      Да, выйти без сохранения
                    </button>
                    <button
                      {...agentInteractionProps("questionnaire.navigate")}
                      type="button"
                      onClick={() => setDiscardExitArmed(false)}
                    >
                      Остаться
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      {...agentInteractionProps("questionnaire.save-exit")}
                      aria-busy={navigationPending}
                      disabled={navigationPending}
                      type="button"
                      onClick={() => void retryFailedSave().catch(() => undefined)}
                    >
                      Повторить сохранение
                    </button>
                    <button
                      {...agentInteractionProps("questionnaire.navigate")}
                      type="button"
                      onClick={continueAfterSaveFailure}
                    >
                      Продолжить редактирование
                    </button>
                    {saveFailureAction === "back" ||
                    saveFailureAction === "save-exit" ? (
                      <button
                        {...agentInteractionProps("questionnaire.back")}
                        type="button"
                        onClick={() => setDiscardExitArmed(true)}
                      >
                        Выйти без сохранения
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          ) : null}
          {questionnaireStatus.readOnly ? (
            <section
              className="v19-questionnaire-next-blocker"
              data-testid="questionnaire-read-only-banner"
              role="status"
            >
              <AlertCircle aria-hidden="true" className="w-4 h-4" />
              <div className="min-w-0">
                <strong>{questionnaireStatus.readOnly.label}</strong>
                <p className="text-[var(--v19b-size-12)] text-white/60 leading-relaxed">
                  {questionnaireStatus.readOnly.message}
                </p>
              </div>
            </section>
          ) : null}
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
                      {...agentInteractionProps("questionnaire.navigate")}
                      aria-label={`${applicant.name}: ${applicant.completed} из ${applicant.total}, ${statusLabel}`}
                      aria-pressed={activeApplicant === applicant.id}
                      className={`v19-questionnaire-applicant-tab status-${applicant.status} ${
                        activeApplicant === applicant.id ? "is-active" : ""
                      }`}
                      ref={
                        activeApplicant === applicant.id
                          ? activeApplicantTabRef
                          : undefined
                      }
                      disabled={questionnaireInteractionPending}
                      type="button"
                      onClick={() => navigateQuestionnaire(applicant.id, activeSection)}
                    >
                      <span className="v19-questionnaire-applicant-index">
                        {applicant.index}
                      </span>
                      <span className="v19-questionnaire-applicant-name">
                        {applicant.name}
                      </span>
                      <QuestionnaireProgressBadge
                        aria-hidden="true"
                        className={`v19-questionnaire-progress-badge status-${applicant.status}`}
                      >
                        {applicant.status === "complete" ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : applicant.status === "issue" ? (
                          <AlertCircle className="w-3.5 h-3.5" />
                        ) : (
                          `${applicant.completed} из ${applicant.total}`
                        )}
                      </QuestionnaireProgressBadge>
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="v19-questionnaire-family-summary hidden md:flex shrink-0 items-center gap-2 text-[var(--v19b-size-12)] text-white/50 px-3 border-l border-white/5">
              <UsersRound className="w-4 h-4" />
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
            {sections.map((section, sectionIndex) => (
              <button
                {...agentInteractionProps("questionnaire.navigate")}
                aria-label={
                  section.status === "issue"
                    ? `${section.title}: есть замечание`
                    : undefined
                }
                aria-pressed={activeSection === section.id}
                className={`v19-questionnaire-section-tab status-${section.status} ${
                  activeSection === section.id ? "is-active" : ""
                }`}
                key={`pinned-${section.id}`}
                ref={
                  activeSection === section.id ? activePinnedSectionTabRef : undefined
                }
                disabled={questionnaireInteractionPending}
                type="button"
                onClick={() => navigateQuestionnaire(activeApplicant, section.id)}
              >
                <span aria-hidden="true" className="v19-questionnaire-section-number">
                  {sectionIndex + 1}
                </span>
                <div className="v19-questionnaire-section-copy flex-1 min-w-0">
                  <div className="v19-questionnaire-section-title text-[var(--v19b-size-12)] font-semibold truncate">
                    {section.title}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <QuestionnaireWorkspaceShell className="v19-questionnaire-workspace-shell flex-1 flex flex-col lg:flex-row gap-3 lg:gap-4 min-h-0">
            <aside className="v19-questionnaire-section-nav">
              <V19ReadinessCard
                description="Анкету можно отправлять, когда обязательные поля заполнены без ошибок."
                detail={riskLabel(readinessStats.risks)}
                scoreLabel={`${readinessStats.percent}%`}
                value={readinessStats.percent}
              />

              <div className="flex flex-col gap-2">
                <V19SearchField
                  {...agentInteractionProps("questionnaire.search")}
                  id="questionnaire-field-search"
                  label="Поиск поля анкеты"
                  name="questionnaire-field-search"
                  placeholder="Найти поле"
                  value={fieldSearchQuery}
                  onChange={(event) => setFieldSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    focusFirstSearchMatch();
                  }}
                />
                {fieldSearchQuery.trim() ? (
                  <div
                    aria-live="polite"
                    className="v19-questionnaire-sidebar-status"
                    role="status"
                  >
                    {searchMatches.length} совпадений
                  </div>
                ) : null}
              </div>

              <div
                aria-label="Разделы анкеты"
                className="v19-questionnaire-section-list v19-questionnaire-section-list--sidebar"
                role="group"
              >
                {sections.map((section, sectionIndex) => (
                  <button
                    {...agentInteractionProps("questionnaire.navigate")}
                    aria-label={
                      section.status === "issue"
                        ? `${section.title}: есть замечание`
                        : undefined
                    }
                    aria-pressed={activeSection === section.id}
                    className={`v19-questionnaire-section-tab status-${section.status} ${
                      activeSection === section.id ? "is-active" : ""
                    }`}
                    key={section.id}
                    ref={
                      activeSection === section.id
                        ? activeSidebarSectionTabRef
                        : undefined
                    }
                    disabled={questionnaireInteractionPending}
                    type="button"
                    onClick={() => navigateQuestionnaire(activeApplicant, section.id)}
                  >
                    <span
                      aria-hidden="true"
                      className="v19-questionnaire-section-number"
                    >
                      {sectionIndex + 1}
                    </span>
                    <div className="v19-questionnaire-section-copy flex-1 min-w-0">
                      <div className="v19-questionnaire-section-title text-[var(--v19b-size-12)] font-semibold truncate">
                        {section.title}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            <div className="v19-questionnaire-work-panel" ref={workPanelRef}>
              {showWorkToolbar ? (
                <div
                  className={`v19-questionnaire-work-toolbar${
                    showFamilyCopyControl ? " has-copy" : ""
                  }`}
                >
                  <div className="v19-questionnaire-work-toolbar-notice">
                    {isEditable &&
                    mobileBlockerTarget &&
                    !currentIssueCoversMobileBlocker ? (
                      <button
                        {...agentInteractionProps("questionnaire.navigate")}
                        aria-label={`Перейти к следующему обязательному действию: ${mobileBlockerLabel}${
                          mobileBlockerReason ? `. ${mobileBlockerReason}` : ""
                        }`}
                        className="v19-questionnaire-next-blocker"
                        data-testid="questionnaire-next-blocker"
                        disabled={questionnaireInteractionPending}
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
                          currentSectionIssue.status === "fixed_by_agent"
                            ? "true"
                            : undefined
                        }
                        aria-live={
                          currentSectionIssue.status === "fixed_by_agent"
                            ? "polite"
                            : undefined
                        }
                        className={`v19-questionnaire-review-alert ${
                          currentSectionIssue.status === "fixed_by_agent"
                            ? "is-awaiting"
                            : ""
                        }`}
                        data-testid="questionnaire-current-issue"
                        role={
                          currentSectionIssue.status === "fixed_by_agent"
                            ? "status"
                            : undefined
                        }
                      >
                        <div className="v19-questionnaire-review-strip" />
                        <div className="v19-questionnaire-review-icon">
                          {currentSectionIssue.status === "fixed_by_agent" ||
                          currentIssueCorrectionConfirmed ? (
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
                              : currentIssueCorrectionConfirmed
                                ? `Исправление${
                                    currentSectionIssue.target.field
                                      ? ` по полю «${currentSectionIssue.target.field}»`
                                      : ""
                                  } сохранено`
                              : currentSectionIssue.target.field
                                ? `${currentSectionIssue.target.field}: ${currentSectionIssue.reason}`
                                : currentSectionIssue.reason}
                          </div>
                          <p className="text-[var(--v19b-size-12)] text-white/60 mt-1.5 leading-relaxed">
                            {currentSectionIssue.status === "fixed_by_agent"
                              ? "Исправление сохранено и не блокирует повторную отправку. Администратор увидит его при проверке."
                              : currentIssueCorrectionConfirmed
                                ? "Исправление будет отправлено на проверку автоматически, когда будут сохранены остальные замечания."
                              : currentSectionIssue.comment}
                          </p>
                        </div>
                        {isEditable &&
                        currentSectionIssue.status === "open" &&
                        !currentIssueCorrectionConfirmed &&
                        onMarkIssueFixed ? (
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <button
                              {...agentInteractionProps(
                                currentIssueCompletesCorrectionSet
                                  ? "questionnaire.save-and-submit-corrections"
                                  : "questionnaire.mark-fixed",
                              )}
                              aria-busy={
                                pendingIssueResolutionId === currentSectionIssue.id
                              }
                              className="v19-questionnaire-draft-button"
                              disabled={questionnaireInteractionPending}
                              type="button"
                              onClick={() => void resolveCurrentIssue()}
                            >
                              {pendingIssueResolutionId === currentSectionIssue.id
                                ? "Сохраняем…"
                                : "Сохранить исправление"}
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
                  </div>

                  {showFamilyCopyControl ? (
                    <div className="v19-questionnaire-work-toolbar-copy">
                      <button
                        {...agentInteractionProps("questionnaire.preview-family-copy")}
                        aria-describedby={
                          !familyCopyPreview && familyCopyMessage
                            ? familyCopyStatusId
                            : undefined
                        }
                        className="v19-questionnaire-draft-button v19-questionnaire-copy-button"
                        disabled={
                          !isEditable ||
                          Boolean(familyCopyPreview) ||
                          questionnaireInteractionPending
                        }
                        type="button"
                        onClick={copySharedDataToFamily}
                      >
                        <Copy aria-hidden="true" />
                        Копировать для всех
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="v19-questionnaire-work-grid">
                {showFamilyCopyControl && (familyCopyPreview || familyCopyMessage) ? (
                  <div className="col-span-1 md:col-span-2 flex flex-wrap items-center gap-2">
                    {familyCopyPreview ? (
                      <>
                        <p
                          aria-live="polite"
                          className="v19-questionnaire-family-copy-status"
                          role="status"
                        >
                          Будет скопировано заполненных пользователем полей:{" "}
                          {familyCopyPreview.updates.length}
                          {" · "}членов семьи: {familyCopyPreview.affectedApplicants}.
                        </p>
                        <button
                          {...agentInteractionProps("questionnaire.copy-family")}
                          className="v19-questionnaire-complete-button v19-questionnaire-family-copy-confirm is-ready"
                          disabled={questionnaireInteractionPending}
                          type="button"
                          onClick={confirmFamilyCopy}
                        >
                          Подтвердить копирование
                        </button>
                        <button
                          {...agentInteractionProps("questionnaire.cancel-family-copy")}
                          className="v19-questionnaire-draft-button"
                          disabled={questionnaireInteractionPending}
                          type="button"
                          onClick={cancelFamilyCopy}
                        >
                          Отмена
                        </button>
                      </>
                    ) : null}
                    {!familyCopyPreview &&
                    familyCopyMessage === familyCopyUnavailableMessage ? (
                      <div
                        aria-atomic="true"
                        className="v19-questionnaire-family-copy-alert"
                        id={familyCopyStatusId}
                        role="alert"
                      >
                        <span
                          aria-hidden="true"
                          className="v19-questionnaire-family-copy-alert-icon"
                        >
                          <AlertCircle />
                        </span>
                        <p>{familyCopyMessage}</p>
                      </div>
                    ) : null}
                    {!familyCopyPreview &&
                    familyCopyMessage &&
                    familyCopyMessage !== familyCopyUnavailableMessage ? (
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
                <QuestionnaireFieldUiContext.Provider
                  value={questionnaireFieldUiContract}
                >
                  <fieldset
                    aria-label={
                      isEditable ? "Поля анкеты" : "Поля анкеты — только просмотр"
                    }
                    className="v19-questionnaire-fields-grid"
                    disabled={!isEditable || questionnaireInteractionPending}
                  >
                    {renderSectionFields()}
                  </fieldset>
                </QuestionnaireFieldUiContext.Provider>
              </div>

              {isEditable ? (
                <div className="v19-questionnaire-next-action-bar">
                  <button
                    {...agentInteractionProps(
                      nextSection || nextApplicant
                        ? "questionnaire.navigate"
                        : "questionnaire.save-exit",
                    )}
                    aria-label={continueActionLabel}
                    aria-busy={
                      !nextSection && !nextApplicant ? navigationPending : undefined
                    }
                    className="v19-questionnaire-next-button v19-questionnaire-next-button--simple"
                    disabled={questionnaireInteractionPending}
                    type="button"
                    onClick={continueSectionFlow}
                  >
                    {continueActionLabel}
                  </button>
                </div>
              ) : null}
            </div>
          </QuestionnaireWorkspaceShell>
        </div>
      </div>

      <footer
        aria-label="Действия анкеты"
        className="v19-questionnaire-mobile-footer"
        data-testid="questionnaire-mobile-footer"
      >
        <button
          {...agentInteractionProps("questionnaire.navigate")}
          aria-label={
            previousSection
              ? `Предыдущий раздел: ${previousSection.title}`
              : "Предыдущий раздел недоступен"
          }
          className="v19-questionnaire-mobile-footer-arrow"
          disabled={!previousSection || questionnaireInteractionPending}
          type="button"
          onClick={previousSectionFlow}
        >
          <ArrowLeft aria-hidden="true" />
        </button>

        <button
          {...agentInteractionProps(
            isEditable ? "questionnaire.save-exit" : "questionnaire.back",
          )}
          aria-busy={navigationPending || saveStatus === "saving"}
          aria-label={
            isEditable
              ? saveStatus === "saving"
                ? "Сохраняем анкету — нижняя панель"
                : "Сохранить и выйти — нижняя панель"
              : "Выйти из анкеты — нижняя панель"
          }
          className="v19-questionnaire-mobile-footer-save"
          disabled={navigationPending || saveStatus === "saving"}
          type="button"
          onClick={() =>
            void (isEditable ? saveAndExitFromButton() : requestBack()).catch(
              () => undefined,
            )
          }
        >
          <Save aria-hidden="true" />
          <span>
            <strong>
              {isEditable
                ? saveStatus === "saving"
                  ? "Сохраняем"
                  : "Сохранить"
                : "Выйти"}
            </strong>
            <small>{isEditable ? "и выйти" : "из анкеты"}</small>
          </span>
        </button>

        <AccessibleSelectMenu
          ariaLabel="Выбрать заявителя — нижняя панель"
          className="v19-questionnaire-mobile-footer-applicant"
          disabled={applicants.length < 2 || questionnaireInteractionPending}
          onValueChange={(applicantId) =>
            navigateQuestionnaire(applicantId, activeSection)
          }
          options={touristSelectOptions}
          triggerProps={agentInteractionProps("questionnaire.navigate")}
          value={activeApplicant}
          variant="questionnaire-tourist"
        />

        <button
          {...agentInteractionProps("questionnaire.navigate")}
          aria-label={
            nextSection
              ? `Следующий раздел: ${nextSection.title}`
              : "Следующий раздел недоступен"
          }
          className="v19-questionnaire-mobile-footer-arrow"
          disabled={!nextSection || questionnaireInteractionPending}
          type="button"
          onClick={nextSectionFlow}
        >
          <ArrowRight aria-hidden="true" />
        </button>
      </footer>
    </motion.div>
  );
}
