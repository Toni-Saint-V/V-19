import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { Select, TextInputField } from "../../src/shared/ui/primitives";

afterEach(() => {
  cleanup();
});

describe("shared UI primitives", () => {
  test("keeps select helper and error descriptions associated", () => {
    render(
      <>
        <p id="city-helper">Choose an office city.</p>
        <Select
          aria-describedby="city-helper"
          errorMessage="City is required."
          id="city"
          label="City"
          options={[{ label: "Madrid", value: "madrid" }]}
          value=""
          onChange={() => undefined}
        />
      </>,
    );

    expect(screen.getByRole("combobox", { name: /City/ })).toHaveAttribute(
      "aria-describedby",
      "city-helper city-error",
    );
    expect(screen.getByText("City is required.")).toHaveAttribute(
      "id",
      "city-error",
    );
  });

  test("keeps text input helper and error descriptions associated", () => {
    render(
      <>
        <p id="route-helper">Use the full itinerary.</p>
        <TextInputField
          aria-describedby="route-helper"
          errorMessage="Route is required."
          id="route"
          label="Route"
          value=""
          onChange={() => undefined}
        />
      </>,
    );

    expect(screen.getByRole("textbox", { name: /Route/ })).toHaveAttribute(
      "aria-describedby",
      "route-helper route-error",
    );
    expect(screen.getByText("Route is required.")).toHaveAttribute(
      "id",
      "route-error",
    );
  });
});
