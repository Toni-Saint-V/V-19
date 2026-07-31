import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { adminDocumentPackageExportEnabled } from "../../src/modules/submissions/adminExportActions";
import type { SignOutCurrentSessionResult } from "../../src/services/authService";
import { mapSupabasePersistenceError } from "../../src/services/persistenceObservability";
import type { AccessRequest } from "../../src/shared/authContract";

const releaseT9Test = adminDocumentPackageExportEnabled ? test : test.skip;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const runtime = vi.hoisted(() => ({
  actionActorId: "",
  issueActorId: "",
  passportSectionActorId: "",
  lastMutationError: null as Error | null,
  lastMutationPromise: Promise.resolve() as Promise<void>,
  loadPromise: Promise.resolve({
    ownerIdsBySubmissionId: new Map<string, string>(),
    submissions: [] as Array<Record<string, unknown>>,
  }),
  resolveLoad: undefined as unknown as (value: unknown) => void,
  rejectLoad: undefined as unknown as (error: Error) => void,
  savePromise: Promise.resolve(new Map<string, string>()),
  resolveSave: undefined as unknown as (value: Map<string, string>) => void,
  rejectSave: undefined as unknown as (error: Error) => void,
  exportStateCalls: [] as string[],
}));

const authMocks = vi.hoisted(() => ({
  signInSupabaseWithPassword: vi.fn(),
  signOutCurrentSession: vi.fn<() => Promise<SignOutCurrentSessionResult>>(
    async () => ({ status: "signed_out" }),
  ),
}));

const accessRequestMocks = vi.hoisted(() => ({
  approveAccessRequest: vi.fn(),
  listAccessRequests: vi.fn(),
  rejectAccessRequest: vi.fn(),
}));

const exportMocks = vi.hoisted(() => ({
  ExportPackageCompletionUncertainError: class extends Error {
    constructor(message: string, options?: ErrorOptions) {
      super(message, options);
      this.name = "ExportPackageCompletionUncertainError";
    }
  },
  completeExportPackage: vi.fn(async (submissions: Array<Record<string, unknown>>) => ({
    batch: { id: "export-batch-1" },
    commit: { duplicate: false },
    status: "exported" as const,
    submissions: submissions.map((submission) => ({
      ...submission,
      exportState: "marked_exported",
      status: "exported",
    })),
  })),
  reconcileExportPackageCompletion: vi.fn(async () => ({
    status: "not_committed" as const,
  })),
}));

const exportRuleMocks = vi.hoisted(() => {
  const preparedIdentity = {
    contentFingerprint: "prepared-export-fingerprint",
    fileName: "visaflow-export-package-a.xlsx",
    format: "xlsx" as const,
    idempotencyKey: "package-a",
    rowCount: 1,
    submissionIds: ["submission-1"],
  };

  const buildExportPackageIdentity = vi.fn(
    (submissions: Array<Record<string, unknown>>) => {
      if (submissions.length === 0) return null;
      const version = submissions.some(
        (submission) => submission.exportIdentityVersion === "refreshed",
      )
        ? "b"
        : "a";
      return version === "a"
        ? preparedIdentity
        : {
            ...preparedIdentity,
            contentFingerprint: "refreshed-export-fingerprint",
            fileName: "visaflow-export-package-b.xlsx",
            idempotencyKey: "package-b",
          };
    },
  );
  const buildExportArchiveInputSignature = vi.fn(
    (submissions: Array<Record<string, unknown>>) => {
      if (submissions.length === 0) return null;
      return submissions.some(
        (submission) => submission.archiveInputVersion === "refreshed",
      )
        ? "archive-input-b"
        : "archive-input-a";
    },
  );
  const exportPackageIdentityMatches = vi.fn(
    (
      left: typeof preparedIdentity,
      right: typeof preparedIdentity | null,
    ) =>
      Boolean(
        right &&
          left.contentFingerprint === right.contentFingerprint &&
          left.fileName === right.fileName &&
          left.format === right.format &&
          left.idempotencyKey === right.idempotencyKey &&
          left.rowCount === right.rowCount &&
          left.submissionIds.length === right.submissionIds.length &&
          left.submissionIds.every(
            (value, index) => value === right.submissionIds[index],
          ),
      ),
  );

  return {
    buildExportArchiveInputSignature,
    buildExportPackageIdentity,
    exportPackageIdentityMatches,
    preparedIdentity,
  };
});

vi.mock("motion/react", async () => {
  const React = await import("react");
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
        React.createElement("div", props, children),
    },
    useReducedMotion: () => false,
  };
});

vi.mock("../../src/components/AccessGate", () => ({
  AccessGate: ({
    error,
    onLogin,
  }: {
    error?: string;
    onLogin: (email: string, password: string) => Promise<void>;
  }) => (
    <div data-testid="access-gate">
      {error}
      <button
        type="button"
        onClick={() => {
          runtime.lastMutationPromise = onLogin("admin-b@example.test", "password");
        }}
      >
        Login admin B
      </button>
    </div>
  ),
}));

vi.mock("../../src/components/CommandCenter", () => ({
  CommandCenter: () => <div data-testid="agent-workspace" />,
}));

