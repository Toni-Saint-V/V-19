# Codex Plugin Catalog Screening

Date: 2026-06-12
Repo: `/Users/user/Documents/V-19`

## Method

Source command:

```bash
codex plugin list --available --json
```

This file lists every plugin record visible in the local Codex catalog snapshot:
installed, enabled, and not installed. The `Verdict` column is a conservative
screening verdict for the V-19 default surface. It is not a claim that every
plugin manifest was deep-reviewed line by line.

Deep-reviewed shortlist manifests are covered in
`docs/codex/CODEX_ACCELERATOR_STACKS.md`.

| Plugin                                                  | Marketplace              | Installed | Enabled | Version        | Family             | Verdict             |
| ------------------------------------------------------- | ------------------------ | --------: | ------: | -------------- | ------------------ | ------------------- |
| `a-team@awesome-codex-plugins`                          | `awesome-codex-plugins`  |        no |      no | `1.1.0`        | dev/workflow       | reviewed no default |
| `aegis@awesome-codex-plugins`                           | `awesome-codex-plugins`  |        no |      no | `2.0.7`        | security/quality   | reviewed no default |
| `agent-harness-skills@awesome-codex-plugins`            | `awesome-codex-plugins`  |        no |      no | `0.1.0`        | dev/workflow       | reviewed no default |
| `agent-vision@awesome-codex-plugins`                    | `awesome-codex-plugins`  |        no |      no | `1.0.3`        | dev/workflow       | reviewed no default |
| `agentgram@awesome-codex-plugins`                       | `awesome-codex-plugins`  |        no |      no | `0.2.2`        | dev/workflow       | reviewed no default |
| `agentops@awesome-codex-plugins`                        | `awesome-codex-plugins`  |       yes |      no | `local`        | dev/workflow       | keep off            |
| `agiflow-ai-plugin@awesome-codex-plugins`               | `awesome-codex-plugins`  |        no |      no | `0.1.0`        | other              | reviewed no default |
| `aient@awesome-codex-plugins`                           | `awesome-codex-plugins`  |        no |      no | `0.1.0`        | other              | reviewed no default |
| `alcove@awesome-codex-plugins`                          | `awesome-codex-plugins`  |        no |      no | `0.11.6`       | other              | reviewed no default |
| `amq-cli@awesome-codex-plugins`                         | `awesome-codex-plugins`  |        no |      no | `0.34.1`       | other              | reviewed no default |
| `anchor@awesome-codex-plugins`                          | `awesome-codex-plugins`  |        no |      no | `1.13.0`       | other              | reviewed no default |
| `antigravity@awesome-codex-plugins`                     | `awesome-codex-plugins`  |        no |      no | `0.2.1`        | other              | reviewed no default |
| `antigravity-2@awesome-codex-plugins`                   | `awesome-codex-plugins`  |        no |      no | `0.1.0`        | other              | reviewed no default |
| `apple-calendar@awesome-codex-plugins`                  | `awesome-codex-plugins`  |        no |      no | `0.3.0`        | other              | reviewed no default |
| `archcore@awesome-codex-plugins`                        | `awesome-codex-plugins`  |        no |      no | `0.4.7`        | other              | reviewed no default |
| `ateam@awesome-codex-plugins`                           | `awesome-codex-plugins`  |        no |      no | `3.10.0`       | dev/workflow       | reviewed no default |
| `axonflow@awesome-codex-plugins`                        | `awesome-codex-plugins`  |        no |      no | `1.5.2`        | other              | reviewed no default |
| `be-serious@awesome-codex-plugins`                      | `awesome-codex-plugins`  |        no |      no | `0.4.0`        | other              | reviewed no default |
| `bkt@awesome-codex-plugins`                             | `awesome-codex-plugins`  |        no |      no | `0.28.2`       | other              | reviewed no default |
| `bringyour-migration-auditor@awesome-codex-plugins`     | `awesome-codex-plugins`  |        no |      no | `1.1.0`        | other              | reviewed no default |
| `brooks-lint@awesome-codex-plugins`                     | `awesome-codex-plugins`  |        no |      no | `1.3.0`        | security/quality   | reviewed no default |
| `calle@awesome-codex-plugins`                           | `awesome-codex-plugins`  |        no |      no | `0.1.10`       | other              | reviewed no default |
| `canvas-apps-plugin-codex@awesome-codex-plugins`        | `awesome-codex-plugins`  |        no |      no | `1.0.0`        | other              | reviewed no default |
| `cc@awesome-codex-plugins`                              | `awesome-codex-plugins`  |        no |      no | `1.2.1`        | other              | reviewed no default |
| `chrome-devtools@awesome-codex-plugins`                 | `awesome-codex-plugins`  |       yes |      no | `0.1.0`        | dev/workflow       | preset only         |
| `claude-code-harness@awesome-codex-plugins`             | `awesome-codex-plugins`  |        no |      no | `0.1.0`        | other              | reviewed no default |
| `claude-code-skills@awesome-codex-plugins`              | `awesome-codex-plugins`  |        no |      no | `2.2.0`        | dev/workflow       | reviewed no default |
| `claude-octopus@awesome-codex-plugins`                  | `awesome-codex-plugins`  |        no |      no | `9.42.3`       | dev/workflow       | reviewed no default |
| `codebase-recon@awesome-codex-plugins`                  | `awesome-codex-plugins`  |        no |      no | `1.0.0`        | other              | reviewed no default |
| `codex-mem@awesome-codex-plugins`                       | `awesome-codex-plugins`  |        no |      no | `10.6.2`       | other              | reviewed no default |
| `codex-multi-auth@awesome-codex-plugins`                | `awesome-codex-plugins`  |        no |      no | `2.3.0-beta.1` | other              | reviewed no default |
| `codex-obsidian@awesome-codex-plugins`                  | `awesome-codex-plugins`  |        no |      no | `0.1.0`        | other              | reviewed no default |
| `codex-project-autopilot@awesome-codex-plugins`         | `awesome-codex-plugins`  |        no |      no | `1.0.0`        | other              | reviewed no default |
| `codex-reviewer@awesome-codex-plugins`                  | `awesome-codex-plugins`  |       yes |      no | `0.9.0`        | dev/workflow       | reviewed no default |
| `codex-rg-guard@awesome-codex-plugins`                  | `awesome-codex-plugins`  |        no |      no | `0.2.4`        | other              | reviewed no default |
| `codex-seo@awesome-codex-plugins`                       | `awesome-codex-plugins`  |        no |      no | `1.8.0`        | other              | reviewed no default |
| `codex-usage-tracker@awesome-codex-plugins`             | `awesome-codex-plugins`  |        no |      no | `0.2.0`        | other              | reviewed no default |
| `codiris-agentizer@awesome-codex-plugins`               | `awesome-codex-plugins`  |        no |      no | `2.1.1`        | dev/workflow       | reviewed no default |
| `context-pack@awesome-codex-plugins`                    | `awesome-codex-plugins`  |        no |      no | `0.3.2`        | other              | reviewed no default |
| `dataproduct-builder-dbt@awesome-codex-plugins`         | `awesome-codex-plugins`  |        no |      no | `0.2.1`        | dev/workflow       | reviewed no default |
| `dev-skills@awesome-codex-plugins`                      | `awesome-codex-plugins`  |        no |      no | `0.8.0`        | dev/workflow       | reviewed no default |
| `development-skills@awesome-codex-plugins`              | `awesome-codex-plugins`  |       yes |      no | `0.6.0`        | dev/workflow       | preset only         |
| `dodopayments@awesome-codex-plugins`                    | `awesome-codex-plugins`  |        no |      no | `0.3.3`        | other              | reviewed no default |
| `education-agent-skills@awesome-codex-plugins`          | `awesome-codex-plugins`  |        no |      no | `2.1.0`        | dev/workflow       | reviewed no default |
| `ejentum@awesome-codex-plugins`                         | `awesome-codex-plugins`  |        no |      no | `0.2.0`        | other              | reviewed no default |
| `epic@awesome-codex-plugins`                            | `awesome-codex-plugins`  |        no |      no | `0.5.1`        | other              | reviewed no default |
| `espresso@awesome-codex-plugins`                        | `awesome-codex-plugins`  |        no |      no | `UNKNOWN`      | other              | reviewed no default |
| `flowstudio-power-automate@awesome-codex-plugins`       | `awesome-codex-plugins`  |        no |      no | `1.0.1`        | other              | reviewed no default |
| `frappe-agent@awesome-codex-plugins`                    | `awesome-codex-plugins`  |        no |      no | `0.1.0`        | dev/workflow       | reviewed no default |
| `gh-project-plugin@awesome-codex-plugins`               | `awesome-codex-plugins`  |        no |      no | `1.0.0`        | other              | reviewed no default |
| `graymatter@awesome-codex-plugins`                      | `awesome-codex-plugins`  |        no |      no | `0.2.1`        | other              | reviewed no default |
| `hol-guard-plugin@awesome-codex-plugins`                | `awesome-codex-plugins`  |        no |      no | `0.1.0`        | other              | reviewed no default |
| `hotl@awesome-codex-plugins`                            | `awesome-codex-plugins`  |        no |      no | `2.18.0`       | other              | reviewed no default |
| `jk@awesome-codex-plugins`                              | `awesome-codex-plugins`  |        no |      no | `0.0.34`       | other              | reviewed no default |
| `kachilu-browser@awesome-codex-plugins`                 | `awesome-codex-plugins`  |        no |      no | `0.0.7`        | dev/workflow       | preset only         |
| `kicad-happy@awesome-codex-plugins`                     | `awesome-codex-plugins`  |        no |      no | `1.3.1`        | other              | reviewed no default |
| `langfuse@awesome-codex-plugins`                        | `awesome-codex-plugins`  |        no |      no | `0.9.1`        | other              | reviewed no default |
| `launchfast@awesome-codex-plugins`                      | `awesome-codex-plugins`  |        no |      no | `0.1.1`        | other              | reviewed no default |
| `llm-transpile@awesome-codex-plugins`                   | `awesome-codex-plugins`  |        no |      no | `0.3.2`        | other              | reviewed no default |
| `mobazha@awesome-codex-plugins`                         | `awesome-codex-plugins`  |        no |      no | `0.1.1`        | other              | reviewed no default |
| `morning-ai@awesome-codex-plugins`                      | `awesome-codex-plugins`  |        no |      no | `1.4.1`        | other              | reviewed no default |
| `n8n-mcp-synta-codex@awesome-codex-plugins`             | `awesome-codex-plugins`  |        no |      no | `1.0.0`        | other              | reviewed no default |
| `nullcost-catalog@awesome-codex-plugins`                | `awesome-codex-plugins`  |        no |      no | `0.1.4`        | other              | reviewed no default |
| `oc-codex-multi-auth@awesome-codex-plugins`             | `awesome-codex-plugins`  |        no |      no | `6.3.1`        | other              | reviewed no default |
| `openproject@awesome-codex-plugins`                     | `awesome-codex-plugins`  |        no |      no | `0.1.0`        | other              | reviewed no default |
| `orgx-codex-plugin@awesome-codex-plugins`               | `awesome-codex-plugins`  |        no |      no | `0.1.5`        | other              | reviewed no default |
| `panews@awesome-codex-plugins`                          | `awesome-codex-plugins`  |        no |      no | `0.1.0`        | other              | reviewed no default |
| `papersflow-codex-plugin@awesome-codex-plugins`         | `awesome-codex-plugins`  |        no |      no | `1.0.0`        | other              | reviewed no default |
| `pdf-monster@awesome-codex-plugins`                     | `awesome-codex-plugins`  |        no |      no | `0.1.0`        | other              | reviewed no default |
| `personal-data-protection@awesome-codex-plugins`        | `awesome-codex-plugins`  |        no |      no | `0.4.0`        | other              | reviewed no default |
| `praxis@awesome-codex-plugins`                          | `awesome-codex-plugins`  |       yes |      no | `2.3.2`        | dev/workflow       | keep off            |
| `prompt-to-asset@awesome-codex-plugins`                 | `awesome-codex-plugins`  |        no |      no | `0.1.0`        | other              | reviewed no default |
| `registry-broker-codex-plugin@awesome-codex-plugins`    | `awesome-codex-plugins`  |        no |      no | `0.1.0`        | other              | reviewed no default |
| `remotion@awesome-codex-plugins`                        | `awesome-codex-plugins`  |        no |      no | `0.1.0`        | creative/media     | keep off            |
| `ru-text@awesome-codex-plugins`                         | `awesome-codex-plugins`  |       yes |      no | `1.7.3`        | other              | reviewed no default |
| `runtype-skills@awesome-codex-plugins`                  | `awesome-codex-plugins`  |        no |      no | `0.2.0`        | dev/workflow       | reviewed no default |
| `rust-reverse-engineering@awesome-codex-plugins`        | `awesome-codex-plugins`  |        no |      no | `0.1.0`        | other              | reviewed no default |
| `sealos@awesome-codex-plugins`                          | `awesome-codex-plugins`  |        no |      no | `1.0.0`        | other              | reviewed no default |
| `session-orchestrator@awesome-codex-plugins`            | `awesome-codex-plugins`  |        no |      no | `3.8.0`        | other              | reviewed no default |
| `simple-man@awesome-codex-plugins`                      | `awesome-codex-plugins`  |        no |      no | `0.1.0`        | other              | reviewed no default |
| `sitemd@awesome-codex-plugins`                          | `awesome-codex-plugins`  |        no |      no | `0.1.3`        | other              | reviewed no default |
| `spec-driven@awesome-codex-plugins`                     | `awesome-codex-plugins`  |       yes |      no | `5.3.3`        | dev/workflow       | keep off            |
| `staff-engineer-mode@awesome-codex-plugins`             | `awesome-codex-plugins`  |        no |      no | `2.1.0`        | other              | reviewed no default |
| `stark@awesome-codex-plugins`                           | `awesome-codex-plugins`  |       yes |      no | `0.7.2`        | dev/workflow       | reviewed no default |
| `tailtest@awesome-codex-plugins`                        | `awesome-codex-plugins`  |        no |      no | `4.9.1`        | other              | reviewed no default |
| `tandem-codex-plugin@awesome-codex-plugins`             | `awesome-codex-plugins`  |        no |      no | `0.1.5`        | other              | reviewed no default |
| `tartinerlabs@awesome-codex-plugins`                    | `awesome-codex-plugins`  |        no |      no | `1.21.0`       | other              | reviewed no default |
| `task-scheduler@awesome-codex-plugins`                  | `awesome-codex-plugins`  |        no |      no | `0.2.0`        | other              | reviewed no default |
| `team-skills-platform@awesome-codex-plugins`            | `awesome-codex-plugins`  |        no |      no | `2.3.0`        | dev/workflow       | reviewed no default |
| `thermal-fluid-research-workflow@awesome-codex-plugins` | `awesome-codex-plugins`  |        no |      no | `0.1.0`        | dev/workflow       | reviewed no default |
| `tokrepo-search@awesome-codex-plugins`                  | `awesome-codex-plugins`  |        no |      no | `1.0.0`        | other              | reviewed no default |
| `tool-advisor@awesome-codex-plugins`                    | `awesome-codex-plugins`  |       yes |      no | `3.5.1`        | dev/workflow       | keep off            |
| `unity-agent-workflows@awesome-codex-plugins`           | `awesome-codex-plugins`  |        no |      no | `0.5.0`        | dev/workflow       | reviewed no default |
| `universal-design-principles@awesome-codex-plugins`     | `awesome-codex-plugins`  |       yes |      no | `1.0.0`        | dev/workflow       | keep off            |
| `unslop@awesome-codex-plugins`                          | `awesome-codex-plugins`  |        no |      no | `0.6.2`        | other              | reviewed no default |
| `upwork-autopilot@awesome-codex-plugins`                | `awesome-codex-plugins`  |        no |      no | `0.4.0`        | other              | reviewed no default |
| `velith@awesome-codex-plugins`                          | `awesome-codex-plugins`  |        no |      no | `0.1.4`        | other              | reviewed no default |
| `vibe-portrait@awesome-codex-plugins`                   | `awesome-codex-plugins`  |        no |      no | `1.1.0`        | other              | reviewed no default |
| `vidseeds@awesome-codex-plugins`                        | `awesome-codex-plugins`  |        no |      no | `1.8.1`        | other              | reviewed no default |
| `villagesql@awesome-codex-plugins`                      | `awesome-codex-plugins`  |        no |      no | `1.0.0`        | other              | reviewed no default |
| `workflow-kit@awesome-codex-plugins`                    | `awesome-codex-plugins`  |        no |      no | `0.2.0`        | dev/workflow       | reviewed no default |
| `writers-loop@awesome-codex-plugins`                    | `awesome-codex-plugins`  |        no |      no | `0.1.0`        | other              | reviewed no default |
| `x-twitter-scraper@awesome-codex-plugins`               | `awesome-codex-plugins`  |        no |      no | `2.4.16`       | other              | reviewed no default |
| `yandex-direct-for-all@awesome-codex-plugins`           | `awesome-codex-plugins`  |        no |      no | `0.2.0`        | other              | reviewed no default |
| `zagrosi-forge@awesome-codex-plugins`                   | `awesome-codex-plugins`  |        no |      no | `0.2.0`        | other              | reviewed no default |
| `browser@openai-bundled`                                | `openai-bundled`         |       yes |     yes | `26.609.30741` | dev/workflow       | KEEP enabled        |
| `latex@openai-bundled`                                  | `openai-bundled`         |        no |      no | `0.2.2`        | other              | reviewed no default |
| `actively@openai-curated`                               | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `aiera@openai-curated`                                  | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `airtable@openai-curated`                               | `openai-curated`         |        no |      no | `0.1.2`        | data/docs          | reviewed no default |
| `alation@openai-curated`                                | `openai-curated`         |        no |      no | `1.0.2`        | analytics          | reviewed no default |
| `alpaca@openai-curated`                                 | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `amplitude@openai-curated`                              | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `apollo@openai-curated`                                 | `openai-curated`         |        no |      no | `1.0.2`        | business connector | reviewed no default |
| `asana@openai-curated`                                  | `openai-curated`         |        no |      no | `0.1.2`        | data/docs          | reviewed no default |
| `atlassian-rovo@openai-curated`                         | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `attio@openai-curated`                                  | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `base44@openai-curated`                                 | `openai-curated`         |        no |      no | `1.0.2-beta.1` | other              | reviewed no default |
| `binance@openai-curated`                                | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `biorender@openai-curated`                              | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `box@openai-curated`                                    | `openai-curated`         |        no |      no | `0.0.3`        | other              | reviewed no default |
| `brand24@openai-curated`                                | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `brex@openai-curated`                                   | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `brighthire@openai-curated`                             | `openai-curated`         |        no |      no | `0.1.0`        | other              | reviewed no default |
| `build-ios-apps@openai-curated`                         | `openai-curated`         |        no |      no | `0.1.2`        | dev/workflow       | reviewed no default |
| `build-macos-apps@openai-curated`                       | `openai-curated`         |        no |      no | `0.1.4`        | dev/workflow       | reviewed no default |
| `build-web-apps@openai-curated`                         | `openai-curated`         |       yes |      no | `c6ea566d`     | dev/workflow       | preset only         |
| `build-web-data-visualization@openai-curated`           | `openai-curated`         |        no |      no | `0.1.21`       | dev/workflow       | reviewed no default |
| `calendly@openai-curated`                               | `openai-curated`         |        no |      no | `1.0.2`        | business connector | reviewed no default |
| `canva@openai-curated`                                  | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `carta-crm@openai-curated`                              | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `catalyst-by-zoho@openai-curated`                       | `openai-curated`         |        no |      no | `1.0.1`        | other              | reviewed no default |
| `cb-insights@openai-curated`                            | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `channel99@openai-curated`                              | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `chronograph@openai-curated`                            | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `circleback@openai-curated`                             | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `circleci@openai-curated`                               | `openai-curated`         |        no |      no | `1.0.3`        | other              | reviewed no default |
| `clay@openai-curated`                                   | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `clickup@openai-curated`                                | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `close@openai-curated`                                  | `openai-curated`         |        no |      no | `1.0.2`        | business connector | reviewed no default |
| `cloudflare@openai-curated`                             | `openai-curated`         |        no |      no | `0.1.2`        | other              | reviewed no default |
| `cloudinary@openai-curated`                             | `openai-curated`         |        no |      no | `1.0.2`        | creative/media     | reviewed no default |
| `coderabbit@openai-curated`                             | `openai-curated`         |        no |      no | `1.1.3`        | dev/workflow       | conditional add     |
| `codex-security@openai-curated`                         | `openai-curated`         |       yes |      no | `c6ea566d`     | security/quality   | preset only         |
| `cogedim@openai-curated`                                | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `common-room@openai-curated`                            | `openai-curated`         |        no |      no | `1.0.3`        | other              | reviewed no default |
| `conductor@openai-curated`                              | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `convex@openai-curated`                                 | `openai-curated`         |        no |      no | `0.1.2`        | data/docs          | reviewed no default |
| `coupler-io@openai-curated`                             | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `coveo@openai-curated`                                  | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `cube@openai-curated`                                   | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `daloopa@openai-curated`                                | `openai-curated`         |        no |      no | `1.0.3`        | other              | reviewed no default |
| `datadog@openai-curated`                                | `openai-curated`         |        no |      no | `0.1.2`        | security/quality   | reviewed no default |
| `datasite@openai-curated`                               | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `deepnote@openai-curated`                               | `openai-curated`         |        no |      no | `0.1.4`        | other              | reviewed no default |
| `demandbase@openai-curated`                             | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `dnb-finance-analytics@openai-curated`                  | `openai-curated`         |        no |      no | `1.0.2`        | analytics          | reviewed no default |
| `docket@openai-curated`                                 | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `docusign@openai-curated`                               | `openai-curated`         |        no |      no | `1.0.2`        | business connector | reviewed no default |
| `domotz-preview@openai-curated`                         | `openai-curated`         |        no |      no | `1.0.2`        | dev/workflow       | reviewed no default |
| `dovetail@openai-curated`                               | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `dow-jones-factiva@openai-curated`                      | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `egnyte@openai-curated`                                 | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `expo@openai-curated`                                   | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `factset@openai-curated`                                | `openai-curated`         |        no |      no | `1.0.2`        | analytics          | reviewed no default |
| `fal@openai-curated`                                    | `openai-curated`         |        no |      no | `1.0.2`        | creative/media     | reviewed no default |
| `figma@openai-curated`                                  | `openai-curated`         |        no |      no | `2.0.9`        | dev/workflow       | conditional add     |
| `finn@openai-curated`                                   | `openai-curated`         |        no |      no | `1.0.3`        | other              | reviewed no default |
| `fireflies@openai-curated`                              | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `fiscal-ai@openai-curated`                              | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `fyxer@openai-curated`                                  | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `game-studio@openai-curated`                            | `openai-curated`         |        no |      no | `0.1.2`        | other              | reviewed no default |
| `github@openai-curated`                                 | `openai-curated`         |       yes |      no | `c6ea566d`     | dev/workflow       | preset only         |
| `gmail@openai-curated`                                  | `openai-curated`         |        no |      no | `0.1.2`        | business connector | reviewed no default |
| `google-calendar@openai-curated`                        | `openai-curated`         |        no |      no | `1.2.2`        | other              | reviewed no default |
| `google-drive@openai-curated`                           | `openai-curated`         |        no |      no | `0.1.6`        | other              | reviewed no default |
| `govtribe@openai-curated`                               | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `granola@openai-curated`                                | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `happenstance@openai-curated`                           | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `hebbia@openai-curated`                                 | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `help-scout@openai-curated`                             | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `heygen@openai-curated`                                 | `openai-curated`         |        no |      no | `2.2.3`        | creative/media     | reviewed no default |
| `hg-insights@openai-curated`                            | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `highlevel@openai-curated`                              | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `hostinger@openai-curated`                              | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `hubspot@openai-curated`                                | `openai-curated`         |        no |      no | `2.0.2`        | other              | reviewed no default |
| `hugging-face@openai-curated`                           | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `hyperframes@openai-curated`                            | `openai-curated`         |        no |      no | `0.1.2`        | other              | reviewed no default |
| `intercom@openai-curated`                               | `openai-curated`         |        no |      no | `1.0.2`        | business connector | reviewed no default |
| `jam@openai-curated`                                    | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `keybid-puls@openai-curated`                            | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `life-science-research@openai-curated`                  | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `linear@openai-curated`                                 | `openai-curated`         |        no |      no | `0.0.2`        | data/docs          | reviewed no default |
| `lovable@openai-curated`                                | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `lseg@openai-curated`                                   | `openai-curated`         |        no |      no | `1.0.2`        | analytics          | reviewed no default |
| `magicpath@openai-curated`                              | `openai-curated`         |        no |      no | `0.1.1`        | other              | reviewed no default |
| `marcopolo@openai-curated`                              | `openai-curated`         |        no |      no | `1.0.3`        | other              | reviewed no default |
| `mem@openai-curated`                                    | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `meticulate@openai-curated`                             | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `midpage@openai-curated`                                | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `mixpanel@openai-curated`                               | `openai-curated`         |        no |      no | `2.0.2`        | analytics          | reviewed no default |
| `mixpanel-headless@openai-curated`                      | `openai-curated`         |        no |      no | `0.1.2`        | analytics          | reviewed no default |
| `monday-com@openai-curated`                             | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `moody-s@openai-curated`                                | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `morningstar@openai-curated`                            | `openai-curated`         |        no |      no | `1.0.3`        | other              | reviewed no default |
| `motherduck@openai-curated`                             | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `mt-newswires@openai-curated`                           | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `myregistry-com@openai-curated`                         | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `neon-postgres@openai-curated`                          | `openai-curated`         |        no |      no | `1.0.2`        | data/docs          | reviewed no default |
| `netlify@openai-curated`                                | `openai-curated`         |        no |      no | `1.1.2`        | other              | reviewed no default |
| `network-solutions@openai-curated`                      | `openai-curated`         |        no |      no | `1.0.3`        | other              | reviewed no default |
| `ngs-analysis@openai-curated`                           | `openai-curated`         |        no |      no | `1.0.3`        | other              | reviewed no default |
| `notion@openai-curated`                                 | `openai-curated`         |        no |      no | `0.1.3`        | data/docs          | reviewed no default |
| `nvidia@openai-curated`                                 | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `omni-analytics@openai-curated`                         | `openai-curated`         |        no |      no | `1.0.3`        | analytics          | reviewed no default |
| `openai-developers@openai-curated`                      | `openai-curated`         |       yes |      no | `c6ea566d`     | dev/workflow       | preset only         |
| `otter-ai@openai-curated`                               | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `outlook-calendar@openai-curated`                       | `openai-curated`         |        no |      no | `0.1.2`        | other              | reviewed no default |
| `outlook-email@openai-curated`                          | `openai-curated`         |        no |      no | `0.1.2`        | other              | reviewed no default |
| `outreach@openai-curated`                               | `openai-curated`         |        no |      no | `1.0.2`        | business connector | reviewed no default |
| `particl-market-research@openai-curated`                | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `picsart@openai-curated`                                | `openai-curated`         |       yes |      no | `c6ea566d`     | creative/media     | keep off            |
| `pipedrive@openai-curated`                              | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `pitchbook@openai-curated`                              | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `plugin-eval@openai-curated`                            | `openai-curated`         |       yes |      no | `c6ea566d`     | dev/workflow       | preset only         |
| `policynote@openai-curated`                             | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `posthog@openai-curated`                                | `openai-curated`         |        no |      no | `0.1.2`        | analytics          | conditional add     |
| `pylon@openai-curated`                                  | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `quartr@openai-curated`                                 | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `quickbooks@openai-curated`                             | `openai-curated`         |        no |      no | `1.0.2`        | dev/workflow       | reviewed no default |
| `quicknode@openai-curated`                              | `openai-curated`         |        no |      no | `1.0.2`        | dev/workflow       | reviewed no default |
| `ranked-ai@openai-curated`                              | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `razorpay@openai-curated`                               | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `read-ai@openai-curated`                                | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `readwise@openai-curated`                               | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `remotion@openai-curated`                               | `openai-curated`         |       yes |      no | `c6ea566d`     | creative/media     | keep off            |
| `render@openai-curated`                                 | `openai-curated`         |        no |      no | `0.1.2`        | other              | reviewed no default |
| `replit@openai-curated`                                 | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `responsive@openai-curated`                             | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `rox@openai-curated`                                    | `openai-curated`         |        no |      no | `1.0.3`        | other              | reviewed no default |
| `s-p@openai-curated`                                    | `openai-curated`         |        no |      no | `1.0.3`        | other              | reviewed no default |
| `scite@openai-curated`                                  | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `semrush@openai-curated`                                | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `sendgrid@openai-curated`                               | `openai-curated`         |        no |      no | `0.1.2`        | other              | reviewed no default |
| `sentry@openai-curated`                                 | `openai-curated`         |        no |      no | `0.1.2`        | security/quality   | conditional add     |
| `setu-bharat-connect-billpay@openai-curated`            | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `sharepoint@openai-curated`                             | `openai-curated`         |        no |      no | `0.1.2`        | other              | reviewed no default |
| `shopify@openai-curated`                                | `openai-curated`         |        no |      no | `1.3.2`        | business connector | reviewed no default |
| `shutterstock@openai-curated`                           | `openai-curated`         |       yes |      no | `c6ea566d`     | creative/media     | keep off            |
| `signnow@openai-curated`                                | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `similarweb@openai-curated`                             | `openai-curated`         |        no |      no | `1.0.2`        | analytics          | reviewed no default |
| `skywatch@openai-curated`                               | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `slack@openai-curated`                                  | `openai-curated`         |        no |      no | `0.1.2`        | other              | reviewed no default |
| `statsig@openai-curated`                                | `openai-curated`         |        no |      no | `2.0.2`        | other              | reviewed no default |
| `streak@openai-curated`                                 | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `stripe@openai-curated`                                 | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `supabase@openai-curated`                               | `openai-curated`         |       yes |      no | `c6ea566d`     | data/docs          | preset only         |
| `superhuman@openai-curated`                             | `openai-curated`         |        no |      no | `0.1.2`        | business connector | reviewed no default |
| `superpowers@openai-curated`                            | `openai-curated`         |       yes |      no | `c6ea566d`     | dev/workflow       | keep off            |
| `taxdown@openai-curated`                                | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `teams@openai-curated`                                  | `openai-curated`         |        no |      no | `0.1.2`        | dev/workflow       | reviewed no default |
| `teamwork-com@openai-curated`                           | `openai-curated`         |        no |      no | `1.0.2`        | dev/workflow       | reviewed no default |
| `temporal@openai-curated`                               | `openai-curated`         |        no |      no | `0.2.2`        | dev/workflow       | reviewed no default |
| `test-android-apps@openai-curated`                      | `openai-curated`         |        no |      no | `0.1.2`        | other              | reviewed no default |
| `third-bridge@openai-curated`                           | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `thoughtspot@openai-curated`                            | `openai-curated`         |        no |      no | `1.0.2`        | analytics          | reviewed no default |
| `tinman-ai@openai-curated`                              | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `twilio-developer-kit@openai-curated`                   | `openai-curated`         |        no |      no | `0.2.2`        | dev/workflow       | reviewed no default |
| `united-rentals@openai-curated`                         | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `vantage@openai-curated`                                | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `vercel@openai-curated`                                 | `openai-curated`         |       yes |      no | `c6ea566d`     | dev/workflow       | preset only         |
| `waldo@openai-curated`                                  | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `weatherpromise@openai-curated`                         | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `windsor-ai@openai-curated`                             | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `wix@openai-curated`                                    | `openai-curated`         |        no |      no | `1.1.2`        | other              | reviewed no default |
| `yepcode@openai-curated`                                | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `zoho@openai-curated`                                   | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `zoom@openai-curated`                                   | `openai-curated`         |        no |      no | `1.0.2`        | other              | reviewed no default |
| `zoominfo@openai-curated`                               | `openai-curated`         |        no |      no | `1.0.2`        | business connector | reviewed no default |
| `zotero@openai-curated`                                 | `openai-curated`         |        no |      no | `0.1.2`        | other              | reviewed no default |
| `documents@openai-primary-runtime`                      | `openai-primary-runtime` |        no |      no | `26.601.10930` | data/docs          | reviewed no default |
| `presentations@openai-primary-runtime`                  | `openai-primary-runtime` |       yes |      no | `26.601.10930` | creative/media     | keep off            |
| `spreadsheets@openai-primary-runtime`                   | `openai-primary-runtime` |        no |      no | `26.601.10930` | data/docs          | reviewed no default |
