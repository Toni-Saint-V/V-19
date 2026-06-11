import type {
  Applicant,
  AppointmentStatus,
  ExportBatch,
  MediaState,
  MediaSlot,
  MediaSlotType,
  MetaItem,
  NextAction,
  Role,
  StatusGroup,
  Submission,
  SubmissionStatus,
} from "../types/domain";

export const statusGroups: StatusGroup[] = [
  "filling",
  "review",
  "fix",
  "ready",
  "appointment",
];

export const statusGroupMeta: Record<StatusGroup, MetaItem> = {
  filling: { label: "Заполнение", tone: "warning" },
  review: { label: "Проверка", tone: "info" },
  fix: { label: "Исправить", tone: "error" },
  ready: { label: "Принято / Excel", tone: "success" },
  appointment: { label: "Запись", tone: "violet" },
};

export const statusMeta: Record<SubmissionStatus, MetaItem> = {
  draft: { label: "Черновик", tone: "neutral" },
  filling: { label: "Заполняется", tone: "warning" },
  ready_for_review: { label: "Готово к проверке", tone: "warning" },
  waiting_review: { label: "Ожидает проверки", tone: "info" },
  in_review: { label: "На проверке", tone: "info" },
  returned: { label: "Возвращено на доработку", tone: "error" },
  accepted: { label: "Принято оператором", tone: "success" },
  ready_for_excel: { label: "Готово к Excel", tone: "success" },
  exported: { label: "Выгружено", tone: "violet" },
  sent_to_appointment: { label: "Передано на запись", tone: "violet" },
  appointment_scheduled: { label: "Запись назначена", tone: "violet" },
  attention_required: { label: "Требует внимания", tone: "error" },
  completed: { label: "Завершено", tone: "violet" },
};

export const statusToGroup: Record<SubmissionStatus, StatusGroup> = {
  draft: "filling",
  filling: "filling",
  ready_for_review: "filling",
  waiting_review: "review",
  in_review: "review",
  returned: "fix",
  attention_required: "fix",
  accepted: "ready",
  ready_for_excel: "ready",
  exported: "appointment",
  sent_to_appointment: "appointment",
  appointment_scheduled: "appointment",
  completed: "appointment",
};

export const appointmentMeta: Record<AppointmentStatus, MetaItem> = {
  not_started: { label: "Не начата", tone: "neutral" },
  sent_to_appointment: { label: "Передано на запись", tone: "info" },
  appointment_scheduled: { label: "Дата записи указана оператором", tone: "success" },
  attention_required: { label: "Требует внимания", tone: "error" },
  completed: { label: "Завершена", tone: "success" },
};

export const mediaMeta: Record<MediaState, MetaItem> = {
  missing: { label: "Нет файла", tone: "neutral" },
  uploaded: { label: "Загружено, не принято", tone: "warning" },
  accepted: { label: "Принято оператором", tone: "success" },
  replace: { label: "Заменить", tone: "error" },
};

export const mediaSlotTypes: Array<{
  type: MediaSlotType;
  label: string;
  suffix: string;
}> = [
  { type: "photo_white", label: "Фото на белом фоне", suffix: "photo_white.jpg" },
  { type: "selfie", label: "Селфи", suffix: "selfie.jpg" },
  { type: "video", label: "Видео", suffix: "video.mp4" },
];

export const requiredApplicantFields: Array<{
  key: keyof Applicant;
  label: string;
}> = [
  { key: "name", label: "ФИО" },
  { key: "birthDate", label: "Дата рождения" },
  { key: "citizenship", label: "Гражданство" },
  { key: "address", label: "Адрес" },
  { key: "phone", label: "Телефон" },
  { key: "email", label: "Email" },
  { key: "passport", label: "Номер паспорта" },
  { key: "passportIssuedAt", label: "Дата выдачи паспорта" },
  { key: "passportExpiresAt", label: "Срок действия паспорта" },
  { key: "country", label: "Страна подачи" },
  { key: "city", label: "Город подачи" },
  { key: "tripDates", label: "Даты поездки" },
  { key: "hotelName", label: "Отель" },
  { key: "hotelAddress", label: "Адрес отеля" },
];

