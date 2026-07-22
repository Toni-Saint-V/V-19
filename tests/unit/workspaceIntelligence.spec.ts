import { beforeEach, describe, expect, test } from "vitest";

import { initialSubmissions } from "../../src/modules/submissions/mockData";
import {
  buildWorkspaceIntelligence,
  workspaceIntelligenceClipboardText,
} from "../../src/modules/submissions/workspaceIntelligence";
import {
  applyExperiencePreferences,
  experiencePreferencesDefaults,
  experiencePreferencesStorageKey,
  initializeExperiencePreferences,
  readExperiencePreferences,
  saveExperiencePreferences,
} from "../../src/shared/ui/experiencePreferences";

const forbiddenAutonomy =
  /автоматически (?:одобр|отклон|измени)|решение принято ии|ai approved|guaranteed/i;

describe("workspace intelligence", () => {
  test("builds a deterministic agent priority brief from the active queue", () => {
    const intelligence = buildWorkspaceIntelligence(initialSubmissions, "agent");

    expect(intelligence.score).toBeGreaterThanOrEqual(0);
    expect(intelligence.score).toBeLessThanOrEqual(100);
    expect(intelligence.metrics).toHaveLength(4);
    expect(intelligence.plan.length).toBeGreaterThan(0);
    expect(
      initialSubmissions.some(
        (submission) => submission.id === intelligence.topSubmissionId,
      ),
    ).toBe(true);
    expect(
      [
        intelligence.headline,
        intelligence.summary,
        intelligence.topReason,
        ...intelligence.plan,
      ].join(" "),
    ).not.toMatch(forbiddenAutonomy);
  });

  test("builds an admin radar summary and keeps the priority actionable", () => {
    const intelligence = buildWorkspaceIntelligence(initialSubmissions, "admin");
    const total = intelligence.metrics.reduce((sum, metric) => sum + metric.value, 0);

    expect(total).toBeGreaterThan(0);
    expect(intelligence.topSubmissionId).toBeTruthy();
    expect(intelligence.topSubmissionTitle).toBeTruthy();
    expect(intelligence.plan[0]).toBeTruthy();
    expect(workspaceIntelligenceClipboardText(intelligence)).toContain("AI-сводка");
    expect(workspaceIntelligenceClipboardText(intelligence)).toContain("План:");
  });

  test("returns a calm completed state when only exported submissions remain", () => {
    const exported = initialSubmissions.slice(0, 2).map((submission) => ({
      ...submission,
      status: "exported" as const,
    }));

    const intelligence = buildWorkspaceIntelligence(exported, "admin");
    expect(intelligence).toMatchObject({ score: 100, tone: "clear" });
    expect(intelligence.topSubmissionId).toBeUndefined();
  });
});

describe("persisted experience preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
    for (const key of [
      "v19Density",
      "v19AiContext",
      "v19ReducedMotion",
      "v19Contrast",
    ]) {
      delete document.documentElement.dataset[key];
    }
  });

  test("recovers safely from absent storage and applies defaults", () => {
    expect(readExperiencePreferences()).toEqual(experiencePreferencesDefaults);
    initializeExperiencePreferences();
    expect(document.documentElement.dataset.v19AiContext).toBe("on");
    expect(document.documentElement.dataset.v19Density).toBe("comfortable");
  });

  test.each([
    ["malformed JSON", "{"],
    ["an array", JSON.stringify([true, false, true, false])],
    [
      "wrong boolean types",
      JSON.stringify({
        compactDensity: "false",
        highContrast: 1,
        reducedMotion: null,
        showAiContext: [],
      }),
    ],
  ])("falls back to defaults for %s", (_label, storedValue) => {
    window.localStorage.setItem(experiencePreferencesStorageKey, storedValue);

    expect(readExperiencePreferences()).toEqual(experiencePreferencesDefaults);
  });

  test("keeps valid booleans while ignoring invalid and extra persisted fields", () => {
    window.localStorage.setItem(
      experiencePreferencesStorageKey,
      JSON.stringify({
        compactDensity: true,
        extraPreference: true,
        highContrast: "true",
        reducedMotion: true,
        showAiContext: false,
      }),
    );

    expect(readExperiencePreferences()).toEqual({
      compactDensity: true,
      highContrast: false,
      reducedMotion: true,
      showAiContext: false,
    });
  });

  test("persists and applies every product preference", () => {
    const preferences = {
      compactDensity: true,
      highContrast: true,
      reducedMotion: true,
      showAiContext: false,
    };

    saveExperiencePreferences(preferences);

    expect(
      JSON.parse(window.localStorage.getItem(experiencePreferencesStorageKey) ?? ""),
    ).toEqual(preferences);
    expect(document.documentElement.dataset).toMatchObject({
      v19AiContext: "off",
      v19Contrast: "high",
      v19Density: "compact",
      v19ReducedMotion: "on",
    });
  });

  test("applies preferences without requiring storage", () => {
    applyExperiencePreferences({
      ...experiencePreferencesDefaults,
      highContrast: true,
    });
    expect(document.documentElement.dataset.v19Contrast).toBe("high");
  });
});
