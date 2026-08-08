export type AuthRepairRole = "agent" | "admin";
export type AuthRepairPasswordMode = "generate" | "environment";

export type AuthRepairUser = {
  key: string;
  email: string;
  role: AuthRepairRole | "";
  displayName: string;
  organizationName: string;
  createIfMissing: boolean;
  passwordMode: AuthRepairPasswordMode;
  passwordEnv: string;
};

export type AuthRepairPlan = {
  schemaVersion: number;
  expectedProjectRef: string;
  expectedProjectUrl: string;
  resultPath?: string;
  users: unknown[];
};

export const authRepairSchemaVersion: number;
export const minimumRepairPasswordLength: number;

export function cleanAuthRepairValue(value: unknown): string;
export function normalizeAuthRepairEmail(value: unknown): string;
export function projectRefFromSupabaseUrl(value: unknown): string;
export function generatedAuthRepairPassword(): string;
export function mergeAuthRepairMetadata(
  existingMetadata: unknown,
  displayName: unknown,
): Record<string, unknown> & { password_setup_required: false };
export function normalizeAuthRepairUsers(rawUsers: unknown): AuthRepairUser[];
export function validateAuthRepairPlan(input: {
  config: Partial<AuthRepairPlan> | null | undefined;
  projectRef: unknown;
  projectUrl: unknown;
  requireAdminKey: boolean;
  requirePublishableKey: boolean;
  adminKey: unknown;
  publishableKey: unknown;
}): { failures: string[]; users: AuthRepairUser[] };
export function passwordForAuthRepairUser(
  user: AuthRepairUser,
  environment?: Record<string, string | undefined>,
): string;
export function defaultAuthRepairPlan(input: {
  expectedProjectRef: unknown;
  expectedProjectUrl: unknown;
}): AuthRepairPlan;
