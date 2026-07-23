import { expect, test, type Page } from "@playwright/test";

import {
  V19_AGENT_INTERACTION_CONTRACTS,
  type AgentInteractionRole,
  type AgentInteractionSurface,
} from "../../src/modules/submissions/agentInteractionContract";
import {
  clickFirstVisible,
  clickWorkspaceButton,
  drawer,
  openFreshWorkspace,
  openMobileMenu,
} from "./v19-pilot-helpers";

const enabledControlSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([readonly]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled]):not([readonly])",
  "[role='button']:not([aria-disabled='true'])",
  "[role='menuitem']:not([aria-disabled='true'])",
  "[role='option']:not([aria-disabled='true'])",
  "[role='switch']:not([aria-disabled='true'])",
  "[role='tab']:not([aria-disabled='true'])",
  "[tabindex]:not([tabindex='-1'])[data-v19-interaction-id]",
].join(",");

const knownInteractionIds = Object.keys(V19_AGENT_INTERACTION_CONTRACTS);
const interactionContracts = Object.fromEntries(
  Object.entries(V19_AGENT_INTERACTION_CONTRACTS).map(([id, contract]) => [
    id,
    { role: contract.role, surface: contract.surface },
  ]),
);

type InventoryFinding = {
  interactionId: string | null;
  label: string;
  reason: "missing" | "unknown" | "wrong-role" | "wrong-surface";
  tag: string;
};

async function collectInteractionInventoryFindings(
  page: Page,
  options: {
    activeAgentScreen?: "actions" | "create" | "settings" | "submissions";
    role: AgentInteractionRole;
    surfaces: readonly AgentInteractionSurface[];
  },
) {
  return page.locator("body").evaluate(
    (root, input) => {
      const known = new Set(input.knownIds);
      const allowedSurfaces = new Set(input.surfaces);
      return Array.from(root.querySelectorAll(input.selector)).flatMap((element) => {
        const owningAgentScreen = element.closest("[data-agent-screen]");
        if (
          input.activeAgentScreen &&
          owningAgentScreen &&
          owningAgentScreen.getAttribute("data-agent-screen") !==
            input.activeAgentScreen
        ) {
          return [];
        }
        const htmlElement = element as HTMLElement;
        const style = window.getComputedStyle(htmlElement);
        if (
          htmlElement.hidden ||
          element.getAttribute("aria-hidden") === "true" ||
          element.closest("[inert]") ||
          style.display === "none" ||
          style.visibility === "hidden" ||
          htmlElement.getClientRects().length === 0
        ) {
          return [];
        }

        const interactionId = element.getAttribute("data-v19-interaction-id");
        const contract = interactionId ? input.contracts[interactionId] : undefined;
        const reason = !interactionId
          ? "missing"
          : !known.has(interactionId) || !contract
            ? "unknown"
            : contract.role !== input.role
              ? "wrong-role"
              : !allowedSurfaces.has(contract.surface)
                ? "wrong-surface"
                : null;
        if (!reason) return [];

        return [
          {
            interactionId,
            label: (
              element.getAttribute("aria-label") ??
              element.textContent ??
              element.getAttribute("name") ??
              element.tagName
            )
              .trim()
              .replace(/\s+/g, " ")
              .slice(0, 140),
            reason,
            tag: element.tagName.toLowerCase(),
          },
        ];
      });
    },
    {
      activeAgentScreen: options.activeAgentScreen,
      contracts: interactionContracts,
      knownIds: knownInteractionIds,
      role: options.role,
      selector: enabledControlSelector,
      surfaces: options.surfaces,
    },
  ) as Promise<InventoryFinding[]>;
}

async function expectCompleteInteractionInventory(
  page: Page,
  label: string,
  surfaces: readonly AgentInteractionSurface[],
  activeAgentScreen?: "actions" | "create" | "settings" | "submissions",
) {
  const findings = await collectInteractionInventoryFindings(page, {
    activeAgentScreen,
    role: "agent",
    surfaces,
  });

  expect(
    findings,
    `${label}: enabled controls without an agent contract on an allowed surface`,
  ).toEqual([]);
}

const actionSurfaces = ["agent-shell", "agent-actions", "agent-ai"] as const;
const submissionSurfaces = [
  "agent-shell",
  "agent-submissions",
  "returned-documents",
] as const;

