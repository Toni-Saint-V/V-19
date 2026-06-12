import { expect, test, type Page } from "@playwright/test";

const storageKey = "visaflow.localSubmissions.v1";
type SeedCase = Record<string, unknown>;
type SeedStatus =
  | "draft"
  | "filling"
  | "in_review"
  | "waiting_review"
  | "ready_for_review"
  | "returned"
  | "accepted"
  | "ready_for_excel"
  | "exported"
  | "sent_to_appointment"
  | "appointment_scheduled";

function acceptedMediaSlots(applicantId: string) {
  return [
    {
      id: `${applicantId}-photo_white`,
      applicantId,
      type: "photo_white",
      label: "Фото на белом фоне",
      state: "accepted",
      originalFileName: "repo_photo.jpg",
      generatedFileName: "709001001_photo_white.jpg",
    },
    {
      id: `${applicantId}-selfie`,
      applicantId,
      type: "selfie",
      label: "Селфи",
      state: "accepted",
      originalFileName: "repo_selfie.jpg",
      generatedFileName: "709001001_selfie.jpg",
    },
    {
      id: `${applicantId}-video`,
      applicantId,
      type: "video",
      label: "Видео",
      state: "accepted",
      originalFileName: "repo_video.mp4",
      generatedFileName: "709001001_video.mp4",
    },
  ];
}

function repositoryCase(
  id: string,
  status: SeedStatus,
  agentId = "agent-77",
): SeedCase {
  const applicantId = `${id}-1`;

  return {
    id,
    title: "Repository Case",
    type: "single",
    agentId,
    agentName: "Repository Travel",
    country: "Spain",
    city: "Madrid",
    travelDate: "2026-08-20",
    updated: "12.06.2026",
    status,
    appointment:
      status === "sent_to_appointment" || status === "appointment_scheduled"
        ? status
        : "not_started",
    priority: "Высокий",
    fields: 100,
    media: 3,
    mediaRequired: 3,
    applicants: [
      {
        id: applicantId,
        name: "Repository Case",
        role: "Заявитель",
        roleConfirmed: true,
        passport: "70 9001001",
        form: 100,
        media: 3,
        mediaRequired: 3,
        birthDate: "1990-01-01",
        citizenship: "РФ",
        address: "Moscow, Test 1",
        phone: "+7 900 100 10 01",
        email: "repo.case@example.com",
        passportIssuedAt: "2020-01-01",
        passportExpiresAt: "2030-01-01",
        country: "Spain",
        city: "Madrid",
        tripDates: "2026-08-20 — 2026-08-30",
        hotelName: "Repository Hotel",
        hotelAddress: "Gran Via 1, Madrid",
        mediaSlots: acceptedMediaSlots(applicantId),
      },
    ],
    mediaRows: [],
    notes:
      status === "returned"
        ? [
            {
              id: `${id}-return-note`,
              target: "Admin review",
              text: "Correct returned blocker before another review.",
              scope: "submission",
              severity: "blocking",
              status: "open",
            },
          ]
        : [],
  };
}

function draftAgentCase(id = "AGENT-DRAFT"): SeedCase {
  const applicantId = `${id}-1`;

  return {
    ...repositoryCase(id, "draft", "agent-1"),
    title: "Draft Applicant",
    fields: 0,
    media: 0,
    mediaRequired: 3,
    applicants: [
      {
        id: applicantId,
        name: "Draft Applicant",
        role: "Заявитель",
        passport: "-",
        form: 0,
        media: 0,
        mediaRequired: 3,
        country: "Spain",
        city: "Madrid",
        tripDates: "2026-08-20",
        mediaSlots: [
          {
            id: `${applicantId}-photo_white`,
            applicantId,
            type: "photo_white",
            label: "Фото на белом фоне",
            state: "missing",
          },
          {
            id: `${applicantId}-selfie`,
            applicantId,
            type: "selfie",
            label: "Селфи",
            state: "missing",
          },
          {
            id: `${applicantId}-video`,
            applicantId,
            type: "video",
            label: "Видео",
            state: "missing",
          },
        ],
      },
    ],
    mediaRows: [],
    notes: [],
  };
}

