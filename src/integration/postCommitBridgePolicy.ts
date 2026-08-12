export type VisaflowPostCommitEventType =
  | "submission.action"
  | "admin.issue.add"
  | "admin.passport-section.approve"
  | "admin.ai.run"
  | "admin.ai.accept"
  | "admin.ai.dismiss"
  | "export.workbook-downloaded"
  | "export.complete";

export interface VisaflowPostCommitEvent {
  actorId: string;
  committedAt: string;
  eventId: string;
  payload: unknown;
  submissionIds: string[];
  type: VisaflowPostCommitEventType;
}

export type VisaflowPostCommitObserver = (
  event: VisaflowPostCommitEvent,
) => void | Promise<void>;

export type PostCommitBridgeDeliveryResult =
  | { attempts: number; status: "delivered" }
  | { attempts: number; status: "failed" }
  | { attempts: 0; status: "skipped" };

export interface PostCommitBridgeDelivery {
  event: VisaflowPostCommitEvent;
  isSessionCurrent: () => boolean;
  legacyObserver?: () => void | Promise<void>;
  observer?: VisaflowPostCommitObserver;
}

interface PostCommitBridgePolicyOptions {
  maxIdempotentAttempts?: number;
  onDeliveryFailure?: (event: VisaflowPostCommitEvent, attempts: number) => void;
}

const defaultMaxIdempotentAttempts = 2;
const retainedDeliveryLimit = 256;

function reportPostCommitBridgeFailure(
  event: VisaflowPostCommitEvent,
  attempts: number,
) {
  console.error("VisaFlow post-commit observer delivery failed", {
    attempts,
    eventId: event.eventId,
    submissionIds: event.submissionIds,
    type: event.type,
  });
}

export class PostCommitBridgePolicy {
  readonly #deliveries = new Map<
    string,
    Promise<PostCommitBridgeDeliveryResult>
  >();
  readonly #settledEventIds = new Set<string>();
  readonly #maxIdempotentAttempts: number;
  readonly #onDeliveryFailure: (
    event: VisaflowPostCommitEvent,
    attempts: number,
  ) => void;

  constructor(options: PostCommitBridgePolicyOptions = {}) {
    this.#maxIdempotentAttempts = Math.max(
      1,
      Math.min(options.maxIdempotentAttempts ?? defaultMaxIdempotentAttempts, 3),
    );
    this.#onDeliveryFailure =
      options.onDeliveryFailure ?? reportPostCommitBridgeFailure;
  }

  dispatch(
    delivery: PostCommitBridgeDelivery,
  ): Promise<PostCommitBridgeDeliveryResult> {
    const existing = this.#deliveries.get(delivery.event.eventId);
    if (existing) return existing;

    const task = this.#deliver(delivery);
    this.#deliveries.set(delivery.event.eventId, task);
    void task.then(
      () => this.#markSettled(delivery.event.eventId),
      () => this.#markSettled(delivery.event.eventId),
    );
    return task;
  }

  #markSettled(eventId: string) {
    this.#settledEventIds.add(eventId);
    while (this.#deliveries.size > retainedDeliveryLimit) {
      let settledEventId: string | undefined;
      for (const candidateEventId of this.#deliveries.keys()) {
        if (this.#settledEventIds.has(candidateEventId)) {
          settledEventId = candidateEventId;
          break;
        }
      }
      if (!settledEventId) return;
      this.#deliveries.delete(settledEventId);
      this.#settledEventIds.delete(settledEventId);
    }
  }

  async #deliver({
    event,
    isSessionCurrent,
    legacyObserver,
    observer,
  }: PostCommitBridgeDelivery): Promise<PostCommitBridgeDeliveryResult> {
    if (!isSessionCurrent()) return { attempts: 0, status: "skipped" };

    const callback = observer
      ? () => observer(event)
      : legacyObserver;
    if (!callback) return { attempts: 0, status: "skipped" };

    // Legacy callbacks have no idempotency envelope and are therefore
    // deliberately at-most-once. Only the new event observer can be retried.
    const maxAttempts = observer ? this.#maxIdempotentAttempts : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (!isSessionCurrent()) return { attempts: 0, status: "skipped" };
      try {
        await callback();
        return { attempts: attempt, status: "delivered" };
      } catch {
        if (attempt < maxAttempts) await Promise.resolve();
      }
    }

    this.#onDeliveryFailure(event, maxAttempts);
    return { attempts: maxAttempts, status: "failed" };
  }
}
