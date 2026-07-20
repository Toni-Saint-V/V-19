import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeftRight,
  FileSpreadsheet,
  LogOut,
  Menu,
  ScanSearch,
  SlidersHorizontal,
  UsersRound,
  X,
} from "lucide-react";
import { ReviewScreen } from "./AdminScreens";
import { AdminExportScreen } from "./AdminExportScreen";
import { RemarkForm } from "./RemarkForm";
import { ReviewWorkspace } from "./ReviewWorkspace";
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
  const mobileNavPanelRef = useRef<HTMLElement | null>(null);
  const mobileNavTriggerRef = useRef<HTMLButtonElement | null>(null);
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
  const adminIdentity = currentDisplayName.trim() || currentEmail.trim() || "Администратор";
  const adminInitials =
    adminIdentity
      .split("@", 1)[0]
      ?.replace(/[^\p{L}\p{N}]+/gu, "")
      .slice(0, 2)
      .toUpperCase() || "АД";

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileNavOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const panel = mobileNavPanelRef.current;
    const trigger = mobileNavTriggerRef.current;
    const frame = window.requestAnimationFrame(() => {
      panel
        ?.querySelector<HTMLButtonElement>(
          '[aria-label="Закрыть меню администратора"]',
        )
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
      setAdminAsyncError(
        "Добавление замечаний недоступно: сохранение не подключено.",
      );
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
      setAdminAsyncError(
        "Не удалось добавить замечание. Подача не была изменена.",
      );
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
    setActiveNav(nav);
    setMobileNavOpen(false);
  };

  const handleReviewAction = async (
    action: SubmissionAction,
  ): Promise<boolean> => {
    if (!selectedRow || adminReviewActionPendingRef.current) return false;
    if (!bridge.onSubmissionAction) {
      setAdminAsyncError(
        "Решение по подаче недоступно: сохранение не подключено.",
      );
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

      const acceptedForExport =
        action === "accept" || action === "close_issues_accept";
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

  const renderNavContent = () => (
    <>
      <div className="flex items-center gap-2.5 px-2 pb-4 mb-2 border-b border-[#242529]">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--v19b-color-border-strong)] bg-[var(--v19b-color-control)] text-sm font-bold text-[var(--v19b-color-primary-text)] shadow-[var(--v19b-shadow-row-inner)]">
          A
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold tracking-tight">VisaFlow V-19</div>
          <div className="text-[11px] font-medium text-[var(--v19b-color-text-muted)]">Admin Zone</div>
        </div>
        <button
          aria-label="Закрыть меню администратора"
          onClick={() => setMobileNavOpen(false)}
          className="md:hidden p-2 text-white/50 hover:text-white"
          type="button"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-4 space-y-5 scrollbar-hide">
        <nav className="space-y-0.5" aria-label="Очередь администратора">
          <div className="px-2 pb-1 text-[11px] text-white/40 font-medium tracking-wide uppercase">
            Очередь
          </div>
          <button
            aria-label="Проверка"
            onClick={() => navigateTo("review")}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19b-color-focus)] ${activeNav === "review" ? "bg-[#27272b] text-white border border-[#2e2f34]" : "hover:bg-white/5 text-white/70 hover:text-white border border-transparent"}`}
            type="button"
          >
            <ScanSearch className="h-4 w-4 text-[var(--v19b-color-primary-text)]" />
            <span className="flex-1 text-left">Проверка</span>
            <span className="rounded-md border border-[var(--v19b-color-border-strong)] bg-[var(--v19b-color-control)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--v19b-color-text-muted)]">
              {reviewQueueCount}
            </span>
          </button>
          <button
            aria-label="Выгрузка"
            onClick={() => navigateTo("export")}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19b-color-focus)] ${activeNav === "export" ? "bg-[#27272b] text-white border border-[#2e2f34]" : "hover:bg-white/5 text-white/70 hover:text-white border border-transparent"}`}
            type="button"
          >
            <FileSpreadsheet className="h-4 w-4 text-[var(--v19b-color-primary-text)]" />
            <span className="flex-1 text-left">Выгрузка</span>
            <span className="rounded-md border border-[var(--v19b-color-border-strong)] bg-[var(--v19b-color-control)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--v19b-color-text-muted)]">
              {exportQueueCount}
            </span>
          </button>
        </nav>

        <nav className="space-y-0.5" aria-label="Система администратора">
          <div className="px-2 pb-1 text-[11px] text-white/40 font-medium tracking-wide uppercase">
            Система
          </div>
          <button
            onClick={() => navigateTo("users")}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19b-color-focus)] ${activeNav === "users" ? "bg-[#27272b] text-white border border-[#2e2f34]" : "hover:bg-white/5 text-white/70 hover:text-white border border-transparent"}`}
            type="button"
          >
            <UsersRound className="w-4 h-4" />
            <span className="flex-1 text-left">Пользователи</span>
          </button>
          <button
            onClick={() => navigateTo("settings")}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19b-color-focus)] ${activeNav === "settings" ? "bg-[#27272b] text-white border border-[#2e2f34]" : "hover:bg-white/5 text-white/70 hover:text-white border border-transparent"}`}
            type="button"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="flex-1 text-left">Настройки</span>
          </button>
        </nav>
      </div>

      <div className="mt-auto border-t border-[#202124] p-3 mx-2 space-y-2">
        {onSwitchWorkspace ? (
          <button
            onClick={onSwitchWorkspace}
            className="w-full h-10 px-3 bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] rounded-xl text-[13px] font-medium text-white transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19-depth-focus)]"
            type="button"
          >
            <ArrowLeftRight className="w-4 h-4 text-white/50" />
            В агентскую зону
          </button>
        ) : null}
        <button
          onClick={handleSignOut}
          className="w-full h-10 px-3 text-[13px] font-medium text-white/60 hover:text-white transition-colors flex items-center justify-center gap-2"
          type="button"
        >
          <LogOut className="w-4 h-4" />
          Выйти
        </button>
      </div>
    </>
  );

  const pageTitle =
    activeNav === "review"
      ? "Очередь на проверку"
      : activeNav === "export"
        ? "Центр выгрузки"
        : activeNav === "users"
          ? "Управление пользователями"
          : "Системные настройки";

  return (
    <div className="flex h-full w-full bg-[#101011] relative overflow-hidden">
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

      {currentView === "review_workspace" && selectedRow ? (
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

      <AnimatePresence>
        {mobileNavOpen ? (
          <div className="md:hidden">
            <motion.div
              animate={{ opacity: 1 }}
              aria-hidden="true"
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              onClick={() => setMobileNavOpen(false)}
            />
            <motion.aside
              animate={{ x: 0 }}
              aria-label="Меню администратора"
              aria-modal="true"
              className="fixed inset-y-0 left-0 w-[280px] bg-[#161617] border-r border-[#202124] z-50 flex flex-col py-3 shadow-[0_0_40px_rgba(0,0,0,0.5)]"
              exit={{ x: "-100%" }}
              id="admin-mobile-navigation"
              initial={{ x: "-100%" }}
              ref={mobileNavPanelRef}
              role="dialog"
              transition={{ damping: 25, stiffness: 250, type: "spring" }}
            >
              {renderNavContent()}
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>

      <aside
        aria-hidden={currentView === "review_workspace" ? "true" : undefined}
        className="hidden md:flex w-[260px] shrink-0 bg-[#161617] border-r border-[#202124] flex-col py-3 z-20"
        inert={currentView === "review_workspace" ? true : undefined}
      >
        {renderNavContent()}
      </aside>

      <main
        aria-hidden={currentView === "review_workspace" ? "true" : undefined}
        className="flex-1 min-w-0 flex flex-col bg-[#141416]"
        inert={currentView === "review_workspace" ? true : undefined}
      >
        <header className="h-[60px] lg:h-16 shrink-0 border-b border-[#202124] flex items-center px-4 lg:px-6 gap-4 bg-[#141416] z-10 sticky top-0">
          <div className="flex items-center gap-3">
            <button
              aria-controls="admin-mobile-navigation"
              aria-expanded={mobileNavOpen}
              aria-label="Открыть меню администратора"
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden w-10 h-10 -ml-2 rounded-lg hover:bg-white/5 flex items-center justify-center text-white/70"
              ref={mobileNavTriggerRef}
              type="button"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-[19px] lg:text-[21px] font-semibold tracking-tight text-white m-0 leading-none">
              {pageTitle}
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div
              aria-label={adminIdentity}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-[#2a2a30] to-[#1a1a20] border border-white/10 flex items-center justify-center text-xs font-medium text-white/70 shadow-inner"
              title={adminIdentity}
            >
              {adminInitials}
            </div>
          </div>
        </header>

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
      </main>
    </div>
  );
}
