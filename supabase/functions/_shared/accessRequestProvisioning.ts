type AuthAdminUser = {
  email?: string | null;
  id: string;
};

type AuthAdminListUsersResult = {
  data: { users: AuthAdminUser[] };
  error: unknown | null;
};

type AuthAdminInviteResult = {
  data: { user?: AuthAdminUser | null };
  error: unknown | null;
};

export type AccessRequestAuthAdmin = {
  inviteUserByEmail: (
    email: string,
    options: { data: Record<string, unknown>; redirectTo: string },
  ) => Promise<AuthAdminInviteResult>;
  listUsers: (options: {
    page: number;
    perPage: number;
  }) => Promise<AuthAdminListUsersResult>;
};

const authUserPageSize = 1000;
const authUserPageLimit = 100;

function normalizedEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export async function findAuthUserByEmail(
  authAdmin: AccessRequestAuthAdmin,
  email: string,
): Promise<AuthAdminUser | null> {
  const targetEmail = normalizedEmail(email);
  for (let page = 1; page <= authUserPageLimit; page += 1) {
    const { data, error } = await authAdmin.listUsers({
      page,
      perPage: authUserPageSize,
    });
    if (error) throw error;
    const users = data.users ?? [];
    const existing = users.find((user) => normalizedEmail(user.email) === targetEmail);
    if (existing) return existing;
    if (users.length < authUserPageSize) return null;
  }
  throw new Error("AUTH_USER_LOOKUP_PAGE_LIMIT_EXCEEDED");
}

export async function resolveAccessRequestUserId(
  authAdmin: AccessRequestAuthAdmin,
  email: string,
  metadata: Record<string, unknown>,
  redirectTo: string,
): Promise<string> {
  const existing = await findAuthUserByEmail(authAdmin, email);
  if (existing?.id) return existing.id;

  let inviteFailure: unknown = new Error("INVITE_USER_MISSING_ID");
  try {
    const { data, error } = await authAdmin.inviteUserByEmail(email, {
      data: metadata,
      redirectTo,
    });
    if (!error && data.user?.id) return data.user.id;
    inviteFailure = error ?? inviteFailure;
  } catch (error) {
    inviteFailure = error;
  }

  // The invite may have committed while its HTTP response was lost. Supabase
  // Auth rejects an already confirmed email, so reconcile by paginated,
  // server-side lookup before deciding that provisioning failed.
  const recovered = await findAuthUserByEmail(authAdmin, email);
  if (recovered?.id) return recovered.id;
  throw inviteFailure;
}
