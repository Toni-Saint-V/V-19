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
  StrictProductionA1S1ExportNetworkGate,
  acquireProductionA1S1ExportLock,
  REQUIRED_PRODUCTION_A1_S1_EXPORT_REPAIR_UNLOCK,
  assertProductionA1S1ExportWriteUnlock,
  downloadA1S1ExportBytes,
  loadAcceptedA1S1ProductionExportCase,
  productionA1S1ExportDigest,
  repairIncompleteA1S1ProductionExport,
  resolveA1S1ProductionExportPreflight,
  saveProductionA1S1ExportState,
  verifyA1S1ProductionExportFinalState,
  writeProductionA1S1ExportEvidence,
  type ProductionA1S1ExportFinalStateProof,
  type ProductionA1S1ExportPreflight,
  type ProductionA1S1ExportNetworkContract,
  type ProductionA1S1ExportState,
  type SanitizedA1S1WorkbookProof,
  type SanitizedA1S1ZipProof,
} from "./production-export-a1-s1-helpers";
import { clickWorkspaceButton, isVisible } from "./ui-helpers";

type ExportSession = Awaited<ReturnType<typeof signInCohortAccount>> & {
  accountKey: string;
  browserProblemCategories: () => string[];
  context: BrowserContext;
  gate: StrictProductionA1S1ExportNetworkGate;
  role: "admin" | "agent";
};

type SessionEvidence = {
  accountKey: string;
  browserProblemCategories: string[];
  browserProblems: BrowserProblemEvidence;
  mutations: CohortMutationSummary[];
  network: CohortMutationSummary[];
  role: "admin" | "agent";
};

type ExportEvidence = {
  case?: {
    caseKey: "A1-S1";
    caseMarkerDigest: string;
    city: "Москва";
    submissionDigest: string;
  };
  constraints: {
    credentialsPersistedInEvidence: false;
    directTableWritesFromHarness: false;
    existingAcceptedA1S1Only: true;
    mockDemoFixtureDataLayerUsed: false;
    piiArtifactsPersisted: false;
    recoveryRpcWriteFromHarness: boolean;
    screenshotsPersisted: false;
    tracesPersisted: false;
    videosPersisted: false;
  };
  errorDigest?: string;
  excel?: SanitizedA1S1WorkbookProof;
  finalState?: ProductionA1S1ExportFinalStateProof;
  finishedAt?: string;
  postStatus?: "exported";
  preStatus?: "ready_for_excel";
  preflight?: ProductionA1S1ExportPreflight;
  projectRef: typeof PRODUCTION_PROJECT_REF;
  result: "FAILED" | "PASS" | "RUNNING";
  repair?: {
    outcome: "already_complete" | "repaired";
  };
  runMarker: string;
  schemaVersion: 1;
  sessions: SessionEvidence[];
  stage?: ProductionA1S1ExportState["stage"];
  startedAt: string;
  zip?: SanitizedA1S1ZipProof;
};

