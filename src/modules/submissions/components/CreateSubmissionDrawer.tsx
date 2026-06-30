import { type DragEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  ScanLine,
  Search,
  UploadCloud,
} from "lucide-react";
import { invokePassportExtraction } from "../passportExtractionService";
import "./CreateSubmissionDrawer.css";
import {
  type PassportExtractedField,
  type PassportExtractedFieldKey,
  type PassportUploadDraft,
  type PreliminaryIntakeDraft,
  type Submission,
} from "../types";

const maxFamilyApplicants = 6;

type CreateSubmissionStep = "passport" | "questionnaire";

const submissionTypeOptions: Array<{ label: string; value: Submission["type"] }> = [
  { label: "Заявитель", value: "single" },
  { label: "Семья", value: "family" },
];

const firstStepFamilyQuestions: Array<{
  key: Extract<keyof PreliminaryIntakeDraft, "sameHomeAddress" | "sameSpainStay">;
  label: string;
}> = [
  { key: "sameHomeAddress", label: "Один адрес проживания в России у всех?" },
  { key: "sameSpainStay", label: "Одно проживание в Испании у всех?" },
];

const extractedFieldPreviewItems: Array<{
  key: PassportExtractedFieldKey;
  label: string;
}> = [
  { key: "surname", label: "Фамилия" },
  { key: "firstName", label: "Имя" },
  { key: "birthDate", label: "Дата рождения" },
  { key: "birthPlace", label: "Место рождения" },
  { key: "birthCountry", label: "Страна рождения" },
  { key: "citizenship", label: "Гражданство" },
  { key: "passportNumber", label: "Номер паспорта" },
  { key: "passportIssuedAt", label: "Дата выдачи" },
  { key: "passportIssuePlace", label: "Место выдачи" },
  { key: "passportExpiresAt", label: "Дата окончания паспорта" },
];

const mediaRequirements = [
  ["Загранпаспорт", "passport_scan"],
  ["Селфи", "selfie"],
  ["Селфи N2", "selfie_2"],
];

const questionnaireSections = [
  "Личные данные",
  "Паспорт",
  "Адрес и контакты",
  "Работа и занятость",
  "Маршрут и проживание",
];

const emptyPreliminaryIntakeDraft: PreliminaryIntakeDraft = {
  arrivalPlace: "",
  homeAddress: "",
  sameArrivalPlace: false,
  sameHomeAddress: false,
  sameSpainStay: false,
  sameTripDates: false,
  spainStayAddress: "",
  spainStayCity: "",
  spainStayName: "",
  tripDateFrom: "",
  tripDateTo: "",
};

const passportScanUploadMimeTypes = new Set([
  "image/jpeg",
  "image/png",
]);

const e2ePassportMockEnabled =
  import.meta.env.DEV && import.meta.env.VITE_E2E_PASSPORT_MOCK_ENABLED === "true";

type PassportUploadVisualStatus =
  | "empty"
  | "extracting"
  | "ready"
  | "selected"
  | "unavailable";

function boundedApplicantIndex(index: number, applicantCount: number) {
  return Math.max(0, Math.min(index, Math.max(0, applicantCount - 1)));
}

function passportUploadFullName(upload: PassportUploadDraft | undefined) {
  if (!upload) return "";

  const surname = upload.extractedFields
    .find((field) => field.key === "surname")
    ?.value.trim();
  const firstName = upload.extractedFields
    .find((field) => field.key === "firstName")
    ?.value.trim();

  return [surname, firstName].filter(Boolean).join(" ");
}

function hasRequiredPassportIdentity(upload: PassportUploadDraft | undefined) {
  return Boolean(passportUploadFullName(upload));
}

function hasAcceptedPassportFile(upload: PassportUploadDraft | undefined) {
  return Boolean(upload?.file && passportScanUploadMimeTypes.has(upload.file.type));
}

function isPassportUploadReady(upload: PassportUploadDraft | undefined) {
  if (!hasAcceptedPassportFile(upload)) return false;

  return (
    upload?.status === "ready" ||
    upload?.status === "unavailable" ||
    upload?.status === "failed"
  );
}

function passportUploadVisualStatus(
  upload: PassportUploadDraft | undefined,
): PassportUploadVisualStatus {
  if (!upload) return "empty";
  if (upload.status === "extracting") return "extracting";
  if (upload.status === "unavailable" || upload.status === "failed") {
    return "unavailable";
  }
  if (upload.status === "ready" && hasRequiredPassportIdentity(upload)) return "ready";
  if (upload.status === "ready") return "unavailable";

  return "selected";
}

