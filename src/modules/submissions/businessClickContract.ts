import type { Role, SubmissionAction, SubmissionStatus, Surface } from "./types";

export type BusinessClickSurface =
  | Surface
  | "excel-preview"
  | "new-submission"
  | "questionnaire"
  | "submission-drawer";

export type BusinessClickExecutionPath =
  | "applySubmissionActionResult"
  | "applyAgentSubmitForReviewResult"
  | "createDraft"
  | "updateQuestionnaireField"
  | "uploadRequiredFile"
  | "archiveAgentSubmissionCard"
  | "addPreciseAdminIssue"
  | "markSubmissionIssueFixedResult"
  | "exportSummary"
  | "applyExportStateToSelection"
  | "completeExportPackage"
  | "navigationOnly";

export type BusinessClickContract = {
  executionPath: BusinessClickExecutionPath;
  intent:
    | "submission_lifecycle"
    | "workspace_edit"
    | "issue_lifecycle"
    | "file_review"
    | "export_package"
    | "navigation"
    | "create_submission";
  ownerRole: Role;
  productionLogic: string;
  releaseState?: "blocked" | "enabled";
  submissionAction?: SubmissionAction;
  surfaces: readonly BusinessClickSurface[];
  transition?: {
    from: readonly SubmissionStatus[];
    to: SubmissionStatus;
  };
};

