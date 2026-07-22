import { describe, expect, test, vi } from "vitest";
import {
  PostCommitBridgePolicy,
  type VisaflowPostCommitEvent,
} from "../../src/integration/postCommitBridgePolicy";

function event(eventId = "event-1"): VisaflowPostCommitEvent {
  return {
    actorId: "admin-a",
    committedAt: "2026-07-22T10:00:00.000Z",
    eventId,
    payload: { submissionId: "submission-1" },
    submissionIds: ["submission-1"],
    type: "admin.issue.add",
  };
}

describe("PostCommitBridgePolicy", () => {
  test("retries only the idempotent observer with one stable event id", async () => {
    const observer = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary observer failure"))
      .mockResolvedValueOnce(undefined);
    const legacyObserver = vi.fn();
    const policy = new PostCommitBridgePolicy();
    const delivery = {
      event: event(),
      isSessionCurrent: () => true,
      legacyObserver,
      observer,
    };

    await expect(policy.dispatch(delivery)).resolves.toEqual({
      attempts: 2,
      status: "delivered",
    });
    await expect(policy.dispatch(delivery)).resolves.toEqual({
      attempts: 2,
      status: "delivered",
    });

    expect(observer).toHaveBeenCalledTimes(2);
    expect(observer.mock.calls.map(([payload]) => payload.eventId)).toEqual([
      "event-1",
      "event-1",
    ]);
    expect(legacyObserver).not.toHaveBeenCalled();
  });

  test("keeps legacy callbacks at-most-once and reports exhausted delivery", async () => {
    const onDeliveryFailure = vi.fn();
    const legacyObserver = vi.fn().mockRejectedValue(new Error("legacy failure"));
    const policy = new PostCommitBridgePolicy({ onDeliveryFailure });
    const delivery = {
      event: event("legacy-event"),
      isSessionCurrent: () => true,
      legacyObserver,
    };

    await expect(policy.dispatch(delivery)).resolves.toEqual({
      attempts: 1,
      status: "failed",
    });
    await policy.dispatch(delivery);

    expect(legacyObserver).toHaveBeenCalledTimes(1);
    expect(onDeliveryFailure).toHaveBeenCalledWith(delivery.event, 1);
  });

  test("skips every callback once the originating session is stale", async () => {
    const observer = vi.fn();
    const legacyObserver = vi.fn();
    const policy = new PostCommitBridgePolicy();

    await expect(
      policy.dispatch({
        event: event("stale-event"),
        isSessionCurrent: () => false,
        legacyObserver,
        observer,
      }),
    ).resolves.toEqual({ attempts: 0, status: "skipped" });

    expect(observer).not.toHaveBeenCalled();
    expect(legacyObserver).not.toHaveBeenCalled();
  });

  test("never evicts an in-flight idempotent delivery at the retention limit", async () => {
    let resolveObserver: (() => void) | undefined;
    const observerWait = new Promise<void>((resolve) => {
      resolveObserver = resolve;
    });
    const observer = vi.fn(() => observerWait);
    const policy = new PostCommitBridgePolicy();
    const deliveries = Array.from({ length: 257 }, (_, index) =>
      policy.dispatch({
        event: event(`in-flight-${index}`),
        isSessionCurrent: () => true,
        observer,
      }),
    );

    const repeatedFirst = policy.dispatch({
      event: event("in-flight-0"),
      isSessionCurrent: () => true,
      observer,
    });

    expect(repeatedFirst).toBe(deliveries[0]);
    expect(observer).toHaveBeenCalledTimes(257);
    resolveObserver?.();
    await expect(Promise.all(deliveries)).resolves.toHaveLength(257);
  });
});
