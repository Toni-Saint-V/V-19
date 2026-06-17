import { useEffect, useMemo, useState } from "react";
import { questionnaireSectionPreviews } from "../questionnaire";
import type { City, PassportUploadDraft, Submission } from "../types";

const maxFamilyApplicants = 6;
const questionnaireSections = questionnaireSectionPreviews();
const createSteps = [
  "Паспорта",
  "Заявители",
  "Запись",
  "Личные данные",
  "Паспортные данные",
  "Адрес и контакты",
  "Работа / образование",
  "Поездка",
  "Принимающая сторона",
  "Оплата",
  "Медиа",
  "Проверка",
];

export function CreateSubmissionDrawer({
  applicantNames,
  city,
  dirty,
  familyCount,
  onApplicantName,
  onCity,
  onClose,
  onCreate,
  onCreatePreset,
  onFamilyCount,
  onPassportFilesSelected,
  onType,
  type,
}: {
  applicantNames: string[];
  city: City;
  dirty: boolean;
  familyCount: number;
  onApplicantName: (index: number, name: string) => void;
  onCity: (city: City) => void;
  onClose: () => void;
  onCreate: () => void;
  onCreatePreset: (input: {
    applicantNames: string[];
    familyCount: number;
    type: Submission["type"];
  }) => void;
  onFamilyCount: (count: number) => void;
  onPassportFilesSelected: () => void;
  onType: (type: Submission["type"]) => void;
  type: Submission["type"];
}) {
  const applicantCount = type === "family" ? familyCount : 1;
  const [activeApplicantIndex, setActiveApplicantIndex] = useState(0);
  const [activeSectionId, setActiveSectionId] =
    useState<(typeof questionnaireSections)[number]["id"]>("appointment");
  const [copyPromptIndex, setCopyPromptIndex] = useState<number | null>(null);
  const [passportUploads, setPassportUploads] = useState<PassportUploadDraft[]>([]);
  const activeApplicantName =
    applicantNames[activeApplicantIndex] ||
    defaultApplicantName(activeApplicantIndex, type);
  const primaryFamilyName = useMemo(
    () => familyNameFromFullName(applicantNames[0]),
    [applicantNames],
  );

  useEffect(() => {
    setActiveApplicantIndex((current) => Math.min(current, applicantCount - 1));
  }, [applicantCount]);

  function selectType(nextType: Submission["type"]) {
    onType(nextType);
    setActiveApplicantIndex(0);
    setActiveSectionId("appointment");
    setCopyPromptIndex(null);
  }

  function addFamilyApplicant() {
    const currentCount = type === "family" ? familyCount : 1;
    const nextCount = Math.min(maxFamilyApplicants, Math.max(2, currentCount + 1));
    const nextIndex = nextCount - 1;

    if (type !== "family") onType("family");
    onFamilyCount(nextCount);
    setActiveApplicantIndex(nextIndex);
    setActiveSectionId("personal");
    setCopyPromptIndex(nextIndex);

    if (primaryFamilyName) {
      onApplicantName(nextIndex, `${primaryFamilyName} `);
    }
  }

  function removeLastFamilyApplicant() {
    if (type !== "family" || applicantCount <= 2) return;
    const nextCount = applicantCount - 1;
    onFamilyCount(nextCount);
    setActiveApplicantIndex((current) => Math.min(current, nextCount - 1));
    setCopyPromptIndex((current) =>
      current !== null && current >= nextCount ? null : current,
    );
  }

  function addPassportFiles(files: FileList | null) {
    if (!files?.length) return;

    const nextUploads = Array.from(files)
      .slice(0, maxFamilyApplicants)
      .map((file, index) => ({
        applicantIndex: Math.min(index, applicantCount - 1),
        extractedFields: [],
        fileName: file.name,
        id: `passport-${Date.now()}-${index}`,
        status: "selected" as const,
      }));
    setPassportUploads((current) =>
      [...current, ...nextUploads].slice(0, maxFamilyApplicants),
    );
    onPassportFilesSelected();
  }

  function createSingleApplicantDraft() {
    onCreatePreset({
      applicantNames: ["Иванов Иван"],
      familyCount: 1,
      type: "single",
    });
  }

  function createFamilyDraft() {
    onCreatePreset({
      applicantNames: ["Иванова Мария", "Иванов Антон", "Иванова София", "Иванов Марк"],
      familyCount: 4,
      type: "family",
    });
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
          <p className="kicker">Черновик</p>
          <h2 id="create-title">Новая подача</h2>
          <p>
            {type === "family" ? "Семейная заявка" : "Один заявитель"} · Испания ·{" "}
            {city}
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
        <section className="create-workspace" aria-label="Создание подачи">
          <aside className="create-stepper" aria-label="Шаги создания">
            <div>
              <p className="kicker">Создание заявки</p>
              <strong>
                {passportUploads.length ? "Паспорта выбраны" : "Начните с паспортов"}
              </strong>
            </div>
            {createSteps.map((step, index) => (
              <button
                className={index === 0 ? "is-active" : ""}
                key={step}
                type="button"
                onClick={() => {
                  if (index === 0) return;
                  if (index === 1) setActiveSectionId("personal");
                }}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{step}</strong>
                <em>{index === 0 ? `${passportUploads.length}` : ""}</em>
              </button>
            ))}
          </aside>
          <div className="create-main">
            <section
              className="passport-intake"
              aria-labelledby="passport-intake-title"
            >
              <div>
                <p className="kicker">Шаг 1 · Паспорта</p>
                <h3 id="passport-intake-title">Загрузите загранпаспорт</h3>
                <p>
                  Документ станет входной точкой заявки. Распознанные поля всегда
                  требуют ручной проверки оператором.
                </p>
              </div>
              <div className="create-autostart-grid" aria-label="Быстрое создание">
                <article>
                  <div>
                    <p className="kicker">Один заявитель</p>
                    <h4>Создать заявку самому</h4>
                    <span>Иванов Иван · Москва · черновик с 4 медиа-слотами</span>
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={createSingleApplicantDraft}
                  >
                    Создать заявителя
                  </button>
                </article>
                <article>
                  <div>
                    <p className="kicker">Семья / группа</p>
                    <h4>Создать семейную заявку</h4>
                    <span>Ивановы · 4 заявителя · паспортная точка входа</span>
                  </div>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={createFamilyDraft}
                  >
                    Создать семью
                  </button>
                </article>
              </div>
              <label className="passport-dropzone">
                <input
                  accept="image/jpeg,image/png,application/pdf"
                  multiple={type === "family"}
                  type="file"
                  onChange={(event) => {
                    addPassportFiles(event.currentTarget.files);
                    event.currentTarget.value = "";
                  }}
                />
                <span>Перетащите или выберите скан / фото паспорта</span>
                <em>
                  Для семьи можно загрузить паспорта всех заявителей. Реальное
                  распознавание выполняется только через серверный contract.
                </em>
              </label>
              <div className="passport-upload-list" aria-label="Загруженные паспорта">
                {passportUploads.length ? (
                  passportUploads.map((upload, index) => (
                    <article key={upload.id}>
                      <div>
                        <strong>
                          {applicantNames[upload.applicantIndex] ||
                            defaultApplicantName(upload.applicantIndex, type)}
                        </strong>
                        <p>{upload.fileName}</p>
                      </div>
                      <span>
                        {upload.status === "ready"
                          ? "Заполнено автоматически · требуется проверка"
                          : "Выбрано локально · загрузите после сохранения"}
                      </span>
                      {index === 0 ? <em>Основной заявитель</em> : null}
                    </article>
                  ))
                ) : (
                  <p className="create-section-note">Выбрано: 0 паспортов</p>
                )}
              </div>
            </section>
            <section className="create-flow" aria-label="Параметры и заявители">
              <div className="create-flow-row">
                <label>
                  <span>Страна</span>
                  <input readOnly value="Испания" />
                </label>
                <label>
                  <span>Город подачи</span>
                  <select
                    value={city}
                    onChange={(event) => onCity(event.target.value as City)}
                  >
                    <option>Москва</option>
                    <option>Санкт-Петербург</option>
                    <option>Казань</option>
                  </select>
                </label>
                <div className="segmented create-type-toggle" aria-label="Тип подачи">
                  <button
                    className={type === "single" ? "is-active" : ""}
                    type="button"
                    onClick={() => selectType("single")}
                  >
                    Один человек
                  </button>
                  <button
                    className={type === "family" ? "is-active" : ""}
                    type="button"
                    onClick={() => selectType("family")}
                  >
                    Семья
                  </button>
                </div>
              </div>

              <div className="create-family-workspace">
                <section
                  className="create-people-panel"
                  aria-labelledby="create-people-title"
                >
                  <div className="create-panel-head">
                    <div>
                      <p className="kicker">Заявители</p>
                      <h3 id="create-people-title">
                        {type === "family"
                          ? `Заявители ${applicantCount}/6`
                          : "Заявитель"}
                      </h3>
                    </div>
                    <div className="create-people-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={
                          type === "family" && applicantCount >= maxFamilyApplicants
                        }
                        onClick={addFamilyApplicant}
                      >
                        Добавить человека
                      </button>
                      {type === "family" ? (
                        <button
                          className="ghost-button"
                          type="button"
                          disabled={applicantCount <= 2}
                          onClick={removeLastFamilyApplicant}
                        >
                          Убрать последнего
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="create-people-list" aria-label="Заявители в подаче">
                    {Array.from({ length: applicantCount }, (_, index) => {
                      const selected = activeApplicantIndex === index;

                      return (
                        <button
                          className={selected ? "is-active" : ""}
                          key={index}
                          type="button"
                          aria-current={selected ? "true" : undefined}
                          onClick={() => {
                            setActiveApplicantIndex(index);
                            setCopyPromptIndex(null);
                          }}
                        >
                          <span>{applicantRoleLabel(index, type)}</span>
                          <strong>
                            {applicantNames[index] || defaultApplicantName(index, type)}
                          </strong>
                          {selected ? <em>Открыт</em> : null}
                        </button>
                      );
                    })}
                  </div>

                  <label className="create-name-field">
                    <span>{applicantRoleLabel(activeApplicantIndex, type)}</span>
                    <input
                      value={applicantNames[activeApplicantIndex] ?? ""}
                      placeholder={
                        activeApplicantIndex === 0
                          ? "Фамилия Имя"
                          : "Фамилия Имя заявителя"
                      }
                      onChange={(event) =>
                        onApplicantName(activeApplicantIndex, event.target.value)
                      }
                    />
                  </label>

                  {type === "family" && copyPromptIndex === activeApplicantIndex ? (
                    <section
                      className="create-copy-card"
                      aria-label="Подставленная фамилия"
                    >
                      <div>
                        <p className="kicker">Новый человек</p>
                        <h3>
                          {primaryFamilyName ? "Фамилия подставлена" : "Введите имя"}
                        </h3>
                      </div>
                      <p className="create-section-note">
                        {primaryFamilyName
                          ? "Фамилия основного заявителя уже добавлена в поле имени. Измените поле вручную, если она не подходит."
                          : "У основного заявителя пока нет фамилии для подстановки."}
                      </p>
                    </section>
                  ) : null}
                </section>

                <section
                  className="create-sections-panel"
                  aria-labelledby="create-sections-title"
                >
                  <div className="create-panel-head">
                    <div>
                      <p className="kicker">Анкета</p>
                      <h3 id="create-sections-title">6 секций для заявителя</h3>
                    </div>
                    <span>{activeApplicantName}</span>
                  </div>

                  <div className="create-section-list">
                    {questionnaireSections.map((section) => {
                      const expanded = activeSectionId === section.id;

                      return (
                        <article
                          className={`create-section-card ${expanded ? "is-expanded" : ""}`}
                          key={section.id}
                        >
                          <button
                            type="button"
                            aria-expanded={expanded}
                            onClick={() => setActiveSectionId(section.id)}
                          >
                            <span>{section.number}</span>
                            <strong>{section.title}</strong>
                            <em aria-hidden="true">{expanded ? "⌄" : "›"}</em>
                          </button>
                          {expanded ? (
                            <div className="create-section-body">
                              <p>{section.summary}</p>
                              {section.id === "appointment" ? (
                                <dl>
                                  <div>
                                    <dt>Страна</dt>
                                    <dd>Испания</dd>
                                  </div>
                                  <div>
                                    <dt>Город подачи</dt>
                                    <dd>{city}</dd>
                                  </div>
                                </dl>
                              ) : null}
                              {section.id === "personal" ? (
                                <p className="create-section-note">
                                  Имя редактируется слева. Остальные поля откроются в
                                  анкете после сохранения черновика.
                                </p>
                              ) : null}
                              {section.id === "contacts" || section.id === "trip" ? (
                                <p className="create-section-note">
                                  Эти поля заполняются в анкете после сохранения
                                  черновика.
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              </div>
            </section>
          </div>
        </section>
      </div>
      <footer className="drawer-footer">
        <span>
          {passportUploads.length
            ? `Выбрано локально: ${passportUploads.length} паспортов · файлы не сохранятся в черновик автоматически`
            : dirty
              ? "Закрытие потребует подтверждения"
              : "Загрузите паспорт или сохраните черновик вручную"}
        </span>
        <button className="secondary-button" type="button" onClick={onClose}>
          Закрыть
        </button>
        <button className="primary-button" type="button" onClick={onCreate}>
          Сохранить черновик
        </button>
      </footer>
    </div>
  );
}

function applicantRoleLabel(index: number, type: Submission["type"]) {
  if (type === "single") return "Заявитель";
  if (index === 0) return "Основной заявитель";
  if (index === 1) return "Супруг";
  return `Ребенок ${index - 1}`;
}

function defaultApplicantName(index: number, type: Submission["type"]) {
  if (type === "single" || index === 0) return "Новый заявитель";
  if (index === 1) return "Супруг";
  return `Ребенок ${index - 1}`;
}

function familyNameFromFullName(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "Новый заявитель") return "";
  return trimmed.split(/\s+/)[0] ?? "";
}