type WorkbookInspection = {
  passportNumbers: Set<string>;
  proof: SanitizedA1S1WorkbookProof;
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
  invariant(parsed.dimension === "A1:BD2", "Workbook dimension is not A1:BD2.");
  invariant(parsed.rows.length === 2, "Workbook must contain one header and one row.");
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
    cohortCase.applicantCount === 1 &&
      cohortCase.type === "single" &&
      rows.length === 1 &&
      rows[0]?.length === EXPORT_WORKBOOK_COLUMN_COUNT,
    "Workbook does not contain exactly one complete A1-S1 applicant row.",
  );
  const row = rows[0]!;
  invariant(
    workbookValue(headers, row, "Location") === "MOW" &&
      workbookValue(headers, row, "Address City") === cohortCase.city &&
      workbookValue(
        headers,
        row,
        "Appointment Type(For Family, applicant email and contact number should be same for all family members)",
      ) === "Individual" &&
      workbookValue(headers, row, "Surname (Family Name)").includes(
        cohortCase.caseMarker,
      ),
    "Workbook marker, city, or individual appointment mapping is incorrect.",
  );
  const passportNumbers = new Set([
    workbookValue(headers, row, "Passport No"),
  ]);
  invariant(
    passportNumbers.size === 1 &&
      [...passportNumbers].every((passport) => /^\d{9}$/.test(passport)),
    "Workbook A1-S1 passport identity is absent or malformed.",
  );
  return {
    passportNumbers,
    proof: {
      byteDigest: productionA1S1ExportDigest(bytes),
      byteLength: bytes.byteLength,
      columnCount: 56,
      dataRowCount: 1,
      dimension: "A1:BD2",
      markerRowCount: rows.filter((candidate) =>
        workbookValue(headers, candidate, "Surname (Family Name)").includes(
          cohortCase.caseMarker,
        ),
      ).length as 1,
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
    expectedWorkbook: SanitizedA1S1WorkbookProof;
    submissionId: string;
    zipFileName: string;
  },
): Promise<SanitizedA1S1ZipProof> {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const entries = Object.keys(zip.files)
    .filter((name) => !zip.files[name]?.dir)
    .sort();
  invariant(
    entries.length === 7,
    "ZIP must contain four documents plus XLSX, manifest, and README.",
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
    manifest.applicantCount === 1 &&
      manifest.fileCount === 4 &&
      manifest.documentEntries?.length === 4 &&
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
      manifestSubmission.type === "single" &&
      manifestSubmission.city === input.cohortCase.city &&
      manifestApplicants.length === 1 &&
      Boolean(manifestApplicants[0]?.id?.trim()) &&
      Boolean(manifestApplicants[0]?.name?.trim()) &&
      manifestApplicants[0]?.documentTypes?.length === exportDocumentTypes.length &&
      exportDocumentTypes.every(
        (type, index) => manifestApplicants[0]?.documentTypes?.[index] === type,
      ),
    "ZIP manifest submission identity, city, single type, or document types are incorrect.",
  );

  const documentEntries = entries.filter((name) =>
    exportDocumentTypes.some((type) => name.includes(`_${type}.`)),
  );
  invariant(
    documentEntries.length === 4 &&
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
    typesByPassport.size === 1 &&
      [...typesByPassport.values()].every(
        (types) =>
          types.size === 4 && exportDocumentTypes.every((type) => types.has(type)),
      ),
    "The A1-S1 tourist must have three source documents and one questionnaire PDF.",
  );

  const workbookBytes = await zip.file(workbookName)!.async("uint8array");
  const workbook = await inspectWorkbook(workbookBytes, input.cohortCase);
  invariant(
    workbook.proof.byteDigest === input.expectedWorkbook.byteDigest &&
      workbook.passportNumbers.size === typesByPassport.size &&
      [...workbook.passportNumbers].every((passport) => typesByPassport.has(passport)),
    "ZIP workbook differs from the separately downloaded Excel or document identity.",
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
    applicantCount: 1,
    byteDigest: productionA1S1ExportDigest(bytes),
    byteLength: bytes.byteLength,
    documentCount: 4,
    downloadWaitMs: 0,
    entryCount: 7,
    questionnairePdfCount: 1,
    workbookDigest: workbook.proof.byteDigest,
    workbookFileNameDigest: productionA1S1ExportDigest(
      workbookName.split("/").at(-1) ?? "",
    ),
    zipFileNameDigest: productionA1S1ExportDigest(input.zipFileName),
  };
}

function baseUrl(testInfo: TestInfo) {
  const value = testInfo.project.use.baseURL;
  invariant(
    typeof value === "string" && value.length > 0,
    "Production A1-S1 export Playwright baseURL is required.",
  );
  return value;
}

/**
 * Keeps diagnostics non-sensitive: the evidence records a fixed category,
 * never the browser message, URL, payload, or production identifiers.
 */
