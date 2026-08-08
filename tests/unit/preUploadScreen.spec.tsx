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

  test("keeps the empty family intake concise and primes OCR only on intent", async () => {
    render(<PreUploadScreen />);

    expect(prewarmLocalPassportOcr).not.toHaveBeenCalled();
    expect(screen.queryByText("Выберите город подачи.")).not.toBeInTheDocument();
    expect(screen.queryByText("Город подачи", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Город подачи" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("button", { name: "Сохранить черновик" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Продолжить без паспорта" }),
    ).toBeDisabled();
    const firstApplicant = screen.getAllByRole("listitem")[0];
    expect(
      firstApplicant?.querySelectorAll(".v19-preupload-applicant-state"),
    ).toHaveLength(0);
    expect(firstApplicant).toHaveTextContent("Основной заявитель");
    expect(screen.getByText("Супруг/супруга")).toBeVisible();
    expect(screen.queryByText("Без паспорта")).not.toBeInTheDocument();
    expect(screen.queryByText("Паспорт не добавлен")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Основной заявитель." })).toBeVisible();
    expect(
      screen.getByText(
        "Загрузите скан загранпаспорта. Это позволит вам меньше заполнять анкету за счет извлеченных данных.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Выбрать файл", { exact: true })).toHaveClass(
      "v19-preupload-file-picker-button",
    );
    const filePicker = screen.getByRole("button", { name: "Выбрать файл" });
    expect(filePicker).toHaveAccessibleDescription(
      "Основной заявитель. Загрузите скан загранпаспорта. Это позволит вам меньше заполнять анкету за счет извлеченных данных.",
    );
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Семья" })).toHaveFocus(),
    );

    fireEvent.focus(filePicker);
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
      preliminaryIntake: {
        arrivalPlace: "",
        homeAddress: "",
        sameArrivalPlace: false,
        sameHomeAddress: true,
        sameSpainStay: true,
        sameTripDates: false,
        spainStayAddress: "",
        spainStayCity: "",
        spainStayName: "",
        tripDateFrom: "",
        tripDateTo: "",
      },
      type: "family",
    });
  });

  test("carries the two family sharing choices into canonical intake", async () => {
    const onSubmit = vi.fn(async () => undefined);
    render(<PreUploadScreen onSubmit={onSubmit} />);

    expect(
      screen.getByRole("radio", {
        name: "Одинаковый адрес проживания в России?: Да",
      }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", {
        name: "Одинаковый адрес проживания в Испании?: Да",
      }),
    ).toHaveAttribute("aria-checked", "true");

    fireEvent.click(
      screen.getByRole("radio", {
        name: "Одинаковый адрес проживания в России?: Нет",
      }),
    );
    chooseCity();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить без паспорта" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0].preliminaryIntake).toMatchObject({
      sameHomeAddress: false,
      sameSpainStay: true,
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

  test("exposes an explicit questionnaire next step after manual OCR fallback", async () => {
    vi.mocked(invokePassportExtraction).mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    const onSubmit = vi.fn(async () => undefined);
    const { container } = render(
      <PreUploadScreen initialPackageType="single" onSubmit={onSubmit} />,
    );
    chooseCity();

    fireEvent.change(inputFor(container), {
      target: { files: [passportFile("manual-passport.jpg")] },
    });

    const manualButton = await screen.findByRole("button", {
      name: "Заполнить вручную",
    });
    fireEvent.click(manualButton);

    expect(
      await screen.findByRole("heading", { name: "Паспорт добавлен" }),
    ).toBeVisible();
    const continueButton = screen.getByRole("button", {
      name: "Далее: открыть анкету",
    });
    expect(continueButton).toBeEnabled();

    fireEvent.click(continueButton);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      city: "Казань",
      destination: "questionnaire",
      passportUploads: [
        expect.objectContaining({
          fileName: "manual-passport.jpg",
          status: "unavailable",
        }),
      ],
      type: "single",
    });
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
    const { container } = render(<PreUploadScreen />);
    const applicantControls = container.querySelector(
      ".v19-preupload-applicant-controls",
    );
    expect(applicantControls?.firstElementChild).toBe(
      screen.getByTestId("preupload-family-add"),
    );
    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(
        screen.getByRole("button", { name: "Добавить следующего заявителя" }),
      );
    }
    expect(
      screen.getByRole("button", { name: "Максимум 6 заявителей" }),
    ).toBeDisabled();
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
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
