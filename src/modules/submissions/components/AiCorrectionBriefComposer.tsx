// src/modules/submissions/components/AiCorrectionBriefComposer.tsx
import {
  Bot,
  Check,
  CheckCircle2,
  CircleAlert,
  Clipboard,
  HelpCircle,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { invokeAiHelperEdgeCached } from "../../../services/aiEdgeClient";
import { adminAiActor, buildAdminCorrectionBriefContext } from "../adminAiAssistance";
import type { AdminAiReviewModel } from "../adminAiReviewModel";
import {
  buildCorrectionBrief,
  correctionBriefClipboardText,
  critiqueCorrectionBriefText,
  hasOpenCorrectionIssues,
  mergeAssistantLead,
  type CorrectionBriefCheck,
  type CorrectionBriefTone,
} from "../correctionBrief";
import type { Submission } from "../types";

type AssistantState =
  | "idle"
  | "loading"
  | "ready"
  | "unavailable"
  | "rejected"
  | "failed";

const toneOptions: Array<{ label: string; value: CorrectionBriefTone }> = [
  { label: "Нейтрально", value: "neutral" },
  { label: "Доброжелательно", value: "warm" },
  { label: "Формально", value: "formal" },
];

export function AiCorrectionBriefComposer({
  localReview,
  submission,
}: {
  localReview: AdminAiReviewModel;
  submission: Submission;
}) {
  const [tone, setTone] = useState<CorrectionBriefTone>("neutral");
  const baseBrief = useMemo(
    () => buildCorrectionBrief(submission, tone),
    [submission, tone],
  );
  const [draft, setDraft] = useState(baseBrief.text);
  const [assistantState, setAssistantState] = useState<AssistantState>("idle");
  const [assistantMessage, setAssistantMessage] = useState("");
  const [assistantIntro, setAssistantIntro] = useState("");
  const [previousIntro, setPreviousIntro] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<string[]>([]);
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const assistantRequestVersionRef = useRef(0);
  const briefRequestKey = [
    baseBrief.signature,
    baseBrief.tone,
    baseBrief.intro,
    localReview.modelVersion,
    localReview.evidenceScore,
    localReview.questions.length,
  ].join("|");
  const activeBriefRequestKeyRef = useRef(briefRequestKey);
  activeBriefRequestKeyRef.current = briefRequestKey;

  useEffect(() => {
    assistantRequestVersionRef.current += 1;
    setDraft(baseBrief.text);
    setAssistantState("idle");
    setAssistantMessage("");
    setAssistantIntro("");
    setPreviousIntro("");
    setCopyState("idle");
    setAnsweredQuestionIds([]);
    setReviewAcknowledged(false);
  }, [baseBrief.text, briefRequestKey]);

  const critique = useMemo(
    () => critiqueCorrectionBriefText(draft, baseBrief),
    [baseBrief, draft],
  );
  const requiredQuestions = critique.questions.filter(
    (question) =>
      question.priority === "required" && !answeredQuestionIds.includes(question.id),
  );
  const warningChecks = critique.checks.filter((check) => check.status !== "pass");
  const canCopy =
    critique.copyReady && requiredQuestions.length === 0 && reviewAcknowledged;
  const copyGateLabel = !critique.copyReady
    ? "Исправьте ошибки критика"
    : requiredQuestions.length
      ? "Ответьте на обязательные вопросы"
      : !reviewAcknowledged
        ? "Подтвердите ручную проверку"
        : "Можно копировать";
  const hasIssues = hasOpenCorrectionIssues(submission);

  if (!hasIssues) return null;

  async function improveIntro() {
    const requestVersion = assistantRequestVersionRef.current + 1;
    assistantRequestVersionRef.current = requestVersion;
    const requestKey = briefRequestKey;
    setAssistantState("loading");
    setAssistantMessage("");
    setCopyState("idle");

    try {
      const result = await invokeAiHelperEdgeCached(
        "correction_draft",
        buildAdminCorrectionBriefContext(submission, localReview),
        adminAiActor,
      );

      if (
        assistantRequestVersionRef.current !== requestVersion ||
        activeBriefRequestKeyRef.current !== requestKey
      ) {
        return;
      }

      if (!result) {
        setAssistantState("unavailable");
        setAssistantMessage(
          "Провайдер не настроен. Локальный точный черновик остаётся доступен.",
        );
        return;
      }

      const merged = mergeAssistantLead(result, baseBrief.intro);
      if (!merged.accepted) {
        setAssistantState("rejected");
        setAssistantMessage(rejectionCopy(merged.reason));
        return;
      }

      setPreviousIntro(firstParagraph(draft) || baseBrief.intro);
      setAssistantIntro(merged.intro);
      setDraft(replaceFirstParagraph(draft, merged.intro));
      setReviewAcknowledged(false);
      setAssistantState("ready");
      setAssistantMessage(
        "Изменено только вступление. Пункты замечаний остались локальными и неизменными.",
      );
    } catch {
      if (
        assistantRequestVersionRef.current !== requestVersion ||
        activeBriefRequestKeyRef.current !== requestKey
      ) {
        return;
      }
      setAssistantState("failed");
      setAssistantMessage(
        "AI-улучшение не прошло безопасную проверку. Используется локальный черновик.",
      );
    }
  }

  function resetDraft() {
    assistantRequestVersionRef.current += 1;
    setDraft(baseBrief.text);
    setAssistantState("idle");
    setAssistantMessage("");
    setAssistantIntro("");
    setPreviousIntro("");
    setCopyState("idle");
    setAnsweredQuestionIds([]);
    setReviewAcknowledged(false);
  }

  async function copyDraft() {
    if (!canCopy) return;
    const copied = await copyToClipboard(
      correctionBriefClipboardText({ ...baseBrief, text: draft }),
    );
    setCopyState(copied ? "copied" : "failed");
  }

  function handleDraftChange(event: ChangeEvent<HTMLTextAreaElement>) {
    assistantRequestVersionRef.current += 1;
    setDraft(event.target.value);
    setAssistantState("idle");
    setAssistantMessage("");
    setAssistantIntro("");
    setPreviousIntro("");
    setCopyState("idle");
    setReviewAcknowledged(false);
  }

  function toggleQuestion(questionId: string) {
    setAnsweredQuestionIds((current) =>
      current.includes(questionId)
        ? current.filter((id) => id !== questionId)
        : [...current, questionId],
    );
  }

  return (
    <section
      className="v19-ai-correction-brief"
      data-testid="ai-correction-brief"
      aria-label="AI-редактор сообщения на доработку"
    >
      <header className="v19-ai-correction-head">
        <div className="v19-ai-correction-brand">
          <span className="v19-ai-correction-brand-icon" aria-hidden="true">
            <WandSparkles />
          </span>
          <div>
            <span>AI-редактор</span>
            <strong>Сообщение на доработку</strong>
            <small>
              Точные пункты собираются локально; модель может изменить только
              вступление.
            </small>
          </div>
        </div>
        <div className="v19-ai-correction-score" aria-label="Качество черновика">
          <span>{critique.qualityScore}</span>
          <small>из 100</small>
        </div>
      </header>

      <div className="v19-ai-correction-metrics" aria-label="Состав сообщения">
        <Metric label="Замечания" value={baseBrief.issueCount} tone="neutral" />
        <Metric
          label="Блокеры"
          value={baseBrief.blockerCount}
          tone={baseBrief.blockerCount ? "danger" : "success"}
        />
        <Metric
          label="Вопросы"
          value={requiredQuestions.length}
          tone={requiredQuestions.length ? "warning" : "success"}
        />
        <Metric
          label="Данные"
          value={`${localReview.evidenceScore}%`}
          tone={localReview.confidence === "low" ? "warning" : "success"}
        />
      </div>

      <div className="v19-ai-correction-toolbar">
        <div className="v19-ai-correction-tone" role="group" aria-label="Тон сообщения">
          {toneOptions.map((option) => (
            <button
              aria-pressed={tone === option.value}
              className={tone === option.value ? "is-active" : ""}
              disabled={assistantState === "loading"}
              key={option.value}
              type="button"
              onClick={() => setTone(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button
          className="v19-ai-correction-enhance"
          disabled={assistantState !== "idle"}
          type="button"
          onClick={() => void improveIntro()}
        >
          {assistantState === "loading" ? (
            <Sparkles className="is-loading" aria-hidden="true" />
          ) : (
            <Bot aria-hidden="true" />
          )}
          {assistantState === "loading"
            ? "Улучшаем"
            : assistantState === "ready"
              ? "Вступление улучшено"
              : assistantState === "rejected"
                ? "Ответ отклонён"
                : assistantState === "unavailable"
                  ? "Локальный режим"
                  : assistantState === "failed"
                    ? "Безопасный fallback"
                    : "Улучшить вступление"}
        </button>
      </div>

      <label className="v19-ai-correction-editor">
        <span>
          Черновик
          <small>{draft.length} символов</small>
        </span>
        <textarea
          data-testid="ai-correction-draft"
          spellCheck="true"
          value={draft}
          onChange={handleDraftChange}
        />
      </label>

      {assistantState !== "idle" ? (
        <div
          className={`v19-ai-correction-provider is-${assistantState}`}
          role="status"
          aria-live="polite"
        >
          {assistantState === "ready" ? (
            <CheckCircle2 aria-hidden="true" />
          ) : assistantState === "loading" ? (
            <Sparkles className="is-loading" aria-hidden="true" />
          ) : (
            <CircleAlert aria-hidden="true" />
          )}
          <span>
            <strong>{assistantStatusLabel(assistantState)}</strong>
            <small>{assistantMessage}</small>
          </span>
        </div>
      ) : null}

      {assistantState === "ready" && assistantIntro ? (
        <details className="v19-ai-correction-diff">
          <summary>Что изменил AI</summary>
          <div>
            <span>
              <small>Было</small>
              {previousIntro}
            </span>
            <span>
              <small>Стало</small>
              {assistantIntro}
            </span>
          </div>
        </details>
      ) : null}

      <div className="v19-ai-correction-review">
        <details defaultOpen={warningChecks.length > 0}>
          <summary>
            <span>
              <ShieldCheck aria-hidden="true" />
              Критик черновика
            </span>
            <em className={critique.copyReady ? "is-pass" : "is-fail"}>
              {critique.copyReady ? "Текст безопасен" : "Нужна правка"}
            </em>
          </summary>
          <div className="v19-ai-correction-checks">
            {critique.checks.map((check) => (
              <QualityCheck check={check} key={check.id} />
            ))}
          </div>
        </details>

        <details defaultOpen={requiredQuestions.length > 0}>
          <summary>
            <span>
              <HelpCircle aria-hidden="true" />
              Правильные вопросы
            </span>
            <em>
              {critique.questions.length
                ? `${requiredQuestions.length} обязательных`
                : "Критичных нет"}
            </em>
          </summary>
          {critique.questions.length ? (
            <div className="v19-ai-correction-questions">
              {critique.questions.map((question) => {
                const answered = answeredQuestionIds.includes(question.id);
                return (
                  <label
                    className={`${answered ? "is-answered" : ""} is-${question.priority}`}
                    key={question.id}
                  >
                    <input
                      checked={answered}
                      type="checkbox"
                      onChange={() => toggleQuestion(question.id)}
                    />
                    <span>
                      <strong>{question.question}</strong>
                      <small>{question.reason}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="v19-ai-correction-clear">
              Критичных вопросов к формулировке не найдено.
            </p>
          )}
        </details>
      </div>

      <footer className="v19-ai-correction-footer">
        <div className="v19-ai-correction-privacy">
          <ShieldCheck aria-hidden="true" />
          <span>
            <strong>Приватность по умолчанию</strong>
            <small>
              В модель уходят только счётчики, роли и коды категорий. Имена, тексты
              замечаний, документы и контакты не отправляются.
            </small>
          </span>
        </div>
        <label className="v19-ai-correction-confirmation">
          <input
            checked={reviewAcknowledged}
            type="checkbox"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setReviewAcknowledged(event.target.checked)
            }
          />
          <span>
            <strong>Проверил текст вручную</strong>
            <small>
              Все пункты точны, обязательные вопросы закрыты, обещаний результата нет.
            </small>
          </span>
        </label>
        <div className="v19-ai-correction-actions">
          <button type="button" onClick={resetDraft}>
            <RefreshCcw aria-hidden="true" />
            Сбросить
          </button>
          <button
            aria-label={`Скопировать сообщение: ${copyGateLabel}`}
            className="is-primary"
            disabled={!canCopy}
            title={copyGateLabel}
            type="button"
            onClick={() => void copyDraft()}
          >
            {copyState === "copied" ? (
              <Check aria-hidden="true" />
            ) : (
              <Clipboard aria-hidden="true" />
            )}
            {copyState === "copied" ? "Скопировано" : "Скопировать"}
          </button>
        </div>
        <p
          className={`v19-ai-correction-gate ${canCopy ? "is-ready" : ""}`}
          role="status"
        >
          {copyGateLabel}
        </p>
      </footer>

      {copyState === "failed" ? (
        <p className="v19-ai-correction-copy-error" role="alert">
          Не удалось скопировать. Выделите текст вручную или разрешите доступ к буферу
          обмена.
        </p>
      ) : null}
    </section>
  );
}

function Metric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "neutral" | "success" | "warning" | "danger";
  value: number | string;
}) {
  return (
    <span className={`v19-ai-correction-metric is-${tone}`}>
      <strong>{value}</strong>
      <small>{label}</small>
    </span>
  );
}

function QualityCheck({ check }: { check: CorrectionBriefCheck }) {
  return (
    <div className={`v19-ai-correction-check is-${check.status}`}>
      {check.status === "pass" ? (
        <CheckCircle2 aria-hidden="true" />
      ) : (
        <CircleAlert aria-hidden="true" />
      )}
      <span>
        <strong>{check.label}</strong>
        <small>{check.detail}</small>
      </span>
    </div>
  );
}

function assistantStatusLabel(state: AssistantState): string {
  if (state === "loading") return "Запрос к AI";
  if (state === "ready") return "Безопасное улучшение принято";
  if (state === "unavailable") return "AI недоступен";
  if (state === "rejected") return "Ответ AI отклонён критиком";
  if (state === "failed") return "Безопасный fallback";
  return "Локальный режим";
}

function rejectionCopy(
  reason: ReturnType<typeof mergeAssistantLead>["reason"],
): string {
  if (reason === "unsafe") {
    return "Ответ содержал обещание результата или срока и не был применён.";
  }
  if (reason === "sensitive") {
    return "Ответ содержал строку, похожую на персональные данные.";
  }
  if (reason === "scope") {
    return "Ответ добавлял неподтверждённые факты или конкретные требования.";
  }
  if (reason === "too_long" || reason === "too_short") {
    return "Ответ не прошёл ограничение по длине вступления.";
  }
  if (reason === "question") {
    return "Вступление не должно перекладывать решение на клиента вопросом.";
  }
  return "Ответ не соответствует безопасному формату вступления.";
}

function firstParagraph(value: string): string {
  return value.split(/\n\s*\n/u)[0]?.trim() ?? "";
}

function replaceFirstParagraph(value: string, intro: string): string {
  const paragraphs = value.split(/\n\s*\n/u);
  if (!paragraphs.length) return intro;
  paragraphs[0] = intro;
  return paragraphs.join("\n\n");
}

async function copyToClipboard(value: string): Promise<boolean> {
  let textarea: HTMLTextAreaElement | null = null;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }

    textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea?.remove();
  }
}
