import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { V19SubmissionIdentity } from "../../src/shared/ui/v19-design-system";

afterEach(() => {
  cleanup();
});

describe("V19SubmissionIdentity", () => {
  test("keeps a single submission to public ID and title only", () => {
    const { container } = render(
      <V19SubmissionIdentity
        peopleCount={1}
        publicId="VF-1060"
        title="ANTON VOLKOV"
      />,
    );

    expect(screen.getByText("VF-1060")).toBeInTheDocument();
    expect(screen.getByText("ANTON VOLKOV")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Количество человек/)).not.toBeInTheDocument();
    expect(
      container.querySelector(".v19-submission-identity-separator"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".v19-submission-identity-city"),
    ).not.toBeInTheDocument();
  });

  test("shows aligned family metadata, optional city, and trip dates", () => {
    const { container } = render(
      <V19SubmissionIdentity
        city="Москва"
        peopleCount={3}
        publicId="VF-1061"
        title="IVAN PETROV"
        tripDates="18.08.2026-02.09.2026"
      />,
    );

    expect(screen.getByLabelText("Количество человек: 3")).toBeInTheDocument();
    expect(screen.getByText("Москва")).toBeInTheDocument();
    expect(screen.getByText("18.08.2026-02.09.2026")).toBeInTheDocument();
    expect(
      container.querySelector(".v19-submission-identity-separator"),
    ).toHaveTextContent("·");
    expect(
      container.querySelector(".v19-submission-identity-city svg"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(
      container.querySelector(".v19-submission-trip-dates svg"),
    ).toHaveAttribute("aria-hidden", "true");
  });
});