function collectSafeBrowserProblemCategories(page: Page) {
  const categories = new Set<string>();
  const observe = (message: string) => {
    if (/standardFontDataUrl/i.test(message)) {
      categories.add("pdf-standard-font-data");
    } else if (/pdf/i.test(message)) {
      categories.add("pdf-runtime");
    } else if (/font/i.test(message)) {
      categories.add("font-runtime");
    } else if (/failed to load resource|network|fetch/i.test(message)) {
      categories.add("network-runtime");
    } else {
      categories.add("unknown-runtime");
    }
  };
  page.on("console", (message) => {
    if (message.type() === "error") observe(message.text());
  });
  page.on("pageerror", (error) => observe(error.message));
  return () => [...categories].sort();
}

async function openSession(
  browser: Browser,
  testInfo: TestInfo,
  account: ProductionCohortAccount,
  networkContract?: ProductionA1S1ExportNetworkContract,
): Promise<ExportSession> {
  const context = await browser.newContext({
    baseURL: baseUrl(testInfo),
    serviceWorkers: "block",
    viewport: { height: 900, width: 1440 },
  });
  const gate = new StrictProductionA1S1ExportNetworkGate(networkContract);
  await gate.attach(context);
  try {
    const session = await signInCohortAccount(context, account);
    const browserProblemCategories = collectSafeBrowserProblemCategories(session.page);
    gate.attachPage(session.page);
    gate.assertLoginCompleted();
    return {
      ...session,
      accountKey: account.key,
      browserProblemCategories,
      context,
      gate,
      role: account.role,
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function closeSession(session: ExportSession, evidence: ExportEvidence) {
  try {
    const browserProblems = session.browserProblems();
    evidence.sessions.push({
      accountKey: session.accountKey,
      browserProblemCategories: session.browserProblemCategories(),
      browserProblems,
      mutations: session.gate.summary(),
      network: session.ledger.summary(),
      role: session.role,
    });
    if (session.gate.hasReleasedExportMutations) {
      session.gate.assertSuccessfulExport();
    } else {
      session.gate.assertReadOnly();
    }
    session.ledger.assertNoOriginViolations();
    invariant(browserProblems.count === 0, "Production A1-S1 export emitted browser errors.");
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
    .or(page.getByPlaceholder(/ID, семья или (агент|город)/))
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

function reviewCard(page: Page, submissionId: string) {
  return page
    .locator(
      ".v19-admin-review-card[data-submission-id], .v19-admin-cockpit-card[data-submission-id]",
    )
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

async function selectOnlyA1S1(
  page: Page,
  input: { city: string; submissionId: string },
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
  await expect(table.getByRole("row")).toHaveCount(2);
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
  return inspectWorkbook(await downloadA1S1ExportBytes(download), cohortCase);
}

async function downloadAndInspectZip(
  session: ExportSession,
  state: ProductionA1S1ExportState,
  cohortCase: ProductionCohortCase,
  submissionId: string,
) {
  invariant(state.excelProof, "ZIP requires a verified standalone Excel proof.");
  invariant(state.preflight, "ZIP requires a verified production read-only preflight.");
  state.stage = "exporting";
  await saveProductionA1S1ExportState(state);
  session.gate.beginExport();
  let proof: SanitizedA1S1ZipProof;
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
      const hintDigest = productionA1S1ExportDigest(hint ?? "").slice(0, 16);
      throw new Error(
        `A1-S1 ZIP download did not arrive within ${zipDownloadTimeoutMs}ms (phase=${phase}, hintDigest=${hintDigest}).`,
      );
    });
    invariant(
      /^visaflow-export-.+_documents\.zip$/.test(download.suggestedFilename()),
      "ZIP download filename is not canonical.",
    );
    const bytes = await downloadA1S1ExportBytes(download);
    const inspected = await inspectZip(bytes, {
      cohortCase,
      expectedWorkbook: state.excelProof,
      submissionId,
      zipFileName: download.suggestedFilename(),
    });
    proof = { ...inspected, downloadWaitMs: Date.now() - exportStartedAt };
    // Persist byte-level proof before allowing the UI's terminal RPCs through.
    state.zipProof = proof;
    state.stage = "artifact_verified";
    await saveProductionA1S1ExportState(state);
    session.gate.releaseExportMutations();
    await expect(session.page.locator("#export-action-hint")).toContainText(
      /ZIP скачан/,
      { timeout: 90_000 },
    );
    state.postCommitUiNoticeVerified = true;
    await saveProductionA1S1ExportState(state);
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
  await clickWorkspaceButton(page, /Проверка|Работа/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /^(Проверка|Очередь на проверку|Работа)$/,
    }),
  ).toBeVisible();
  await waitForWorkspaceData(page);
  await setSearch(page, submissionId);
  await expect(reviewCard(page, submissionId)).toHaveCount(0);

  const row = await openExport(page, submissionId);
  await expect(row).toHaveCount(0);
}

async function assertOwnerExportedState(
  page: Page,
  input: { city: string; submissionId: string },
) {
  await clickWorkspaceButton(page, /Мои подачи/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Мои подачи" }),
  ).toBeVisible();
  await waitForWorkspaceData(page);
  const card = page.locator(`[data-submission-id="${input.submissionId}"]`).first();
  await expect(card).toBeVisible({ timeout: 45_000 });
  await card.click();
  const root = page.getByRole("dialog", {
    name: `Подача ${input.submissionId}`,
  });
  await expect(root).toBeVisible();
  await expect(
    root.getByText(`${input.city} (VFS Global)`, { exact: true }),
  ).toBeVisible();
  await expect(root.locator(".v20-status-pill")).toHaveText(/^выгружено$/i);
  await root.getByLabel("Закрыть", { exact: true }).click();
  await expect(root).toBeHidden();

  await clickWorkspaceButton(page, /Мои действия/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Мои действия" }),
  ).toBeVisible();
  await waitForWorkspaceData(page);
  const openQueue = page.getByRole("button", { exact: true, name: "Открыто" });
  await expect(openQueue).toBeVisible();
  await openQueue.click();
  await expect(openQueue).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByTestId("agent-action-row").filter({ hasText: input.submissionId }),
  ).toHaveCount(0);
  const closedQueue = page.getByRole("button", { exact: true, name: "Закрыто" });
  await expect(closedQueue).toBeVisible();
  await closedQueue.click();
  await expect(closedQueue).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByTestId("agent-action-row")
      .filter({ hasText: input.submissionId })
      .first(),
  ).toBeVisible();
}

