import {
  V19_BUSINESS_CLICK_CONTRACTS,
  type BusinessClickContract,
  type BusinessClickIntent,
} from "./businessClickContract";
import type { Role, SubmissionStatus } from "./types";

export type AgentInteractionKind =
  | "clipboard"
  | "device_preference"
  | "dialog"
  | "download"
  | "filter"
  | "input"
  | "mutation"
  | "navigation"
  | "session";

export type AgentInteractionSurface =
  | "access"
  | "agent-actions"
  | "agent-ai"
  | "agent-settings"
  | "agent-shell"
  | "agent-submissions"
  | "command-palette"
  | "new-submission"
  | "questionnaire"
  | "returned-documents"
  | "submission-drawer";

export type AgentInteractionRole = Role | "anonymous";

export type AgentInteractionProof =
  | "clipboard"
  | "cross-role-readback"
  | "dom-state"
  | "download"
  | "network-readback"
  | "no-network-write"
  | "reload-readback"
  | "session-transition"
  | "storage-readback";

export const V19_AGENT_MUTATION_CHECK_TARGETS = [
  "access_requests",
  "profiles",
  "submissions",
  "applicants",
  "questionnaire_answers",
  "media_assets",
  "corrections",
  "status_history",
  "submission-media",
  "export_batches",
  "agent_return_packages",
] as const;

export type AgentInteractionMutationTarget =
  (typeof V19_AGENT_MUTATION_CHECK_TARGETS)[number];

export type AgentInteractionNetworkWriteTarget =
  | "edge:access-request"
  | "rpc:save_submission_draft"
  | "rpc:submit_corrections_handoff"
  | "storage:submission-media";

export type AgentInteractionCanonicalValue = string | number | boolean | null;

export type AgentInteractionCanonicalEffect = {
  before: Readonly<Record<string, AgentInteractionCanonicalValue>>;
  expectedAfter: Readonly<Record<string, AgentInteractionCanonicalValue>>;
  primaryTarget: AgentInteractionMutationTarget;
};

export type AgentInteractionWriteScope = {
  allowedChangedTargets: readonly AgentInteractionMutationTarget[];
  allowedNetworkTargets: readonly AgentInteractionNetworkWriteTarget[];
  requiredChangedTargets: readonly AgentInteractionMutationTarget[];
  requiredCheckedTargets: readonly AgentInteractionMutationTarget[];
  requiredNetworkTargets: readonly AgentInteractionNetworkWriteTarget[];
};

type AgentInteractionContractBase = {
  disabledStatusFixtures?: readonly SubmissionStatus[];
  id: string;
  surface: AgentInteractionSurface;
  role: AgentInteractionRole;
  expectedEffect: string;
  proof: readonly AgentInteractionProof[];
  businessIntent?: BusinessClickIntent;
  statusFixtures?: readonly SubmissionStatus[];
};

export type AgentInteractionContract = AgentInteractionContractBase &
  (
    | {
        canonicalEffect: AgentInteractionCanonicalEffect;
        kind: "mutation";
        writeScope: AgentInteractionWriteScope;
      }
    | {
        kind: Exclude<AgentInteractionKind, "mutation">;
        writeScope?: never;
      }
  );

function mutationWriteScope(input: {
  allowedChangedTargets: readonly AgentInteractionMutationTarget[];
  allowedNetworkTargets: readonly AgentInteractionNetworkWriteTarget[];
  requiredChangedTargets: readonly AgentInteractionMutationTarget[];
  requiredNetworkTargets: readonly AgentInteractionNetworkWriteTarget[];
}): AgentInteractionWriteScope {
  return {
    ...input,
    requiredCheckedTargets: V19_AGENT_MUTATION_CHECK_TARGETS,
  };
}

const accessRegistrationWriteScope = mutationWriteScope({
  allowedChangedTargets: ["access_requests"],
  allowedNetworkTargets: ["edge:access-request"],
  requiredChangedTargets: ["access_requests"],
  requiredNetworkTargets: ["edge:access-request"],
});

const accessRegistrationCanonicalEffect = {
  before: { "access_requests.status": null },
  expectedAfter: { "access_requests.status": "pending" },
  primaryTarget: "access_requests",
} as const satisfies AgentInteractionCanonicalEffect;

const uploadCanonicalEffect = {
  before: { "media_assets.upload_status": "none" },
  expectedAfter: { "media_assets.upload_status": "uploaded" },
  primaryTarget: "media_assets",
} as const satisfies AgentInteractionCanonicalEffect;

const createSubmissionCanonicalEffect = {
  before: { "submissions.status": null },
  expectedAfter: { "submissions.status": "draft" },
  primaryTarget: "submissions",
} as const satisfies AgentInteractionCanonicalEffect;

