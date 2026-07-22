export type ExperiencePreferences = {
  compactDensity: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  showAiContext: boolean;
};

export const experiencePreferencesDefaults: ExperiencePreferences = {
  compactDensity: false,
  highContrast: false,
  reducedMotion: false,
  showAiContext: true,
};

export const experiencePreferencesStorageKey = "v19.workspace-experience.v1";

function validatedExperiencePreferences(value: unknown): ExperiencePreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return experiencePreferencesDefaults;
  }

  const candidate = value as Record<string, unknown>;
  return {
    compactDensity:
      typeof candidate.compactDensity === "boolean"
        ? candidate.compactDensity
        : experiencePreferencesDefaults.compactDensity,
    highContrast:
      typeof candidate.highContrast === "boolean"
        ? candidate.highContrast
        : experiencePreferencesDefaults.highContrast,
    reducedMotion:
      typeof candidate.reducedMotion === "boolean"
        ? candidate.reducedMotion
        : experiencePreferencesDefaults.reducedMotion,
    showAiContext:
      typeof candidate.showAiContext === "boolean"
        ? candidate.showAiContext
        : experiencePreferencesDefaults.showAiContext,
  };
}

export function readExperiencePreferences(): ExperiencePreferences {
  if (typeof window === "undefined") return experiencePreferencesDefaults;
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(experiencePreferencesStorageKey) ?? "null",
    );
    return validatedExperiencePreferences(value);
  } catch {
    return experiencePreferencesDefaults;
  }
}

export function applyExperiencePreferences(preferences: ExperiencePreferences): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.v19Density = preferences.compactDensity ? "compact" : "comfortable";
  root.dataset.v19AiContext = preferences.showAiContext ? "on" : "off";
  root.dataset.v19ReducedMotion = preferences.reducedMotion ? "on" : "off";
  root.dataset.v19Contrast = preferences.highContrast ? "high" : "default";
}

export function saveExperiencePreferences(
  preferences: ExperiencePreferences,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(
      experiencePreferencesStorageKey,
      JSON.stringify(preferences),
    );
    applyExperiencePreferences(preferences);
    return true;
  } catch {
    return false;
  }
}

export function initializeExperiencePreferences(): ExperiencePreferences {
  const preferences = readExperiencePreferences();
  applyExperiencePreferences(preferences);
  return preferences;
}
