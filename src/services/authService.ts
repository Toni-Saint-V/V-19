import type { Session } from "@supabase/supabase-js";
import type { Role } from "../types/domain";
import { getSupabaseClient } from "../lib/supabase/client";
import { supabaseRuntimeConfig } from "../lib/supabase/config";
import { fetchCurrentProfile } from "./profileService";

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

export interface SignInResult {
  session: AppSession | null;
  error: string | null;
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
  if (error || !data.session?.user.email) return null;

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
    mode: supabaseRuntimeConfig.mode,
    profile: demoProfiles[role],
    supabaseSession: null,
  };
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<SignInResult> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      session: null,
      error: "Supabase is not configured for password sign-in.",
    };
  }

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session?.user.email) {
    return {
      session: null,
      error: "Sign-in failed. Check the email and password.",
    };
  }

  const profile = await fetchCurrentProfile(data.session.user.id);
  if (!profile) {
    await client.auth.signOut();
    return {
      session: null,
      error: "This account does not have a VisaFlow profile.",
    };
  }

  return {
    session: {
      mode: "supabase",
      profile,
      supabaseSession: data.session,
    },
    error: null,
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
