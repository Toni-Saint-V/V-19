import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseRuntimeConfig } from "./lib/supabase/config";
import type { AppSession } from "./services/authService";
import {
  getCurrentAppSession,
  signInDemo,
  signOutCurrentSession,
} from "./services/authService";
import { roleRouteStart } from "./services/profileService";
import type {
  Applicant,
  AppointmentStatus,
  MediaSlotType,
  Role,
  Screen,
  StatusGroup,
  Submission,
} from "./types/domain";
import {
  AppShell,
  AppointmentCard,
  Button,
  Chip,
  DetailView,
  EmptyState,
  LoginPage,
  Metrics,
  Modal,
  PageHead,
  QueueCard,
  StatusRail,
  SubmissionCard,
  Toast,
  AiHelperPanel,
  MiniExportTable,
  ExportPreviewTable,
} from "./components/ui";
import { buildExportGuard, draftCorrectionText } from "./services/aiHelperService";
import {
  buildExportPlan,
  createCsvBlob,
  createXlsxBlob,
} from "./services/exportService";
import {
  buildMediaSlot,
  canAcceptSubmission,
  countByStatus,
  countWhere,
  createStatusHistoryItem,
  ensureMediaSlots,
  familySuggestion,
  filteredSubmissions,
  markCorrectionFixed,
  normalizeApplicant,
  normalizeSubmission,
  roleProfile,
  submissionPreflight,
  adminAcceptancePreflight,
  statusMatchesFilter,
  transitionSubmissionStatus,
  requiredApplicantFields,
} from "./lib/workflow";
import {
  loadLocalSubmissions,
  markSubmissionsExported,
  saveLocalSubmissions,
  updateAppointmentStatus,
} from "./services/localRepository";

const currentAgentId = "agent-1";
const currentDate = "11.06.2026";
const currentActor = "Demo operator";

interface CreateDraft {
  mode: Submission["type"];
  country: string;
  city: string;
  travelDate: string;
  tripType: string;
  primaryName: string;
  primaryPassport: string;
  primaryBirthDate: string;
  primaryCitizenship: string;
  primaryPhone: string;
  primaryEmail: string;
  address: string;
  hotelName: string;
  hotelAddress: string;
}

const defaultCreateDraft: CreateDraft = {
  mode: "single",
  country: "Испания",
  city: "Мадрид",
  travelDate: "2026-08-20",
  tripType: "Туризм",
  primaryName: "",
  primaryPassport: "",
  primaryBirthDate: "",
  primaryCitizenship: "РФ",
  primaryPhone: "",
  primaryEmail: "",
  address: "",
  hotelName: "",
  hotelAddress: "",
};

function canAccessScreen(screen: Screen, role: Role): boolean {
  if (screen === "login") return true;
  if (role === "admin") return screen.startsWith("admin-");
  return screen.startsWith("agent-");
}

