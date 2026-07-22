// src/components/review/ReviewReadinessPanel.tsx
import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  ScanSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import type {
  PassportReviewInsightModel,
  PassportReviewInsightTone,
} from "../../modules/submissions/passportReviewInsights";

type ReviewReadinessPanelProps = {
  filledFieldCount: number;
  mediaReadyCount: number;
  mediaTotal: number;
  mediaVisitedCount: number;
  model: PassportReviewInsightModel;
  onNextStep: () => void;
  onToggleQuestionnaire: () => void;
  openIssueCount: number;
  questionnaireOpen: boolean;
  totalFieldCount: number;
};

const toneIcons: Record<
  PassportReviewInsightTone,
  typeof CheckCircle2
> = {
  danger: AlertCircle,
  info: ScanSearch,
  success: CheckCircle2,
  warning: Eye,
};

export function ReviewReadinessPanel({
  filledFieldCount,
  mediaReadyCount,
  mediaTotal,
  mediaVisitedCount,
  model,
  onNextStep,
  onToggleQuestionnaire,
  openIssueCount,
  questionnaireOpen,
  totalFieldCount,
}: ReviewReadinessPanelProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      aria-label="Готовность паспортной проверки"
      className={`v19-review-readiness is-${model.mode}`}
    >
      <div className="v19-review-readiness-primary">
        <div
          aria-label={`Готовность ${model.score}%`}
          className="v19-review-score"
          role="img"
          style={{ "--v19-review-score": `${model.score}%` } as CSSProperties}
        >
          <span>{model.score}</span>
          <small>%</small>
        </div>

        <div className="v19-review-readiness-copy">
          <span className="v19-review-ai-label">
            <motion.span
              animate={
                prefersReducedMotion
                  ? undefined
                  : { rotate: [0, 8, -6, 0], scale: [1, 1.08, 1] }
              }
              transition={{
                duration: 2.6,
                ease: "easeInOut",
                repeat: Number.POSITIVE_INFINITY,
                repeatDelay: 1.8,
              }}
            >
              <Sparkles aria-hidden="true" />
            </motion.span>
            AI-подсказка
          </span>
          <h2>{model.headline}</h2>
          <p>{model.summary}</p>
          <button
            className="v19-review-next-step"
            onClick={onNextStep}
            type="button"
          >
            <span>{model.recommendation}</span>
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>

      <div aria-label="Состояние проверки" className="v19-review-status-strip" role="status">
        <span className={filledFieldCount < totalFieldCount ? "has-warning" : undefined}>
          <CheckCircle2 aria-hidden="true" />
          Поля{" "}
          <strong>
            {filledFieldCount}/{totalFieldCount}
          </strong>
        </span>
        <span className={openIssueCount ? "has-warning" : undefined}>
          <AlertCircle aria-hidden="true" />
          Замечания <strong>{openIssueCount}</strong>
        </span>
        <span className={mediaReadyCount < mediaTotal ? "has-warning" : undefined}>
          <ShieldCheck aria-hidden="true" />
          Оригиналы{" "}
          <strong>
            {mediaReadyCount}/{mediaTotal}
          </strong>
        </span>
        <span className={mediaVisitedCount < mediaTotal ? "has-warning" : undefined}>
          <Eye aria-hidden="true" />
          Просмотрено{" "}
          <strong>
            {mediaVisitedCount}/{mediaTotal}
          </strong>
        </span>
      </div>

      <div className="v19-review-insights">
        {model.insights.slice(0, 3).map((insight) => {
          const Icon = toneIcons[insight.tone];
          return (
            <div className={`is-${insight.tone}`} key={insight.id}>
              <Icon aria-hidden="true" />
              <span>
                <strong>{insight.title}</strong>
                <small>{insight.message}</small>
              </span>
            </div>
          );
        })}
      </div>

      <div className="v19-review-questionnaire-entry">
        <span>
          <FileSpreadsheet aria-hidden="true" />
          <span>
            <strong>Анкета для Excel</strong>
            <small>Не влияет на положительное решение по паспорту.</small>
          </span>
        </span>
        <button
          aria-controls="v19-review-questionnaire-peek"
          aria-expanded={questionnaireOpen}
          aria-keyshortcuts="Q"
          onClick={onToggleQuestionnaire}
          title="Горячая клавиша: Q"
          type="button"
        >
          <span>{questionnaireOpen ? "Скрыть" : "Посмотреть"}</span>
          <kbd aria-hidden="true">Q</kbd>
        </button>
      </div>
    </section>
  );
}
