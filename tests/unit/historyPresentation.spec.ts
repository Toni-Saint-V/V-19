import { describe, expect, it } from "vitest";

import {
  historyDetailForUser,
  historyTimestampForUser,
} from "../../src/modules/submissions/historyPresentation";

describe("history presentation", () => {
  it("localizes ISO timestamps and hides technical storage metadata", () => {
    const timestamp = historyTimestampForUser("2026-07-14T20:08:20.943Z");

    expect(timestamp).not.toContain("T");
    expect(timestamp).not.toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(
      historyDetailForUser({
        detail: "Предыдущий файл сохранён в истории замены: original=ui-synthetic-passport.jpeg",
      }),
    ).toBe("Предыдущая версия файла сохранена в истории.");
  });

  it("preserves already user-facing history content", () => {
    expect(historyTimestampForUser("сейчас")).toBe("сейчас");
    expect(historyDetailForUser({ detail: "Агент подтвердил исправление замечания." })).toBe(
      "Агент подтвердил исправление замечания.",
    );
  });
});
