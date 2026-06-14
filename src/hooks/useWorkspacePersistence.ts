import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeSubmission } from "../lib/workflow";
import { supabaseRuntimeConfig } from "../lib/supabase/config";
import {
  getCurrentAppSession,
  signInDemo,
  signInSupabaseWithPassword,
  signOutCurrentSession,
} from "../services/authService";
import {
  formatPersistenceFailureForUser,
  logPersistenceDiagnostics,
  userMessageForPersistenceError,
} from "../services/persistenceObservability";
import {
  collectPersistedStatusHistoryIds,
  loadWorkspaceSubmissions,
  saveLocalWorkspaceSubmissions,
  saveWorkspaceSubmission,
} from "../services/workspacePersistenceService";
import { deleteMediaFromStorage } from "../services/storageService";
import type { MediaStorageTarget } from "../services/storagePathPolicy";
import type { Submission, Role } from "../types/domain";
import type { AppSession } from "../types/session";

type SaveState = "idle" | "saving" | "error";

interface UseWorkspacePersistenceOptions {
  setToast: (message: string) => void;
}

function safeErrorMessage(error: unknown, fallback: string): string {
  const persistenceMessage = userMessageForPersistenceError(error, "");
  if (persistenceMessage) return persistenceMessage;

  if (error instanceof Error && error.message.trim()) {
    if (/password|credential|invalid login/i.test(error.message)) {
      return "Unable to sign in. Check email, password, and Supabase profile.";
    }
  }

  return fallback;
}

function safeFailureToast(error: unknown, fallback: string): string {
  return formatPersistenceFailureForUser(error, fallback);
}

