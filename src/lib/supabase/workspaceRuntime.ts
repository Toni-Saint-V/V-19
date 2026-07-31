import type { SupabaseRuntimeConfig } from "./config";

export const workspaceRefreshIntervalMs = 10_000;
export const workspaceMutationQueueDrainTimeoutMs = 2_000;

export type WorkspaceDataStatus =
  | "blocked"
  | "empty"
  | "error"
  | "idle"
  | "loading"
  | "ready";

export type WorkspaceRefreshTrigger = "interval" | "recovery";

export type WorkspaceSessionToken = {
  generation: number;
  userId: string;
};

type WorkspaceRefreshRun = () => Promise<void>;

export async function waitForWorkspaceMutationQueueDrain(
  pending: Promise<unknown>,
  timeoutMs = workspaceMutationQueueDrainTimeoutMs,
): Promise<"settled" | "timed_out"> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const settled = pending.then(
    () => "settled" as const,
    () => "settled" as const,
  );
  const timedOut = new Promise<"timed_out">((resolve) => {
    timeoutId = setTimeout(() => resolve("timed_out"), Math.max(0, timeoutMs));
  });

  const result = await Promise.race([settled, timedOut]);
  if (timeoutId !== undefined) clearTimeout(timeoutId);
  return result;
}

export class WorkspaceRefreshCoordinator {
  private inFlight: Promise<void> | null = null;
  private queuedRun: WorkspaceRefreshRun | null = null;

  get hasInFlightRequest(): boolean {
    return this.inFlight !== null;
  }

  get hasQueuedRequest(): boolean {
    return this.queuedRun !== null;
  }

  invalidate(): void {
    this.inFlight = null;
    this.queuedRun = null;
  }

  request(run: WorkspaceRefreshRun, blocked = false): Promise<void> {
    if (blocked) {
      this.queuedRun = run;
      return Promise.resolve();
    }

    if (this.inFlight) {
      this.queuedRun = run;
      return this.inFlight;
    }

    this.queuedRun = null;
    return this.start(run);
  }

  private start(run: WorkspaceRefreshRun): Promise<void> {
    const request = Promise.resolve()
      .then(run)
      .finally(() => {
        if (this.inFlight !== request) return;

        this.inFlight = null;
        const queuedRun = this.queuedRun;
        this.queuedRun = null;
        if (queuedRun) {
          void this.start(queuedRun).catch(() => undefined);
        }
      });

    this.inFlight = request;
    return request;
  }
}

export function shouldBlockLocalDemoDataSource(
  config: Pick<SupabaseRuntimeConfig, "selected" | "target">,
  localDemoBuildEnabled = true,
): boolean {
  if (!localDemoBuildEnabled) return config.selected !== "supabase";
  return config.target === "supabase" && config.selected !== "supabase";
}

export function canRefreshVisibleWorkspace(
  visibilityState: "hidden" | "prerender" | "unloaded" | "visible" | undefined,
): boolean {
  return visibilityState === undefined || visibilityState === "visible";
}

export function shouldRequestWorkspaceRefresh(
  trigger: WorkspaceRefreshTrigger,
  serviceRestricted: boolean,
): boolean {
  return trigger === "recovery" || !serviceRestricted;
}

export function isLatestWorkspaceResponse(
  requestId: number,
  latestRequestId: number,
): boolean {
  return requestId === latestRequestId;
}

export function isCurrentWorkspaceSession(
  token: WorkspaceSessionToken,
  currentGeneration: number,
  currentUserId: string | null,
): boolean {
  return (
    token.generation === currentGeneration &&
    token.userId === currentUserId
  );
}

export function workspaceInitialGate(
  status: WorkspaceDataStatus,
  dataSessionUserId: string | undefined,
  currentSessionUserId: string,
  hasResolvedCanonicalData: boolean,
): "error" | "loading" | "workspace" {
  if (dataSessionUserId !== currentSessionUserId) return "loading";
  if (status === "idle" || (status === "loading" && !hasResolvedCanonicalData)) {
    return "loading";
  }
  if (status === "error" && !hasResolvedCanonicalData) return "error";
  return "workspace";
}

export function workspaceDataState(
  count: number,
): "empty" | "ready" {
  return count > 0 ? "ready" : "empty";
}
