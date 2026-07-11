import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CreateSubmissionDrawer } from "../../src/modules/submissions/components/CreateSubmissionDrawer";
import { invokePassportExtraction } from "../../src/modules/submissions/passportExtractionService";

vi.mock("../../src/modules/submissions/passportExtractionService", () => ({
  invokePassportExtraction: vi.fn(async () => ({
    fields: [],
    status: "unavailable",
    summary: "Local OCR unavailable.",
  })),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function passportFile(name: string) {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], name, {
    type: "image/jpeg",
  });
}

function rejectedPassportFile(name: string) {
  return new File(["not a passport image"], name, {
    type: "text/plain",
  });
}

function renderCreateDrawer() {
  const onCreate = vi.fn();
  const result = render(
    <CreateSubmissionDrawer
      familyCount={2}
      type="family"
      onClose={() => undefined}
      onCreate={onCreate}
      onFamilyCount={() => undefined}
      onPassportFilesSelected={() => undefined}
      onType={() => undefined}
    />,
  );
  const input = result.container.querySelector<HTMLInputElement>(".pi-file-input");
  if (!input) throw new Error("Expected passport upload input.");
  const nextButton = result.container.querySelector<HTMLButtonElement>(
    ".create-passport-next",
  );
  if (!nextButton) throw new Error("Expected passport step next button.");

  return { input, nextButton, onCreate, ...result };
}

describe("CreateSubmissionDrawer passport readiness", () => {
  test("shows extracted passport fields in the animated right column", async () => {
    vi.mocked(invokePassportExtraction).mockResolvedValueOnce({
      fields: [
        {
          confidence: "high",
          key: "surname",
          needsManualReview: false,
          value: "VOLKOV",
        },
        {
          confidence: "high",
          key: "firstName",
          needsManualReview: false,
          value: "ANTON",
        },
        {
          confidence: "high",
          key: "passportNumber",
          needsManualReview: false,
          value: "752869613",
        },
      ],
      guardrails: [],
      source: "local-ocr",
      status: "extracted",
      summary: "Passport extracted.",
    });
    const { input } = renderCreateDrawer();

    fireEvent.change(input, {
      target: { files: [passportFile("volkov.jpg")] },
    });

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Распознанные поля OCR" })).toBeVisible();
      expect(screen.getByText("VOLKOV")).toBeVisible();
      expect(screen.getByText("ANTON")).toBeVisible();
      expect(screen.getByText("752869613")).toBeVisible();
    });
  });

  test("keeps incomplete extracted OCR under operator review", async () => {
    vi.mocked(invokePassportExtraction).mockResolvedValueOnce({
      fields: [
        {
          confidence: "high",
          key: "passportNumber",
          needsManualReview: false,
          value: "752869613",
        },
      ],
      guardrails: [],
      source: "local-ocr",
      status: "extracted",
      summary: "Partial passport extraction.",
    });
    const { input, nextButton } = renderCreateDrawer();

    fireEvent.change(input, {
      target: { files: [passportFile("partial.jpg")] },
    });

    await waitFor(() => {
      expect(screen.getAllByText("partial.jpg").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Проверка оператором").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Паспорт принят")).not.toBeInTheDocument();
    expect(nextButton).toBeDisabled();
  });

  test("keeps failed OCR under operator review without accepted copy", async () => {
    vi.mocked(invokePassportExtraction).mockRejectedValueOnce(new Error("OCR failed."));
    const { input, nextButton } = renderCreateDrawer();

    fireEvent.change(input, {
      target: { files: [passportFile("failed.jpg")] },
    });

    await waitFor(() => {
      expect(screen.getAllByText("failed.jpg").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Проверка оператором").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Паспорт принят")).not.toBeInTheDocument();
    expect(nextButton).toBeDisabled();
  });

  test("allows accepted JPEG files to move to manual operator check without fake OCR", async () => {
    const { input, nextButton } = renderCreateDrawer();

    expect(nextButton).toBeDisabled();
    expect(screen.getAllByText("Нужен файл паспорта").length).toBeGreaterThan(0);

    fireEvent.change(input, {
      target: { files: [rejectedPassportFile("notes.txt")] },
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          "Паспорт принимается только в формате JPEG, PNG, HEIC, HEIF или PDF.",
        ),
      ).toBeVisible();
    });
    expect(nextButton).toBeDisabled();

    fireEvent.change(input, {
      target: { files: [passportFile("ivan.jpg")] },
    });

    await waitFor(() => {
      expect(screen.getAllByText("ivan.jpg").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Проверка оператором").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Паспорт принят")).not.toBeInTheDocument();
    expect(invokePassportExtraction).toHaveBeenCalledTimes(1);
    expect(nextButton).toBeDisabled();

    fireEvent.click(screen.getAllByRole("button", { name: /Заявитель 2/ })[0]!);
    fireEvent.change(input, {
      target: { files: [passportFile("anna.jpg")] },
    });

    await waitFor(() => {
      expect(screen.getAllByText("anna.jpg").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Проверка оператором").length).toBeGreaterThanOrEqual(
        2,
      );
      expect(screen.queryByText("Паспорт принят")).not.toBeInTheDocument();
      expect(nextButton).toBeEnabled();
    });
    expect(invokePassportExtraction).toHaveBeenCalledTimes(2);
  });
});
