import { expect, test, type Page } from "@playwright/test";
import {
  clickWorkspaceButton,
  collectBrowserProblems,
} from "./v19-pilot-helpers";

const userPassword = "secure-local-password";

async function submitAccessRequest(page: Page, email: string) {
  await page.getByRole("button", { name: "Запросить доступ" }).click();
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

async function openAccessGateForNewUser(page: Page, email: string) {
  await page.goto("/");
  await page.evaluate((workspaceEmail) => {
    localStorage.clear();
    localStorage.setItem("visaflow.workspaceEmail.v2", workspaceEmail);
  }, email);
  await page.reload();
}

async function login(page: Page, email: string, password: string) {
  await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();
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
  await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();
}

test.describe("V-19 registration admin approval", () => {
  test("access gate secondary actions stay wired and validated", async ({ page }) => {
    const browserProblems = collectBrowserProblems(page);
    const userEmail = `access-gate-${Date.now()}@example.com`;

    await openAccessGateForNewUser(page, userEmail);
    await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();

    const loginPassword = page.locator("#workspace-password");
    await expect(loginPassword).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Показать пароль" }).click();
    await expect(loginPassword).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Скрыть пароль" }).click();
    await expect(loginPassword).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: /Войти/ }).click();
    await expect(page.getByText("Введите пароль")).toBeVisible();

    await page.getByRole("button", { name: "Восстановить пароль" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Восстановление доступа" }),
    ).toBeVisible();
    await expect(page.locator("#workspace-reset-email")).toHaveValue(userEmail);
    await page.getByRole("button", { name: "Отправить инструкции" }).click();
    await expect(
      page.getByText(/local\/dev режиме восстановление не отправляет email/),
    ).toBeVisible();

    await page.getByRole("button", { name: "Вернуться ко входу" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();

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

    await page.getByRole("button", { name: "Вернуться ко входу" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible();

    expect(browserProblems, browserProblems.join("\n")).toEqual([]);
  });

  test("new agent request stays pending until admin approves", async ({ page }) => {
    const browserProblems = collectBrowserProblems(page);
    const userEmail = `agent-${Date.now()}@example.com`;
    const secondAgentEmail = `agent-2-${Date.now()}@example.com`;
    const randomEmail = `random-${Date.now()}@example.com`;

    await openAccessGateForNewUser(page, userEmail);
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
    await login(page, "2@2.ru", "22");
    await expect(page.getByRole("heading", { level: 1, name: "Проверка" })).toBeVisible();
    await clickWorkspaceButton(page, /^Настройки$/);
    await page
      .getByRole("button", { name: /Входящие заявки на регистрацию/ })
      .click();
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
    await login(page, "2@2.ru", "22");
    await expect(page.getByRole("heading", { level: 1, name: "Проверка" })).toBeVisible();
    await clickWorkspaceButton(page, /^Настройки$/);
    await page
      .getByRole("button", { name: /Входящие заявки на регистрацию/ })
      .click();
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
