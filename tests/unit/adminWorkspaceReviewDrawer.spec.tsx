import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AdminReviewDrawer } from "../../src/components/AdminReviewDrawer";
import { ReviewWorkspace } from "../../src/components/ReviewWorkspace";
import { initialSubmissions } from "../../src/modules/submissions/mockData";

afterEach(cleanup);

describe("AdminReviewDrawer visual hierarchy", () => {
  test("marks review controls with semantic styling hooks", () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");

    const { container } = render(
      <AdminReviewDrawer
        isOpen
        submission={submission}
        submissionId={submission.id}
        onAddRemark={() => undefined}
        onClose={() => undefined}
        onVerifyDocument={() => undefined}
      />,
    );

    expect(screen.getByText("ПД-1053")).toBeInTheDocument();
    expect(screen.getByText("На проверке")).toHaveClass(
      "bg-white/[0.045]",
      "text-white/62",
    );
    expect(screen.getAllByTestId("admin-review-add-remark").length).toBeGreaterThan(0);
    expect(
      screen.getAllByTitle("Пометить как проверенное").length,
    ).toBeGreaterThan(0);
    expect(container.querySelectorAll("section")).not.toHaveLength(0);
  });
});

describe("ReviewWorkspace safety boundary", () => {
  test("blocks completion when protected original and OCR evidence are unavailable", () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");
    const onAddRemark = vi.fn();

    render(
      <ReviewWorkspace
        onAddRemark={onAddRemark}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    expect(screen.getByText("Предпросмотр оригинала недоступен")).toBeInTheDocument();
    expect(screen.queryByText("PETROV")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Завершить сверку" })).toBeNull();

    screen.getAllByRole("button", { name: "Добавить замечание" })[0]?.click();
    expect(onAddRemark).toHaveBeenCalledTimes(1);
  });
});
