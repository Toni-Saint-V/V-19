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

export async function signOutCurrentSession(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  await client.auth.signOut();
}

export function canAccessRole(profile: AppProfile | null, requiredRole: Role): boolean {
  if (!profile) return false;
  return profile.role === requiredRole;
}