function assertNoAutomaticResumeFromAmbiguousExport(
  state: ProductionA1S1ExportState,
): void {
  invariant(
    state.stage !== "exporting",
    "A1-S1 export checkpoint is ambiguous after ZIP intent. Automatic retry is forbidden; perform a read-only production reconciliation before any new export attempt.",
  );
}

test.describe("production A1-S1 export artifact gate", () => {
  test("downloads and verifies one real technical tourist package plus exact Excel through real UI", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(1_800_000);
    assertProductionA1S1ExportWriteUnlock();
    const runMarker = requiredProductionRunMarker();
    const evidence: ExportEvidence = {
      constraints: {
        credentialsPersistedInEvidence: false,
        directTableWritesFromHarness: false,
        existingAcceptedA1S1Only: true,
        mockDemoFixtureDataLayerUsed: false,
        piiArtifactsPersisted: false,
        recoveryRpcWriteFromHarness: false,
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
    let state: ProductionA1S1ExportState | undefined;
    let failure: unknown;

    try {
      releaseLock = await acquireProductionA1S1ExportLock(runMarker);
      const resolved = await loadAcceptedA1S1ProductionExportCase();
      state = resolved.state;
      assertNoAutomaticResumeFromAmbiguousExport(state);
      const accounts = loadProductionCohortAccounts();
      const owner = accounts.agents.find(
        (account) => account.key === resolved.cohortCase.ownerKey,
      );
      invariant(owner, "Accepted A1-S1 owner account is unavailable.");
      const submissionId = resolved.lifecycleState.case.submissionId;
      evidence.case = {
        caseKey: "A1-S1",
        caseMarkerDigest: productionA1S1ExportDigest(resolved.cohortCase.caseMarker),
        city: "Москва",
        submissionDigest: productionA1S1ExportDigest(submissionId),
      };

      if (state.stage === "pending" || state.stage === "excel_verified") {
        const resolvedPreflight = await resolveA1S1ProductionExportPreflight({
          admin: accounts.admin,
          submissionId,
        });
        const { networkContract, preflight } = resolvedPreflight;
        state.preflight = preflight;
        await saveProductionA1S1ExportState(state);
        evidence.preflight = preflight;
        evidence.preStatus = preflight.rawStatus;

        // Raw IDs live only in this local variable and the gate instance; they
        // are intentionally excluded from both checkpoint and evidence.
        const admin = await openSession(
          browser,
          testInfo,
          accounts.admin,
          networkContract,
        );
        try {
          await selectOnlyA1S1(admin.page, {
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
            await saveProductionA1S1ExportState(state);
            evidence.excel = workbook.proof;
          }
          invariant(
            state.stage === "excel_verified" && state.excelProof && state.preflight,
            "A1-S1 standalone Excel proof or strict preflight is unavailable.",
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
        invariant(
          state.preflight,
          "A1-S1 post-commit resume is missing its immutable preflight proof.",
        );
        const admin = await openSession(browser, testInfo, accounts.admin);
        try {
          await assertAdminExportedState(admin.page, submissionId);
        } finally {
          await closeSession(admin, evidence);
        }
      }

      invariant(
        state.stage === "artifact_verified" || state.stage === "verified",
        "A1-S1 artifact verification did not complete.",
      );
      invariant(
        state.preflight && state.excelProof && state.zipProof,
        "Sanitized A1-S1 export proofs are incomplete.",
      );
      if (
        state.stage === "artifact_verified" &&
        process.env.V19_PRODUCTION_A1_S1_EXPORT_REPAIR_UNLOCK ===
          REQUIRED_PRODUCTION_A1_S1_EXPORT_REPAIR_UNLOCK
      ) {
        const repair = await repairIncompleteA1S1ProductionExport({
          admin: accounts.admin,
          preflight: state.preflight,
          state,
          submissionId,
        });
        evidence.repair = repair;
        evidence.constraints.recoveryRpcWriteFromHarness =
          repair.outcome === "repaired";
      }
      const finalState = await verifyA1S1ProductionExportFinalState({
        admin: accounts.admin,
        preflight: state.preflight,
        state,
        submissionId,
      });
      evidence.finalState = finalState;
      evidence.preflight = state.preflight;
      evidence.excel = state.excelProof;
      evidence.zip = state.zipProof;

      const ownerSession = await openSession(browser, testInfo, owner);
      try {
        await assertOwnerExportedState(ownerSession.page, {
          city: resolved.cohortCase.city,
          submissionId,
        });
      } finally {
        await closeSession(ownerSession, evidence);
      }

      // A recovered run cannot truthfully recreate a transient toast from the
      // original browser. The exact atomic DB read-back plus fresh admin and
      // owner state above is the stronger terminal confirmation.
      state.postCommitTerminalProofVerified = true;
      state.stage = "verified";
      await saveProductionA1S1ExportState(state);
      evidence.postStatus = "exported";
      evidence.result = "PASS";
    } catch (error) {
      failure = error;
      evidence.errorDigest = productionA1S1ExportDigest(
        error instanceof Error ? error.message : String(error),
      ).slice(0, 16);
      evidence.result = "FAILED";
    } finally {
      if (state) {
        evidence.stage = state.stage;
        if (state.preflight) evidence.preflight = state.preflight;
        if (state.excelProof) evidence.excel = state.excelProof;
        if (state.zipProof) evidence.zip = state.zipProof;
      }
      evidence.finishedAt = new Date().toISOString();
      if (releaseLock) {
        try {
          await writeProductionA1S1ExportEvidence(runMarker, evidence);
        } finally {
          await releaseLock();
        }
      }
    }

    if (failure) throw failure;
  });
});