export interface FamilySignal {
  key: "surname" | "patronymic" | "address" | "contacts" | "trip" | "hotel" | "age";
  label: string;
  score: number;
  matched: boolean;
}

export interface FamilyRoleProposal {
  applicantId: string;
  name: string;
  currentRole: string;
  suggestedRole: string;
  reason: string;
}

export interface FamilySuggestion {
  score: number;
  confidence: "low" | "medium" | "high";
  suggested: boolean;
  title: string;
  text: string;
  signals: FamilySignal[];
  roles: FamilyRoleProposal[];
}

export const screenNames: Record<string, string> = {
  login: "Вход",
  "agent-overview": "Обзор",
  "agent-create": "Новая заявка",
  "agent-applications": "Заявки",
  "agent-corrections": "Исправления",
  "agent-detail": "Заявка",
  "admin-overview": "Операции",
  "admin-queue": "Очередь",
  "admin-detail": "Проверка",
  "admin-export": "Выгрузка",
  "admin-appointments": "Запись",
};

export function roleProfile(role: Role) {
  if (role === "admin") {
    return {
      name: "Операции",
      initials: "OP",
      roleText: "Операционный доступ",
      sideText: "Все заявки, решения, выгрузка и запись",
      accent: "#78A6FF",
      accentRgb: "120, 166, 255",
      ink: "#08101f",
    };
  }

  return {
    name: "Агент",
    initials: "AG",
    roleText: "Агентский доступ",
    sideText: "Свои заявки, медиа и исправления",
    accent: "#F2C96D",
    accentRgb: "242, 201, 109",
    ink: "#181207",
  };
}

export function statusGroup(status: SubmissionStatus): StatusGroup {
  return statusToGroup[status];
}

export function statusMatchesFilter(
  submission: Submission,
  filter: StatusGroup | "all",
): boolean {
  return filter === "all" || statusGroup(submission.status) === filter;
}

export function filteredSubmissions(
  submissions: Submission[],
  filter: StatusGroup | "all",
): Submission[] {
  return filter === "all"
    ? submissions
    : submissions.filter((submission) => statusMatchesFilter(submission, filter));
}

export function countByStatus(source: Submission[], status: SubmissionStatus): number {
  return source.filter((submission) => submission.status === status).length;
}

export function countByGroup(source: Submission[], group: StatusGroup): number {
  return source.filter((submission) => statusGroup(submission.status) === group).length;
}

export function countWhere(
  source: Submission[],
  predicate: (submission: Submission) => boolean,
): number {
  return source.filter(predicate).length;
}

export function readiness(submission: Submission): number {
  if (submission.applicants.some((applicant) => applicant.mediaSlots?.length)) {
    const fieldAverage = average(
      submission.applicants.map((applicant) => applicantFieldCompletion(applicant)),
    );
    const mediaAverage = average(
      submission.applicants.map((applicant) => applicantMediaCompletion(applicant)),
    );
    return Math.max(0, Math.min(100, Math.round((fieldAverage + mediaAverage) / 2)));
  }

  const media = submission.mediaRequired
    ? Math.round((submission.media / submission.mediaRequired) * 100)
    : 0;

  return Math.max(0, Math.min(100, Math.round((submission.fields + media) / 2)));
}

export function applicantReadiness(person: Applicant): number {
  if (person.mediaSlots?.length) {
    return Math.round(
      (applicantFieldCompletion(person) + applicantMediaCompletion(person)) / 2,
    );
  }

  const media = person.mediaRequired ? (person.media / person.mediaRequired) * 100 : 0;

  return Math.round((person.form + media) / 2);
}

export function applicantCountLabel(submission: Submission): string {
  const count = submission.applicants.length;
  if (count === 1) return "1 заявитель";
  if (count > 1 && count < 5) return `${count} заявителя`;
  return `${count} заявителей`;
}

export function typeLabel(type: Submission["type"]): string {
  return type === "family" ? "Семья" : "Заявитель";
}

