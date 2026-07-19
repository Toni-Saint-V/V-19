import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AppCrashBoundary } from "../../src/components/AppCrashBoundary";

function ThrowingChild() {
  throw new Error("private render detail");
}

describe("AppCrashBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("renders children while the application is healthy", () => {
    render(
      <AppCrashBoundary>
        <p>Рабочая область</p>
      </AppCrashBoundary>,
    );

    expect(screen.getByText("Рабочая область")).toBeInTheDocument();
  });

  test("shows a safe recovery action after a render failure", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onError = vi.fn();
    const onReload = vi.fn();

    render(
      <AppCrashBoundary onError={onError} onReload={onReload}>
        <ThrowingChild />
      </AppCrashBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveAttribute(
      "data-testid",
      "app-crash-boundary",
    );
    expect(
      screen.getByRole("heading", { name: "Интерфейс не загрузился" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("private render detail")).not.toBeInTheDocument();
    expect(onError).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Перезагрузить приложение" }));
    expect(onReload).toHaveBeenCalledOnce();
  });
});
