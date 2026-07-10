import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { AdminReviewDrawer } from "../../src/components/AdminReviewDrawer";
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

    expect(screen.getByText("ПД-1053")).toHaveClass(
      "admin-review-submission-tag",
    );
    expect(screen.getByText("На проверке")).toHaveClass(
      "admin-review-status-pill",
      "is-blue",
    );
    expect(screen.getAllByTestId("admin-review-add-remark")[0]).toHaveClass(
      "admin-review-remark-action",
    );
    expect(container.querySelector(".admin-review-approve-action")).not.toBeNull();
    expect(
      container.querySelectorAll(".admin-review-questionnaire-section-title"),
    ).not.toHaveLength(0);
  });
});