function passportUploadFieldValue(
  upload: PassportUploadDraft | undefined,
  key: PassportExtractedFieldKey,
) {
  return upload?.extractedFields.find((field) => field.key === key)?.value.trim() ?? "";
}

function e2ePassportNumber(fileName: string) {
  const hash = [...fileName].reduce(
    (current, character) => (current * 31 + character.charCodeAt(0)) % 1_000_000,
    0,
  );

  return `900${String(hash).padStart(6, "0")}`.slice(0, 9);
}

function e2ePassportMockFields(fileName: string): PassportExtractedField[] | null {
  if (!e2ePassportMockEnabled) return null;

  const match = /^e2e-passport-(.+)\.jpe?g$/iu.exec(fileName.trim());
  if (!match?.[1]) return null;

  const [surname = "Новый", ...givenParts] = match[1]
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/);
  const firstName = givenParts.join(" ") || "заявитель";
  const values: Array<
    [PassportExtractedFieldKey, string, PassportExtractedField["confidence"]]
  > = [
    ["surname", surname, "high"],
    ["firstName", firstName, "high"],
    ["birthDate", "01.01.1990", "medium"],
    ["birthPlace", "MOSCOW", "low"],
    ["birthCountry", "USSR", "medium"],
    ["citizenship", "Russian Federation", "medium"],
    ["gender", "Male - Мужской", "medium"],
    ["passportType", "Ordinary Passport", "medium"],
    ["passportNumber", e2ePassportNumber(fileName), "high"],
    ["passportIssueCountry", "Russian Federation", "medium"],
    ["passportIssuedAt", "01.01.2020", "medium"],
    ["passportIssuePlace", "FMS 77001", "low"],
    ["passportExpiresAt", "01.01.2030", "medium"],
  ];

  return values.map(([key, value, confidence]) => ({
    confidence,
    key,
    needsManualReview: true,
    source: "passport_scan",
    value,
    verified: false,
  }));
}