const questionnaireUpdateCanonicalEffect = {
  before: { "questionnaire_answers.value_sha256": null },
  expectedAfter: {
    "questionnaire_answers.value_sha256": "$marker-sha256",
  },
  primaryTarget: "questionnaire_answers",
} as const satisfies AgentInteractionCanonicalEffect;

const markIssueFixedCanonicalEffect = {
  before: { "corrections.status": "open" },
  expectedAfter: { "corrections.status": "fixed" },
  primaryTarget: "corrections",
} as const satisfies AgentInteractionCanonicalEffect;

const saveProgressCanonicalEffect = {
  before: { "submissions.case_revision": 0 },
  expectedAfter: { "submissions.case_revision": 1 },
  primaryTarget: "submissions",
} as const satisfies AgentInteractionCanonicalEffect;

const submitReviewCanonicalEffect = {
  before: { "submissions.status": "$fixture-status" },
  expectedAfter: { "submissions.status": "submitted_for_review" },
  primaryTarget: "submissions",
} as const satisfies AgentInteractionCanonicalEffect;

const submitCorrectionsCanonicalEffect = {
  before: { "submissions.status": "returned" },
  expectedAfter: { "submissions.status": "corrections_received" },
  primaryTarget: "submissions",
} as const satisfies AgentInteractionCanonicalEffect;

export const V19_AGENT_BUSINESS_INTENT_WRITE_SCOPES = {
  create_submission: mutationWriteScope({
    allowedChangedTargets: [
      "submissions",
      "applicants",
      "questionnaire_answers",
      "media_assets",
      "status_history",
      "submission-media",
    ],
    allowedNetworkTargets: ["rpc:save_submission_draft", "storage:submission-media"],
    requiredChangedTargets: ["submissions", "applicants", "submission-media"],
    requiredNetworkTargets: ["rpc:save_submission_draft", "storage:submission-media"],
  }),
  mark_issue_fixed: mutationWriteScope({
    allowedChangedTargets: [
      "submissions",
      "applicants",
      "questionnaire_answers",
      "media_assets",
      "corrections",
      "status_history",
    ],
    allowedNetworkTargets: ["rpc:save_submission_draft"],
    requiredChangedTargets: ["corrections"],
    requiredNetworkTargets: ["rpc:save_submission_draft"],
  }),
  prepare_and_submit_for_review: mutationWriteScope({
    allowedChangedTargets: [
      "submissions",
      "applicants",
      "questionnaire_answers",
      "media_assets",
      "corrections",
      "status_history",
    ],
    allowedNetworkTargets: ["rpc:save_submission_draft"],
    requiredChangedTargets: ["submissions", "status_history"],
    requiredNetworkTargets: ["rpc:save_submission_draft"],
  }),
  save_progress: mutationWriteScope({
    allowedChangedTargets: [
      "submissions",
      "applicants",
      "questionnaire_answers",
      "media_assets",
      "corrections",
      "status_history",
    ],
    allowedNetworkTargets: ["rpc:save_submission_draft"],
    requiredChangedTargets: ["submissions", "status_history"],
    requiredNetworkTargets: ["rpc:save_submission_draft"],
  }),
  submit_corrections: mutationWriteScope({
    allowedChangedTargets: [
      "submissions",
      "applicants",
      "questionnaire_answers",
      "media_assets",
      "corrections",
      "status_history",
    ],
    allowedNetworkTargets: ["rpc:submit_corrections_handoff"],
    requiredChangedTargets: ["submissions", "corrections", "status_history"],
    requiredNetworkTargets: ["rpc:submit_corrections_handoff"],
  }),
  submit_for_review: mutationWriteScope({
    allowedChangedTargets: [
      "submissions",
      "applicants",
      "questionnaire_answers",
      "media_assets",
      "corrections",
      "status_history",
    ],
    allowedNetworkTargets: ["rpc:save_submission_draft"],
    requiredChangedTargets: ["submissions", "status_history"],
    requiredNetworkTargets: ["rpc:save_submission_draft"],
  }),
  update_questionnaire_field: mutationWriteScope({
    allowedChangedTargets: [
      "submissions",
      "applicants",
      "questionnaire_answers",
      "media_assets",
      "corrections",
      "status_history",
    ],
    allowedNetworkTargets: ["rpc:save_submission_draft"],
    requiredChangedTargets: ["questionnaire_answers"],
    requiredNetworkTargets: ["rpc:save_submission_draft"],
  }),
  upload_required_file: mutationWriteScope({
    allowedChangedTargets: [
      "submissions",
      "applicants",
      "questionnaire_answers",
      "media_assets",
      "corrections",
      "status_history",
      "submission-media",
    ],
    allowedNetworkTargets: ["rpc:save_submission_draft", "storage:submission-media"],
    requiredChangedTargets: ["media_assets", "submission-media"],
    requiredNetworkTargets: ["rpc:save_submission_draft", "storage:submission-media"],
  }),
} as const satisfies Partial<Record<BusinessClickIntent, AgentInteractionWriteScope>>;