export function blockers(submission: Submission): string[] {
  const list: string[] = [];

  if (submission.type === "single" && submission.applicants.length !== 1) {
    list.push("Туристическая заявка должна содержать ровно одного заявителя.");
  }

  if (submission.type === "family" && submission.applicants.length === 0) {
    list.push("Добавьте хотя бы одного заявителя в семейную заявку.");
  }

  if (submission.notes.length) {
    list.push(
      ...submission.notes
        .filter(
          (note) =>
            (note.status ?? "open") === "open" &&
            (note.severity ?? "blocking") === "blocking",
        )
        .map((note) => note.text),
    );
  }

  const intakeBlockers = submission.applicants.flatMap((applicant) =>
    applicantBlockers(applicant),
  );

  if (intakeBlockers.length) {
    list.push(...intakeBlockers);
  }

  if (submission.applicants.some((applicant) => applicant.mediaSlots?.length)) {
    return Array.from(new Set(list));
  }

  if (submission.fields < 100) {
    list.push(`Анкета заполнена на ${submission.fields}%`);
  }

  if (submission.media < submission.mediaRequired) {
    list.push(`Медиа: ${submission.media}/${submission.mediaRequired}`);
  }

  return Array.from(new Set(list));
}

export function normalizeApplicant(
  applicant: Applicant,
  index = 0,
  submission?: Submission,
): Applicant {
  const applicantId = applicant.id ?? `${submission?.id ?? "applicant"}-${index + 1}`;
  const country = applicant.country ?? submission?.country ?? "";
  const city = applicant.city ?? submission?.city ?? "";
  const tripDates = applicant.tripDates ?? submission?.travelDate ?? "";
  const normalized: Applicant = {
    ...applicant,
    id: applicantId,
    country,
    city,
    tripDates,
    roleConfirmed: applicant.roleConfirmed ?? false,
  };

  const withSlots = {
    ...normalized,
    mediaSlots: ensureMediaSlots(normalized),
  };

  return {
    ...withSlots,
    status: applicant.status ?? getApplicantStatus(withSlots),
  };
}

export function normalizeSubmission(submission: Submission): Submission {
  const applicants = submission.applicants.map((applicant, index) =>
    normalizeApplicant(applicant, index, submission),
  );
  const mediaRequired = applicants.reduce(
    (sum, applicant) => sum + ensureMediaSlots(applicant).length,
    0,
  );
  const media = applicants.reduce(
    (sum, applicant) =>
      sum +
      ensureMediaSlots(applicant).filter(
        (slot) => slot.state === "uploaded" || slot.state === "accepted",
      ).length,
    0,
  );
  const fields = Math.round(
    average(applicants.map((applicant) => applicantFieldCompletion(applicant))),
  );

  return {
    ...submission,
    appointment: normalizeAppointmentStatus(submission.appointment),
    applicants,
    fields,
    media,
    mediaRequired,
    mediaRows: applicants.flatMap((applicant) =>
      ensureMediaSlots(applicant).map((slot) => ({
        label: `${slot.label} · ${applicant.name}`,
        state: slot.state,
      })),
    ),
    familyGroupId:
      submission.type === "family"
        ? (submission.familyGroupId ?? `FAM-${submission.id}`)
        : undefined,
    familyGroupColor:
      submission.type === "family"
        ? (submission.familyGroupColor ?? familyGroupColor(submission.id))
        : undefined,
    appointmentDetails: {
      submissionId: submission.id,
      city: submission.city,
      ...(submission.appointmentDetails ?? {}),
      status: normalizeAppointmentStatus(submission.appointment),
    },
  };
}

export function ensureMediaSlots(applicant: Applicant): MediaSlot[] {
  const uploadedCount = applicant.media;

  return mediaSlotTypes.map((slot, index) => {
    const existing = applicant.mediaSlots?.find((item) => item.type === slot.type);
    const state: MediaState =
      existing?.state ?? (index < uploadedCount ? "uploaded" : "missing");
    const rebuilt = buildMediaSlot(applicant, slot.type, state);

    return {
      ...rebuilt,
      ...existing,
      generatedFileName: getGeneratedFileName(applicant.passport, slot.type),
      uploadStatus:
        existing?.uploadStatus ?? (state === "missing" ? "none" : "uploaded"),
      reviewStatus: existing?.reviewStatus ?? mediaReviewStatusForState(state),
    };
  });
}

