import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  acceptAiSuggestionAsIssue,
  dismissAiSuggestion,
  runAiReview,
} from "./modules/submissions/aiSuggestions";
import { exportSummary } from "./modules/submissions/exportRules";
import { loadSubmissions, saveSubmissions } from "./modules/submissions/persistence";
import {
  agentQueue,
  counts,
  exportedHistory,
  highestPriorityFirst,
  readyForExport,
  reviewQueue,
  searchSubmissions,
} from "./modules/submissions/selectors";
import {
  addPreciseAdminIssue,
  applyActionToSubmissionList,
  applyExportStateToSelection,
  createDraftSubmission,
  markSelectedExported,
  updateQuestionnaireField,
  uploadRequiredFile,
} from "./modules/submissions/submissionActions";
import { canAddAdminIssue, defaultDrawerTab } from "./modules/submissions/status";
import { CreateSubmissionDrawer } from "./modules/submissions/components/CreateSubmissionDrawer";
import { ConfirmationDialog } from "./modules/submissions/components/Primitives";
import { SubmissionDrawer } from "./modules/submissions/components/SubmissionDrawer";
import {
  AdminReviewScreen,
  AgentSubmissionsScreen,
  ExportScreen,
} from "./modules/submissions/pages/OperationsScreens";
import type {
  City,
  DrawerTab,
  IssueInput,
  Role,
  Submission,
  SubmissionAction,
  Surface,
  QuestionnaireField,
} from "./modules/submissions/types";
import {
  type AgentTab,
  type CreateStep,
  type DrawerMode,
  type ExportTab,
  matchesAgentTab,
  matchesReviewTab,
  type ReviewTab,
  surfaceTitle,
} from "./modules/submissions/uiTypes";

const cities: Array<City | "Все города"> = [
  "Все города",
  "Москва",
  "Санкт-Петербург",
  "Казань",
];
const workspaceEmailStorageKey = "visaflow.workspaceEmail.v1";
const fallbackAdminEmails = ["admin@visaflow.local"];
const fallbackAgentEmails = ["agent@visaflow.local"];

type IssueComposerRequest = {
  submissionId: string;
  token: number;
};