function blockedReturnedCase(id = "AGENT-BLOCKED-RETURN"): SeedCase {
  const applicantId = `${id}-1`;

  return {
    ...draftAgentCase(id),
    status: "returned",
    notes: [
      {
        id: `${id}-return-note`,
        target: "Admin review",
        text: "Passport and media still need correction.",
        scope: "submission",
        severity: "blocking",
        status: "open",
      },
    ],
    applicants: [
      {
        id: applicantId,
        name: "Blocked Return",
        role: "Заявитель",
        passport: "-",
        form: 0,
        media: 0,
        mediaRequired: 3,
      },
    ],
  };
}

async function seedRepository(
  page: Page,
  id: string,
  status: SeedStatus = "in_review",
  agentId = "agent-77",
) {
  await seedRepositoryRows(page, [repositoryCase(id, status, agentId)]);
}

async function seedRepositoryRows(page: Page, rows: SeedCase[]) {
  await page.evaluate(
    ([key, cases]) => {
      const storage = (
        globalThis as unknown as {
          localStorage: { setItem(key: string, value: string): void };
        }
      ).localStorage;
      storage.setItem(key, JSON.stringify(cases));
    },
    [storageKey, rows] as const,
  );
}

async function openAdminConsole(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue as Admin demo" }).click();
  await expect(page.getByRole("heading", { name: "Command Center" })).toBeVisible();
}

async function openAdminCase(page: Page, id: string) {
  const card = page.getByLabel("Priority queue").locator("article").filter({
    hasText: id,
  });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Open" }).click();
}

async function storedStatus(page: Page) {
  return storedStatusById(page);
}

async function storedStatusById(page: Page, id?: string) {
  return page.evaluate(
    ([key, targetId]) => {
      const storage = (
        globalThis as unknown as {
          localStorage: { getItem(key: string): string | null };
        }
      ).localStorage;
      const rows = JSON.parse(storage.getItem(key) ?? "[]") as Array<{
        id?: string;
        status?: string;
      }>;
      if (!Array.isArray(rows)) return undefined;
      return rows.find((row) => !targetId || row.id === targetId)?.status;
    },
    [storageKey, id] as const,
  );
}

