# V-19 Full Operational Loop: Returned PDF Package

## Scope

This release slice keeps the V-19 operational loop fail-closed after Excel export and before an agent can see returned PDF artifacts.

Active document requirements are exactly:

- `selfie`
- `selfie_2`
- `passport_scan`
- `questionnaire`

Legacy `photo`, `photo_white`, and `video` values are rejected or normalized only at compatibility boundaries. They are not active requirements, selectable returned issue targets, or export readiness inputs.

## Returned PDF Package Contract

Returned package artifacts use two business kinds:

- `application_form_pdf`: one PDF per applicant.
- `appointment_list_pdf`: one common list PDF per exported package.

The package is publishable only when all conditions are true:

- submission status is `exported`;
- durable export package identity is present;
- returned package owner matches `submission.agentId`;
- common appointment/list PDF is present, private, valid, and stored under the current submission path;
- exactly one ready application PDF review exists for every applicant;
- every application PDF artifact has private storage identity for the current submission/applicant;
- no returned PDF mismatch issue remains `open` or `fixed_by_agent`;
- no blocked PDF review remains;
- artifact upload state is not `failed`, `deleted`, `pending`, or `none`.

## Mapping

The internal package mapping preserves:

- `exportPackageId`
- `submissionId`
- `applicantId` for application PDFs
- `city`
- `ownerAgentId`
- `ownerAgentName` when known
- `excelRowNumber` for application PDFs
- `storageBucket`, `storagePath`, `fileName`, `sha256`

External Excel output still has no Agent column. Agent ownership is an internal visibility and return axis.

## Visibility

Agents can see only returned PDF packages whose `submission.agentId` and package `ownerAgentId` match the current agent. Mixed-agent export batches are blocked before package generation. Appointment/list PDF visibility is therefore tied to the owning agent package, not to a public URL.

Storage remains private. The app must not persist signed URLs.

## Replacement, Delete, Failure

Replacing a returned PDF means attaching a new valid artifact and rebuilding the package mapping. A deleted, failed, pending, or missing artifact blocks handoff. Previously published handoff artifacts cannot be silently overwritten with different artifacts; the Supabase RPC returns duplicate success only for the exact same artifact set and otherwise fails.

## Server Gate

`publish_returned_pdf_handoff` is server-authoritative:

- admin role is required;
- exported cockpit snapshot is required;
- durable export package identity is required;
- package owner must match the submission owner;
- Storage object existence is checked for the appointment/list PDF and every application PDF;
- exactly one application PDF per applicant is required;
- existing handoff rows block replacement unless they exactly match the current artifacts.