vi.mock("../../src/components/AdminWorkspace", async () => {
  const { useVisaflowBusinessBridge } = await vi.importActual<
    typeof import("../../src/integration/visaflowBusinessBridge")
  >("../../src/integration/visaflowBusinessBridge");

  return {
    AdminWorkspace: ({
      accessRequests,
      currentEmail,
      onApproveAccessRequest,
      onRejectAccessRequest,
      onSignOut,
      submissions,
    }: {
      accessRequests: Array<{ id: string; status: string }>;
      currentEmail: string;
      onApproveAccessRequest: (requestId: string) => void | Promise<void>;
      onRejectAccessRequest: (requestId: string) => void | Promise<void>;
      onSignOut: () => Promise<void>;
      submissions: Array<{ id: string }>;
    }) => {
      const bridge = useVisaflowBusinessBridge();
      const capture = (promise: void | Promise<void> | undefined) => {
        runtime.lastMutationPromise = Promise.resolve(promise).catch((error) => {
          runtime.lastMutationError = error instanceof Error ? error : new Error(String(error));
        });
      };

      return (
        <div data-testid="admin-workspace">
          <span data-testid="current-admin-email">{currentEmail}</span>
          <span data-testid="submission-count">{submissions.length}</span>
          <button type="button" onClick={() => capture(onSignOut())}>
            Sign out session
          </button>
          {accessRequests.map((request) => (
            <div key={request.id}>
              <span data-testid={`access-request-${request.id}-status`}>
                {request.status}
              </span>
              <button
                type="button"
                onClick={() => capture(onApproveAccessRequest(request.id))}
              >
                Approve access request
              </button>
              <button
                type="button"
                onClick={() => capture(onRejectAccessRequest(request.id))}
              >
                Reject access request
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              capture(
                bridge.onSubmissionAction?.({
                  action: "accept",
                  source: "admin",
                  submissionId: "submission-1",
                }),
              )
            }
          >
            Accept submission
          </button>
          <button
            type="button"
            onClick={() =>
              capture(
                bridge.onSubmissionAction?.({
                  action: "mark_exported",
                  source: "admin",
                  submissionId: "submission-1",
                }),
              )
            }
          >
            Mark exported through generic action
          </button>
          <button
            type="button"
            onClick={() =>
              capture(
                bridge.onAdminIssueAdd?.({
                  input: {
                    applicantId: "applicant-1",
                    comment: "Replace file",
                    fileType: "passport_scan",
                    reason: "Unreadable",
                    severity: "critical",
                    type: "file",
                  },
                  submissionId: "submission-1",
                }),
              )
            }
          >
            Add issue
          </button>
          <button
            type="button"
            onClick={() =>
              capture(
                bridge.onAdminPassportSectionApprove?.({
                  applicantId: "applicant-1",
                  submissionId: "submission-1",
                }),
              )
            }
          >
            Approve passport section
          </button>
          <button
            type="button"
            onClick={() =>
              capture(
                bridge.onExportPackages?.({
                  archiveInputSignature: "archive-input-a",
                  documentExport: {
                    applicantCount: 1,
                    assetIds: [
                      "00000000-0000-4000-8000-000000000801",
                      "00000000-0000-4000-8000-000000000802",
                      "00000000-0000-4000-8000-000000000803",
                    ],
                    fileCount: 3,
                    workbookFileName: exportRuleMocks.preparedIdentity.fileName,
                    zipFileName: `visaflow-export-${exportRuleMocks.preparedIdentity.idempotencyKey}_documents.zip`,
                  },
                  packageIdentity: exportRuleMocks.preparedIdentity,
                  submissionIds: ["submission-1"],
                }),
              )
            }
          >
            Export submission
          </button>
        </div>
      );
    },
  };
});

vi.mock("../../src/modules/submissions/submissionActions", () => ({
  addPreciseAdminIssue: (
    submission: Record<string, unknown>,
    _input: unknown,
    actorId: string,
  ) => {
    runtime.issueActorId = actorId;
    return { ...submission, issueApplied: true };
  },
  applyActionToSubmissionListResult: (
    submissions: Array<Record<string, unknown>>,
    _submissionId: string,
    _action: string,
    _source: string,
    actorId: string,
  ) => {
    runtime.actionActorId = actorId;
    return {
      data: submissions.map((submission) => ({ ...submission, actionApplied: true })),
      ok: true,
    };
  },
  applyExportStateToSelection: (
    submissions: Array<Record<string, unknown>>,
    submissionIds: string[],
    exportState: string,
  ) => {
    runtime.exportStateCalls.push(exportState);
    const selected = submissions.filter((submission) =>
      submissionIds.includes(String(submission.id)),
    );
    const packageIdentity = exportRuleMocks.buildExportPackageIdentity(selected);
    return submissions.map((submission) =>
      submissionIds.includes(String(submission.id))
        ? { ...submission, exportPackage: packageIdentity, exportState }
        : submission,
    );
  },
  approvePassportReviewSectionForAdmin: (
    submission: Record<string, unknown>,
    _input: unknown,
    actorId: string,
  ) => {
    runtime.passportSectionActorId = actorId;
    return {
      data: { ...submission, passportSectionApproved: true },
      ok: true,
    };
  },
}));

vi.mock("../../src/modules/submissions/aiSuggestions", () => ({
  acceptAiSuggestionAsIssue: (submission: unknown) => submission,
  dismissAiSuggestion: (submission: unknown) => submission,
  runAiReview: (submission: unknown) => submission,
}));

vi.mock("../../src/modules/submissions/exportWorkflow", () => exportMocks);

vi.mock("../../src/modules/submissions/exportRules", () => ({
  buildExportArchiveInputSignature:
    exportRuleMocks.buildExportArchiveInputSignature,
  buildExportPackageIdentity: exportRuleMocks.buildExportPackageIdentity,
  exportPackageIdentityMatches: exportRuleMocks.exportPackageIdentityMatches,
}));

const persistenceMocks = vi.hoisted(() => {
  const saveCockpitSubmissionsForProfile = vi.fn(async () => {
    const ownerIdsBySubmissionId = await runtime.savePromise;
    return {
      caseRevisionsBySubmissionId: new Map([["submission-1", 2]]),
      operationId: "00000000-0000-4000-8000-000000000901",
      ownerIdsBySubmissionId,
    };
  });
  return {
    isAdminSubmissionConcurrencyConflict: vi.fn(() => false),
    loadCockpitSubmissionsForProfile: vi.fn(() => runtime.loadPromise),
    saveAdminCockpitSubmissionsIfCurrent: saveCockpitSubmissionsForProfile,
    saveCockpitSubmissionsForProfile,
  };
});

vi.mock("../../src/modules/submissions/supabasePersistence", () => persistenceMocks);

vi.mock("../../src/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ auth: {} }),
}));

vi.mock("../../src/lib/supabase/config", () => ({
  supabaseRuntimeConfig: {
    activation: { boundary: "production active" },
    blockedReasons: [],
    selected: "supabase",
    target: "supabase",
  },
}));

vi.mock("../../src/shared/authRegistration", () => ({
  accessRequestRepository: { listAccessRequests: vi.fn(async () => []) },
  authRepository: {},
}));

vi.mock("../../src/shared/supabaseAuthRegistration", () => ({
  supabaseAccessRequestRepository: accessRequestMocks,
}));

vi.mock("../../src/services/authService", () => ({
  getCurrentAppSession: vi.fn(async () => ({
    mode: "supabase",
    profile: {
      displayName: "Production Admin",
      email: "admin@example.test",
      id: "admin-production-uuid",
      organizationName: "VisaFlow",
      role: "admin",
    },
    supabaseSession: {
      expires_at: 2_000_000_000,
      user: {
        created_at: "2026-01-01T00:00:00.000Z",
        id: "admin-production-uuid",
      },
    },
  })),
  requestPasswordReset: vi.fn(),
  signInSupabaseWithPassword: authMocks.signInSupabaseWithPassword,
  signOutCurrentSession: authMocks.signOutCurrentSession,
}));

vi.mock("../../src/services/supabaseInviteFlow", () => ({
  completeSupabaseInvitePasswordSetup: vi.fn(),
  getPendingSupabaseInvitePasswordSetup: vi.fn(async () => null),
}));

vi.mock("../../src/services/profileService", () => ({
  fetchCurrentProfile: vi.fn(),
}));

import App from "../../src/App";