async function fillIntakeModal(page: Page) {
  const dialog = page.getByRole("dialog").filter({ hasText: "Applicant data" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Full name").fill("Complete Applicant");
  await dialog.getByLabel("Passport number").fill("70 9001001");
  await dialog.getByLabel("Birth date").fill("1990-01-01");
  await dialog.getByLabel("Citizenship").fill("РФ");
  await dialog.getByLabel("Address", { exact: true }).fill("Moscow, Test 1");
  await dialog.getByLabel("Phone").fill("+7 900 100 10 01");
  await dialog.getByLabel("Email").fill("complete@example.com");
  await dialog.getByLabel("Passport issued").fill("2020-01-01");
  await dialog.getByLabel("Passport expires").fill("2030-01-01");
  await dialog.getByLabel("Submission country").fill("Spain");
  await dialog.getByLabel("Submission city").fill("Madrid");
  await dialog.getByLabel("Trip dates").fill("2026-08-20 — 2026-08-30");
  await dialog.getByLabel("Hotel", { exact: true }).fill("Repository Hotel");
  await dialog.getByLabel("Hotel address").fill("Gran Via 1, Madrid");

  const uploadButtons = dialog.getByRole("button", { name: "Mark uploaded" });
  while ((await uploadButtons.count()) > 0) {
    await uploadButtons.first().click();
  }
}

async function completeIntakeModal(page: Page) {
  const dialog = page.getByRole("dialog").filter({ hasText: "Applicant data" });
  await fillIntakeModal(page);

  await expect(dialog.getByText("No blockers before operator handoff.")).toBeVisible();
  await dialog.getByRole("button", { name: "Send to review" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const storage = (
      globalThis as unknown as {
        localStorage: { clear(): void };
      }
    ).localStorage;
    storage.clear();
  });
});

test("gates the admin console behind a session and admin role", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("VisaFlow AI");
  await expect(page.getByRole("heading", { name: "Sign in required" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Command Center" })).toHaveCount(0);

  await page.getByRole("button", { name: "Continue as Agent demo" }).click();
  await expect(page.getByRole("heading", { name: "Agent Workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Command Center" })).toHaveCount(0);

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Continue as Admin demo" }).click();
  await expect(page.getByRole("heading", { name: "Command Center" })).toBeVisible();
});

test("agent sessions can create cases and use readiness actions", async ({ page }) => {
  await seedRepositoryRows(page, [
    draftAgentCase("AGENT-DRAFT"),
    repositoryCase("AGENT-READY", "ready_for_review", "agent-1"),
    repositoryCase("AGENT-RETURN", "returned", "agent-1"),
    blockedReturnedCase("AGENT-BLOCKED-RETURN"),
  ]);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue as Agent demo" }).click();

  await expect(page.getByRole("heading", { name: "Agent Workspace" })).toBeVisible();
  await expect(page.getByLabel("Agent cases").getByText("AGENT-DRAFT")).toBeVisible();
  await expect(page.getByLabel("Agent cases").getByText("AGENT-READY")).toBeVisible();
  await expect(page.getByLabel("Agent cases").getByText("AGENT-RETURN")).toBeVisible();

  await page.getByRole("button", { name: "Create case" }).click();
  await expect(page.getByRole("status")).toContainText("draft created for intake");
  await expect(page.getByRole("dialog", { name: /New applicant/ })).toBeVisible();
  await page.getByRole("button", { name: "Close intake editor" }).click();

  const draftCard = page
    .getByLabel("Agent cases")
    .locator("article")
    .filter({ hasText: "AGENT-DRAFT" });
  await draftCard.getByRole("button", { name: "Continue intake" }).click();
  await completeIntakeModal(page);
  await expect.poll(() => storedStatusById(page, "AGENT-DRAFT")).toBe("waiting_review");

  const blockedReturnedCard = page
    .getByLabel("Agent cases")
    .locator("article")
    .filter({ hasText: "AGENT-BLOCKED-RETURN" });
  await blockedReturnedCard
    .getByRole("button", { name: "Mark correction fixed" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Fix data and media blockers before closing returned corrections.",
  );
  await expect
    .poll(() => storedStatusById(page, "AGENT-BLOCKED-RETURN"))
    .toBe("returned");
  const correctionDialog = page.getByRole("dialog").filter({
    hasText: "AGENT-BLOCKED-RETURN",
  });
  await expect(
    correctionDialog.getByRole("button", { name: "Close correction" }),
  ).toBeDisabled();
  await fillIntakeModal(page);
  await expect(
    correctionDialog.getByRole("button", { name: "Close correction" }),
  ).toBeEnabled();
  await correctionDialog.getByRole("button", { name: "Close correction" }).click();
  await expect
    .poll(() => storedStatusById(page, "AGENT-BLOCKED-RETURN"))
    .toBe("ready_for_review");
  await page.getByRole("button", { name: "Close intake editor" }).click();

  const returnedCard = page
    .getByLabel("Agent cases")
    .locator("article")
    .filter({ hasText: "AGENT-RETURN" });
  await returnedCard.getByRole("button", { name: "Mark correction fixed" }).click();
  await expect
    .poll(() => storedStatusById(page, "AGENT-RETURN"))
    .toBe("ready_for_review");

  const readyCard = page
    .getByLabel("Agent cases")
    .locator("article")
    .filter({ hasText: "AGENT-READY" });
  await readyCard.getByRole("button", { name: "Send to review" }).click();
  await expect.poll(() => storedStatusById(page, "AGENT-READY")).toBe("waiting_review");
});

test("loads the admin queue from the local submission repository", async ({ page }) => {
  await seedRepository(page, "LOCAL-9001");
  await openAdminConsole(page);

  await expect(page.getByLabel("Priority queue").getByText("LOCAL-9001")).toBeVisible();
  await expect(page.getByText("Repository Case").first()).toBeVisible();
  await expect(page.getByText("Repository Travel")).toBeVisible();
  await expect(page.getByText("CASE-1052")).toHaveCount(0);
});

test("persists the mark-ready review action across refresh", async ({ page }) => {
  await seedRepository(page, "LOCAL-9002");
  await openAdminConsole(page);

  await page.getByRole("button", { name: "Review now" }).click();

  const dialog = page.getByRole("dialog", { name: "Repository Case" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("LOCAL-9002")).toBeVisible();
  await expect(dialog.getByText("No blockers in the admin preflight.")).toBeVisible();

  await dialog.getByRole("button", { name: "Mark ready for queue" }).click();
  await expect(page.getByRole("status")).toContainText(
    "LOCAL-9002 marked ready for manual handoff.",
  );
  await expect.poll(() => storedStatus(page)).toBe("accepted");

  await page.reload();
  await page.getByRole("button", { name: "Continue as Admin demo" }).click();

  await expect(page.getByLabel("Priority queue").getByText("LOCAL-9002")).toBeVisible();
  await expect(
    page.getByLabel("Priority queue").getByText("Принято оператором"),
  ).toBeVisible();
});

test("persists the return-to-agent review action across refresh", async ({ page }) => {
  await seedRepository(page, "LOCAL-9003");
  await openAdminConsole(page);

  await page.getByRole("button", { name: "Review now" }).click();

  const dialog = page.getByRole("dialog", { name: "Repository Case" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Return to agent" }).click();

  await expect(page.getByRole("status")).toContainText(
    "LOCAL-9003 returned to the agency for correction.",
  );
  await expect.poll(() => storedStatus(page)).toBe("returned");

  await page.reload();
  await page.getByRole("button", { name: "Continue as Admin demo" }).click();

  await expect(page.getByLabel("Priority queue").getByText("LOCAL-9003")).toBeVisible();
  await expect(
    page.getByLabel("Priority queue").getByText("Возвращено на доработку"),
  ).toBeVisible();
});

test("advances accepted cases through export and appointment handoff", async ({
  page,
}) => {
  await seedRepository(page, "LOCAL-HANDOFF", "accepted");
  await openAdminConsole(page);

  await openAdminCase(page, "LOCAL-HANDOFF");
  let dialog = page.getByRole("dialog", { name: "Repository Case" });
  await expect(dialog.getByText("Review actions closed")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Return to agent" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Prepare Excel" }).click();
  await expect.poll(() => storedStatus(page)).toBe("ready_for_excel");

  await openAdminCase(page, "LOCAL-HANDOFF");
  dialog = page.getByRole("dialog", { name: "Repository Case" });
  await dialog.getByRole("button", { name: "Mark exported" }).click();
  await expect.poll(() => storedStatus(page)).toBe("exported");

  await openAdminCase(page, "LOCAL-HANDOFF");
  dialog = page.getByRole("dialog", { name: "Repository Case" });
  await dialog.getByRole("button", { name: "Send to appointment tracking" }).click();
  await expect.poll(() => storedStatus(page)).toBe("sent_to_appointment");
});

test("blocks backward review actions after the case leaves review", async ({
  page,
}) => {
  await seedRepository(page, "LOCAL-9005", "exported");
  await openAdminConsole(page);

  await page.getByRole("button", { name: "Review now" }).click();

  const dialog = page.getByRole("dialog", { name: "Repository Case" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Review actions closed")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Mark ready for queue" }),
  ).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Return to agent" })).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Send to appointment tracking" }),
  ).toBeVisible();
  await expect.poll(() => storedStatus(page)).toBe("exported");
});

test("keeps command center usable without mobile horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedRepository(page, "LOCAL-9004");
  await openAdminConsole(page);

  await expect(page.getByRole("heading", { name: "Command Center" })).toBeVisible();
  await expect(page.getByText("Priority queue")).toBeVisible();

  const overflow = await page.evaluate<number>(
    "document.documentElement.scrollWidth - window.innerWidth",
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Review now" }).click();
  await expect(page.getByRole("dialog", { name: "Repository Case" })).toBeVisible();

  const modalOverflow = await page.evaluate<number>(
    "document.documentElement.scrollWidth - window.innerWidth",
  );
  expect(modalOverflow).toBeLessThanOrEqual(1);
});
