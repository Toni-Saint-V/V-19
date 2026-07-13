import { File } from "node:buffer";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import JSZip from "jszip";

import {
  EXPECTED_EXPORT_CONTRACT_HEADERS,
  EXPORT_WORKBOOK_COLUMN_COUNT,
} from "../../src/lib/export/exportContractCore";
import { parseExportWorkbookBlob } from "../../src/lib/export/exportWorkbookCore";
import { extractPdfTextFromFile } from "../../src/modules/submissions/pdfTextExtraction";
import {
  PRODUCTION_PROJECT_REF,
  loadProductionCohortAccounts,
  requiredProductionRunMarker,
  signInCohortAccount,
  type BrowserProblemEvidence,
  type CohortMutationSummary,
  type ProductionCohortAccount,
  type ProductionCohortCase,
} from "./production-cohort-helpers";
import {
  StrictProductionExportNetworkGate,
  acquireProductionExportLock,
  assertProductionExportWriteUnlock,
  downloadBytes,
  loadAcceptedProductionExportCase,
  productionExportDigest,
  saveProductionExportState,
  writeProductionExportEvidence,
  type ProductionExportState,
  type SanitizedWorkbookProof,
  type SanitizedZipProof,
} from "./production-export-a1-f6-helpers";
import { clickWorkspaceButton, drawer, isVisible } from "./ui-helpers";

type ExportSession = Awaited<ReturnType<typeof signInCohortAccount>> & {
  accountKey: string;
  context: BrowserContext;
  gate: StrictProductionExportNetworkGate;
  role: "admin" | "agent";
};

type SessionEvidence = {
  accountKey: string;
  browserProblems: BrowserProblemEvidence;
  mutations: CohortMutationSummary[];
  role: "admin" | "agent";
};

type ExportEvidence = {
  case?: {
    caseKey: "A1-F6";
    caseMarkerDigest: string;
    city: "Москва";
    submissionDigest: string;
  };
  constraints: {
    credentialsPersistedInEvidence: false;
    directSupabaseWritesFromHarness: false;
    existingAcceptedA1F6Only: true;
    mockDemoFixtureDataLayerUsed: false;
    piiArtifactsPersisted: false;
    screenshotsPersisted: false;
    tracesPersisted: false;
    videosPersisted: false;
  };
  errorDigest?: string;
  excel?: SanitizedWorkbookProof;
  finishedAt?: string;
  postStatus?: "exported";
  preStatus?: "ready_for_export";
  projectRef: typeof PRODUCTION_PROJECT_REF;
  result: "FAILED" | "PASS" | "RUNNING";
  runMarker: string;
  schemaVersion: 1;
  sessions: SessionEvidence[];
  stage?: ProductionExportState["stage"];
  startedAt: string;
  zip?: SanitizedZipProof;
};

type WorkbookInspection = {
  passportNumbers: Set<string>;
  proof: SanitizedWorkbookProof;
};

const exportDocumentTypes = [
  "passport_scan",
  "selfie_1",
  "selfie_2",
  "visa_form",
] as const;
const zipDownloadTimeoutMs = 180_000;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function bufferBlob(bytes: Uint8Array, type: string) {
  return new Blob(
    [
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    ],
    { type },
  );
}

function workbookValue(headers: string[], row: string[], header: string) {
  const index = headers.indexOf(header);
  invariant(index >= 0, "Required canonical workbook header is absent.");
  return row[index] ?? "";
}

