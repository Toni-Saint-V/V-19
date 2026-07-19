import { describe, expect, test } from "vitest";

import { tripDateRangeForSubmission } from "../../src/components/v19BusinessScreenAdapter";

describe("CommandCenter presentation helpers", () => {
  test("omits a trip date when neither boundary is specified", () => {
    expect(
      tripDateRangeForSubmission({ tripDateFrom: "", tripDateTo: "не указано" }),
    ).toBeUndefined();
  });

  test("keeps a real compact trip date range", () => {
    expect(
      tripDateRangeForSubmission({
        tripDateFrom: "22.07.2026",
        tripDateTo: "31.07.2026",
      }),
    ).toBe("22.07–31.07");
  });

  test("keeps one compact boundary when only one date is specified", () => {
    expect(
      tripDateRangeForSubmission({
        tripDateFrom: "22.07.2026",
        tripDateTo: "не указана",
      }),
    ).toBe("22.07");
  });

  test("omits a missing desktop date", () => {
    expect(
      tripDateRangeForSubmission({ tripDateFrom: "", tripDateTo: "не указано" }),
    ).toBeUndefined();
  });
});
