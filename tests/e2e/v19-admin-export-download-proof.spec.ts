import {
  expect,
  test,
  type Download,
  type Page,
} from "@playwright/test";
import { Buffer } from "node:buffer";
import JSZip from "jszip";
import {
  clearExportSelection,
  clickWorkspaceButton,
  collectBrowserProblems,
  expectNoHorizontalOverflow,
  openFreshWorkspace,
} from "./v19-pilot-helpers";

async function expectDownloadedFamilyArchive(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Downloaded ZIP stream is unavailable");

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const zip = await JSZip.loadAsync(Buffer.concat(chunks));
  const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  const rootFolder = fileNames
    .find((name) => name.endsWith("/manifest.json"))
    ?.replace(/\/manifest\.json$/, "");
  expect(rootFolder).toMatch(/^VisaFlow_Export_\d{4}-\d{2}-\d{2}$/);
  if (!rootFolder) throw new Error("ZIP manifest root is unavailable");

  const mediaNames = fileNames
    .filter((name) => /_(passport_scan|selfie_[12])\.(jpg|jpeg|png|pdf)$/i.test(name))
    .sort();
  expect(mediaNames).toEqual(
    [
      `${rootFolder}/Москва/Семья Волковых/660011021_passport_scan.jpg`,
      `${rootFolder}/Москва/Семья Волковых/660011021_selfie_1.jpg`,
      `${rootFolder}/Москва/Семья Волковых/660011021_selfie_2.jpg`,
      `${rootFolder}/Москва/Семья Волковых/660011022_passport_scan.jpg`,
      `${rootFolder}/Москва/Семья Волковых/660011023_passport_scan.jpg`,
    ].sort(),
  );
  expect(
    mediaNames.some((name) => /(660011022|660011023)_selfie_[12]\./.test(name)),
  ).toBe(false);

  const manifest = JSON.parse(
    await zip.file(`${rootFolder}/manifest.json`)!.async("string"),
  ) as {
    applicantCount: number;
    fileCount: number;
    submissions: Array<{
      id: string;
      applicants: Array<{ id: string; documentTypes: string[] }>;
    }>;
    workbookFileName: string;
  };
  expect(manifest.applicantCount).toBe(3);
  expect(manifest.fileCount).toBe(5);
  expect(manifest.submissions).toEqual([
    expect.objectContaining({
      id: "SUB-1102",
      applicants: [
        expect.objectContaining({
          id: "з-1102-1",
          documentTypes: ["passport_scan", "selfie_1", "selfie_2"],
        }),
        expect.objectContaining({
          id: "з-1102-2",
          documentTypes: ["passport_scan"],
        }),
        expect.objectContaining({
          id: "з-1102-3",
          documentTypes: ["passport_scan"],
        }),
      ],
    }),
  ]);

  const workbookBytes = await zip
    .file(`${rootFolder}/${manifest.workbookFileName}`)!
    .async("uint8array");
  expect(new TextDecoder().decode(workbookBytes.slice(0, 2))).toBe("PK");
}

async function expectDownloadedSingleArchive(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Downloaded ZIP stream is unavailable");

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const zip = await JSZip.loadAsync(Buffer.concat(chunks));
  const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  const rootFolder = fileNames
    .find((name) => name.endsWith("/manifest.json"))
    ?.replace(/\/manifest\.json$/, "");
  expect(rootFolder).toMatch(/^VisaFlow_Export_\d{4}-\d{2}-\d{2}$/);
  if (!rootFolder) throw new Error("ZIP manifest root is unavailable");

  const mediaNames = fileNames
    .filter((name) => /_(passport_scan|selfie_[12])\.(jpg|jpeg|png|pdf)$/i.test(name))
    .sort();
  expect(mediaNames).toEqual(
    [
      `${rootFolder}/Москва/Ольга Фролова/660011011_passport_scan.jpg`,
      `${rootFolder}/Москва/Ольга Фролова/660011011_selfie_1.jpg`,
      `${rootFolder}/Москва/Ольга Фролова/660011011_selfie_2.jpg`,
    ].sort(),
  );

  const manifest = JSON.parse(
    await zip.file(`${rootFolder}/manifest.json`)!.async("string"),
  ) as {
    applicantCount: number;
    fileCount: number;
    submissions: Array<{
      id: string;
      applicants: Array<{ id: string; documentTypes: string[] }>;
    }>;
    workbookFileName: string;
  };
  expect(manifest.applicantCount).toBe(1);
  expect(manifest.fileCount).toBe(3);
  expect(manifest.submissions).toEqual([
    expect.objectContaining({
      id: "SUB-1101",
      applicants: [
        expect.objectContaining({
          id: "з-1101-1",
          documentTypes: ["passport_scan", "selfie_1", "selfie_2"],
        }),
      ],
    }),
  ]);

  const workbookBytes = await zip
    .file(`${rootFolder}/${manifest.workbookFileName}`)!
    .async("uint8array");
  expect(new TextDecoder().decode(workbookBytes.slice(0, 2))).toBe("PK");
}

function blockingBrowserProblems(problems: string[]) {
  return problems.filter(
    (problem) =>
      !/ResizeObserver loop|favicon|net::ERR_ABORTED|Download the React DevTools/i.test(
        problem,
      ),
  );
}

async function expectBodyMatches(page: Page, patterns: RegExp[], timeout = 20_000) {
  await expect
    .poll(
      async () => {
        const text = await page.locator("body").innerText().catch(() => "");
        return patterns.some((pattern) => pattern.test(text));
      },
      { timeout },
    )
    .toBe(true);
}

