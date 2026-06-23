import { useEffect, useRef, useState } from "react";
import { Button } from "../../../shared/ui/primitives";
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

type CreateSubmissionStep = "passport" | "questionnaire";

const createSteps: Array<{
  ariaLabel?: string;
  id: CreateSubmissionStep;
  label: string;
  number: string;
}> = [
  {
    ariaLabel: "Шаг 1: паспорт и семья",
    id: "passport",
    label: "Паспорт и семья",
    number: "1",
  },
  { id: "questionnaire", label: "Анкета и файлы", number: "2" },
];

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

function passportUploadStatusText(upload: PassportUploadDraft | undefined) {
  const fullName = passportUploadFullName(upload);
  if (fullName) return fullName;
  if (!upload) return "Паспорт не загружен";
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
      label: "Паспорт нужен для автозаполнения анкеты",
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

function e2ePassportMockFields(fileName: string): PassportExtractedField[] | null {
  if (!e2ePassportMockEnabled) return null;

  const match = /^e2e-passport-(.+)\.jpe?g$/iu.exec(fileName.trim());
  if (!match?.[1]) return null;

  const [surname = "Новый", ...givenParts] = match[1]
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/);
  const firstName = givenParts.join(" ") || "заявитель";
  const base = Date.now().toString().slice(-6).padStart(6, "0");
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
    ["passportNumber", `900${base}`.slice(0, 9), "high"],
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
  dirty,
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
  const [passportUploads, setPassportUploads] = useState<PassportUploadDraft[]>([]);
  const [passportFileError, setPassportFileError] = useState("");
  const [activeApplicantIndex, setActiveApplicantIndex] = useState(0);
  const [highlightedApplicantIndex, setHighlightedApplicantIndex] = useState<
    number | null
  >(null);
  const [createStep, setCreateStep] = useState<CreateSubmissionStep>("passport");
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
  const firstStepFamilyAnswerCount = [
    preliminaryIntake.sameHomeAddress,
    preliminaryIntake.sameSpainStay,
  ].filter(Boolean).length;
  const passportReady =
    passportUploads.length > 0 &&
    passportUploads.every(isPassportUploadReady);
  const passportStatus = passportUploadsStatus(passportUploads);
  const passportStatusClass = passportStatusClassName(passportStatus.tone);
  const hasActiveUpload = Boolean(activeUpload);
  const activeUploadReady = isPassportUploadReady(activeUpload);
  const uploadButtonLabel = hasActiveUpload
    ? `Заменить паспорт: ${applicantLabel(safeActiveApplicantIndex, type)}`
    : `Загрузить паспорт: ${applicantLabel(safeActiveApplicantIndex, type)}`;
  function selectType(nextType: Submission["type"]) {
    onType(nextType);
    setActiveApplicantIndex(0);
    setHighlightedApplicantIndex(null);
  }

  function updatePreliminaryIntake<Key extends keyof PreliminaryIntakeDraft>(
    key: Key,
    value: PreliminaryIntakeDraft[Key],
  ) {
    setPreliminaryIntake((current) => ({ ...current, [key]: value }));
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

    setCreateStep("questionnaire");
  }

  function handlePrimaryAction() {
    if (createStep === "passport") return openQuestionnaireStep();

    onCreate(passportUploads, preliminaryIntake);
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

  return (
    <div
      className="submission-drawer create-drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="create-title"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
      }}
    >
      <header className="drawer-header drawer-topbar create-drawer-header">
        <div className="drawer-title-block drawer-title-sr">
          <p className="kicker">Предварительный черновик</p>
          <h2 id="create-title">Новая подача</h2>
          <p>
            {createStep === "passport" ? "Загрузка паспорта" : "Анкета, фото и селфи"} ·{" "}
            {type === "family" ? "Семья" : "Один заявитель"}
          </p>
        </div>
        <ol className="cf-steps" aria-label="Шаги создания подачи">
          {createSteps.map((step) => (
            <li key={step.id} className={createStep === step.id ? "is-active" : ""}>
              <button
                type="button"
                aria-label={step.ariaLabel}
                onClick={() => {
                  if (step.id === "questionnaire") {
                    openQuestionnaireStep();
                    return;
                  }

                  setCreateStep(step.id);
                }}
              >
                <span>{step.number}</span>
                <strong>{step.label}</strong>
              </button>
            </li>
          ))}
        </ol>
        <div className="drawer-topbar-actions drawer-header-actions">
          <span className="status-chip amber">
            {dirty ? "Есть изменения" : "Черновик"}
          </span>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            aria-label="Закрыть создание"
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </header>
      <div className="drawer-body create-drawer-body">
        <section
          className={`pi-board ${createStep === "passport" ? "is-passport-step" : ""}`}
          aria-label="Предварительная заявка"
        >
          {createStep === "passport" ? (
            <section
              className={`pi-scan-section ${passportReady ? "has-passport" : ""}`}
              aria-labelledby="passport-intake-title"
            >
              <div className="pi-create-view-panel">
                <div className="pi-scan-toolbar" aria-label="Заявители в подаче">
                  <div
                    className={`pi-mode-tags ${
                      type === "family" ? "has-add-person" : ""
                    }`}
                    aria-label="Тип подачи"
                  >
                    {submissionTypeOptions.map((option) => (
                      <button
                        key={option.value}
                        className={type === option.value ? "is-active" : ""}
                        type="button"
                        onClick={() => selectType(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                    {type === "family" ? (
                      <>
                        <span className="pi-family-count-pill" aria-live="polite">
                          {applicantCount} чел.
                        </span>
                        <Button
                          className="pi-add-person-button"
                          variant="icon"
                          type="button"
                          aria-label={`Добавить заявителя в семью. Сейчас ${applicantCount}`}
                          disabled={applicantCount >= maxFamilyApplicants}
                          title={
                            applicantCount >= maxFamilyApplicants
                              ? "Максимум 6 заявителей"
                              : "Добавить заявителя"
                          }
                          onClick={addFamilyMember}
                        >
                          +
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
                <PassportTargetList
                  activeApplicantIndex={safeActiveApplicantIndex}
                  applicantCount={applicantCount}
                  highlightedApplicantIndex={highlightedApplicantIndex}
                  passportUploads={passportUploads}
                  type={type}
                  onSelect={(index) => {
                    setActiveApplicantIndex(index);
                    setHighlightedApplicantIndex(null);
                  }}
                />
                {type === "family" ? (
                  <section
                    className="pi-family-yes-no"
                    aria-labelledby="pi-family-yes-no-title"
                  >
                    <div className="create-panel-head">
                      <div>
                        <p className="kicker">Семейные данные</p>
                        <h3 id="pi-family-yes-no-title">Общие ответы</h3>
                      </div>
                      <span>
                        {firstStepFamilyAnswerCount
                          ? `${firstStepFamilyAnswerCount}/2`
                          : "Нет"}
                      </span>
                    </div>
                    {firstStepFamilyQuestions.map((question) => (
                      <FamilyYesNoQuestion
                        key={question.key}
                        checked={preliminaryIntake[question.key]}
                        label={question.label}
                        onChecked={(checked) =>
                          updatePreliminaryIntake(question.key, checked)
                        }
                      />
                    ))}
                  </section>
                ) : null}
              </div>

              <div className="pi-scan-main">
                <div className="pi-document-visual" aria-hidden="true">
                  <svg viewBox="0 0 180 150" role="img">
                    <path
                      className="pi-visual-page"
                      d="M52 26 H128 Q140 26 140 38 V112 Q140 124 128 124 H52 Q40 124 40 112 V38 Q40 26 52 26Z"
                    />
                    <path
                      className="pi-visual-page-edge"
                      d="M57 48 H116 M57 62 H102 M57 96 H123"
                    />
                    <path
                      className="pi-visual-chip"
                      d="M58 74 H84 Q90 74 90 80 V96 Q90 102 84 102 H58 Q52 102 52 96 V80 Q52 74 58 74Z"
                    />
                    <path className="pi-visual-scan" d="M35 72 H146" />
                  </svg>
                </div>
                <p className="kicker">Паспортная точка входа</p>
                <h3 id="passport-intake-title">Загрузите паспорт</h3>
                <p>
                  На этом шаге ничего не заполняется вручную. Выберите JPEG или PNG,
                  а черновик анкеты соберется после обработки.
                </p>
                {passportFileError ? (
                  <p className="form-error" role="alert">
                    {passportFileError}
                  </p>
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
                <div className="pi-empty-actions">
                  <Button
                    className={`pi-upload-button ${
                      hasActiveUpload ? "" : "is-attention"
                    }`}
                    variant="primary"
                    type="button"
                    disabled={activeUploadReady}
                    title={
                      activeUploadReady
                        ? "Паспорт уже распознан. Чтобы заменить, создайте новый черновик или выберите другого заявителя."
                        : undefined
                    }
                    onClick={() => passportFileInputRef.current?.click()}
                  >
                    {uploadButtonLabel}
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={handlePrimaryAction}
                  >
                    Дальше
                  </Button>
                </div>
              </div>

              <div
                className={`pi-extraction-status ${passportStatusClass}`}
                aria-live="polite"
              >
                <span aria-hidden="true" />
                <strong>{passportStatus.title}</strong>
                <p>{passportStatus.label}</p>
              </div>

              {passportUploads.length ? (
                <div className="pu-list" aria-label="Загруженные паспорта">
                  <p>{`Выбрано локально: ${passportUploads.length} паспортов`}</p>
                  {passportUploads.map((upload, index) => (
                    <article key={upload.id}>
                      <div>
                        <strong>{applicantLabel(upload.applicantIndex, type)}</strong>
                        <p>{upload.fileName}</p>
                      </div>
                      <span>Выбрано локально · загрузите после сохранения</span>
                      {index === 0 ? <em>Основной</em> : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
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
        </section>
      </div>
      <footer
        className={`drawer-footer create-drawer-footer ${
          createStep === "passport" ? "is-passport-step" : ""
        }`}
      >
        <span>
          {createStep === "passport"
            ? passportUploads.length
              ? `Выбрано паспортов: ${passportUploads.length}`
              : "Сначала загрузите паспорт"
            : "Создайте черновик, чтобы загрузить фото и селфи в файлах"}
        </span>
        <button
          className="secondary-button"
          type="button"
          disabled={!passportReady}
          onClick={() => onCreate(passportUploads, preliminaryIntake)}
        >
          Сохранить черновик
        </button>
        {createStep === "questionnaire" ? (
          <button
            className="primary-button"
            type="button"
            onClick={handlePrimaryAction}
          >
            Создать и открыть
          </button>
        ) : null}
      </footer>
    </div>
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
  checked,
  label,
  onChecked,
}: {
  checked: boolean;
  label: string;
  onChecked: (checked: boolean) => void;
}) {
  return (
    <div className="fyn-question">
      <span>{label}</span>
      <div role="group" aria-label={label}>
        <button
          className={checked ? "is-active" : ""}
          type="button"
          aria-pressed={checked}
          onClick={() => onChecked(true)}
        >
          Да
        </button>
        <button
          className={!checked ? "is-active" : ""}
          type="button"
          aria-pressed={!checked}
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
