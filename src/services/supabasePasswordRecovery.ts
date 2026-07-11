type RecoverySession = {
  user: {
    email?: string | null;
    id: string;
  };
};

type RecoveryAuthError = { message?: string };

type RecoveryAuthResult = {
  data: { session: RecoverySession | null };
  error: RecoveryAuthError | null;
};

export type SupabaseRecoveryAuthClient = {
  getSession: () => Promise<RecoveryAuthResult>;
  signOut: (input: { scope: "local" }) => Promise<{ error: RecoveryAuthError | null }>;
  updateUser: (input: { password: string }) => Promise<{ error: RecoveryAuthError | null }>;
  verifyOtp: (input: {
    token_hash: string;
    type: "recovery";
  }) => Promise<RecoveryAuthResult>;
};

export type SupabaseRecoveryCallback = { tokenHash: string | null };

export function parseSupabaseRecoveryCallbackUrl(
  currentUrl: string,
): SupabaseRecoveryCallback | null {
  const url = new URL(currentUrl);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const type = url.searchParams.get("type") ?? hash.get("type");
  if (type !== "recovery") return null;

  return {
    tokenHash: url.searchParams.get("token_hash") ?? hash.get("token_hash"),
  };
}

export function cleanSupabaseRecoveryCallbackUrl(currentUrl: string): string {
  if (!parseSupabaseRecoveryCallbackUrl(currentUrl)) return currentUrl;
  const url = new URL(currentUrl);
  [
    "code",
    "error",
    "error_code",
    "error_description",
    "token_hash",
    "type",
  ].forEach((parameter) => url.searchParams.delete(parameter));
  url.hash = "";
  return url.toString();
}

export async function beginSupabasePasswordRecovery(
  auth: SupabaseRecoveryAuthClient,
  currentUrl: string,
): Promise<{ email: string; userId: string } | null> {
  const callback = parseSupabaseRecoveryCallbackUrl(currentUrl);
  if (!callback) return null;

  const result = callback.tokenHash
    ? await auth.verifyOtp({ token_hash: callback.tokenHash, type: "recovery" })
    : await auth.getSession();
  if (result.error) {
    throw recoveryError(result.error, "Ссылка восстановления недействительна или устарела.");
  }

  const email = result.data.session?.user.email?.trim().toLowerCase();
  const userId = result.data.session?.user.id.trim();
  if (!email || !userId) {
    throw new Error("Supabase не подтвердил сессию восстановления пароля.");
  }
  return { email, userId };
}

export async function completeSupabasePasswordRecovery(
  auth: SupabaseRecoveryAuthClient,
  password: string,
): Promise<void> {
  if (password.length < 12) {
    throw new Error("Пароль должен содержать не меньше 12 символов.");
  }

  const updateResult = await auth.updateUser({ password });
  if (updateResult.error) {
    throw recoveryError(updateResult.error, "Не удалось сохранить новый пароль.");
  }

  const signOutResult = await auth.signOut({ scope: "local" });
  if (signOutResult.error) {
    throw recoveryError(
      signOutResult.error,
      "Пароль сохранён, но временную recovery-сессию не удалось завершить.",
    );
  }
}

function recoveryError(error: RecoveryAuthError | null, fallback: string): Error {
  return new Error(error?.message?.trim() || fallback);
}
