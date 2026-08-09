import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PreUploadScreen } from "../../src/components/PreUploadScreen";
import {
  invokePassportExtraction,
  prewarmLocalPassportOcr,
} from "../../src/modules/submissions/passportExtractionService";

vi.mock("../../src/modules/submissions/passportExtractionService", () => ({
  invokePassportExtraction: vi.fn(async () => ({
    fields: [],
    guardrails: [],
    source: "local-ocr",
    status: "unavailable",
    summary: "Local OCR unavailable.",
  })),
  prewarmLocalPassportOcr: vi.fn(async () => undefined),
}));

function passportFile(
  name = "scan.jpeg",
  type = "image/jpeg",
  bytes: Uint8Array = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
) {
  return new File([bytes], name, { type });
}

function chooseCity() {
  fireEvent.click(screen.getByLabelText("Город подачи"));
  fireEvent.click(screen.getByRole("option", { name: "Казань" }));
}

function inputFor(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  return input as HTMLInputElement;
}

describe("PreUploadScreen canonical intake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invokePassportExtraction).mockResolvedValue({
      fields: [],
      guardrails: [],
      source: "local-ocr",
      status: "unavailable",
      summary: "Local OCR unavailable.",
    });
  });

  test("does not preload OCR on open and explains why actions are disabled", async () => {
    render(<PreUploadScreen />);

    expect(prewarmLocalPassportOcr).not.toHaveBeenCalled();
    expect(screen.getByText("Выберите город подачи.")).not.toBeVisible();
    expect(screen.getByRole("button", { name: "Сохранить черновик" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Продолжить без паспорта" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Сохранить черновик" }),
    ).toHaveTextContent("Сохранить");
    expect(
      screen.getByRole("button", { name: "Продолжить без паспорта" }),
    ).toHaveTextContent("Продолжить");
    expect(screen.getByText("Паспорт — Основной заявитель")).toBeVisible();
    expect(
      screen.getByText("Загрузите паспорт — данные появятся в анкете."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Открыть данные из паспорта" }),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".v19-preupload-rail")).not.toBeInTheDocument();
    const firstApplicant = screen.getAllByRole("listitem")[0];
    expect(
      firstApplicant?.querySelectorAll(".v19-preupload-applicant-state"),
    ).toHaveLength(1);
    expect(firstApplicant).toHaveTextContent("ОсновнойБез паспорта");
    expect(screen.queryByText("Паспорт не добавлен")).not.toBeInTheDocument();

    fireEvent.focus(screen.getByRole("button", { name: "Выбрать файлы" }));
    await waitFor(() => expect(prewarmLocalPassportOcr).toHaveBeenCalledTimes(1));
  });

  test("creates an explicit passport-free canonical intent", async () => {
    const onSubmit = vi.fn(async () => undefined);
    render(<PreUploadScreen onSubmit={onSubmit} />);
    chooseCity();

    fireEvent.click(screen.getByRole("button", { name: "Продолжить без паспорта" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      city: "Казань",
      destination: "questionnaire",
      familyCount: 2,
      passportUploads: [],
      type: "family",
    });
  });

  test("keeps a neutral filename bound to its applicant while OCR is pending", async () => {
    let resolveExtraction:
      | ((value: Awaited<ReturnType<typeof invokePassportExtraction>>) => void)
      | undefined;
    vi.mocked(invokePassportExtraction).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveExtraction = resolve;
        }),
    );
    const onSubmit = vi.fn(async () => undefined);
    const { container } = render(
      <PreUploadScreen initialPackageType="single" onSubmit={onSubmit} />,
    );
    chooseCity();

    fireEvent.change(inputFor(container), {
      target: { files: [passportFile("IMG_0042.jpeg")] },
    });

    await waitFor(() => expect(invokePassportExtraction).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText("Дождитесь распознавания или выберите «Заполнить вручную»."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Создать и открыть анкету" }),
    ).toBeDisabled();

    await act(async () => {
      resolveExtraction?.({
        fields: [
          {
            confidence: "high",
            key: "firstName",
            needsManualReview: false,
            value: "ANTON",
          },
          {
            confidence: "high",
            key: "surname",
            needsManualReview: false,
            value: "VOLKOV",
          },
        ],
        guardrails: [],
        source: "local-ocr",
        status: "extracted",
        summary: "Passport extracted.",
      });
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Создать и открыть анкету" }),
      ).toBeEnabled(),
    );
    expect(
      screen.getByRole("button", { name: "Открыть данные из паспорта" }),
    ).toBeVisible();
    expect(document.querySelector(".v19-preupload-rail")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Создать и открыть анкету" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0].passportUploads).toEqual([
      expect.objectContaining({
        applicantIndex: 0,
        fileName: "IMG_0042.jpeg",
        status: "ready",
      }),
    ]);
  });

  test("rejects unsupported and oversized files before OCR", () => {
    const { container } = render(<PreUploadScreen initialPackageType="single" />);
    const input = inputFor(container);

    fireEvent.change(input, {
      target: { files: [passportFile("passport.gif", "image/gif")] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "JPEG, PNG, HEIC, HEIF или PDF",
    );
    expect(invokePassportExtraction).not.toHaveBeenCalled();

    const oversized = passportFile("passport.pdf", "application/pdf");
    Object.defineProperty(oversized, "size", { value: 50 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [oversized] } });
    expect(screen.getByRole("alert")).toHaveTextContent("больше 50 МБ");
    expect(invokePassportExtraction).not.toHaveBeenCalled();
  });

  test("accepts HEIC for private persistence and marks it for manual review", async () => {
    const onSubmit = vi.fn(async () => undefined);
    const { container } = render(
      <PreUploadScreen initialPackageType="single" onSubmit={onSubmit} />,
    );
    chooseCity();
    fireEvent.change(inputFor(container), {
      target: { files: [passportFile("passport.heic", "image/heic")] },
    });

    expect(invokePassportExtraction).not.toHaveBeenCalled();
    expect(screen.getByText("Вручную")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Создать и открыть анкету" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0].passportUploads[0]).toMatchObject({
      applicantIndex: 0,
      fileName: "passport.heic",
      status: "unavailable",
    });
  });

  test("requires explicit applicant assignment for a family batch", async () => {
    const { container } = render(<PreUploadScreen />);
    fireEvent.change(inputFor(container), {
      target: {
        files: [passportFile("first.jpg"), passportFile("second.jpg")],
      },
    });

    const dialog = screen.getByRole("dialog", { name: "Назначьте паспорта" });
    expect(dialog).toBeVisible();
    const selectors = screen.getAllByRole("combobox", { name: /Заявитель для/ });
    fireEvent.change(selectors[0] as HTMLSelectElement, { target: { value: "0" } });
    fireEvent.change(selectors[1] as HTMLSelectElement, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Распознать паспорта" }));

    await waitFor(() => expect(invokePassportExtraction).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByText("Вручную")).toHaveLength(2));
    expect(
      vi
        .mocked(invokePassportExtraction)
        .mock.calls.map(([input]) => input.applicantIndex),
    ).toEqual([0, 1]);
  });

  test("caps family intake at six applicants", () => {
    render(<PreUploadScreen />);
    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(
        screen.getByRole("button", { name: "Добавить следующего заявителя" }),
      );
    }
    expect(
      screen.getByRole("button", { name: "Максимум 6 заявителей" }),
    ).toBeDisabled();
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
  });

  test("reports dirty state to the workspace navigation guard", async () => {
    const onNavigationStateChange = vi.fn();
    render(<PreUploadScreen onNavigationStateChange={onNavigationStateChange} />);
    await waitFor(() =>
      expect(onNavigationStateChange).toHaveBeenLastCalledWith({
        busy: false,
        dirty: false,
      }),
    );

    chooseCity();
    await waitFor(() =>
      expect(onNavigationStateChange).toHaveBeenLastCalledWith({
        busy: false,
        dirty: true,
      }),
    );
  });

  test("renders real persistence stages instead of fake upload percentages", async () => {
    let resolveSubmit: (() => void) | undefined;
    const onSubmit = vi.fn(async (_intent, onProgress) => {
      onProgress({ stage: "saving_submission" });
      await new Promise<void>((resolve) => {
        resolveSubmit = resolve;
      });
    });
    render(<PreUploadScreen initialPackageType="single" onSubmit={onSubmit} />);
    chooseCity();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить без паспорта" }));

    await waitFor(() =>
      expect(screen.getAllByText("Создаём черновик…").length).toBeGreaterThan(0),
    );
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
    await act(async () => resolveSubmit?.());
  });
});
