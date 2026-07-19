import { describe, expect, test } from "vitest";

import {
  compactTripDateForSubmission,
  fullTripDateForSubmission,
} from "../../src/components/v19BusinessScreenAdapter";

describe("CommandCenter presentation helpers", () => {
  test("omits a trip date when neither boundary is specified", () => {
    expect(
      compactTripDateForSubmission({ tripDateFrom: "", tripDateTo: "не указано" }),
    ).toBeUndefined();
  });

  test("keeps a real compact trip date", () => {
    expect(
      compactTripDateForSubmission({
        tripDateFrom: "22.07.2026",
        tripDateTo: "31.07.2026",
      }),
    ).toBe("22.07");
  });

  test("keeps one full trip date for the widest desktop layout", () => {
    expect(
      fullTripDateForSubmission({
        tripDateFrom: "22.07.2026",
        tripDateTo: "31.07.2026",
      }),
    ).toBe("22.07.2026");
  });

  test("labels a missing full desktop date", () => {
    expect(
      fullTripDateForSubmission({ tripDateFrom: "", tripDateTo: "не указано" }),
    ).toBe("Дата не указана");
  });
});
