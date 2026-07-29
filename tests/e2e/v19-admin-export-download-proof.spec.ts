import { expect, test, type Download } from "@playwright/test";
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

test.describe("V-19 admin document export proof", () => {
  test("admin downloads Excel and the canonical ZIP package", async ({
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
    await expectNoHorizontalOverflow(page, "admin Excel export initial");

    await clearExportSelection(page);
    const targetRow = page.getByTestId("admin-export-row-SUB-1102");
    await expect(targetRow).toBeVisible();
    await targetRow.click();
    await expect(targetRow.getByRole("checkbox")).toBeChecked();

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
    await expect(controlRail).toContainText(
      "Состав, проверки, Excel и обязательные документы перед скачиванием.",
    );
    await expect(controlRail).toContainText("ZIP медиа");

    const prepareButton = controlRail.getByRole("button", {
      name: "Сформировать Excel",
    });
    await expect(prepareButton).toBeEnabled();
    await prepareButton.click();

    const excelLink = controlRail.getByRole("link", { name: "Скачать Excel" });
    await expect(excelLink).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await excelLink.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^visaflow-export-.+\.xlsx$/);
    await expect(download.failure()).resolves.toBeNull();
    await expect(controlRail).toContainText(/Скачивание Excel начато:/);

    const prepareZipButton = controlRail.getByRole("button", {
      name: "Сформировать ZIP с Excel",
    });
    await expect(prepareZipButton).toBeEnabled();
    await prepareZipButton.click();

    const zipLink = controlRail.getByRole("link", { name: "Скачать ZIP" });
    await expect(zipLink).toBeVisible();
    const zipDownloadPromise = page.waitForEvent("download");
    await zipLink.click();
    const zipDownload = await zipDownloadPromise;
    expect(zipDownload.suggestedFilename()).toMatch(
      /^visaflow-export-.+_documents\.zip$/,
    );
    await expect(zipDownload.failure()).resolves.toBeNull();
    await expectDownloadedFamilyArchive(zipDownload);

    const confirmButton = controlRail.getByRole("button", {
      name: "Подтвердить скачивание",
    });
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();
    await expect(controlRail).toContainText(
      /Скачивание подтверждено, пакет зафиксирован:/,
    );
    await expectNoHorizontalOverflow(page, "admin ZIP export complete");

    expect(
      blockingBrowserProblems(browserProblems),
      browserProblems.join("\n"),
    ).toEqual([]);
  });

  test("admin validates and completes a single-applicant ZIP package", async ({
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
    const targetRow = page.getByTestId("admin-export-row-SUB-1101");
    await expect(targetRow).toBeVisible();
    await targetRow.click();
    await expect(targetRow.getByRole("checkbox")).toBeChecked();

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
    const prepareButton = controlRail.getByRole("button", {
      name: "Сформировать Excel",
    });
    await expect(prepareButton).toBeEnabled();
    await prepareButton.click();

    const excelLink = controlRail.getByRole("link", { name: "Скачать Excel" });
    await expect(excelLink).toBeVisible();
    const excelDownloadPromise = page.waitForEvent("download");
    await excelLink.click();
    const excelDownload = await excelDownloadPromise;
    await expect(excelDownload.failure()).resolves.toBeNull();

    const prepareZipButton = controlRail.getByRole("button", {
      name: "Сформировать ZIP с Excel",
    });
    await expect(prepareZipButton).toBeEnabled();
    await prepareZipButton.click();

    const zipLink = controlRail.getByRole("link", { name: "Скачать ZIP" });
    await expect(zipLink).toBeVisible();
    const zipDownloadPromise = page.waitForEvent("download");
    await zipLink.click();
    const zipDownload = await zipDownloadPromise;
    await expect(zipDownload.failure()).resolves.toBeNull();
    await expectDownloadedSingleArchive(zipDownload);

    const confirmButton = controlRail.getByRole("button", {
      name: "Подтвердить скачивание",
    });
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();
    await expect(controlRail).toContainText(
      /Скачивание подтверждено, пакет зафиксирован:/,
    );

    expect(
      blockingBrowserProblems(browserProblems),
      browserProblems.join("\n"),
    ).toEqual([]);
  });
});
