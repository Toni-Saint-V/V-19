import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const configPath = join(process.cwd(), "vercel.json");
const failures = [];

if (!existsSync(configPath)) {
  console.error(
    "vercel.json not found; deployment headers and cache policy are unverified",
  );
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
const rules = Array.isArray(config.headers) ? config.headers : [];

verifyRule("/(.*)", {
  "content-security-policy":
    "base-uri 'self'; frame-ancestors 'none'; object-src 'none'",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
});
verifyRule("/", {
  "cache-control": "public, max-age=0, must-revalidate",
});
verifyRule("/index.html", {
  "cache-control": "public, max-age=0, must-revalidate",
});
verifyRule("/assets/(.*)", {
  "cache-control": "public, max-age=31536000, immutable",
});
verifyRule("/v19-app-icon.svg", {
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
});
verifyRule("/manifest.webmanifest", {
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
});
verifyRule("/v19-(.*)-v1.png", {
  "cache-control": "public, max-age=31536000, immutable",
});

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  "Deployment header guard passed: security baseline, no-index policy, revalidated HTML, immutable hashed assets, refreshable app identity.",
);

function verifyRule(source, expectedHeaders) {
  const matches = rules.filter((rule) => rule?.source === source);

  if (matches.length !== 1) {
    failures.push(
      `${source}: expected exactly one header rule, found ${matches.length}`,
    );
    return;
  }

  const actualHeaders = new Map(
    (matches[0].headers ?? []).map((header) => [
      String(header.key ?? "").toLowerCase(),
      String(header.value ?? ""),
    ]),
  );

  for (const [key, expectedValue] of Object.entries(expectedHeaders)) {
    const actualValue = actualHeaders.get(key);
    if (actualValue !== expectedValue) {
      failures.push(
        `${source}: ${key} must be ${JSON.stringify(expectedValue)}, found ${JSON.stringify(actualValue)}`,
      );
    }
  }
}
