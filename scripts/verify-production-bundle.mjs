import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const forbidden = [
  "VisaFlow local export document placeholder",
  "visaflow.auth.localDev.v1",
  "visaflow.localSubmissions.v1",
  "ops@visaflow.demo",
  "agent@visaflow.demo",
  "agent2@visaflow.local",
  "E2E_TEST_PERSON",
  "910000001",
  "910000002",
  "local-agent-tony",
  "local-agent-alex",
  "Ирина Агентова",
  "Татьяна Николаева",
  "Алексей Морозов",
  "Алексей Сидоров",
  "visaflow-local-demo-media-v1",
  "visaflow-local-demo-media-mutation-v1",
  "media-metadata",
];

const files = await collectFiles(distDir);
const findings = [];
const releaseIdentityPath = path.join(distDir, "release-identity.json");
const releaseIdentity = JSON.parse(await readFile(releaseIdentityPath, "utf8"));
if (
  releaseIdentity.schemaVersion !== 2 ||
  releaseIdentity.mode !== "supabase-production" ||
  !/^[0-9a-f]{40}$/.test(releaseIdentity.gitSha) ||
  !/^[0-9a-f]{64}$/.test(releaseIdentity.sourceSha256) ||
  !hasReleaseSourceSegments(releaseIdentity.sourceSegments) ||
  !hasReleaseSourceRootFiles(releaseIdentity.sourceRootFiles) ||
  typeof releaseIdentity.dirty !== "boolean"
) {
  findings.push("dist/release-identity.json: invalid production release identity");
}

function hasReleaseSourceSegments(segments) {
  const names = ["root", "config", "public", "scripts", "src"];
  return (
    Boolean(segments) &&
    typeof segments === "object" &&
    names.every((name) => /^[0-9a-f]{64}$/.test(segments[name])) &&
    Object.keys(segments).length === names.length
  );
}

function hasReleaseSourceRootFiles(files) {
  // This is the effective archive map. vercel.json remains part of the exact
  // committed Git SHA, but Vercel rewrites it before Vite builds the archive.
  const names = [
    ".nvmrc",
    ".vercelignore",
    "index.html",
    "package-lock.json",
    "package.json",
    "postcss.config.js",
    "tailwind.config.js",
    "tsconfig.app.json",
    "tsconfig.json",
    "tsconfig.node.json",
    "vite.config.ts",
  ];
  return (
    Boolean(files) &&
    typeof files === "object" &&
    names.every((name) => /^[0-9a-f]{64}$/.test(files[name])) &&
    Object.keys(files).length === names.length
  );
}

for (const file of files) {
  if (!/\.(?:html|js|css|json|map)$/i.test(file)) continue;
  const source = await readFile(file, "utf8");
  for (const marker of forbidden) {
    if (source.includes(marker)) {
      findings.push(`${path.relative(root, file)}: ${marker}`);
    }
  }
}

if (findings.length) {
  console.error("Production bundle contains forbidden local/demo payloads:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(
    `Production bundle guard passed: ${files.length} files, ${forbidden.length} forbidden markers absent.`,
  );
}

async function collectFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory)) {
    const absolute = path.join(directory, entry);
    const metadata = await stat(absolute);
    if (metadata.isDirectory()) result.push(...(await collectFiles(absolute)));
    else result.push(absolute);
  }
  return result;
}
