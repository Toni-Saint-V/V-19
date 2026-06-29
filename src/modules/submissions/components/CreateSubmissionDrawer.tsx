import { type DragEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Plus,
  ScanLine,
} from "lucide-react";
import { invokePassportExtraction } from "../passportExtractionService";
import "./CreateSubmissionDrawer.css";
import {
  type City,
  type PassportExtractedField,
  type PassportExtractedFieldKey,
  type PassportUploadDraft,
  type PreliminaryIntakeDraft,
  type Submission,
} from "../types";

const maxFamilyApplicants = 6;

type CreateSubmissionStep = "passport-family" | "questionnaire-files";
type CreateMode = "applicant" | "family";
type CreateApplicantRole = "primary" | "secondary";
type CreatePassportStatus =
  | "missing"
  | "waiting"
  | "processing"
  | "uploaded"
  | "error";
type CreateUploadState = "idle" | "waiting" | "processing" | "error" | "complete";
type CreateDraftState = "dirty" | "saving" | "saved" | "error";

type CreateSubmissionState = {
  applicants: Array<{
    id: string;
    label: string;
    passportStatus: CreatePassportStatus;
    role: CreateApplicantRole;
    selected: boolean;
  }>;
  canGoNext: boolean;
  currentStep: CreateSubmissionStep;
  draftState: CreateDraftState;
  familyAnswers: {
    sameRussiaAddress?: boolean;
    sameSpainResidence?: boolean;
  };
  mode: CreateMode;
  uploadState: CreateUploadState;
};

const createSteps: Array<{
  ariaLabel?: string;
  id: CreateSubmissionStep;
  label: string;
  number: string;
}> = [
  {
    ariaLabel: "Шаг 1: паспорт и семья",
    id: "passport-family",
    label: "Паспорт и семья",
    number: "1",
  },
  { id: "questionnaire-files", label: "Анкета и файлы", number: "2" },
];