function resetDeferredRuntime() {
  runtime.actionActorId = "";
  runtime.issueActorId = "";
  runtime.passportSectionActorId = "";
  runtime.lastMutationError = null;
  runtime.lastMutationPromise = Promise.resolve();
  runtime.exportStateCalls = [];

  runtime.loadPromise = new Promise((resolve, reject) => {
    runtime.resolveLoad = resolve;
    runtime.rejectLoad = reject;
  });
  runtime.savePromise = new Promise((resolve, reject) => {
    runtime.resolveSave = resolve;
    runtime.rejectSave = reject;
  });
  persistenceMocks.loadCockpitSubmissionsForProfile.mockReset();
  persistenceMocks.loadCockpitSubmissionsForProfile.mockImplementation(
    () => runtime.loadPromise,
  );
  persistenceMocks.saveCockpitSubmissionsForProfile.mockReset();
  persistenceMocks.saveCockpitSubmissionsForProfile.mockImplementation(async () => {
    const ownerIdsBySubmissionId = await runtime.savePromise;
    return {
      caseRevisionsBySubmissionId: new Map([["submission-1", 2]]),
      operationId: "00000000-0000-4000-8000-000000000901",
      ownerIdsBySubmissionId,
    };
  });
  exportMocks.completeExportPackage.mockClear();
  exportMocks.reconcileExportPackageCompletion.mockClear();
  exportRuleMocks.buildExportArchiveInputSignature.mockClear();
  exportRuleMocks.buildExportPackageIdentity.mockClear();
  exportRuleMocks.exportPackageIdentityMatches.mockClear();
}

const loadedSubmission = {
  agentId: "agent-owner-uuid",
  applicants: [{ id: "applicant-1" }],
  exportIdentityVersion: "prepared",
  files: [
    {
      applicantId: "applicant-1",
      generatedFileName: "demo1_passport_scan.jpg",
      id: "file-passport-1",
      status: "pending_review",
      storageAdapter: "supabase-private",
      storageBucket: "submission-media",
      storagePath:
        "submissions/submission-1/applicants/applicant-1/passport_scan/demo1_passport_scan.jpg",
      type: "passport_scan",
      uploadStatus: "uploaded",
    },
  ],
  id: "submission-1",
};

const pendingAccessRequest: AccessRequest = {
  city: "Москва",
  companyName: "Response Lost Travel",
  createdAt: "2026-07-22T09:00:00.000Z",
  email: "response-lost@example.test",
  fullName: "Response Lost Agent",
  id: "access-request-response-lost",
  phone: "+7 000 000-00-09",
  requestedRole: "agent",
  status: "pending",
  userId: "response-lost-user",
};

