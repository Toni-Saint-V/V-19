import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import {
  edgeFunctionSourceFiles,
  edgeFunctionSourceSha256,
  edgeFunctionSourceSha256FromGitHead,
} from "../../scripts/lib/edge-function-source-identity.mjs";

describe("Edge Function source identity", () => {
  test("binds the entrypoint to every transitive local shared import", () => {
    const root = mkdtempSync(resolve(tmpdir(), "v19-edge-source-"));
    const functionRoot = resolve(root, "supabase/functions/example");
    const sharedRoot = resolve(root, "supabase/functions/_shared");
    mkdirSync(functionRoot, { recursive: true });
    mkdirSync(sharedRoot, { recursive: true });
    writeFileSync(
      resolve(functionRoot, "index.ts"),
      'import "npm:external";\nexport { handler } from "../_shared/handler.ts";\n',
    );
    writeFileSync(
      resolve(sharedRoot, "handler.ts"),
      'import { value } from "./value.ts";\nexport const handler = () => value;\n',
    );
    writeFileSync(resolve(sharedRoot, "value.ts"), 'export const value = "one";\n');

    expect(
      edgeFunctionSourceFiles(root, "example").map((item) => item.relativePath),
    ).toEqual(["_shared/handler.ts", "_shared/value.ts", "example/index.ts"]);
    const before = edgeFunctionSourceSha256(root, "example");
    writeFileSync(resolve(sharedRoot, "value.ts"), 'export const value = "two";\n');
    expect(edgeFunctionSourceSha256(root, "example")).not.toBe(before);
  });

  test("uses the same transitive identity for the committed repository graph", () => {
    for (const functionName of ["access-request", "ai-helper", "passport-extract"]) {
      expect(edgeFunctionSourceSha256FromGitHead(process.cwd(), functionName)).toMatch(
        /^[a-f0-9]{64}$/,
      );
    }
  });

  test("matches filesystem and Git digests for a clean graph and detects shared drift", () => {
    const root = mkdtempSync(resolve(tmpdir(), "v19-edge-source-git-"));
    const functionRoot = resolve(root, "supabase/functions/example");
    const sharedRoot = resolve(root, "supabase/functions/_shared");
    mkdirSync(functionRoot, { recursive: true });
    mkdirSync(sharedRoot, { recursive: true });
    writeFileSync(
      resolve(functionRoot, "index.ts"),
      'export { handler } from "../_shared/handler.ts";\n',
    );
    writeFileSync(resolve(sharedRoot, "handler.ts"), 'export const handler = "one";\n');
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "supabase/functions"], { cwd: root });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=V19 Test",
        "-c",
        "user.email=v19@example.invalid",
        "commit",
        "-qm",
        "fixture",
      ],
      { cwd: root },
    );

    const committedDigest = edgeFunctionSourceSha256FromGitHead(root, "example");
    expect(edgeFunctionSourceSha256(root, "example")).toBe(committedDigest);

    writeFileSync(resolve(sharedRoot, "handler.ts"), 'export const handler = "two";\n');
    expect(edgeFunctionSourceSha256(root, "example")).not.toBe(committedDigest);
    expect(edgeFunctionSourceSha256FromGitHead(root, "example")).toBe(
      committedDigest,
    );
  });
});
