import type { Role, Screen } from "../types/domain";
import { getSupabaseClient } from "../lib/supabase/client";
import type { ProfileRow } from "../lib/supabase/database.types";
import type { AppProfile } from "./authService";
import { mapSupabasePersistenceError } from "./persistenceObservability";

function mapProfile(row: ProfileRow): AppProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    organizationName: row.organization_name,
    role: row.role,
  };
}

const profileSelect =
  "id,email,display_name,organization_name,role,created_at" as const;

export async function fetchCurrentProfile(userId: string): Promise<AppProfile | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("profiles")
    .select(profileSelect)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "profile.read",
      fallbackKind: "database",
    });
  }
  if (!data) return null;
  return mapProfile(data);
}

export async function upsertProfile(profile: AppProfile): Promise<AppProfile | null> {
  const client = getSupabaseClient();
  if (!client) return profile;

  const { data, error } = await client
    .from("profiles")
    .upsert({
      id: profile.id,
      email: profile.email,
      display_name: profile.displayName,
      organization_name: profile.organizationName,
    })
    .select(profileSelect)
    .single();

  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "profile.upsert",
      fallbackKind: "database",
    });
  }
  return mapProfile(data);
}

export function roleRouteStart(role: Role): Screen {
  return role === "admin" ? "admin-overview" : "agent-overview";
}
