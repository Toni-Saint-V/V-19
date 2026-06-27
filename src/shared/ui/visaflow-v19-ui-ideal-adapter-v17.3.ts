/* VisaFlow V-19 UI Ideal adapter v17.3
   UI-only mapping layer. Converts existing operational selectors
   (inbox events + agent action queue) into a unified Work Center view model.
   No domain logic, no command execution, no persistence. */

export type VfTone = "danger" | "warning" | "info" | "success" | "neutral";
export type VfWorkTab = "now" | "events" | "actions" | "done";

export type VfWorkOpenTarget<TSubmission = unknown> = {
  route?: string;
  submission?: TSubmission;
  submissionId?: string;
  tab?: string;
  target?: unknown;
};

export type VfWorkItem<TSubmission = unknown> = {
  id: string;
  kind: "event" | "action";
  tone: VfTone;
  unread?: boolean;
  title: string;
  meta?: string;
  objectTitle: string;
  objectMeta?: string;
  dueLabel: string;
  dueValue: string;
  stateLabel: string;
  stateTone?: VfTone;
  cta: string;
  open: VfWorkOpenTarget<TSubmission>;
  // UI-only derived flags used for tabs/stats. Not part of the domain.
  isCritical: boolean;
  isToday: boolean;
  isDone: boolean;
  searchText: string;
};

export type VfEventInput<TSubmission = unknown> = {
  id: string;
  title: string;
  badge?: string;
  context?: string;
  action?: string;
  tone?: string;
  read?: boolean;
  needsAction?: boolean;
  time?: string;
  tab?: string;
  submission: TSubmission;
  submissionId?: string;
  target?: unknown;
};

export type VfActionInput<TSubmission = unknown> = {
  id: string;
  title: string;
  context?: string;
  cta?: string;
  due?: "overdue" | "today" | "week" | "completed";
  dueLabel?: string;
  severity?: "blocker" | "warning" | "ready" | "info";
  badges?: Array<{ label: string; tone?: string }>;
  completed?: boolean;
  tab?: string;
  submission: TSubmission;
  submissionId?: string;
  target?: unknown;
};

// Display-only copy guard. The Work Center never renders forbidden media
// wording. This rewrites visible labels at the view layer; it does not touch
// domain data, statuses, or persistence.
const VF_COPY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Проверить\s+заменённое\s+видео/gi, "Проверить selfie_2"],
  [/Комментарий\s+к\s+видео/gi, "Комментарий к selfie_2"],
  [/Файлы\s*·\s*Видео/gi, "Файлы · selfie_2"],
  [/заменённое\s+видео/gi, "selfie_2"],
  [/видео/gi, "selfie_2"],
];