const domProof = ["dom-state", "no-network-write"] as const;
const persistedUiProof = ["dom-state", "reload-readback", "no-network-write"] as const;
const mutationProof = ["network-readback", "reload-readback"] as const;
const lifecycleProof = [
  "network-readback",
  "reload-readback",
  "cross-role-readback",
] as const;
const editableStatusFixtures = ["draft", "in_progress", "returned"] as const;
const initialReviewStatusFixtures = ["draft", "in_progress"] as const;
const returnedStatusFixtures = ["returned"] as const;
const drawerDraftStatusFixtures = ["draft"] as const;
const drawerReviewStatusFixtures = ["in_progress", "ready_for_export"] as const;
const drawerCorrectionStatusFixtures = ["returned"] as const;
const drawerCorrectionDisabledStatusFixtures = ["requires_action"] as const;
const drawerHistoryStatusFixtures = [
  "submitted_for_review",
  "corrections_received",
  "ready_for_export",
  "exported",
] as const;

export const V19_AGENT_INTERACTION_CONTRACTS = {
  "access.open-login": {
    id: "access.open-login",
    kind: "navigation",
    surface: "access",
    role: "anonymous",
    expectedEffect: "Show the login form without writing remote state.",
    proof: domProof,
  },
  "access.open-register": {
    id: "access.open-register",
    kind: "navigation",
    surface: "access",
    role: "anonymous",
    expectedEffect: "Show the controlled-cohort access request form.",
    proof: domProof,
  },
  "access.open-reset": {
    id: "access.open-reset",
    kind: "navigation",
    surface: "access",
    role: "anonymous",
    expectedEffect: "Show the password recovery request form.",
    proof: domProof,
  },
  "access.back-to-login": {
    id: "access.back-to-login",
    kind: "navigation",
    surface: "access",
    role: "anonymous",
    expectedEffect: "Return to login without submitting the current form.",
    proof: domProof,
  },
  "access.toggle-password": {
    id: "access.toggle-password",
    kind: "navigation",
    surface: "access",
    role: "anonymous",
    expectedEffect: "Toggle only the local visibility of the password field.",
    proof: domProof,
  },
  "access.edit-field": {
    id: "access.edit-field",
    kind: "input",
    surface: "access",
    role: "anonymous",
    expectedEffect: "Update only the local access form until explicit submission.",
    proof: domProof,
  },
  "access.submit-login": {
    id: "access.submit-login",
    kind: "session",
    surface: "access",
    role: "anonymous",
    expectedEffect: "Authenticate once and enter the authorized workspace.",
    proof: ["network-readback", "session-transition", "reload-readback"],
  },
  "access.submit-registration": {
    canonicalEffect: accessRegistrationCanonicalEffect,
    id: "access.submit-registration",
    kind: "mutation",
    surface: "access",
    role: "anonymous",
    expectedEffect: "Create one cohort access request and show its canonical status.",
    proof: mutationProof,
    writeScope: accessRegistrationWriteScope,
  },
  "access.submit-reset": {
    id: "access.submit-reset",
    kind: "session",
    surface: "access",
    role: "anonymous",
    expectedEffect:
      "Request one recovery message without promising delivery before server acknowledgement.",
    proof: ["network-readback", "dom-state"],
  },
  "access.submit-invite-password": {
    id: "access.submit-invite-password",
    kind: "session",
    surface: "access",
    role: "anonymous",
    expectedEffect:
      "Persist the invited user's password and establish the authorized session.",
    proof: ["network-readback", "session-transition", "reload-readback"],
  },
  "access.submit-recovery-password": {
    id: "access.submit-recovery-password",
    kind: "session",
    surface: "access",
    role: "anonymous",
    expectedEffect:
      "Persist the recovered password and establish the authorized session.",
    proof: ["network-readback", "session-transition", "reload-readback"],
  },
  "access.pending-sign-out": {
    id: "access.pending-sign-out",
    kind: "session",
    surface: "access",
    role: "agent",
    expectedEffect:
      "End the pending-access session and return to login without changing the access request.",
    proof: ["network-readback", "session-transition", "reload-readback"],
  },
  "shell.sign-out": {
    id: "shell.sign-out",
    kind: "session",
    surface: "agent-shell",
    role: "agent",
    expectedEffect: "End the approved agent session and return to the login surface.",
    proof: ["network-readback", "session-transition", "reload-readback"],
  },
  "shell.toggle-mobile-menu": {
    id: "shell.toggle-mobile-menu",
    kind: "navigation",
    surface: "agent-shell",
    role: "agent",
    expectedEffect: "Open or close the mobile workspace navigation without a write.",
    proof: domProof,
  },
  "shell.navigate-actions": {
    id: "shell.navigate-actions",
    kind: "navigation",
    surface: "agent-shell",
    role: "agent",
    expectedEffect: "Show My actions and close transient workspace surfaces.",
    proof: domProof,
  },
  "shell.navigate-submissions": {
    id: "shell.navigate-submissions",
    kind: "navigation",
    surface: "agent-shell",
    role: "agent",
    expectedEffect: "Show My submissions and close transient workspace surfaces.",
    proof: domProof,
  },
  "shell.navigate-settings": {
    id: "shell.navigate-settings",
    kind: "navigation",
    surface: "agent-shell",
    role: "agent",
    expectedEffect: "Show device-local workspace settings.",
    proof: domProof,
  },
  "shell.create-submission": {
    id: "shell.create-submission",
    kind: "navigation",
    surface: "agent-shell",
    role: "agent",
    expectedEffect:
      "Open the new-submission intake without creating a remote record yet.",
    proof: domProof,
  },
  "shell.open-command-palette": {
    id: "shell.open-command-palette",
    kind: "dialog",
    surface: "agent-shell",
    role: "agent",
    expectedEffect: "Open the command palette and preserve focus restoration.",
    proof: domProof,
  },
  "actions.summary-filter": {
    id: "actions.summary-filter",
    kind: "filter",
    surface: "agent-actions",
    role: "agent",
    expectedEffect: "Filter the visible action queue by the selected summary bucket.",
    proof: domProof,
  },
  "actions.search": {
    id: "actions.search",
    kind: "filter",
    surface: "agent-actions",
    role: "agent",
    expectedEffect: "Filter visible actions by the entered query without a write.",
    proof: domProof,
  },
  "actions.city-filter": {
    id: "actions.city-filter",
    kind: "filter",
    surface: "agent-actions",
    role: "agent",
    expectedEffect: "Filter visible actions by city without a write.",
    proof: domProof,
  },
  "actions.sort": {
    id: "actions.sort",
    kind: "filter",
    surface: "agent-actions",
    role: "agent",
    expectedEffect: "Reorder only the visible action queue.",
    proof: domProof,
  },
  "actions.reset-filters": {
    id: "actions.reset-filters",
    kind: "filter",
    surface: "agent-actions",
    role: "agent",
    expectedEffect: "Restore all action filters and sort to their defaults.",
    proof: domProof,
  },
  "actions.retry": {
    id: "actions.retry",
    kind: "navigation",
    surface: "agent-actions",
    role: "agent",
    expectedEffect:
      "Retry loading the canonical action queue and show its resulting state.",
    proof: ["network-readback", "dom-state", "no-network-write"],
  },
  "actions.select-task": {
    id: "actions.select-task",
    kind: "navigation",
    surface: "agent-actions",
    role: "agent",
    expectedEffect: "Select a task and synchronize its context panel.",
    proof: domProof,
  },
  "actions.open-primary": {
    id: "actions.open-primary",
    kind: "navigation",
    surface: "agent-actions",
    role: "agent",
    expectedEffect: "Open the task's primary actionable destination.",
    proof: domProof,
  },
  "actions.open-secondary": {
    id: "actions.open-secondary",
    kind: "navigation",
    surface: "agent-actions",
    role: "agent",
    expectedEffect: "Open the selected submission overview without a write.",
    proof: domProof,
  },
  "actions.open-issue": {
    id: "actions.open-issue",
    kind: "navigation",
    surface: "agent-actions",
    role: "agent",
    expectedEffect: "Open the exact issue target in its owning workspace.",
    proof: domProof,
  },
  "actions.open-tab": {
    id: "actions.open-tab",
    kind: "navigation",
    surface: "agent-actions",
    role: "agent",
    expectedEffect: "Open the requested submission drawer tab without a write.",
    proof: domProof,
  },
  "ai.open-target": {
    id: "ai.open-target",
    kind: "navigation",
    surface: "agent-ai",
    role: "agent",
    expectedEffect:
      "Open the cited submission or workspace target without applying the AI suggestion.",
    proof: domProof,
  },
  "ai.copy-plan": {
    id: "ai.copy-plan",
    kind: "clipboard",
    surface: "agent-ai",
    role: "agent",
    expectedEffect:
      "Copy the displayed AI brief and report success or a retry-safe failure without a write.",
    proof: ["clipboard", "dom-state", "no-network-write"],
  },
  "submissions.summary-filter": {
    id: "submissions.summary-filter",
    kind: "filter",
    surface: "agent-submissions",
    role: "agent",
    expectedEffect: "Filter visible submission cards by summary bucket.",
    proof: domProof,
  },
  "submissions.search": {
    id: "submissions.search",
    kind: "filter",
    surface: "agent-submissions",
    role: "agent",
    expectedEffect: "Filter visible submissions by query without a write.",
    proof: domProof,
  },
  "submissions.type-filter": {
    id: "submissions.type-filter",
    kind: "filter",
    surface: "agent-submissions",
    role: "agent",
    expectedEffect: "Filter visible submissions by single or family type.",
    proof: domProof,
  },
  "submissions.status-filter": {
    id: "submissions.status-filter",
    kind: "filter",
    surface: "agent-submissions",
    role: "agent",
    expectedEffect: "Filter visible submissions by lifecycle status.",
    proof: domProof,
  },
  "submissions.city-filter": {
    id: "submissions.city-filter",
    kind: "filter",
    surface: "agent-submissions",
    role: "agent",
    expectedEffect: "Filter visible submissions by city without a write.",
    proof: domProof,
  },
  "submissions.sort": {
    id: "submissions.sort",
    kind: "filter",
    surface: "agent-submissions",
    role: "agent",
    expectedEffect: "Reorder only the visible submission cards.",
    proof: domProof,
  },
  "submissions.reset-filters": {
    id: "submissions.reset-filters",
    kind: "filter",
    surface: "agent-submissions",
    role: "agent",
    expectedEffect: "Restore submission filters and sort to their defaults.",
    proof: domProof,
  },
  "submissions.open": {
    id: "submissions.open",
    kind: "navigation",
    surface: "agent-submissions",
    role: "agent",
    expectedEffect: "Open the selected submission drawer without changing state.",
    proof: domProof,
  },
  "submissions.open-questionnaire": {
    id: "submissions.open-questionnaire",
    kind: "navigation",
    surface: "agent-submissions",
    role: "agent",
    expectedEffect:
      "Open the selected submission questionnaire at the requested target.",
    proof: domProof,
  },
  "submissions.upload-file": {
    canonicalEffect: uploadCanonicalEffect,
    id: "submissions.upload-file",
    kind: "mutation",
    surface: "agent-submissions",
    role: "agent",
    expectedEffect:
      "Upload one required applicant file and read back its canonical slot.",
    proof: ["storage-readback", "network-readback", "reload-readback"],
    businessIntent: "upload_required_file",
    statusFixtures: editableStatusFixtures,
    writeScope: V19_AGENT_BUSINESS_INTENT_WRITE_SCOPES.upload_required_file,
  },
  "submissions.submit-review": {
    canonicalEffect: submitReviewCanonicalEffect,
    id: "submissions.submit-review",
    kind: "mutation",
    surface: "agent-submissions",
    role: "agent",
    expectedEffect: "Submit one complete submission for admin review exactly once.",
    proof: lifecycleProof,
    businessIntent: "prepare_and_submit_for_review",
    statusFixtures: initialReviewStatusFixtures,
    writeScope: V19_AGENT_BUSINESS_INTENT_WRITE_SCOPES.prepare_and_submit_for_review,
  },
  "submissions.cancel-submit": {
    id: "submissions.cancel-submit",
    kind: "dialog",
    surface: "agent-submissions",
    role: "agent",
    expectedEffect: "Close submit confirmation without changing canonical state.",
    proof: domProof,
  },
  "new-submission.back": {
    id: "new-submission.back",
    kind: "navigation",
    surface: "new-submission",
    role: "agent",
    expectedEffect: "Leave intake without creating or mutating a submission.",
    proof: domProof,
  },
  "new-submission.configure": {
    id: "new-submission.configure",
    kind: "navigation",
    surface: "new-submission",
    role: "agent",
    expectedEffect: "Update only the local intake package configuration.",
    proof: domProof,
  },
  "new-submission.choose-files": {
    id: "new-submission.choose-files",
    kind: "dialog",
    surface: "new-submission",
    role: "agent",
    expectedEffect: "Open the local file chooser without a remote write.",
    proof: domProof,
  },
  "new-submission.manage-file": {
    id: "new-submission.manage-file",
    kind: "navigation",
    surface: "new-submission",
    role: "agent",
    expectedEffect:
      "Assign, rotate, reorder, or remove only the staged synthetic file.",
    proof: domProof,
  },
  "new-submission.toggle-prefill": {
    id: "new-submission.toggle-prefill",
    kind: "dialog",
    surface: "new-submission",
    role: "agent",
    expectedEffect:
      "Open or close the local OCR prefill preview without a remote write.",
    proof: domProof,
  },
  "new-submission.save-draft": {
    canonicalEffect: createSubmissionCanonicalEffect,
    id: "new-submission.save-draft",
    kind: "mutation",
    surface: "new-submission",
    role: "agent",
    expectedEffect:
      "Create one draft from the staged package and read it back after reload.",
    proof: mutationProof,
    businessIntent: "create_submission",
    writeScope: V19_AGENT_BUSINESS_INTENT_WRITE_SCOPES.create_submission,
  },
  "new-submission.continue": {
    canonicalEffect: createSubmissionCanonicalEffect,
    id: "new-submission.continue",
    kind: "mutation",
    surface: "new-submission",
    role: "agent",
    expectedEffect:
      "Create one draft from the staged package and open its questionnaire.",
    proof: mutationProof,
    businessIntent: "create_submission",
    writeScope: V19_AGENT_BUSINESS_INTENT_WRITE_SCOPES.create_submission,
  },
  "questionnaire.back": {
    canonicalEffect: questionnaireUpdateCanonicalEffect,
    id: "questionnaire.back",
    kind: "mutation",
    surface: "questionnaire",
    role: "agent",
    expectedEffect:
      "Flush pending questionnaire changes once, then return; remain in place on save failure.",
    proof: mutationProof,
    businessIntent: "update_questionnaire_field",
    statusFixtures: editableStatusFixtures,
    writeScope: V19_AGENT_BUSINESS_INTENT_WRITE_SCOPES.update_questionnaire_field,
  },
  "questionnaire.navigate": {
    id: "questionnaire.navigate",
    kind: "navigation",
    surface: "questionnaire",
    role: "agent",
    expectedEffect: "Navigate applicant, section, or field focus without a write.",
    proof: domProof,
  },
  "questionnaire.search": {
    id: "questionnaire.search",
    kind: "filter",
    surface: "questionnaire",
    role: "agent",
    expectedEffect:
      "Filter or focus questionnaire fields without changing their values.",
    proof: domProof,
  },
  "questionnaire.update-field": {
    canonicalEffect: questionnaireUpdateCanonicalEffect,
    id: "questionnaire.update-field",
    kind: "mutation",
    surface: "questionnaire",
    role: "agent",
    expectedEffect:
      "Persist the edited questionnaire field and read it back after reload.",
    proof: mutationProof,
    businessIntent: "update_questionnaire_field",
    statusFixtures: editableStatusFixtures,
    writeScope: V19_AGENT_BUSINESS_INTENT_WRITE_SCOPES.update_questionnaire_field,
  },
  "questionnaire.copy-family": {
    canonicalEffect: questionnaireUpdateCanonicalEffect,
    id: "questionnaire.copy-family",
    kind: "mutation",
    surface: "questionnaire",
    role: "agent",
    expectedEffect:
      "Copy the chosen shared fields to the selected family members only.",
    proof: mutationProof,
    businessIntent: "update_questionnaire_field",
    statusFixtures: editableStatusFixtures,
    writeScope: V19_AGENT_BUSINESS_INTENT_WRITE_SCOPES.update_questionnaire_field,
  },
  "questionnaire.preview-family-copy": {
    id: "questionnaire.preview-family-copy",
    kind: "dialog",
    surface: "questionnaire",
    role: "agent",
    expectedEffect:
      "Preview the exact family fields and recipients without changing data.",
    proof: domProof,
  },
  "questionnaire.cancel-family-copy": {
    id: "questionnaire.cancel-family-copy",
    kind: "dialog",
    surface: "questionnaire",
    role: "agent",
    expectedEffect: "Cancel the family-copy preview without changing data.",
    proof: domProof,
  },
  "questionnaire.save-exit": {
    canonicalEffect: questionnaireUpdateCanonicalEffect,
    id: "questionnaire.save-exit",
    kind: "mutation",
    surface: "questionnaire",
    role: "agent",
    expectedEffect:
      "Persist current progress exactly once and return to My submissions.",
    proof: mutationProof,
    businessIntent: "update_questionnaire_field",
    statusFixtures: editableStatusFixtures,
    writeScope: V19_AGENT_BUSINESS_INTENT_WRITE_SCOPES.update_questionnaire_field,
  },
  "questionnaire.mark-fixed": {
    canonicalEffect: markIssueFixedCanonicalEffect,
    id: "questionnaire.mark-fixed",
    kind: "mutation",
    surface: "questionnaire",
    role: "agent",
    expectedEffect:
      "Mark one resolved admin issue fixed and read back the issue state.",
    proof: lifecycleProof,
    businessIntent: "mark_issue_fixed",
    statusFixtures: returnedStatusFixtures,
    writeScope: V19_AGENT_BUSINESS_INTENT_WRITE_SCOPES.mark_issue_fixed,
  },
  "drawer.close": {
    id: "drawer.close",
    kind: "navigation",
    surface: "submission-drawer",
    role: "agent",
    expectedEffect: "Close the drawer and restore the originating workspace.",
    proof: domProof,
  },
  "drawer.navigate-tab": {
    id: "drawer.navigate-tab",
    kind: "navigation",
    surface: "submission-drawer",
    role: "agent",
    expectedEffect: "Show the selected drawer tab without a write.",
    proof: domProof,
  },
  "drawer.toggle-context": {
    id: "drawer.toggle-context",
    kind: "navigation",
    surface: "submission-drawer",
    role: "agent",
    expectedEffect: "Expand or collapse secondary lifecycle context without a write.",
    proof: domProof,
  },
  "drawer.dismiss-notice": {
    id: "drawer.dismiss-notice",
    kind: "navigation",
    surface: "submission-drawer",
    role: "agent",
    expectedEffect: "Dismiss a recoverable Drawer notice without a write.",
    proof: domProof,
  },
  "drawer.open-questionnaire": {
    id: "drawer.open-questionnaire",
    kind: "navigation",
    surface: "submission-drawer",
    role: "agent",
    expectedEffect: "Open the exact questionnaire target from the drawer.",
    proof: domProof,
  },
  "drawer.open-target": {
    id: "drawer.open-target",
    kind: "navigation",
    surface: "submission-drawer",
    role: "agent",
    expectedEffect:
      "Open the exact issue target in its owning questionnaire or file workspace without a write.",
    proof: domProof,
  },
  "drawer.upload-file": {
    canonicalEffect: uploadCanonicalEffect,
    id: "drawer.upload-file",
    kind: "mutation",
    surface: "submission-drawer",
    role: "agent",
    expectedEffect:
      "Upload one required applicant file and read back its canonical slot.",
    proof: ["storage-readback", "network-readback", "reload-readback"],
    businessIntent: "upload_required_file",
    statusFixtures: editableStatusFixtures,
    writeScope: V19_AGENT_BUSINESS_INTENT_WRITE_SCOPES.upload_required_file,
  },
  "drawer.save-progress": {
    canonicalEffect: saveProgressCanonicalEffect,
    id: "drawer.save-progress",
    kind: "mutation",
    surface: "submission-drawer",
    role: "agent",
    expectedEffect: "Persist current submission progress exactly once from the drawer.",
    proof: mutationProof,
    businessIntent: "save_progress",
    statusFixtures: drawerDraftStatusFixtures,
    writeScope: V19_AGENT_BUSINESS_INTENT_WRITE_SCOPES.save_progress,
  },
  "drawer.submit-review": {
    canonicalEffect: submitReviewCanonicalEffect,
    id: "drawer.submit-review",
    kind: "mutation",
    surface: "submission-drawer",
    role: "agent",
    expectedEffect:
      "Submit one complete submission for admin review exactly once from the drawer.",
    proof: lifecycleProof,
    businessIntent: "submit_for_review",
    statusFixtures: drawerReviewStatusFixtures,
    writeScope: V19_AGENT_BUSINESS_INTENT_WRITE_SCOPES.submit_for_review,
  },
  "drawer.open-return-review": {
    id: "drawer.open-return-review",
    kind: "dialog",
    surface: "submission-drawer",
    role: "agent",
    expectedEffect:
      "Open the ready-for-export return confirmation without changing submission state.",
    proof: domProof,
  },
  "drawer.cancel-return-review": {
    id: "drawer.cancel-return-review",
    kind: "dialog",
    surface: "submission-drawer",
    role: "agent",
    expectedEffect:
      "Cancel the ready-for-export return confirmation without changing submission state.",
    proof: domProof,
  },
  "drawer.submit-corrections": {
    canonicalEffect: submitCorrectionsCanonicalEffect,
    disabledStatusFixtures: drawerCorrectionDisabledStatusFixtures,
    id: "drawer.submit-corrections",
    kind: "mutation",
    surface: "submission-drawer",
    role: "agent",
    expectedEffect:
      "Resubmit corrected data exactly once from the drawer after all blockers are fixed.",
    proof: lifecycleProof,
    businessIntent: "submit_corrections",
    statusFixtures: drawerCorrectionStatusFixtures,
    writeScope: V19_AGENT_BUSINESS_INTENT_WRITE_SCOPES.submit_corrections,
  },
  "drawer.open-history": {
    id: "drawer.open-history",
    kind: "navigation",
    surface: "submission-drawer",
    role: "agent",
    expectedEffect: "Show immutable lifecycle history without changing state.",
    proof: domProof,
    statusFixtures: drawerHistoryStatusFixtures,
  },
  "palette.search": {
    id: "palette.search",
    kind: "filter",
    surface: "command-palette",
    role: "agent",
    expectedEffect: "Filter available commands and submissions without a write.",
    proof: domProof,
  },
  "palette.select-command": {
    id: "palette.select-command",
    kind: "navigation",
    surface: "command-palette",
    role: "agent",
    expectedEffect: "Run the selected navigation command and close the palette.",
    proof: domProof,
  },
  "palette.copy-plan": {
    id: "palette.copy-plan",
    kind: "clipboard",
    surface: "command-palette",
    role: "agent",
    expectedEffect:
      "Copy the visible AI queue plan and report success or a retry-safe failure without a write.",
    proof: ["clipboard", "dom-state", "no-network-write"],
  },
  "returned-documents.download": {
    id: "returned-documents.download",
    kind: "download",
    surface: "returned-documents",
    role: "agent",
    expectedEffect:
      "Download the authorized non-empty returned PDF for the selected submission.",
    proof: ["network-readback", "download", "no-network-write"],
    statusFixtures: ["exported"],
  },
  "returned-documents.retry-load": {
    id: "returned-documents.retry-load",
    kind: "navigation",
    surface: "returned-documents",
    role: "agent",
    expectedEffect:
      "Retry loading the authorized returned-document list and replace the error state without writing remote data.",
    proof: ["network-readback", "dom-state", "no-network-write"],
    statusFixtures: ["exported"],
  },
  "settings.toggle-preference": {
    id: "settings.toggle-preference",
    kind: "device_preference",
    surface: "agent-settings",
    role: "agent",
    expectedEffect:
      "Apply the selected preference to the DOM and persist it in this browser.",
    proof: persistedUiProof,
  },
  "settings.reset-preferences": {
    id: "settings.reset-preferences",
    kind: "device_preference",
    surface: "agent-settings",
    role: "agent",
    expectedEffect: "Restore all device preferences and persist the defaults.",
    proof: persistedUiProof,
  },
} as const satisfies Record<string, AgentInteractionContract>;