async function runCriticalAgentInventorySweep(page: Page) {
  await openFreshWorkspace(page, { heading: "Мои действия" });
  await expectCompleteInteractionInventory(
    page,
    "agent actions",
    actionSurfaces,
    "actions",
  );

  await openMobileMenu(page);
  const mobileAgentMenu = page.getByRole("dialog", { name: "Меню агента" });
  if ((page.viewportSize()?.width ?? 1440) <= 1024) {
    await expect(mobileAgentMenu).toBeVisible();
    await mobileAgentMenu
      .getByRole("button", { name: "Открыть командную палитру" })
      .click();
  } else {
    await clickFirstVisible(
      page.getByRole("button", { name: "Открыть командную палитру" }),
    );
  }
  await expect(
    page.getByRole("dialog", { name: "Командная палитра агента" }),
  ).toBeVisible();
  await expectCompleteInteractionInventory(
    page,
    "command palette",
    [...actionSurfaces, "command-palette"],
    "actions",
  );
  await page.keyboard.press("Escape");

  await clickWorkspaceButton(page, /Мои подачи/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Мои подачи" }),
  ).toBeVisible();
  await expectCompleteInteractionInventory(
    page,
    "agent submissions",
    submissionSurfaces,
    "submissions",
  );

  const submissionCard = page.locator(".v19-agent-shared-card").first();
  await expect(submissionCard).toHaveAttribute(
    "data-v19-interaction-id",
    "submissions.open",
  );
  await submissionCard.click();
  const submissionDrawer = drawer(page);
  await expect(submissionDrawer).toBeVisible();
  await expectCompleteInteractionInventory(
    page,
    "submission drawer overview",
    [...submissionSurfaces, "submission-drawer"],
    "submissions",
  );

  for (const tab of ["Анкета", /Замечания/, "История", "Обзор"] as const) {
    await submissionDrawer.getByRole("tab", { name: tab }).click();
    await expectCompleteInteractionInventory(
      page,
      `submission drawer ${String(tab)}`,
      [...submissionSurfaces, "submission-drawer"],
      "submissions",
    );
  }
  await page.keyboard.press("Escape");
  await expect(submissionDrawer).toBeHidden();

  await clickWorkspaceButton(page, /Настройки/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Настройки" }),
  ).toBeVisible();
  await expectCompleteInteractionInventory(
    page,
    "agent settings",
    ["agent-shell", "agent-settings"],
    "settings",
  );

  await page
    .locator("header.v19-page-header")
    .getByRole("button", { name: "Новая подача" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Новая подача" }),
  ).toBeVisible();
  await expectCompleteInteractionInventory(
    page,
    "pre-upload",
    ["agent-shell", "new-submission"],
    "create",
  );

  const createWorkspace = page.locator('[data-agent-screen="create"]');
  await createWorkspace.getByLabel("Город подачи").selectOption("Казань");
  await createWorkspace
    .getByRole("button", { name: "Продолжить без паспорта" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: /^Анкета:/ })).toBeVisible();
  await expectCompleteInteractionInventory(page, "questionnaire", [
    "agent-shell",
    "questionnaire",
  ]);
}

test.describe("agent interaction inventory", () => {
  for (const viewport of [
    { height: 900, label: "desktop 1440x900", width: 1440 },
    { height: 844, label: "mobile 390x844", width: 390 },
  ]) {
    test(`every enabled control has the right role and surface on ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await runCriticalAgentInventorySweep(page);
    });
  }

  test("fails closed when an anonymous control leaks into an agent surface", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await openFreshWorkspace(page, { heading: "Мои действия" });
    await page.evaluate(() => {
      const control = document.createElement("button");
      control.dataset.v19InteractionId = "access.open-login";
      control.dataset.testid = "wrong-role-control";
      control.textContent = "Wrong role fixture";
      document.body.append(control);
    });

    await expect(
      collectInteractionInventoryFindings(page, {
        activeAgentScreen: "actions",
        role: "agent",
        surfaces: actionSurfaces,
      }),
    ).resolves.toContainEqual(
      expect.objectContaining({
        interactionId: "access.open-login",
        reason: "wrong-role",
      }),
    );
  });

  test("device preferences change the DOM and survive a reload", async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await openFreshWorkspace(page, { heading: "Мои действия" });
    await clickWorkspaceButton(page, /Настройки/);

    const compact = page.getByRole("switch", { name: "Компактная плотность" });
    await compact.click();
    await expect(compact).toHaveAttribute("aria-checked", "true");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.v19Density))
      .toBe("compact");

    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Мои действия" }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.v19Density))
      .toBe("compact");

    await clickWorkspaceButton(page, /Настройки/);
    await expect(
      page.getByRole("switch", { name: "Компактная плотность" }),
    ).toHaveAttribute("aria-checked", "true");
  });
});