function vfSafeCopy(value: string | undefined): string | undefined {
  if (!value) return value;
  let next = value;
  for (const [pattern, replacement] of VF_COPY_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

type VfSubmissionLike = {
  id?: string;
  title?: string;
  city?: string;
  status?: string;
  applicants?: Array<{ fullName?: string }>;
};

function readSubmission(submission: unknown): VfSubmissionLike {
  return (submission ?? {}) as VfSubmissionLike;
}

function objectTitleFor(submission: VfSubmissionLike) {
  return (
    submission.applicants?.[0]?.fullName?.trim() ||
    submission.title?.trim() ||
    submission.id ||
    "Подача"
  );
}

function objectMetaFor(submission: VfSubmissionLike) {
  return [submission.id, submission.city].filter(Boolean).join(" · ") || undefined;
}

function eventTone(tone?: string): VfTone {
  switch (tone) {
    case "danger":
      return "danger";
    case "amber":
      return "warning";
    case "blue":
      return "info";
    case "teal":
      return "success";
    default:
      return "neutral";
  }
}

function severityTone(severity?: string, completed?: boolean): VfTone {
  if (completed) return "success";
  switch (severity) {
    case "blocker":
      return "danger";
    case "warning":
      return "warning";
    case "ready":
      return "success";
    default:
      return "neutral";
  }
}

// Prefer an exact, operational CTA. Falls back to the supplied label only when
// no precise destination is known (matches the V-19 content rules).
function ctaForTab(tab: string | undefined, fallback: string | undefined): string {
  switch (tab) {
    case "questionnaire":
      return "Перейти к анкете";
    case "files":
      return "Перейти к файлам";
    case "issues":
      return "Перейти к замечанию";
    case "overview":
      return "Проверить готовность";
    case "history":
      return fallback && fallback !== "Открыть" ? fallback : "Смотреть";
    default:
      return fallback && fallback !== "Открыть" ? fallback : "Открыть точное поле";
  }
}

export function vfMakeWorkItemFromEvent<TSubmission>(
  event: VfEventInput<TSubmission>,
): VfWorkItem<TSubmission> {
  const submission = readSubmission(event.submission);
  const tone = eventTone(event.tone);
  const unread = event.read === false;

  return {
    id: event.id,
    kind: "event",
    tone,
    unread,
    title: vfSafeCopy(event.title) ?? event.title,
    meta: vfSafeCopy(event.badge),
    objectTitle: objectTitleFor(submission),
    objectMeta: objectMetaFor(submission),
    dueLabel: "Источник",
    dueValue: vfSafeCopy(event.time) ?? "только что",
    stateLabel: vfSafeCopy(event.badge) ?? "Событие",
    stateTone: tone,
    cta: vfSafeCopy(ctaForTab(event.tab, event.action)) ?? ctaForTab(event.tab, event.action),
    open: {
      submission: event.submission,
      submissionId: event.submissionId ?? submission.id,
      tab: event.tab,
      target: event.target,
    },
    isCritical: tone === "danger",
    isToday: Boolean(event.needsAction),
    isDone: false,
    searchText: [event.title, event.badge, event.context, submission.id, submission.city]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

export function vfMakeWorkItemFromAction<TSubmission>(
  action: VfActionInput<TSubmission>,
): VfWorkItem<TSubmission> {
  const submission = readSubmission(action.submission);
  const completed = Boolean(action.completed) || action.due === "completed";
  const tone = severityTone(action.severity, completed);

  return {
    id: action.id,
    kind: "action",
    tone,
    unread: false,
    title: vfSafeCopy(action.title) ?? action.title,
    meta: vfSafeCopy(action.badges?.[0]?.label),
    objectTitle: objectTitleFor(submission),
    objectMeta: vfSafeCopy(action.context || objectMetaFor(submission)),
    dueLabel: completed ? "Статус" : "Срок",
    dueValue: vfSafeCopy(action.dueLabel) ?? (completed ? "Выполнено" : "В работе"),
    stateLabel: vfSafeCopy(action.dueLabel ?? action.badges?.[0]?.label) ?? "Действие",
    stateTone: tone,
    cta: completed ? "Смотреть" : vfSafeCopy(ctaForTab(action.tab, action.cta)) ?? ctaForTab(action.tab, action.cta),
    open: {
      submission: action.submission,
      submissionId: action.submissionId ?? submission.id,
      tab: action.tab,
      target: action.target,
    },
    isCritical: !completed && action.severity === "blocker",
    isToday: !completed && (action.due === "overdue" || action.due === "today"),
    isDone: completed,
    searchText: [
      action.title,
      action.context,
      action.dueLabel,
      submission.id,
      submission.city,
      ...(action.badges ?? []).map((badge) => badge.label),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

export function vfWorkStats<TSubmission>(items: Array<VfWorkItem<TSubmission>>) {
  let critical = 0;
  let today = 0;
  let unread = 0;
  let done = 0;

  for (const item of items) {
    if (item.isDone) {
      done += 1;
      continue;
    }
    if (item.isCritical) critical += 1;
    if (item.isToday) today += 1;
    if (item.unread) unread += 1;
  }

  return { critical, today, unread, done };
}

export function vfFilterWorkItems<TSubmission>(
  items: Array<VfWorkItem<TSubmission>>,
  tab: VfWorkTab,
  query = "",
): Array<VfWorkItem<TSubmission>> {
  const normalized = query.trim().toLowerCase();

  return items.filter((item) => {
    if (normalized && !item.searchText.includes(normalized)) return false;

    switch (tab) {
      case "now":
        return !item.isDone && (item.isCritical || item.isToday);
      case "events":
        return item.kind === "event" && !item.isDone;
      case "actions":
        return item.kind === "action" && !item.isDone;
      case "done":
        return item.isDone;
      default:
        return true;
    }
  });
}