export function buildMediaSlot(
  applicant: Applicant,
  type: MediaSlotType,
  state: MediaState = "missing",
): MediaSlot {
  const meta = mediaSlotTypes.find((slot) => slot.type === type) ?? mediaSlotTypes[0];
  const applicantId = applicant.id ?? applicant.name.replace(/\s+/g, "-").toLowerCase();

  return {
    id: `${applicantId}-${type}`,
    applicantId,
    type,
    label: meta.label,
    state,
    generatedFileName: getGeneratedFileName(applicant.passport, type),
    uploadStatus: state === "missing" ? "none" : "uploaded",
    reviewStatus: mediaReviewStatusForState(state),
  };
}

export function getGeneratedFileName(
  passportNumber: string | undefined,
  mediaType: MediaSlotType,
): string | undefined {
  const passport = cleanPassport(passportNumber ?? "");
  if (!passport) return undefined;

  if (mediaType === "photo_white") return `${passport}_photo_white.jpg`;
  if (mediaType === "selfie") return `${passport}_selfie.jpg`;
  return `${passport}_video.mp4`;
}

function mediaReviewStatusForState(state: MediaState): MediaSlot["reviewStatus"] {
  if (state === "accepted") return "accepted";
  if (state === "replace") return "replace_required";
  return "not_reviewed";
}

export function applicantFieldCompletion(applicant: Applicant): number {
  const completed = requiredApplicantFields.filter(({ key }) => {
    const value = applicant[key];
    return typeof value === "string"
      ? value.trim().length > 0 && value !== "-"
      : Boolean(value);
  }).length;

  return Math.round((completed / requiredApplicantFields.length) * 100);
}

export function applicantMediaCompletion(applicant: Applicant): number {
  const slots = ensureMediaSlots(applicant);
  if (!slots.length) return 0;

  const uploaded = slots.filter(
    (slot) => slot.state === "uploaded" || slot.state === "accepted",
  ).length;
  return Math.round((uploaded / slots.length) * 100);
}

export function applicantAcceptedMediaCompletion(applicant: Applicant): number {
  const slots = ensureMediaSlots(applicant);
  if (!slots.length) return 0;

  const accepted = slots.filter((slot) => slot.state === "accepted").length;
  return Math.round((accepted / slots.length) * 100);
}

export function getApplicantStatus(applicant: Applicant): Applicant["status"] {
  const fieldCompletion = applicantFieldCompletion(applicant);
  const slots = ensureMediaSlots(applicant);
  const hasMissingMedia = slots.some((slot) => slot.state === "missing");
  const hasReplaceMedia = slots.some((slot) => slot.state === "replace");
  const allAccepted =
    slots.length > 0 && slots.every((slot) => slot.state === "accepted");

  if (hasReplaceMedia) return "needs_fix";
  if (fieldCompletion === 0) return "questionnaire_empty";
  if (fieldCompletion < 100) return "questionnaire_partial";
  if (hasMissingMedia) return "media_missing";
  if (allAccepted) return "accepted";
  return "waiting_review";
}

export interface MediaLifecycleCounts {
  required: number;
  uploaded: number;
  accepted: number;
  missing: number;
  replace: number;
}

export interface PreflightChecklistItem {
  label: string;
  ok: boolean;
  detail: string;
  tone: MetaItem["tone"];
}

export interface SubmissionPreflight {
  canSubmit: boolean;
  blockers: string[];
  warnings: string[];
  media: MediaLifecycleCounts;
  readiness: number;
  checklist: PreflightChecklistItem[];
}

export function mediaLifecycleCounts(submission: Submission): MediaLifecycleCounts {
  const slots = submission.applicants.flatMap((applicant) =>
    ensureMediaSlots(applicant),
  );
  const accepted = slots.filter((slot) => slot.state === "accepted").length;
  const uploaded = slots.filter(
    (slot) => slot.state === "uploaded" || slot.state === "accepted",
  ).length;
  const missing = slots.filter((slot) => slot.state === "missing").length;
  const replace = slots.filter((slot) => slot.state === "replace").length;

  return {
    required: slots.length,
    uploaded,
    accepted,
    missing,
    replace,
  };
}