test.describe("V-19 admin export download proof", () => {
  test("admin downloads the generated Excel+documents ZIP package", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, {
      heading: "Очередь на проверку",
      workspaceEmail: "admin@visaflow.local",
    });

    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Центр выгрузки" }),
    ).toBeVisible();

    await clearExportSelection(page);

    const targetRow = page.getByTestId("admin-export-row-SUB-1102");

    await expect(targetRow).toBeVisible();
    await targetRow.getByRole("checkbox").check();

    const controlToggle = page.getByRole("button", { name: /^Контроль пакета/ });
    if (await controlToggle.isVisible()) {
      await controlToggle.click();
      await expect(
        page.locator(".v19-admin-export-rail-v2.is-mobile-open"),
      ).toBeVisible();
    }

    const controlRail = page.getByRole("complementary", {
      name: "Контроль пакета",
    });
    await expect(controlRail).toContainText(/Пакет выбран|Excel preview|Excel rows/i);

    const prepareButton = page
      .getByRole("button", { name: /Сформировать Excel|Excel готов/i })
      .first();

    await expect(prepareButton).toBeVisible();
    if (await prepareButton.isEnabled()) {
      await prepareButton.click();
    }

    const prepareArchiveButton = page.getByRole("button", {
      name: "Сформировать ZIP с Excel",
    });

    await expect(prepareArchiveButton).toBeEnabled();
    await prepareArchiveButton.click();
    const downloadLink = page.getByRole("link", { name: "Скачать ZIP" });
    await expect(downloadLink).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await downloadLink.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(
      /^visaflow-export-.+_documents\.zip$/,
    );
    await expect(download.failure()).resolves.toBeNull();
    await expectDownloadedFamilyArchive(download);

    await page.getByRole("button", { name: "Подтвердить скачивание" }).click();
    await expectBodyMatches(page, [/пакет зафиксирован|Выгрузка завершена/i]);

    expect(blockingBrowserProblems(browserProblems), browserProblems.join("\n")).toEqual(
      [],
    );
  });

  test("admin downloads a single-applicant ZIP with both selfies", async ({ page }) => {
    const browserProblems = collectBrowserProblems(page);

    await openFreshWorkspace(page, {
      heading: "Очередь на проверку",
      workspaceEmail: "admin@visaflow.local",
    });

    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Центр выгрузки" }),
    ).toBeVisible();
    await clearExportSelection(page);

    const targetRow = page.getByTestId("admin-export-row-SUB-1101");
    await expect(targetRow).toBeVisible();
    await targetRow.getByRole("checkbox").check();

    const prepareButton = page
      .getByRole("button", { name: /Сформировать Excel|Excel готов/i })
      .first();
    await expect(prepareButton).toBeVisible();
    if (await prepareButton.isEnabled()) {
      await prepareButton.click();
    }

    const prepareArchiveButton = page.getByRole("button", {
      name: "Сформировать ZIP с Excel",
    });
    await expect(prepareArchiveButton).toBeEnabled();
    await prepareArchiveButton.click();

    const downloadLink = page.getByRole("link", { name: "Скачать ZIP" });
    await expect(downloadLink).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await downloadLink.click();
    const download = await downloadPromise;

    await expect(download.failure()).resolves.toBeNull();
    await expectDownloadedSingleArchive(download);

    expect(
      blockingBrowserProblems(browserProblems),
      browserProblems.join("\n"),
    ).toEqual([]);
  });

  test("mobile admin completes the ZIP download through the control sheet", async ({
    page,
  }) => {
    const browserProblems = collectBrowserProblems(page);
    await page.setViewportSize({ height: 844, width: 390 });

    await openFreshWorkspace(page, {
      heading: "Очередь на проверку",
      workspaceEmail: "admin@visaflow.local",
    });
    await clickWorkspaceButton(page, /Выгрузка/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Центр выгрузки" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, "mobile export queue");

    await clearExportSelection(page);
    const targetRow = page.getByTestId("admin-export-row-SUB-1102");
    await expect(targetRow).toBeVisible();
    await targetRow.getByRole("checkbox").check();

    const controlToggle = page.getByRole("button", { name: /^Контроль пакета/ });
    await expect(controlToggle).toContainText(/1 пакет/);
    await controlToggle.click();

    const controlRail = page.getByRole("complementary", {
      name: "Контроль пакета",
    });
    await expect(controlRail).toBeVisible();
    await expect(controlRail).toContainText(/Пакет выбран|Excel preview|Excel rows/i);
    await expectNoHorizontalOverflow(page, "mobile export control sheet");

    const prepareButton = controlRail
      .getByRole("button", { name: /Сформировать Excel|Excel готов/i })
      .first();
    await expect(prepareButton).toBeVisible();
    if (await prepareButton.isEnabled()) {
      await prepareButton.click();
    }

    const prepareArchiveButton = controlRail.getByRole("button", {
      name: "Сформировать ZIP с Excel",
    });
    await expect(prepareArchiveButton).toBeEnabled();
    await prepareArchiveButton.click();

    const downloadLink = controlRail.getByRole("link", { name: "Скачать ZIP" });
    await expect(downloadLink).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await downloadLink.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^visaflow-export-.+_documents\.zip$/,
    );
    await expect(download.failure()).resolves.toBeNull();

    await controlRail
      .getByRole("button", { name: "Подтвердить скачивание" })
      .click();
    await expectBodyMatches(page, [/пакет зафиксирован|Выгрузка завершена/i]);

    expect(blockingBrowserProblems(browserProblems), browserProblems.join("\n")).toEqual(
      [],
    );
  });
});
