import { expect, test, type Page } from "@playwright/test";

const supabaseUrl = process.env.V19_AUTH_E2E_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const anonKey = process.env.V19_AUTH_E2E_ANON_KEY ?? "";
const serviceRoleKey = process.env.V19_AUTH_E2E_SERVICE_ROLE_KEY ?? "";
const mailpitUrl = process.env.V19_AUTH_E2E_MAILPIT_URL?.replace(/\/$/, "") ?? "";
const appOrigin = process.env.V19_AUTH_E2E_APP_ORIGIN?.replace(/\/$/, "") ?? "";
const configured = Boolean(
  supabaseUrl && anonKey && serviceRoleKey && mailpitUrl && appOrigin,
);

const ownerPassword = "Owner-invite-password-2026";
const recoveredOwnerPassword = "Owner-recovered-password-2026";
const attackerPassword = "Attacker-pre-hijack-2026";
const adminPassword = "Admin-lifecycle-proof-2026";

test.skip(
  !configured,
  "Requires the disposable local Supabase stack, Mailpit, and explicit local test keys.",
);

function authHeaders(key: string) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
}

function jwtSubject(accessToken: string): string {
  const payload = accessToken.split(".")[1];
  if (!payload) throw new Error("JWT payload is missing.");
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  return (JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as {
    sub: string;
  }).sub;
}

async function serviceRows(table: string, email: string) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/${table}?email=eq.${encodeURIComponent(email)}&select=*`,
    { headers: authHeaders(serviceRoleKey) },
  );
  expect(response.ok).toBe(true);
  return (await response.json()) as Array<Record<string, unknown>>;
}

async function insertProfile(
  userId: string,
  email: string,
  role: "admin" | "agent",
) {
  const response = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
    body: JSON.stringify({
      display_name:
        role === "admin" ? "Lifecycle Proof Admin" : "Injected identity conflict",
      email,
      id: userId,
      organization_name: "Lifecycle proof",
      role,
    }),
    headers: {
      ...authHeaders(serviceRoleKey),
      prefer: "return=minimal",
    },
    method: "POST",
  });
  expect(response.ok).toBe(true);
}

async function createProofAdmin(email: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    body: JSON.stringify({
      email,
      email_confirm: true,
      password: adminPassword,
    }),
    headers: authHeaders(serviceRoleKey),
    method: "POST",
  });
  expect(response.ok).toBe(true);
  const user = (await response.json()) as { id?: string };
  expect(user.id).toBeTruthy();
  await insertProfile(user.id!, email, "admin");
}

async function deleteAuthUser(userId: string) {
  const response = await fetch(
    `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      headers: authHeaders(serviceRoleKey),
      method: "DELETE",
    },
  );
  expect(response.ok).toBe(true);
}

async function publicSubmit(input: Record<string, string>) {
  const response = await fetch(`${supabaseUrl}/functions/v1/access-request`, {
    body: JSON.stringify({ action: "submit", input }),
    headers: authHeaders(anonKey),
    method: "POST",
  });
  expect(response.ok).toBe(true);
  return (await response.json()) as {
    request: Record<string, unknown>;
  };
}

