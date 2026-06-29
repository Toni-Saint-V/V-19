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

  return { input, onCreate, ...result };
}

describe("CreateSubmissionDrawer passport readiness", () => {
  test("allows accepted JPEG files to move to manual operator check without fake OCR", async () => {
    const { input } = renderCreateDrawer();
    const nextButton = screen.getByRole("button", { name: "Дальше" });

    expect(nextButton).toBeDisabled();
    expect(screen.getAllByText("Нужен файл паспорта").length).toBeGreaterThan(0);

    fireEvent.change(input, {
      target: { files: [rejectedPassportFile("notes.txt")] },
    });

    await waitFor(() => {
      expect(
        screen.getByText("Паспорт принимается только в формате JPEG или PNG."),
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
      expect(nextButton).toBeEnabled();
    });
    expect(invokePassportExtraction).toHaveBeenCalledTimes(2);
  });
});
