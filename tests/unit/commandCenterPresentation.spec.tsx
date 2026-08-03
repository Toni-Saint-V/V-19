import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { tripDateRangeForSubmission } from "../../src/components/v19BusinessScreenAdapter";
import {
  agentActionQueue,
  agentActionWorkspaceTarget,
  type AgentActionItem,
} from "../../src/modules/submissions/agentActions";
import { initialSubmissions } from "../../src/modules/submissions/mockData";

const commandCenterSource = readFileSync(
  `${process.cwd()}/src/components/CommandCenter.tsx`,
  "utf8",
);

describe("CommandCenter presentation helpers", () => {
  test("keeps the shared collection shell across every agent section", () => {
    expect(commandCenterSource).toContain(
      'className="is-agent-shell-source-actions v19-agent-shell-frame"',
    );
    expect(commandCenterSource).toMatch(/collectionSurface\s+drawerOpen=/);
    expect(commandCenterSource).not.toContain("collectionSurface={activeNav");
  });

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

  test("routes a file correction to the exact applicant and file slot", () => {
    const action = agentActionQueue(initialSubmissions).open.find((candidate) =>
      candidate.id.startsWith("replace-"),
    );
    if (!action) throw new Error("Missing replacement action fixture.");
    const file = action.submission.files.find((candidate) =>
      action.id.endsWith(`-${candidate.id}`),
    );
    if (!file) throw new Error("Missing replacement file fixture.");

    expect(agentActionWorkspaceTarget(action)).toEqual({
      applicantId: file.applicantId,
      fileType: file.type,
      tab: "files",
    });
  });

  test("routes a questionnaire action to the exact applicant", () => {
    const action = agentActionQueue(initialSubmissions).open.find((candidate) =>
      candidate.id.startsWith("questionnaire-"),
    );
    if (!action) throw new Error("Missing questionnaire action fixture.");
    const applicant = action.submission.applicants.find((candidate) =>
      action.id.endsWith(`-${candidate.id}`),
    );
    if (!applicant) throw new Error("Missing questionnaire applicant fixture.");

    expect(agentActionWorkspaceTarget(action)).toMatchObject({
      applicantId: applicant.id,
      tab: "questionnaire",
    });
  });

  test("keeps the send-corrections action inside the issue lifecycle", () => {
    const source = initialSubmissions.find((submission) => submission.id === "ПД-1048");
    if (!source) throw new Error("Missing returned submission fixture.");
    const issue = source.issues[0];
    if (!issue) throw new Error("Missing returned issue fixture.");
    const action: AgentActionItem = {
      badges: [],
      completed: false,
      context: "Исправления готовы",
      cta: "Отправить",
      due: "week",
      dueLabel: "Готово к отправке",
      id: `submit-corrections-${source.id}`,
      searchText: "",
      severity: "ready",
      submission: {
        ...source,
        issues: source.issues.map((candidate) => ({
          ...candidate,
          status: "fixed_by_agent",
        })),
      },
      tab: "issues",
      title: "Отправить исправления",
    };

    expect(agentActionWorkspaceTarget(action)).toEqual({
      issueId: issue.id,
      tab: "issues",
    });
  });
});