async function authenticatedRows(table: string, accessToken: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*`, {
    headers: {
      ...authHeaders(anonKey),
      authorization: `Bearer ${accessToken}`,
    },
  });
  expect(response.ok).toBe(true);
  return (await response.json()) as Array<Record<string, unknown>>;
}

async function publicPasswordSignIn(email: string, password: string) {
  return fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email, password }),
    headers: authHeaders(anonKey),
    method: "POST",
  });
}

type MailpitMessage = {
  ID?: string;
  To?: Array<{ Address?: string }>;
};

async function matchingMessageIds(email: string): Promise<Set<string>> {
  const response = await fetch(`${mailpitUrl}/api/v1/messages`);
  if (!response.ok) return new Set();
  const list = (await response.json()) as { messages?: MailpitMessage[] };
  return new Set(
    (list.messages ?? [])
      .filter((message) =>
        message.To?.some(
          (recipient) => recipient.Address?.toLowerCase() === email.toLowerCase(),
        ),
      )
      .flatMap((message) => (message.ID ? [message.ID] : [])),
  );
}

async function latestMessageDetail(email: string, priorIds: Set<string>) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${mailpitUrl}/api/v1/messages`);
    if (response.ok) {
      const list = (await response.json()) as { messages?: MailpitMessage[] };
      const message = (list.messages ?? []).find(
        (candidate) =>
          candidate.ID &&
          !priorIds.has(candidate.ID) &&
          candidate.To?.some(
            (recipient) => recipient.Address?.toLowerCase() === email.toLowerCase(),
          ),
      );
      if (message?.ID) {
        const detail = await fetch(
          `${mailpitUrl}/api/v1/message/${encodeURIComponent(message.ID)}`,
        );
        if (detail.ok) return detail.json();
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for email to ${email}.`);
}

async function latestOtp(email: string, priorIds: Set<string>): Promise<string> {
  const content = JSON.stringify(await latestMessageDetail(email, priorIds));
  const otp = content.match(/\b(\d{6,8})\b/)?.[1];
  if (!otp) throw new Error(`OTP was not found for ${email}.`);
  return otp;
}

async function latestInviteUrl(email: string, priorIds: Set<string>): Promise<string> {
  const content = JSON.stringify(await latestMessageDetail(email, priorIds))
    .replaceAll("&amp;", "&")
    .replaceAll("\\u0026", "&");
  const urls = content.match(/https?:\/\/[^"\\\s<>]+/g) ?? [];
  const inviteUrl = urls.find(
    (url) => url.includes("type=invite") || url.includes("type%3Dinvite"),
  );
  if (!inviteUrl) throw new Error(`Invite URL was not found for ${email}.`);
  return inviteUrl;
}

async function latestRecoveryUrl(email: string, priorIds: Set<string>): Promise<string> {
  const content = JSON.stringify(await latestMessageDetail(email, priorIds))
    .replaceAll("&amp;", "&")
    .replaceAll("\\u0026", "&");
  const urls = content.match(/https?:\/\/[^"\\\s<>]+/g) ?? [];
  const recoveryUrl = urls.find(
    (url) => url.includes("type=recovery") || url.includes("type%3Drecovery"),
  );
  if (!recoveryUrl) throw new Error(`Recovery URL was not found for ${email}.`);
  return recoveryUrl;
}

async function fillAccessRequest(page: Page, email: string) {
  await page.goto("/");
  const registerHeading = page.getByRole("heading", { name: "Заявка на доступ" });
  if (!(await registerHeading.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Запросить доступ" }).click();
  }
  await page.getByLabel("Имя и фамилия").fill("Invite Lifecycle Agent");
  await page.getByLabel("Агентство / компания").fill("VisaFlow Invite Proof");
  await page.getByLabel("Город").fill("Москва");
  await page.getByLabel("Телефон").fill("+7 900 000-00-00");
  await page.getByLabel("Email").fill(email);
  await expect(page.getByLabel("Пароль", { exact: true })).toHaveCount(0);
}

async function loginThroughUi(page: Page, email: string, password: string) {
  await page.goto("/");
  const loginHeading = page.getByRole("heading", { name: "Вход" });
  if (!(await loginHeading.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /Уже есть доступ\? Войти/ }).click();
  }
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: /Войти/ }).click();
}

test("request without password → approval invite → owner password → login", async ({
  browser,
  page,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const ownerEmail = `invite-owner-${suffix}@example.test`;
  const adminEmail = `invite-admin-${suffix}@example.test`;
  await createProofAdmin(adminEmail);
  const beforeSignupConfirmation = await matchingMessageIds(ownerEmail);

  const attackerSignup = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    body: JSON.stringify({ email: ownerEmail, password: attackerPassword }),
    headers: authHeaders(anonKey),
    method: "POST",
  });
  expect(attackerSignup.ok).toBe(true);
  const attackerSignupBody = (await attackerSignup.json()) as {
    access_token?: string;
  };
  if (!attackerSignupBody.access_token) {
    const signupOtp = await latestOtp(ownerEmail, beforeSignupConfirmation);
    const confirmAttacker = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      body: JSON.stringify({ email: ownerEmail, token: signupOtp, type: "signup" }),
      headers: authHeaders(anonKey),
      method: "POST",
    });
    expect(confirmAttacker.ok).toBe(true);
  }

  const attackerSignIn = attackerSignupBody.access_token
    ? null
    : await publicPasswordSignIn(ownerEmail, attackerPassword);
  if (attackerSignIn) expect(attackerSignIn.ok).toBe(true);
  let attackerAccessToken =
    attackerSignupBody.access_token ??
    ((await attackerSignIn!.json()) as { access_token?: string }).access_token;
  expect(attackerAccessToken).toBeTruthy();
  const firstAttackerAccessToken = attackerAccessToken!;
  let attackerUserId = jwtSubject(attackerAccessToken!);

  const attackerProfileInsert = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
    body: JSON.stringify({
      display_name: "Pre-hijack attacker",
      email: ownerEmail,
      id: attackerUserId,
      organization_name: "Attacker",
      role: "agent",
    }),
    headers: {
      ...authHeaders(anonKey),
      authorization: `Bearer ${attackerAccessToken}`,
      prefer: "return=minimal",
    },
    method: "POST",
  });
  expect(attackerProfileInsert.ok).toBe(false);

  await fillAccessRequest(page, ownerEmail);
  const edgeRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().includes("/access-request"),
  );
  await page.getByRole("button", { name: "Подать заявку на доступ" }).click();
  const edgeRequest = await edgeRequestPromise;
  expect(edgeRequest.postData()).not.toContain("password");
  await expect(
    page.getByRole("heading", { name: "Ожидает подтверждения" }),
  ).toBeVisible();

  const pendingRows = await serviceRows("access_requests", ownerEmail);
  expect(pendingRows).toHaveLength(1);
  expect(pendingRows[0]).toMatchObject({ status: "pending", user_id: null });
  expect(JSON.stringify(pendingRows)).not.toContain("password");
  expect(await serviceRows("profiles", ownerEmail)).toHaveLength(0);
  expect(await authenticatedRows("profiles", attackerAccessToken!)).toHaveLength(0);
  expect(await authenticatedRows("submissions", attackerAccessToken!)).toHaveLength(0);

  const duplicatePublicResult = await publicSubmit({
    city: "Москва",
    companyName: "VisaFlow Invite Proof",
    email: ownerEmail,
    fullName: "Invite Lifecycle Agent",
    phone: "+7 900 000-00-00",
  });
  expect(duplicatePublicResult.request).toMatchObject({
    email: ownerEmail,
    status: "pending",
    user_id: null,
  });
  expect(JSON.stringify(duplicatePublicResult)).not.toContain("password");

  const beforeInvite = await matchingMessageIds(ownerEmail);
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await loginThroughUi(adminPage, adminEmail, adminPassword);
  await adminPage.getByRole("button", { name: /^Пользователи$/ }).click();
  const requestRow = adminPage
    .getByTestId("admin-users-access-requests")
    .locator(".v19-access-row")
    .filter({ hasText: ownerEmail });
  await expect(requestRow).toBeVisible();

  // Force an approval precondition failure after proving the genuine pending
  // request had no profile. The Edge Function must release the claim so the
  // administrator can reconcile the identity and retry immediately.
  await insertProfile(attackerUserId, ownerEmail, "agent");
  const failedApproval = adminPage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/access-request") &&
      response.status() === 409,
  );
  await requestRow.getByRole("button", { name: "Одобрить" }).click();
  await failedApproval;
  await expect(requestRow).toBeVisible();
  const claimedRows = await serviceRows("access_requests", ownerEmail);
  expect(claimedRows).toHaveLength(1);
  expect(claimedRows[0]).toMatchObject({
    review_claim_action: null,
    review_claim_id: null,
    review_claimed_at: null,
    status: "pending",
  });

  await deleteAuthUser(attackerUserId);
  const replacementAttackerSignup = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    body: JSON.stringify({ email: ownerEmail, password: attackerPassword }),
    headers: authHeaders(anonKey),
    method: "POST",
  });
  expect(replacementAttackerSignup.ok).toBe(true);
  const replacementAttacker = (await replacementAttackerSignup.json()) as {
    access_token?: string;
  };
  expect(replacementAttacker.access_token).toBeTruthy();
  attackerAccessToken = replacementAttacker.access_token;
  attackerUserId = jwtSubject(attackerAccessToken!);

  const successfulApproval = adminPage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/access-request") &&
      response.status() === 200,
  );
  await requestRow.getByRole("button", { name: "Одобрить" }).click();
  await successfulApproval;
  await expect(requestRow).toHaveCount(0);
  await adminContext.close();

  const approvedProfiles = await serviceRows("profiles", ownerEmail);
  expect(approvedProfiles).toHaveLength(1);
  expect(approvedProfiles[0]?.id).not.toBe(attackerUserId);
  expect(await authenticatedRows("profiles", firstAttackerAccessToken)).toHaveLength(0);
  expect(await authenticatedRows("submissions", firstAttackerAccessToken)).toHaveLength(0);
  expect(await authenticatedRows("profiles", attackerAccessToken!)).toHaveLength(0);
  expect(await authenticatedRows("submissions", attackerAccessToken!)).toHaveLength(0);
  expect((await publicPasswordSignIn(ownerEmail, attackerPassword)).ok).toBe(false);

  const inviteUrl = await latestInviteUrl(ownerEmail, beforeInvite);
  const inviteRedirect = new URL(inviteUrl).searchParams.get("redirect_to");
  expect(inviteRedirect && new URL(inviteRedirect).origin).toBe(appOrigin);
  const inviteContext = await browser.newContext();
  const invitePage = await inviteContext.newPage();
  await invitePage.goto(inviteUrl);
  await expect(invitePage.getByRole("heading", { name: "Создайте пароль" })).toBeVisible();
  await invitePage.getByLabel("Новый пароль").fill(ownerPassword);
  await invitePage.getByLabel("Повторите пароль").fill(ownerPassword);
  await invitePage.getByRole("button", { name: "Сохранить пароль" }).click();
  await expect(invitePage.getByRole("heading", { name: "Вход" })).toBeVisible();

  await loginThroughUi(invitePage, ownerEmail, ownerPassword);
  await expect(invitePage.getByRole("heading", { name: "Мои действия" })).toBeVisible();
  await invitePage.reload();
  await expect(invitePage.getByRole("heading", { name: "Мои действия" })).toBeVisible();
  await invitePage.getByRole("button", { name: "Выйти" }).click();
  await expect(
    invitePage.getByRole("heading", { name: "Заявка на доступ" }),
  ).toBeVisible();
  await loginThroughUi(invitePage, ownerEmail, ownerPassword);
  await expect(invitePage.getByRole("heading", { name: "Мои действия" })).toBeVisible();

  const victimEmail = `invite-victim-${suffix}@example.test`;
  const preRecoveryOwnerSignIn = await publicPasswordSignIn(
    ownerEmail,
    ownerPassword,
  );
  expect(preRecoveryOwnerSignIn.ok).toBe(true);
  const preRecoveryOwnerAccessToken = (
    (await preRecoveryOwnerSignIn.json()) as { access_token?: string }
  ).access_token;
  expect(preRecoveryOwnerAccessToken).toBeTruthy();
  const mutateProfileEmail = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(String(approvedProfiles[0]?.id))}`,
    {
      body: JSON.stringify({ email: victimEmail }),
      headers: {
        ...authHeaders(anonKey),
        authorization: `Bearer ${preRecoveryOwnerAccessToken}`,
        prefer: "return=minimal",
      },
      method: "PATCH",
    },
  );
  expect(mutateProfileEmail.ok).toBe(true);

  const beforeRecovery = await matchingMessageIds(ownerEmail);
  await invitePage.getByRole("button", { name: "Выйти" }).click();
  await expect(
    invitePage.getByRole("heading", { name: "Заявка на доступ" }),
  ).toBeVisible();
  await invitePage.getByRole("button", { name: /Уже есть доступ\? Войти/ }).click();
  await invitePage.getByRole("button", { name: "Не помню пароль" }).click();
  await invitePage.getByLabel("Email").fill(ownerEmail);
  await invitePage.getByRole("button", { name: "Отправить инструкции" }).click();
  await expect(invitePage.getByRole("status")).toContainText(
    "Если аккаунт существует",
  );
  const recoveryUrl = await latestRecoveryUrl(ownerEmail, beforeRecovery);
  const recoveryRedirect = new URL(recoveryUrl).searchParams.get("redirect_to");
  expect(recoveryRedirect && new URL(recoveryRedirect).origin).toBe(appOrigin);
  await invitePage.goto(recoveryUrl);
  await expect(
    invitePage.getByRole("heading", { name: "Установите новый пароль" }),
  ).toBeVisible();
  await invitePage.locator("#workspace-invite-password").fill(recoveredOwnerPassword);
  await invitePage
    .locator("#workspace-invite-password-confirmation")
    .fill(recoveredOwnerPassword);
  await invitePage.getByRole("button", { name: "Сохранить пароль" }).click();
  await expect(invitePage.getByRole("heading", { name: "Вход" })).toBeVisible();
  await loginThroughUi(invitePage, ownerEmail, recoveredOwnerPassword);
  await expect(invitePage.getByRole("heading", { name: "Мои действия" })).toBeVisible();
  await invitePage.reload();
  await expect(invitePage.getByRole("heading", { name: "Мои действия" })).toBeVisible();

  const ownerSignIn = await publicPasswordSignIn(ownerEmail, recoveredOwnerPassword);
  expect(ownerSignIn.ok).toBe(true);
  const ownerAccessToken = (
    (await ownerSignIn.json()) as { access_token?: string }
  ).access_token;
  expect(ownerAccessToken).toBeTruthy();
  const visibleProfiles = await authenticatedRows("profiles", ownerAccessToken!);
  expect(visibleProfiles).toHaveLength(1);
  expect(visibleProfiles[0]?.id).toBe(approvedProfiles[0]?.id);

  const victimRequest = await publicSubmit({
    city: "Москва",
    companyName: "Victim Invite Proof",
    email: victimEmail,
    fullName: "Victim Invite Agent",
    phone: "+7 900 000-00-01",
  });
  expect(victimRequest.request).toMatchObject({
    email: victimEmail,
    status: "pending",
    user_id: null,
  });
  const approvedOwnerRepeat = await publicSubmit({
    city: "Москва",
    companyName: "VisaFlow Invite Proof",
    email: ownerEmail,
    fullName: "Invite Lifecycle Agent",
    phone: "+7 900 000-00-00",
  });
  expect(approvedOwnerRepeat.request).toMatchObject({
    email: ownerEmail,
    status: "pending",
    user_id: null,
  });
  expect(
    (await serviceRows("access_requests", ownerEmail)).filter(
      (request) => request.status === "pending",
    ),
  ).toHaveLength(0);
  const victimAdminContext = await browser.newContext();
  const victimAdminPage = await victimAdminContext.newPage();
  await loginThroughUi(victimAdminPage, adminEmail, adminPassword);
  await victimAdminPage.getByRole("button", { name: /^Пользователи$/ }).click();
  const victimRow = victimAdminPage
    .getByTestId("admin-users-access-requests")
    .locator(".v19-access-row")
    .filter({ hasText: victimEmail });
  await expect(victimRow).toBeVisible();
  const victimApproval = victimAdminPage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/access-request") &&
      response.status() === 200,
  );
  await victimRow.getByRole("button", { name: "Одобрить" }).click();
  await victimApproval;
  await expect(victimRow).toHaveCount(0);
  expect(await serviceRows("profiles", victimEmail)).toHaveLength(2);
  await victimAdminContext.close();
  await inviteContext.close();
});