export function submissionPreflight(submission: Submission): SubmissionPreflight {
  const media = mediaLifecycleCounts(submission);
  const baseBlockers = blockers(submission);
  const familyNeedsConfirmation =
    submission.type === "family" &&
    submission.applicants.length > 1 &&
    submission.familyIntelligence?.status !== "confirmed";
  const familyRoleBlockers = familyNeedsConfirmation
    ? ["Подтвердите семейную группу и роли перед передачей оператору."]
    : [];
  const allBlockers = Array.from(new Set([...baseBlockers, ...familyRoleBlockers]));
  const fieldsComplete = submission.fields === 100;
  const mediaComplete =
    media.required > 0 && media.uploaded === media.required && media.replace === 0;
  const warnings =
    media.uploaded > media.accepted
      ? [
          "Загруженные медиа доступны для передачи оператору, но пока не считаются принятыми.",
        ]
      : [];

  return {
    canSubmit: allBlockers.length === 0,
    blockers: allBlockers,
    warnings,
    media,
    readiness: readiness(submission),
    checklist: [
      {
        label: "Анкеты заявителей",
        ok: fieldsComplete,
        detail: fieldsComplete
          ? "Все обязательные поля заполнены."
          : `Заполнение ${submission.fields}%.`,
        tone: fieldsComplete ? "success" : "warning",
      },
      {
        label: "Медиа загружены",
        ok: mediaComplete,
        detail: `${media.uploaded}/${media.required} загружено, ${media.replace} на замену.`,
        tone: mediaComplete ? "success" : "error",
      },
      {
        label: "Принято оператором",
        ok: media.accepted === media.required,
        detail: `${media.accepted}/${media.required} принято. Это не требуется для передачи агентом.`,
        tone: media.accepted === media.required ? "success" : "neutral",
      },
      {
        label: "Семейные роли",
        ok: !familyNeedsConfirmation,
        detail: familyNeedsConfirmation
          ? "Нужно подтвердить группу вручную. Система не объединяет заявителей сама."
          : "Нет неподтверждённой семейной группы.",
        tone: familyNeedsConfirmation ? "warning" : "success",
      },
      {
        label: "Блокеры",
        ok: allBlockers.length === 0,
        detail: allBlockers.length ? `${allBlockers.length} открыто.` : "Нет блокеров.",
        tone: allBlockers.length ? "error" : "success",
      },
    ],
  };
}

export function adminAcceptancePreflight(submission: Submission): SubmissionPreflight {
  const base = submissionPreflight(submission);
  const media = mediaLifecycleCounts(submission);
  const acceptanceBlockers = acceptanceBlockersForSubmission(submission);
  const allBlockers = Array.from(new Set([...base.blockers, ...acceptanceBlockers]));

  return {
    ...base,
    canSubmit: allBlockers.length === 0 && media.accepted === media.required,
    blockers: allBlockers,
    checklist: [
      ...base.checklist.filter((item) => item.label !== "Принято оператором"),
      {
        label: "Принято оператором",
        ok: media.accepted === media.required,
        detail: `${media.accepted}/${media.required} принято. Для принятия заявки нужны все файлы.`,
        tone: media.accepted === media.required ? "success" : "error",
      },
    ],
  };
}

export function applicantBlockers(applicant: Applicant): string[] {
  const list: string[] = [];
  const missingFields = requiredApplicantFields
    .filter(({ key }) => {
      const value = applicant[key];
      return typeof value === "string"
        ? value.trim().length === 0 || value === "-"
        : !value;
    })
    .map(({ label }) => label);

  if (missingFields.length) {
    list.push(`${applicant.name}: заполнить ${missingFields.slice(0, 2).join(", ")}`);
  }

  const slots = ensureMediaSlots(applicant);
  const missingMedia = slots.filter((slot) => slot.state === "missing");
  if (missingMedia.length) {
    list.push(`${applicant.name}: добавить ${missingMedia[0].label.toLowerCase()}`);
  }

  const replacement = slots.find((slot) => slot.state === "replace");
  if (replacement) {
    list.push(`${applicant.name}: заменить ${replacement.label.toLowerCase()}`);
  }

  if (!cleanPassport(applicant.passport)) {
    list.push(`${applicant.name}: указать номер паспорта для имён файлов`);
  }

  return list;
}

export const getApplicantBlockers = applicantBlockers;
export const getSubmissionBlockers = blockers;

