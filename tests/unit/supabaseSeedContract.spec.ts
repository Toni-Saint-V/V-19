import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

function readProjectFile(relativePath: string): string {
  return readFileSync(`${process.cwd()}/${relativePath}`, "utf8");
}

function normalizeSql(content: string): string {
  return content.replace(/--.*$/gm, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

describe("Supabase local seed contract", () => {
  const seed = readProjectFile("supabase/seed.sql");
  const normalizedSeed = normalizeSql(seed);

  test("is explicitly local-only and uses fake development credentials", () => {
    expect(seed).toContain("Use only with local Supabase reset/start workflows");
    expect(seed).toContain("Do not run against production");
    expect(seed).toContain("agent.dev@visaflow.local");
    expect(seed).toContain("admin.dev@visaflow.local");
    expect(seed).toContain("visaflow-local-agent");
    expect(seed).toContain("visaflow-local-admin");
  });

  test("does not include client secrets, service-role keys, or real-looking inboxes", () => {
    expect(normalizedSeed).not.toContain("service_role");
    expect(seed).not.toMatch(/sk-[A-Za-z0-9_-]+/);
    expect(seed).not.toMatch(/@gmail\.com|@yandex\.|@mail\.ru|@icloud\.com/i);
    expect(seed).toContain("example.invalid");
  });

  test("creates role-backed auth/profile fixtures for agent and admin", () => {
    expect(seed).toContain("insert into auth.users");
    expect(seed).toContain("insert into auth.identities");
    expect(seed).toContain("insert into public.profiles");
    expect(seed).toContain("'agent'");
    expect(seed).toContain("'admin'");
    expect(seed).toContain("select set_config('request.jwt.claim.sub'");
  });

  test("covers the MVP submission states without introducing forbidden scope tables", () => {
    expect(seed).toContain("'returned'");
    expect(seed).toContain("'filling'");
    expect(seed).toContain("'waiting_review'");
    expect(seed).toContain("'ready_for_review'");
    expect(seed).toContain("'ready_for_excel'");
    expect(seed).toContain("returned_with_open_issue");
    expect(seed).toContain("corrections_received");
    expect(seed).not.toContain("insert into public.crm");
    expect(seed).not.toContain("insert into public.analytics");
    expect(seed).not.toContain("insert into public.kanban");
  });

  test("seeds normalized applicants, questionnaire answers, file metadata, corrections, history, and export state", () => {
    expect(seed).toContain("insert into public.applicants");
    expect(seed).toContain("insert into public.questionnaire_answers");
    expect(seed).toContain("insert into public.media_assets");
    expect(seed).toContain("insert into public.corrections");
    expect(seed).toContain("insert into public.status_history");
    expect(seed).toContain("insert into public.export_batches");
    expect(seed).toContain("on conflict (applicant_id, section_id, field_id)");
    expect(seed).toContain("'open'");
    expect(seed).toContain("'fixed'");
    expect(seed).toContain("'closed'");
  });

  test("keeps storage and export claims fail-closed in local seed data", () => {
    expect(seed).toContain("'submission-media'");
    expect(seed).toContain("'none'");
    expect(seed).toContain("'not_reviewed'");
    expect(seed).toContain("'uploaded'::public.media_upload_status");
    expect(seed).toContain("'accepted'::public.media_review_status");
    expect(seed).toContain("'video', 'mp4', 'video/mp4'");
    expect(seed).toContain("submission_seed.status in ('waiting_review', 'ready_for_review', 'ready_for_excel')");
    expect(seed).toContain("'duplicateCheckStatus', 'unknown'");
    expect(seed).toContain("'downloadEnabled', false");
    expect(seed).toContain("generate_series(1, 56)");
    expect(seed).toContain("'state', case when n = 56 then 'unresolved' else 'mapped' end");
    expect(normalizedSeed).not.toContain("insert into storage.objects");
    expect(normalizedSeed).not.toContain("'ocr'");
    expect(normalizedSeed).not.toContain("'excel_generated'");
  });
});
