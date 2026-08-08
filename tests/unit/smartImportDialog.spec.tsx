import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  SmartImportDialog,
  type SmartImportDialogExtraction,
} from "../../src/modules/submissions/components/SmartImportDialog";
import type { SmartImportParsedResult } from "../../src/modules/submissions/smartImport";

afterEach(cleanup);

const parsed: SmartImportParsedResult = {
  candidates: [
    {
      confidence: "high",
      fieldId: "email",
      label: "Email",
      sectionId: "contacts",
      value: "anton@example.com",
    },
    {
      confidence: "high",
      fieldId: "employer-name",
      label: "Работодатель",
      sectionId: "employment",
      value: "ООО НОВОЕ",
    },
    {
      confidence: "low",
      fieldId: "home-city",
      label: "Город",
      sectionId: "contacts",
      value: "Санкт-Петербург",
    },
  ],
  documentKind: "filled_form",
  summary: "Источник: заполненная анкета. Найдено полей: 3.",
};

function renderDialog(
  options: {
    currentValues?: Record<string, string>;
    extraction?: SmartImportDialogExtraction;
    onApply?: ReturnType<typeof vi.fn>;
    onClose?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const onApply = options.onApply ?? vi.fn();
  const onClose = options.onClose ?? vi.fn();
  const extraction =
    options.extraction ??
    ({
      fromFile: vi.fn(async () => parsed),
      fromText: vi.fn(async () => parsed),
    } satisfies SmartImportDialogExtraction);

  render(
    <SmartImportDialog
      applicantKey="applicant-1"
      currentValues={options.currentValues ?? { "employer-name": "ООО СТАРОЕ" }}
      extraction={extraction}
      open
      onApply={onApply}
      onClose={onClose}
    />,
  );
  return { extraction, onApply, onClose };
}

describe("SmartImportDialog", () => {
  test("states the ephemeral privacy boundary", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: "Умный импорт" })).toBeInTheDocument();
    expect(
      screen.getByText(/Фото, PDF и исходный текст не сохраняются/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Сохранятся только выбранные поля/i)).toBeInTheDocument();
  });

  test("processes pasted text, clears it, and shows sanitized review rows", async () => {
    const fromText = vi.fn(async () => parsed);
    const extraction: SmartImportDialogExtraction = {
      fromFile: vi.fn(async () => parsed),
      fromText,
    };
    renderDialog({ extraction });

    const textbox = screen.getByLabelText("Вставить текст");
    fireEvent.change(textbox, { target: { value: "СЕКРЕТНЫЙ ИСХОДНЫЙ ТЕКСТ" } });
    fireEvent.click(screen.getByRole("button", { name: "Распознать текст" }));

    await waitFor(() =>
      expect(fromText).toHaveBeenCalledWith("СЕКРЕТНЫЙ ИСХОДНЫЙ ТЕКСТ"),
    );
    await waitFor(() =>
      expect(screen.getByText("anton@example.com")).toBeInTheDocument(),
    );
    expect(textbox).toHaveValue("");
    expect(screen.queryByText("СЕКРЕТНЫЙ ИСХОДНЫЙ ТЕКСТ")).not.toBeInTheDocument();
  });

  test("processes a selected file without rendering its filename", async () => {
    const fromFile = vi.fn(async () => parsed);
    const extraction: SmartImportDialogExtraction = {
      fromFile,
      fromText: vi.fn(async () => parsed),
    };
    renderDialog({ extraction });
    const file = new File(["private"], "private-registration-page.jpg", {
      type: "image/jpeg",
    });

    fireEvent.change(screen.getByLabelText("Выбрать фото или PDF"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(fromFile).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText("anton@example.com")).toBeInTheDocument(),
    );
    expect(screen.queryByText("private-registration-page.jpg")).not.toBeInTheDocument();
  });

  test("processes a package of files in one local review", async () => {
    const fromFiles = vi.fn(async () => parsed);
    const extraction: SmartImportDialogExtraction = {
      fromFile: vi.fn(async () => parsed),
      fromFiles,
      fromText: vi.fn(async () => parsed),
    };
    renderDialog({ extraction });
    const files = [
      new File(["private-one"], "private-one.jpg", { type: "image/jpeg" }),
      new File(["private-two"], "private-two.pdf", { type: "application/pdf" }),
    ];

    fireEvent.change(screen.getByLabelText("Выбрать фото или PDF"), {
      target: { files },
    });

    await waitFor(() => expect(fromFiles).toHaveBeenCalledTimes(1));
    expect(fromFiles.mock.calls[0]?.[0]).toEqual(files);
    await screen.findByText("anton@example.com");
    expect(screen.queryByText("private-one.jpg")).not.toBeInTheDocument();
    expect(screen.queryByText("private-two.pdf")).not.toBeInTheDocument();
  });

  test("selects only new trusted values by default", async () => {
    const { onApply } = renderDialog();
    fireEvent.change(screen.getByLabelText("Вставить текст"), {
      target: { value: "ДАННЫЕ ДЛЯ РАСПОЗНАВАНИЯ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Распознать текст" }));

    await screen.findByText("anton@example.com");
    expect(screen.getByLabelText("Применить Email")).toBeChecked();
    expect(screen.getByLabelText("Применить Работодатель")).not.toBeChecked();
    expect(screen.getByLabelText("Применить Город")).not.toBeChecked();
    expect(screen.getByText("Конфликт с анкетой")).toBeInTheDocument();
    expect(screen.getByText("Низкая уверенность")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Применить выбранное" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ fieldId: "email", value: "anton@example.com" }),
    ]);
  });

  test("lets the agent explicitly include a conflicting value", async () => {
    const { onApply } = renderDialog();
    fireEvent.change(screen.getByLabelText("Вставить текст"), {
      target: { value: "ДАННЫЕ ДЛЯ РАСПОЗНАВАНИЯ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Распознать текст" }));
    await screen.findByText("anton@example.com");

    fireEvent.click(screen.getByLabelText("Применить Работодатель"));
    fireEvent.click(screen.getByRole("button", { name: "Применить выбранное" }));

    expect(onApply.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldId: "email" }),
        expect.objectContaining({ fieldId: "employer-name", value: "ООО НОВОЕ" }),
      ]),
    );
  });

  test("ignores a late text result after cancellation", async () => {
    let resolveText: ((value: SmartImportParsedResult) => void) | undefined;
    const extraction: SmartImportDialogExtraction = {
      fromFile: vi.fn(async () => parsed),
      fromText: vi.fn(
        () =>
          new Promise<SmartImportParsedResult>((resolve) => {
            resolveText = resolve;
          }),
      ),
    };
    renderDialog({ extraction });

    fireEvent.change(screen.getByLabelText("Вставить текст"), {
      target: { value: "СЕКРЕТНЫЙ ИСХОДНЫЙ ТЕКСТ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Распознать текст" }));
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    resolveText?.(parsed);

    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText("anton@example.com")).not.toBeInTheDocument();
  });

  test("aborts active extraction and clears state on cancel", async () => {
    let observedSignal: AbortSignal | undefined;
    const extraction: SmartImportDialogExtraction = {
      fromFile: vi.fn(async (_file, options) => {
        observedSignal = options.signal;
        return new Promise<SmartImportParsedResult>(() => undefined);
      }),
      fromText: vi.fn(async () => parsed),
    };
    const { onClose } = renderDialog({ extraction });
    const file = new File(["private"], "private.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Выбрать фото или PDF"), {
      target: { files: [file] },
    });
    await waitFor(() => expect(observedSignal).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));

    expect(observedSignal?.aborted).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