export function canSubmitToOperator(submission: Submission): boolean {
  return submissionPreflight(submission).canSubmit;
}

export function canAcceptSubmission(submission: Submission): boolean {
  return adminAcceptancePreflight(submission).canSubmit;
}

export function hasOpenBlockingCorrections(submission: Submission): boolean {
  return submission.notes.some(
    (note) =>
      (note.status ?? "open") === "open" &&
      (note.severity ?? "blocking") === "blocking",
  );
}

export function acceptanceBlockersForSubmission(submission: Submission): string[] {
  const list: string[] = [];

  if (hasOpenBlockingCorrections(submission)) {
    list.push("Закройте открытые блокирующие замечания.");
  }

  for (const applicant of submission.applicants) {
    const unaccepted = ensureMediaSlots(applicant).filter(
      (slot) => slot.state !== "accepted",
    );

    if (unaccepted.length) {
      list.push(`${applicant.name}: оператор должен принять все медиа.`);
    }
  }

  return Array.from(new Set(list));
}

export function normalizeAppointmentStatus(
  status: AppointmentStatus | "in_progress" | "scheduled" | "issue" | "done",
): AppointmentStatus {
  if (status === "in_progress") return "sent_to_appointment";
  if (status === "scheduled") return "appointment_scheduled";
  if (status === "issue") return "attention_required";
  if (status === "done") return "completed";
  return status;
}

