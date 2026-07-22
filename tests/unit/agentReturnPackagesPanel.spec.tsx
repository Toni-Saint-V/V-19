import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const persistence = vi.hoisted(() => ({
  createDownloadUrl: vi.fn(),
  listPackages: vi.fn(),
}));

vi.mock("../../src/modules/submissions/returnPackagePersistence", () => ({
  createAgentReturnPackageDownloadUrl: persistence.createDownloadUrl,
  listPublishedAgentReturnPackages: persistence.listPackages,
}));

import { AgentReturnPackagesPanel } from "../../src/components/AgentReturnPackagesPanel";

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const artifacts = [
  {
    applicantId: "synthetic-applicant-1",
    applicantName: "CODEX E2E ONE",
    artifactKind: "visa_application_pdf" as const,
    fileName: "visa_application_1.pdf",
    id: "artifact-1",
    packageId: "package-1",
    sha256: "a".repeat(64),
    sizeBytes: 128,
    storagePath: "return-packages/package-1/applicants/synthetic-applicant-1/visa_application.pdf",
    uploadedAt: "2026-07-22T00:00:00.000Z",
  },
  {
    applicantId: "synthetic-applicant-2",
    applicantName: "CODEX E2E TWO",
    artifactKind: "visa_application_pdf" as const,
    fileName: "visa_application_2.pdf",
    id: "artifact-2",
    packageId: "package-1",
    sha256: "b".repeat(64),
    sizeBytes: 256,
    storagePath: "return-packages/package-1/applicants/synthetic-applicant-2/visa_application.pdf",
    uploadedAt: "2026-07-22T00:00:00.000Z",
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  persistence.createDownloadUrl.mockReset();
  persistence.listPackages.mockReset();
});

describe("AgentReturnPackagesPanel", () => {
  test("shows loading and empty states without hiding the panel", async () => {
    const packages = deferred<[]>();
    persistence.listPackages.mockReturnValue(packages.promise);

    render(<AgentReturnPackagesPanel enabled />);
    expect(screen.getByTestId("agent-return-packages-panel")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Загружаем полученные документы",
    );

    packages.resolve([]);
    expect(await screen.findByTestId("agent-return-packages-empty")).toHaveTextContent(
      "Пока нет документов",
    );
  });

  test("recovers from a list failure through an explicit retry", async () => {
    persistence.listPackages
      .mockRejectedValueOnce(new Error("Список временно недоступен."))
      .mockResolvedValueOnce([
        {
          agentId: "synthetic-agent",
          artifacts: artifacts.slice(0, 1),
          city: "Москва",
          createdAt: "2026-07-22T00:00:00.000Z",
          exportBatchId: "batch-1",
          id: "package-1",
          publishedAt: "2026-07-22T00:01:00.000Z",
          status: "published",
        },
      ]);

    render(<AgentReturnPackagesPanel enabled />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Список временно недоступен.",
    );

    fireEvent.click(screen.getByTestId("agent-return-packages-retry"));

    expect(
      await screen.findByRole("button", {
        name: "Скачать Готовая анкета · CODEX E2E ONE",
      }),
    ).toBeEnabled();
    expect(persistence.listPackages).toHaveBeenCalledTimes(2);
  });

  test("deduplicates downloads and disables every competing download control", async () => {
    const url = deferred<string>();
    persistence.listPackages.mockResolvedValue([
      {
        agentId: "synthetic-agent",
        artifacts,
        city: "Москва",
        createdAt: "2026-07-22T00:00:00.000Z",
        exportBatchId: "batch-1",
        id: "package-1",
        publishedAt: "2026-07-22T00:01:00.000Z",
        status: "published",
      },
    ]);
    persistence.createDownloadUrl.mockReturnValue(url.promise);
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(<AgentReturnPackagesPanel enabled />);
    const firstDownload = await screen.findByRole("button", {
      name: "Скачать Готовая анкета · CODEX E2E ONE",
    });
    const secondDownload = screen.getByRole("button", {
      name: "Скачать Готовая анкета · CODEX E2E TWO",
    });

    fireEvent.click(firstDownload);
    fireEvent.click(firstDownload);
    fireEvent.click(secondDownload);

    expect(persistence.createDownloadUrl).toHaveBeenCalledTimes(1);
    expect(firstDownload).toBeDisabled();
    expect(secondDownload).toBeDisabled();

    url.resolve("https://example.test/signed-synthetic.pdf");
    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(firstDownload).toBeEnabled());
    expect(secondDownload).toBeEnabled();
  });

  test("shows a retry-safe error and allows a later download attempt", async () => {
    persistence.listPackages.mockResolvedValue([
      {
        agentId: "synthetic-agent",
        artifacts: artifacts.slice(0, 1),
        city: "Москва",
        createdAt: "2026-07-22T00:00:00.000Z",
        exportBatchId: "batch-1",
        id: "package-1",
        publishedAt: "2026-07-22T00:01:00.000Z",
        status: "published",
      },
    ]);
    persistence.createDownloadUrl
      .mockRejectedValueOnce(new Error("Подписанная ссылка временно недоступна."))
      .mockResolvedValueOnce("https://example.test/signed-synthetic.pdf");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<AgentReturnPackagesPanel enabled />);
    const download = await screen.findByRole("button", {
      name: "Скачать Готовая анкета · CODEX E2E ONE",
    });
    fireEvent.click(download);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Подписанная ссылка временно недоступна.",
    );
    expect(download).toBeEnabled();

    fireEvent.click(download);
    await waitFor(() => expect(persistence.createDownloadUrl).toHaveBeenCalledTimes(2));
  });

  test("does not trigger a signed-url download after unmount", async () => {
    const url = deferred<string>();
    persistence.listPackages.mockResolvedValue([
      {
        agentId: "synthetic-agent",
        artifacts: artifacts.slice(0, 1),
        city: "Москва",
        createdAt: "2026-07-22T00:00:00.000Z",
        exportBatchId: "batch-1",
        id: "package-1",
        publishedAt: "2026-07-22T00:01:00.000Z",
        status: "published",
      },
    ]);
    persistence.createDownloadUrl.mockReturnValue(url.promise);
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const view = render(<AgentReturnPackagesPanel enabled />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Скачать Готовая анкета · CODEX E2E ONE",
      }),
    );

    view.unmount();
    url.resolve("https://example.test/stale-signed-url.pdf");
    await Promise.resolve();
    await Promise.resolve();

    expect(anchorClick).not.toHaveBeenCalled();
  });

  test("does not trigger a signed-url download after logout disables the panel", async () => {
    const url = deferred<string>();
    persistence.listPackages.mockResolvedValue([
      {
        agentId: "synthetic-agent",
        artifacts: artifacts.slice(0, 1),
        city: "Москва",
        createdAt: "2026-07-22T00:00:00.000Z",
        exportBatchId: "batch-1",
        id: "package-1",
        publishedAt: "2026-07-22T00:01:00.000Z",
        status: "published",
      },
    ]);
    persistence.createDownloadUrl.mockReturnValue(url.promise);
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const view = render(<AgentReturnPackagesPanel enabled />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Скачать Готовая анкета · CODEX E2E ONE",
      }),
    );

    view.rerender(<AgentReturnPackagesPanel enabled={false} />);
    url.resolve("https://example.test/stale-signed-url.pdf");
    await Promise.resolve();
    await Promise.resolve();

    expect(anchorClick).not.toHaveBeenCalled();
  });
});
