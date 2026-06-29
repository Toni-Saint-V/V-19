import { expect, test, type Page } from "@playwright/test";
import { collectBrowserProblems, openFreshWorkspace } from "./v19-pilot-helpers";

const userPassword = "secure-local-password";

async function submitAccessRequest(page: Page, email: string) {
  await page.getByRole("button", { name: "Подать заявку на доступ" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Заявка на доступ" }),
  ).toBeVisible();
  await page.getByLabel("Имя и фамилия").fill("Анна Петрова");
  await page.getByLabel("Агентство / компания").fill("Visa Test");
  await page.getByLabel("Город").fill("Москва");
  await page.getByLabel("Телефон").fill("+7 900 000-00-00");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(userPassword);
  await page.getByRole("button", { name: "Подать заявку на доступ" }).click();
}

async function login(page: Page, email: string, password: string) {
  await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
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
      localStorage.setItem("visaflow.workspaceEmail.v1", "signed-out@example.invalid");
    });
    await page.reload();
  }
  await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();
}

test.describe("V-19 registration admin approval", () => {
  test("new agent request stays pending until admin approves", async ({ page }) => {
    const browserProblems = collectBrowserProblems(page);
    const userEmail = `agent-${Date.now()}@example.com`;
    const secondAgentEmail = `agent-2-${Date.now()}@example.com`;
    const randomEmail = `random-${Date.now()}@example.com`;

    await openFreshWorkspace(page, { workspaceEmail: userEmail });
    await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();

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
    await login(page, "admin@visaflow.local", "local-dev-password");
    await expect(page.getByRole("heading", { level: 1, name: "Проверка" })).toBeVisible();
    await page.getByRole("button", { name: /Настройки/ }).click();
    await page.getByRole("button", { name: "Входящие заявки" }).click();
    const queue = page.getByTestId("admin-access-queue");
    await expect(queue).toBeVisible();
    await expect(queue.getByText(userEmail)).toBeVisible();
    await expect(queue.getByText("Анна Петрова")).toBeVisible();
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
    await login(page, "admin@visaflow.local", "local-dev-password");
    await expect(page.getByRole("heading", { level: 1, name: "Проверка" })).toBeVisible();
    await page.getByRole("button", { name: /Настройки/ }).click();
    await page.getByRole("button", { name: "Входящие заявки" }).click();
    await expect(queue.getByText(secondAgentEmail)).toBeVisible();
    await queue
      .filter({ hasText: secondAgentEmail })
      .getByRole("button", { name: "Одобрить" })
      .click();
    await expect(queue.getByText(secondAgentEmail)).toHaveCount(0);

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
