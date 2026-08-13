# Protected production attestation capture job

Status: design only. This document does not authorize a production read, write,
deployment, owner approval, or workflow change.

## Purpose and boundary

The existing `production-agent-evidence-attestation.yml` deliberately ends in a
failure until a protected runner can make its own Chrome, Supabase, and Vercel
observations. That fail-closed behavior remains in place. It must never attest
an owner-uploaded summary, screenshot, ledger, or prebuilt manifest.

The default protected run is a read-only preflight and cannot mint a complete
v2 attestation. A complete v2 bundle requires the existing agent/database and
storage mutation evidence. Its future capture therefore requires a separately
approved isolated synthetic mutation canary with exact actors, records, storage
prefixes, cleanup/retention, and write allowlist. This document designs that
future gate; it grants none of those permissions now. Neither mode applies
migrations, updates environment variables, promotes or deploys Vercel, changes
owner approval, or uses a browser profile/cookie from a human machine.

## Protected execution contract

- Trigger: manual dispatch only from `refs/heads/main`, after the exact commit
  has a deployed `READY` production identity.
- Runner: GitHub-hosted runner only. The consumer already verifies with
  `gh attestation verify --deny-self-hosted-runners`; a self-hosted runner is
  not an alternative trust path.
- Environment: a dedicated `production-evidence` environment with required
  human review and no reusable secret access from unprotected branches.
- Jobs and permissions: use a capture job with `contents: read` only, then an
  attestation job that depends on it and alone receives `id-token: write` and
  `attestations: write`. The latter revalidates a hash-pinned, immutable capture
  handoff before signing. No broad token, pull-request write, package write,
  or deployment permission is allowed.
- Inputs: the workflow resolves the exact main SHA and deployment identity
  itself. It accepts only a bounded run label; it accepts no evidence path,
  external manifest, project URL, or arbitrary command.
- Credentials: preflight uses a short-lived, environment-scoped read-only
  evidence principal. The separate mutation canary uses short-lived credentials
  limited to its approved synthetic cohort and write allowlist. Never print
  them, write them to an artifact, or expose them to a shell after capture.

## Capture sequence

1. Check out the dispatch commit and prove it is the current protected `main`
   SHA. Abort if the checkout, deployment SHA, alias, deployment ID, or
   production backend project ID differs from the descriptor.
2. Start a fresh browser without persistent profile state. The read-only
   preflight collects only non-mutating checks. A signing run enters the
   synthetic mutation canary only after a new task contract and explicit owner
   approval; it then records the required admin and two-agent writes, canonical
   readbacks, reload readbacks, and denied cross-owner probes.
3. Record a runner-generated `CODEX-E2E-<run-id>` in every Chrome network
   ledger and request correlation field that the existing evidence contract
   supports. Collect only sanitized method/path/status data, not request
   bodies, cookies, tokens, email addresses, documents, or screenshots with
   private content.
4. Obtain Vercel deployment identity and runtime-error lookback from the
   provider's read-only evidence API; retain only the deployment fields the
   v2 verifier consumes.
5. Build the manifest and artifact hashes in the runner from the just-captured
   raw observations. The runner, not an upload, owns file creation and the
   artifact inventory.
6. Before signing, run a future unsigned-capture validator that shares the
   full verifier's capture checks but cannot return release-ready and does not
   require `trustedAttestation`. The current full verifier cannot run here,
   because it correctly requires the signed subject and bundle.
7. Create the GitHub build provenance attestation from the frozen subject,
   preserving repository, signer workflow, source digest, and `main` source
   ref. Then run the full verifier against the signed bundle. Any unknown,
   partial, stale, unsanitized, cross-project, or failed probe ends the job
   without an attestation usable by a release packet.

## Evidence and identifier contract

The external bundle is owned by the protected run, not by the repository:

```text
<external-root>/CODEX-E2E-<run-id>/
  manifest.json
  artifacts/<sanitized artifact files>
  attestation/subject.json
  attestation/bundle.json
  summary.json
```

`runId`, `gitHead`, `deployedCommit`, `deploymentId`, `deploymentAlias`,
`backendProjectRef`, and `backendOrigin` must be identical across the manifest,
subject, and applicable artifacts. Each artifact receives a SHA-256, sanitized
relative path, capture time, and provenance to the runner step that created it.
No artifact is committed to Git; a release ledger cites its external path and
hash only.

## Required verifier evolution before implementation

The current v2 verifier hashes the full `manifest.json` and requires the
attested subject to contain that hash. The same manifest also stores
`trustedAttestation.subjectSha256` and `bundleSha256`, which makes a real
subject/bundle attestation circular. A protected runner cannot solve a hash
fixed point safely.

Before enabling the capture job, make a separately reviewed, verifier-
strengthening contract change:

1. Define a deterministic canonical unsigned-manifest projection: the complete
   manifest with `trustedAttestation` omitted, serialized canonically and
   rejecting duplicate JSON keys.
2. Have the subject bind the SHA-256 of that projection, plus the existing
   deployment/backend/run fields. Keep the attestation envelope external or
   treat it as an excluded, strictly shaped field.
3. Make the verifier recompute that projection, require exact attestation file
   hashes and GitHub provenance, and reject a legacy full-manifest subject.
4. Add positive and negative tests for hash-cycle removal, envelope tampering,
   wrong source SHA/ref, wrong workflow/repository, self-hosted provenance,
   unsanitized artifacts, and one missing required observation.
5. Add the unsigned-capture validator only as a pre-signing diagnostic. It
   must not emit a release verdict or replace the post-signing full verifier.

This is not a bypass: it preserves all existing bindings and adds a
deterministic one that can actually be signed. Until such a change and its
independent review land, the current workflow must remain blocked.

## Failure semantics and rollout gates

- Capture, provider, authentication, browser, readback, redaction, or
  attestation verification failure is `BLOCKED`, never a synthetic pass.
- A provider outage is recorded as an external dependency blocker, not as a
  product regression and not as permission to use owner-uploaded evidence.
- The first enabled read-only canary stays unsigned and `BLOCKED`. A later
  signing canary needs its separately approved synthetic mutation cohort,
  complete external artifact manifest, independent `gh attestation verify`,
  and the post-signing full evidence verifier before any production packet can
  reference it.
- Enabling the workflow, granting permissions, configuring the protected
  environment, or supplying credentials requires a new task contract and
  explicit owner approval.