export function CreateSubmissionDrawer({
  familyCount,
  focusCloseToken = 0,
  onClose,
  onCreate,
  onFamilyCount,
  onPassportFilesSelected,
  onType,
  type,
}: {
  familyCount: number;
  focusCloseToken?: number;
  onClose: () => void;
  onCreate: (
    passportUploads?: PassportUploadDraft[],
    preliminaryIntake?: PreliminaryIntakeDraft,
  ) => void;
  onFamilyCount: (count: number) => void;
  onPassportFilesSelected: () => void;
  onType: (type: Submission["type"]) => void;
  type: Submission["type"];
}) {
  const applicantCount = type === "family" ? familyCount : 1;
  const passportFileInputRef = useRef<HTMLInputElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const uploadBatchRef = useRef(0);
  const [passportUploads, setPassportUploads] = useState<PassportUploadDraft[]>([]);
  const [passportFileError, setPassportFileError] = useState("");
  const [activeApplicantIndex, setActiveApplicantIndex] = useState(0);
  const [createStep, setCreateStep] = useState<CreateSubmissionStep>("passport");
  const [isDragging, setIsDragging] = useState(false);
  const [preliminaryIntake, setPreliminaryIntake] = useState<PreliminaryIntakeDraft>(
    emptyPreliminaryIntakeDraft,
  );
  const safeActiveApplicantIndex = boundedApplicantIndex(
    activeApplicantIndex,
    applicantCount,
  );
  const activeUpload = passportUploads.find(
    (upload) => upload.applicantIndex === safeActiveApplicantIndex,
  );
  const passportReady = allApplicantPassportsReady(passportUploads, applicantCount);
  const missingPassportLabels = missingApplicantPassportLabels(
    passportUploads,
    applicantCount,
    type,
  );
  const primaryActionAvailable = passportReady;
  const passportReadinessSummary = passportReady
    ? "Все паспорта приняты. Данные проверит оператор."
    : type === "family"
      ? `Нужен файл паспорта: ${missingPassportLabels.join(", ")}.`
      : "Нужен файл паспорта.";
  const firstUploadedApplicantName = passportUploadFullName(passportUploads[0]);

  function selectType(nextType: Submission["type"]) {
    const nextApplicantCount = nextType === "family" ? Math.max(2, familyCount) : 1;
    onType(nextType);
    if (nextType === "family") {
      onFamilyCount(nextApplicantCount);
    }
    setActiveApplicantIndex(0);
    setPassportUploads((current) => prunePassportUploads(current, nextApplicantCount));
  }

  function updatePreliminaryIntake<Key extends keyof PreliminaryIntakeDraft>(
    key: Key,
    value: PreliminaryIntakeDraft[Key],
  ) {
    setPreliminaryIntake((current) => ({ ...current, [key]: value }));
  }

  function addFamilyMember() {
    if (type !== "family") {
      onType("family");
      onFamilyCount(Math.max(2, familyCount));
      setActiveApplicantIndex(1);
      return;
    }

    const nextCount = Math.min(maxFamilyApplicants, applicantCount + 1);
    const nextIndex = nextCount - 1;
    onFamilyCount(nextCount);
    setActiveApplicantIndex(nextIndex);
  }

  async function addPassportFiles(files: FileList | null) {
    if (!files?.length) return;

    const allSelectedFiles = Array.from(files);
    const rejectedCount = allSelectedFiles.filter(
      (file) => !passportScanUploadMimeTypes.has(file.type),
    ).length;
    const selectedFiles = allSelectedFiles
      .filter((file) => passportScanUploadMimeTypes.has(file.type))
      .slice(0, maxFamilyApplicants);
    setPassportFileError(
      rejectedCount ? "Паспорт принимается только в формате JPEG или PNG." : "",
    );
    if (!selectedFiles.length) return;
    const nextBatch = uploadBatchRef.current + 1;
    uploadBatchRef.current = nextBatch;

    if (selectedFiles.length > 1) {
      onType("family");
      onFamilyCount(Math.max(2, Math.min(maxFamilyApplicants, selectedFiles.length)));
    }

    const targetStartIndex = selectedFiles.length > 1 ? 0 : safeActiveApplicantIndex;
    const nextUploads = selectedFiles.map((file, index) => ({
      applicantIndex: boundedApplicantIndex(
        targetStartIndex + index,
        maxFamilyApplicants,
      ),
      extractedFields: [],
      file,
      fileName: file.name,
      id: `passport-${Date.now()}-${index}`,
      status: "extracting" as const,
    }));
    setPassportUploads((current) =>
      mergePassportUploads(current, nextUploads, applicantCount),
    );
    setActiveApplicantIndex(nextUploads[0]?.applicantIndex ?? safeActiveApplicantIndex);
    onPassportFilesSelected();

    await Promise.all(
      nextUploads.map(async (upload) => {
        try {
          const e2eFields = e2ePassportMockFields(upload.fileName);
          if (e2eFields) {
            if (uploadBatchRef.current !== nextBatch) return;
            setPassportFileError("");
            setPassportUploads((current) =>
              current.map((candidate) =>
                candidate.id === upload.id
                  ? {
                      ...candidate,
                      extractedFields: e2eFields,
                      status: "ready",
                    }
                  : candidate,
              ),
            );
            return;
          }

          const result = await invokePassportExtraction({
            applicantIndex: upload.applicantIndex,
            localFile: upload.file,
          });
          const extractedFields: PassportExtractedField[] = result.fields.map(
            (field) => ({
              ...field,
              source: "passport_scan" as const,
              verified: false,
            }),
          );

          if (uploadBatchRef.current !== nextBatch) return;
          setPassportFileError("");

          setPassportUploads((current) =>
            current.map((candidate) =>
              candidate.id === upload.id
                ? {
                    ...candidate,
                    extractedFields,
                    status: result.status === "extracted" ? "ready" : "unavailable",
                  }
                : candidate,
            ),
          );
        } catch {
          if (uploadBatchRef.current !== nextBatch) return;

          setPassportUploads((current) =>
            current.map((candidate) =>
              candidate.id === upload.id
                ? {
                    ...candidate,
                    extractedFields: [],
                    status: "failed",
                  }
                : candidate,
            ),
          );
        }
      }),
    );
  }

  function showPassportNotReadyAlert() {
    window.alert(
      "Паспорт еще не принят. Загрузите JPEG или PNG для каждого заявителя и дождитесь завершения проверки. Если OCR недоступен, файл уйдет на ручную проверку оператора.",
    );
  }

  function openQuestionnaireStep() {
    if (!passportReady) {
      showPassportNotReadyAlert();
      return;
    }

    setCreateStep("questionnaire");
  }

  function handlePrimaryAction() {
    if (createStep === "passport") return openQuestionnaireStep();

    onCreate(passportUploads, preliminaryIntake);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    void addPassportFiles(event.dataTransfer.files);
  }

  useEffect(() => {
    if (!focusCloseToken) return;
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [focusCloseToken]);

  useEffect(() => {
    setActiveApplicantIndex((current) =>
      boundedApplicantIndex(current, applicantCount),
    );
    setPassportUploads((current) => prunePassportUploads(current, applicantCount));
  }, [applicantCount]);

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={`vf-figma-surface create-submission-drawer ${
        createStep === "passport" ? "is-passport-step" : "is-questionnaire-step"
      } fixed inset-0 z-50 bg-[#0e0e10] flex flex-col overflow-hidden`}
      exit={{ opacity: 0, y: 20 }}
      initial={{ opacity: 0, y: 20 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-title"
      transition={{ damping: 25, stiffness: 250, type: "spring" }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
      }}
    >
      <header className="h-[64px] shrink-0 border-b border-[#202124] flex items-center px-6 gap-4 bg-[#0e0e10]/80 backdrop-blur-xl">
        <button
          ref={closeButtonRef}
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-[10px] text-white/50 hover:text-white hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
          type="button"
          aria-label="Закрыть создание"
          onClick={onClose}
        >
          <ArrowLeft className="w-[18px] h-[18px]" />
        </button>

        <div className="flex-1 min-w-0 flex items-center gap-3">
          <h1
            id="create-title"
            className="text-[15px] font-medium tracking-wide text-white m-0 truncate"
          >
            Сборка документов
          </h1>
          <span className="px-2 py-0.5 rounded-[4px] bg-white/5 border border-white/5 text-[10px] uppercase tracking-wider text-white/40 font-mono">
            Шаг&nbsp; {createStep === "passport" ? "1" : "2"}/2
          </span>
        </div>
      </header>

      <h2 className="sr-only">Новая подача</h2>
      <div className="sr-only" role="group" aria-label="Предварительная заявка" />
      <div className="sr-only" role="group" aria-label="Заявители в подаче" />
      {createStep === "passport" ? (
        <h2 className="sr-only">Загрузите паспорт</h2>
      ) : null}

      <div className="flex-1 overflow-y-auto p-6 lg:p-10">
        <div className="max-w-[1140px] mx-auto h-full">
          {createStep === "passport" ? (
            <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-10 lg:gap-12 min-h-full">
              <div className="flex flex-col gap-6">
                <div className="create-passport-topbar">
                  <button
                    className="create-passport-back"
                    type="button"
                    aria-label="Закрыть создание"
                    onClick={onClose}
                  >
                    <ArrowLeft className="w-[18px] h-[18px]" />
                  </button>
                  <div className="min-w-0">
                    <h2>Паспорт</h2>
                    <span>{type === "family" ? `${applicantCount} заявителя` : "1 заявитель"}</span>
                  </div>
                  <button
                    disabled={!primaryActionAvailable}
                    className="create-passport-next"
                    type="button"
                    onClick={handlePrimaryAction}
                  >
                    Дальше
                  </button>
                </div>

                <section
                  className="rounded-[14px] border border-[#202124] bg-[#121214] p-3.5"
                  aria-label="Тип подачи"
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-medium">
                        Заявитель / Семья
                      </p>
                      <h3 className="text-[13px] text-white/80 font-medium mt-1">
                        Структура подачи
                      </h3>
                    </div>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-[4px] bg-[#1a1a1d] border border-[#242529] text-white/50">
                      {applicantCount} чел.
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {submissionTypeOptions.map((option) => (
                      <button
                        key={option.value}
                        className={`h-10 rounded-[8px] border text-[13px] font-medium transition-colors ${
                          type === option.value
                            ? "border-white/18 bg-white/10 text-white"
                            : "border-[#242529] bg-[#161617] text-white/45 hover:text-white/75 hover:border-white/12"
                        }`}
                        type="button"
                        aria-pressed={type === option.value}
                        onClick={() => selectType(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </section>

                {firstUploadedApplicantName ? (
                  <p className="text-[12px] text-white/45">
                    {firstUploadedApplicantName}
                  </p>
                ) : null}

                {type === "family" ? (
                  <section
                    className="lg:hidden rounded-[14px] border border-[#202124] bg-[#121214] p-3.5"
                    aria-label="Заявители семьи и общие ответы"
                  >
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-medium">
                          Семья
                        </p>
                        <h3 className="text-[13px] text-white/80 font-medium mt-1">
                          Заявители и общие ответы
                        </h3>
                      </div>
                      <button
                        className="h-8 px-3 rounded-[7px] border border-[#242529] bg-[#161617] text-[12px] text-white/55 hover:text-white/85 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        type="button"
                        disabled={applicantCount >= maxFamilyApplicants}
                        onClick={addFamilyMember}
                      >
                        + заявитель
                      </button>
                    </div>

                    <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
                      {Array.from({ length: applicantCount }, (_, index) => {
                        const upload = passportUploads.find(
                          (candidate) => candidate.applicantIndex === index,
                        );
                        const readinessLabel = passportUploadReadinessLabel(upload);

                        return (
                          <button
                            key={index}
                            className={`rounded-[10px] border px-3 py-2 text-left transition-colors ${
                              safeActiveApplicantIndex === index
                                ? "border-white/16 bg-white/8"
                                : "border-[#202124] bg-[#151517] hover:border-white/10"
                            }`}
                            type="button"
                            aria-pressed={safeActiveApplicantIndex === index}
                            onClick={() => setActiveApplicantIndex(index)}
                          >
                            <strong className="block truncate text-[13px] text-white/78 font-medium">
                              {applicantLabel(index, type)}
                            </strong>
                            <em className="block truncate text-[11px] not-italic text-white/35 mt-0.5">
                              {upload?.fileName ?? "Паспорт не загружен"}
                            </em>
                            <span className="mt-1 block truncate text-[10px] text-white/38">
                              {readinessLabel}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-3 grid gap-2 border-t border-[#202124] pt-3">
                      {firstStepFamilyQuestions.map((question) => (
                        <div
                          key={question.key}
                          className="grid gap-2 rounded-[10px] bg-[#151517] px-3 py-2"
                        >
                          <span className="text-[12px] leading-snug text-white/58">
                            {question.label}
                          </span>
                          <span className="grid grid-cols-2 rounded-[7px] border border-[#242529] bg-[#101012] p-0.5">
                            {[true, false].map((value) => (
                              <button
                                key={String(value)}
                                className={`h-8 rounded-[6px] px-2 text-[12px] font-medium transition-colors ${
                                  preliminaryIntake[question.key] === value
                                    ? "bg-white/12 text-white"
                                    : "text-white/38 hover:text-white/75"
                                }`}
                                type="button"
                                aria-pressed={preliminaryIntake[question.key] === value}
                                onClick={() =>
                                  updatePreliminaryIntake(question.key, value)
                                }
                              >
                                {value ? "Да" : "Нет"}
                              </button>
                            ))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                <input
                  ref={passportFileInputRef}
                  className="pi-file-input"
                  aria-hidden="true"
                  accept="image/jpeg,image/png"
                  multiple
                  name="preintakePassportScans"
                  tabIndex={-1}
                  type="file"
                  onChange={(event) => {
                    void addPassportFiles(event.currentTarget.files);
                    event.currentTarget.value = "";
                  }}
                />

                <div
                  className={`flex-1 min-h-[360px] rounded-[16px] transition-all duration-300 flex flex-col items-center justify-center p-8 text-center relative overflow-hidden ${
                    isDragging
                      ? "border border-white/20 bg-[#161617] shadow-[0_0_40px_rgba(255,255,255,0.03)] scale-[1.01]"
                      : "border border-[#202124] bg-[#121214] hover:border-white/10 hover:bg-[#141416]"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="absolute inset-4 rounded-[12px] border border-dashed border-white/5 pointer-events-none" />
                  <div className="w-14 h-14 rounded-full bg-[#18181b] border border-[#2a2a2e] flex items-center justify-center mb-5 shadow-inner relative z-10">
                    <UploadCloud className="w-6 h-6 text-white/40" />
                  </div>
                  <h3
                    id="passport-intake-title"
                    className="text-[15px] font-medium text-white/80 mb-1.5 relative z-10"
                  >
                    Перетащите файлы
                  </h3>
                  <p className="text-[12px] text-white/30 max-w-[240px] mb-8 font-light relative z-10 leading-relaxed">
                    JPEG, PNG.
                    <br />
                    Разворот загранпаспорта с MRZ.
                  </p>
                  {passportFileError ? (
                    <p className="mb-4 text-[12px] text-red-400 relative z-10" role="alert">
                      {passportFileError}
                    </p>
                  ) : null}
                  <button
                    className="h-10 px-6 bg-white text-black hover:bg-white/90 font-medium text-[13px] rounded-[8px] transition-all relative z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                    type="button"
                    onClick={() => passportFileInputRef.current?.click()}
                  >
                    Выбрать файлы
                  </button>
                </div>
              </div>

              <div className="hidden lg:flex flex-col h-full max-h-[800px] border-l border-[#202124] pl-10">
                <section
                  className="mb-5 rounded-[14px] border border-[#202124] bg-[#121214] p-3.5"
                  aria-label="Заявители и общие семейные ответы"
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-medium">
                        {type === "family" ? "Семья" : "Заявитель"}
                      </p>
                      <h3 className="text-[13px] text-white/80 font-medium mt-1">
                        {type === "family" ? "Заявители в семье" : "Один заявитель"}
                      </h3>
                    </div>
                    <button
                      className="h-8 px-3 rounded-[7px] border border-[#242529] bg-[#161617] text-[12px] text-white/55 hover:text-white/85 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      type="button"
                      aria-label="Добавить заявителя в семью"
                      disabled={applicantCount >= maxFamilyApplicants}
                      onClick={addFamilyMember}
                    >
                      + заявитель
                    </button>
                  </div>

                  <div className="grid gap-2">
                    {Array.from({ length: applicantCount }, (_, index) => {
                      const upload = passportUploads.find(
                        (candidate) => candidate.applicantIndex === index,
                      );
                      const visualStatus = passportUploadVisualStatus(upload);
                      const readinessLabel = passportUploadReadinessLabel(upload);

                      return (
                        <button
                          key={index}
                          className={`flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2 text-left transition-colors ${
                            safeActiveApplicantIndex === index
                              ? "border-white/16 bg-white/8"
                              : "border-[#202124] bg-[#151517] hover:border-white/10"
                          }`}
                          type="button"
                          aria-pressed={safeActiveApplicantIndex === index}
                          onClick={() => setActiveApplicantIndex(index)}
                        >
                          <span className="min-w-0">
                            <strong className="block truncate text-[13px] text-white/78 font-medium">
                              {applicantLabel(index, type)}
                            </strong>
                            <em className="block truncate text-[11px] not-italic text-white/35 mt-0.5">
                              {upload?.fileName ?? "Паспорт не загружен"}
                            </em>
                            <small className="mt-1 block truncate text-[10px] text-white/38">
                              {readinessLabel}
                            </small>
                          </span>
                          <i
                            className={`h-2 w-2 rounded-full ${
                              visualStatus === "ready"
                                ? "bg-emerald-400"
                                : visualStatus === "extracting" ||
                                    visualStatus === "unavailable"
                                  ? "bg-amber-400"
                                  : "bg-white/18"
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                      );
                    })}
                  </div>

                  {type === "family" ? (
                    <div className="mt-4 grid gap-2 border-t border-[#202124] pt-3">
                      {firstStepFamilyQuestions.map((question) => (
                        <div
                          key={question.key}
                          className="flex items-center justify-between gap-3 rounded-[10px] bg-[#151517] px-3 py-2"
                        >
                          <span className="text-[12px] leading-snug text-white/58">
                            {question.label}
                          </span>
                          <span className="flex shrink-0 rounded-[7px] border border-[#242529] bg-[#101012] p-0.5">
                            {[true, false].map((value) => (
                              <button
                                key={String(value)}
                                className={`h-7 min-w-10 rounded-[6px] px-2 text-[12px] font-medium transition-colors ${
                                  preliminaryIntake[question.key] === value
                                    ? "bg-white/12 text-white"
                                    : "text-white/38 hover:text-white/75"
                                }`}
                                type="button"
                                aria-pressed={preliminaryIntake[question.key] === value}
                                onClick={() =>
                                  updatePreliminaryIntake(question.key, value)
                                }
                              >
                                {value ? "Да" : "Нет"}
                              </button>
                            ))}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>

                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-[13px] uppercase tracking-widest font-medium text-white/40">
                    Очередь обработки
                  </h3>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-[4px] bg-[#1a1a1d] border border-[#242529] text-white/50">
                    {passportUploads.length} ITEMS
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-[#2a2a2e]">
                  {passportUploads.length ? (
                    <AnimatePresence>
                      {passportUploads.map((upload) => {
                        const visualStatus = passportUploadVisualStatus(upload);
                        const isProcessing = visualStatus === "extracting";
                        const isReady = visualStatus === "ready";
                        return (
                          <motion.div
                            key={upload.id}
                            layout
                            animate={{ opacity: 1, y: 0 }}
                            className="p-3.5 rounded-[12px] bg-[#141416] border border-[#202124] relative overflow-hidden group hover:border-[#2a2a2e] transition-colors"
                            exit={{ opacity: 0, scale: 0.95 }}
                            initial={{ opacity: 0, y: 10 }}
                          >
                            {isProcessing ? (
                              <div className="absolute bottom-0 left-0 h-[1px] bg-white/20 w-full animate-pulse" />
                            ) : null}
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 shrink-0 rounded-[8px] bg-[#1a1a1d] border border-[#242529] flex items-center justify-center mt-0.5">
                                {upload.file?.type.startsWith("image/") ? (
                                  <ImageIcon className="w-4 h-4 text-white/30" />
                                ) : (
                                  <FileText className="w-4 h-4 text-white/30" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="text-[13.5px] font-medium text-white/80 truncate tracking-tight">
                                    {upload.fileName}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[11px] font-mono text-white/30">
                                    {formatFileSize(upload.file?.size)}
                                  </span>
                                  <span className="w-0.5 h-0.5 rounded-full bg-white/10" />
                                  {isProcessing ? (
                                    <span className="text-[11px] text-white/60 flex items-center gap-1.5 font-medium tracking-wide uppercase">
                                      <ScanLine className="w-3 h-3 animate-pulse opacity-50" />
                                      Processing
                                    </span>
                                  ) : isReady ? (
                                    <span className="text-[11px] text-white/40 flex items-center gap-1 font-medium tracking-wide uppercase">
                                      <CheckCircle2 className="w-3 h-3 opacity-50" />
                                      Done
                                    </span>
                                  ) : visualStatus === "unavailable" ? (
                                    <span className="text-[11px] text-amber-200/70 tracking-wide uppercase">
                                      Проверка оператором
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-white/40 tracking-wide uppercase">
                                      Waiting
                                    </span>
                                  )}
                                </div>
                                {upload.extractedFields.length ? (
                                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                                    {upload.extractedFields.slice(0, 3).map((field) => (
                                      <span
                                        key={`${upload.id}-${field.key}`}
                                        className="px-2 py-0.5 rounded-[4px] bg-[#1a1a1d] border border-[#242529] text-[10px] text-white/50 font-medium"
                                      >
                                        {field.value}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  ) : (
                    <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center px-4">
                      <div className="w-10 h-10 rounded-full bg-[#161617] border border-[#202124] flex items-center justify-center mb-3">
                        <Search className="w-4 h-4 text-white/20" />
                      </div>
                      <p className="text-[12px] text-white/30 font-light">
                        Локальная очередь пуста.
                      </p>
                    </div>
                  )}
                </div>

              </div>
            </div>
          ) : null}

          {createStep === "questionnaire" ? (
            <section className="cf-grid" aria-label="Следующие шаги анкеты">
              <article className="cf-panel extraction-review-placeholder">
                <div className="create-panel-head">
                  <div>
                    <p className="kicker">Паспорт</p>
                    <h3>Извлечённые данные паспорта</h3>
                  </div>
                  <span>{passportUploads.length ? "Подставятся" : "Нет файла"}</span>
                </div>
                <div className="ef-preview">
                  {extractedFieldPreviewItems.map((item) => {
                    const value = passportUploadFieldValue(activeUpload, item.key);

                    return (
                      <label key={item.key}>
                        <span>{item.label}</span>
                        <input
                          readOnly
                          value={
                            value ||
                            (passportUploads.length
                              ? "Требует проверки"
                              : "Сначала загрузите паспорт")
                          }
                        />
                      </label>
                    );
                  })}
                </div>
                <p>
                  Данные паспорта требуют проверки оператором. Автозаполнение является
                  предварительным и не подтверждает корректность документа.
                </p>
              </article>

              <article className="cf-panel media-requirements">
                <div className="create-panel-head">
                  <div>
                    <p className="kicker">Файлы</p>
                    <h3>Обязательные файлы</h3>
                  </div>
                  <span>{applicantCount} заяв.</span>
                </div>
                <div className="mr-list">
                  {mediaRequirements.map(([title, meta]) => (
                    <div key={title}>
                      <strong>{title}</strong>
                      <span>{meta}</span>
                    </div>
                  ))}
                </div>
                <button
                  className="secondary-button mr-action"
                  type="button"
                  onClick={handlePrimaryAction}
                >
                  Открыть загрузку
                </button>
              </article>

              <article className="cf-panel">
                <div className="create-panel-head">
                  <div>
                    <p className="kicker">Анкета</p>
                    <h3>Разделы анкеты</h3>
                  </div>
                  <span>Черновик</span>
                </div>
                <div className="qs-preview">
                  {questionnaireSections.map((section) => (
                    <div className="qs-item" key={section}>
                      <strong>{section}</strong>
                      <span>Заполнить после сохранения</span>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          ) : null}
        </div>
      </div>

      {createStep === "passport" ? (
        <footer className="shrink-0 sticky bottom-0 px-6 lg:px-10 py-4 border-t border-[#202124] bg-[#0e0e10]/95 backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-[12px] text-white/40">
            {type === "family" ? `${applicantCount} заявителя. ` : ""}
            {passportReadinessSummary}
          </span>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              disabled={!passportReady}
              className={`h-11 px-5 rounded-[8px] text-[13px] font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
                passportReady
                  ? "bg-white/10 text-white hover:bg-white/15 border border-white/10"
                  : "bg-[#161617] text-white/25 cursor-not-allowed border border-[#202124]"
              }`}
              type="button"
              onClick={() => onCreate(passportUploads, preliminaryIntake)}
            >
              Сохранить черновик
            </button>
            <button
              disabled={!primaryActionAvailable}
              className={`h-11 px-6 rounded-[8px] text-[13px] font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
                primaryActionAvailable
                  ? "bg-white text-black hover:bg-white/90 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                  : "bg-[#161617] text-white/25 cursor-not-allowed border border-[#202124]"
              }`}
              type="button"
              onClick={handlePrimaryAction}
            >
              Дальше
            </button>
          </div>
        </footer>
      ) : null}

      {createStep === "questionnaire" ? (
        <footer className="shrink-0 px-6 lg:px-10 py-4 border-t border-[#202124] bg-[#0e0e10]/90 backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-[12px] text-white/40">
            Создайте черновик, чтобы загрузить обязательные файлы.
          </span>
          <div className="flex gap-3">
            <button
              className="h-10 px-4 rounded-[8px] bg-[#161617] border border-[#202124] text-white/60 hover:text-white hover:bg-[#1a1a1d] text-[13px] font-medium transition-colors"
              type="button"
              onClick={() => setCreateStep("passport")}
            >
              Назад
            </button>
            <button
              className="h-10 px-5 rounded-[8px] bg-white/10 hover:bg-white/15 text-white text-[13px] font-medium transition-colors"
              type="button"
              onClick={() => onCreate(passportUploads, preliminaryIntake)}
            >
              Сохранить черновик
            </button>
            <button
              className="h-10 px-5 rounded-[8px] bg-white text-black hover:bg-white/90 text-[13px] font-medium transition-colors"
              type="button"
              onClick={handlePrimaryAction}
            >
              Создать и открыть
            </button>
          </div>
        </footer>
      ) : null}
    </motion.div>
  );
}

function mergePassportUploads(
  current: PassportUploadDraft[],
  nextUploads: PassportUploadDraft[],
  applicantCount: number,
) {
  const replacedIndexes = new Set(nextUploads.map((upload) => upload.applicantIndex));
  const retainedUploads = current.filter(
    (upload) =>
      upload.applicantIndex < applicantCount &&
      !replacedIndexes.has(upload.applicantIndex),
  );

  const mergedUploads = [...retainedUploads, ...nextUploads];
  return mergedUploads.sort(
    (first: PassportUploadDraft, second: PassportUploadDraft) =>
      first.applicantIndex - second.applicantIndex,
  );
}

function prunePassportUploads(
  uploads: PassportUploadDraft[],
  applicantCount: number,
) {
  return uploads.filter(
    (upload) => upload.applicantIndex >= 0 && upload.applicantIndex < applicantCount,
  );
}

function allApplicantPassportsReady(
  passportUploads: PassportUploadDraft[],
  applicantCount: number,
) {
  return Array.from({ length: applicantCount }, (_, index) =>
    isPassportUploadReady(
      passportUploads.find((upload) => upload.applicantIndex === index),
    ),
  ).every(Boolean);
}

function missingApplicantPassportLabels(
  passportUploads: PassportUploadDraft[],
  applicantCount: number,
  type: Submission["type"],
) {
  return Array.from({ length: applicantCount }, (_, index) => index)
    .filter(
      (index) =>
        !isPassportUploadReady(
          passportUploads.find((upload) => upload.applicantIndex === index),
        ),
    )
    .map((index) => applicantLabel(index, type));
}

function passportUploadReadinessLabel(upload: PassportUploadDraft | undefined) {
  if (isPassportUploadReady(upload)) return "Паспорт принят";
  if (upload?.status === "extracting") return "Проверка файла";
  if (upload?.file) return "Файл не принят";
  return "Нужен файл паспорта";
}

function applicantLabel(index: number, type: Submission["type"]) {
  if (type === "single") return "Заявитель";
  if (index === 0) return "Основной заявитель";
  return `Заявитель ${index + 1}`;
}

function formatFileSize(size = 0) {
  if (size >= 1_000_000) return `${(size / 1_000_000).toFixed(1)} MB`;
  if (size >= 1_000) return `${Math.round(size / 1_000)} KB`;
  return `${size} B`;
}