beforeEach(() => {
  resetDeferredRuntime();
  accessRequestMocks.approveAccessRequest.mockReset();
  accessRequestMocks.listAccessRequests.mockReset();
  accessRequestMocks.listAccessRequests.mockResolvedValue([]);
  accessRequestMocks.rejectAccessRequest.mockReset();
  authMocks.signOutCurrentSession.mockReset();
  authMocks.signOutCurrentSession.mockResolvedValue({ status: "signed_out" });
  authMocks.signInSupabaseWithPassword.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("App production workspace runtime", () => {
  test.each([
    ["approve", "approved", "Approve access request"],
    ["reject", "rejected", "Reject access request"],
  ] as const)(
    "reconciles a response-lost access %s when the canonical row is %s",
    async (action, terminalStatus, buttonName) => {
      let canonicalStatus: AccessRequest["status"] = "pending";
      const decisionMock =
        action === "approve"
          ? accessRequestMocks.approveAccessRequest
          : accessRequestMocks.rejectAccessRequest;
      accessRequestMocks.listAccessRequests.mockImplementation(async () => [
        { ...pendingAccessRequest, status: canonicalStatus },
      ]);
      decisionMock.mockImplementationOnce(async () => {
        canonicalStatus = terminalStatus;
        throw new Error(`Access ${action} response was lost`);
      });
      runtime.loadPromise = Promise.resolve({
        caseRevisionsBySubmissionId: new Map([["submission-1", 1]]),
        ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
        submissions: [loadedSubmission],
      });

      render(<App />);
      await screen.findByTestId("admin-workspace");
      expect(
        await screen.findByTestId(
          `access-request-${pendingAccessRequest.id}-status`,
        ),
      ).toHaveTextContent("pending");

      fireEvent.click(screen.getByRole("button", { name: buttonName }));
      await act(async () => runtime.lastMutationPromise);

      expect(decisionMock).toHaveBeenCalledWith(
        pendingAccessRequest.id,
        "admin-production-uuid",
      );
      expect(runtime.lastMutationError).toBeNull();
      expect(
        screen.getByTestId(`access-request-${pendingAccessRequest.id}-status`),
      ).toHaveTextContent(terminalStatus);
    },
  );

  test("rethrows a response-lost access error while the canonical row is pending", async () => {
    const decisionError = new Error("Access approve response was lost");
    accessRequestMocks.listAccessRequests.mockResolvedValue([pendingAccessRequest]);
    accessRequestMocks.approveAccessRequest.mockRejectedValueOnce(decisionError);
    runtime.loadPromise = Promise.resolve({
      caseRevisionsBySubmissionId: new Map([["submission-1", 1]]),
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [loadedSubmission],
    });

    render(<App />);
    await screen.findByTestId("admin-workspace");
    fireEvent.click(
      await screen.findByRole("button", { name: "Approve access request" }),
    );
    await act(async () => runtime.lastMutationPromise);

    expect(runtime.lastMutationError).toBe(decisionError);
    expect(
      screen.getByTestId(`access-request-${pendingAccessRequest.id}-status`),
    ).toHaveTextContent("pending");
  });

  test("reloads canonical revisions before restoring a workspace after sign-out rejects", async () => {
    runtime.loadPromise = Promise.resolve({
      caseRevisionsBySubmissionId: new Map([["submission-1", 1]]),
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [loadedSubmission],
    });
    authMocks.signOutCurrentSession.mockRejectedValueOnce(
      new Error("Supabase sign-out rejected safely"),
    );
    render(<App />);
    await screen.findByTestId("admin-workspace");
    persistenceMocks.loadCockpitSubmissionsForProfile.mockResolvedValueOnce({
      caseRevisionsBySubmissionId: new Map([["submission-1", 2]]),
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [{ ...loadedSubmission, title: "Recovered canonical" }],
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign out session" }));
    await act(async () => runtime.lastMutationPromise);

    expect(screen.getByTestId("admin-workspace")).toBeInTheDocument();
    expect(screen.queryByTestId("access-gate")).not.toBeInTheDocument();
    expect(authMocks.signOutCurrentSession).toHaveBeenCalledTimes(1);
    expect(persistenceMocks.loadCockpitSubmissionsForProfile).toHaveBeenCalledTimes(2);

    runtime.savePromise = Promise.resolve(
      new Map([["submission-1", "agent-owner-uuid"]]),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add issue" }));
    await act(async () => runtime.lastMutationPromise);

    expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      expect.any(Map),
      new Map([["submission-1", 2]]),
    );
  });

  test("releases the sign-out fence when both sign-out and recovery refresh reject", async () => {
    runtime.loadPromise = Promise.resolve({
      caseRevisionsBySubmissionId: new Map([["submission-1", 1]]),
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [loadedSubmission],
    });
    authMocks.signOutCurrentSession.mockRejectedValueOnce(
      new Error("Supabase sign-out rejected safely"),
    );
    render(<App />);
    await screen.findByTestId("admin-workspace");
    persistenceMocks.loadCockpitSubmissionsForProfile.mockRejectedValueOnce(
      new Error("Canonical recovery refresh rejected safely"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign out session" }));
    await act(async () => runtime.lastMutationPromise);

    expect(screen.getByTestId("admin-workspace")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Завершаем сессию" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Не удалось выйти из аккаунта. Повторите попытку.",
    );
    expect(runtime.lastMutationError).toEqual(
      new Error("Supabase sign-out rejected safely"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign out session" }));
    await act(async () => runtime.lastMutationPromise);

    expect(await screen.findByTestId("access-gate")).toBeInTheDocument();
    expect(authMocks.signOutCurrentSession).toHaveBeenCalledTimes(2);
  });

  test("unmounts the authenticated workspace while remote sign-out is pending", async () => {
    const signOut = deferred<SignOutCurrentSessionResult>();
    runtime.loadPromise = Promise.resolve({
      caseRevisionsBySubmissionId: new Map([["submission-1", 1]]),
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [loadedSubmission],
    });
    authMocks.signOutCurrentSession.mockReturnValueOnce(signOut.promise);
    render(<App />);
    await screen.findByTestId("admin-workspace");

    fireEvent.click(screen.getByRole("button", { name: "Sign out session" }));

    expect(
      await screen.findByRole("heading", { name: "Завершаем сессию" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("admin-workspace")).not.toBeInTheDocument();
    expect(screen.queryByTestId("access-gate")).not.toBeInTheDocument();

    await act(async () => {
      signOut.resolve({ status: "signed_out" });
      await runtime.lastMutationPromise;
    });
    expect(await screen.findByTestId("access-gate")).toBeInTheDocument();
  });

  test("drains a fenced in-flight mutation before failed sign-out recovery", async () => {
    const externalIssue = vi.fn(async () => undefined);
    runtime.loadPromise = Promise.resolve({
      caseRevisionsBySubmissionId: new Map([["submission-1", 1]]),
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [loadedSubmission],
    });
    authMocks.signOutCurrentSession.mockRejectedValueOnce(
      new Error("Supabase sign-out rejected safely"),
    );
    render(<App bridge={{ onAdminIssueAdd: externalIssue }} />);
    await screen.findByTestId("admin-workspace");

    persistenceMocks.loadCockpitSubmissionsForProfile.mockResolvedValueOnce({
      caseRevisionsBySubmissionId: new Map([["submission-1", 3]]),
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [{ ...loadedSubmission, title: "Recovered after drain" }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Add issue" }));
    await waitFor(() =>
      expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1),
    );
    const staleMutation = runtime.lastMutationPromise;

    fireEvent.click(screen.getByRole("button", { name: "Sign out session" }));
    const signOutRecovery = runtime.lastMutationPromise;
    expect(
      await screen.findByRole("heading", { name: "Завершаем сессию" }),
    ).toBeInTheDocument();

    await act(async () => {
      runtime.resolveSave(new Map([["submission-1", "agent-owner-uuid"]]));
      await Promise.all([staleMutation, signOutRecovery]);
    });

    expect(await screen.findByTestId("admin-workspace")).toBeInTheDocument();
    expect(externalIssue).not.toHaveBeenCalled();
    expect(persistenceMocks.loadCockpitSubmissionsForProfile).toHaveBeenCalledTimes(2);

    runtime.savePromise = Promise.resolve(
      new Map([["submission-1", "agent-owner-uuid"]]),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add issue" }));
    await act(async () => runtime.lastMutationPromise);
    expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.any(Array),
      expect.any(Map),
      new Map([["submission-1", 3]]),
    );
  });

  test("fails closed when the local session is already gone after a rejected sign-out", async () => {
    runtime.loadPromise = Promise.resolve({
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [loadedSubmission],
    });
    authMocks.signOutCurrentSession.mockResolvedValueOnce({
      status: "local_session_cleared",
      warning:
        "Сеанс на этом устройстве завершён, но серверное подтверждение выхода не получено.",
    });
    render(<App />);
    await screen.findByTestId("admin-workspace");

    fireEvent.click(screen.getByRole("button", { name: "Sign out session" }));
    await act(async () => runtime.lastMutationPromise);

    expect(await screen.findByTestId("access-gate")).toHaveTextContent(
      "Сеанс на этом устройстве завершён, но серверное подтверждение выхода не получено.",
    );
    expect(screen.queryByTestId("admin-workspace")).not.toBeInTheDocument();
    expect(authMocks.signOutCurrentSession).toHaveBeenCalledTimes(1);
  });

  test("shows a blocking retry state instead of a false empty workspace on initial load failure", async () => {
    render(<App />);
    await screen.findByText("Загрузка данных Supabase...");
    expect(
      screen.getByRole("heading", { name: "Загружаем рабочую область" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("app-runtime-state")).toHaveClass("is-loading");
    await waitFor(() => {
      expect(persistenceMocks.loadCockpitSubmissionsForProfile).toHaveBeenCalledTimes(
        1,
      );
    });

    await act(async () => {
      runtime.rejectLoad(new Error("Supabase read failed safely"));
    });

    expect(
      await screen.findByRole("heading", {
        name: "Не удалось загрузить данные Supabase",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Supabase read failed safely")).toBeInTheDocument();
    expect(screen.getByTestId("app-runtime-state")).toHaveClass("is-error");
    expect(screen.queryByTestId("admin-workspace")).not.toBeInTheDocument();

    persistenceMocks.loadCockpitSubmissionsForProfile.mockResolvedValueOnce({
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [loadedSubmission],
    });
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(await screen.findByTestId("admin-workspace")).toBeInTheDocument();
    expect(persistenceMocks.loadCockpitSubmissionsForProfile).toHaveBeenCalledTimes(2);
  });

  test("stops interval polling after HTTP 402 and resumes it after a successful manual retry", async () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    persistenceMocks.loadCockpitSubmissionsForProfile.mockRejectedValueOnce(
      mapSupabasePersistenceError(
        { message: "provider response intentionally omitted" },
        {
          httpStatus: 402,
          operation: "submissions.list",
          fallbackKind: "database",
        },
      ),
    );

    render(<App />);
    expect(
      await screen.findByRole("heading", {
        name: "Не удалось загрузить данные Supabase",
      }),
    ).toBeInTheDocument();
    expect(persistenceMocks.loadCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1);

    const intervalHandler = setIntervalSpy.mock.calls.find(
      ([, timeout]) => timeout === 10_000,
    )?.[0];
    expect(intervalHandler).toBeTypeOf("function");
    await act(async () => {
      if (typeof intervalHandler === "function") intervalHandler();
      await Promise.resolve();
    });
    expect(persistenceMocks.loadCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1);

    persistenceMocks.loadCockpitSubmissionsForProfile.mockResolvedValueOnce({
      caseRevisionsBySubmissionId: new Map([["submission-1", 1]]),
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [loadedSubmission],
    });
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByTestId("admin-workspace")).toBeInTheDocument();
    expect(persistenceMocks.loadCockpitSubmissionsForProfile).toHaveBeenCalledTimes(2);

    persistenceMocks.loadCockpitSubmissionsForProfile.mockResolvedValueOnce({
      caseRevisionsBySubmissionId: new Map([["submission-1", 1]]),
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [loadedSubmission],
    });
    await act(async () => {
      if (typeof intervalHandler === "function") intervalHandler();
    });
    await waitFor(() =>
      expect(persistenceMocks.loadCockpitSubmissionsForProfile).toHaveBeenCalledTimes(3),
    );
  });

  test("opens the interval circuit when the concurrent admin access request read returns HTTP 402 first", async () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const submissionsLoad = deferred<{
      caseRevisionsBySubmissionId: Map<string, number>;
      ownerIdsBySubmissionId: Map<string, string>;
      submissions: typeof loadedSubmission[];
    }>();
    persistenceMocks.loadCockpitSubmissionsForProfile.mockReturnValueOnce(
      submissionsLoad.promise,
    );
    accessRequestMocks.listAccessRequests
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(
        mapSupabasePersistenceError(
          { message: "provider response intentionally omitted" },
          {
            httpStatus: 402,
            operation: "auth.access_requests_list",
            fallbackKind: "database",
          },
        ),
      );

    render(<App />);
    expect(
      await screen.findByRole("heading", {
        name: "Не удалось загрузить данные Supabase",
      }),
    ).toBeInTheDocument();
    expect(persistenceMocks.loadCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1);

    const intervalHandler = setIntervalSpy.mock.calls.find(
      ([, timeout]) => timeout === 10_000,
    )?.[0];
    await act(async () => {
      if (typeof intervalHandler === "function") intervalHandler();
      submissionsLoad.resolve({
        caseRevisionsBySubmissionId: new Map([["submission-1", 1]]),
        ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
        submissions: [loadedSubmission],
      });
      await Promise.resolve();
    });

    expect(persistenceMocks.loadCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1);
    expect(accessRequestMocks.listAccessRequests).toHaveBeenCalledTimes(2);
  });

  test("rechecks a queued interval refresh after an in-flight request opens the HTTP 402 circuit", async () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const firstLoad = deferred<never>();
    persistenceMocks.loadCockpitSubmissionsForProfile.mockReturnValueOnce(
      firstLoad.promise,
    );

    render(<App />);
    await waitFor(() =>
      expect(persistenceMocks.loadCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1),
    );
    const intervalHandler = setIntervalSpy.mock.calls.find(
      ([, timeout]) => timeout === 10_000,
    )?.[0];
    await act(async () => {
      if (typeof intervalHandler === "function") intervalHandler();
      await Promise.resolve();
    });
    expect(persistenceMocks.loadCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstLoad.reject(
        mapSupabasePersistenceError(
          { message: "provider response intentionally omitted" },
          {
            httpStatus: 402,
            operation: "submissions.list",
            fallbackKind: "database",
          },
        ),
      );
    });
    expect(
      await screen.findByRole("heading", {
        name: "Не удалось загрузить данные Supabase",
      }),
    ).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });

    expect(persistenceMocks.loadCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1);
  });

  test("gates the workspace until Supabase resolves and awaits mutations with the real actor", async () => {
    const externalAction = vi.fn(async () => undefined);
    const externalIssue = vi.fn(async () => undefined);
    render(
      <App
        bridge={{
          onAdminIssueAdd: externalIssue,
          onSubmissionAction: externalAction,
        }}
      />,
    );

    expect(await screen.findByText("Загрузка данных Supabase...")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-workspace")).not.toBeInTheDocument();

    await act(async () => {
      runtime.resolveLoad({
        ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
        submissions: [loadedSubmission],
      });
    });

    expect(await screen.findByTestId("admin-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("submission-count")).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "Accept submission" }));
    await waitFor(() => {
      expect(runtime.actionActorId).toBe("admin-production-uuid");
      expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1);
    });
    expect(externalAction).not.toHaveBeenCalled();

    await act(async () => {
      runtime.resolveSave(new Map([["submission-1", "agent-owner-uuid"]]));
      await runtime.lastMutationPromise;
    });
    await waitFor(() => expect(externalAction).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Add issue" }));
    await waitFor(() => {
      expect(runtime.issueActorId).toBe("admin-production-uuid");
      expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenCalledTimes(2);
      expect(externalIssue).toHaveBeenCalledTimes(1);
    });
  });

  test("serializes competing admin mutations and rebases the later write", async () => {
    render(<App />);
    await screen.findByText("Загрузка данных Supabase...");
    await act(async () => {
      runtime.resolveLoad({
        ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
        submissions: [loadedSubmission],
      });
    });
    await screen.findByTestId("admin-workspace");
    persistenceMocks.loadCockpitSubmissionsForProfile.mockResolvedValue({
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [{ ...loadedSubmission, issueApplied: true }],
    });

    fireEvent.click(screen.getByRole("button", { name: "Add issue" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Approve passport section" }),
    );

    await waitFor(() =>
      expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1),
    );
    expect(runtime.passportSectionActorId).toBe("");

    await act(async () => {
      runtime.resolveSave(new Map([["submission-1", "agent-owner-uuid"]]));
      await runtime.lastMutationPromise;
    });

    expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenCalledTimes(2);
    expect(
      persistenceMocks.saveCockpitSubmissionsForProfile.mock.calls[1]?.[1],
    ).toEqual([
      expect.objectContaining({
        id: "submission-1",
        issueApplied: true,
        passportSectionApproved: true,
      }),
    ]);
  });

  test("keeps a corrupt cockpit snapshot read-only until explicit repair", async () => {
    runtime.loadPromise = Promise.resolve({
      caseRevisionsBySubmissionId: new Map([["submission-1", 1]]),
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      quarantinedSubmissionIds: new Set(["submission-1"]),
      submissions: [loadedSubmission],
    });
    render(<App />);
    await screen.findByTestId("admin-workspace");

    fireEvent.click(screen.getByRole("button", { name: "Accept submission" }));
    await act(async () => runtime.lastMutationPromise);

    expect(persistenceMocks.saveCockpitSubmissionsForProfile).not.toHaveBeenCalled();
    expect(runtime.lastMutationError?.message).toMatch(
      /только для чтения.*snapshot повреждён/i,
    );
  });

  test("detaches a new session from a timed-out previous-session queue", async () => {
    runtime.loadPromise = Promise.resolve({
      caseRevisionsBySubmissionId: new Map([["submission-1", 1]]),
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [loadedSubmission],
    });
    render(<App />);
    await screen.findByTestId("admin-workspace");

    fireEvent.click(screen.getByRole("button", { name: "Add issue" }));
    await waitFor(() =>
      expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1),
    );

    persistenceMocks.loadCockpitSubmissionsForProfile.mockResolvedValue({
      caseRevisionsBySubmissionId: new Map([["submission-1", 5]]),
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [{ ...loadedSubmission, title: "Admin B canonical" }],
    });
    authMocks.signInSupabaseWithPassword.mockResolvedValue({
      mode: "supabase",
      profile: {
        displayName: "Production Admin B",
        email: "admin-b@example.test",
        id: "admin-production-b-uuid",
        organizationName: "VisaFlow",
        role: "admin",
      },
      supabaseSession: {
        expires_at: 2_000_000_100,
        user: {
          created_at: "2026-07-22T10:00:00.000Z",
          id: "admin-production-b-uuid",
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign out session" }));
    expect(await screen.findByTestId("access-gate")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Login admin B" }));
    expect(
      await screen.findByTestId("current-admin-email", undefined, {
        timeout: 4_000,
      }),
    ).toHaveTextContent("admin-b@example.test");

    runtime.savePromise = Promise.resolve(
      new Map([["submission-1", "agent-owner-uuid"]]),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add issue" }));
    await act(async () => runtime.lastMutationPromise);

    expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenCalledTimes(2);
    expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.any(Array),
      expect.any(Map),
      new Map([["submission-1", 5]]),
    );
  });

  test("keeps generic mark_exported outside the document package callback", async () => {
    const externalAction = vi.fn(async () => undefined);
    render(<App bridge={{ onSubmissionAction: externalAction }} />);
    await screen.findByText("Загрузка данных Supabase...");
    await act(async () => {
      runtime.resolveLoad({
        caseRevisionsBySubmissionId: new Map([["submission-1", 1]]),
        ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
        submissions: [loadedSubmission],
      });
    });
    await screen.findByTestId("admin-workspace");
    runtime.savePromise = Promise.resolve(
      new Map([["submission-1", "agent-owner-uuid"]]),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Mark exported through generic action",
      }),
    );
    await act(async () => runtime.lastMutationPromise);

    expect(runtime.actionActorId).toBe("");
    expect(persistenceMocks.saveCockpitSubmissionsForProfile).not.toHaveBeenCalled();
    expect(externalAction).not.toHaveBeenCalled();
    expect(runtime.lastMutationError?.message).toContain(
      "Пакет документов T9 недоступен",
    );
  });

  releaseT9Test("fences a deferred admin A export before admin B terminal RPC and bridge", async () => {
    const externalExport = vi.fn(async () => undefined);
    render(<App bridge={{ onExportPackages: externalExport }} />);
    await screen.findByText("Загрузка данных Supabase...");
    await act(async () => {
      runtime.resolveLoad({
        caseRevisionsBySubmissionId: new Map([["submission-1", 1]]),
        ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
        submissions: [loadedSubmission],
      });
    });
    await screen.findByTestId("admin-workspace");

    fireEvent.click(screen.getByRole("button", { name: "Export submission" }));
    await waitFor(() =>
      expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1),
    );
    const adminAMutation = runtime.lastMutationPromise;

    persistenceMocks.loadCockpitSubmissionsForProfile.mockResolvedValue({
      caseRevisionsBySubmissionId: new Map([["submission-1", 2]]),
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [{ ...loadedSubmission, title: "Admin B canonical" }],
    });
    authMocks.signInSupabaseWithPassword.mockResolvedValue({
      mode: "supabase",
      profile: {
        displayName: "Production Admin B",
        email: "admin-b@example.test",
        id: "admin-production-b-uuid",
        organizationName: "VisaFlow",
        role: "admin",
      },
      supabaseSession: {
        expires_at: 2_000_000_100,
        user: {
          created_at: "2026-07-22T10:00:00.000Z",
          id: "admin-production-b-uuid",
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign out session" }));
    expect(await screen.findByTestId("access-gate")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Login admin B" }));

    await act(async () => {
      runtime.resolveSave(new Map([["submission-1", "agent-owner-uuid"]]));
      await adminAMutation;
    });

    expect(await screen.findByTestId("current-admin-email")).toHaveTextContent(
      "admin-b@example.test",
    );
    expect(exportMocks.completeExportPackage).not.toHaveBeenCalled();
    expect(externalExport).not.toHaveBeenCalled();
  });

  releaseT9Test("does not roll back or bridge an export committed while admin A logs out", async () => {
    const terminalCommit = deferred<{
      batch: { id: string };
      commit: { duplicate: boolean };
      status: "exported";
      submissions: Array<Record<string, unknown>>;
    }>();
    exportMocks.completeExportPackage.mockReturnValueOnce(terminalCommit.promise);
    runtime.savePromise = Promise.resolve(
      new Map([["submission-1", "agent-owner-uuid"]]),
    );
    const externalExport = vi.fn(async () => undefined);

    render(<App bridge={{ onExportPackages: externalExport }} />);
    await screen.findByText("Загрузка данных Supabase...");
    await act(async () => {
      runtime.resolveLoad({
        caseRevisionsBySubmissionId: new Map([["submission-1", 1]]),
        ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
        submissions: [loadedSubmission],
      });
    });
    await screen.findByTestId("admin-workspace");

    fireEvent.click(screen.getByRole("button", { name: "Export submission" }));
    await waitFor(() =>
      expect(exportMocks.completeExportPackage).toHaveBeenCalledTimes(1),
    );
    const adminAMutation = runtime.lastMutationPromise;

    persistenceMocks.loadCockpitSubmissionsForProfile.mockResolvedValue({
      caseRevisionsBySubmissionId: new Map([["submission-1", 3]]),
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [{ ...loadedSubmission, title: "Admin B after terminal commit" }],
    });
    authMocks.signInSupabaseWithPassword.mockResolvedValue({
      mode: "supabase",
      profile: {
        displayName: "Production Admin B",
        email: "admin-b@example.test",
        id: "admin-production-b-uuid",
        organizationName: "VisaFlow",
        role: "admin",
      },
      supabaseSession: {
        expires_at: 2_000_000_100,
        user: {
          created_at: "2026-07-22T10:00:00.000Z",
          id: "admin-production-b-uuid",
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign out session" }));
    expect(await screen.findByTestId("access-gate")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Login admin B" }));

    await act(async () => {
      terminalCommit.resolve({
        batch: { id: "export-batch-committed-under-admin-a" },
        commit: { duplicate: false },
        status: "exported",
        submissions: [{ ...loadedSubmission, status: "exported" }],
      });
      await adminAMutation;
    });

    expect(await screen.findByTestId("current-admin-email")).toHaveTextContent(
      "admin-b@example.test",
    );
    expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1);
    expect(externalExport).not.toHaveBeenCalled();
  });

  test("persists the whole passport section once before notifying the external bridge", async () => {
    const externalPassportSectionApprove = vi.fn(async () => undefined);
    render(
      <App
        bridge={{
          onAdminPassportSectionApprove: externalPassportSectionApprove,
        }}
      />,
    );
    await screen.findByText("Загрузка данных Supabase...");
    await act(async () => {
      runtime.resolveLoad({
        ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
        submissions: [loadedSubmission],
      });
    });
    await screen.findByTestId("admin-workspace");

    fireEvent.click(screen.getByRole("button", { name: "Approve passport section" }));
    await waitFor(() => {
      expect(runtime.passportSectionActorId).toBe("admin-production-uuid");
      expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1);
    });
    expect(externalPassportSectionApprove).not.toHaveBeenCalled();
    expect(
      persistenceMocks.saveCockpitSubmissionsForProfile.mock.calls[0]?.[1],
    ).toEqual([
      expect.objectContaining({
        id: "submission-1",
        passportSectionApproved: true,
      }),
    ]);

    await act(async () => {
      runtime.resolveSave(new Map([["submission-1", "agent-owner-uuid"]]));
      await runtime.lastMutationPromise;
    });

    expect(externalPassportSectionApprove).toHaveBeenCalledWith({
      applicantId: "applicant-1",
      submissionId: "submission-1",
    });
    expect(externalPassportSectionApprove).toHaveBeenCalledTimes(1);
  });

  test("retries an idempotent post-commit observer without replaying the domain save", async () => {
    const observer = vi
      .fn()
      .mockRejectedValueOnce(new Error("observer unavailable"))
      .mockResolvedValueOnce(undefined);
    runtime.loadPromise = Promise.resolve({
      caseRevisionsBySubmissionId: new Map([["submission-1", 1]]),
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [loadedSubmission],
    });
    runtime.savePromise = Promise.resolve(
      new Map([["submission-1", "agent-owner-uuid"]]),
    );
    render(<App bridge={{ onPostCommitEvent: observer }} />);
    await screen.findByTestId("admin-workspace");

    fireEvent.click(screen.getByRole("button", { name: "Add issue" }));
    await act(async () => runtime.lastMutationPromise);
    await waitFor(() => expect(observer).toHaveBeenCalledTimes(2));

    expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1);
    expect(runtime.lastMutationError).toBeNull();
    expect(observer.mock.calls[0]?.[0].eventId).toBe(
      observer.mock.calls[1]?.[0].eventId,
    );
  });

  test("keeps the canonical workspace and surfaces a rejected Supabase mutation", async () => {
    render(<App />);
    await screen.findByText("Загрузка данных Supabase...");
    await act(async () => {
      runtime.resolveLoad({
        ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
        submissions: [loadedSubmission],
      });
    });
    await screen.findByTestId("admin-workspace");

    fireEvent.click(screen.getByRole("button", { name: "Accept submission" }));
    await waitFor(() =>
      expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      runtime.rejectSave(new Error("Supabase mutation failed safely"));
      await runtime.lastMutationPromise;
    });

    expect(await screen.findByText("Supabase mutation failed safely")).toBeInTheDocument();
    expect(screen.getByTestId("admin-workspace")).toBeInTheDocument();
    expect(runtime.lastMutationError?.message).toBe("Supabase mutation failed safely");
  });

  releaseT9Test("persists file_downloaded before the atomic export RPC and refreshes canonical state without a terminal draft save", async () => {
    runtime.savePromise = Promise.resolve(
      new Map([["submission-1", "agent-owner-uuid"]]),
    );
    render(<App />);
    await screen.findByText("Загрузка данных Supabase...");
    await act(async () => {
      runtime.resolveLoad({
        ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
        submissions: [loadedSubmission],
      });
    });
    await screen.findByTestId("admin-workspace");
    persistenceMocks.loadCockpitSubmissionsForProfile.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Export submission" }));
    await act(async () => {
      await runtime.lastMutationPromise;
    });

    expect(runtime.exportStateCalls).toEqual(["file_generated", "file_downloaded"]);
    expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1);
    expect(
      persistenceMocks.saveCockpitSubmissionsForProfile.mock.calls[0]?.[1],
    ).toEqual([
      expect.objectContaining({
        exportState: "file_downloaded",
        id: "submission-1",
      }),
    ]);
    expect(exportMocks.completeExportPackage).toHaveBeenCalledWith(
      [expect.objectContaining({ exportState: "file_downloaded" })],
      expect.objectContaining({ createdBy: "admin-production-uuid" }),
    );
    // The draft save schedules a refresh and the durable terminal RPC queues
    // the final canonical refresh. Both are reads; neither may become a second
    // terminal draft persistence.
    expect(persistenceMocks.loadCockpitSubmissionsForProfile).toHaveBeenCalledTimes(2);
    expect(runtime.lastMutationError).toBeNull();

    const firstPersistenceOrder =
      persistenceMocks.saveCockpitSubmissionsForProfile.mock.invocationCallOrder[0];
    const rpcOrder = exportMocks.completeExportPackage.mock.invocationCallOrder[0];
    expect(firstPersistenceOrder).toBeLessThan(rpcOrder ?? 0);
  });

  releaseT9Test("resumes terminal export from a canonical file_downloaded checkpoint", async () => {
    runtime.loadPromise = Promise.resolve({
      caseRevisionsBySubmissionId: new Map([["submission-1", 4]]),
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [
        {
          ...loadedSubmission,
          exportPackage: exportRuleMocks.preparedIdentity,
          exportState: "file_downloaded",
        },
      ],
    });
    render(<App />);
    await screen.findByTestId("admin-workspace");
    persistenceMocks.loadCockpitSubmissionsForProfile.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Export submission" }));
    await act(async () => runtime.lastMutationPromise);

    expect(runtime.exportStateCalls).toEqual([]);
    expect(persistenceMocks.saveCockpitSubmissionsForProfile).not.toHaveBeenCalled();
    expect(exportMocks.completeExportPackage).toHaveBeenCalledWith(
      [expect.objectContaining({ exportState: "file_downloaded" })],
      expect.objectContaining({ createdBy: "admin-production-uuid" }),
    );
    expect(runtime.lastMutationError).toBeNull();
  });

  releaseT9Test("fails closed before persistence when a canonical refresh makes the prepared ZIP identity stale", async () => {
    runtime.savePromise = Promise.resolve(
      new Map([["submission-1", "agent-owner-uuid"]]),
    );
    render(<App />);
    await screen.findByText("Загрузка данных Supabase...");
    await act(async () => {
      runtime.resolveLoad({
        ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
        submissions: [loadedSubmission],
      });
    });
    await screen.findByTestId("admin-workspace");

    persistenceMocks.loadCockpitSubmissionsForProfile.mockClear();
    persistenceMocks.loadCockpitSubmissionsForProfile.mockResolvedValueOnce({
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [
        {
          ...loadedSubmission,
          exportIdentityVersion: "refreshed",
        },
      ],
    });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() =>
      expect(
        persistenceMocks.loadCockpitSubmissionsForProfile,
      ).toHaveBeenCalledTimes(1),
    );

    fireEvent.click(screen.getByRole("button", { name: "Export submission" }));
    await act(async () => {
      await runtime.lastMutationPromise;
    });

    expect(runtime.exportStateCalls).toEqual([]);
    expect(
      persistenceMocks.saveCockpitSubmissionsForProfile,
    ).not.toHaveBeenCalled();
    expect(exportMocks.completeExportPackage).not.toHaveBeenCalled();
    expect(runtime.lastMutationError?.message).toBe(
      "Export artifact is stale; regenerate Excel and ZIP before retrying.",
    );
  });

  releaseT9Test("fails closed when canonical questionnaire data changes outside the Excel identity", async () => {
    runtime.savePromise = Promise.resolve(
      new Map([["submission-1", "agent-owner-uuid"]]),
    );
    render(<App />);
    await screen.findByText("Загрузка данных Supabase...");
    await act(async () => {
      runtime.resolveLoad({
        ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
        submissions: [loadedSubmission],
      });
    });
    await screen.findByTestId("admin-workspace");

    persistenceMocks.loadCockpitSubmissionsForProfile.mockClear();
    persistenceMocks.loadCockpitSubmissionsForProfile.mockResolvedValueOnce({
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [
        {
          ...loadedSubmission,
          archiveInputVersion: "refreshed",
        },
      ],
    });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() =>
      expect(
        persistenceMocks.loadCockpitSubmissionsForProfile,
      ).toHaveBeenCalledTimes(1),
    );

    fireEvent.click(screen.getByRole("button", { name: "Export submission" }));
    await act(async () => {
      await runtime.lastMutationPromise;
    });

    expect(runtime.exportStateCalls).toEqual([]);
    expect(
      persistenceMocks.saveCockpitSubmissionsForProfile,
    ).not.toHaveBeenCalled();
    expect(exportMocks.completeExportPackage).not.toHaveBeenCalled();
    expect(runtime.lastMutationError?.message).toBe(
      "Export artifact is stale; regenerate Excel and ZIP before retrying.",
    );
  });

  releaseT9Test("restores a retryable export state only when canonical reconciliation proves the RPC did not commit", async () => {
    runtime.savePromise = Promise.resolve(
      new Map([["submission-1", "agent-owner-uuid"]]),
    );
    exportMocks.completeExportPackage.mockRejectedValueOnce(
      new Error("Atomic export RPC failed safely"),
    );
    render(<App />);
    await screen.findByText("Загрузка данных Supabase...");
    await act(async () => {
      runtime.resolveLoad({
        ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
        submissions: [loadedSubmission],
      });
    });
    await screen.findByTestId("admin-workspace");

    fireEvent.click(screen.getByRole("button", { name: "Export submission" }));
    await act(async () => {
      await runtime.lastMutationPromise;
    });

    expect(runtime.exportStateCalls).toEqual([
      "file_generated",
      "file_downloaded",
      "ready",
    ]);
    expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenCalledTimes(2);
    expect(
      persistenceMocks.saveCockpitSubmissionsForProfile.mock.calls[1]?.[1],
    ).toEqual([
      expect.objectContaining({
        exportState: "ready",
        id: "submission-1",
      }),
    ]);
    expect(runtime.lastMutationError?.message).toBe("Atomic export RPC failed safely");
    expect(exportMocks.reconcileExportPackageCompletion).toHaveBeenCalledWith(
      [expect.objectContaining({ exportState: "file_downloaded" })],
      expect.objectContaining({
        batchId: expect.any(String),
        createdBy: "admin-production-uuid",
        format: "xlsx",
      }),
      expect.objectContaining({ message: "Atomic export RPC failed safely" }),
      expect.objectContaining({ assertCurrent: expect.any(Function) }),
    );
  });

  releaseT9Test("pins rollback to the checkpoint revision and preserves a refreshed canonical payload", async () => {
    const terminalCommit = deferred<never>();
    runtime.savePromise = Promise.resolve(
      new Map([["submission-1", "agent-owner-uuid"]]),
    );
    runtime.loadPromise = Promise.resolve({
      caseRevisionsBySubmissionId: new Map([["submission-1", 1]]),
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [loadedSubmission],
    });
    exportMocks.completeExportPackage.mockReturnValueOnce(terminalCommit.promise);
    render(<App />);
    await screen.findByTestId("admin-workspace");
    persistenceMocks.loadCockpitSubmissionsForProfile.mockResolvedValue({
      caseRevisionsBySubmissionId: new Map([["submission-1", 9]]),
      ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
      submissions: [
        {
          ...loadedSubmission,
          exportState: "file_downloaded",
          title: "Concurrent canonical title",
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Export submission" }));
    await waitFor(() =>
      expect(exportMocks.completeExportPackage).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(persistenceMocks.loadCockpitSubmissionsForProfile).toHaveBeenCalledTimes(2),
    );

    await act(async () => {
      terminalCommit.reject(new Error("Atomic export RPC failed after refresh"));
      await runtime.lastMutationPromise;
    });

    expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenCalledTimes(2);
    expect(
      persistenceMocks.saveCockpitSubmissionsForProfile.mock.calls[1]?.[1],
    ).toEqual([
      expect.objectContaining({
        exportState: "ready",
        id: "submission-1",
        title: "Concurrent canonical title",
      }),
    ]);
    expect(
      persistenceMocks.saveCockpitSubmissionsForProfile.mock.calls[1]?.[3],
    ).toEqual(new Map([["submission-1", 2]]));
  });

  releaseT9Test("keeps committed export state when the atomic RPC response is lost", async () => {
    runtime.savePromise = Promise.resolve(
      new Map([["submission-1", "agent-owner-uuid"]]),
    );
    exportMocks.completeExportPackage.mockRejectedValueOnce(
      new Error("Atomic export RPC response was lost"),
    );
    exportMocks.reconcileExportPackageCompletion.mockResolvedValueOnce({
      batch: {
        contentFingerprint: "fingerprint-1",
        createdAt: "2026-07-12T10:00:00.000Z",
        createdBy: "admin-production-uuid",
        fileName: "visaflow-export-package-1.xlsx",
        format: "xlsx",
        id: "export-batch-1",
        idempotencyKey: "package-1",
        rowCount: 1,
        submissionIds: ["submission-1"],
      },
      status: "committed" as const,
    });
    render(<App />);
    await screen.findByText("Загрузка данных Supabase...");
    await act(async () => {
      runtime.resolveLoad({
        ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
        submissions: [loadedSubmission],
      });
    });
    await screen.findByTestId("admin-workspace");

    fireEvent.click(screen.getByRole("button", { name: "Export submission" }));
    await act(async () => {
      await runtime.lastMutationPromise;
    });

    expect(runtime.exportStateCalls).toEqual(["file_generated", "file_downloaded"]);
    expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1);
    expect(runtime.lastMutationError).toBeNull();
    expect(exportMocks.reconcileExportPackageCompletion).toHaveBeenCalledTimes(1);
  });

  releaseT9Test("does not roll back an export whose canonical RPC outcome remains unknown", async () => {
    runtime.savePromise = Promise.resolve(
      new Map([["submission-1", "agent-owner-uuid"]]),
    );
    exportMocks.completeExportPackage.mockRejectedValueOnce(
      new Error("Atomic export RPC response was lost"),
    );
    exportMocks.reconcileExportPackageCompletion.mockResolvedValueOnce({
      status: "unknown" as const,
    });
    render(<App />);
    await screen.findByText("Загрузка данных Supabase...");
    await act(async () => {
      runtime.resolveLoad({
        ownerIdsBySubmissionId: new Map([["submission-1", "agent-owner-uuid"]]),
        submissions: [loadedSubmission],
      });
    });
    await screen.findByTestId("admin-workspace");

    fireEvent.click(screen.getByRole("button", { name: "Export submission" }));
    await act(async () => {
      await runtime.lastMutationPromise;
    });

    expect(runtime.exportStateCalls).toEqual(["file_generated", "file_downloaded"]);
    expect(persistenceMocks.saveCockpitSubmissionsForProfile).toHaveBeenCalledTimes(1);
    expect(runtime.lastMutationError?.message).toContain(
      "automatic rollback was skipped",
    );
  });
});
