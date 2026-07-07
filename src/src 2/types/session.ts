import type { Session } from "@supabase/supabase-js";
import type { Role } from "./domain";

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