function App() {
  const [session, setSession] = useState<AppSession | null>(null);
  const [role, setRole] = useState<Role>("agent");
  const [screen, setScreen] = useState<Screen>("login");
  const [submissions, setSubmissions] = useState<Submission[]>(() =>
    loadLocalSubmissions(),
  );
  const [selectedId, setSelectedId] = useState("VF-1024");
  const [agentFilter, setAgentFilter] = useState<StatusGroup | "all">("all");
  const [queueFilter, setQueueFilter] = useState<StatusGroup | "all">("review");
  const [createDraft, setCreateDraft] = useState<CreateDraft>(defaultCreateDraft);
  const [createAttempted, setCreateAttempted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [returnModalId, setReturnModalId] = useState<string | null>(null);
  const [returnTarget, setReturnTarget] = useState("Анкета");
  const [returnSeverity, setReturnSeverity] = useState<"blocking" | "note">("blocking");
  const [returnText, setReturnText] = useState(
    "Нужен корректный файл или уточнение данных.",
  );
  const [preflightModalId, setPreflightModalId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const profile = roleProfile(role);
  const selectedSubmission =
    submissions.find((submission) => submission.id === selectedId) ?? submissions[0];
  const authed = Boolean(session);
  const activeAgentId =
    session?.profile.role === "agent" ? session.profile.id : currentAgentId;

  useEffect(() => {
    document.documentElement.style.setProperty("--role", profile.accent);
    document.documentElement.style.setProperty("--role-rgb", profile.accentRgb);
    document.documentElement.style.setProperty("--role-ink", profile.ink);
  }, [profile.accent, profile.accentRgb, profile.ink]);

  useEffect(() => {
    saveLocalSubmissions(submissions);
  }, [submissions]);

  useEffect(() => {
    let active = true;

    void getCurrentAppSession().then((currentSession) => {
      if (!active || !currentSession) return;
      setSession(currentSession);
      setRole(currentSession.profile.role);
      setScreen(roleRouteStart(currentSession.profile.role));
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) return undefined;

    const timer = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const isMine = useCallback(
    (submission: Submission) => submission.agentId === activeAgentId,
    [activeAgentId],
  );

  const navItems = useMemo(() => {
    const mine = submissions.filter(isMine);

    if (role === "admin") {
      return [
        { id: "admin-overview" as const, label: "Операции", icon: "⌘" },
        {
          id: "admin-queue" as const,
          label: "Очередь",
          icon: "Q",
          count: countWhere(submissions, (submission) =>
            ["waiting_review", "in_review", "returned", "attention_required"].includes(
              submission.status,
            ),
          ),
        },
        {
          id: "admin-export" as const,
          label: "Выгрузка",
          icon: "X",
          count:
            countByStatus(submissions, "ready_for_excel") +
            countByStatus(submissions, "accepted"),
        },
        {
          id: "admin-appointments" as const,
          label: "Запись",
          icon: "S",
          count: countWhere(submissions, (submission) =>
            [
              "exported",
              "sent_to_appointment",
              "appointment_scheduled",
              "attention_required",
            ].includes(submission.status),
          ),
        },
      ];
    }

    return [
      { id: "agent-overview" as const, label: "Обзор", icon: "⌘" },
      { id: "agent-create" as const, label: "Новая заявка", icon: "+" },
      {
        id: "agent-applications" as const,
        label: "Заявки",
        icon: "A",
        count: mine.length,
      },
      {
        id: "agent-corrections" as const,
        label: "Исправления",
        icon: "!",
        count: countByStatus(mine, "returned"),
      },
    ];
  }, [isMine, role, submissions]);

  function showToast(message: string) {
    setToastMessage(message);
  }

  function navigate(nextScreen: Screen) {
    if (nextScreen !== "login" && !canAccessScreen(nextScreen, role)) {
      setScreen(roleRouteStart(role));
      setMobileMenuOpen(false);
      showToast("Экран недоступен для текущей роли");
      return;
    }

    setScreen(nextScreen);
    setMobileMenuOpen(false);
  }

  async function login(nextRole: Role) {
    const nextSession = await signInDemo(nextRole);
    setSession(nextSession);
    setRole(nextSession.profile.role);
    setScreen(roleRouteStart(nextSession.profile.role));
    setMobileMenuOpen(false);
  }

  async function logout() {
    await signOutCurrentSession();
    setSession(null);
    setScreen("login");
    setMobileMenuOpen(false);
  }

  function openSubmission(submission: Submission, admin: boolean) {
    if (!canAccessScreen(admin ? "admin-detail" : "agent-detail", role)) {
      showToast("Нет доступа к выбранному режиму");
      return;
    }

    setSelectedId(submission.id);
    setScreen(admin ? "admin-detail" : "agent-detail");
    setMobileMenuOpen(false);
  }

  function setStatus(id: string, status: Submission["status"]) {
    const target = submissions.find((submission) => submission.id === id);

    if (target && ["ready_for_review", "waiting_review"].includes(status)) {
      const preflight = submissionPreflight(target);
      if (!preflight.canSubmit) {
        setPreflightModalId(id);
        showToast("Есть блокеры перед передачей оператору");
        return;
      }
    }

    if (target && (status === "accepted" || status === "ready_for_excel")) {
      if (status === "accepted" && target.status !== "in_review") {
        showToast("Сначала начните проверку");
        return;
      }

      if (status === "ready_for_excel" && target.status !== "accepted") {
        showToast("Сначала примите заявку");
        return;
      }

      const preflight = adminAcceptancePreflight(target);
      if (!preflight.canSubmit || !canAcceptSubmission(target)) {
        showToast("Нельзя принять: есть открытые блокеры");
        return;
      }
    }

    setSubmissions((current) =>
      current.map((submission) => {
        if (submission.id !== id) return submission;

        return transitionSubmissionStatus(
          submission,
          status,
          currentActor,
          currentDate,
        );
      }),
    );
    showToast("Статус обновлён");
  }

  function openSubmitPreflight(id: string) {
    setPreflightModalId(id);
  }

  function confirmSubmitToOperator() {
    if (!preflightModalId) return;

    const target = submissions.find((submission) => submission.id === preflightModalId);
    if (!target) return;

    const preflight = submissionPreflight(target);
    if (!preflight.canSubmit) {
      showToast("Передача заблокирована: закройте блокеры");
      return;
    }

    setSubmissions((current) =>
      current.map((submission) =>
        submission.id === preflightModalId
          ? transitionSubmissionStatus(
              submission,
              "waiting_review",
              currentActor,
              currentDate,
              "Агент передал заявку оператору после preflight.",
            )
          : submission,
      ),
    );
    setPreflightModalId(null);
    showToast("Заявка передана оператору");
  }

  function createSubmission() {
    const missingFields = createDraftMissingFields(createDraft);

    if (missingFields.length) {
      setCreateAttempted(true);
      showToast("Заполните обязательные поля перед созданием заявки");
      return;
    }

    const id = `VF-${1043 + submissions.length}`;
    const type = createDraft.mode;
    const title = createDraft.primaryName.trim();
    const primaryApplicant: Applicant = normalizeApplicant({
      id: `${id}-1`,
      name: title,
      role: type === "family" ? "Основной заявитель" : "Заявитель",
      passport: createDraft.primaryPassport.trim(),
      form: 0,
      media: 0,
      mediaRequired: 3,
      birthDate: createDraft.primaryBirthDate,
      citizenship: createDraft.primaryCitizenship,
      address: createDraft.address,
      phone: createDraft.primaryPhone,
      email: createDraft.primaryEmail,
      passportIssuedAt: "",
      passportExpiresAt: "",
      country: createDraft.country,
      city: createDraft.city,
      tripDates: createDraft.travelDate,
      hotelName: createDraft.hotelName,
      hotelAddress: createDraft.hotelAddress,
      tripPurpose: createDraft.tripType,
    });
    const applicants: Applicant[] = [primaryApplicant];
    const newSubmission: Submission = {
      id,
      title,
      type,
      agentId: activeAgentId,
      agentName: "Nord Travel",
      country: createDraft.country,
      city: createDraft.city,
      travelDate: createDraft.travelDate,
      updated: currentDate,
      createdAt: currentDate,
      status: "draft",
      appointment: "not_started",
      priority: "Средний",
      fields: 0,
      media: 0,
      mediaRequired: applicants.length * 3,
      applicants,
      mediaRows: [],
      notes: [],
      familyIntelligence:
        type === "family"
          ? {
              status: "unreviewed",
            }
          : undefined,
      familyGroupId: type === "family" ? `FAM-${id}` : undefined,
      familyGroupColor:
        type === "family"
          ? ["#2F3A4A", "#38514A", "#4A3E5F", "#5A4636"][submissions.length % 4]
          : undefined,
    };

    setSubmissions((current) => [normalizeSubmission(newSubmission), ...current]);
    setSelectedId(id);
    setScreen("agent-detail");
    setCreateDraft(defaultCreateDraft);
    setCreateAttempted(false);
    showToast("Заявка создана");
  }

  function updateCreateDraft<Key extends keyof CreateDraft>(
    key: Key,
    value: CreateDraft[Key],
  ) {
    setCreateDraft((draft) => ({ ...draft, [key]: value }));
  }

  function createDraftMissingFields(draft: CreateDraft) {
    return [
      { key: "primaryName" as const, label: "ФИО" },
      { key: "primaryPassport" as const, label: "Номер паспорта" },
      { key: "primaryBirthDate" as const, label: "Дата рождения" },
      { key: "primaryCitizenship" as const, label: "Гражданство" },
      { key: "primaryPhone" as const, label: "Телефон" },
      { key: "primaryEmail" as const, label: "Email" },
      { key: "address" as const, label: "Адрес" },
      { key: "hotelName" as const, label: "Отель" },
      { key: "hotelAddress" as const, label: "Адрес отеля" },
    ].filter(({ key }) => !draft[key].trim());
  }

  function createFieldInvalid(key: keyof CreateDraft) {
    return createAttempted && !createDraft[key].trim();
  }

  function updateApplicant(
    submissionId: string,
    applicantId: string,
    field: keyof Applicant,
    value: string,
  ) {
    setSubmissions((current) =>
      current.map((submission) => {
        if (submission.id !== submissionId) return submission;

        const applicants = submission.applicants.map((applicant, index) => {
          const id = applicant.id ?? `${submission.id}-${index + 1}`;
          if (id !== applicantId) return applicant;

          const nextApplicant = normalizeApplicant(
            {
              ...applicant,
              id,
              [field]: value,
              ...(field === "name" ? { name: value || "Заявитель" } : {}),
              ...(field === "passport" ? { passport: value } : {}),
            },
            index,
            submission,
          );

          return nextApplicant;
        });

        const title =
          applicants[0]?.name && applicants[0].name !== "Заявитель"
            ? applicants[0].name
            : submission.title;

        return normalizeSubmission({
          ...submission,
          title: submission.type === "family" ? submission.title : title,
          applicants,
          status: submission.status === "draft" ? "filling" : submission.status,
          updated: currentDate,
        });
      }),
    );
  }

  function addApplicant(submissionId: string) {
    setSubmissions((current) =>
      current.map((submission) => {
        if (submission.id !== submissionId) return submission;

        const index = submission.applicants.length + 1;
        const primary = submission.applicants[0];
        const familyName = primary?.name.trim().split(/\s+/).slice(-1)[0] || "";
        const newApplicant = normalizeApplicant(
          {
            id: `${submission.id}-${index}`,
            name: familyName
              ? `Заявитель ${index} ${familyName}`
              : `Заявитель ${index}`,
            role: "Член семьи",
            passport: "",
            form: 0,
            media: 0,
            mediaRequired: 3,
            birthDate: "",
            citizenship: primary?.citizenship,
            address: primary?.address,
            phone: primary?.phone,
            email: primary?.email,
            country: submission.country,
            city: submission.city,
            tripDates: submission.travelDate,
            hotelName: primary?.hotelName,
            hotelAddress: primary?.hotelAddress,
          },
          index - 1,
          submission,
        );

        return normalizeSubmission({
          ...submission,
          type: "family",
          title:
            submission.type === "family"
              ? submission.title
              : `Семья ${submission.applicants[0]?.name ?? submission.title}`,
          applicants: [...submission.applicants, newApplicant],
          updated: currentDate,
        });
      }),
    );
    showToast("Заявитель добавлен");
  }

  function updateMediaSlot(
    submissionId: string,
    applicantId: string,
    type: MediaSlotType,
    state: "missing" | "uploaded",
  ) {
    setSubmissions((current) =>
      current.map((submission) => {
        if (submission.id !== submissionId) return submission;

        const applicants = submission.applicants.map((applicant, index) => {
          const normalized = normalizeApplicant(applicant, index, submission);
          if (normalized.id !== applicantId) return normalized;

          const mediaSlots = (normalized.mediaSlots ?? []).map((slot) => {
            if (slot.type !== type) return slot;

            const uploaded = state === "uploaded";
            const rebuilt = buildMediaSlot(normalized, type, state);
            return {
              ...slot,
              ...rebuilt,
              state,
              originalFileName: uploaded ? `${normalized.name}_${type}` : undefined,
            };
          });

          return normalizeApplicant(
            {
              ...normalized,
              mediaSlots,
            },
            index,
            submission,
          );
        });

        return normalizeSubmission({
          ...submission,
          applicants,
          status: submission.status === "draft" ? "filling" : submission.status,
          updated: currentDate,
        });
      }),
    );
    showToast(state === "uploaded" ? "Файл отмечен загруженным" : "Файл снят");
  }

  function reviewMediaSlot(
    submissionId: string,
    applicantId: string,
    type: MediaSlotType,
    state: "accepted" | "replace",
    reason?: string,
  ) {
    setSubmissions((current) =>
      current.map((submission) => {
        if (submission.id !== submissionId) return submission;

        let targetLabel = "Медиа";
        const applicants = submission.applicants.map((applicant, index) => {
          const normalized = normalizeApplicant(applicant, index, submission);
          if (normalized.id !== applicantId) return normalized;

          const mediaSlots = (normalized.mediaSlots ?? []).map((slot) => {
            if (slot.type !== type) return slot;
            targetLabel = `${slot.label} · ${normalized.name}`;
            return {
              ...slot,
              state,
              reason: state === "replace" ? reason : undefined,
            };
          });

          return normalizeApplicant({ ...normalized, mediaSlots }, index, submission);
        });

        const correction =
          state === "replace"
            ? {
                id: `${submission.id}-${applicantId}-${type}-${Date.now()}`,
                target: targetLabel,
                text: reason?.trim() || "Нужно заменить файл.",
                scope: "media" as const,
                applicantId,
                mediaType: type,
                severity: "blocking" as const,
                status: "open" as const,
                createdBy: currentActor,
                createdAt: currentDate,
              }
            : null;
        const notes =
          state === "accepted"
            ? submission.notes.map((note) =>
                note.scope === "media" &&
                note.applicantId === applicantId &&
                note.mediaType === type &&
                (note.status ?? "open") === "open"
                  ? { ...note, status: "fixed" as const, fixedAt: currentDate }
                  : note,
              )
            : correction
              ? [correction, ...submission.notes]
              : submission.notes;

        return normalizeSubmission({
          ...submission,
          applicants,
          notes,
          updated: currentDate,
          timeline: [
            ...(submission.timeline ?? []),
            createStatusHistoryItem(
              submission.id,
              `media:${state}`,
              state === "accepted"
                ? `Оператор принял файл: ${targetLabel}`
                : `Оператор запросил замену файла: ${targetLabel}`,
              "uploaded",
              currentActor,
              currentDate,
            ),
          ],
        });
      }),
    );
    showToast(state === "accepted" ? "Медиа принято" : "Запрошена замена медиа");
  }

  function confirmFamilyRoles(submissionId: string, applySuggestedRoles: boolean) {
    setSubmissions((current) =>
      current.map((submission) => {
        if (submission.id !== submissionId) return submission;

        const suggestion = familySuggestion(submission);
        const applicants = submission.applicants.map((applicant, index) => {
          const applicantId = applicant.id ?? `${submission.id}-${index + 1}`;
          const proposal = suggestion.roles.find(
            (role) => role.applicantId === applicantId,
          );

          return normalizeApplicant(
            {
              ...applicant,
              id: applicantId,
              role:
                applySuggestedRoles && proposal
                  ? proposal.suggestedRole
                  : applicant.role,
              suggestedRole: proposal?.suggestedRole,
              roleConfirmed: true,
            },
            index,
            submission,
          );
        });

        return normalizeSubmission({
          ...submission,
          type: "family",
          applicants,
          familyIntelligence: {
            status: "confirmed",
            confirmedAt: currentDate,
          },
          updated: currentDate,
        });
      }),
    );
    showToast(
      applySuggestedRoles
        ? "Семейные роли подтверждены"
        : "Группа подтверждена без изменения ролей",
    );
  }

  function openReturnModal(id: string) {
    setSelectedId(id);
    setReturnTarget("submission::Анкета");
    setReturnSeverity("blocking");
    setReturnText("");
    setReturnModalId(id);
  }

  function submitReturn() {
    if (!returnModalId) return;
    if (!returnText.trim()) {
      showToast("Укажите причину возврата");
      return;
    }

    const target = parseReturnTarget(returnTarget);

    setSubmissions((current) =>
      current.map((submission) => {
        if (submission.id !== returnModalId) return submission;

        const applicants =
          target.scope === "media" && target.applicantId && target.mediaType
            ? submission.applicants.map((applicant, index) => {
                const normalized = normalizeApplicant(applicant, index, submission);
                if (normalized.id !== target.applicantId) return normalized;

                return normalizeApplicant(
                  {
                    ...normalized,
                    mediaSlots: ensureMediaSlots(normalized).map((slot) =>
                      slot.type === target.mediaType
                        ? {
                            ...slot,
                            state: "replace",
                            reason: returnText.trim(),
                            reviewStatus: "replace_required",
                          }
                        : slot,
                    ),
                  },
                  index,
                  submission,
                );
              })
            : submission.applicants;

        return transitionSubmissionStatus(
          {
            ...submission,
            applicants,
            notes: [
              {
                id: `${submission.id}-${Date.now()}`,
                target: target.label,
                text: returnText.trim(),
                scope: target.scope,
                applicantId: target.applicantId,
                fieldKey: target.fieldKey,
                mediaType: target.mediaType,
                severity: returnSeverity,
                status: "open",
                createdBy: currentActor,
                createdAt: currentDate,
              },
              ...submission.notes,
            ],
          },
          "returned",
          currentActor,
          currentDate,
          `Оператор вернул заявку: ${target.label}`,
        );
      }),
    );
    setReturnModalId(null);
    showToast("Заявка возвращена агенту");
  }

  function parseReturnTarget(value: string): {
    scope: "submission" | "applicant" | "field" | "media";
    label: string;
    applicantId?: string;
    fieldKey?: keyof Applicant;
    mediaType?: MediaSlotType;
  } {
    const [scope, applicantId, keyOrMediaType, ...labelParts] = value.split("::");
    const label = labelParts.join("::") || applicantId || "Анкета";

    if (scope === "applicant") {
      return { scope, applicantId, label };
    }

    if (scope === "field") {
      return {
        scope,
        applicantId,
        fieldKey: keyOrMediaType as keyof Applicant,
        label,
      };
    }

    if (scope === "media" && isMediaSlotType(keyOrMediaType)) {
      return { scope, applicantId, mediaType: keyOrMediaType, label };
    }

    return {
      scope: "submission",
      label: value.replace("submission::", "") || "Анкета",
    };
  }

  function fixCorrection(submissionId: string, correctionId: string) {
    setSubmissions((current) =>
      current.map((submission) =>
        submission.id === submissionId
          ? markCorrectionFixed(submission, correctionId, currentActor, currentDate)
          : submission,
      ),
    );
    showToast("Замечание отмечено исправленным");
  }

  function applyCorrectionDraft() {
    const submission = submissions.find((item) => item.id === returnModalId);
    if (!submission) return;

    const target = parseReturnTarget(returnTarget);
    const draft = draftCorrectionText(submission, target.label);
    setReturnText(draft.summary);
    showToast("Черновик замечания подготовлен");
  }

  function isMediaSlotType(value: string | undefined): value is MediaSlotType {
    return value === "photo_white" || value === "selfie" || value === "video";
  }

  function downloadBlob(blob: Blob, fileName: string) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function downloadExport(format: "csv" | "xlsx") {
    const plan = buildExportPlan(submissions);
    if (!plan.rows.length) {
      showToast("Нет строк без блокеров для выгрузки");
      return;
    }

    const stamp = "2026-06-11";
    const blob =
      format === "csv" ? createCsvBlob(plan.rows) : createXlsxBlob(plan.rows);
    downloadBlob(blob, `visaflow_export_${stamp}.${format}`);
    showToast(
      format === "csv"
        ? `CSV сформирован: ${plan.applicantRowCount} строк`
        : `XLSX сформирован: ${plan.applicantRowCount} строк`,
    );
  }

  function markExported() {
    const plan = buildExportPlan(submissions);
    if (!plan.rows.length) {
      showToast("Нет строк без блокеров для отметки");
      return;
    }

    const readyIds = new Set(plan.readySubmissions.map((submission) => submission.id));
    const batch = {
      id: `EXP-${Date.now()}`,
      createdBy: currentActor,
      createdAt: currentDate,
      format: "xlsx" as const,
      rowCount: plan.applicantRowCount,
      submissionIds: plan.readySubmissions.map((submission) => submission.id),
    };
    setSubmissions((current) =>
      markSubmissionsExported(current, readyIds, batch, currentActor, currentDate),
    );
    showToast(`Статус обновлён: выгружено ${plan.readySubmissions.length}`);
  }

  function changeAppointment(id: string, status: AppointmentStatus) {
    setSubmissions((current) =>
      current.map((submission) =>
        submission.id === id
          ? updateAppointmentStatus(submission, status, currentActor, currentDate)
          : submission,
      ),
    );
    showToast("Ручной статус записи сохранён");
  }

  if (!authed) {
    return (
      <>
        <LoginPage
          authMode={supabaseRuntimeConfig.mode}
          missingConfig={supabaseRuntimeConfig.missing}
          onLogin={login}
        />
        <Toast message={toastMessage} />
      </>
    );
  }

  return (
    <>
      <AppShell
        role={role}
        screen={screen}
        navItems={navItems}
        mobileMenuOpen={mobileMenuOpen}
        authMode={session?.mode ?? supabaseRuntimeConfig.mode}
        profileName={session?.profile.displayName ?? roleProfile(role).name}
        onNavigate={navigate}
        onLogout={logout}
        onMobileMenu={() => setMobileMenuOpen((value) => !value)}
        onMobileClose={() => setMobileMenuOpen(false)}
      >
        {renderScreen()}
      </AppShell>

      {ReturnModal()}
      {SubmitPreflightModal()}
      <Toast message={toastMessage} />
    </>
  );

  function renderScreen() {
    if (screen === "agent-overview") return AgentOverview();
    if (screen === "agent-create") return AgentCreate();
    if (screen === "agent-applications") return AgentApplications();
    if (screen === "agent-corrections") return AgentCorrections();
    if (screen === "agent-detail") {
      return (
        <DetailView
          submission={selectedSubmission}
          admin={false}
          onBack={() => navigate("agent-applications")}
          onSetStatus={setStatus}
          onReturnOpen={openReturnModal}
          onNavigate={navigate}
          onUpdateApplicant={updateApplicant}
          onAddApplicant={addApplicant}
          onUpdateMediaSlot={updateMediaSlot}
          onReviewMediaSlot={reviewMediaSlot}
          onFixCorrection={fixCorrection}
          onConfirmFamilyRoles={confirmFamilyRoles}
          onSubmitPreflight={openSubmitPreflight}
        />
      );
    }
    if (screen === "admin-overview") return AdminOverview();
    if (screen === "admin-queue") return AdminQueue();
    if (screen === "admin-detail") {
      return (
        <DetailView
          submission={selectedSubmission}
          admin
          onBack={() => navigate("admin-queue")}
          onSetStatus={setStatus}
          onReturnOpen={openReturnModal}
          onNavigate={navigate}
          onUpdateApplicant={updateApplicant}
          onAddApplicant={addApplicant}
          onUpdateMediaSlot={updateMediaSlot}
          onReviewMediaSlot={reviewMediaSlot}
          onFixCorrection={fixCorrection}
          onConfirmFamilyRoles={confirmFamilyRoles}
          onSubmitPreflight={openSubmitPreflight}
        />
      );
    }
    if (screen === "admin-export") return AdminExport();
    if (screen === "admin-appointments") return AdminAppointments();
    return AgentOverview();
  }

  function AgentOverview() {
    const mine = submissions.filter(isMine);
    const priority = [
      ...mine.filter((submission) => submission.status === "returned"),
      ...mine.filter((submission) =>
        ["draft", "filling", "ready_for_review"].includes(submission.status),
      ),
      ...mine.filter((submission) =>
        ["waiting_review", "in_review", "attention_required"].includes(
          submission.status,
        ),
      ),
      ...mine.filter((submission) =>
        [
          "accepted",
          "ready_for_excel",
          "exported",
          "sent_to_appointment",
          "appointment_scheduled",
        ].includes(submission.status),
      ),
    ];

    return (
      <>
        <PageHead
          kicker="Агент"
          title="Рабочий стол"
          subtitle="Свои заявки, исправления и статусы обработки."
          actions={
            <>
              <Button onClick={() => navigate("agent-applications")}>Заявки</Button>
              <Button variant="primary" onClick={() => navigate("agent-create")}>
                Новая заявка
              </Button>
            </>
          }
        />
        <Metrics
          items={[
            {
              label: "Активные",
              value: mine.filter((submission) => submission.status !== "completed")
                .length,
              hint: "в работе",
            },
            {
              label: "Заполнить",
              value: mine.filter((submission) =>
                ["draft", "filling", "ready_for_review"].includes(submission.status),
              ).length,
              hint: "данные и медиа",
            },
            {
              label: "Исправления",
              value: countByStatus(mine, "returned"),
              hint: "возвраты",
            },
            {
              label: "После отправки",
              value: mine.filter((submission) =>
                [
                  "waiting_review",
                  "in_review",
                  "accepted",
                  "ready_for_excel",
                  "exported",
                  "sent_to_appointment",
                  "appointment_scheduled",
                ].includes(submission.status),
              ).length,
              hint: "операции",
            },
          ]}
        />
        <section>
          <div className="section-head">
            <div>
              <h2>Статусы</h2>
            </div>
          </div>
          <StatusRail
            source={mine}
            active="all"
            onChange={(filter) => {
              setAgentFilter(filter);
              navigate("agent-applications");
            }}
          />
        </section>
        <section>
          <div className="section-head">
            <div>
              <h2>Приоритет</h2>
            </div>
            <Button variant="ghost" onClick={() => navigate("agent-applications")}>
              Все заявки
            </Button>
          </div>
          <div className="list">
            {priority.length ? (
              priority
                .slice(0, 5)
                .map((submission) => (
                  <SubmissionCard
                    key={submission.id}
                    submission={submission}
                    onOpen={openSubmission}
                    onNavigate={navigate}
                  />
                ))
            ) : (
              <EmptyState title="Заявок нет" text="Создайте первую заявку." />
            )}
          </div>
        </section>
      </>
    );
  }

  function AgentApplications() {
    const mine = submissions.filter(isMine);
    const filtered = filteredSubmissions(mine, agentFilter);

    return (
      <>
        <PageHead
          kicker="Агент"
          title="Заявки"
          subtitle="Рабочий список по статусам."
          actions={
            <Button variant="primary" onClick={() => navigate("agent-create")}>
              Новая заявка
            </Button>
          }
        />
        <StatusRail source={mine} active={agentFilter} onChange={setAgentFilter} />
        <div className="list">
          {filtered.length ? (
            filtered.map((submission) => (
              <SubmissionCard
                key={submission.id}
                submission={submission}
                onOpen={openSubmission}
                onNavigate={navigate}
              />
            ))
          ) : (
            <EmptyState title="Нет заявок" text="В выбранном статусе нет заявок." />
          )}
        </div>
      </>
    );
  }

  function AgentCorrections() {
    const returned = submissions.filter(
      (submission) => isMine(submission) && submission.status === "returned",
    );

    return (
      <>
        <PageHead
          kicker="Агент"
          title="Исправления"
          subtitle="Возвраты с адресными замечаниями."
        />
        <div className="list">
          {returned.length ? (
            returned.map((submission) => (
              <SubmissionCard
                key={submission.id}
                submission={submission}
                onOpen={openSubmission}
                onNavigate={navigate}
              />
            ))
          ) : (
            <EmptyState
              title="Исправлений нет"
              text="Новые замечания появятся здесь."
            />
          )}
        </div>
      </>
    );
  }

  function AgentCreate() {
    return (
      <>
        <PageHead
          kicker="Агент"
          title="Новая заявка"
          subtitle="Создайте проверяемый черновик с базовыми данными заявителя и поездки."
          actions={
            <Button variant="primary" onClick={createSubmission}>
              Создать черновик
            </Button>
          }
        />
        <div className="choice-tabs" role="group" aria-label="Тип заявки">
          <button
            className={`choice-tab ${createDraft.mode === "single" ? "active" : ""}`}
            type="button"
            onClick={() => updateCreateDraft("mode", "single")}
          >
            Один заявитель
          </button>
          <button
            className={`choice-tab ${createDraft.mode === "family" ? "active" : ""}`}
            type="button"
            onClick={() => updateCreateDraft("mode", "family")}
          >
            Семья или группа
          </button>
        </div>
        <section className="card">
          <div className="section-head">
            <div>
              <h2>Данные поездки</h2>
              <p>Эти поля попадут в заявку и карточку первого заявителя.</p>
            </div>
          </div>
          {createAttempted && createDraftMissingFields(createDraft).length ? (
            <div
              className="blocker-box create-validation"
              role="alert"
              aria-live="polite"
            >
              <strong>Заполните обязательные поля</strong>
              <ul>
                {createDraftMissingFields(createDraft).map((field) => (
                  <li key={field.key}>{field.label}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="form-grid">
            <div className="field">
              <label htmlFor="country">Страна</label>
              <select
                id="country"
                value={createDraft.country}
                onChange={(event) => updateCreateDraft("country", event.target.value)}
              >
                <option>Испания</option>
                <option>Италия</option>
                <option>Франция</option>
                <option>Германия</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="city">Город подачи</label>
              <input
                id="city"
                value={createDraft.city}
                onChange={(event) => updateCreateDraft("city", event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="travel-date">Дата поездки</label>
              <input
                id="travel-date"
                type="date"
                value={createDraft.travelDate}
                onChange={(event) =>
                  updateCreateDraft("travelDate", event.target.value)
                }
              />
            </div>
            <div className="field">
              <label htmlFor="trip-type">Тип</label>
              <select
                id="trip-type"
                value={createDraft.tripType}
                onChange={(event) => updateCreateDraft("tripType", event.target.value)}
              >
                <option>Туризм</option>
                <option>Бизнес</option>
                <option>Гость</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="hotel-name">Отель</label>
              <input
                id="hotel-name"
                value={createDraft.hotelName}
                aria-invalid={createFieldInvalid("hotelName")}
                aria-describedby={
                  createFieldInvalid("hotelName") ? "hotel-name-error" : undefined
                }
                onChange={(event) => updateCreateDraft("hotelName", event.target.value)}
              />
              {createFieldInvalid("hotelName") ? (
                <small className="field-error" id="hotel-name-error">
                  Укажите отель.
                </small>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="hotel-address">Адрес отеля</label>
              <input
                id="hotel-address"
                value={createDraft.hotelAddress}
                aria-invalid={createFieldInvalid("hotelAddress")}
                aria-describedby={
                  createFieldInvalid("hotelAddress") ? "hotel-address-error" : undefined
                }
                onChange={(event) =>
                  updateCreateDraft("hotelAddress", event.target.value)
                }
              />
              {createFieldInvalid("hotelAddress") ? (
                <small className="field-error" id="hotel-address-error">
                  Укажите адрес отеля.
                </small>
              ) : null}
            </div>
          </div>
        </section>

        <section className="card">
          <div className="section-head">
            <div>
              <h2>Основной заявитель</h2>
              <p>Полный профиль продолжится в задачах после создания кейса.</p>
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="primary-name">ФИО</label>
              <input
                id="primary-name"
                value={createDraft.primaryName}
                aria-invalid={createFieldInvalid("primaryName")}
                aria-describedby={
                  createFieldInvalid("primaryName") ? "primary-name-error" : undefined
                }
                onChange={(event) =>
                  updateCreateDraft("primaryName", event.target.value)
                }
              />
              {createFieldInvalid("primaryName") ? (
                <small className="field-error" id="primary-name-error">
                  Укажите ФИО заявителя.
                </small>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="primary-passport">Номер паспорта</label>
              <input
                id="primary-passport"
                value={createDraft.primaryPassport}
                aria-invalid={createFieldInvalid("primaryPassport")}
                aria-describedby={
                  createFieldInvalid("primaryPassport")
                    ? "primary-passport-error"
                    : undefined
                }
                onChange={(event) =>
                  updateCreateDraft("primaryPassport", event.target.value)
                }
              />
              {createFieldInvalid("primaryPassport") ? (
                <small className="field-error" id="primary-passport-error">
                  Укажите номер паспорта.
                </small>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="primary-birth">Дата рождения</label>
              <input
                id="primary-birth"
                type="date"
                value={createDraft.primaryBirthDate}
                aria-invalid={createFieldInvalid("primaryBirthDate")}
                aria-describedby={
                  createFieldInvalid("primaryBirthDate")
                    ? "primary-birth-error"
                    : undefined
                }
                onChange={(event) =>
                  updateCreateDraft("primaryBirthDate", event.target.value)
                }
              />
              {createFieldInvalid("primaryBirthDate") ? (
                <small className="field-error" id="primary-birth-error">
                  Укажите дату рождения.
                </small>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="primary-citizenship">Гражданство</label>
              <input
                id="primary-citizenship"
                value={createDraft.primaryCitizenship}
                aria-invalid={createFieldInvalid("primaryCitizenship")}
                aria-describedby={
                  createFieldInvalid("primaryCitizenship")
                    ? "primary-citizenship-error"
                    : undefined
                }
                onChange={(event) =>
                  updateCreateDraft("primaryCitizenship", event.target.value)
                }
              />
              {createFieldInvalid("primaryCitizenship") ? (
                <small className="field-error" id="primary-citizenship-error">
                  Укажите гражданство.
                </small>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="primary-phone">Телефон</label>
              <input
                id="primary-phone"
                value={createDraft.primaryPhone}
                aria-invalid={createFieldInvalid("primaryPhone")}
                aria-describedby={
                  createFieldInvalid("primaryPhone") ? "primary-phone-error" : undefined
                }
                onChange={(event) =>
                  updateCreateDraft("primaryPhone", event.target.value)
                }
              />
              {createFieldInvalid("primaryPhone") ? (
                <small className="field-error" id="primary-phone-error">
                  Укажите телефон.
                </small>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="primary-email">Email</label>
              <input
                id="primary-email"
                value={createDraft.primaryEmail}
                aria-invalid={createFieldInvalid("primaryEmail")}
                aria-describedby={
                  createFieldInvalid("primaryEmail") ? "primary-email-error" : undefined
                }
                onChange={(event) =>
                  updateCreateDraft("primaryEmail", event.target.value)
                }
              />
              {createFieldInvalid("primaryEmail") ? (
                <small className="field-error" id="primary-email-error">
                  Укажите email.
                </small>
              ) : null}
            </div>
            <div className="field wide">
              <label htmlFor="primary-address">Адрес</label>
              <input
                id="primary-address"
                value={createDraft.address}
                aria-invalid={createFieldInvalid("address")}
                aria-describedby={
                  createFieldInvalid("address") ? "primary-address-error" : undefined
                }
                onChange={(event) => updateCreateDraft("address", event.target.value)}
              />
              {createFieldInvalid("address") ? (
                <small className="field-error" id="primary-address-error">
                  Укажите адрес.
                </small>
              ) : null}
            </div>
          </div>
          <div className="action-strip">
            <div>
              <strong>
                {createDraft.mode === "family"
                  ? "Будет создана семейная заявка"
                  : "Будет создана заявка туриста"}
              </strong>
              <small>
                Медиа-слоты создаются как загружено/не принято только после действия
                агента.
              </small>
            </div>
            <Button variant="primary" onClick={createSubmission}>
              Создать черновик
            </Button>
          </div>
        </section>
      </>
    );
  }

  function AdminOverview() {
    const queue = submissions.filter((submission) =>
      ["waiting_review", "in_review", "returned", "attention_required"].includes(
        submission.status,
      ),
    );
    const ready = submissions.filter((submission) =>
      ["accepted", "ready_for_excel"].includes(submission.status),
    );

    return (
      <>
        <PageHead
          kicker="Операции"
          title="Рабочий стол"
          subtitle="Все заявки, решения, выгрузка и запись."
          actions={
            <>
              <Button onClick={() => navigate("admin-export")}>Выгрузка</Button>
              <Button variant="primary" onClick={() => navigate("admin-queue")}>
                Очередь
              </Button>
            </>
          }
        />
        <Metrics
          items={[
            {
              label: "В очереди",
              value: countByStatus(submissions, "waiting_review"),
              hint: "новые на проверку",
            },
            {
              label: "На проверке",
              value: countByStatus(submissions, "in_review"),
              hint: "в работе",
            },
            {
              label: "Возвраты",
              value: countByStatus(submissions, "returned"),
              hint: "на стороне агента",
            },
            {
              label: "К выгрузке",
              value:
                countByStatus(submissions, "ready_for_excel") +
                countByStatus(submissions, "accepted"),
              hint: "Excel",
            },
            {
              label: "Запись",
              value: countWhere(submissions, (submission) =>
                [
                  "exported",
                  "sent_to_appointment",
                  "appointment_scheduled",
                  "attention_required",
                ].includes(submission.status),
              ),
              hint: "ручной статус",
            },
          ]}
        />
        <section>
          <div className="section-head">
            <div>
              <h2>Статусы</h2>
            </div>
          </div>
          <StatusRail
            source={submissions}
            active="all"
            onChange={(filter) => {
              setQueueFilter(filter);
              navigate("admin-queue");
            }}
          />
        </section>
        <section>
          <div className="section-head">
            <div>
              <h2>Очередь</h2>
            </div>
            <Button variant="ghost" onClick={() => navigate("admin-queue")}>
              Открыть
            </Button>
          </div>
          <div className="list">
            {queue.length ? (
              queue
                .slice(0, 5)
                .map((submission) => (
                  <QueueCard
                    key={submission.id}
                    submission={submission}
                    onOpen={openSubmission}
                    onNavigate={navigate}
                  />
                ))
            ) : (
              <EmptyState
                title="Очередь пуста"
                text="Новые заявки появятся после передачи оператору."
              />
            )}
          </div>
        </section>
        <section>
          <div className="section-head">
            <div>
              <h2>Выгрузка</h2>
            </div>
            <Button variant="ghost" onClick={() => navigate("admin-export")}>
              Excel
            </Button>
          </div>
          <MiniExportTable rows={ready} onOpen={openSubmission} />
        </section>
      </>
    );
  }

  function AdminQueue() {
    const filtered =
      queueFilter === "all"
        ? submissions
        : submissions.filter((submission) =>
            statusMatchesFilter(submission, queueFilter),
          );

    return (
      <>
        <PageHead
          kicker="Операции"
          title="Очередь"
          subtitle="Фильтр по статусу, агенту, стране и типу заявки."
        />
        <StatusRail
          source={submissions}
          active={queueFilter}
          onChange={setQueueFilter}
        />
        <section className="card">
          <div className="filters">
            <div className="field">
              <label htmlFor="agent-filter">Агент</label>
              <select id="agent-filter" defaultValue="Все агенты">
                <option>Все агенты</option>
                <option>Nord Travel</option>
                <option>Mira Travel</option>
                <option>Atlas Visa</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="country-filter">Страна</label>
              <select id="country-filter" defaultValue="Все страны">
                <option>Все страны</option>
                <option>Испания</option>
                <option>Италия</option>
                <option>Франция</option>
                <option>Германия</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="type-filter">Тип</label>
              <select id="type-filter" defaultValue="Все типы">
                <option>Все типы</option>
                <option>Заявитель</option>
                <option>Семья</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="priority-filter">Приоритет</label>
              <select id="priority-filter" defaultValue="Все">
                <option>Все</option>
                <option>Высокий</option>
                <option>Средний</option>
                <option>Низкий</option>
              </select>
            </div>
            <Button onClick={() => showToast("Фильтры применены локально")}>
              Применить
            </Button>
          </div>
          <div className="list">
            {filtered.length ? (
              filtered.map((submission) => (
                <QueueCard
                  key={submission.id}
                  submission={submission}
                  onOpen={openSubmission}
                  onNavigate={navigate}
                />
              ))
            ) : (
              <EmptyState title="Пусто" text="В выбранном статусе нет заявок." />
            )}
          </div>
        </section>
      </>
    );
  }

  function AdminExport() {
    const exportPlan = buildExportPlan(submissions);
    const exportGuard = buildExportGuard(submissions);

    return (
      <>
        <PageHead
          kicker="Операции"
          title="Выгрузка Excel"
          subtitle="Одна строка = один заявитель. Участники семьи идут подряд."
          actions={
            <>
              <Button
                onClick={() => downloadExport("csv")}
                disabled={!exportPlan.rows.length}
              >
                Скачать CSV
              </Button>
              <Button
                onClick={() => downloadExport("xlsx")}
                disabled={!exportPlan.rows.length}
              >
                Скачать XLSX
              </Button>
              <Button
                variant="primary"
                onClick={markExported}
                disabled={!exportPlan.rows.length}
              >
                Отметить выгруженными
              </Button>
            </>
          }
        />
        <Metrics
          items={[
            { label: "Строки", value: exportPlan.applicantRowCount, hint: "заявители" },
            {
              label: "Заявки",
              value: exportPlan.readySubmissions.length,
              hint: "без блокеров",
            },
            {
              label: "Семьи",
              value: exportPlan.familySubmissionCount,
              hint: "групповые",
            },
          ]}
        />
        <AiHelperPanel result={exportGuard} />
        <ExportPreviewTable
          rows={exportPlan.rows}
          onOpen={openSubmission}
          submissions={submissions}
        />
      </>
    );
  }

  function AdminAppointments() {
    const rows = submissions.filter((submission) =>
      [
        "exported",
        "sent_to_appointment",
        "appointment_scheduled",
        "attention_required",
        "completed",
      ].includes(submission.status),
    );

    return (
      <>
        <PageHead
          kicker="Операции"
          title="Запись"
          subtitle="Ручной статус после выгрузки."
        />
        <div className="list">
          {rows.length ? (
            rows.map((submission) => (
              <AppointmentCard
                key={submission.id}
                submission={submission}
                onOpen={openSubmission}
                onAppointmentChange={changeAppointment}
              />
            ))
          ) : (
            <EmptyState title="Нет записей" text="Строки появятся после выгрузки." />
          )}
        </div>
      </>
    );
  }

  function ReturnModal() {
    const submission = submissions.find((item) => item.id === returnModalId);
    const targetOptions =
      submission?.applicants.flatMap((applicant, index) => {
        const normalized = normalizeApplicant(applicant, index, submission);
        const applicantId = normalized.id ?? `${submission.id}-${index + 1}`;
        return [
          {
            value: `applicant::${applicantId}::${normalized.name}`,
            label: `Заявитель · ${normalized.name}`,
          },
          ...requiredApplicantFields.map((field) => ({
            value: `field::${applicantId}::${String(field.key)}::${field.label} · ${normalized.name}`,
            label: `Поле · ${field.label} · ${normalized.name}`,
          })),
          ...ensureMediaSlots(normalized).map((slot) => ({
            value: `media::${applicantId}::${slot.type}::${slot.label} · ${normalized.name}`,
            label: `Медиа · ${slot.label} · ${normalized.name}`,
          })),
        ];
      }) ?? [];

    return (
      <Modal
        open={Boolean(returnModalId && submission)}
        title="Вернуть заявку"
        subtitle={submission ? `${submission.id} · ${submission.title}` : undefined}
        onClose={() => setReturnModalId(null)}
      >
        <div className="field">
          <label htmlFor="return-target">Адрес замечания</label>
          <select
            id="return-target"
            value={returnTarget}
            onChange={(event) => setReturnTarget(event.target.value)}
          >
            <option value="submission::Анкета">Заявка · анкета</option>
            {targetOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="return-severity">Тип замечания</label>
          <select
            id="return-severity"
            value={returnSeverity}
            onChange={(event) =>
              setReturnSeverity(event.target.value === "note" ? "note" : "blocking")
            }
          >
            <option value="blocking">Блокирующее</option>
            <option value="note">Заметка</option>
          </select>
        </div>
        <div className="field">
          <div className="field-label-row">
            <label htmlFor="return-text">Комментарий</label>
            <Button variant="ghost" onClick={applyCorrectionDraft}>
              Черновик helper
            </Button>
          </div>
          <textarea
            id="return-text"
            value={returnText}
            onChange={(event) => setReturnText(event.target.value)}
          />
        </div>
        <Button variant="danger" onClick={submitReturn} disabled={!returnText.trim()}>
          Вернуть
        </Button>
      </Modal>
    );
  }

  function SubmitPreflightModal() {
    const submission = submissions.find((item) => item.id === preflightModalId);
    const preflight = submission ? submissionPreflight(submission) : null;

    return (
      <Modal
        open={Boolean(submission && preflight)}
        title="Проверка перед передачей"
        subtitle={submission ? `${submission.id} · ${submission.title}` : undefined}
        onClose={() => setPreflightModalId(null)}
      >
        {submission && preflight ? (
          <>
            <div className="preflight-summary">
              <div>
                <span>Готовность</span>
                <strong>{preflight.readiness}%</strong>
              </div>
              <div>
                <span>Загружено</span>
                <strong>
                  {preflight.media.uploaded}/{preflight.media.required}
                </strong>
              </div>
              <div>
                <span>Принято оператором</span>
                <strong>
                  {preflight.media.accepted}/{preflight.media.required}
                </strong>
              </div>
            </div>

            <div className="preflight-list" aria-label="Чеклист передачи оператору">
              {preflight.checklist.map((item) => (
                <div className="preflight-row" key={item.label}>
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <Chip tone={item.tone}>
                    {item.ok ? "Ок" : item.tone === "neutral" ? "Инфо" : "Блокер"}
                  </Chip>
                </div>
              ))}
            </div>

            {preflight.blockers.length ? (
              <div className="blocker-box">
                <strong>Что закрыть до передачи</strong>
                <ul>
                  {preflight.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {preflight.warnings.length ? (
              <div className="notice-box">
                {preflight.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}

            <div className="modal-actions">
              <Button onClick={() => setPreflightModalId(null)}>Закрыть</Button>
              {preflight.canSubmit ? (
                <Button variant="primary" onClick={confirmSubmitToOperator}>
                  Передать оператору
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </Modal>
    );
  }
}

export default App;
