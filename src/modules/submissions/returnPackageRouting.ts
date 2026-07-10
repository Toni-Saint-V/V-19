import { orderSubmissionsForExportPackage } from "./exportRules";
import type { Applicant, Submission } from "./types";

export type ReturnPackageApplicant = {
  applicant: Applicant;
  applicantId: string;
  applicantName: string;
  familySubmissionId?: string;
  submissionId: string;
  submissionTitle: string;
  submissionType: Submission["type"];
};

export type ReturnPackageGroup = {
  agentId: string;
  applicants: ReturnPackageApplicant[];
  city: Submission["city"];
  exportPackageKey: string;
  submissions: Submission[];
};

/**
 * This is a UI projection only. The database revalidates the same grouping from
 * the frozen export snapshot before it accepts any return package upload.
 */
export function buildReturnPackageGroups(
  submissions: readonly Submission[],
): ReturnPackageGroup[] {
  const groups = new Map<string, ReturnPackageGroup>();

  for (const submission of submissions) {
    const exportPackageKey = submission.exportPackage?.idempotencyKey;
    if (submission.status !== "exported" || !exportPackageKey) continue;

    const key = [exportPackageKey, submission.city, submission.agentId].join("\u0000");
    const current = groups.get(key) ?? {
      agentId: submission.agentId,
      applicants: [],
      city: submission.city,
      exportPackageKey,
      submissions: [],
    };

    current.submissions.push(submission);
    current.applicants.push(
      ...submission.applicants.map((applicant) => ({
        applicant,
        applicantId: applicant.id,
        applicantName: applicant.fullName,
        familySubmissionId:
          submission.type === "family" ? submission.id : undefined,
        submissionId: submission.id,
        submissionTitle: submission.listTitle ?? submission.title,
        submissionType: submission.type,
      })),
    );
    groups.set(key, current);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      submissions: orderSubmissionsForExportPackage(group.submissions),
    }))
    .map((group) => ({
      ...group,
      applicants: group.submissions.flatMap((submission) =>
        submission.applicants.map((applicant) => ({
          applicant,
          applicantId: applicant.id,
          applicantName: applicant.fullName,
          familySubmissionId:
            submission.type === "family" ? submission.id : undefined,
          submissionId: submission.id,
          submissionTitle: submission.listTitle ?? submission.title,
          submissionType: submission.type,
        })),
      ),
    }))
    .sort(
      (left, right) =>
        left.city.localeCompare(right.city, "ru") ||
        left.agentId.localeCompare(right.agentId) ||
        left.exportPackageKey.localeCompare(right.exportPackageKey),
    );
}

export function returnPackageGroupLabel(group: ReturnPackageGroup): string {
  return `${group.city} · ${group.applicants.length} чел.`;
}