export function useWorkspacePersistence({ setToast }: UseWorkspacePersistenceOptions) {
  const [session, setSession] = useState<AppSession | null>(null);
  const [authChecked, setAuthChecked] = useState(
    supabaseRuntimeConfig.selected !== "supabase",
  );
  const [authError, setAuthError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [remoteSaveDrainTick, setRemoteSaveDrainTick] = useState(0);
  const persistedStatusHistoryIdsRef = useRef<Map<string, Set<string>>>(new Map());
  const dirtySubmissionVersionsRef = useRef<Map<string, number>>(new Map());
  const pendingSaveMessagesRef = useRef<Map<string, string>>(new Map());
  const savingRemoteRef = useRef(false);
  const mountedRef = useRef(true);

  const isSupabaseSession = session?.mode === "supabase";
  const saveStatusLabel =
    saveState === "saving" ? "Saving" : saveState === "error" ? "Save failed" : "Saved";
  const saveStatusDescription =
    saveState === "error" && saveError ? saveError : saveStatusLabel;

  const rememberSubmissionHistoryPersisted = useCallback(
    (submission: Submission): void => {
      const current =
        persistedStatusHistoryIdsRef.current.get(submission.id) ?? new Set<string>();

      for (const item of submission.timeline ?? []) {
        if (item.id) current.add(item.id);
      }

      persistedStatusHistoryIdsRef.current.set(submission.id, current);
    },
    [],
  );

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function queueRemoteSave(submissionIds: string[], successMessage?: string): void {
    if (!isSupabaseSession) return;
    setSaveError("");

    for (const id of new Set(submissionIds)) {
      dirtySubmissionVersionsRef.current.set(
        id,
        (dirtySubmissionVersionsRef.current.get(id) ?? 0) + 1,
      );
      if (successMessage) pendingSaveMessagesRef.current.set(id, successMessage);
    }
  }

  function stageSubmissionUpdates(
    submissionIds: string[],
    updater: (current: Submission[]) => Submission[],
    successMessage?: string,
  ): void {
    queueRemoteSave(submissionIds, successMessage);
    setSubmissions((current) => updater(current).map(normalizeSubmission));

    if (!isSupabaseSession && successMessage) {
      setToast(successMessage);
    }
  }

  const reloadRemoteSubmissions = useCallback(
    async (activeSession: AppSession): Promise<void> => {
      setDataLoading(true);
      try {
        const loaded = (await loadWorkspaceSubmissions(activeSession)).map(
          normalizeSubmission,
        );
        persistedStatusHistoryIdsRef.current = collectPersistedStatusHistoryIds(loaded);
        setSubmissions(loaded);
      } finally {
        setDataLoading(false);
      }
    },
    [],
  );

  const persistExistingSubmission = useCallback(
    async (activeSession: AppSession, submission: Submission) => {
      await saveWorkspaceSubmission(
        activeSession,
        submission,
        persistedStatusHistoryIdsRef.current.get(submission.id),
      );
      rememberSubmissionHistoryPersisted(submission);
    },
    [rememberSubmissionHistoryPersisted],
  );

  async function persistSubmissionImmediately(
    activeSession: AppSession,
    submission: Submission,
    successMessage: string,
    cleanupTarget?: MediaStorageTarget,
  ): Promise<void> {
    setSaveState("saving");
    setSaveError("");
    try {
      await persistExistingSubmission(activeSession, submission);
      dirtySubmissionVersionsRef.current.delete(submission.id);
      pendingSaveMessagesRef.current.delete(submission.id);
      setSaveState("idle");
      setSaveError("");
      setToast(successMessage);
    } catch (error) {
      logPersistenceDiagnostics("Immediate Supabase save failed", error);
      if (cleanupTarget) {
        try {
          await deleteMediaFromStorage(cleanupTarget);
        } catch (cleanupError) {
          logPersistenceDiagnostics("Uploaded media cleanup failed", cleanupError);
        }
      }
      dirtySubmissionVersionsRef.current.delete(submission.id);
      pendingSaveMessagesRef.current.delete(submission.id);
      setSaveState("error");
      const message = safeFailureToast(
        error,
        "Remote save failed. Last saved Supabase data was reloaded.",
      );
      setSaveError(message);
      try {
        await reloadRemoteSubmissions(activeSession);
        setToast(message);
      } catch (reloadError) {
        logPersistenceDiagnostics(
          "Supabase reload after save failure failed",
          reloadError,
        );
        setToast("Remote save failed. Refresh before continuing.");
      }
    }
  }

  async function recoverRemoteFailure(
    activeSession: AppSession,
    error: unknown,
    fallback: string,
    reloadLogLabel: string,
  ): Promise<string> {
    setSaveState("error");
    const message = safeFailureToast(error, fallback);
    setSaveError(message);
    try {
      await reloadRemoteSubmissions(activeSession);
    } catch (reloadError) {
      logPersistenceDiagnostics(reloadLogLabel, reloadError);
    }
    return message;
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrapSupabaseSession() {
      if (supabaseRuntimeConfig.selected !== "supabase") {
        setAuthChecked(true);
        return;
      }

      setAuthChecked(false);
      setAuthError("");
      try {
        const currentSession = await getCurrentAppSession();
        if (cancelled) return;

        if (currentSession) {
          setSession(currentSession);
          setDataLoading(true);
          const loaded = (await loadWorkspaceSubmissions(currentSession)).map(
            normalizeSubmission,
          );
          if (cancelled) return;
          persistedStatusHistoryIdsRef.current =
            collectPersistedStatusHistoryIds(loaded);
          setSubmissions(loaded);
        }
      } catch (error) {
        logPersistenceDiagnostics("Supabase session bootstrap failed", error);
        if (!cancelled) {
          setAuthError(
            safeErrorMessage(error, "Unable to load the current Supabase session."),
          );
        }
      } finally {
        if (!cancelled) {
          setDataLoading(false);
          setAuthChecked(true);
        }
      }
    }

    void bootstrapSupabaseSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (supabaseRuntimeConfig.selected === "supabase") return;
    if (session?.mode !== "local-demo") return;
    saveLocalWorkspaceSubmissions(submissions);
  }, [session?.mode, submissions]);

  useEffect(() => {
    if (!isSupabaseSession || !session) return undefined;
    if (savingRemoteRef.current) return undefined;

    const queued = Array.from(dirtySubmissionVersionsRef.current.entries());
    if (!queued.length) return undefined;

    let cancelled = false;
    let started = false;
    const timer = window.setTimeout(() => {
      started = true;
      const saveQueuedChanges = async () => {
        const activeSession = session;
        const submissionsById = new Map(
          submissions.map((submission) => [submission.id, submission]),
        );
        let finalSuccessMessage = "";

        savingRemoteRef.current = true;
        setSaveState("saving");
        setSaveError("");
        try {
          for (const [id, version] of queued) {
            const submission = submissionsById.get(id);
            if (!submission) {
              dirtySubmissionVersionsRef.current.delete(id);
              pendingSaveMessagesRef.current.delete(id);
              continue;
            }

            await persistExistingSubmission(activeSession, submission);

            if (dirtySubmissionVersionsRef.current.get(id) === version) {
              dirtySubmissionVersionsRef.current.delete(id);
              finalSuccessMessage =
                pendingSaveMessagesRef.current.get(id) ?? finalSuccessMessage;
              pendingSaveMessagesRef.current.delete(id);
            }
          }

          if (!cancelled && mountedRef.current) {
            setSaveState("idle");
            setSaveError("");
            if (finalSuccessMessage) setToast(finalSuccessMessage);
          }
        } catch (error) {
          logPersistenceDiagnostics("Supabase autosave failed", error);
          dirtySubmissionVersionsRef.current.clear();
          pendingSaveMessagesRef.current.clear();
          if (!cancelled && mountedRef.current) {
            setSaveState("error");
            const message = safeFailureToast(
              error,
              "Remote save failed. Last saved Supabase data was reloaded.",
            );
            setSaveError(message);
            try {
              await reloadRemoteSubmissions(activeSession);
              setToast(message);
            } catch (reloadError) {
              logPersistenceDiagnostics(
                "Supabase reload after save failure failed",
                reloadError,
              );
              setToast("Remote save failed. Refresh before continuing.");
            }
          }
        } finally {
          savingRemoteRef.current = false;
          if (mountedRef.current && dirtySubmissionVersionsRef.current.size) {
            setRemoteSaveDrainTick((tick) => tick + 1);
          }
        }
      };

      void saveQueuedChanges();
    }, 450);

    return () => {
      if (!started) cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    isSupabaseSession,
    persistExistingSubmission,
    reloadRemoteSubmissions,
    remoteSaveDrainTick,
    session,
    setToast,
    submissions,
  ]);

  async function loginDemo(role: Role) {
    const nextSession = await signInDemo(role);
    const loaded = (await loadWorkspaceSubmissions(nextSession)).map(
      normalizeSubmission,
    );
    setSession(nextSession);
    setSubmissions(loaded);
    persistedStatusHistoryIdsRef.current = collectPersistedStatusHistoryIds(loaded);
  }

  async function loginSupabase(email: string, password: string): Promise<boolean> {
    setAuthError("");
    setSaveError("");
    setLoginBusy(true);
    setDataLoading(true);
    try {
      const nextSession = await signInSupabaseWithPassword(email, password);
      const loaded = (await loadWorkspaceSubmissions(nextSession)).map(
        normalizeSubmission,
      );
      setSession(nextSession);
      setSubmissions(loaded);
      persistedStatusHistoryIdsRef.current = collectPersistedStatusHistoryIds(loaded);
      setToast(`Signed in as ${nextSession.profile.displayName}.`);
      return true;
    } catch (error) {
      logPersistenceDiagnostics("Supabase sign-in failed", error);
      setAuthError(
        safeErrorMessage(
          error,
          "Unable to sign in. Check email, password, and Supabase profile.",
        ),
      );
      return false;
    } finally {
      setLoginBusy(false);
      setDataLoading(false);
    }
  }

  async function logout() {
    await signOutCurrentSession();
    setSession(null);
    setSubmissions([]);
    persistedStatusHistoryIdsRef.current = new Map();
    dirtySubmissionVersionsRef.current.clear();
    pendingSaveMessagesRef.current.clear();
    setSaveError("");
  }

  return {
    authChecked,
    authError,
    dataLoading,
    isSupabaseSession,
    loginBusy,
    loginDemo,
    loginSupabase,
    logout,
    persistExistingSubmission,
    persistSubmissionImmediately,
    recoverRemoteFailure,
    reloadRemoteSubmissions,
    saveError,
    saveState,
    saveStatusDescription,
    saveStatusLabel,
    session,
    setAuthError,
    setSaveError,
    setSaveState,
    setSubmissions,
    stageSubmissionUpdates,
    submissions,
  };
}
