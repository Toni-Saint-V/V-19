import type { Role } from "../types/domain";
import type { AppProfile, AppSession } from "../types/session";
import { getSupabaseClient } from "../lib/supabase/client";
import { fetchCurrentProfile } from "./profileService";
import { mapSupabasePersistenceError } from "./persistenceObservability";

export type { AppProfile, AppSession };

export type PasswordResetRequestResult =
  | {
      message: string;
      status: "requested";
    }
  | {
      message: string;
      status: "unavailable";
    };

const demoProfiles: Record<Role, AppProfile> = {
  agent: {
    id: "agent-1",
    email: "agent@visaflow.demo",
    displayName: "Nord Travel",
    organizationName: "Nord Travel",
    role: "agent",
  },
  admin: {
    id: "admin-1",
    email: "ops@visaflow.demo",
    displayName: "Операции",
    organizationName: "VisaFlow Ops",
    role: "admin",
  },
};

async function profileForSupabaseUser(user: {
  email?: string;
  id: string;
}): Promise<AppProfile> {
  const existingProfile = await fetchCurrentProfile(user.id);
  if (existingProfile) return existingProfile;

  const email = user.email?.trim().toLowerCase() ?? "";
  const client = getSupabaseClient();
  if (client && email) {
    const { data: accessRequest } = await client
      .from("access_requests")
      .select("status,rejection_reason")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (accessRequest?.status === "pending") {
      throw new Error(
        "Заявка отправлена. Доступ появится после подтверждения администратором.",
      );
    }

    if (accessRequest?.status === "rejected") {
      throw new Error(
        accessRequest.rejection_reason
          ? `Заявка отклонена: ${accessRequest.rejection_reason}`
          : "Заявка отклонена.",
      );
    }
  }

  throw new Error(
    "Supabase profile was not found for this user. Production profile repair requires owner-approved role assignment.",
  );
}

export async function getCurrentAppSession(): Promise<AppSession | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.auth.getSession();
  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "auth.get_session",
      fallbackKind: "auth",
    });
  }
  if (!data.session?.user.email) return null;

  const profile = await fetchCurrentProfile(data.session.user.id);
  if (!profile) return null;

  return {
    mode: "supabase",
    profile,
    supabaseSession: data.session,
  };
}

export async function signInDemo(role: Role): Promise<AppSession> {
  return {
    mode: "local-demo",
    profile: demoProfiles[role],
    supabaseSession: null,
  };
}

export async function signInSupabaseWithPassword(
  email: string,
  password: string,
): Promise<AppSession> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase is inactive.");
  }

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "auth.sign_in_password",
      fallbackKind: "auth",
    });
  }
  if (!data.session?.user.id) {
    throw new Error("Supabase session was not returned.");
  }

  let profile: AppProfile;
  try {
    profile = await profileForSupabaseUser(data.session.user);
  } catch (profileError) {
    try {
      await client.auth.signOut();
    } catch {
      // Keep the original access-gate error visible to the login flow.
    }
    throw profileError;
  }

  return {
    mode: "supabase",
    profile,
    supabaseSession: data.session,
  };
}

export async function requestPasswordReset(
  email: string,
): Promise<PasswordResetRequestResult> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      status: "unavailable",
      message:
        "В local/dev режиме восстановление не отправляет email. Нужен Supabase Auth или email provider.",
    };
  }

  const { error } = await client.auth.resetPasswordForEmail(email);
  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "auth.reset_password",
      fallbackKind: "auth",
    });
  }

  return {
    status: "requested",
    message: "Если аккаунт существует, мы отправим инструкции на почту.",
  };
}

export async function signOutCurrentSession(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  await client.auth.signOut();
}

export function canAccessRole(profile: AppProfile | null, requiredRole: Role): boolean {
  if (!profile) return false;
  return profile.role === requiredRole;
}
