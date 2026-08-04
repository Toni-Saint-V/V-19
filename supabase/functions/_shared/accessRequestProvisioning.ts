export type AuthAdminUser = {
  email?: string | null;
  id: string;
  invited_at?: string | null;
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
  deleteUser: (
    userId: string,
    shouldSoftDelete?: boolean,
  ) => Promise<{ data: unknown; error: unknown | null }>;
  inviteUserByEmail: (
    email: string,
    options: { data: Record<string, unknown> },
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

function isAdminInvitedIdentity(user: AuthAdminUser | null): user is AuthAdminUser {
  return Boolean(user?.id && user.invited_at?.trim());
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
    const existing = users.find(
      (user) => normalizedEmail(user.email) === targetEmail,
    );
    if (existing) return existing;
    if (users.length < authUserPageSize) return null;
  }
  throw new Error("AUTH_USER_LOOKUP_PAGE_LIMIT_EXCEEDED");
}

export async function provisionAccessRequestInvite(
  authAdmin: AccessRequestAuthAdmin,
  email: string,
  metadata: Record<string, unknown>,
  replaceUnapprovedUserId?: string,
): Promise<string> {
  if (replaceUnapprovedUserId) {
    const { error } = await authAdmin.deleteUser(replaceUnapprovedUserId, false);
    if (error) throw error;
  } else {
    const existing = await findAuthUserByEmail(authAdmin, email);
    if (existing) throw new Error("ACCESS_REQUEST_IDENTITY_CONFLICT");
  }

  let inviteFailure: unknown = new Error("INVITE_USER_MISSING_ID");
  try {
    const { data, error } = await authAdmin.inviteUserByEmail(email, {
      data: metadata,
    });
    if (!error && data.user?.id) return data.user.id;
    inviteFailure = error ?? inviteFailure;
  } catch (error) {
    inviteFailure = error;
  }

  // An invite error leaves delivery uncertain even when Auth persisted an
  // invited identity. Remove only an identity with server-owned invite
  // provenance so an administrator can retry with a fresh, usable link.
  // A same-email user without that provenance may have won a concurrent public
  // signup race and must never be deleted or approved.
  const recovered = await findAuthUserByEmail(authAdmin, email);
  if (isAdminInvitedIdentity(recovered)) {
    const { error } = await authAdmin.deleteUser(recovered.id, false);
    if (error) throw error;
    throw inviteFailure;
  }
  if (recovered) throw new Error("ACCESS_REQUEST_IDENTITY_CONFLICT");
  throw inviteFailure;
}
