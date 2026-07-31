import { expect, test, type Page } from "@playwright/test";
import {
  clickWorkspaceButton,
  collectBrowserProblems,
  expectNoHorizontalOverflow,
} from "./v19-pilot-helpers";

const userPassword = "secure-local-password";

async function ensureLoginMode(page: Page) {
  const loginHeading = page.getByRole("heading", { level: 1, name: "Вход" });
  if (await loginHeading.isVisible().catch(() => false)) return;

  const switchToLogin = page
    .getByRole("button", { name: /^(Уже есть доступ\? Войти|Вернуться ко входу)$/ })
    .first();
  await expect(switchToLogin).toBeVisible({ timeout: 10_000 });
  await switchToLogin.click();

  await expect(loginHeading).toBeVisible({ timeout: 10_000 });
}

async function ensureRegisterMode(page: Page) {
  const registerHeading = page.getByRole("heading", {
    level: 1,
    name: "Заявка на доступ",
  });
  if (await registerHeading.isVisible().catch(() => false)) return;

  const requestAccess = page.getByRole("button", { name: "Запросить доступ" });
  await expect(requestAccess).toBeVisible({ timeout: 10_000 });
  await requestAccess.click();

  await expect(registerHeading).toBeVisible();
}

async function submitAccessRequest(page: Page, email: string) {
  await ensureRegisterMode(page);
  await page.getByLabel("Имя и фамилия").fill("Анна Петрова");
  await page.getByLabel("Агентство / компания").fill("Visa Test");
  await page.getByLabel("Город").fill("Москва");
  await page.getByLabel("Телефон").fill("+7 900 000-00-00");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(userPassword);
  await page.getByRole("button", { name: "Подать заявку на доступ" }).click();
}

async function openAccessGateForNewUser(page: Page, email: string) {
  await page.goto("/");
  await page.evaluate((workspaceEmail) => {
    localStorage.clear();
    localStorage.setItem("visaflow.workspaceEmail.v2", workspaceEmail);
  }, email);
  await page.reload();
}

async function login(page: Page, email: string, password: string) {
  await ensureLoginMode(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: /Войти/ }).click();
}

async function logout(page: Page) {
  const statusLogout = page.getByRole("button", { name: "Выйти" });
  const workspaceLogout = page.getByRole("button", {
    name: "Выйти из рабочей области",
  });
  if (await statusLogout.isVisible().catch(() => false)) {
    await statusLogout.click();
  } else if (await workspaceLogout.isVisible().catch(() => false)) {
    await workspaceLogout.click();
  } else {
    await page.evaluate(() => {
      const raw = localStorage.getItem("visaflow.auth.localDev.v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.session = null;
        localStorage.setItem("visaflow.auth.localDev.v1", JSON.stringify(parsed));
      }
      localStorage.setItem("visaflow.workspaceEmail.v2", "signed-out@example.invalid");
    });
    await page.reload();
  }
  await ensureLoginMode(page);
}

