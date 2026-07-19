import { describe, expect, it } from "vitest";

import {
  relativeSubmissionCreatedAt,
  resolveSubmissionCreatedAt,
  submissionCreatedAtDateTime,
} from "../../src/modules/submissions/relativeCreatedAt";

const now = new Date("2026-07-19T12:00:00.000Z");

describe("relative submission creation time", () => {
  it.each([
    ["2026-07-19T11:59:01.000Z", "сейчас"],
    ["2026-07-19T11:59:00.000Z", "1 мин назад"],
    ["2026-07-19T11:30:00.000Z", "30 мин назад"],
    ["2026-07-19T07:00:00.000Z", "5 ч назад"],
    ["2026-07-18T12:00:00.000Z", "1 день назад"],
    ["2026-07-14T12:00:00.000Z", "5 дн назад"],
    ["2026-07-05T12:00:00.000Z", "2 нед назад"],
    ["2026-05-20T12:00:00.000Z", "2 мес назад"],
    ["2025-07-19T12:00:00.000Z", "1 год назад"],
  ])("formats %s as %s", (createdAt, expected) => {
    expect(relativeSubmissionCreatedAt(createdAt, now)).toBe(expected);
  });

  it("clamps future timestamps to now", () => {
    expect(relativeSubmissionCreatedAt("2026-07-20T12:00:00.000Z", now)).toBe(
      "сейчас",
    );
  });

  it("resolves legacy DD.MM in the current or previous year", () => {
    expect(resolveSubmissionCreatedAt("18.07", now)?.getFullYear()).toBe(2026);
    expect(resolveSubmissionCreatedAt("20.07", now)?.getFullYear()).toBe(2025);
    const canonical = submissionCreatedAtDateTime("18.07", now);
    expect(canonical).toBeDefined();
    expect(new Date(canonical!).getDate()).toBe(18);
  });

  it("reports invalid legacy and arbitrary values safely", () => {
    expect(relativeSubmissionCreatedAt("31.02", now)).toBe("дата неизвестна");
    expect(relativeSubmissionCreatedAt("broken", now)).toBe("дата неизвестна");
    expect(submissionCreatedAtDateTime("broken", now)).toBeUndefined();
  });
});
