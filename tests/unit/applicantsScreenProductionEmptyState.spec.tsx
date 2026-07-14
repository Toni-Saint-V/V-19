import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ApplicantsScreen } from "../../src/components/ApplicantsScreen";

afterEach(() => {
  cleanup();
});

describe("ApplicantsScreen production empty state", () => {
  test("renders only the canonical empty state when Supabase returns no submissions", () => {
    render(<ApplicantsScreen submissions={[]} onOpenDrawer={vi.fn()} />);

    expect(screen.getByText("Ничего не найдено")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В очереди" })).toHaveTextContent("0");
    expect(screen.queryByText("Семья Петровых")).not.toBeInTheDocument();
    expect(screen.queryByText("Семья Орловых")).not.toBeInTheDocument();
    expect(screen.queryByText("Алина Смирнова")).not.toBeInTheDocument();
    expect(screen.queryByText("Дмитрий Волков")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId(/demo/i)).toHaveLength(0);
  });
});
