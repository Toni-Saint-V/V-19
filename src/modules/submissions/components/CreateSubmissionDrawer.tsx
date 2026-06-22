import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  City,
  PassportUploadDraft,
  PreliminaryIntakeDraft,
  Submission,
} from "../types";
import { CANONICAL_CITIES, isCity } from "../types";

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

const extractedFieldLabels = [
  "Фамилия",
  "Имя",
  "Дата рождения",
  "Номер паспорта",
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

export function CreateSubmissionDrawer({
  applicantNames = [],
  city,
  dirty,
  familyCount,
  focusCloseToken = 0,
  onApplicantName,
  onCity,
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
  const [passportUploads, setPassportUploads] = useState<PassportUploadDraft[]>([]);
  const [createStep, setCreateStep] = useState<CreateSubmissionStep>("passport");
  const [preliminaryIntake, setPreliminaryIntake] = useState<PreliminaryIntakeDraft>(
    emptyPreliminaryIntakeDraft,
  );
  const sharedAnswerCount = [
    preliminaryIntake.sameHomeAddress,
    preliminaryIntake.sameTripDates,
    preliminaryIntake.sameSpainStay,
    preliminaryIntake.sameArrivalPlace,
  ].filter(Boolean).length;
  const firstStepFamilyAnswerCount = [
    preliminaryIntake.sameHomeAddress,
    preliminaryIntake.sameSpainStay,
  ].filter(Boolean).length;
  const passportReady = passportUploads.length > 0;
  const extractionStatusLabel = passportReady
    ? passportUploads.length === 1
      ? "Успешно извлекли данные паспорта"
      : `Успешно извлекли данные: ${passportUploads.length} паспортов`
    : "Паспорт нужен для автозаполнения анкеты";
  function selectType(nextType: Submission["type"]) {
    onType(nextType);
  }

  function handleCityChange(value: string) {
    if (isCity(value)) onCity(value);
  }

  function updatePreliminaryIntake<Key extends keyof PreliminaryIntakeDraft>(
    key: Key,
    value: PreliminaryIntakeDraft[Key],
  ) {
    setPreliminaryIntake((current) => ({ ...current, [key]: value }));
  }

  function addPassportFiles(files: FileList | null) {
    if (!files?.length) return;

    const nextUploads = Array.from(files)
      .slice(0, maxFamilyApplicants)
      .map((file, index) => ({
        applicantIndex: Math.min(index, applicantCount - 1),
        extractedFields: [],
        file,
        fileName: file.name,
        id: `passport-${Date.now()}-${index}`,
        status: "selected" as const,
      }));
    setPassportUploads((current) =>
      [...current, ...nextUploads].slice(0, maxFamilyApplicants),
    );
    onPassportFilesSelected();
  }

  function addFamilyMember() {
    if (type !== "family") {
      onType("family");
      onFamilyCount(Math.max(2, familyCount));
      return;
    }

    onFamilyCount(Math.min(maxFamilyApplicants, applicantCount + 1));
  }

  function handlePrimaryAction() {
    if (createStep === "passport") {
      setCreateStep("questionnaire");
      return;
    }

    onCreate(passportUploads, preliminaryIntake);
  }

  useEffect(() => {
    if (!focusCloseToken) return;
    closeButtonRef.current?.focus({ preventScroll: true });
  }, [focusCloseToken]);

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
            {createStep === "passport"
              ? "Паспорт и семейные автоподстановки"
              : "Анкета, фото и селфи"}{" "}
            · {type === "family" ? "Семья" : "Один заявитель"} · {city}
          </p>
        </div>
        <ol className="cf-steps" aria-label="Шаги создания подачи">
          {createSteps.map((step) => (
            <li key={step.id} className={createStep === step.id ? "is-active" : ""}>
              <button
                type="button"
                aria-label={step.ariaLabel}
                disabled={step.id === "questionnaire" && !passportReady}
                onClick={() => setCreateStep(step.id)}
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
          className={`pi-board ${
            createStep === "passport" ? "is-passport-step" : ""
          }`}
          aria-label="Предварительная заявка"
        >
          {createStep === "passport" ? (
            <section
              className={`pi-scan-section ${passportReady ? "has-passport" : ""}`}
              aria-labelledby="passport-intake-title"
            >
              <div className="pi-create-view-panel">
                <section
                  className="cf-panel cf-intake-panel"
                  aria-label="Создание подачи"
                >
                  <div className="pi-two-columns">
                    <label>
                      <span>Страна</span>
                      <input readOnly value="Испания" />
                    </label>
                    <label>
                      <span>Город подачи</span>
                      <select
                        aria-label="Город подачи"
                        value={city}
                        onChange={(event) => handleCityChange(event.target.value)}
                      >
                        {CANONICAL_CITIES.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>
                <div className="pi-scan-toolbar" aria-label="Заявители в подаче">
                  <div className="pi-mode-tags" aria-label="Тип подачи">
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
                  </div>
                  <div className="pi-scan-toolbar-actions">
                    <button
                      className="icon-button pi-add-person-button"
                      type="button"
                      aria-label="Добавить заявителя в семью"
                      disabled={
                        type === "family" && applicantCount >= maxFamilyApplicants
                      }
                      onClick={addFamilyMember}
                    >
                      +
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={
                        type === "family" && applicantCount >= maxFamilyApplicants
                      }
                      onClick={addFamilyMember}
                    >
                      Добавить человека
                    </button>
                  </div>
                </div>
                <div className="create-people-list" aria-label="Имена заявителей">
                  {Array.from({ length: applicantCount }, (_, index) => (
                    <label key={index}>
                      <span>{applicantInputLabel(index, type)}</span>
                      <input
                        aria-label={applicantInputLabel(index, type)}
                        value={applicantNames[index] ?? ""}
                        placeholder={applicantInputPlaceholder(index, type)}
                        onChange={(event) =>
                          onApplicantName?.(index, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
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
                    <g className="pi-visual-stack">
                      <path d="M58 100 L118 88 Q129 86 132 96 L133 104 Q135 114 124 117 L65 129 Q55 131 53 120 L52 112 Q50 103 58 100Z" />
                      <path d="M57 78 L123 66 Q133 64 135 75 L136 83 Q138 93 127 96 L62 108 Q52 110 50 99 L49 91 Q47 81 57 78Z" />
                    </g>
                    <path
                      className="pi-visual-page"
                      d="M54 35 L120 23 Q132 21 135 33 L137 65 Q139 77 127 80 L59 93 Q47 95 45 83 L43 52 Q41 38 54 35Z"
                    />
                    <path
                      className="pi-visual-page-edge"
                      d="M47 76 Q69 69 94 66 Q119 63 137 68"
                    />
                    <path
                      className="pi-visual-passport-line"
                      d="M63 49 L113 40"
                    />
                    <path className="pi-visual-scan" d="M35 72 H146" />
                  </svg>
                </div>
                <p className="kicker">Паспортная точка входа</p>
                <h3 id="passport-intake-title">Сначала скан паспорта</h3>
                <p>
                  Поля из паспорта подставятся в черновик анкеты автоматически.
                  Исправить их можно позже.
                </p>
                <input
                  ref={passportFileInputRef}
                  className="pi-file-input"
                  aria-hidden="true"
                  accept="image/jpeg,image/png,application/pdf"
                  multiple={type === "family"}
                  name="preintakePassportScans"
                  tabIndex={-1}
                  type="file"
                  onChange={(event) => {
                    addPassportFiles(event.currentTarget.files);
                    event.currentTarget.value = "";
                  }}
                />
                <div className="pi-empty-actions">
                  <button
                    className="primary-button pi-upload-button"
                    type="button"
                    onClick={() => passportFileInputRef.current?.click()}
                  >
                    {passportReady ? "Заменить паспорт" : "Загрузить паспорт"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={!passportReady}
                    onClick={handlePrimaryAction}
                  >
                    Дальше
                  </button>
                </div>
              </div>

              <div
                className={`pi-extraction-status ${
                  passportReady ? "is-success" : "is-idle"
                }`}
                aria-live="polite"
              >
                <span aria-hidden="true" />
                <strong>{passportReady ? "Готово" : "Ожидает файл"}</strong>
                <p>{extractionStatusLabel}</p>
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

          {createStep === "passport" && type === "family" && passportReady ? (
            <section
              className="pi-shared-panel"
              aria-labelledby="pi-shared-title"
            >
              <div className="create-panel-head">
                <div>
                  <p className="kicker">Семейные совпадения</p>
                  <h3 id="pi-shared-title">Что можно подставить всем</h3>
                </div>
                <span>
                  {sharedAnswerCount ? `${sharedAnswerCount}/4` : "Не выбрано"}
                </span>
              </div>
              <div className="pi-family-count" aria-label="Размер семьи">
                <div>
                  <p className="kicker">Заявители</p>
                  <strong>{applicantCount} человек</strong>
                </div>
                <div>
                  <button
                    className="ghost-button"
                    type="button"
                    aria-label="Уменьшить количество заявителей"
                    disabled={applicantCount <= 2}
                    onClick={() => onFamilyCount(applicantCount - 1)}
                  >
                    −
                  </button>
                  <span>{applicantCount}</span>
                  <button
                    className="ghost-button"
                    type="button"
                    aria-label="Увеличить количество заявителей"
                    disabled={applicantCount >= maxFamilyApplicants}
                    onClick={() => onFamilyCount(applicantCount + 1)}
                  >
                    +
                  </button>
                </div>
              </div>

              <PreintakeCheckCard
                checked={preliminaryIntake.sameHomeAddress}
                label="Один адрес проживания"
                name="preintakeSameHomeAddress"
                onChecked={(checked) =>
                  updatePreliminaryIntake("sameHomeAddress", checked)
                }
              >
                <label>
                  <span>Адрес проживания</span>
                  <input
                    name="preintakeHomeAddress"
                    value={preliminaryIntake.homeAddress}
                    placeholder="AKADEMIKA KOROLEVA STREET 4 1 149"
                    onChange={(event) =>
                      updatePreliminaryIntake("homeAddress", event.target.value)
                    }
                  />
                </label>
              </PreintakeCheckCard>

              <PreintakeCheckCard
                checked={preliminaryIntake.sameTripDates}
                label="Одинаковые даты поездки"
                name="preintakeSameTripDates"
                onChecked={(checked) =>
                  updatePreliminaryIntake("sameTripDates", checked)
                }
              >
                <div className="pi-two-columns">
                  <label>
                    <span>Въезд</span>
                    <input
                      name="preintakeTripDateFrom"
                      value={preliminaryIntake.tripDateFrom}
                      placeholder="19.08.2026"
                      onChange={(event) =>
                        updatePreliminaryIntake("tripDateFrom", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>Выезд</span>
                    <input
                      name="preintakeTripDateTo"
                      value={preliminaryIntake.tripDateTo}
                      placeholder="27.08.2026"
                      onChange={(event) =>
                        updatePreliminaryIntake("tripDateTo", event.target.value)
                      }
                    />
                  </label>
                </div>
              </PreintakeCheckCard>

              <PreintakeCheckCard
                checked={preliminaryIntake.sameSpainStay}
                label="Одно проживание в Испании"
                name="preintakeSameSpainStay"
                onChecked={(checked) =>
                  updatePreliminaryIntake("sameSpainStay", checked)
                }
              >
                <div className="pi-three-columns">
                  <label>
                    <span>Название</span>
                    <input
                      name="preintakeSpainStayName"
                      value={preliminaryIntake.spainStayName}
                      placeholder="HOTEL ILUNION BARCELONA"
                      onChange={(event) =>
                        updatePreliminaryIntake("spainStayName", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>Город</span>
                    <input
                      name="preintakeSpainStayCity"
                      value={preliminaryIntake.spainStayCity}
                      placeholder="BARCELONA"
                      onChange={(event) =>
                        updatePreliminaryIntake("spainStayCity", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>Адрес</span>
                    <input
                      name="preintakeSpainStayAddress"
                      value={preliminaryIntake.spainStayAddress}
                      placeholder="CALLE RAMON TUR 196-198"
                      onChange={(event) =>
                        updatePreliminaryIntake("spainStayAddress", event.target.value)
                      }
                    />
                  </label>
                </div>
              </PreintakeCheckCard>

              <PreintakeCheckCard
                checked={preliminaryIntake.sameArrivalPlace}
                label="Одно место прибытия"
                name="preintakeSameArrivalPlace"
                onChecked={(checked) =>
                  updatePreliminaryIntake("sameArrivalPlace", checked)
                }
              >
                <label>
                  <span>Маршрут / место прибытия</span>
                  <input
                    name="preintakeArrivalPlace"
                    value={preliminaryIntake.arrivalPlace}
                    placeholder="Москва, Барселона, Москва"
                    onChange={(event) =>
                      updatePreliminaryIntake("arrivalPlace", event.target.value)
                    }
                  />
                </label>
              </PreintakeCheckCard>
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
                  {extractedFieldLabels.map((label) => (
                    <label key={label}>
                      <span>{label}</span>
                      <input
                        readOnly
                        value={
                          passportUploads.length
                            ? "Заполнится после обработки"
                            : "Сначала загрузите паспорт"
                        }
                      />
                    </label>
                  ))}
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

function PreintakeCheckCard({
  checked,
  children,
  label,
  name,
  onChecked,
}: {
  checked: boolean;
  children: ReactNode;
  label: string;
  name: string;
  onChecked: (checked: boolean) => void;
}) {
  return (
    <article className={`pi-check-card ${checked ? "is-active" : ""}`}>
      <label className="pi-check-row">
        <input
          checked={checked}
          name={name}
          type="checkbox"
          onChange={(event) => onChecked(event.target.checked)}
        />
        <span>{label}</span>
      </label>
      {checked ? <div className="pi-check-fields">{children}</div> : null}
    </article>
  );
}

function applicantLabel(index: number, type: Submission["type"]) {
  if (type === "single") return "Заявитель";
  if (index === 0) return "Основной заявитель";
  return `Заявитель ${index + 1}`;
}

function applicantInputLabel(index: number, type: Submission["type"]) {
  if (type === "single") return "Заявитель";
  if (index === 0) return "Основной заявитель";
  if (index === 1) return "Супруг";
  return `Ребенок ${index - 1}`;
}

function applicantInputPlaceholder(index: number, type: Submission["type"]) {
  if (type === "single") return "ФИО заявителя";
  if (index === 0) return "ФИО основного заявителя";
  if (index === 1) return "ФИО супруга";
  return "ФИО ребенка";
}
