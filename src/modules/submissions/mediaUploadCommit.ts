import { deleteMediaFromStorage } from "./mediaStorage";
import type { MediaPersistenceReadback } from "./mediaStorage";
import type { MediaStorageTarget } from "./mediaStoragePolicy";
import { isDefinitivePersistenceRejection } from "../../services/persistenceObservability";

type MediaDelete = (target: MediaStorageTarget) => Promise<void>;

async function deleteMediaWithRetry(
  target: MediaStorageTarget,
  remove: MediaDelete,
  attempts = 3,
): Promise<void> {
  let latestError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await remove(target);
      return;
    } catch (error) {
      latestError = error;
    }
  }
  throw latestError;
}

export async function commitUploadedMedia<T>({
  confirmPersisted,
  persist,
  previousTarget,
  remove = deleteMediaFromStorage,
  uploadedTarget,
}: {
  confirmPersisted?: () => Promise<MediaPersistenceReadback>;
  persist: () => Promise<T>;
  previousTarget?: MediaStorageTarget | null | (() => MediaStorageTarget | null);
  remove?: MediaDelete;
  uploadedTarget?: MediaStorageTarget | null;
}): Promise<T> {
  let result: T;
  try {
    result = await persist();
  } catch (error) {
    if (uploadedTarget) {
      if (isDefinitivePersistenceRejection(error)) {
        try {
          await deleteMediaWithRetry(uploadedTarget, remove);
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "Сохранение отклонено, а новый Storage-объект требует ручной очистки.",
          );
        }
        throw error;
      }

      let persistenceState: MediaPersistenceReadback = "unknown";
      try {
        persistenceState = confirmPersisted ? await confirmPersisted() : "unknown";
      } catch {
        persistenceState = "unknown";
      }

      if (persistenceState === "committed") {
        const resolvedPreviousTarget =
          typeof previousTarget === "function" ? previousTarget() : previousTarget;
        if (
          resolvedPreviousTarget &&
          resolvedPreviousTarget.path !== uploadedTarget.path
        ) {
          try {
            await deleteMediaWithRetry(resolvedPreviousTarget, remove);
          } catch (cleanupError) {
            throw new AggregateError(
              [error, cleanupError],
              "Новый файл подтверждён в базе, но прежний Storage-объект требует ручной очистки.",
            );
          }
        }
      } else {
        throw new AggregateError(
          [error],
          "Результат сохранения не подтверждён; новый Storage-объект сохранён для безопасной сверки.",
        );
      }
    }
    throw error;
  }

  const resolvedPreviousTarget =
    typeof previousTarget === "function" ? previousTarget() : previousTarget;
  if (
    resolvedPreviousTarget &&
    uploadedTarget &&
    resolvedPreviousTarget.path !== uploadedTarget.path
  ) {
    try {
      await deleteMediaWithRetry(resolvedPreviousTarget, remove);
    } catch (cleanupError) {
      throw new AggregateError(
        [cleanupError],
        "Новый файл сохранён, но прежний Storage-объект требует ручной очистки.",
      );
    }
  }

  return result;
}
