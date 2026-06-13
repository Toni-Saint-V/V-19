import type { Session } from "@supabase/supabase-js";
import type { Role } from "../types/domain";
import { getSupabaseClient } from "../lib/supabase/client";
import { fetchCurrentProfile } from "./profileService";
import { mapSupabasePersistenceError } from "./persistenceObservability";

export interface AppProfile {
  id: string;
  email: string;
  displayName: string;
  organizationName: string | null;
  role: Role;
}

export interface AppSession {
  mode: "supabase" | "local-demo";
  profile: AppProfile;
  supabaseSession: Session | null;
}

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

  const profile = await fetchCurrentProfile(data.session.user.id);
  if (!profile) {
    throw new Error("Supabase profile was not found for this user.");
  }

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
