import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, UsersRound, X } from "lucide-react";
import { ReviewScreen } from "./AdminScreens";
import { AdminExportScreen } from "./AdminExportScreen";
import { RemarkForm } from "./RemarkForm";
import { ReviewWorkspace } from "./ReviewWorkspace";
import {
  AppShell,
  PageHeader,
  PageHeaderMenuButton,
} from "../modules/submissions/components/AppShell";
import {
  OperationalSideMenu,
  operationalSideMenuId,
} from "../modules/submissions/components/OperationalSideMenu";
import type { AccessRequest } from "../shared/authContract";
import type {
  IssueInput,
  Submission,
  SubmissionAction,
  SubmissionFileType,
} from "../modules/submissions/types";
import { primaryApplicantIdForPassportReview } from "../modules/submissions/passportReviewContract";
import { isAdminReviewQueueSubmission } from "../modules/submissions/uiTypes";
import {
  emitVisaflowUiEvent,
  useVisaflowBusinessBridge,
  type AdminNavSection as BridgeAdminNavSection,
} from "../integration/visaflowBusinessBridge";

type AdminNavSection = BridgeAdminNavSection | "users";
type AdminViewState = "main" | "review_workspace";

interface AdminWorkspaceProps {
  accessRequests?: AccessRequest[];
  accessRequestsBusy?: boolean;
  currentEmail?: string;
  currentDisplayName?: string;
  onApproveAccessRequest?: (requestId: string) => void;
  onRejectAccessRequest?: (requestId: string) => void;
  onSignOut: () => void | Promise<void>;
  onSwitchWorkspace?: () => void;
  submissions?: Submission[];
  usesSupabase?: boolean;
}