export type AgentInteractionId = keyof typeof V19_AGENT_INTERACTION_CONTRACTS;

export type AgentInteractionBusinessIntentFinding = {
  interactionId: AgentInteractionId;
  reason: "wrong-role" | "wrong-status" | "wrong-surface" | "wrong-write-scope";
};

export function auditAgentInteractionBusinessIntentCompatibility(): AgentInteractionBusinessIntentFinding[] {
  const findings: AgentInteractionBusinessIntentFinding[] = [];

  for (const contract of Object.values(
    V19_AGENT_INTERACTION_CONTRACTS,
  ) as readonly AgentInteractionContract[]) {
    if (!contract.businessIntent) continue;
    const interactionId = contract.id as AgentInteractionId;
    const businessContract = V19_BUSINESS_CLICK_CONTRACTS[
      contract.businessIntent
    ] as BusinessClickContract;
    const transition = businessContract.transition;
    if (businessContract.ownerRole !== contract.role) {
      findings.push({ interactionId, reason: "wrong-role" });
    }
    if (!(businessContract.surfaces as readonly string[]).includes(contract.surface)) {
      findings.push({ interactionId, reason: "wrong-surface" });
    }
    if (
      transition &&
      "statusFixtures" in contract &&
      contract.statusFixtures?.some((status) => !transition.from.includes(status))
    ) {
      findings.push({ interactionId, reason: "wrong-status" });
    }
    if (contract.kind === "mutation") {
      const expectedWriteScope = (
        V19_AGENT_BUSINESS_INTENT_WRITE_SCOPES as Partial<
          Record<BusinessClickIntent, AgentInteractionWriteScope>
        >
      )[contract.businessIntent];
      if (
        !expectedWriteScope ||
        JSON.stringify(contract.writeScope) !== JSON.stringify(expectedWriteScope)
      ) {
        findings.push({ interactionId, reason: "wrong-write-scope" });
      }
    }
  }

  return findings;
}