function parseWorkspaceEmails(input: unknown, fallback: string[]) {
  if (typeof input !== "string" || input.trim() === "") return fallback;
  const parsed = input
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

const adminEmails = parseWorkspaceEmails(
  import.meta.env.VITE_ADMIN_EMAILS,
  fallbackAdminEmails,
);
const agentEmails = parseWorkspaceEmails(
  import.meta.env.VITE_AGENT_EMAILS,
  fallbackAgentEmails,
);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function resolveWorkspaceRole(email: string): Role | null {
  const normalized = normalizeEmail(email);
  if (adminEmails.includes(normalized)) return "admin";
  if (agentEmails.includes(normalized)) return "agent";
  return null;
}

function loadWorkspaceEmail() {
  try {
    return localStorage.getItem(workspaceEmailStorageKey) ?? "";
  } catch {
    return "";
  }
}

function saveWorkspaceEmail(email: string) {
  try {
    localStorage.setItem(workspaceEmailStorageKey, email);
  } catch {
    // Хранилище может быть недоступно в приватном режиме.
  }
}

function clearWorkspaceEmail() {
  try {
    localStorage.removeItem(workspaceEmailStorageKey);
  } catch {
    // Хранилище может быть недоступно в приватном режиме.
  }
}

function normalizeCreateApplicantNames(names: string[], count: number) {
  const fallbacks = [
    "Новый заявитель",
    "Супруг",
    "Ребёнок 1",
    "Ребёнок 2",
    "Ребёнок 3",
    "Ребёнок 4",
  ];

  return Array.from(
    { length: count },
    (_, index) => names[index] ?? fallbacks[index] ?? `Заявитель ${index + 1}`,
  );
}

function App() {
  const [workspaceEmail, setWorkspaceEmail] = useState(loadWorkspaceEmail);
  const initialWorkspaceRole = resolveWorkspaceRole(workspaceEmail) ?? "agent";
  const [role, setRole] = useState<Role>(initialWorkspaceRole);
  const [workspaceEmailDraft, setWorkspaceEmailDraft] = useState(workspaceEmail);
  const [workspaceAccessError, setWorkspaceAccessError] = useState("");
  const [surface, setSurface] = useState<Surface>(
    initialWorkspaceRole === "admin" ? "admin-review" : "agent-submissions",
  );
  const [submissions, setSubmissions] = useState<Submission[]>(() => loadSubmissions());
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(
    () => loadSubmissions()[0].id,
  );
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("closed");
  const [activeDrawerTab, setActiveDrawerTab] = useState<DrawerTab>(
    defaultDrawerTab(loadSubmissions()[0]),
  );
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState<City | "Все города">("Все города");
  const [agentTab, setAgentTab] = useState<AgentTab>("action");
  const [reviewTab, setReviewTab] = useState<ReviewTab>("review");
  const [exportTab, setExportTab] = useState<ExportTab>("ready");
  const [selectedExportIds, setSelectedExportIds] = useState<string[]>(["ПД-1056"]);
  const [issueComposerRequest, setIssueComposerRequest] =
    useState<IssueComposerRequest | null>(null);
  const [createStep, setCreateStep] = useState<CreateStep>("params");
  const [createType, setCreateType] = useState<Submission["type"]>("single");
  const [createCity, setCreateCity] = useState<City>("Москва");
  const [createFamilyCount, setCreateFamilyCount] = useState(2);
  const [createApplicantNames, setCreateApplicantNames] = useState<string[]>([
    "Новый заявитель",
    "Супруг",
    "Ребёнок 1",
    "Ребёнок 2",
  ]);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const activeSubmission =
    submissions.find((submission) => submission.id === selectedSubmissionId) ??
    submissions[0];
  const summary = counts(submissions);

  const searchedAgentQueue = useMemo(
    () => searchSubmissions(agentQueue(submissions), query, cityFilter),
    [cityFilter, query, submissions],
  );
  const searchedReviewQueue = useMemo(
    () => searchSubmissions(reviewQueue(submissions), query, cityFilter),
    [cityFilter, query, submissions],
  );
  const agentList = highestPriorityFirst(
    searchedAgentQueue.filter(matchesAgentTab(agentTab)),
  );
  const reviewList = highestPriorityFirst(
    searchedReviewQueue.filter(matchesReviewTab(reviewTab)),
  );
  const searchedExportSubmissions = useMemo(
    () => searchSubmissions(submissions, query, cityFilter),
    [cityFilter, query, submissions],
  );
  const readyList = readyForExport(searchedExportSubmissions);
  const historyList = exportedHistory(searchedExportSubmissions);
  const selectedForExport = readyList.filter((submission) =>
    selectedExportIds.includes(submission.id),
  );
  const selectedVisibleExportIds = selectedForExport.map((submission) => submission.id);
  const exportPlan = exportSummary(selectedForExport);
  const showRoleSwitcher =
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_ROLE_SWITCH === "true";
  const resolvedWorkspaceRole = resolveWorkspaceRole(workspaceEmail);
  const hasWorkspaceAccess = showRoleSwitcher || Boolean(resolvedWorkspaceRole);

  useEffect(() => {
    saveSubmissions(submissions);
  }, [submissions]);

  useEffect(() => {
    const readyIds = new Set(readyList.map((submission) => submission.id));
    setSelectedExportIds((current) => {
      const next = current.filter((id) => readyIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [readyList]);

  useEffect(() => {
    if (drawerMode !== "closed" || confirmClose) return;

    const node = returnFocusRef.current;
    returnFocusRef.current = null;
    if (!node || !document.contains(node)) return;

    requestAnimationFrame(() => {
      node.focus({ preventScroll: true });
    });
  }, [confirmClose, drawerMode]);

  function rememberReturnFocus() {
    const activeElement = document.activeElement;
    returnFocusRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;
  }

  function focusActiveDrawerTab() {
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          ".submission-drawer [role='tab'][aria-selected='true']",
        )
        ?.focus({ preventScroll: true });
    });
  }

  function chooseRole(nextRole: Role) {
    setRole(nextRole);
    setDrawerMode("closed");
    setDirty(false);
    if (nextRole === "agent") {
      setSurface("agent-submissions");
      setSelectedSubmissionId(submissions[0].id);
    } else {
      setSurface("admin-review");
      const firstReview = reviewQueue(submissions)[0] ?? submissions[0];
      setSelectedSubmissionId(firstReview.id);
    }
  }

  function openSubmission(submission: Submission, tab = defaultDrawerTab(submission)) {
    rememberReturnFocus();
    setSelectedSubmissionId(submission.id);
    setActiveDrawerTab(tab);
    setDrawerMode("detail");
  }

  function selectSubmission(submission: Submission) {
    setSelectedSubmissionId(submission.id);
    setActiveDrawerTab(defaultDrawerTab(submission));
  }

  function closeDrawer() {
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    setDrawerMode("closed");
  }

  function updateActiveSubmission(transform: (submission: Submission) => Submission) {
    setSubmissions((current) =>
      current.map((submission) =>
        submission.id === activeSubmission.id ? transform(submission) : submission,
      ),
    );
  }

  function updateSubmission(action: SubmissionAction) {
    const nextSubmissions = applyActionToSubmissionList(
      submissions,
      activeSubmission.id,
      action,
      role,
    );
    setSubmissions(nextSubmissions);
    const updated = nextSubmissions.find(
      (submission) => submission.id === activeSubmission.id,
    );
    if (updated) setActiveDrawerTab(defaultDrawerTab(updated));
  }

  function openIssueComposer(submission: Submission) {
    if (!canAddAdminIssue(submission, "admin")) {
      openSubmission(submission, "issues");
      return;
    }
    rememberReturnFocus();
    setSelectedSubmissionId(submission.id);
    setActiveDrawerTab("issues");
    setDrawerMode("detail");
    setIssueComposerRequest((current) => ({
      submissionId: submission.id,
      token: (current?.token ?? 0) + 1,
    }));
  }

  function addAdminIssue(input: IssueInput) {
    updateActiveSubmission((submission) => addPreciseAdminIssue(submission, input));
    setActiveDrawerTab("issues");
    setDrawerMode("detail");
  }

  function uploadActiveFile(fileId: string) {
    updateActiveSubmission((submission) => uploadRequiredFile(submission, fileId));
    setActiveDrawerTab("files");
  }

  function updateActiveQuestionnaireField(input: {
    applicantId: string;
    sectionId: string;
    fieldId: QuestionnaireField["id"];
    value: string;
  }) {
    updateActiveSubmission((submission) => updateQuestionnaireField(submission, input));
  }

  function runAiReviewForActiveSubmission() {
    updateActiveSubmission(runAiReview);
  }

  function acceptAiSuggestionForActiveSubmission(suggestionId: string) {
    updateActiveSubmission((submission) =>
      acceptAiSuggestionAsIssue(submission, suggestionId, role),
    );
    setActiveDrawerTab("issues");
  }

  function dismissAiSuggestionForActiveSubmission(suggestionId: string) {
    updateActiveSubmission((submission) =>
      dismissAiSuggestion(submission, suggestionId, role),
    );
  }

  function createDraft() {
    const newSubmission = createDraftSubmission({
      applicantNames: createApplicantNames,
      city: createCity,
      familyCount: createFamilyCount,
      submissions,
      type: createType,
    });
    setSubmissions((current) => [newSubmission, ...current]);
    setSelectedSubmissionId(newSubmission.id);
    setDrawerMode("detail");
    setActiveDrawerTab("overview");
    setDirty(false);
  }

  function toggleExportSelection(id: string) {
    setSelectedExportIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function generateExport() {
    if (!exportPlan.canGenerate) return;
    setSubmissions((current) =>
      applyExportStateToSelection(current, selectedVisibleExportIds, "file_generated"),
    );
  }

  function downloadExport() {
    if (!exportPlan.canDownload) return;
    setSubmissions((current) =>
      applyExportStateToSelection(current, selectedVisibleExportIds, "file_downloaded"),
    );
  }

  function markExported() {
    if (!exportPlan.canMarkExported) return;
    setSubmissions((current) =>
      markSelectedExported(current, selectedVisibleExportIds),
    );
    setSelectedExportIds([]);
  }

  function submitWorkspaceEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = normalizeEmail(workspaceEmailDraft);
    const nextRole = resolveWorkspaceRole(email);

    if (!email || !nextRole) {
      setWorkspaceAccessError("Почта не найдена в списке доступа.");
      return;
    }

    setWorkspaceAccessError("");
    setWorkspaceEmail(email);
    saveWorkspaceEmail(email);
    chooseRole(nextRole);
  }

  function resetWorkspaceEmail() {
    clearWorkspaceEmail();
    setWorkspaceEmail("");
    setWorkspaceEmailDraft("");
    setWorkspaceAccessError("");
    chooseRole("agent");
  }

  const searchControl = (
    <label className="search panel-search">
      <span aria-hidden="true">⌕</span>
      <input
        aria-label="Поиск в текущем списке"
        placeholder="имя, номер, заявитель, статус"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
    </label>
  );

  if (!hasWorkspaceAccess) {
    return (
      <WorkspaceAccessGate
        email={workspaceEmailDraft}
        error={workspaceAccessError}
        onEmail={setWorkspaceEmailDraft}
        onSubmit={submitWorkspaceEmail}
      />
    );
  }

  return (
    <main className="ops-shell" aria-label="Рабочая область подач">
      <aside className="left-rail" aria-label="Основная навигация">
        <div className="rail-mark" aria-hidden="true">
          П
        </div>
        <nav className="rail-nav" aria-label="Навигация">
          {role === "agent" ? (
            <>
              <button
                className="rail-item is-active"
                type="button"
                aria-current="page"
                onClick={() => setSurface("agent-submissions")}
              >
                <span className="rail-icon" aria-hidden="true">
                  П
                </span>
                <span>Мои подачи</span>
              </button>
              <button
                className="rail-item rail-create"
                type="button"
                aria-label="Новая подача"
                onClick={() => {
                  rememberReturnFocus();
                  setDrawerMode("create");
                  setCreateStep("params");
                  setCreateType("single");
                  setCreateFamilyCount(2);
                  setCreateApplicantNames([
                    "Новый заявитель",
                    "Супруг",
                    "Ребёнок 1",
                    "Ребёнок 2",
                  ]);
                  setDirty(false);
                }}
              >
                <span className="rail-icon" aria-hidden="true">
                  +
                </span>
              </button>
            </>
          ) : (
            <>
              <button
                className={`rail-item ${surface === "admin-review" ? "is-active" : ""}`}
                type="button"
                aria-current={surface === "admin-review" ? "page" : undefined}
                onClick={() => setSurface("admin-review")}
              >
                <span className="rail-icon" aria-hidden="true">
                  П
                </span>
                <span>Проверка</span>
              </button>
              <button
                className={`rail-item ${surface === "export" ? "is-active" : ""}`}
                type="button"
                aria-current={surface === "export" ? "page" : undefined}
                onClick={() => setSurface("export")}
              >
                <span className="rail-icon" aria-hidden="true">
                  Э
                </span>
                <span>Выгрузка</span>
              </button>
            </>
          )}
        </nav>
        {showRoleSwitcher ? (
          <button
            className="rail-user"
            type="button"
            aria-label="Сменить роль"
            onClick={() => chooseRole(role === "agent" ? "admin" : "agent")}
          >
            <span>{role === "agent" ? "АГ" : "АД"}</span>
            <small>Демо</small>
          </button>
        ) : (
          <button
            className="rail-user"
            type="button"
            aria-label="Сменить служебную почту"
            onClick={resetWorkspaceEmail}
          >
            <span>{role === "agent" ? "АГ" : "АД"}</span>
            <small>Почта</small>
          </button>
        )}
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="kicker">
              {role === "agent"
                ? "Рабочее место агента"
                : "Рабочее место администратора"}
            </p>
            <h1>{surfaceTitle(surface)}</h1>
          </div>
          <div className="topbar-actions">
            <select
              className="select-control"
              aria-label="Фильтр по городу"
              value={cityFilter}
              onChange={(event) =>
                setCityFilter(event.target.value as City | "Все города")
              }
            >
              {cities.map((city) => (
                <option key={city}>{city}</option>
              ))}
            </select>
            <div className="service-logo" aria-label="Версия девятнадцать">
              <span aria-hidden="true">В</span>
              <strong>19</strong>
            </div>
          </div>
        </header>

        {surface === "agent-submissions" ? (
          <AgentSubmissionsScreen
            activeSubmission={activeSubmission}
            agentList={agentList}
            agentTab={agentTab}
            onOpen={openSubmission}
            onSelect={selectSubmission}
            onTab={setAgentTab}
            searchControl={searchControl}
            summary={summary}
          />
        ) : null}

        {surface === "admin-review" ? (
          <AdminReviewScreen
            activeSubmission={activeSubmission}
            onAddIssue={() => openIssueComposer(activeSubmission)}
            onOpen={openSubmission}
            onSelect={selectSubmission}
            onTab={setReviewTab}
            reviewList={reviewList}
            reviewTab={reviewTab}
            searchControl={searchControl}
            summary={summary}
          />
        ) : null}

        {surface === "export" ? (
          <ExportScreen
            exportPlan={exportPlan}
            exportTab={exportTab}
            historyList={historyList}
            onDownload={downloadExport}
            onGenerate={generateExport}
            onMarkExported={markExported}
            onOpen={openSubmission}
            onTab={setExportTab}
            onToggle={toggleExportSelection}
            readyList={readyList}
            searchControl={searchControl}
            selectedExportIds={selectedVisibleExportIds}
          />
        ) : null}
      </section>

      {drawerMode === "detail" ? (
        <SubmissionDrawer
          activeTab={activeDrawerTab}
          issueComposerRequest={issueComposerRequest}
          onIssueComposerConsumed={() => setIssueComposerRequest(null)}
          onAction={updateSubmission}
          onAddIssue={addAdminIssue}
          onAcceptAiSuggestion={acceptAiSuggestionForActiveSubmission}
          onClose={closeDrawer}
          onDismissAiSuggestion={dismissAiSuggestionForActiveSubmission}
          onRunAiReview={runAiReviewForActiveSubmission}
          onTab={setActiveDrawerTab}
          onQuestionnaireField={updateActiveQuestionnaireField}
          onUploadFile={uploadActiveFile}
          role={role}
          surface={
            surface === "export"
              ? "export"
              : surface === "admin-review"
                ? "review"
                : "agent"
          }
          submission={activeSubmission}
        />
      ) : null}

      {drawerMode === "create" ? (
        <CreateSubmissionDrawer
          city={createCity}
          applicantNames={createApplicantNames}
          dirty={dirty}
          familyCount={createFamilyCount}
          onCity={(city) => {
            setCreateCity(city);
            setDirty(true);
          }}
          onClose={closeDrawer}
          onCreate={createDraft}
          onFamilyCount={(count) => {
            const safeCount = Math.max(2, Math.min(6, count || 2));
            setCreateFamilyCount(safeCount);
            setCreateApplicantNames((current) =>
              normalizeCreateApplicantNames(current, safeCount),
            );
            setDirty(true);
          }}
          onApplicantName={(index, name) => {
            setCreateApplicantNames((current) => {
              const next = normalizeCreateApplicantNames(current, createFamilyCount);
              next[index] = name;
              return next;
            });
            setDirty(true);
          }}
          onStep={setCreateStep}
          onType={(type) => {
            setCreateType(type);
            if (type === "single") {
              setCreateFamilyCount(2);
              setCreateApplicantNames((current) =>
                normalizeCreateApplicantNames(current, 1),
              );
            } else {
              setCreateApplicantNames((current) =>
                normalizeCreateApplicantNames(current, createFamilyCount),
              );
            }
            setDirty(true);
          }}
          step={createStep}
          type={createType}
        />
      ) : null}

      {confirmClose ? (
        <ConfirmationDialog
          onCancel={() => {
            setConfirmClose(false);
            focusActiveDrawerTab();
          }}
          onConfirm={() => {
            setConfirmClose(false);
            setDirty(false);
            setDrawerMode("closed");
          }}
        />
      ) : null}
    </main>
  );
}

function WorkspaceAccessGate({
  email,
  error,
  onEmail,
  onSubmit,
}: {
  email: string;
  error: string;
  onEmail: (email: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="access-shell" aria-label="Служебный вход">
      <section className="access-card">
        <p className="kicker">Служебный вход</p>
        <h1>Войдите по заранее созданной почте</h1>
        <p>
          Администратор попадает в проверку и выгрузку. Агент попадает в свои подачи.
        </p>
        <form onSubmit={onSubmit}>
          <label>
            <span>Почта</span>
            <input
              autoComplete="email"
              inputMode="email"
              placeholder="admin@visaflow.local"
              type="email"
              value={email}
              onChange={(event) => onEmail(event.target.value)}
            />
          </label>
          {error ? (
            <p className="access-error" role="alert">
              {error}
            </p>
          ) : (
            <p className="access-note">Список почты задаётся в окружении приложения.</p>
          )}
          <button className="primary-button" type="submit">
            Войти
          </button>
        </form>
      </section>
    </main>
  );
}

export default App;