export function AdminWorkspace({
  currentDisplayName = "",
  currentEmail = "",
  onSignOut,
  onSwitchWorkspace,
  submissions,
}: AdminWorkspaceProps) {
  const bridge = useVisaflowBusinessBridge();
  const [activeNav, setActiveNav] = useState<AdminNavSection>("review");
  const [currentView, setCurrentView] = useState<AdminViewState>("main");
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [reviewApplicantId, setReviewApplicantId] = useState<string>();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [remarkFormOpen, setRemarkFormOpen] = useState(false);
  const [adminAsyncError, setAdminAsyncError] = useState("");
  const [remarkContext, setRemarkContext] = useState<{
    applicantId?: string;
    applicant?: string;
    field?: string;
    fileType?: SubmissionFileType;
  }>({});
  const reviewReturnFocusRef = useRef<HTMLElement | null>(null);
  const mobileNavTriggerRef = useRef<HTMLElement | null>(null);
  const adminIssuePendingRef = useRef(false);
  const adminPassportApprovalPendingRef = useRef(false);
  const adminReviewActionPendingRef = useRef(false);
  const signOutPendingRef = useRef(false);

  const selectedSubmission =
    submissions?.find((submission) => submission.id === selectedRow) ?? null;
  const reviewQueueCount = (submissions ?? []).filter(
    isAdminReviewQueueSubmission,
  ).length;
  const exportQueueCount = (submissions ?? []).filter(
    (submission) => submission.status === "ready_for_export",
  ).length;
  const adminIdentity =
    currentDisplayName.trim() || currentEmail.trim() || "Администратор";
  const adminInitials =
    adminIdentity
      .split("@", 1)[0]
      ?.replace(/[^\p{L}\p{N}]+/gu, "")
      .slice(0, 2)
      .toUpperCase() || "АД";

  useEffect(() => {
    if (
      currentView !== "review_workspace" ||
      !selectedRow ||
      selectedSubmission
    ) {
      return;
    }

    setCurrentView("main");
    setSelectedRow(null);
    setReviewApplicantId(undefined);
    setRemarkFormOpen(false);
  }, [currentView, selectedRow, selectedSubmission]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileNavOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const panel = document.getElementById(operationalSideMenuId);
    const trigger = mobileNavTriggerRef.current;
    const frame = window.requestAnimationFrame(() => {
      panel
        ?.querySelector<HTMLButtonElement>('[aria-label="Закрыть меню администратора"]')
        ?.focus({ preventScroll: true });
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileNavOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((control) => control.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      trigger?.focus({ preventScroll: true });
    };
  }, [mobileNavOpen]);

  const handleOpenReviewDrawer = (submissionId: string) => {
    const submission = submissions?.find((item) => item.id === submissionId);
    reviewReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    bridge.onAdminReviewOpen?.(submissionId);
    bridge.onVerifyDocument?.(submissionId);
    emitVisaflowUiEvent(bridge, {
      type: "admin.review.open",
      submissionId,
    });
    emitVisaflowUiEvent(bridge, {
      type: "admin.document.verify",
      submissionId,
    });
    setAdminAsyncError("");
    setSelectedRow(submissionId);
    setReviewApplicantId(
      submission ? primaryApplicantIdForPassportReview(submission) : undefined,
    );
    setCurrentView("review_workspace");
  };

  const handleBackToQueue = () => {
    setCurrentView("main");
    window.requestAnimationFrame(() => {
      reviewReturnFocusRef.current?.focus({ preventScroll: true });
    });
  };

  const handleOpenRemark = (
    field?: string,
    applicant?: string,
    fileType?: SubmissionFileType,
    applicantId?: string,
  ) => {
    const payload = {
      applicant,
      applicantId,
      field,
      fileType,
      submissionId: selectedRow,
    };
    bridge.onRemarkOpen?.(payload);
    emitVisaflowUiEvent(bridge, { type: "remark.open", payload });
    setRemarkContext({ applicant, applicantId, field, fileType });
    setRemarkFormOpen(true);
  };

  const handleAddIssue = async (input: IssueInput): Promise<boolean> => {
    if (!selectedRow || adminIssuePendingRef.current) return false;
    if (!bridge.onAdminIssueAdd) {
      setAdminAsyncError("Добавление замечаний недоступно: сохранение не подключено.");
      return false;
    }

    const payload = { input, submissionId: selectedRow };
    setAdminAsyncError("");
    adminIssuePendingRef.current = true;
    try {
      await bridge.onAdminIssueAdd(payload);
      emitVisaflowUiEvent(bridge, { type: "admin.issue.add", payload });
      return true;
    } catch {
      setAdminAsyncError("Не удалось добавить замечание. Подача не была изменена.");
      return false;
    } finally {
      adminIssuePendingRef.current = false;
    }
  };

  const handlePassportSectionApprove = async (input: {
    applicantId: string;
  }): Promise<boolean> => {
    if (!selectedRow || adminPassportApprovalPendingRef.current) return false;
    if (!bridge.onAdminPassportSectionApprove) {
      setAdminAsyncError(
        "Подтверждение паспортной секции недоступно: сохранение не подключено.",
      );
      return false;
    }

    const payload = { submissionId: selectedRow, ...input };
    setAdminAsyncError("");
    adminPassportApprovalPendingRef.current = true;
    try {
      await bridge.onAdminPassportSectionApprove(payload);
      emitVisaflowUiEvent(bridge, {
        type: "admin.passport-section.approve",
        payload,
      });
      return true;
    } catch {
      setAdminAsyncError(
        "Не удалось подтвердить паспортную секцию. Состояние не изменено.",
      );
      return false;
    } finally {
      adminPassportApprovalPendingRef.current = false;
    }
  };

  const handleRemarkSubmit = async (input: {
    applicantId?: string;
    applicant?: string;
    field?: string;
    fileType?: SubmissionFileType;
    message: string;
    severity: "warning" | "critical";
  }): Promise<boolean> => {
    if (!selectedSubmission) return false;
    const applicant = input.applicantId
      ? selectedSubmission.applicants.find((item) => item.id === input.applicantId)
      : input.applicant
        ? selectedSubmission.applicants.find(
            (item) => item.fullName === input.applicant,
          )
        : selectedSubmission.applicants.length === 1
          ? selectedSubmission.applicants[0]
          : undefined;
    if (!applicant) return false;

    return handleAddIssue({
      applicantId: applicant.id,
      comment: input.message,
      field: input.fileType ? undefined : input.field,
      fileType: input.fileType,
      reason: input.fileType
        ? `Требуется заменить файл «${input.field ?? input.fileType}»`
        : input.field
          ? `Требуется исправить поле «${input.field}»`
          : "Требуется исправить паспортные данные",
      section: "Паспорт",
      severity: input.severity === "critical" ? "blocker" : "warning",
      type: input.fileType ? "file" : input.field ? "field" : "section",
    });
  };

  const handleSignOut = () => {
    if (signOutPendingRef.current) return;
    signOutPendingRef.current = true;
    setAdminAsyncError("");
    void Promise.resolve(onSignOut())
      .catch(() => {
        setAdminAsyncError("Не удалось выйти из аккаунта. Повторите попытку.");
      })
      .finally(() => {
        signOutPendingRef.current = false;
      });
  };

  const navigateTo = (nav: AdminNavSection) => {
    if (nav === "review" || nav === "export" || nav === "settings") {
      bridge.onAdminNavChange?.(nav);
      emitVisaflowUiEvent(bridge, { type: "admin.nav", section: nav });
    }
    setRemarkFormOpen(false);
    setCurrentView("main");
    setSelectedRow(null);
    setReviewApplicantId(undefined);
    setActiveNav(nav);
    setMobileNavOpen(false);
  };

  const handleReviewAction = async (action: SubmissionAction): Promise<boolean> => {
    if (!selectedRow || adminReviewActionPendingRef.current) return false;
    if (!bridge.onSubmissionAction) {
      setAdminAsyncError("Решение по подаче недоступно: сохранение не подключено.");
      return false;
    }

    const payload = {
      action,
      source: "admin" as const,
      submissionId: selectedRow,
    };
    setAdminAsyncError("");
    adminReviewActionPendingRef.current = true;
    try {
      await bridge.onSubmissionAction(payload);
      emitVisaflowUiEvent(bridge, {
        type: "submission.action",
        payload,
      });

      const acceptedForExport = action === "accept" || action === "close_issues_accept";
      setRemarkFormOpen(false);
      setCurrentView("main");
      setSelectedRow(null);
      setReviewApplicantId(undefined);
      navigateTo(acceptedForExport ? "export" : "review");
      return true;
    } catch {
      setAdminAsyncError(
        action === "accept" || action === "close_issues_accept"
          ? "Не удалось принять подачу. Состояние не изменено."
          : "Не удалось вернуть подачу. Состояние не изменено.",
      );
      return false;
    } finally {
      adminReviewActionPendingRef.current = false;
    }
  };

  const pageTitle =
    activeNav === "review"
      ? "Очередь на проверку"
      : activeNav === "export"
        ? "Центр выгрузки"
        : activeNav === "users"
          ? "Управление пользователями"
          : "Системные настройки";
  const sideMenuItems = [
    {
      active: activeNav === "review",
      count: reviewQueueCount,
      icon: "✓",
      id: "admin-review",
      label: "Проверка",
      meta: "Очередь проверки",
      onClick: () => navigateTo("review"),
    },
    {
      active: activeNav === "export",
      count: exportQueueCount,
      icon: "▤",
      id: "admin-export",
      label: "Выгрузка",
      meta: "Готовые пакеты",
      onClick: () => navigateTo("export"),
    },
    {
      active: activeNav === "users",
      icon: "●",
      id: "admin-users",
      label: "Пользователи",
      meta: "Роли и доступ",
      onClick: () => navigateTo("users"),
    },
    {
      active: activeNav === "settings",
      icon: "⚙",
      id: "admin-settings",
      label: "Настройки",
      meta: "Правила системы",
      onClick: () => navigateTo("settings"),
    },
  ];
  const surface =
    activeNav === "review"
      ? "admin-review"
      : activeNav === "export"
        ? "export"
        : activeNav === "users"
          ? "admin-users"
          : "settings";

  return (
    <div className="has-persistent-operational-sidebar relative h-full w-full overflow-hidden bg-[#101011]">
      {adminAsyncError ? (
        <div
          className="fixed left-1/2 top-3 z-[90] flex w-[min(92vw,560px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-red-500/30 bg-[#211416] px-4 py-3 text-[13px] text-white shadow-2xl"
          role="alert"
        >
          <span className="min-w-0 flex-1">{adminAsyncError}</span>
          <button
            aria-label="Закрыть сообщение об ошибке"
            onClick={() => setAdminAsyncError("")}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {currentView === "review_workspace" && selectedRow && selectedSubmission ? (
        <ReviewWorkspace
          applicantId={reviewApplicantId}
          nestedDialogOpen={remarkFormOpen}
          onAddRemark={handleOpenRemark}
          onApplicantChange={setReviewApplicantId}
          onApproveSection={handlePassportSectionApprove}
          onReviewAction={handleReviewAction}
          onBack={handleBackToQueue}
          submission={selectedSubmission}
          submissionId={selectedRow}
        />
      ) : null}

      <RemarkForm
        defaultApplicant={remarkContext.applicant}
        defaultApplicantId={remarkContext.applicantId}
        defaultField={remarkContext.field}
        defaultFileType={remarkContext.fileType}
        isOpen={remarkFormOpen}
        onClose={() => setRemarkFormOpen(false)}
        onSubmit={handleRemarkSubmit}
        submissionId={selectedRow ?? ""}
      />

      <div className="contents">
        <AppShell
          collectionSurface={activeNav === "review" || activeNav === "export"}
          drawerOpen={currentView === "review_workspace"}
          header={
            <PageHeader
              actions={
                <div className="ml-auto flex items-center gap-2">
                  <div
                    aria-label={adminIdentity}
                    className="v19-admin-header-identity w-8 h-8 rounded-full bg-gradient-to-br from-[#2a2a30] to-[#1a1a20] border border-white/10 flex items-center justify-center text-xs font-medium text-white/70 shadow-inner"
                    title={adminIdentity}
                  >
                    {adminInitials}
                  </div>
                </div>
              }
              menuButton={
                <PageHeaderMenuButton
                  closedLabel="Открыть меню администратора"
                  controls={operationalSideMenuId}
                  onClick={(event) => {
                    mobileNavTriggerRef.current = event.currentTarget;
                    setMobileNavOpen((open) => !open);
                  }}
                  open={mobileNavOpen}
                  openLabel="Закрыть меню администратора"
                />
              }
              title={pageTitle}
            />
          }
          label="Рабочая область администратора"
          mobileNavOpen={mobileNavOpen}
          role="admin"
          sidebar={
            <OperationalSideMenu
              ariaLabel="Меню администратора"
              displayMode="regular"
              items={sideMenuItems}
              mobileCloseLabel="Закрыть меню администратора"
              mobileOpen={mobileNavOpen}
              mobileTitle={pageTitle}
              onChooseRole={() => onSwitchWorkspace?.()}
              onCloseMobile={() => setMobileNavOpen(false)}
              onResetWorkspace={handleSignOut}
              role="admin"
              sessionDisplayName={adminIdentity}
              sessionInitials={adminInitials}
              sessionRoleLabel="Администратор"
              showWorkspaceSwitch={Boolean(onSwitchWorkspace)}
            />
          }
          sideMenuMode="regular"
          surface={surface}
          workspaceInactive={currentView === "review_workspace"}
        >
          <div className="flex-1 overflow-auto p-4 lg:p-6 pb-[max(24px,env(safe-area-inset-bottom))]">
            <div className="max-w-[1460px] mx-auto h-full">
              {activeNav === "review" ? (
                <ReviewScreen
                  onOpenDrawer={handleOpenReviewDrawer}
                  onOpenExport={() => navigateTo("export")}
                  submissions={submissions}
                />
              ) : null}
              {activeNav === "export" ? (
                <AdminExportScreen submissions={submissions} />
              ) : null}
              {activeNav === "users" ? (
                <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-[#242529] rounded-2xl bg-[#161617]">
                  <UsersRound className="w-10 h-10 text-white/20 mb-4" />
                  <h3 className="text-white font-medium">Пользователи</h3>
                  <p className="text-[13px] text-white/50 mt-1">
                    Управление ролями и доступом
                  </p>
                </div>
              ) : null}
              {activeNav === "settings" ? (
                <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-[#242529] rounded-2xl bg-[#161617]">
                  <SlidersHorizontal className="w-10 h-10 text-white/20 mb-4" />
                  <h3 className="text-white font-medium">Настройки системы</h3>
                  <p className="text-[13px] text-white/50 mt-1">
                    Управление справочниками и правилами экспорта
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </AppShell>
      </div>
    </div>
  );
}
