import { describe, expect, test, vi } from "vitest";
import { commitUploadedMedia } from "../../src/modules/submissions/mediaUploadCommit";
import type { MediaStorageTarget } from "../../src/modules/submissions/mediaStoragePolicy";
import { mapSupabasePersistenceError } from "../../src/services/persistenceObservability";

const previousTarget: MediaStorageTarget = {
  bucket: "submission-media",
  path: "submissions/VF-1/applicants/app-1/selfie/old_selfie.jpg",
};
const uploadedTarget: MediaStorageTarget = {
  bucket: "submission-media",
  path: "submissions/VF-1/applicants/app-1/selfie/new_selfie.jpg",
};

describe("media upload commit boundary", () => {
  test("preserves the new object when a failed save has no terminal receipt", async () => {
    const persistenceError = new Error("database write failed");
    const remove = vi.fn(async () => undefined);

    await expect(
      commitUploadedMedia({
        confirmPersisted: async () => "unknown",
        persist: async () => {
          throw persistenceError;
        },
        remove,
        uploadedTarget,
      }),
    ).rejects.toThrow(
      "Результат сохранения не подтверждён; новый Storage-объект сохранён для безопасной сверки.",
    );
    expect(remove).not.toHaveBeenCalled();
  });

  test("removes the new object after a definitive server rollback", async () => {
    const persistenceError = mapSupabasePersistenceError(
      { code: "40001", message: "stale revision", status: 400 },
      {
        fallbackKind: "save",
        operation: "rpc.save_agent_submission_if_current",
      },
    );
    const remove = vi.fn(async () => undefined);

    await expect(
      commitUploadedMedia({
        confirmPersisted: async () => "unknown",
        persist: async () => {
          throw persistenceError;
        },
        remove,
        uploadedTarget,
      }),
    ).rejects.toBe(persistenceError);
    expect(remove).toHaveBeenCalledWith(uploadedTarget);
  });

  test("deletes the replaced object only after the new metadata commits", async () => {
    const calls: string[] = [];
    const result = await commitUploadedMedia({
      persist: async () => {
        calls.push("persist");
        return "saved";
      },
      previousTarget,
      remove: async (target) => {
        calls.push(`delete:${target.path}`);
      },
      uploadedTarget,
    });

    expect(result).toBe("saved");
    expect(calls).toEqual(["persist", `delete:${previousTarget.path}`]);
  });

  test("resolves the actually replaced target after the serialized persistence step", async () => {
    const calls: string[] = [];
    let latestTarget: MediaStorageTarget | null = null;

    await commitUploadedMedia({
      persist: async () => {
        calls.push("persist");
        latestTarget = previousTarget;
        return "saved";
      },
      previousTarget: () => latestTarget,
      remove: async (target) => {
        calls.push(`delete:${target.path}`);
      },
      uploadedTarget,
    });

    expect(calls).toEqual(["persist", `delete:${previousTarget.path}`]);
  });

  test("preserves an uploaded object when readback confirms the database commit", async () => {
    const persistenceError = new Error("response lost after commit");
    const remove = vi.fn(async () => undefined);

    await expect(
      commitUploadedMedia({
        confirmPersisted: async () => "committed",
        persist: async () => {
          throw persistenceError;
        },
        remove,
        uploadedTarget,
      }),
    ).rejects.toBe(persistenceError);
    expect(remove).not.toHaveBeenCalled();
  });

  test("cleans the exact replaced object after committed lost-response readback", async () => {
    const persistenceError = new Error("response lost after commit");
    const remove = vi.fn(async () => undefined);

    await expect(
      commitUploadedMedia({
        confirmPersisted: async () => "committed",
        persist: async () => {
          throw persistenceError;
        },
        previousTarget,
        remove,
        uploadedTarget,
      }),
    ).rejects.toBe(persistenceError);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(previousTarget);
  });

  test("preserves an uploaded object when canonical readback is unavailable", async () => {
    const remove = vi.fn(async () => undefined);

    await expect(
      commitUploadedMedia({
        confirmPersisted: async () => "unknown",
        persist: async () => {
          throw new Error("network unavailable");
        },
        remove,
        uploadedTarget,
      }),
    ).rejects.toThrow(
      "Результат сохранения не подтверждён; новый Storage-объект сохранён для безопасной сверки.",
    );
    expect(remove).not.toHaveBeenCalled();
  });

  test("retries cleanup and surfaces a non-silent manual cleanup error", async () => {
    const remove = vi.fn(async () => {
      throw new Error("storage unavailable");
    });

    await expect(
      commitUploadedMedia({
        persist: async () => "saved",
        previousTarget,
        remove,
        uploadedTarget,
      }),
    ).rejects.toThrow(
      "Новый файл сохранён, но прежний Storage-объект требует ручной очистки.",
    );
    expect(remove).toHaveBeenCalledTimes(3);
  });
});
