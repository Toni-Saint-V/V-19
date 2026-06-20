import { useRef, useState, type ReactNode } from "react";
import type {
  City,
  PassportUploadDraft,
  PreliminaryIntakeDraft,
  Submission,
} from "../types";

const maxFamilyApplicants = 6;

type CreateSubmissionStep = "passport" | "questionnaire";

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
  city,
  dirty,
  familyCount,
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
  const passportReady = passportUploads.length > 0;
  const extractionStatusLabel = passportReady
    ? passportUploads.length === 1
      ? "Успешно извлекли данные паспорта"
      : `Успешно извлекли данные: ${passportUploads.length} паспортов`
    : "Паспорт нужен для автозаполнения анкеты";

  function selectType(nextType: Submission["type"]) {
    onType(nextType);
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
      <header className="drawer-header create-drawer-header">
        <div>
          <p className="kicker">Предварительный черновик</p>
          <h2 id="create-title">Новая подача</h2>
          <p>
            {createStep === "passport"
              ? "Паспорт и семейные автоподстановки"
              : "Анкета, фото и селфи"}{" "}
            · {type === "family" ? "Семья / группа" : "Один заявитель"} · {city}
          </p>
        </div>
        <div className="drawer-header-actions">
          <span className="status-chip amber">
            {dirty ? "Есть изменения" : "Черновик"}
          </span>
          <button
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
        <section className="preintake-board" aria-label="Предварительная заявка">
          <ol className="create-flow-steps" aria-label="Шаги создания подачи">
            <li className={createStep === "passport" ? "is-active" : ""}>
              <button type="button" onClick={() => setCreateStep("passport")}>
                <span>1</span>
                <strong>Паспорт и семья</strong>
              </button>
            </li>
            <li className={createStep === "questionnaire" ? "is-active" : ""}>
              <button
                type="button"
                disabled={!passportReady}
                onClick={() => setCreateStep("questionnaire")}
              >
                <span>2</span>
                <strong>Анкета и файлы</strong>
              </button>
            </li>
          </ol>

          {createStep === "passport" ? (
            <section
              className={`preintake-scan-section ${passportReady ? "has-passport" : ""}`}
              aria-labelledby="passport-intake-title"
            >
              <div className="preintake-scan-toolbar">
                <div className="preintake-mode-tags" aria-label="Тип подачи">
                  <button
                    className={type === "single" ? "is-active" : ""}
                    type="button"
                    onClick={() => selectType("single")}
                  >
                    Заявитель
                  </button>
                  <button
                    className={type === "family" ? "is-active" : ""}
                    type="button"
                    onClick={() => selectType("family")}
                  >
                    Семья
                  </button>
                </div>
                <div className="preintake-scan-toolbar-actions">
                  <button
                    className="icon-button preintake-add-person-button"
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
                    Добавить
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={!passportReady}
                    onClick={handlePrimaryAction}
                  >
                    Дальше
                  </button>
                </div>
              </div>

              <div className="preintake-scan-main">
                <div className="preintake-document-visual" aria-hidden="true">
                  <svg viewBox="0 0 180 150" role="img">
                    <g className="preintake-visual-stack">
                      <path d="M58 100 L118 88 Q129 86 132 96 L133 104 Q135 114 124 117 L65 129 Q55 131 53 120 L52 112 Q50 103 58 100Z" />
                      <path d="M57 78 L123 66 Q133 64 135 75 L136 83 Q138 93 127 96 L62 108 Q52 110 50 99 L49 91 Q47 81 57 78Z" />
                    </g>
                    <path
                      className="preintake-visual-page"
                      d="M54 35 L120 23 Q132 21 135 33 L137 65 Q139 77 127 80 L59 93 Q47 95 45 83 L43 52 Q41 38 54 35Z"
                    />
                    <path
                      className="preintake-visual-page-edge"
                      d="M47 76 Q69 69 94 66 Q119 63 137 68"
                    />
                    <path
                      className="preintake-visual-passport-line"
                      d="M63 49 L113 40"
                    />
                    <path className="preintake-visual-scan" d="M35 72 H146" />
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
                  className="preintake-file-input"
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
                <button
                  className="primary-button preintake-upload-button"
                  type="button"
                  onClick={() => passportFileInputRef.current?.click()}
                >
                  {passportReady ? "Заменить паспорт" : "Загрузить паспорт"}
                </button>
              </div>

              <div
                className={`preintake-extraction-status ${
                  passportReady ? "is-success" : "is-idle"
                }`}
                aria-live="polite"
              >
                <span aria-hidden="true" />
                <strong>{passportReady ? "Готово" : "Ожидает файл"}</strong>
                <p>{extractionStatusLabel}</p>
              </div>

              {passportUploads.length ? (
                <div className="passport-upload-list" aria-label="Загруженные паспорта">
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
              className="preintake-shared-panel"
              aria-labelledby="preintake-shared-title"
            >
              <div className="create-panel-head">
                <div>
                  <p className="kicker">Семейные совпадения</p>
                  <h3 id="preintake-shared-title">Что можно подставить всем</h3>
                </div>
                <span>
                  {sharedAnswerCount ? `${sharedAnswerCount}/4` : "Не выбрано"}
                </span>
              </div>
              <div className="preintake-family-count" aria-label="Размер семьи">
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
                <div className="preintake-two-columns">
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
                <div className="preintake-three-columns">
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
            <section className="create-flow-grid" aria-label="Следующие шаги анкеты">
              <article className="create-flow-panel extraction-review-placeholder">
                <div className="create-panel-head">
                  <div>
                    <p className="kicker">Паспорт</p>
                    <h3>Извлечённые данные паспорта</h3>
                  </div>
                  <span>{passportUploads.length ? "Подставятся" : "Нет файла"}</span>
                </div>
                <div className="extracted-field-preview">
                  {["Фамилия", "Имя", "Дата рождения", "Номер паспорта"].map(
                    (label) => (
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
                    ),
                  )}
                </div>
                <p>
                  Поля будут перенесены в анкету как черновик. Агент сможет поправить их
                  в обычном редактировании анкеты.
                </p>
              </article>

              <article className="create-flow-panel media-requirements">
                <div className="create-panel-head">
                  <div>
                    <p className="kicker">Файлы</p>
                    <h3>Фото и селфи</h3>
                  </div>
                  <span>{applicantCount} заяв.</span>
                </div>
                <div className="media-requirement-list">
                  {[
                    ["Фото на белом фоне", "35x45"],
                    ["Селфи", "для внутренней сверки"],
                    ["Селфи 2", "если требуется консульством"],
                  ].map(([title, meta]) => (
                    <div key={title}>
                      <strong>{title}</strong>
                      <span>{meta}</span>
                    </div>
                  ))}
                </div>
                <button
                  className="secondary-button media-requirement-action"
                  type="button"
                  onClick={handlePrimaryAction}
                >
                  Открыть загрузку
                </button>
              </article>

              <article className="create-flow-panel">
                <div className="create-panel-head">
                  <div>
                    <p className="kicker">Анкета</p>
                    <h3>Разделы questionnaire</h3>
                  </div>
                  <span>Черновик</span>
                </div>
                <div className="questionnaire-section-preview">
                  {[
                    "Личные данные",
                    "Паспорт",
                    "Адрес и контакты",
                    "Работа и занятость",
                    "Маршрут и проживание",
                  ].map((section) => (
                    <div className="questionnaire-section-item" key={section}>
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
    <article className={`preintake-check-card ${checked ? "is-active" : ""}`}>
      <label className="preintake-check-row">
        <input
          checked={checked}
          name={name}
          type="checkbox"
          onChange={(event) => onChecked(event.target.checked)}
        />
        <span>{label}</span>
      </label>
      {checked ? <div className="preintake-check-fields">{children}</div> : null}
    </article>
  );
}

function applicantLabel(index: number, type: Submission["type"]) {
  if (type === "single") return "Заявитель";
  if (index === 0) return "Основной заявитель";
  return `Заявитель ${index + 1}`;
}