export const V19_BUSINESS_CLICK_CONTRACTS = {
  create_submission: {
    executionPath: "createDraft",
    intent: "create_submission",
    ownerRole: "agent",
    productionLogic: "src/modules/submissions/domainEngine.createDraft",
    surfaces: ["agent-submissions", "new-submission", "submission-drawer"],
  },
  archive_submission_card: {
    executionPath: "archiveAgentSubmissionCard",
    intent: "submission_lifecycle",
    ownerRole: "agent",
    productionLogic:
      "src/modules/submissions/supabasePersistence.archiveAgentSubmissionCard",
    surfaces: ["agent-submissions"],
  },
  save_progress: {
    executionPath: "applySubmissionActionResult",
    intent: "submission_lifecycle",
    ownerRole: "agent",
    productionLogic: "src/modules/submissions/status.applySubmissionActionResult",
    submissionAction: "save_progress",
    surfaces: ["agent-actions", "agent-submissions", "submission-drawer"],
    transition: { from: ["draft"], to: "in_progress" },
  },
  update_questionnaire_field: {
    executionPath: "updateQuestionnaireField",
    intent: "workspace_edit",
    ownerRole: "agent",
    productionLogic:
      "src/modules/submissions/submissionActions.updateQuestionnaireField",
    surfaces: ["questionnaire", "submission-drawer"],
  },
  upload_required_file: {
    executionPath: "uploadRequiredFile",
    intent: "workspace_edit",
    ownerRole: "agent",
    productionLogic: "src/modules/submissions/submissionActions.uploadRequiredFile",
    surfaces: ["agent-submissions", "submission-drawer"],
  },
  prepare_and_submit_for_review: {
    executionPath: "applyAgentSubmitForReviewResult",
    intent: "submission_lifecycle",
    ownerRole: "agent",
    productionLogic:
      "src/modules/submissions/status.applyAgentSubmitForReviewResult",
    surfaces: ["agent-submissions"],
    transition: {
      from: ["draft", "in_progress"],
      to: "submitted_for_review",
    },
  },
  submit_for_review: {
    executionPath: "applySubmissionActionResult",
    intent: "submission_lifecycle",
    ownerRole: "agent",
    productionLogic: "src/modules/submissions/status.applySubmissionActionResult",
    submissionAction: "submit_for_review",
    surfaces: ["agent-actions", "agent-submissions", "submission-drawer"],
    transition: {
      from: ["in_progress", "ready_for_export"],
      to: "submitted_for_review",
    },
  },
  add_admin_issue: {
    executionPath: "addPreciseAdminIssue",
    intent: "issue_lifecycle",
    ownerRole: "admin",
    productionLogic: "src/modules/submissions/submissionActions.addPreciseAdminIssue",
    surfaces: ["admin-review", "submission-drawer"],
  },
  return_with_issues: {
    executionPath: "applySubmissionActionResult",
    intent: "submission_lifecycle",
    ownerRole: "admin",
    productionLogic: "src/modules/submissions/status.applySubmissionActionResult",
    submissionAction: "return_with_issues",
    surfaces: ["admin-review", "submission-drawer"],
    transition: { from: ["submitted_for_review"], to: "returned" },
  },
  mark_issue_fixed: {
    executionPath: "markSubmissionIssueFixedResult",
    intent: "issue_lifecycle",
    ownerRole: "agent",
    productionLogic: "src/modules/submissions/status.markSubmissionIssueFixedResult",
    surfaces: [
      "agent-actions",
      "agent-submissions",
      "questionnaire",
      "submission-drawer",
    ],
  },
  submit_corrections: {
    executionPath: "applySubmissionActionResult",
    intent: "submission_lifecycle",
    ownerRole: "agent",
    productionLogic: "src/modules/submissions/status.applySubmissionActionResult",
    submissionAction: "submit_corrections",
    surfaces: ["agent-actions", "agent-submissions", "submission-drawer"],
    transition: { from: ["returned"], to: "corrections_received" },
  },
  accept: {
    executionPath: "applySubmissionActionResult",
    intent: "submission_lifecycle",
    ownerRole: "admin",
    productionLogic: "src/modules/submissions/status.applySubmissionActionResult",
    submissionAction: "accept",
    surfaces: ["admin-review", "submission-drawer"],
    transition: { from: ["submitted_for_review"], to: "ready_for_export" },
  },
  close_issues_accept: {
    executionPath: "applySubmissionActionResult",
    intent: "submission_lifecycle",
    ownerRole: "admin",
    productionLogic: "src/modules/submissions/status.applySubmissionActionResult",
    submissionAction: "close_issues_accept",
    surfaces: ["admin-review", "submission-drawer"],
    transition: { from: ["corrections_received"], to: "ready_for_export" },
  },
  return_again: {
    executionPath: "applySubmissionActionResult",
    intent: "submission_lifecycle",
    ownerRole: "admin",
    productionLogic: "src/modules/submissions/status.applySubmissionActionResult",
    submissionAction: "return_again",
    surfaces: ["admin-review", "submission-drawer"],
    transition: { from: ["corrections_received"], to: "returned" },
  },
  generate_export: {
    executionPath: "exportSummary",
    intent: "export_package",
    ownerRole: "admin",
    productionLogic: "src/modules/submissions/exportRules.exportSummary",
    submissionAction: "generate_export",
    surfaces: ["export", "excel-preview"],
    transition: { from: ["ready_for_export"], to: "ready_for_export" },
  },
  download_export: {
    executionPath: "applyExportStateToSelection",
    intent: "export_package",
    ownerRole: "admin",
    productionLogic:
      "src/modules/submissions/submissionActions.applyExportStateToSelection",
    surfaces: ["export", "excel-preview"],
  },
  mark_exported: {
    executionPath: "completeExportPackage",
    intent: "export_package",
    ownerRole: "admin",
    productionLogic: "src/modules/submissions/exportWorkflow.completeExportPackage",
    releaseState: "enabled",
    submissionAction: "mark_exported",
    surfaces: ["export", "excel-preview"],
    transition: { from: ["ready_for_export"], to: "exported" },
  },
  open_history: {
    executionPath: "navigationOnly",
    intent: "navigation",
    ownerRole: "admin",
    productionLogic: "src/modules/submissions/status.applySubmissionActionResult",
    submissionAction: "open_history",
    surfaces: ["agent-submissions", "admin-review", "export", "submission-drawer"],
    transition: { from: ["exported"], to: "exported" },
  },
} as const satisfies Record<string, BusinessClickContract>;

export type BusinessClickIntent = keyof typeof V19_BUSINESS_CLICK_CONTRACTS;

export const V19_BUSINESS_CLICK_CONTRACT_LIST = Object.values(
  V19_BUSINESS_CLICK_CONTRACTS,
) as readonly BusinessClickContract[];

export const V19_ALL_SUBMISSION_ACTION_CLICK_CONTRACTS =
  V19_BUSINESS_CLICK_CONTRACT_LIST.filter(
    (
      contract,
    ): contract is BusinessClickContract & { submissionAction: SubmissionAction } =>
      Boolean(contract.submissionAction),
  );

export const V19_SUBMISSION_ACTION_CLICK_CONTRACTS =
  V19_ALL_SUBMISSION_ACTION_CLICK_CONTRACTS.filter(
    (contract) => contract.releaseState !== "blocked",
  );

export function businessClickContractFor(
  intent: BusinessClickIntent,
): BusinessClickContract {
  return V19_BUSINESS_CLICK_CONTRACTS[intent];
}

export function isBusinessClickIntent(value: string): value is BusinessClickIntent {
  return Object.hasOwn(V19_BUSINESS_CLICK_CONTRACTS, value);
}
