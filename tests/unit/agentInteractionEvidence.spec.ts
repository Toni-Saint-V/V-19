import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

import {
  V19_AGENT_INTERACTION_CONTRACTS,
  type AgentInteractionProof,
} from "../../src/modules/submissions/agentInteractionContract";
import {
  auditAgentInteractionEvidence,
  type AgentInteractionEvidenceRecord,
  type AgentInteractionNetworkResponse,
} from "../../src/modules/submissions/agentInteractionEvidence";

function schemaFixtures(): AgentInteractionEvidenceRecord[] {
  const capturedAt = new Date().toISOString();
  const markerSha256 = "a".repeat(64);
  const actorIds = {
    admin: "actor-admin",
    agent: "actor-agent",
    anonymous: "actor-anonymous",
  } as const;
  return Object.values(V19_AGENT_INTERACTION_CONTRACTS).flatMap((contract) =>
    (
      "statusFixtures" in contract
        ? contract.statusFixtures
        : (["draft"] as const)
    ).map(
      (status) => {
        const actorId = actorIds[contract.role];
        const operationId = `operation:${contract.id}:${status}`;
        const targets =
          contract.kind === "mutation"
            ? contract.writeScope.requiredCheckedTargets
            : (["ui-state"] as const);
        const entities = targets.map((target) => ({
          id: `entity:${contract.id}:${status}:${target}`,
          ownerActorId: actorId,
          target,
        }));
        const primaryTarget =
          contract.kind === "mutation"
            ? contract.canonicalEffect.primaryTarget
            : "ui-state";
        const primaryEntityId = entities.find(
          (entity) => entity.target === primaryTarget,
        )!.id;
        const correlation = {
          actorId,
          actorRole: contract.role,
          entityIds: [primaryEntityId],
          operationClass: null,
          operationId,
          query: null,
          resultSha256: null,
          target: primaryTarget as AgentInteractionNetworkResponse["target"],
        };
        const targetSnapshots =
          contract.kind === "mutation"
            ? contract.writeScope.requiredCheckedTargets.map((target) => {
                const changed = contract.writeScope.requiredChangedTargets.includes(target);
                return {
                  afterSha256: changed ? "b".repeat(64) : "a".repeat(64),
                  beforeSha256: "a".repeat(64),
                  entityIds: [
                    entities.find((entity) => entity.target === target)!.id,
                  ],
                  target,
                };
              })
            : undefined;
        const resolveCanonicalValue = (value: string | number | boolean | null) =>
          value === "$fixture-status"
            ? status
            : value === "$marker-sha256"
              ? markerSha256
              : value;
        const canonicalBefore =
          contract.kind === "mutation"
            ? Object.fromEntries(
                Object.entries(contract.canonicalEffect.before).map(([field, value]) => [
                  field,
                  resolveCanonicalValue(value),
                ]),
              )
            : undefined;
        const canonicalAfter =
          contract.kind === "mutation"
            ? Object.fromEntries(
                Object.entries(contract.canonicalEffect.expectedAfter).map(
                  ([field, value]) => [field, resolveCanonicalValue(value)],
                ),
              )
            : undefined;
        return ({
        assertions: Object.fromEntries(
          contract.proof.map((proof) => [
            proof,
            { detail: `asserted ${proof}`, passed: true },
          ]),
        ) as Partial<
          Record<AgentInteractionProof, { detail: string; passed: boolean }>
        >,
        expectedEffect: {
          description: contract.expectedEffect,
          detail: "expected effect asserted by the executable case",
          passed: true,
        },
        execution: {
          artifactIds: [`artifact:${contract.id}:${status}`],
          capturedAt,
          runId: "CODEX-E2E-schema-fixture",
        },
        fixture: {
          id: `fixture:${contract.id}:${status}`,
          submissionStatuses: [status],
          synthetic: {
            actor: { id: actorId, role: contract.role },
            entities,
            markerSha256,
            operationId,
            primaryEntityId,
          },
        },
        id: `evidence:${contract.id}:${status}`,
        interactionId: contract.id,
        mutation:
          contract.kind === "mutation"
            ? {
                canonicalReloadReadback: {
                  before: canonicalBefore!,
                  expectedAfter: canonicalAfter!,
                  fields: Object.keys(canonicalAfter!),
                  reloadedAt: capturedAt,
                },
                networkResponse: {
                  method: "POST",
                  path: "/fixture-mutation",
                  status: 200,
                },
                unintendedWrites: {
                  changedTargets: contract.writeScope.requiredChangedTargets,
                  checkedTargets: contract.writeScope.requiredCheckedTargets,
                  targetSnapshots: targetSnapshots!,
                },
              }
            : undefined,
        network: (
          contract.proof as readonly AgentInteractionProof[]
        ).includes("network-readback")
          ? {
              responses: [
                contract.kind === "mutation"
                  ? {
                      ...correlation,
                      method: "POST",
                      path: "/fixture-mutation",
                      status: 200,
                      write: true,
                    }
                  : {
                      ...correlation,
                      method: "GET",
                      path: "/fixture-readback",
                      status: 200,
                      write: false,
                    },
              ],
            }
          : (contract.proof as readonly AgentInteractionProof[]).includes(
                "no-network-write",
              )
            ? { responses: [] }
          : undefined,
        role: contract.role,
        surface: contract.surface,
        testCase: `test:${contract.id}:${status}`,
      });
      },
    ),
  );
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

const agentOnlyInteractionSourcePaths = [
  "src/components/ApplicantsScreen.tsx",
  "src/components/AgentReturnPackagesPanel.tsx",
  "src/components/CommandCenter.tsx",
  "src/components/Drawer.tsx",
  "src/components/PreUploadScreen.tsx",
  "src/modules/submissions/components/AgentActionsCommandCockpit.tsx",
  "src/modules/submissions/components/CommandPalette.tsx",
  "src/modules/submissions/components/FigmaQuestionnaireScreen.tsx",
] as const;

const interactiveAriaRoles = new Set([
  "button",
  "link",
  "menuitem",
  "option",
  "switch",
  "tab",
]);
const knownInteractiveAgentWrappers = new Set(["V19QueueCard"]);

function staticJsxAttributeValue(
  attribute: ts.JsxAttribute | undefined,
): string | null {
  if (!attribute?.initializer) return "";
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (
    ts.isJsxExpression(attribute.initializer) &&
    attribute.initializer.expression &&
    ts.isStringLiteral(attribute.initializer.expression)
  ) {
    return attribute.initializer.expression.text;
  }
  return null;
}

function findUninstrumentedAgentIntrinsicControls(
  file: string,
  source: string,
): string[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const findings: string[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      const intrinsicElement = /^[a-z][a-z0-9-]*$/.test(tagName);
      if (intrinsicElement || knownInteractiveAgentWrappers.has(tagName)) {
        const attributes = node.attributes.properties;
        const attribute = (name: string) =>
          attributes.find(
            (candidate): candidate is ts.JsxAttribute =>
              ts.isJsxAttribute(candidate) &&
              candidate.name.getText(sourceFile) === name,
          );
        const hasClick = Boolean(attribute("onClick"));
        const role = staticJsxAttributeValue(attribute("role"));
        const hasInteractiveRole = role !== null && interactiveAriaRoles.has(role);
        const isInstrumented = attributes.some((candidate) => {
          if (ts.isJsxSpreadAttribute(candidate)) {
            return candidate.expression
              .getText(sourceFile)
              .includes("agentInteractionProps");
          }
          return (
            ts.isJsxAttribute(candidate) &&
            candidate.name.getText(sourceFile) === "data-v19-interaction-id"
          );
        });

        if (
          (hasClick || hasInteractiveRole) &&
          !isInstrumented
        ) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile),
          );
          findings.push(`${file}:${line + 1}:${tagName}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return findings;
}

describe("agent interaction evidence schema validator", () => {
  test("reports a contract without an externally captured evidence record", () => {
    const incomplete = schemaFixtures().slice(1);
    expect(auditAgentInteractionEvidence(incomplete)).toContainEqual({
      interactionId: Object.keys(V19_AGENT_INTERACTION_CONTRACTS)[0],
      reason: "missing-evidence",
    });
  });

  test("denies wrong-role evidence and an unconfirmed expected effect", () => {
    const records = schemaFixtures();
    const target = records.find(
      (record) => record.interactionId === "shell.navigate-actions",
    );
    if (!target) throw new Error("expected shell interaction evidence");
    target.role = "admin";
    target.expectedEffect.passed = false;

    expect(auditAgentInteractionEvidence(records)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          interactionId: "shell.navigate-actions",
          reason: "wrong-role",
        }),
        expect.objectContaining({
          interactionId: "shell.navigate-actions",
          reason: "expected-effect-unconfirmed",
        }),
      ]),
    );
  });

  test("blocks a conditional control without a status fixture", () => {
    const records = schemaFixtures();
    const target = records.find(
      (record) => record.interactionId === "drawer.submit-review",
    );
    if (!target) throw new Error("expected conditional interaction evidence");
    delete target.fixture.submissionStatuses;

    expect(auditAgentInteractionEvidence(records)).toContainEqual(
      expect.objectContaining({
        interactionId: "drawer.submit-review",
        reason: "missing-status-fixture",
      }),
    );
  });

  test("validates one real status case without pretending to cover the full matrix", () => {
    const records = schemaFixtures().filter(
      (record) =>
        record.interactionId === "questionnaire.save-exit" &&
        record.fixture.submissionStatuses?.[0] === "draft",
    );

    expect(
      auditAgentInteractionEvidence(records, ["questionnaire.save-exit"], {
        statusFixtureCoverage: "provided-records",
      }),
    ).toEqual([]);
  });

  test("rejects an unsupported per-record status fixture", () => {
    const records = schemaFixtures().filter(
      (record) =>
        record.interactionId === "questionnaire.save-exit" &&
        record.fixture.submissionStatuses?.[0] === "draft",
    );
    if (!records[0]) throw new Error("expected save-exit interaction evidence");
    records[0].fixture.submissionStatuses = ["ready_for_export"];

    expect(
      auditAgentInteractionEvidence(records, ["questionnaire.save-exit"], {
        statusFixtureCoverage: "provided-records",
      }),
    ).toContainEqual(
      expect.objectContaining({
        interactionId: "questionnaire.save-exit",
        reason: "missing-status-fixture",
      }),
    );
  });

  test("blocks mutation evidence without network, reload, and unintended-write proof", () => {
    const records = schemaFixtures();
    const target = records.find(
      (record) => record.interactionId === "questionnaire.save-exit",
    );
    if (!target) throw new Error("expected mutation interaction evidence");
    target.mutation = {};

    expect(auditAgentInteractionEvidence(records)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          interactionId: "questionnaire.save-exit",
          reason: "missing-network-response",
        }),
        expect.objectContaining({
          interactionId: "questionnaire.save-exit",
          reason: "missing-canonical-readback",
        }),
        expect.objectContaining({
          interactionId: "questionnaire.save-exit",
          reason: "missing-unintended-write-check",
        }),
      ]),
    );
  });

  test("rejects owner-declared mutation targets outside the contract allowlist", () => {
    const records = schemaFixtures();
    const target = records.find(
      (record) => record.interactionId === "questionnaire.save-exit",
    );
    if (!target?.mutation?.unintendedWrites) {
      throw new Error("expected mutation target evidence");
    }
    target.mutation.unintendedWrites.checkedTargets = ["questionnaire_answers"];
    target.mutation.unintendedWrites.changedTargets = ["export_batches"];

    expect(auditAgentInteractionEvidence(records)).toContainEqual(
      expect.objectContaining({
        interactionId: "questionnaire.save-exit",
        reason: "missing-unintended-write-check",
        recordId: target.id,
      }),
    );
  });

  test("requires typed executable provenance on every status record", () => {
    const records = schemaFixtures();
    const target = records.find(
      (record) =>
        record.interactionId === "questionnaire.save-exit" &&
        record.fixture.submissionStatuses?.[0] === "returned",
    );
    if (!target) throw new Error("expected returned mutation evidence");
    target.execution = {
      artifactIds: [],
      capturedAt: "not-a-timestamp",
      runId: "",
    };

    expect(auditAgentInteractionEvidence(records)).toContainEqual(
      expect.objectContaining({
        interactionId: "questionnaire.save-exit",
        reason: "missing-execution",
        recordId: target.id,
      }),
    );
  });

  test("keeps the catalog free of orphan ids", () => {
    const sourceRoot = resolve(process.cwd(), "src");
    const interactionIdLiterals = new Set<string>();
    for (const file of sourceFiles(sourceRoot)
      .filter(
        (file) =>
          /\.(?:ts|tsx)$/.test(file) &&
          !file.endsWith("agentInteractionContract.ts"),
      )) {
      const source = readFileSync(file, "utf8");
      const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node)
        ) {
          interactionIdLiterals.add(node.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }

    expect(
      Object.keys(V19_AGENT_INTERACTION_CONTRACTS).filter(
        (interactionId) => !interactionIdLiterals.has(interactionId),
      ),
    ).toEqual([]);
  });

  test("does not hide instrumented click handlers on nonsemantic elements", () => {
    const sourceRoot = resolve(process.cwd(), "src");
    const semanticElements = new Set([
      "a",
      "button",
      "input",
      "label",
      "select",
      "summary",
      "textarea",
    ]);
    const findings: string[] = [];

    for (const file of sourceFiles(sourceRoot).filter((path) => path.endsWith(".tsx"))) {
      const source = readFileSync(file, "utf8");
      const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const visit = (node: ts.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tagName = node.tagName.getText(sourceFile);
          const attributes = node.attributes.properties;
          const hasClick = attributes.some(
            (attribute) =>
              ts.isJsxAttribute(attribute) &&
              attribute.name.getText(sourceFile) === "onClick",
          );
          const isInstrumented = attributes.some((attribute) => {
            if (ts.isJsxSpreadAttribute(attribute)) {
              return attribute.expression
                .getText(sourceFile)
                .includes("agentInteractionProps");
            }
            return (
              ts.isJsxAttribute(attribute) &&
              attribute.name.getText(sourceFile) === "data-v19-interaction-id"
            );
          });
          const hasRole = attributes.some(
            (attribute) =>
              ts.isJsxAttribute(attribute) &&
              attribute.name.getText(sourceFile) === "role",
          );
          const intrinsicElement = /^[a-z][a-z0-9-]*$/.test(tagName);

          if (
            intrinsicElement &&
            hasClick &&
            isInstrumented &&
            !semanticElements.has(tagName) &&
            !hasRole
          ) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(sourceFile),
            );
            findings.push(`${relative(process.cwd(), file)}:${line + 1}:${tagName}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }

    expect(findings).toEqual([]);
  });

  test("fails closed for uninstrumented intrinsic controls on live agent surfaces", () => {
    const findings = agentOnlyInteractionSourcePaths.flatMap((sourcePath) => {
      const file = resolve(process.cwd(), sourcePath);
      return findUninstrumentedAgentIntrinsicControls(
        sourcePath,
        readFileSync(file, "utf8"),
      );
    });

    expect(findings).toEqual([]);
  });

  test("AST gate ignores shared component callbacks but catches intrinsic click and role controls", () => {
    const findings = findUninstrumentedAgentIntrinsicControls(
      "synthetic-agent-surface.tsx",
      `
        <SharedButton onClick={handleSharedCallback} />
        <button onClick={handleClick}>Missing click proof</button>
        <div role="button">Missing role proof</div>
        <button {...agentInteractionProps("submissions.open")} onClick={handleOpen} />
      `,
    );

    expect(findings).toEqual([
      "synthetic-agent-surface.tsx:3:button",
      "synthetic-agent-surface.tsx:4:div",
    ]);
  });
});
