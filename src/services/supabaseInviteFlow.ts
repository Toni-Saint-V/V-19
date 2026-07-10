type SupabaseInviteSession = {
  user: {
    email?: string | null;
    id: string;
    user_metadata?: Record<string, unknown>;
  };
};

type SupabaseInviteAuthError = {
  message?: string;
};

type SupabaseInviteAuthResult = {
  data: {
    session: SupabaseInviteSession | null;
  };
  error: SupabaseInviteAuthError | null;
};

export type SupabaseInviteAuthClient = {
  getSession: () => Promise<SupabaseInviteAuthResult>;
  signOut: (input: {
    scope: "local";
  }) => Promise<{ error: SupabaseInviteAuthError | null }>;
  updateUser: (input: {
    data: {
      password_setup_required: false;
    };
    password: string;
  }) => Promise<{ error: SupabaseInviteAuthError | null }>;
  verifyOtp: (input: {
    token_hash: string;
    type: "invite";
  }) => Promise<SupabaseInviteAuthResult>;
};

export type SupabaseInviteCallback = {
  tokenHash: string | null;
};

function authCallbackParameters(url: URL): {
  hash: URLSearchParams;
  search: URLSearchParams;
} {
  return {
    hash: new URLSearchParams(url.hash.replace(/^#/, "")),
    search: url.searchParams,
  };
}

function inviteFlowError(
  error: SupabaseInviteAuthError | null,
  fallbackMessage: string,
): Error {
  return new Error(error?.message?.trim() || fallbackMessage);
}

function pendingInviteIdentity(
  session: SupabaseInviteSession | null,
): { email: string; userId: string } | null {
  const passwordSetupRequired =
    session?.user.user_metadata?.password_setup_required === true;
  const email = session?.user.email?.trim().toLowerCase();
  const userId = session?.user.id.trim();

  if (!passwordSetupRequired || !email || !userId) {
    return null;
  }

  return { email, userId };
}

export function parseSupabaseInviteCallbackUrl(
  currentUrl: string,
): SupabaseInviteCallback | null {
  const url = new URL(currentUrl);
  const parameters = authCallbackParameters(url);
  const type = parameters.search.get("type") ?? parameters.hash.get("type");

  if (type !== "invite") {
    return null;
  }

  return {
    tokenHash:
      parameters.search.get("token_hash") ??
      parameters.hash.get("token_hash"),
  };
}

export function cleanSupabaseAuthCallbackUrl(currentUrl: string): string {
  if (!parseSupabaseInviteCallbackUrl(currentUrl)) {
    return currentUrl;
  }

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

export async function beginSupabaseInvitePasswordSetup(
  auth: SupabaseInviteAuthClient,
  currentUrl: string,
): Promise<{ email: string; userId: string } | null> {
  const callback = parseSupabaseInviteCallbackUrl(currentUrl);
  if (!callback) {
    return null;
  }

  const result = callback.tokenHash
    ? await auth.verifyOtp({
        token_hash: callback.tokenHash,
        type: "invite",
      })
    : await auth.getSession();

  if (result.error) {
    throw inviteFlowError(
      result.error,
      "Ссылка приглашения недействительна или устарела.",
    );
  }

  const identity = pendingInviteIdentity(result.data.session);
  if (!identity) {
    throw new Error("Supabase не подтвердил сессию установки пароля.");
  }

  return identity;
}

export async function getPendingSupabaseInvitePasswordSetup(
  auth: SupabaseInviteAuthClient,
): Promise<{ email: string; userId: string } | null> {
  const result = await auth.getSession();
  if (result.error) {
    throw inviteFlowError(
      result.error,
      "Не удалось восстановить сессию установки пароля.",
    );
  }

  return pendingInviteIdentity(result.data.session);
}

export async function completeSupabaseInvitePasswordSetup(
  auth: SupabaseInviteAuthClient,
  password: string,
): Promise<void> {
  if (password.length < 12) {
    throw new Error("Пароль должен содержать не меньше 12 символов.");
  }

  const updateResult = await auth.updateUser({
    data: {
      password_setup_required: false,
    },
    password,
  });
  if (updateResult.error) {
    throw inviteFlowError(updateResult.error, "Не удалось сохранить пароль.");
  }

  const signOutResult = await auth.signOut({ scope: "local" });
  if (signOutResult.error) {
    throw inviteFlowError(
      signOutResult.error,
      "Пароль сохранён, но не удалось завершить временную сессию.",
    );
  }
}
