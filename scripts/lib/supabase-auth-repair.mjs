import { randomBytes } from "node:crypto";

export const authRepairSchemaVersion = 1;
export const minimumRepairPasswordLength = 12;

export function cleanAuthRepairValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeAuthRepairEmail(value) {
  return cleanAuthRepairValue(value).toLowerCase();
}

export function projectRefFromSupabaseUrl(value) {
  const raw = cleanAuthRepairValue(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    const [projectRef, ...rest] = url.hostname.split(".");
    const rootPath = url.pathname === "" || url.pathname === "/";
    const canonical =
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      rootPath;
    if (!canonical || !projectRef || rest.join(".") !== "supabase.co") {
      return "";
    }
    return projectRef;
  } catch {
    return "";
  }
}

export function generatedAuthRepairPassword() {
  return `${randomBytes(24).toString("base64url")}Aa1!`;
}

export function mergeAuthRepairMetadata(existingMetadata, displayName) {
  const metadata = isRecord(existingMetadata) ? { ...existingMetadata } : {};
  const normalizedDisplayName = cleanAuthRepairValue(displayName);
  if (normalizedDisplayName) metadata.display_name = normalizedDisplayName;
  metadata.password_setup_required = false;
  return metadata;
}

export function normalizeAuthRepairUsers(rawUsers) {
  if (!Array.isArray(rawUsers)) return [];

  return rawUsers.map((rawUser, index) => {
    const user = isRecord(rawUser) ? rawUser : {};
    return {
      key: cleanAuthRepairValue(user.key) || `auth-repair-${index + 1}`,
      email: normalizeAuthRepairEmail(user.email),
      role: user.role === "admin" ? "admin" : user.role === "agent" ? "agent" : "",
      displayName: cleanAuthRepairValue(user.displayName),
      organizationName: cleanAuthRepairValue(user.organizationName),
      createIfMissing: user.createIfMissing === true,
      passwordMode: user.passwordMode === "environment" ? "environment" : "generate",
      passwordEnv: cleanAuthRepairValue(user.passwordEnv),
    };
  });
}

export function validateAuthRepairPlan({
  config,
  projectRef,
  projectUrl,
  requireAdminKey,
  requirePublishableKey,
  adminKey,
  publishableKey,
}) {
  const failures = [];
  const normalizedProjectRef = cleanAuthRepairValue(projectRef);
  const normalizedProjectUrl = cleanAuthRepairValue(projectUrl);
  const expectedProjectRef = cleanAuthRepairValue(config?.expectedProjectRef);
  const expectedProjectUrl = cleanAuthRepairValue(config?.expectedProjectUrl);
  const users = normalizeAuthRepairUsers(config?.users);
  const emails = users.map((user) => user.email).filter(Boolean);
  const keys = users.map((user) => user.key).filter(Boolean);

  if (config?.schemaVersion !== authRepairSchemaVersion) {
    failures.push(`schemaVersion must be ${authRepairSchemaVersion}`);
  }
  if (!normalizedProjectRef) failures.push("production project ref is missing");
  if (!normalizedProjectUrl) failures.push("production project URL is missing");
  if (projectRefFromSupabaseUrl(normalizedProjectUrl) !== normalizedProjectRef) {
    failures.push("project URL and project ref do not match");
  }
  if (!expectedProjectRef) failures.push("expectedProjectRef is missing");
  if (expectedProjectRef && expectedProjectRef !== normalizedProjectRef) {
    failures.push("target project ref differs from the repair plan");
  }
  if (!expectedProjectUrl) failures.push("expectedProjectUrl is missing");
  if (expectedProjectUrl && expectedProjectUrl !== normalizedProjectUrl) {
    failures.push("target project URL differs from the repair plan");
  }
  if (requireAdminKey && !cleanAuthRepairValue(adminKey)) {
    failures.push("admin API key is missing");
  }
  if (requirePublishableKey && !cleanAuthRepairValue(publishableKey)) {
    failures.push("publishable key is missing");
  }
  if (
    cleanAuthRepairValue(adminKey) &&
    cleanAuthRepairValue(adminKey) === cleanAuthRepairValue(publishableKey)
  ) {
    failures.push("admin API key and publishable key must differ");
  }
  if (!users.length) failures.push("at least one repair user is required");
  if (users.some((user) => !isValidEmail(user.email))) {
    failures.push("every repair user must have a valid email");
  }
  if (new Set(emails).size !== emails.length) {
    failures.push("repair user emails must be unique");
  }
  if (new Set(keys).size !== keys.length) {
    failures.push("repair user keys must be unique");
  }
  if (users.some((user) => user.role !== "agent" && user.role !== "admin")) {
    failures.push("every repair user role must be agent or admin");
  }
  if (
    users.some(
      (user) => user.passwordMode === "environment" && !user.passwordEnv,
    )
  ) {
    failures.push("environment password mode requires passwordEnv");
  }

  return { failures, users };
}

export function passwordForAuthRepairUser(user, environment = process.env) {
  if (user.passwordMode === "environment") {
    const password = cleanAuthRepairValue(environment[user.passwordEnv]);
    if (password.length < minimumRepairPasswordLength) {
      throw new Error(
        `${user.key}: ${user.passwordEnv} must contain at least ` +
          `${minimumRepairPasswordLength} characters`,
      );
    }
    return password;
  }

  return generatedAuthRepairPassword();
}

export function defaultAuthRepairPlan({ expectedProjectRef, expectedProjectUrl }) {
  return {
    schemaVersion: authRepairSchemaVersion,
    expectedProjectRef: cleanAuthRepairValue(expectedProjectRef),
    expectedProjectUrl: cleanAuthRepairValue(expectedProjectUrl),
    users: [
      {
        key: "agent-account",
        email: "",
        role: "agent",
        displayName: "",
        organizationName: "",
        createIfMissing: false,
        passwordMode: "generate",
        passwordEnv: "",
      },
      {
        key: "admin-account",
        email: "",
        role: "admin",
        displayName: "",
        organizationName: "",
        createIfMissing: false,
        passwordMode: "generate",
        passwordEnv: "",
      },
    ],
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
