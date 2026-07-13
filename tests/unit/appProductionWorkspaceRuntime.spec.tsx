import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  actionActorId: "",
  issueActorId: "",
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

vi.mock("motion/react", async () => {
  const React = await import("react");
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
        React.createElement("div", props, children),
    },
  };
});

vi.mock("../../src/components/AccessGate", () => ({
  AccessGate: () => <div data-testid="access-gate" />,
}));

vi.mock("../../src/components/CommandCenter", () => ({
  CommandCenter: () => <div data-testid="agent-workspace" />,
}));

vi.mock("../../src/components/AdminWorkspace", async () => {
  const { useVisaflowBusinessBridge } = await vi.importActual<
    typeof import("../../src/integration/visaflowBusinessBridge")
  >("../../src/integration/visaflowBusinessBridge");

  return {
    AdminWorkspace: ({ submissions }: { submissions: Array<{ id: string }> }) => {
      const bridge = useVisaflowBusinessBridge();
      const capture = (promise: void | Promise<void> | undefined) => {
        runtime.lastMutationPromise = Promise.resolve(promise).catch((error) => {
          runtime.lastMutationError = error instanceof Error ? error : new Error(String(error));
        });
      };

      return (
        <div data-testid="admin-workspace">
          <span data-testid="submission-count">{submissions.length}</span>
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
            onClick={() => capture(bridge.onExportPackages?.(["submission-1"]))}
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
    _submissionIds: string[],
    exportState: string,
  ) => {
    runtime.exportStateCalls.push(exportState);
    return submissions.map((submission) => ({ ...submission, exportState }));
  },
  markSubmissionFileAccepted: (submission: Record<string, unknown>) => ({
    ...submission,
    fileAccepted: true,
  }),
}));

vi.mock("../../src/modules/submissions/aiSuggestions", () => ({
  acceptAiSuggestionAsIssue: (submission: unknown) => submission,
  dismissAiSuggestion: (submission: unknown) => submission,
  runAiReview: (submission: unknown) => submission,
}));

vi.mock("../../src/modules/submissions/exportWorkflow", () => exportMocks);

const persistenceMocks = vi.hoisted(() => ({
  loadCockpitSubmissionsForProfile: vi.fn(() => runtime.loadPromise),
  saveCockpitSubmissionsForProfile: vi.fn(() => runtime.savePromise),
}));

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
  accessRequestRepository: { listPendingAccessRequests: vi.fn(async () => []) },
  authRepository: {},
}));

vi.mock("../../src/shared/supabaseAuthRegistration", () => ({
  supabaseAccessRequestRepository: {
    listPendingAccessRequests: vi.fn(async () => []),
  },
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
  signInSupabaseWithPassword: vi.fn(),
  signOutCurrentSession: vi.fn(async () => undefined),
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
  persistenceMocks.loadCockpitSubmissionsForProfile.mockClear();
  persistenceMocks.saveCockpitSubmissionsForProfile.mockClear();
  exportMocks.completeExportPackage.mockClear();
  exportMocks.reconcileExportPackageCompletion.mockClear();
}

const loadedSubmission = {
  agentId: "agent-owner-uuid",
  id: "submission-1",
};

beforeEach(() => {
  resetDeferredRuntime();
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
});

describe("App production workspace runtime", () => {
  test("shows a blocking retry state instead of a false empty workspace on initial load failure", async () => {
    render(<App />);
    await screen.findByText("Загрузка данных Supabase...");

    await act(async () => {
      runtime.rejectLoad(new Error("Supabase read failed safely"));
    });

    expect(
      await screen.findByRole("heading", {
        name: "Не удалось загрузить данные Supabase",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Supabase read failed safely")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-workspace")).not.toBeInTheDocument();
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

  test("persists file_downloaded before the atomic export RPC and refreshes canonical state without a terminal draft save", async () => {
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

  test("restores a retryable export state only when canonical reconciliation proves the RPC did not commit", async () => {
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
    );
  });

  test("keeps committed export state when the atomic RPC response is lost", async () => {
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

  test("does not roll back an export whose canonical RPC outcome remains unknown", async () => {
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
