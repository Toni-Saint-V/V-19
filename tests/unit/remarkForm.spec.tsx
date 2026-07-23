import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RemarkForm } from "../../src/components/RemarkForm";

afterEach(cleanup);

describe("RemarkForm", () => {
  test("exposes a semantic close control with the tokenized touch-target hook", () => {
    render(
      <RemarkForm
        isOpen
        onClose={() => undefined}
        submissionId="ПД-1053"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Закрыть форму замечания" }),
    ).toHaveClass("v19-remark-form-close");
  });

  test("returns focus to the exact remark trigger after the exit animation", async () => {
    function FocusFixture() {
      const [isOpen, setIsOpen] = useState(false);

      return (
        <>
          <button onClick={() => setIsOpen(true)} type="button">
            Добавить замечание: Страна рождения
          </button>
          <RemarkForm
            defaultField="Страна рождения"
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            submissionId="ПД-1053"
          />
        </>
      );
    }

    render(<FocusFixture />);
    const trigger = screen.getByRole("button", {
      name: "Добавить замечание: Страна рождения",
    });

    trigger.focus();
    fireEvent.click(trigger);
    const message = await screen.findByLabelText("Текст для клиента");
    await waitFor(() => expect(message).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test("keeps the dialog open and explains why an empty remark cannot be sent", () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <RemarkForm
        isOpen
        onClose={onClose}
        onSubmit={onSubmit}
        submissionId="ПД-1053"
      />,
    );

    fireEvent.change(screen.getByLabelText("Текст для клиента"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByTestId("remark-form-submit"));

    expect(screen.getByRole("alert")).toHaveTextContent("Введите текст замечания");
    expect(
      screen.getByRole("dialog", { name: "Добавить замечание" }),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("shows a pending state and stays open when persistence rejects the remark", async () => {
    const onClose = vi.fn();
    let resolveSubmit: (value: boolean) => void = () => undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    render(
      <RemarkForm
        isOpen
        onClose={onClose}
        onSubmit={onSubmit}
        submissionId="ПД-1053"
      />,
    );

    fireEvent.change(screen.getByLabelText("Текст для клиента"), {
      target: { value: "Проверьте данные в документе." },
    });
    fireEvent.click(screen.getByTestId("remark-form-submit"));

    expect(screen.getByTestId("remark-form-submit")).toBeDisabled();
    expect(screen.getByRole("dialog", { name: "Добавить замечание" })).toHaveAttribute(
      "aria-busy",
      "true",
    );

    resolveSubmit(false);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Не удалось сохранить замечание",
      );
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  test.each([
    {
      error: new Error("revision conflict"),
      expected:
        "Данные уже изменены другим администратором. Обновите подачу и проверьте её заново.",
    },
    {
      error: new Error("permission lost for current session"),
      expected:
        "Сессия или права доступа изменились. Войдите снова; подача не была изменена.",
    },
  ])("preserves exact persistence feedback: $expected", async ({ error, expected }) => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockRejectedValue(error);

    render(
      <RemarkForm
        isOpen
        onClose={onClose}
        onSubmit={onSubmit}
        submissionId="ПД-1053"
      />,
    );

    fireEvent.click(screen.getByTestId("remark-form-submit"));

    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(onClose).not.toHaveBeenCalled();
  });

  test("protects dirty text from accidental close until discard is confirmed", () => {
    const onClose = vi.fn();
    render(
      <RemarkForm
        defaultApplicant="Нина Волкова"
        defaultApplicantId="з-1053-1"
        defaultField="Номер паспорта"
        isOpen
        onClose={onClose}
        submissionId="ПД-1053"
      />,
    );

    fireEvent.change(screen.getByLabelText("Текст для клиента"), {
      target: { value: "Номер не совпадает с оригиналом." },
    });
    expect(screen.getByText("Есть несохранённые изменения")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("group", { name: "Несохранённое замечание" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть без сохранения" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("submits an exact target only once on a rapid double click", async () => {
    const pending = new Promise<boolean>(() => undefined);
    const onSubmit = vi.fn(() => pending);
    render(
      <RemarkForm
        defaultApplicant="Нина Волкова"
        defaultApplicantId="з-1053-1"
        defaultField="Номер паспорта"
        defaultFileType="passport_scan"
        isOpen
        onClose={() => undefined}
        onSubmit={onSubmit}
        submissionId="ПД-1053"
      />,
    );

    fireEvent.change(screen.getByLabelText("Текст для клиента"), {
      target: { value: "Проверьте номер в загранпаспорте." },
    });
    const submit = screen.getByTestId("remark-form-submit");
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      applicant: "Нина Волкова",
      applicantId: "з-1053-1",
      field: "Номер паспорта",
      fileType: "passport_scan",
      message: "Проверьте номер в загранпаспорте.",
      severity: "warning",
    });
    expect(submit).toBeDisabled();
  });
});
