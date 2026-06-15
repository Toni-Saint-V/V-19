import { verifyCodexHook } from "./verify-codex-hook.mjs";

const findings = verifyCodexHook();

if (findings.length > 0) {
  console.error("Codex quality radar blocked this edit:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Codex quality radar passed.");