async function inspectWorkbook(
  bytes: Uint8Array,
  cohortCase: ProductionCohortCase,
): Promise<WorkbookInspection> {
  const parsed = await parseExportWorkbookBlob(
    bufferBlob(
      bytes,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
  );
  invariant(parsed.sheetName === "Sheet1", "Workbook sheet name is not canonical.");
  invariant(parsed.dimension === "A1:BD7", "Workbook dimension is not A1:BD7.");
  invariant(parsed.rows.length === 7, "Workbook must contain one header and six rows.");
  const headers = parsed.rows[0] ?? [];
  invariant(
    headers.length === EXPORT_WORKBOOK_COLUMN_COUNT &&
      headers.every(
        (header, index) => header === EXPECTED_EXPORT_CONTRACT_HEADERS[index],
      ),
    "Workbook does not contain the exact 56-column production contract.",
  );
  const rows = parsed.rows.slice(1);
  invariant(
    rows.length === cohortCase.applicantCount &&
      rows.every((row) => row.length === EXPORT_WORKBOOK_COLUMN_COUNT),
    "Workbook does not contain exactly six complete applicant rows.",
  );
  const expectedLocation = "MOW";
  invariant(
    rows.every(
      (row) =>
        workbookValue(headers, row, "Location") === expectedLocation &&
        workbookValue(headers, row, "Address City") === cohortCase.city &&
        workbookValue(
          headers,
          row,
          "Appointment Type(For Family, applicant email and contact number should be same for all family members)",
        ) === "Family" &&
        workbookValue(headers, row, "Surname (Family Name)").includes(
          cohortCase.caseMarker,
        ),
    ),
    "Workbook marker, city, or family mapping is incorrect.",
  );
  const passportNumbers = new Set(
    rows.map((row) => workbookValue(headers, row, "Passport No")),
  );
  invariant(
    passportNumbers.size === 6 &&
      [...passportNumbers].every((passport) => /^\d{9}$/.test(passport)),
    "Workbook passport identities are incomplete or duplicated.",
  );
  return {
    passportNumbers,
    proof: {
      byteDigest: productionExportDigest(bytes),
      byteLength: bytes.byteLength,
      columnCount: 56,
      dataRowCount: 6,
      dimension: "A1:BD7",
      markerRowCount: rows.filter((row) =>
        workbookValue(headers, row, "Surname (Family Name)").includes(
          cohortCase.caseMarker,
        ),
      ).length as 6,
      sheetName: "Sheet1",
    },
  };
}

function documentIdentity(fileName: string) {
  for (const type of exportDocumentTypes) {
    const marker = `_${type}.`;
    const index = fileName.lastIndexOf(marker);
    if (index > 0) {
      return { passportNumber: fileName.slice(0, index), type };
    }
  }
  return null;
}

function validPngSignature(bytes: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return signature.every((byte, index) => bytes[index] === byte);
}

async function inspectZip(
  bytes: Uint8Array,
  input: {
    cohortCase: ProductionCohortCase;
    expectedWorkbook: SanitizedWorkbookProof;
    submissionId: string;
  },
): Promise<SanitizedZipProof> {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const entries = Object.keys(zip.files)
    .filter((name) => !zip.files[name]?.dir)
    .sort();
  invariant(
    entries.length === 27,
    "ZIP must contain 24 documents plus XLSX, manifest, and README.",
  );
  invariant(
    entries.every((name) => !name.startsWith("/") && !name.split("/").includes("..")),
    "ZIP contains an unsafe archive path.",
  );
  const manifestName = entries.find((name) => name.endsWith("/manifest.json"));
  const workbookName = entries.find((name) => name.endsWith(".xlsx"));
  const readmeName = entries.find((name) => name.endsWith("/README_ПАКЕТ.txt"));
  invariant(
    manifestName && workbookName && readmeName,
    "ZIP is missing its workbook, manifest, or README.",
  );
  const manifest = JSON.parse(await zip.file(manifestName)!.async("string")) as {
    applicantCount?: number;
    documentEntries?: string[];
    fileCount?: number;
    package?: { submissionIds?: string[] };
    requiredDocumentTypes?: string[];
    submissions?: Array<{
      applicants?: Array<{
        documentTypes?: string[];
        id?: string;
        name?: string;
      }>;
      city?: string;
      id?: string;
      type?: string;
    }>;
  };
  invariant(
    manifest.applicantCount === 6 &&
      manifest.fileCount === 24 &&
      manifest.documentEntries?.length === 24 &&
      manifest.package?.submissionIds?.length === 1 &&
      manifest.package.submissionIds[0] === input.submissionId &&
      manifest.requiredDocumentTypes?.length === 4 &&
      exportDocumentTypes.every(
        (type, index) => manifest.requiredDocumentTypes?.[index] === type,
      ),
    "ZIP manifest counts, identity, or required document types are incorrect.",
  );
  const manifestSubmission = manifest.submissions?.[0];
  const manifestApplicants = manifestSubmission?.applicants ?? [];
  invariant(
    manifest.submissions?.length === 1 &&
      manifestSubmission?.id === input.submissionId &&
      manifestSubmission.type === "family" &&
      manifestSubmission.city === input.cohortCase.city &&
      manifestApplicants.length === 6 &&
      new Set(manifestApplicants.map((applicant) => applicant.id)).size === 6 &&
      manifestApplicants.every(
        (applicant) =>
          Boolean(applicant.id?.trim()) &&
          Boolean(applicant.name?.trim()) &&
          applicant.documentTypes?.length === exportDocumentTypes.length &&
          exportDocumentTypes.every(
            (type, index) => applicant.documentTypes?.[index] === type,
          ),
      ),
    "ZIP manifest submission identity, city, family type, applicants, or document types are incorrect.",
  );

  const documentEntries = entries.filter((name) =>
    exportDocumentTypes.some((type) => name.includes(`_${type}.`)),
  );
  invariant(
    documentEntries.length === 24 &&
      manifest.documentEntries?.every((entry) => documentEntries.includes(entry)),
    "ZIP document entries do not match the manifest.",
  );
  const typesByPassport = new Map<string, Set<string>>();
  for (const entry of documentEntries) {
    const fileName = entry.split("/").at(-1) ?? "";
    const identity = documentIdentity(fileName);
    invariant(identity, "ZIP contains a non-canonical applicant document name.");
    const entryBytes = await zip.file(entry)!.async("uint8array");
    invariant(entryBytes.byteLength > 0, "ZIP contains an empty applicant document.");
    if (identity.type === "visa_form") {
      invariant(
        new TextDecoder().decode(entryBytes.slice(0, 8)) === "%PDF-1.4",
        "Questionnaire PDF has an invalid signature.",
      );
      const file = new File(
        [
          entryBytes.buffer.slice(
            entryBytes.byteOffset,
            entryBytes.byteOffset + entryBytes.byteLength,
          ) as ArrayBuffer,
        ],
        "questionnaire.pdf",
        { type: "application/pdf" },
      ) as unknown as globalThis.File;
      const extraction = await extractPdfTextFromFile(file);
      invariant(
        extraction.pageCount === 4 &&
          extraction.source === "text_layer" &&
          extraction.text.includes("APPLICATION FOR SCHENGEN VISA") &&
          extraction.text.includes(input.cohortCase.caseMarker) &&
          extraction.text.includes(identity.passportNumber),
        "Generated questionnaire PDF does not contain the expected applicant data.",
      );
    } else {
      invariant(
        validPngSignature(entryBytes),
        "Production applicant document is not the expected PNG payload.",
      );
    }
    const types = typesByPassport.get(identity.passportNumber) ?? new Set<string>();
    types.add(identity.type);
    typesByPassport.set(identity.passportNumber, types);
  }
  invariant(
    typesByPassport.size === 6 &&
      [...typesByPassport.values()].every(
        (types) =>
          types.size === 4 && exportDocumentTypes.every((type) => types.has(type)),
      ),
    "Each of the six tourists must have all three source documents and one questionnaire PDF.",
  );

  const workbookBytes = await zip.file(workbookName)!.async("uint8array");
  const workbook = await inspectWorkbook(workbookBytes, input.cohortCase);
  invariant(
    workbook.proof.byteDigest === input.expectedWorkbook.byteDigest &&
      workbook.passportNumbers.size === typesByPassport.size &&
      [...workbook.passportNumbers].every((passport) => typesByPassport.has(passport)),
    "ZIP workbook differs from the separately downloaded Excel or document identities.",
  );
  const readme = await zip.file(readmeName)!.async("string");
  invariant(
    readme.includes("Required files per applicant") &&
      readme.includes("passport_scan") &&
      readme.includes("selfie_1") &&
      readme.includes("selfie_2"),
    "ZIP README does not describe the required per-tourist package.",
  );

  return {
    applicantCount: 6,
    byteDigest: productionExportDigest(bytes),
    byteLength: bytes.byteLength,
    downloadWaitMs: 0,
    documentCount: 24,
    entryCount: 27,
    questionnairePdfCount: documentEntries.filter((entry) =>
      entry.includes("_visa_form.pdf"),
    ).length as 6,
    workbookDigest: workbook.proof.byteDigest,
  };
}

function baseUrl(testInfo: TestInfo) {
  const value = testInfo.project.use.baseURL;
  invariant(
    typeof value === "string" && value.length > 0,
    "Production export Playwright baseURL is required.",
  );
  return value;
}

async function openSession(
  browser: Browser,
  testInfo: TestInfo,
  account: ProductionCohortAccount,
): Promise<ExportSession> {
  const context = await browser.newContext({
    baseURL: baseUrl(testInfo),
    serviceWorkers: "block",
    viewport: { height: 900, width: 1440 },
  });
  const gate = new StrictProductionExportNetworkGate();
  await gate.attach(context);
  try {
    const session = await signInCohortAccount(context, account);
    gate.attachPage(session.page);
    gate.assertLoginCompleted();
    return {
      ...session,
      accountKey: account.key,
      context,
      gate,
      role: account.role,
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function closeSession(
  session: ExportSession,
  evidence: ExportEvidence,
) {
  try {
    const browserProblems = session.browserProblems();
    evidence.sessions.push({
      accountKey: session.accountKey,
      browserProblems,
      mutations: session.gate.summary(),
      role: session.role,
    });
    if (session.gate.hasReleasedExportMutations) {
      session.gate.assertSuccessfulExport();
    } else {
      session.gate.assertReadOnly();
    }
    session.ledger.assertNoOriginViolations();
    invariant(browserProblems.count === 0, "Production export emitted browser errors.");
  } finally {
    await session.context.close();
  }
}

async function waitForWorkspaceData(page: Page) {
  await expect(page.locator('[aria-label="Загрузка подач"]')).toHaveCount(0, {
    timeout: 45_000,
  });
  const error = page
    .getByRole("alert")
    .filter({ hasText: /Не удалось загрузить подачи|Production data unavailable/i })
    .first();
  invariant(!(await isVisible(error)), "Production submissions failed to load.");
}

async function setSearch(page: Page, value: string) {
  const search = page
    .getByRole("searchbox")
    .or(page.getByRole("textbox", { name: "ID, семья или агент" }))
    .first();
  await expect(search).toBeVisible();
  await search.fill(value);
  await page.waitForTimeout(300);
}

function exportRow(page: Page, submissionId: string) {
  return page
    .locator(".v19-admin-export-row-v2, .v19-admin-export-row")
    .filter({ hasText: submissionId })
    .first();
}

async function openExport(page: Page, submissionId: string) {
  await clickWorkspaceButton(page, /Выгрузка/);
  await expect(page.getByRole("heading", { level: 1, name: "Выгрузка" })).toBeVisible();
  await waitForWorkspaceData(page);
  await setSearch(page, submissionId);
  return exportRow(page, submissionId);
}

async function selectOnlyA1F6(
  page: Page,
  input: {
    caseMarker: string;
    city: string;
    submissionId: string;
  },
) {
  const row = await openExport(page, input.submissionId);
  await expect(row).toBeVisible({ timeout: 45_000 });
  await expect(row).toContainText(input.submissionId);
  await expect(row).toContainText(input.city);
  await expect(row).not.toHaveClass(/is-blocked/);

  const allChecked = page.locator(
    '.v19-admin-export-row-v2 input[type="checkbox"]:checked, .v19-admin-export-row input[type="checkbox"]:checked',
  );
  while ((await allChecked.count()) > 0) await allChecked.first().uncheck();
  const checkbox = row.getByRole("checkbox");
  await expect(checkbox).toBeEnabled();
  await checkbox.check();
  await expect(allChecked).toHaveCount(1);
  const preview = page.getByRole("region", { name: "Данные Excel Preview" });
  await expect(preview).toBeVisible();
  const table = preview.getByRole("table", { name: "Excel Preview Sheet1" });
  await expect(table.getByRole("columnheader")).toHaveCount(56);
  await expect(table.getByRole("row")).toHaveCount(7);
  return row;
}

async function downloadAndInspectExcel(page: Page, cohortCase: ProductionCohortCase) {
  const prepare = page.getByRole("button", { name: "Сформировать Excel" });
  await expect(prepare).toBeEnabled();
  await prepare.click();
  await expect(page.getByRole("button", { name: "Excel готов" })).toBeVisible();
  const downloadButton = page.getByRole("button", { name: "Скачать Excel" });
  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;
  invariant(
    /^visaflow-export-.+\.xlsx$/.test(download.suggestedFilename()),
    "Excel download filename is not canonical.",
  );
  return inspectWorkbook(await downloadBytes(download), cohortCase);
}

async function downloadAndInspectZip(
  session: ExportSession,
  state: ProductionExportState,
  cohortCase: ProductionCohortCase,
  submissionId: string,
) {
  invariant(state.excelProof, "ZIP requires a verified standalone Excel proof.");
  state.stage = "exporting";
  await saveProductionExportState(state);
  session.gate.beginExport();
  let proof: SanitizedZipProof;
  try {
    const button = session.page.getByRole("button", {
      name: "Скачать ZIP с Excel",
    });
    await expect(button).toBeEnabled();
    const exportStartedAt = Date.now();
    const downloadPromise = session.page.waitForEvent("download", {
      timeout: zipDownloadTimeoutMs,
    });
    await button.click();
    const download = await downloadPromise.catch(async () => {
      const [buttonText, hint] = await Promise.all([
        button.textContent().catch(() => ""),
        session.page
          .locator("#export-action-hint")
          .textContent()
          .catch(() => ""),
      ]);
      const phase = buttonText?.includes("Формируем пакет")
        ? "preparing"
        : "settled";
      const hintDigest = productionExportDigest(hint ?? "").slice(0, 16);
      throw new Error(
        `ZIP download did not arrive within ${zipDownloadTimeoutMs}ms (phase=${phase}, hintDigest=${hintDigest}).`,
      );
    });
    invariant(
      /^visaflow-export-.+_documents\.zip$/.test(download.suggestedFilename()),
      "ZIP download filename is not canonical.",
    );
    const bytes = await downloadBytes(download);
    const inspected = await inspectZip(bytes, {
      cohortCase,
      expectedWorkbook: state.excelProof,
      submissionId,
    });
    proof = { ...inspected, downloadWaitMs: Date.now() - exportStartedAt };
    // Persist byte-level proof before mutations are allowed through. A later
    // UI assertion must never erase the fact that the browser received and
    // validated the real production archive.
    state.zipProof = proof;
    state.stage = "artifact_verified";
    await saveProductionExportState(state);
    session.gate.releaseExportMutations();
    await expect(session.page.locator("#export-action-hint")).toContainText(
      /ZIP скачан/,
      { timeout: 90_000 },
    );
    state.postCommitUiNoticeVerified = true;
    await saveProductionExportState(state);
  } catch (error) {
    session.gate.cancelExportMutations();
    throw error;
  } finally {
    session.gate.finishExport();
  }
  session.gate.assertSuccessfulExport();
  return proof;
}

async function assertAdminExportedState(page: Page, submissionId: string) {
  const row = await openExport(page, submissionId);
  await expect(row).toHaveCount(0);
}

async function assertOwnerExportedState(
  page: Page,
  input: { caseMarker: string; city: string; submissionId: string },
) {
  await clickWorkspaceButton(page, /Мои подачи/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Мои подачи" }),
  ).toBeVisible();
  await waitForWorkspaceData(page);
  await setSearch(page, input.submissionId);
  const card = page.locator(`[data-submission-id="${input.submissionId}"]`).first();
  await expect(card).toBeVisible({ timeout: 45_000 });
  await card.click();
  const root = drawer(page);
  await expect(root).toBeVisible();
  await expect(root).toContainText(input.caseMarker);
  await expect(root).toContainText(input.city);
  await expect(root.locator(".v20-status-pill")).toHaveText(/выгружено/i);
}

async function reconcileInterruptedExport(
  session: ExportSession,
  state: ProductionExportState,
  input: { caseMarker: string; city: string; submissionId: string },
) {
  invariant(
    state.stage === "exporting",
    "Interrupted export reconciliation is invalid.",
  );
  const row = await openExport(session.page, input.submissionId);
  if (!(await isVisible(row))) {
    throw new Error(
      "A1-F6 left Export after the ZIP intent checkpoint, but artifact bytes were not verified. Manual artifact reconciliation is required; PASS is forbidden.",
    );
  }
  await expect(row).toContainText(input.submissionId);
  await expect(row).toContainText(input.city);
  state.stage = "excel_verified";
  await saveProductionExportState(state);
}

test.describe("production A1-F6 export artifact gate", () => {
  test("downloads and verifies six tourist packages plus exact Excel through real UI", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(1_800_000);
    assertProductionExportWriteUnlock();
    const runMarker = requiredProductionRunMarker();
    const evidence: ExportEvidence = {
      constraints: {
        credentialsPersistedInEvidence: false,
        directSupabaseWritesFromHarness: false,
        existingAcceptedA1F6Only: true,
        mockDemoFixtureDataLayerUsed: false,
        piiArtifactsPersisted: false,
        screenshotsPersisted: false,
        tracesPersisted: false,
        videosPersisted: false,
      },
      projectRef: PRODUCTION_PROJECT_REF,
      result: "RUNNING",
      runMarker,
      schemaVersion: 1,
      sessions: [],
      startedAt: new Date().toISOString(),
    };
    let releaseLock: (() => Promise<void>) | null = null;
    let state: ProductionExportState | undefined;
    let failure: unknown;

    try {
      releaseLock = await acquireProductionExportLock(runMarker);
      const resolved = await loadAcceptedProductionExportCase();
      state = resolved.state;
      const accounts = loadProductionCohortAccounts();
      const owner = accounts.agents.find(
        (account) => account.key === resolved.cohortCase.ownerKey,
      );
      invariant(owner, "Accepted A1-F6 owner account is unavailable.");
      const submissionId = resolved.lifecycleState.case.submissionId;
      evidence.case = {
        caseKey: "A1-F6",
        caseMarkerDigest: productionExportDigest(resolved.cohortCase.caseMarker),
        city: "Москва",
        submissionDigest: productionExportDigest(submissionId),
      };
      evidence.preStatus = "ready_for_export";

      if (
        state.stage === "pending" ||
        state.stage === "excel_verified" ||
        state.stage === "exporting"
      ) {
        const admin = await openSession(browser, testInfo, accounts.admin);
        try {
          if (state.stage === "exporting") {
            await reconcileInterruptedExport(admin, state, {
              caseMarker: resolved.cohortCase.caseMarker,
              city: resolved.cohortCase.city,
              submissionId,
            });
          }
          await selectOnlyA1F6(admin.page, {
            caseMarker: resolved.cohortCase.caseMarker,
            city: resolved.cohortCase.city,
            submissionId,
          });
          if (state.stage === "pending") {
            const workbook = await downloadAndInspectExcel(
              admin.page,
              resolved.cohortCase,
            );
            state.excelProof = workbook.proof;
            state.stage = "excel_verified";
            await saveProductionExportState(state);
            evidence.excel = workbook.proof;
          }
          invariant(
            state.stage === "excel_verified" && state.excelProof,
            "A1-F6 standalone Excel proof is unavailable.",
          );
          const zipProof = await downloadAndInspectZip(
            admin,
            state,
            resolved.cohortCase,
            submissionId,
          );
          evidence.excel = state.excelProof;
          evidence.zip = zipProof;
          await admin.page.reload({ waitUntil: "domcontentloaded" });
          await assertAdminExportedState(admin.page, submissionId);
        } finally {
          await closeSession(admin, evidence);
        }
      } else {
        const admin = await openSession(browser, testInfo, accounts.admin);
        try {
          await assertAdminExportedState(admin.page, submissionId);
        } finally {
          await closeSession(admin, evidence);
        }
      }

      invariant(
        state.stage === "artifact_verified" || state.stage === "verified",
        "A1-F6 artifact verification did not complete.",
      );
      invariant(
        state.excelProof && state.zipProof,
        "Sanitized A1-F6 export proofs are incomplete.",
      );
      invariant(
        state.postCommitUiNoticeVerified,
        "A1-F6 ZIP success notice was not verified; formal PASS is forbidden.",
      );
      const ownerSession = await openSession(browser, testInfo, owner);
      try {
        await assertOwnerExportedState(ownerSession.page, {
          caseMarker: resolved.cohortCase.caseMarker,
          city: resolved.cohortCase.city,
          submissionId,
        });
      } finally {
        await closeSession(ownerSession, evidence);
      }

      state.stage = "verified";
      await saveProductionExportState(state);
      evidence.excel = state.excelProof;
      evidence.zip = state.zipProof;
      evidence.postStatus = "exported";
      evidence.result = "PASS";
    } catch (error) {
      failure = error;
      evidence.errorDigest = productionExportDigest(
        error instanceof Error ? error.message : String(error),
      ).slice(0, 16);
      evidence.result = "FAILED";
    } finally {
      if (state) {
        evidence.stage = state.stage;
        if (state.excelProof) evidence.excel = state.excelProof;
        if (state.zipProof) evidence.zip = state.zipProof;
      }
      evidence.finishedAt = new Date().toISOString();
      if (releaseLock) {
        try {
          await writeProductionExportEvidence(runMarker, evidence);
        } finally {
          await releaseLock();
        }
      }
    }

    if (failure) throw failure;
  });
});
