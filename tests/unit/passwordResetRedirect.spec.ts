import { describe, expect, test } from "vitest";

import { resolvePasswordResetRedirectTo } from "../../src/services/passwordResetRedirect";

describe("password reset redirect", () => {
  test("uses the canonical production application instead of localhost", () => {
    expect(
      resolvePasswordResetRedirectTo(
        { origin: "http://localhost:3000", pathname: "/" },
        "production",
      ),
    ).toBe("https://document-intake-system.vercel.app/");
  });

  test("keeps the current page for sandbox recovery", () => {
    expect(
      resolvePasswordResetRedirectTo(
        { origin: "http://localhost:3000", pathname: "/access" },
        "sandbox",
      ),
    ).toBe("http://localhost:3000/access");
  });

  test("returns undefined when no browser location exists", () => {
    expect(resolvePasswordResetRedirectTo(undefined, "production")).toBeUndefined();
  });
});