test.describe("V-19 registration admin approval", () => {
  test("access gate secondary actions stay wired and validated", async ({ page }) => {
    const browserProblems = collectBrowserProblems(page);
    const userEmail = `access-gate-${Date.now()}@example.com`;

    await openAccessGateForNewUser(page, userEmail);
    await ensureLoginMode(page);

    const loginPassword = page.locator("#workspace-password");
    await expect(loginPassword).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Показать пароль" }).click();
    await expect(loginPassword).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Скрыть пароль" }).click();
    await expect(loginPassword).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: /Войти/ }).click();
    await expect(page.getByText("Введите пароль")).toBeVisible();

    await page.getByRole("button", { name: "Не помню пароль" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Восстановление доступа" }),
    ).toBeVisible();
    await expect(page.locator("#workspace-reset-email")).toHaveValue(userEmail);
    await page.getByRole("button", { name: "Отправить инструкции" }).click();
    await expect(
      page.getByText(/local\/dev режиме восстановление не отправляет email/),
    ).toBeVisible();

    await page
      .getByRole("button", {
        name: /^(Вернуться ко входу|Уже есть доступ\? Войти)$/,
      })
      .click();
    await ensureLoginMode(page);

    await page.getByRole("button", { name: "Запросить доступ" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Заявка на доступ" }),
    ).toBeVisible();
    await expect(page.locator("#workspace-register-email")).toHaveValue(userEmail);

    const requestPassword = page.locator("#workspace-register-password");
    await expect(requestPassword).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Показать пароль" }).click();
    await expect(requestPassword).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Скрыть пароль" }).click();
    await expect(requestPassword).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Подать заявку на доступ" }).click();
    await expect(page.getByText("Введите имя и фамилию")).toBeVisible();
    await expect(page.getByText("Введите название агентства")).toBeVisible();
    await expect(page.getByText("Введите город")).toBeVisible();
    await expect(page.getByText("Введите телефон")).toBeVisible();
    await expect(page.getByText("Введите пароль")).toBeVisible();

    await page
      .getByRole("button", {
        name: /^(Вернуться ко входу|Уже есть доступ\? Войти)$/,
      })
      .click();
    await ensureLoginMode(page);

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });

  test("new agent request stays pending until admin approves", async ({ page }, testInfo) => {
    const browserProblems = collectBrowserProblems(page);
    const userEmail = `agent-${Date.now()}@example.com`;
    const secondAgentEmail = `agent-2-${Date.now()}@example.com`;
    const randomEmail = `random-${Date.now()}@example.com`;

    await openAccessGateForNewUser(page, userEmail);
    await ensureRegisterMode(page);

    await submitAccessRequest(page, userEmail);
    await expect(
      page.getByRole("heading", { level: 1, name: "Ожидает подтверждения" }),
    ).toBeVisible();
    await expect(
      page.getByText("Доступ появится после подтверждения администратором").first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Новая подача" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "В админскую зону" })).toHaveCount(0);

    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Ожидает подтверждения" }),
    ).toBeVisible();

    await logout(page);
    await login(page, "2@2.ru", "22");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /^(Проверка|Очередь на проверку)$/,
      }),
    ).toBeVisible();
    await clickWorkspaceButton(page, /^Пользователи$/);
    const queue = page.getByTestId("admin-users-access-requests");
    await expect(queue).toBeVisible();
    await expect(queue.getByText(userEmail)).toBeVisible();
    await expect(queue.getByText("Анна Петрова")).toBeVisible();
    await expectNoHorizontalOverflow(page, "admin settings access queue");
    const settingsQueueScreenshot = testInfo.outputPath("admin-settings-access-queue.png");
    await page.screenshot({ path: settingsQueueScreenshot });
    await testInfo.attach("admin-settings-access-queue", {
      contentType: "image/png",
      path: settingsQueueScreenshot,
    });
    await queue.getByRole("button", { name: "Одобрить" }).click();
    await expect(queue.getByText(userEmail)).toHaveCount(0);

    await logout(page);
    await login(page, userEmail, userPassword);
    await expect(page.getByRole("heading", { level: 1, name: "Мои действия" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Проверка" })).toHaveCount(0);
    await expect(page.getByText("Семья Ивановых")).toHaveCount(0);

    await logout(page);
    await submitAccessRequest(page, secondAgentEmail);
    await expect(
      page.getByRole("heading", { level: 1, name: "Ожидает подтверждения" }),
    ).toBeVisible();

    await logout(page);
    await login(page, "2@2.ru", "22");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /^(Проверка|Очередь на проверку)$/,
      }),
    ).toBeVisible();
    await clickWorkspaceButton(page, /^Пользователи$/);
    await expect(queue.getByText(secondAgentEmail)).toBeVisible();
    await queue
      .filter({ hasText: secondAgentEmail })
      .getByRole("button", { name: "Одобрить" })
      .click();
    await expect(queue.getByText(secondAgentEmail)).toHaveCount(0);

    const usersPanel = page.getByTestId("admin-users-access-requests");
    await expect(usersPanel).toBeVisible();
    await usersPanel.getByRole("tab", { name: /^Одобрено [1-9]/ }).click();
    await expect(usersPanel.getByText(userEmail)).toBeVisible();
    await expect(usersPanel.getByText(secondAgentEmail)).toBeVisible();
    await expect(
      usersPanel.locator(".v19-access-row").getByText("Одобрено"),
    ).toHaveCount(2);
    await expectNoHorizontalOverflow(page, "admin users access history");
    const usersHistoryScreenshot = testInfo.outputPath("admin-users-access-history.png");
    await page.screenshot({ path: usersHistoryScreenshot });
    await testInfo.attach("admin-users-access-history", {
      contentType: "image/png",
      path: usersHistoryScreenshot,
    });

    await logout(page);
    await login(page, secondAgentEmail, userPassword);
    await expect(page.getByRole("heading", { level: 1, name: "Мои действия" })).toBeVisible();
    await expect(page.getByText("Семья Ивановых")).toHaveCount(0);
    const approvedAgents = await page.evaluate(([firstEmail, secondEmail]) => {
      const raw = localStorage.getItem("visaflow.auth.localDev.v1");
      const parsed = raw ? JSON.parse(raw) : null;
      return [firstEmail, secondEmail].map((email) =>
        parsed?.users?.find((user: { email?: string }) => user.email === email),
      );
    }, [userEmail, secondAgentEmail]);
    expect(approvedAgents[0]).toMatchObject({
      approvalStatus: "approved",
      role: "agent",
      status: "active",
    });
    expect(approvedAgents[1]).toMatchObject({
      approvalStatus: "approved",
      role: "agent",
      status: "active",
    });
    expect(approvedAgents[0]?.ownerAgentId).toBe(approvedAgents[0]?.id);
    expect(approvedAgents[1]?.ownerAgentId).toBe(approvedAgents[1]?.id);
    expect(approvedAgents[0]?.ownerAgentId).not.toBe(approvedAgents[1]?.ownerAgentId);

    await logout(page);
    await submitAccessRequest(page, randomEmail);
    await expect(
      page.getByRole("heading", { level: 1, name: "Ожидает подтверждения" }),
    ).toBeVisible();
    const randomUser = await page.evaluate((email) => {
      const raw = localStorage.getItem("visaflow.auth.localDev.v1");
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.users?.find((user: { email?: string }) => user.email === email);
    }, randomEmail);
    expect(randomUser).toMatchObject({
      approvalStatus: "pending",
      role: "agent",
      status: "pending",
    });
    await expect(page.getByRole("heading", { level: 1, name: "Проверка" })).toHaveCount(0);

    expect(browserProblems).toEqual([]);
  });
});
