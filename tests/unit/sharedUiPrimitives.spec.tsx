import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { Save } from "lucide-react";
import {
  Button,
  IconButton,
  Select,
  TextInputField,
} from "../../src/shared/ui/primitives";

afterEach(() => {
  cleanup();
});

describe("shared UI primitives", () => {
  test("supports button variants and sizes without changing the default size", () => {
    render(
      <>
        <Button>Continue</Button>
        <Button size="compact" variant="outline">
          Inspect
        </Button>
        <Button size="large" variant="secondary">
          Save draft
        </Button>
        <Button variant="plain">All statuses</Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "Continue" })).toHaveClass(
      "primary-button",
      "button-size-default",
    );
    expect(screen.getByRole("button", { name: "Inspect" })).toHaveClass(
      "outline-button",
      "button-size-compact",
    );
    expect(screen.getByRole("button", { name: "Save draft" })).toHaveClass(
      "secondary-button",
      "button-size-large",
    );
    expect(screen.getByRole("button", { name: "All statuses" })).toHaveClass(
      "plain-button",
      "button-size-default",
    );
    expect(screen.getByRole("button", { name: "All statuses" })).not.toHaveClass(
      "primary-button",
    );
  });

  test("keeps loading button width content and accessibility state stable", () => {
    render(<Button loading>Save package</Button>);

    const button = screen.getByRole("button", { name: "Save package" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveClass("is-loading");
    expect(button).toHaveTextContent("Save package");
  });

  test("keeps disabled buttons inert and not busy", () => {
    render(<Button disabled>Unavailable</Button>);

    const button = screen.getByRole("button", { name: "Unavailable" });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute("aria-busy");
  });

  test("supports compact accessible icon buttons", () => {
    render(
      <IconButton icon={<Save aria-hidden="true" />} label="Save" size="compact" />,
    );

    expect(screen.getByRole("button", { name: "Save" })).toHaveClass(
      "icon-button",
      "button-size-compact",
    );
  });

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
    expect(screen.getByText("City is required.")).toHaveAttribute("id", "city-error");
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
    expect(screen.getByText("Route is required.")).toHaveAttribute("id", "route-error");
  });
});
