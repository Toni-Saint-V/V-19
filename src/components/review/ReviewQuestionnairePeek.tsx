// src/components/review/ReviewQuestionnairePeek.tsx
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, FileSpreadsheet, Search, X } from "lucide-react";

import type { Applicant } from "../../modules/submissions/types";

type ReviewQuestionnairePeekProps = {
  applicant?: Applicant;
  onClose: () => void;
};

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

export function ReviewQuestionnairePeek({
  applicant,
  onClose,
}: ReviewQuestionnairePeekProps) {
  const prefersReducedMotion = useReducedMotion();
  const [query, setQuery] = useState("");

  useEffect(() => {
    setQuery("");
  }, [applicant?.id]);

  const fields = useMemo(
    () => applicant?.sections.flatMap((section) => section.fields) ?? [],
    [applicant],
  );
  const requiredFields = fields.filter((field) => field.required);
  const filledRequiredFields = requiredFields.filter((field) => field.value.trim());
  const normalizedQuery = normalized(query);
  const visibleSections = useMemo(
    () =>
      (applicant?.sections ?? [])
        .map((section) => ({
          ...section,
          fields: section.fields.filter((field) => {
            if (!normalizedQuery) return true;
            return [field.label, field.value, section.title].some((value) =>
              normalized(value).includes(normalizedQuery),
            );
          }),
        }))
        .filter((section) => section.fields.length > 0),
    [applicant, normalizedQuery],
  );

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      aria-label="Необязательный просмотр анкеты"
      className="v19-review-questionnaire-peek"
      exit={
        prefersReducedMotion
          ? { opacity: 0 }
          : { opacity: 0, y: -8 }
      }
      id="v19-review-questionnaire-peek"
      initial={
        prefersReducedMotion
          ? { opacity: 0 }
          : { opacity: 0, y: 8 }
      }
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.18 }}
    >
      <header>
        <span className="v19-review-questionnaire-icon">
          <FileSpreadsheet aria-hidden="true" />
        </span>
        <div>
          <span>Необязательный просмотр</span>
          <h2>Анкета для Excel</h2>
          <p>
            Не участвует в паспортном решении. Здесь можно только свериться с данными,
            которые попадут в Excel.
          </p>
        </div>
        <button
          aria-label="Закрыть просмотр анкеты"
          className="v19-review-questionnaire-close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="v19-review-questionnaire-summary">
        <span>
          <CheckCircle2 aria-hidden="true" />
          Обязательные поля{" "}
          <strong>
            {filledRequiredFields.length}/{requiredFields.length}
          </strong>
        </span>
        <label>
          <Search aria-hidden="true" />
          <span>Поиск по анкете</span>
          <input
            aria-label="Поиск по анкете"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поле или значение"
            type="search"
            value={query}
          />
        </label>
      </div>

      <div className="v19-review-questionnaire-sections">
        {visibleSections.length > 0 ? (
          visibleSections.map((section, index) => (
            <details key={section.id} open={Boolean(normalizedQuery) || index === 0}>
              <summary>
                <span>{section.title}</span>
                <small>{section.fields.length}</small>
              </summary>
              <dl>
                {section.fields.map((field) => (
                  <div className={field.error ? "has-error" : undefined} key={field.id}>
                    <dt>
                      {field.label}
                      {field.required ? <em>обязательно</em> : null}
                    </dt>
                    <dd>{field.value.trim() || "Не заполнено"}</dd>
                  </div>
                ))}
              </dl>
            </details>
          ))
        ) : (
          <p className="v19-review-questionnaire-empty">
            По этому запросу ничего не найдено.
          </p>
        )}
      </div>
    </motion.section>
  );
}
