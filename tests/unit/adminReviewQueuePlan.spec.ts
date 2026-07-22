// tests/unit/adminReviewQueuePlan.spec.ts
import { describe, expect, test } from "vitest";

import { buildAdminReviewQueuePlan } from "../../src/modules/submissions/adminReviewQueuePlan";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import type { Submission } from "../../src/modules/submissions/types";

const now = new Date("2026-07-21T12:00:00.000Z");

function fixture(id: string): Submission {
  const submission = initialSubmissions.find((item) => item.id === id);
  if (!submission) throw new Error(`Missing submission fixture: ${id}`);
  return structuredClone(submission);
}

describe("admin review queue plan", () => {
  test("puts received corrections ahead of a clean first review", () => {
    const firstReview = fixture("ПД-1053");
    const corrections = fixture("ПД-1055");

    const plan = buildAdminReviewQueuePlan([firstReview, corrections], now);

    expect(plan.items.map((item) => item.submissionId)).toEqual(["ПД-1055", "ПД-1053"]);
    expect(plan.top).toMatchObject({
      band: "attention",
      priorityReason: "1 исправление ждёт закрытия",
      submissionId: "ПД-1055",
    });
  });

  test("does not label pending file review as a critical business blocker", () => {
    const firstReview = fixture("ПД-1053");

    const plan = buildAdminReviewQueuePlan([firstReview], now);

    expect(plan.top).toMatchObject({
      band: "standard",
      submissionId: "ПД-1053",
    });
    expect(plan.totals).toEqual({
      attention: 0,
      critical: 0,
      standard: 1,
    });
  });

  test("raises a near trip date to the top without changing canonical status", () => {
    const urgent = {
      ...fixture("ПД-1053"),
      id: "ПД-URGENT",
      tripDateFrom: "24.07.2026",
    };
    const planned = {
      ...fixture("ПД-1053"),
      id: "ПД-PLANNED",
      tripDateFrom: "20.09.2026",
    };

    const plan = buildAdminReviewQueuePlan([planned, urgent], now);

    expect(plan.top).toMatchObject({
      band: "critical",
      daysToTrip: 3,
      submissionId: "ПД-URGENT",
      tripUrgency: "imminent",
    });
    expect(urgent.status).toBe("submitted_for_review");
  });

  test("keeps non-review submissions outside the operational plan", () => {
    const review = fixture("ПД-1053");
    const exportReady = fixture("ПД-1054");

    const plan = buildAdminReviewQueuePlan([review, exportReady], now);

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]?.submissionId).toBe("ПД-1053");
  });

  test("uses submission id as a deterministic final tie-breaker", () => {
    const left = {
      ...fixture("ПД-1053"),
      id: "ПД-B",
    };
    const right = {
      ...fixture("ПД-1053"),
      id: "ПД-A",
    };

    const plan = buildAdminReviewQueuePlan([left, right], now);

    expect(plan.items.map((item) => item.submissionId)).toEqual(["ПД-A", "ПД-B"]);
  });
});
