import type { Role } from "../types/domain";
import type { AppProfile, AppSession } from "../types/session";
import { getSupabaseClient } from "../lib/supabase/client";
import { supabaseRuntimeConfig } from "../lib/supabase/config";
import { fetchCurrentProfile, upsertProfile } from "./profileService";
import { mapSupabasePersistenceError } from "./persistenceObservability";

export type { AppProfile, AppSession };

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

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function profileForSupabaseUser(user: {
  email?: string;
  id: string;
  user_metadata?: Record<string, unknown>;
}, options: {
  allowMissingProfileRecovery: boolean;
  fallback?: {
    displayName?: string;
    organizationName?: string | null;
  };
}): Promise<AppProfile> {
  const existingProfile = await fetchCurrentProfile(user.id);
  if (existingProfile) return existingProfile;

  const canRecoverMissingProfile =
    options.allowMissingProfileRecovery &&
    supabaseRuntimeConfig.evidence.target !== "production";

  if (!canRecoverMissingProfile) {
    throw new Error(
      "Supabase profile was not found for this user. Production profile repair requires owner-approved role assignment.",
    );
  }

  const email = user.email?.trim().toLowerCase() ?? "";
  const displayName =
    metadataString(user.user_metadata, "display_name") ??
    metadataString(user.user_metadata, "name") ??
    options.fallback?.displayName?.trim() ??
    email;
  const organizationName =
    metadataString(user.user_metadata, "organization_name") ??
    options.fallback?.organizationName ??
    null;
  const profile = await upsertProfile({
    id: user.id,
    email,
    displayName,
    organizationName,
    role: "agent",
  });

  if (!profile) {
    throw new Error("Supabase profile was not created for this user.");
  }

  return profile;
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

  const profile = await profileForSupabaseUser(data.session.user, {
    allowMissingProfileRecovery: true,
  });

  return {
    mode: "supabase",
    profile,
    supabaseSession: data.session,
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
