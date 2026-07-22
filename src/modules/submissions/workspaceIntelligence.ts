import { buildAdminTriageRadar } from "./adminTriageRadar";
import { buildCaseCopilotBrief, type CaseCopilotStatus } from "./caseCopilot";
import type { Role, Submission } from "./types";

export type WorkspaceIntelligenceTone =
  | "critical"
  | "attention"
  | "clear"
  | "ready"
  | "waiting";

export type WorkspaceIntelligenceMetric = {
  label: string;
  tone: WorkspaceIntelligenceTone;
  value: number;
};

export type WorkspaceIntelligence = {
  headline: string;
  metrics: WorkspaceIntelligenceMetric[];
  plan: string[];
  score: number;
  summary: string;
  tone: WorkspaceIntelligenceTone;
  topReason?: string;
  topSubmissionId?: string;
  topSubmissionTitle?: string;
};

export function buildWorkspaceIntelligence(
  submissions: Submission[],
  role: Role,
): WorkspaceIntelligence {
  const active = submissions.filter((submission) => submission.status !== "exported");
  if (!active.length) {
    return {
      headline: "Рабочая очередь разобрана",
      metrics: [
        { label: "Блокеры", tone: "clear", value: 0 },
        { label: "В работе", tone: "clear", value: 0 },
        { label: "Готово", tone: "ready", value: 0 },
      ],
      plan: ["Проверьте новые поступления или историю завершённых пакетов."],
      score: 100,
      summary: "Активных подач, требующих внимания, сейчас нет.",
      tone: "clear",
    };
  }

  return role === "admin"
    ? buildAdminIntelligence(active)
    : buildAgentIntelligence(active);
}

function buildAgentIntelligence(submissions: Submission[]): WorkspaceIntelligence {
  const ranked = submissions
    .map((submission) => {
      const brief = buildCaseCopilotBrief({
        role: "agent",
        submission,
        surface: "agent",
      });
      const blockers = submission.issues.filter(
        (issue) => issue.status === "open" && issue.severity === "blocker",
      ).length;
      const readiness = Math.round(
        (submission.completeness.questionnaire + submission.completeness.files) / 2,
      );
      return { blockers, brief, readiness, submission };
    })
    .sort(
      (left, right) =>
        statusRank(left.brief.status) - statusRank(right.brief.status) ||
        right.blockers - left.blockers ||
        left.readiness - right.readiness ||
        left.submission.id.localeCompare(right.submission.id),
    );

  const top = ranked[0];
  const blockers = ranked.reduce((sum, item) => sum + item.blockers, 0);
  const review = ranked.filter((item) => item.brief.status === "needs_review").length;
  const waiting = ranked.filter((item) => item.brief.status === "waiting").length;
  const ready = ranked.filter((item) =>
    ["ready", "complete"].includes(item.brief.status),
  ).length;
  const averageReadiness = Math.round(
    ranked.reduce((sum, item) => sum + item.readiness, 0) / ranked.length,
  );
  const score = clamp(averageReadiness - blockers * 8 - review * 3 + ready * 2);
  const tone = intelligenceTone(blockers, review, ready, waiting);

  return {
    headline:
      blockers > 0
        ? `${blockers} ${word(blockers, "блокер", "блокера", "блокеров")} в активной очереди`
        : review > 0
          ? `${review} ${word(review, "подача", "подачи", "подач")} требуют сверки`
          : ready > 0
            ? `${ready} ${word(ready, "подача готова", "подачи готовы", "подач готовы")} к следующему шагу`
            : "Очередь движется без критических сигналов",
    metrics: [
      { label: "Блокеры", tone: blockers ? "critical" : "clear", value: blockers },
      { label: "Нужна сверка", tone: review ? "attention" : "clear", value: review },
      { label: "Ожидание", tone: waiting ? "waiting" : "clear", value: waiting },
      { label: "Готово", tone: "ready", value: ready },
    ],
    plan: top.brief.actions.length
      ? top.brief.actions.slice(0, 3)
      : [top.brief.nextStep.label],
    score,
    summary: top.brief.summary,
    tone,
    topReason: top.brief.reason,
    topSubmissionId: top.submission.id,
    topSubmissionTitle: top.submission.listTitle ?? top.submission.title,
  };
}

function buildAdminIntelligence(submissions: Submission[]): WorkspaceIntelligence {
  const radar = buildAdminTriageRadar(submissions);
  const top = radar.items[0];
  const critical = radar.totals.critical;
  const attention = radar.totals.attention;
  const ready = radar.totals.ready;
  const waiting = radar.totals.waiting;
  const score = clamp(100 - critical * 16 - attention * 7 - waiting * 2 + ready * 3);
  const tone = intelligenceTone(critical, attention, ready, waiting);

  return {
    headline:
      critical > 0
        ? `${critical} ${word(critical, "критичная подача", "критичные подачи", "критичных подач")} требуют решения`
        : attention > 0
          ? `${attention} ${word(attention, "подача ждёт", "подачи ждут", "подач ждут")} ручной сверки`
          : ready > 0
            ? `${ready} ${word(ready, "пакет готов", "пакета готовы", "пакетов готовы")} к выгрузке`
            : "Очередь стабильна",
    metrics: [
      { label: "Критично", tone: critical ? "critical" : "clear", value: critical },
      { label: "Внимание", tone: attention ? "attention" : "clear", value: attention },
      { label: "Ожидание", tone: waiting ? "waiting" : "clear", value: waiting },
      { label: "К выгрузке", tone: "ready", value: ready },
    ],
    plan: top
      ? [
          top.nextAction,
          ...top.reasons.slice(0, 2).map((reason) => `Проверить: ${reason}`),
        ]
      : ["Откройте очередь и проверьте новые пакеты."],
    score,
    summary: top ? `${top.title}: ${top.nextAction}` : "Активных сигналов нет.",
    tone,
    topReason: top?.reasons.join(" · "),
    topSubmissionId: top?.submissionId,
    topSubmissionTitle: top?.title,
  };
}

export function workspaceIntelligenceClipboardText(
  intelligence: WorkspaceIntelligence,
) {
  const metrics = intelligence.metrics
    .map((metric) => `• ${metric.label}: ${metric.value}`)
    .join("\n");
  const plan = intelligence.plan
    .map((step, index) => `${index + 1}. ${step}`)
    .join("\n");

  return [
    `AI-сводка · ${intelligence.score}/100`,
    intelligence.headline,
    intelligence.summary,
    intelligence.topReason ? `Почему: ${intelligence.topReason}` : "",
    `Метрики:\n${metrics}`,
    `План:\n${plan}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function statusRank(status: CaseCopilotStatus) {
  return { blocked: 0, needs_review: 1, ready: 2, waiting: 3, complete: 4 }[status];
}

function intelligenceTone(
  critical: number,
  attention: number,
  ready: number,
  waiting: number,
): WorkspaceIntelligenceTone {
  if (critical > 0) return "critical";
  if (attention > 0) return "attention";
  if (ready > 0) return "ready";
  if (waiting > 0) return "waiting";
  return "clear";
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function word(count: number, one: string, few: string, many: string) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
