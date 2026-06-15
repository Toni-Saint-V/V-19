import { type KeyboardEvent, useEffect, useRef } from "react";
import type { City, Submission } from "../types";
import type { CreateStep } from "../uiTypes";
import { EmptyState } from "./Primitives";

const createSteps: Array<{ id: CreateStep; label: string }> = [
  { id: "params", label: "Параметры" },
  { id: "applicants", label: "Заявители" },
  { id: "questionnaire", label: "Анкета" },
  { id: "files", label: "Файлы" },
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
  onFamilyCount,
  onStep,
  onType,
  step,
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
  onFamilyCount: (count: number) => void;
  onStep: (step: CreateStep) => void;
  onType: (type: Submission["type"]) => void;
  step: CreateStep;
  type: Submission["type"];
}) {
  const activeStepButtonRef = useRef<HTMLButtonElement | null>(null);
  const stepButtonsRef = useRef<Partial<Record<CreateStep, HTMLButtonElement | null>>>(
    {},
  );

  useEffect(() => {
    activeStepButtonRef.current?.focus({ preventScroll: true });
  }, []);

  function focusStep(nextStep: CreateStep) {
    onStep(nextStep);
    requestAnimationFrame(() => {
      stepButtonsRef.current[nextStep]?.focus({ preventScroll: true });
    });
  }

  function handleStepKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = createSteps.length - 1;
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = index === lastIndex ? 0 : index + 1;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = index === 0 ? lastIndex : index - 1;
    }

    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = lastIndex;

    if (nextIndex === null) return;

    event.preventDefault();
    focusStep(createSteps[nextIndex].id);
  }

  return (
    <div
      className="submission-drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="create-title"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
      }}
    >
      <header className="drawer-header">
        <div>
          <p className="kicker">Новая подача</p>
          <h2 id="create-title">Создать черновик</h2>
          <p>Испания зафиксирована. Выбирается только город.</p>
        </div>
        <div className="drawer-header-actions">
          <span className="status-chip amber">
            {dirty ? "Есть изменения" : "Чисто"}
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
      <div className="drawer-tabs" role="tablist" aria-label="Шаги создания">
        {createSteps.map((item, index) => {
          const selected = step === item.id;

          return (
            <button
              className={selected ? "is-active" : ""}
              id={`create-step-${item.id}`}
              key={item.id}
              type="button"
              role="tab"
              aria-controls={`create-panel-${item.id}`}
              aria-selected={selected}
              ref={(node) => {
                stepButtonsRef.current[item.id] = node;
                if (selected) activeStepButtonRef.current = node;
              }}
              tabIndex={selected ? 0 : -1}
              onClick={() => focusStep(item.id)}
              onKeyDown={(event) => handleStepKeyDown(event, index)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div
        className="drawer-body"
        id={`create-panel-${step}`}
        role="tabpanel"
        aria-labelledby={`create-step-${step}`}
      >
        <section className="drawer-section">
          {step === "params" ? (
            <>
              <p className="kicker">Параметры</p>
              <div className="form-grid">
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
              </div>
              <div className="segmented wide-segment">
                <button
                  className={type === "single" ? "is-active" : ""}
                  type="button"
                  onClick={() => onType("single")}
                >
                  Один заявитель
                </button>
                <button
                  className={type === "family" ? "is-active" : ""}
                  type="button"
                  onClick={() => onType("family")}
                >
                  Семья
                </button>
              </div>
            </>
          ) : null}
          {step === "applicants" ? (
            <>
              <p className="kicker">Заявители</p>
              <div className="form-grid">
                <label>
                  <span>Количество</span>
                  <input
                    min={type === "family" ? 2 : 1}
                    max={6}
                    type="number"
                    value={type === "family" ? familyCount : 1}
                    disabled={type === "single"}
                    onChange={(event) => onFamilyCount(Number(event.target.value))}
                  />
                </label>
              </div>
              <div className="create-applicant-list" aria-label="Имена заявителей">
                {Array.from(
                  { length: type === "family" ? familyCount : 1 },
                  (_, index) => (
                    <label key={index}>
                      <span>{applicantLabel(index, type)}</span>
                      <input
                        value={applicantNames[index] ?? ""}
                        placeholder={index === 0 ? "Фамилия Имя" : "Имя заявителя"}
                        onChange={(event) => onApplicantName(index, event.target.value)}
                      />
                    </label>
                  ),
                )}
              </div>
            </>
          ) : null}
          {step === "questionnaire" ? (
            <EmptyState text="Анкета будет заполняться по разделам внутри панели." />
          ) : null}
          {step === "files" ? (
            <EmptyState text="Фото, селфи и видео добавляются по каждому заявителю." />
          ) : null}
        </section>
      </div>
      <footer className="drawer-footer">
        <span>
          {dirty ? "Закрытие потребует подтверждения" : "Можно сохранить черновик"}
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

function applicantLabel(index: number, type: Submission["type"]) {
  if (type === "single") return "Заявитель";
  if (index === 0) return "Основной заявитель";
  if (index === 1) return "Супруг";
  return `Ребёнок ${index - 1}`;
}