export function createStatusHistoryItem(
  entityId: string,
  toStatus: string,
  comment: string,
  fromStatus: string | undefined,
  changedBy: string,
  changedAt: string,
  entityType: "submission" | "applicant" | "media" | "appointment" = "submission",
) {
  return {
    id: `${entityId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    entityType,
    entityId,
    fromStatus,
    toStatus,
    comment,
    changedBy,
    changedAt,
  };
}

export function transitionSubmissionStatus(
  submission: Submission,
  status: SubmissionStatus,
  changedBy: string,
  changedAt: string,
  comment?: string,
): Submission {
  const next: Submission = {
    ...submission,
    status,
    updated: changedAt,
    timeline: [
      ...(submission.timeline ?? []),
      createStatusHistoryItem(
        submission.id,
        status,
        comment ?? `Статус изменён: ${submission.status} → ${status}`,
        submission.status,
        changedBy,
        changedAt,
      ),
    ],
  };

  if (status === "waiting_review") next.submittedAt = changedAt;
  if (status === "in_review") next.reviewStartedAt = changedAt;
  if (status === "accepted") next.acceptedAt = changedAt;
  if (status === "exported") {
    next.exportedAt = changedAt;
    next.appointment = "not_started";
  }
  if (status === "sent_to_appointment") next.appointment = "sent_to_appointment";
  if (status === "appointment_scheduled") next.appointment = "appointment_scheduled";
  if (status === "attention_required") next.appointment = "attention_required";
  if (status === "completed") next.appointment = "completed";

  return normalizeSubmission(next);
}

export function markCorrectionFixed(
  submission: Submission,
  correctionId: string,
  changedBy: string,
  changedAt: string,
): Submission {
  const notes = submission.notes.map((note) =>
    (note.id ?? `${note.target}-${note.text}`) === correctionId
      ? { ...note, status: "fixed" as const, fixedAt: changedAt }
      : note,
  );

  return normalizeSubmission({
    ...submission,
    notes,
    updated: changedAt,
    timeline: [
      ...(submission.timeline ?? []),
      createStatusHistoryItem(
        submission.id,
        "correction:fixed",
        "Агент отметил замечание исправленным.",
        "open",
        changedBy,
        changedAt,
      ),
    ],
  });
}

export function appendExportBatch(
  submission: Submission,
  batch: ExportBatch,
  changedBy: string,
  changedAt: string,
): Submission {
  return transitionSubmissionStatus(
    {
      ...submission,
      exportHistory: [batch, ...(submission.exportHistory ?? [])],
    },
    "exported",
    changedBy,
    changedAt,
    `Заявка включена в выгрузку ${batch.id}.`,
  );
}

export function familyGroupColor(id: string): string {
  const colors = ["#2F3A4A", "#38514A", "#4A3E5F", "#5A4636", "#324D63"];
  return colors[Math.abs(hashString(id)) % colors.length];
}

export function validateSubmissionInvariants(submission: Submission): string[] {
  const list: string[] = [];
  const normalized = normalizeSubmission(submission);

  if (normalized.type === "single" && normalized.applicants.length !== 1) {
    list.push("single_applicant_count");
  }

  if (
    ["accepted", "ready_for_excel", "exported"].includes(normalized.status) &&
    hasOpenBlockingCorrections(normalized)
  ) {
    list.push("accepted_with_open_blocking_correction");
  }

  if (
    ["accepted", "ready_for_excel", "exported"].includes(normalized.status) &&
    mediaLifecycleCounts(normalized).accepted !==
      mediaLifecycleCounts(normalized).required
  ) {
    list.push("accepted_without_accepted_media");
  }

  return list;
}

export function familySuggestion(submission: Submission): FamilySuggestion {
  const applicants = submission.applicants.map((applicant, index) =>
    normalizeApplicant(applicant, index, submission),
  );

  if (applicants.length < 2) {
    return {
      score: 0,
      confidence: "low",
      suggested: false,
      title: "Недостаточно заявителей",
      text: "Family Intelligence включается для двух и более заявителей.",
      signals: [],
      roles: [],
    };
  }

  const signals: FamilySignal[] = [
    signal(
      "surname",
      "Фамилия совпадает",
      25,
      commonNonEmpty(applicants.map((applicant) => surname(applicant.name))),
    ),
    signal(
      "patronymic",
      "Отчество/среднее имя связано",
      10,
      patronymicSignal(applicants),
    ),
    signal(
      "address",
      "Адрес совпадает",
      20,
      commonNonEmpty(applicants.map((applicant) => applicant.address)),
    ),
    signal(
      "contacts",
      "Контакты совпадают",
      15,
      commonNonEmpty(applicants.map((applicant) => applicant.phone)) ||
        commonNonEmpty(applicants.map((applicant) => applicant.email)),
    ),
    signal(
      "trip",
      "Поездка совпадает",
      15,
      commonNonEmpty(applicants.map((applicant) => applicant.tripDates)) &&
        commonNonEmpty(applicants.map((applicant) => applicant.country)) &&
        commonNonEmpty(applicants.map((applicant) => applicant.city)),
    ),
    signal(
      "hotel",
      "Отель/адрес отеля совпадает",
      15,
      commonNonEmpty(applicants.map((applicant) => applicant.hotelName)) ||
        commonNonEmpty(applicants.map((applicant) => applicant.hotelAddress)),
    ),
    signal(
      "age",
      "Есть взрослый и ребёнок",
      15,
      applicants.some((applicant) => age(applicant.birthDate) >= 18) &&
        applicants.some((applicant) => {
          const applicantAge = age(applicant.birthDate);
          return applicantAge > 0 && applicantAge < 18;
        }),
    ),
  ];
  const score = signals
    .filter((item) => item.matched)
    .reduce((sum, item) => sum + item.score, 0);
  const confidence = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
  const suggested = score >= 40;
  const roles = proposeFamilyRoles(applicants);

  return {
    score,
    confidence,
    suggested,
    title: suggested ? "Возможная семейная группа" : "Связь не подтверждена",
    text: suggested
      ? "Проверьте сигналы и подтвердите роли. Система не объединяет заявителей сама."
      : "Сигналов недостаточно для рекомендации. Агент может оставить роли вручную.",
    signals,
    roles,
  };
}

export function proposeFamilyRoles(applicants: Applicant[]): FamilyRoleProposal[] {
  const normalized = applicants.map((applicant, index) => ({
    ...applicant,
    id: applicant.id ?? `applicant-${index + 1}`,
  }));
  const adults = normalized.filter((applicant) => age(applicant.birthDate) >= 18);
  const firstAdultId = adults[0]?.id ?? normalized[0]?.id;

  return normalized.map((applicant, index) => {
    const applicantAge = age(applicant.birthDate);
    let suggestedRole = "Член семьи";
    let reason = "Общий маршрут или данные анкеты.";

    if (applicant.id === firstAdultId) {
      suggestedRole = "Основной заявитель";
      reason = "Первый взрослый заявитель в группе.";
    } else if (applicantAge > 0 && applicantAge < 18) {
      suggestedRole = "Ребёнок";
      reason = "Возраст меньше 18 лет.";
    } else if (
      index > 0 &&
      surname(applicant.name) &&
      surname(applicant.name) === surname(normalized[0]?.name ?? "")
    ) {
      suggestedRole = index === 1 ? "Супруг/супруга" : "Взрослый член семьи";
      reason = "Совпадает фамилия с основным заявителем.";
    }

    return {
      applicantId: applicant.id,
      name: applicant.name,
      currentRole: applicant.role,
      suggestedRole,
      reason,
    };
  });
}

export function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function cleanPassport(passport: string): string {
  const cleaned = passport.replace(/[^A-Za-z0-9]/g, "");
  return cleaned === "" || cleaned === "-" ? "" : cleaned;
}

function signal(
  key: FamilySignal["key"],
  label: string,
  score: number,
  matched: boolean,
): FamilySignal {
  return { key, label, score, matched };
}

function commonNonEmpty(values: Array<string | undefined>): boolean {
  const normalized = values.map(normalizeText).filter(Boolean);
  if (normalized.length < 2) return false;
  return new Set(normalized).size === 1;
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function surname(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return parts[parts.length - 1].toLowerCase();
}

function patronymicSignal(applicants: Applicant[]): boolean {
  const explicit = commonNonEmpty(applicants.map((applicant) => applicant.patronymic));
  if (explicit) return true;

  const middleParts = applicants
    .map((applicant) => applicant.name.trim().split(/\s+/)[1])
    .filter(Boolean)
    .map((value) => value.toLowerCase());

  if (middleParts.length < 2) return false;
  return new Set(middleParts).size === 1;
}

function age(birthDate: string | undefined): number {
  if (!birthDate) return 0;
  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) return 0;

  const today = new Date("2026-06-11T00:00:00Z");
  let years = today.getUTCFullYear() - parsed.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - parsed.getUTCMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < parsed.getUTCDate())) {
    years -= 1;
  }

  return years;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

export function nextAction(submission: Submission, admin = false): NextAction {
  if (admin) {
    if (submission.status === "waiting_review") {
      return { label: "проверить", button: "Открыть", tone: "warning" };
    }
    if (submission.status === "in_review") {
      return { label: "продолжить проверку", button: "Продолжить", tone: "info" };
    }
    if (submission.status === "returned") {
      return { label: "на стороне агента", button: "Открыть", tone: "error" };
    }
    if (submission.status === "accepted") {
      return { label: "подготовить к Excel", button: "Открыть", tone: "success" };
    }
    if (submission.status === "ready_for_excel") {
      return { label: "выгрузить Excel", button: "Выгрузка", tone: "success" };
    }
    if (
      ["exported", "sent_to_appointment", "appointment_scheduled"].includes(
        submission.status,
      )
    ) {
      return { label: "обновить запись", button: "Запись", tone: "info" };
    }
    if (submission.status === "attention_required") {
      return { label: "ручное решение", button: "Открыть", tone: "error" };
    }
    return { label: "открыть", button: "Открыть", tone: "neutral" };
  }

  if (submission.status === "returned") {
    return { label: "исправить замечания", button: "Исправить", tone: "error" };
  }
  if (["draft", "filling"].includes(submission.status)) {
    return { label: "заполнить данные и медиа", button: "Продолжить", tone: "warning" };
  }
  if (submission.status === "ready_for_review") {
    return { label: "передать оператору", button: "Отправить", tone: "gold" };
  }
  if (["waiting_review", "in_review"].includes(submission.status)) {
    return { label: "ожидать проверки", button: "Открыть", tone: "info" };
  }
  if (submission.status === "attention_required") {
    return { label: "уточнить вручную", button: "Открыть", tone: "error" };
  }
  if (
    [
      "accepted",
      "ready_for_excel",
      "exported",
      "sent_to_appointment",
      "appointment_scheduled",
      "completed",
    ].includes(submission.status)
  ) {
    return { label: "следить за статусом", button: "Открыть", tone: "success" };
  }

  return { label: "открыть", button: "Открыть", tone: "neutral" };
}
