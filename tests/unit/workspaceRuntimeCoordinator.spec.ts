import { describe, expect, test, vi } from "vitest";
import {
  isCurrentWorkspaceSession,
  WorkspaceRefreshCoordinator,
  workspaceInitialGate,
} from "../../src/lib/supabase/workspaceRuntime";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("workspace refresh coordination", () => {
  test("keeps one request in flight and collapses a burst into one queued refresh", async () => {
    const first = deferred();
    const run = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const coordinator = new WorkspaceRefreshCoordinator();

    const initialRequest = coordinator.request(run);
    void coordinator.request(run);
    void coordinator.request(run);
    await Promise.resolve();

    expect(run).toHaveBeenCalledTimes(1);
    expect(coordinator.hasInFlightRequest).toBe(true);
    expect(coordinator.hasQueuedRequest).toBe(true);

    first.resolve();
    await initialRequest;
    await Promise.resolve();
    await Promise.resolve();

    expect(run).toHaveBeenCalledTimes(2);
    expect(coordinator.hasQueuedRequest).toBe(false);
  });

  test("queues refresh while a mutation blocks reads and runs once after release", async () => {
    const run = vi.fn(async () => undefined);
    const coordinator = new WorkspaceRefreshCoordinator();

    await coordinator.request(run, true);
    expect(run).not.toHaveBeenCalled();
    expect(coordinator.hasQueuedRequest).toBe(true);

    await coordinator.request(run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(coordinator.hasQueuedRequest).toBe(false);
  });

  test("detaches an invalidated session request without blocking the new session", async () => {
    const stale = deferred();
    const current = deferred();
    const staleRun = vi.fn(() => stale.promise);
    const currentRun = vi.fn(() => current.promise);
    const coordinator = new WorkspaceRefreshCoordinator();

    const staleRequest = coordinator.request(staleRun);
    await Promise.resolve();
    coordinator.invalidate();
    const currentRequest = coordinator.request(currentRun);
    await Promise.resolve();

    expect(staleRun).toHaveBeenCalledTimes(1);
    expect(currentRun).toHaveBeenCalledTimes(1);

    current.resolve();
    await currentRequest;
    stale.resolve();
    await staleRequest;

    expect(coordinator.hasInFlightRequest).toBe(false);
    expect(coordinator.hasQueuedRequest).toBe(false);
  });
});

describe("workspace session and initial render guards", () => {
  test("rejects results from a previous generation or a different user", () => {
    const token = { generation: 4, userId: "agent-a" };

    expect(isCurrentWorkspaceSession(token, 4, "agent-a")).toBe(true);
    expect(isCurrentWorkspaceSession(token, 5, "agent-a")).toBe(false);
    expect(isCurrentWorkspaceSession(token, 4, "agent-b")).toBe(false);
    expect(isCurrentWorkspaceSession(token, 4, null)).toBe(false);
  });

  test("does not expose an empty workspace before the active user's load resolves", () => {
    expect(workspaceInitialGate("idle", undefined, "agent-a", false)).toBe(
      "loading",
    );
    expect(workspaceInitialGate("ready", "admin-a", "agent-a", true)).toBe(
      "loading",
    );
    expect(workspaceInitialGate("loading", "agent-a", "agent-a", false)).toBe(
      "loading",
    );
    expect(workspaceInitialGate("loading", "agent-a", "agent-a", true)).toBe(
      "workspace",
    );
    expect(workspaceInitialGate("error", "agent-a", "agent-a", false)).toBe(
      "error",
    );
    expect(workspaceInitialGate("empty", "agent-a", "agent-a", true)).toBe(
      "workspace",
    );
    expect(workspaceInitialGate("ready", "agent-a", "agent-a", true)).toBe(
      "workspace",
    );
  });
});
