import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { WorkspaceExperienceSettingsScreen } from "../../src/components/AdminSystemSettingsScreen";
import {
  V19_AGENT_INTERACTION_CONTRACTS,
  V19_AGENT_MUTATION_CHECK_TARGETS,
  agentInteractionProps,
  auditAgentInteractionBusinessIntentCompatibility,
  auditAgentInteractionControls,
  isAgentInteractionId,
} from "../../src/modules/submissions/agentInteractionContract";
import {
  V19_BUSINESS_CLICK_CONTRACTS,
  businessClickContractFor,
} from "../../src/modules/submissions/businessClickContract";
import {
  applyExperiencePreferences,
  experiencePreferencesDefaults,
  experiencePreferencesStorageKey,
} from "../../src/shared/ui/experiencePreferences";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  window.localStorage.clear();
  applyExperiencePreferences(experiencePreferencesDefaults);
});

describe("agent interaction contract", () => {
  test("keeps every id stable and maps agent business mutations to domain intents", () => {
    const entries = Object.entries(V19_AGENT_INTERACTION_CONTRACTS);
    const ids = entries.map(([, contract]) => contract.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const [key, contract] of entries) {
      expect(contract.id).toBe(key);
      expect(contract.expectedEffect.trim()).not.toBe("");
      expect(contract.proof.length).toBeGreaterThan(0);
      if ("businessIntent" in contract && contract.businessIntent) {
        expect(businessClickContractFor(contract.businessIntent)).toBeDefined();
      }
      if (contract.role === "agent" && contract.kind === "mutation") {
        expect("businessIntent" in contract && contract.businessIntent).toBeTruthy();
      }
      if (contract.kind === "mutation") {
        expect(contract.writeScope.requiredCheckedTargets).toEqual(
          V19_AGENT_MUTATION_CHECK_TARGETS,
        );
        expect(contract.writeScope.requiredNetworkTargets.length).toBeGreaterThan(0);
        expect(contract.writeScope.requiredChangedTargets.length).toBeGreaterThan(0);
        expect(
          contract.writeScope.requiredNetworkTargets.every((target) =>
            contract.writeScope.allowedNetworkTargets.includes(target),
          ),
        ).toBe(true);
        expect(
          contract.writeScope.requiredChangedTargets.every((target) =>
            contract.writeScope.allowedChangedTargets.includes(target),
          ),
        ).toBe(true);
      }
      if (
        [
          "clipboard",
          "device_preference",
          "dialog",
          "download",
          "filter",
          "input",
          "navigation",
        ].includes(contract.kind)
      ) {
        expect(contract.proof).toContain("no-network-write");
      }
    }

    const representedAgentIntents = new Set(
      entries.flatMap(([, contract]) =>
        contract.role === "agent" && "businessIntent" in contract
          ? [contract.businessIntent]
          : [],
      ),
    );
    const requiredAgentIntents = Object.entries(V19_BUSINESS_CLICK_CONTRACTS)
      .filter(([, contract]) => contract.ownerRole === "agent")
      .map(([intent]) => intent);

    expect([...representedAgentIntents].sort()).toEqual(
      expect.arrayContaining(requiredAgentIntents.sort()),
    );
    expect(auditAgentInteractionBusinessIntentCompatibility()).toEqual([]);
  });

  test("matches drawer conditional controls to the exact live status mapping", () => {
    expect(V19_AGENT_INTERACTION_CONTRACTS["drawer.save-progress"].statusFixtures)
      .toEqual(["draft"]);
    expect(V19_AGENT_INTERACTION_CONTRACTS["drawer.submit-review"].statusFixtures)
      .toEqual(["in_progress"]);
    expect(
      V19_AGENT_INTERACTION_CONTRACTS["drawer.submit-corrections"].statusFixtures,
    ).toEqual(["returned"]);
    expect(
      V19_AGENT_INTERACTION_CONTRACTS["drawer.submit-corrections"]
        .disabledStatusFixtures,
    ).toEqual(["requires_action"]);
    expect(V19_AGENT_INTERACTION_CONTRACTS["drawer.open-history"].statusFixtures)
      .toEqual([
        "submitted_for_review",
        "corrections_received",
        "ready_for_export",
        "exported",
      ]);
  });

  test("fails closed for missing or unknown enabled controls", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <button data-v19-interaction-id="shell.navigate-actions">known</button>
      <button>missing</button>
      <button data-v19-interaction-id="unknown.control">unknown</button>
      <button disabled>disabled</button>
      <input readonly value="read only" />
      <div tabindex="0">focus target, not a control</div>
    `;

    expect(auditAgentInteractionControls(root).map((finding) => finding.reason)).toEqual([
      "missing",
      "unknown",
    ]);
  });

  test("rejects inherited prototype keys as unknown interaction ids", () => {
    expect(isAgentInteractionId("constructor")).toBe(false);
    expect(isAgentInteractionId("toString")).toBe(false);
    expect(isAgentInteractionId("shell.navigate-actions")).toBe(true);

    const root = document.createElement("div");
    root.innerHTML = `
      <button data-v19-interaction-id="constructor">constructor</button>
      <button data-v19-interaction-id="toString">toString</button>
    `;

    expect(auditAgentInteractionControls(root).map((finding) => finding.reason)).toEqual([
      "unknown",
      "unknown",
    ]);
  });

  test("denies a known control rendered for the wrong role", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <button data-v19-interaction-id="shell.navigate-actions">agent only</button>
      <button data-v19-interaction-id="access.open-login">anonymous only</button>
    `;

    expect(
      auditAgentInteractionControls(root, { role: "admin" }).map((finding) => ({
        interactionId: finding.interactionId,
        reason: finding.reason,
      })),
    ).toEqual([
      { interactionId: "shell.navigate-actions", reason: "wrong-role" },
      { interactionId: "access.open-login", reason: "wrong-role" },
    ]);

    expect(auditAgentInteractionControls(root, { role: "agent" })).toEqual([
      expect.objectContaining({
        interactionId: "access.open-login",
        reason: "wrong-role",
      }),
    ]);
  });

  test("persists agent device preferences, changes the DOM, and survives remount", () => {
    const view = render(
      <WorkspaceExperienceSettingsScreen
        currentIdentity="CODEX-E2E-agent"
        instrumentAgentInteractions
      />,
    );

    const compact = screen.getByRole("switch", { name: "Компактная плотность" });
    const reducedMotion = screen.getByRole("switch", { name: "Минимум анимации" });
    fireEvent.click(compact);
    fireEvent.click(reducedMotion);

    expect(compact).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset).toMatchObject({
      v19Density: "compact",
      v19ReducedMotion: "on",
    });
    expect(JSON.parse(window.localStorage.getItem(experiencePreferencesStorageKey) ?? "{}"))
      .toMatchObject({ compactDensity: true, reducedMotion: true });
    expect(auditAgentInteractionControls(view.container)).toEqual([]);

    view.unmount();
    applyExperiencePreferences(experiencePreferencesDefaults);
    render(
      <WorkspaceExperienceSettingsScreen
        currentIdentity="CODEX-E2E-agent"
        instrumentAgentInteractions
      />,
    );

    expect(screen.getByRole("switch", { name: "Компактная плотность" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(document.documentElement.dataset.v19Density).toBe("compact");
  });

  test("rolls back a preference when browser persistence fails", () => {
    const setItem = vi.fn(() => {
      throw new Error("quota exceeded");
    });
    vi.spyOn(window, "localStorage", "get").mockReturnValue({
      setItem,
    } as unknown as Storage);
    render(
      <WorkspaceExperienceSettingsScreen
        currentIdentity="CODEX-E2E-agent"
        instrumentAgentInteractions
      />,
    );

    const compact = screen.getByRole("switch", { name: "Компактная плотность" });
    expect(compact).toHaveAttribute("aria-checked", "false");
    fireEvent.click(compact);

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(compact).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement.dataset.v19Density).toBe("comfortable");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Предыдущее значение сохранено; попробуйте ещё раз",
    );
  });

  test("exposes the stable attribute helper without widening arbitrary ids", () => {
    expect(agentInteractionProps("shell.navigate-submissions")).toEqual({
      "data-v19-interaction-id": "shell.navigate-submissions",
    });
  });
});