const firstStepFamilyQuestions: Array<{
  answerKey: keyof CreateSubmissionState["familyAnswers"];
  intakeKey: Extract<keyof PreliminaryIntakeDraft, "sameHomeAddress" | "sameSpainStay">;
  label: string;
}> = [
  {
    answerKey: "sameRussiaAddress",
    intakeKey: "sameHomeAddress",
    label: "Один адрес проживания в России?",
  },
  {
    answerKey: "sameSpainResidence",
    intakeKey: "sameSpainStay",
    label: "Одно проживание в Испании?",
  },
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
  ["Фото на белом фоне", "35x45"],
  ["Селфи", "для внутренней сверки"],
  ["Селфи 2", "если требуется консульством"],
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

function isPassportUploadReady(upload: PassportUploadDraft | undefined) {
  return upload?.status === "ready" && hasRequiredPassportIdentity(upload);
}

function passportUploadVisualStatus(
  upload: PassportUploadDraft | undefined,
): PassportUploadVisualStatus {
  if (!upload) return "empty";
  if (upload.status === "extracting") return "extracting";
  if (isPassportUploadReady(upload)) return "ready";
  if (upload.status === "unavailable" || upload.status === "failed") {
    return "unavailable";
  }

  return "selected";
}

function createPassportStatusFromUpload(
  upload: PassportUploadDraft | undefined,
): CreatePassportStatus {
  if (!upload) return "missing";
  if (upload.status === "extracting") return "processing";
  if (isPassportUploadReady(upload)) return "uploaded";
  if (upload.status === "failed" || upload.status === "unavailable") return "error";
  return "waiting";
}

function createUploadStateFromUploads(
  passportUploads: PassportUploadDraft[],
): CreateUploadState {
  if (!passportUploads.length) return "idle";
  if (passportUploads.some((upload) => upload.status === "extracting")) {
    return "processing";
  }
  if (passportUploads.some((upload) => upload.status === "failed")) return "error";
  if (passportUploads.every(isPassportUploadReady)) return "complete";
  return "waiting";
}

function passportUploadStatusText(upload: PassportUploadDraft | undefined) {
  const fullName = passportUploadFullName(upload);
  if (fullName) return fullName;
  if (!upload) return "Паспорт не добавлен";
  if (upload.status === "extracting") return "Распознаем MRZ";
  if (upload.status === "unavailable" || upload.status === "failed") {
    return "Не подтвержден как паспорт";
  }

  return upload.fileName;
}

function passportUploadFieldValue(
  upload: PassportUploadDraft | undefined,
  key: PassportExtractedFieldKey,
) {
  return upload?.extractedFields.find((field) => field.key === key)?.value.trim() ?? "";
}

function passportUploadsStatus(passportUploads: PassportUploadDraft[]) {
  if (!passportUploads.length) {
    return {
      label: "Файл не отправляется",
      tone: "idle" as const,
      title: "Ожидает файл",
    };
  }

  if (passportUploads.some((upload) => upload.status === "extracting")) {
    return {
      label: "Распознаем данные паспорта. ФИО подставится в слот, если OCR увидит MRZ.",
      tone: "processing" as const,
      title: "Обработка",
    };
  }

  const extractedCount = passportUploads.filter(isPassportUploadReady).length;

  if (extractedCount) {
    return {
      label:
        extractedCount === passportUploads.length
          ? "ФИО подставлено из MRZ. Проверьте данные после создания черновика."
          : `ФИО найдено: ${extractedCount}/${passportUploads.length}. Остальные паспорта требуют проверки.`,
      tone: "success" as const,
      title: "Готово",
    };
  }

  return {
    label:
      "Файл не подтвержден как паспорт. Загрузите разворот загранпаспорта с MRZ.",
    tone: "selected" as const,
    title: "Не принято",
  };
}

function passportStatusClassName(
  tone: ReturnType<typeof passportUploadsStatus>["tone"],
) {
  if (tone === "success") return "is-success";
  if (tone === "processing") return "is-processing";
  if (tone === "selected") return "is-selected";
  return "is-idle";
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
  applicantNames?: string[];
  city: City;
  dirty: boolean;
  familyCount: number;
  focusCloseToken?: number;
  onApplicantName?: (index: number, name: string) => void;
  onCity: (city: City) => void;
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
  const draftTimerRef = useRef<number | null>(null);
  const [passportUploads, setPassportUploads] = useState<PassportUploadDraft[]>([]);
  const [passportFileError, setPassportFileError] = useState("");
  const [activeApplicantIndex, setActiveApplicantIndex] = useState(0);
  const [highlightedApplicantIndex, setHighlightedApplicantIndex] = useState<
    number | null
  >(null);
  const [createStep, setCreateStep] =
    useState<CreateSubmissionStep>("passport-family");
  const [createMode, setCreateMode] = useState<CreateMode>("applicant");
  const [familyAnswers, setFamilyAnswers] = useState<
    CreateSubmissionState["familyAnswers"]
  >({});
  const [draftState, setDraftState] = useState<CreateDraftState>("dirty");
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
  const passportStatus = passportUploadsStatus(passportUploads);
  const passportStatusClass = passportStatusClassName(passportStatus.tone);
  const hasActiveUpload = Boolean(activeUpload);
  const uploadButtonLabel = hasActiveUpload
    ? `Заменить паспорт: ${applicantLabel(safeActiveApplicantIndex, type)}`
    : `Загрузить паспорт: ${applicantLabel(safeActiveApplicantIndex, type)}`;
  const createState: CreateSubmissionState = {
    applicants: Array.from({ length: applicantCount }, (_, index) => {
      const upload = passportUploads.find(
        (candidate) => candidate.applicantIndex === index,
      );

      return {
        id: `applicant-${index + 1}`,
        label: applicantLabel(index, "family"),
        passportStatus: createPassportStatusFromUpload(upload),
        role: index === 0 ? "primary" : "secondary",
        selected: index === safeActiveApplicantIndex,
      };
    }),
    canGoNext: passportReady,
    currentStep: createStep,
    draftState,
    familyAnswers,
    mode: createMode,
    uploadState: createUploadStateFromUploads(passportUploads),
  };

  function markDraftDirty() {
    setDraftState("dirty");
  }

  function updatePreliminaryIntake<Key extends keyof PreliminaryIntakeDraft>(
    key: Key,
    value: PreliminaryIntakeDraft[Key],
  ) {
    markDraftDirty();
    setPreliminaryIntake((current) => ({ ...current, [key]: value }));
  }

  function updateFamilyAnswer(
    answerKey: keyof CreateSubmissionState["familyAnswers"],
    intakeKey: Extract<keyof PreliminaryIntakeDraft, "sameHomeAddress" | "sameSpainStay">,
    value: boolean,
  ) {
    markDraftDirty();
    setFamilyAnswers((current) => ({ ...current, [answerKey]: value }));
    updatePreliminaryIntake(intakeKey, value);
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
    markDraftDirty();
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
    setHighlightedApplicantIndex(null);
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

  function addFamilyMember() {
    markDraftDirty();
    if (type !== "family") {
      onType("family");
      onFamilyCount(Math.max(2, familyCount));
      setActiveApplicantIndex(1);
      setHighlightedApplicantIndex(1);
      return;
    }

    const nextCount = Math.min(maxFamilyApplicants, applicantCount + 1);
    const nextIndex = nextCount - 1;
    onFamilyCount(nextCount);
    setActiveApplicantIndex(nextIndex);
    setHighlightedApplicantIndex(nextIndex);
  }

  function showPassportNotReadyAlert() {
    window.alert(
      "Паспорт еще не подтвержден. Загрузите разворот загранпаспорта с MRZ и дождитесь зеленого статуса.",
    );
  }

  function openQuestionnaireStep() {
    if (!passportReady) {
      showPassportNotReadyAlert();
      return;
    }

    setCreateStep("questionnaire-files");
  }

  function handlePrimaryAction() {
    if (createStep === "passport-family") return openQuestionnaireStep();

    onCreate(passportUploads, preliminaryIntake);
  }

  function handleSaveDraft() {
    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current);
    }

    setDraftState("saving");
    draftTimerRef.current = window.setTimeout(() => {
      setDraftState("saved");
      draftTimerRef.current = null;
    }, 420);
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
    setHighlightedApplicantIndex((current) => {
      if (current === null) return null;
      return current < applicantCount ? current : null;
    });
  }, [applicantCount]);

  useEffect(
    () => () => {
      if (draftTimerRef.current !== null) {
        window.clearTimeout(draftTimerRef.current);
      }
    },
    [],
  );

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="vf-figma-surface create-flow-shell fixed inset-0 z-50 bg-[#0e0e10] flex flex-col overflow-hidden"
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
      <header className="create-flow-header">
        <div className="create-flow-title-row">
          <button
            ref={closeButtonRef}
            className="create-flow-close"
            type="button"
            aria-label="Закрыть создание"
            onClick={onClose}
          >
            <ArrowLeft aria-hidden="true" />
          </button>

          <div className="create-flow-title">
            <h1 id="create-title">Новая подача</h1>
            <p>Испания · Семья · {applicantCount} заявителя · Черновик</p>
          </div>
        </div>

        <ol className="cf-steps create-flow-steps" aria-label="Шаги создания подачи">
          {createSteps.map((step) => {
            const isActive = step.id === createState.currentStep;
            const isDisabled =
              step.id === "questionnaire-files" && !createState.canGoNext;

            return (
              <li key={step.id} className={isActive ? "is-active" : ""}>
                <button
                  type="button"
                  aria-current={isActive ? "step" : undefined}
                  aria-label={step.ariaLabel ?? `Шаг ${step.number}: ${step.label}`}
                  disabled={isDisabled}
                  onClick={() => {
                    if (step.id === "passport-family") {
                      setCreateStep("passport-family");
                      return;
                    }

                    openQuestionnaireStep();
                  }}
                >
                  <span>{step.number}</span>
                  <strong>{step.label}</strong>
                </button>
              </li>
            );
          })}
        </ol>
      </header>

      <div className="create-flow-body">
        <div className="create-flow-container">
          {createStep === "passport-family" ? (
            <section
              className={[
                "create-passport-layout",
                createState.mode === "family" ? "is-family-mode" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label="Паспорт и семья"
            >
              <article
                className={[
                  "create-upload-panel",
                  isDragging ? "is-dragging" : "",
                  passportUploads.length ? "has-passport" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
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

                <div className="create-upload-visual" aria-hidden="true">
                  <FileText />
                  <span />
                </div>
                <p className="kicker">Паспортная точка входа</p>
                <h2>Добавьте паспорт</h2>
                <p>
                  Загрузите скан или фото разворота паспорта. Файл останется в
                  черновике, а распознавание не отправит данные дальше без
                  подтверждения агента.
                </p>
                {passportFileError ? (
                  <p className="create-upload-error" role="alert">
                    {passportFileError}
                  </p>
                ) : null}
                <div className="create-upload-actions">
                  <button
                    className="create-upload-button"
                    type="button"
                    aria-label={uploadButtonLabel}
                    onClick={() => passportFileInputRef.current?.click()}
                  >
                    {hasActiveUpload ? "Заменить паспорт" : "Выбрать паспорт"}
                  </button>
                  <span className={`pi-extraction-status ${passportStatusClass}`}>
                    <span aria-hidden="true" />
                    <strong>{passportStatus.title}</strong>
                    <p>{passportStatus.label}</p>
                  </span>
                </div>

                {passportUploads.length ? (
                  <div className="create-upload-list" aria-label="Загруженные паспорта">
                    {passportUploads.map((upload) => {
                      const visualStatus = passportUploadVisualStatus(upload);
                      const isProcessing = visualStatus === "extracting";
                      const isReady = visualStatus === "ready";

                      return (
                        <motion.div
                          key={upload.id}
                          layout
                          animate={{ opacity: 1, y: 0 }}
                          className="create-upload-file"
                          initial={{ opacity: 0, y: 8 }}
                        >
                          {upload.file?.type.startsWith("image/") ? (
                            <ImageIcon aria-hidden="true" />
                          ) : (
                            <FileText aria-hidden="true" />
                          )}
                          <div>
                            <strong>{upload.fileName}</strong>
                            <span>
                              {formatFileSize(upload.file?.size)} ·{" "}
                              {isProcessing ? "Processing" : isReady ? "Done" : "Waiting"}
                            </span>
                          </div>
                          {isProcessing ? <ScanLine aria-hidden="true" /> : null}
                          {isReady ? <CheckCircle2 aria-hidden="true" /> : null}
                        </motion.div>
                      );
                    })}
                  </div>
                ) : null}
              </article>

              <aside className="create-family-panel" aria-label="Заявитель и семья">
                <div className="create-panel-head">
                  <div>
                    <p className="kicker">Семья</p>
                    <h3>Кто подает документы</h3>
                  </div>
                  <span>{createState.applicants.length} заяв.</span>
                </div>

                <div className="create-mode-tabs" role="tablist" aria-label="Режим панели">
                  <button
                    className={createState.mode === "applicant" ? "is-active" : ""}
                    type="button"
                    role="tab"
                    aria-selected={createState.mode === "applicant"}
                    onClick={() => setCreateMode("applicant")}
                  >
                    Заявитель
                  </button>
                  <button
                    className={createState.mode === "family" ? "is-active" : ""}
                    type="button"
                    role="tab"
                    aria-selected={createState.mode === "family"}
                    onClick={() => setCreateMode("family")}
                  >
                    Семья
                  </button>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  {createState.mode === "applicant" ? (
                    <motion.div
                      key="applicant"
                      animate={{ opacity: 1, y: 0 }}
                      className="create-panel-mode"
                      exit={{ opacity: 0, y: -6 }}
                      initial={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.16, ease: "easeOut" }}
                    >
                      <PassportTargetList
                        activeApplicantIndex={safeActiveApplicantIndex}
                        applicantCount={applicantCount}
                        highlightedApplicantIndex={highlightedApplicantIndex}
                        passportUploads={passportUploads}
                        type="family"
                        onSelect={(index) => {
                          setActiveApplicantIndex(index);
                          setHighlightedApplicantIndex(null);
                        }}
                      />
                      <button
                        className="create-add-applicant"
                        type="button"
                        disabled={applicantCount >= maxFamilyApplicants}
                        onClick={addFamilyMember}
                      >
                        <Plus aria-hidden="true" />
                        Добавить заявителя
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="family"
                      animate={{ opacity: 1, y: 0 }}
                      className="create-panel-mode pi-family-yes-no"
                      exit={{ opacity: 0, y: -6 }}
                      initial={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.16, ease: "easeOut" }}
                    >
                      <div className="create-panel-head">
                        <div>
                          <p className="kicker">Общие ответы</p>
                          <h3>Семейные условия</h3>
                        </div>
                        <span>2 вопроса</span>
                      </div>
                      {firstStepFamilyQuestions.map((question) => (
                        <FamilyYesNoQuestion
                          key={question.answerKey}
                          label={question.label}
                          value={familyAnswers[question.answerKey]}
                          onChecked={(value) =>
                            updateFamilyAnswer(
                              question.answerKey,
                              question.intakeKey,
                              value,
                            )
                          }
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </aside>
            </section>
          ) : null}

          {createStep === "questionnaire-files" ? (
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
                  Поля будут перенесены в анкету как черновик. Агент сможет поправить их
                  в обычном редактировании анкеты.
                </p>
              </article>

              <article className="cf-panel media-requirements">
                <div className="create-panel-head">
                  <div>
                    <p className="kicker">Файлы</p>
                    <h3>Фото и селфи</h3>
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

      <footer className="create-flow-footer">
        {createStep === "passport-family" ? (
          <span>
            Черновик хранится только в текущей browser session.
          </span>
        ) : (
          <span>Создайте черновик, чтобы загрузить фото и селфи в файлах.</span>
        )}
        <div>
          {createStep === "questionnaire-files" ? (
            <button
              className="create-secondary-action"
              type="button"
              onClick={() => setCreateStep("passport-family")}
            >
              Назад
            </button>
          ) : null}
          <button
            className="create-secondary-action"
            type="button"
            disabled={draftState === "saving"}
            onClick={handleSaveDraft}
          >
            {draftState === "saving" ? "Сохраняем" : "Сохранить черновик"}
          </button>
          <button
            className="create-primary-action"
            type="button"
            disabled={!createState.canGoNext}
            onClick={handlePrimaryAction}
          >
            {createStep === "passport-family" ? "Дальше" : "Создать и открыть"}
          </button>
        </div>
      </footer>
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

function PassportTargetList({
  activeApplicantIndex,
  applicantCount,
  highlightedApplicantIndex,
  passportUploads,
  type,
  onSelect,
}: {
  activeApplicantIndex: number;
  applicantCount: number;
  highlightedApplicantIndex: number | null;
  passportUploads: PassportUploadDraft[];
  type: Submission["type"];
  onSelect: (index: number) => void;
}) {
  return (
    <div className="pi-passport-targets" aria-label="Кому загружается паспорт">
      <p className="kicker">Паспорта</p>
      <div>
        {Array.from({ length: applicantCount }, (_, index) => {
          const upload = passportUploads.find(
            (candidate) => candidate.applicantIndex === index,
          );
          const status = passportUploadVisualStatus(upload);
          const isActive = index === activeApplicantIndex;
          const isHighlighted = index === highlightedApplicantIndex;

          return (
            <button
              key={index}
              className={[
                "pi-passport-target",
                `is-${status}`,
                isActive ? "is-active" : "",
                isHighlighted ? "is-highlighted" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(index)}
            >
              <span>
                <strong>{applicantLabel(index, type)}</strong>
                <em>{passportUploadStatusText(upload)}</em>
              </span>
              <i aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FamilyYesNoQuestion({
  label,
  onChecked,
  value,
}: {
  label: string;
  onChecked: (checked: boolean) => void;
  value?: boolean;
}) {
  return (
    <div className="fyn-question">
      <span>{label}</span>
      <div role="group" aria-label={label}>
        <button
          className={value === true ? "is-active" : ""}
          type="button"
          aria-pressed={value === true}
          onClick={() => onChecked(true)}
        >
          Да
        </button>
        <button
          className={value === false ? "is-active" : ""}
          type="button"
          aria-pressed={value === false}
          onClick={() => onChecked(false)}
        >
          Нет
        </button>
      </div>
    </div>
  );
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