export function isAgentInteractionId(value: string): value is AgentInteractionId {
  return Object.hasOwn(V19_AGENT_INTERACTION_CONTRACTS, value);
}

export function agentInteractionProps(id: AgentInteractionId): {
  "data-v19-interaction-id": AgentInteractionId;
} {
  return { "data-v19-interaction-id": id };
}

const enabledControlSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([readonly]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled]):not([readonly])",
  "[role='button']:not([aria-disabled='true'])",
  "[role='menuitem']:not([aria-disabled='true'])",
  "[role='option']:not([aria-disabled='true'])",
  "[role='switch']:not([aria-disabled='true'])",
].join(",");

export type AgentInteractionAuditFinding = {
  element: Element;
  interactionId: string | null;
  reason: "missing" | "unknown" | "wrong-role";
};

export function auditAgentInteractionControls(
  root: ParentNode,
  options: { role?: AgentInteractionRole } = {},
): AgentInteractionAuditFinding[] {
  const findings: AgentInteractionAuditFinding[] = [];
  const controls = new Set(root.querySelectorAll(enabledControlSelector));

  for (const element of controls) {
    const interactionId = element.getAttribute("data-v19-interaction-id");
    if (!interactionId) {
      findings.push({ element, interactionId: null, reason: "missing" });
    } else if (!isAgentInteractionId(interactionId)) {
      findings.push({ element, interactionId, reason: "unknown" });
    } else if (
      options.role &&
      V19_AGENT_INTERACTION_CONTRACTS[interactionId].role !== options.role
    ) {
      findings.push({ element, interactionId, reason: "wrong-role" });
    }
  }

  return findings;
}
